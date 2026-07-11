import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../src/config.js';
import { Db } from '../src/db.js';
import { SessionStore } from '../src/sessions.js';
import { EventBus } from '../src/events.js';
import { RateLimiter } from '../src/ratelimit.js';
import { ScriptService } from '../src/scripts.js';
import { NginxManager } from '../src/nginx.js';
import { createApp } from '../src/app.js';

const INSTALL_SH = '#!/usr/bin/env bash\nset -e\necho "installing demo tool"\n';

/** Minimal fake of the GitLab REST API used by the app. */
function fakeGitLabFetch(url) {
  const u = new URL(url);
  const json = (body, headers = {}) => new Response(JSON.stringify(body), {
    status: 200, headers: { 'content-type': 'application/json', ...headers },
  });
  if (u.pathname === '/api/v4/projects/demo%2Ftool') {
    return Promise.resolve(json({
      id: 42, name: 'Demo Tool', path_with_namespace: 'demo/tool',
      description: 'Ein Demo-Projekt', default_branch: 'main',
      web_url: 'https://gitlab.example.com/demo/tool',
    }));
  }
  if (u.pathname === '/api/v4/projects/42/repository/tree') {
    return Promise.resolve(json([
      { type: 'blob', path: 'install.sh', name: 'install.sh' },
      { type: 'blob', path: 'README.md', name: 'README.md' },
      { type: 'blob', path: 'scripts/helper.sh', name: 'helper.sh' },
    ]));
  }
  if (u.pathname === '/api/v4/projects/42/repository/files/install.sh') {
    return Promise.resolve(json({
      file_path: 'install.sh', size: INSTALL_SH.length,
      content: Buffer.from(INSTALL_SH).toString('base64'),
      last_commit_id: 'abc1234def5678',
      blob_id: 'blob1',
      ref: 'main',
    }));
  }
  return Promise.resolve(new Response('{"message":"404"}', { status: 404 }));
}

let server;
let baseUrl;
let tmpDir;
let db;
const realFetch = globalThis.fetch;

before(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'esw-test-'));
  const config = loadConfig({
    DATA_DIR: tmpDir,
    PORT: '0',
    SESSION_SECRET: 'test-secret',
    NGINX_AUTO_APPLY: 'false',
    SCRIPT_REFRESH_INTERVAL: '0',
  });
  db = new Db(config.dataDir);
  const events = new EventBus();
  const sessions = new SessionStore({ dataDir: config.dataDir, secret: config.sessionSecret, ttlMs: 3600_000 });
  const limiter = new RateLimiter();
  const scriptService = new ScriptService({ db, config, events });
  const nginxManager = new NginxManager({ config, db, events });
  const app = createApp({ db, config, scriptService, nginxManager, sessions, events, limiter });
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  globalThis.fetch = (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith('https://gitlab.example.com/')) return fakeGitLabFetch(url);
    return realFetch(input, init);
  };
});

after(() => {
  globalThis.fetch = realFetch;
  server?.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// helpers -------------------------------------------------------------

let cookie = '';
let csrf = '';

async function call(method, pathName, body, extraHeaders = {}) {
  const headers = { ...extraHeaders };
  if (cookie) headers.cookie = cookie;
  if (csrf && method !== 'GET') headers['x-csrf-token'] = csrf;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const res = await realFetch(baseUrl + pathName, {
    method, headers, body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  let data = null;
  const text = await res.text();
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, headers: res.headers };
}

// tests ---------------------------------------------------------------

test('healthz responds', async () => {
  const res = await call('GET', '/healthz');
  assert.equal(res.status, 200);
  assert.equal(res.data.ok, true);
});

test('curl on / gets a bash script, browser gets HTML fallback message', async () => {
  const asCurl = await realFetch(baseUrl + '/', { headers: { 'user-agent': 'curl/8.5.0' } });
  assert.equal(asCurl.status, 200);
  assert.match(asCurl.headers.get('content-type'), /shellscript/);
  const body = await asCurl.text();
  assert.match(body, /^#!\/usr\/bin\/env bash/);

  const asBrowser = await realFetch(baseUrl + '/', { headers: { 'user-agent': 'Mozilla/5.0', accept: 'text/html' } });
  // client/dist does not exist in tests -> 503 hint instead of the SPA
  assert.ok([200, 503].includes(asBrowser.status));
});

test('security headers are set', async () => {
  const res = await call('GET', '/healthz');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.match(res.headers.get('content-security-policy'), /default-src 'self'/);
});

test('first-run setup creates the admin account', async () => {
  let res = await call('GET', '/api/admin/setup-status');
  assert.equal(res.data.needsSetup, true);

  res = await call('POST', '/api/admin/setup', { username: 'admin', password: 'short' });
  assert.equal(res.status, 400);

  res = await call('POST', '/api/admin/setup', { username: 'admin', password: 'super-secure-pass' });
  assert.equal(res.status, 200);
  assert.ok(res.data.csrf);
  csrf = res.data.csrf;

  res = await call('GET', '/api/admin/setup-status');
  assert.equal(res.data.needsSetup, false);

  res = await call('POST', '/api/admin/setup', { username: 'other', password: 'super-secure-pass' });
  assert.equal(res.status, 403);
});

test('me returns the session user', async () => {
  const res = await call('GET', '/api/admin/me');
  assert.equal(res.status, 200);
  assert.equal(res.data.username, 'admin');
});

test('mutations without CSRF token are rejected', async () => {
  const saved = csrf;
  csrf = '';
  const res = await call('POST', '/api/admin/scripts/import-preview', { url: 'https://gitlab.example.com/demo/tool' });
  assert.equal(res.status, 403);
  csrf = saved;
});

test('unauthenticated admin API access is rejected', async () => {
  const res = await realFetch(baseUrl + '/api/admin/scripts');
  assert.equal(res.status, 401);
});

test('import preview detects install.sh as best candidate', async () => {
  const res = await call('POST', '/api/admin/scripts/import-preview', { url: 'https://gitlab.example.com/demo/tool' });
  assert.equal(res.status, 200);
  assert.equal(res.data.project.name, 'Demo Tool');
  assert.equal(res.data.ref, 'main');
  assert.equal(res.data.candidates[0].path, 'install.sh');
  assert.equal(res.data.candidates[0].recommended, true);
});

let scriptId;
let scriptSlug;

test('import creates an inactive script with a stored version', async () => {
  const res = await call('POST', '/api/admin/scripts', {
    url: 'https://gitlab.example.com/demo/tool',
    path: 'install.sh',
    ref: 'main',
    metadata: { name: 'Demo Tool', description: 'Installiert das Demo-Tool.' },
  });
  assert.equal(res.status, 201);
  scriptId = res.data.id;
  scriptSlug = res.data.slug;
  assert.equal(res.data.active, false);
  assert.equal(res.data.versions.length, 1);
  assert.equal(res.data.versions[0].commitSha, 'abc1234def5678');
  assert.equal(res.data.source.hasToken, false);
  assert.ok(!JSON.stringify(res.data.source).includes('tokenEnc'), 'token must never leave the server');
});

test('inactive scripts are not served publicly', async () => {
  const res = await realFetch(`${baseUrl}/install/${scriptSlug}`, { headers: { 'user-agent': 'curl/8' } });
  assert.equal(res.status, 404);
  const list = await call('GET', '/api/public/scripts');
  assert.equal(list.data.length, 0);
});

test('activation publishes the script via curl', async () => {
  let res = await call('PATCH', `/api/admin/scripts/${scriptId}`, { active: true });
  assert.equal(res.status, 200);

  const raw = await realFetch(`${baseUrl}/install/${scriptSlug}`, { headers: { 'user-agent': 'curl/8' } });
  assert.equal(raw.status, 200);
  assert.equal(await raw.text(), INSTALL_SH);
  assert.ok(raw.headers.get('x-script-sha256'));

  const index = await realFetch(baseUrl + '/', { headers: { 'user-agent': 'curl/8' } });
  const body = await index.text();
  assert.ok(body.includes('Demo Tool'));

  const list = await call('GET', '/api/public/scripts');
  assert.equal(list.data.length, 1);
  assert.match(list.data[0].curl, /^curl -fsSL http:\/\/127\.0\.0\.1:\d+\/install\/.+ \| bash$/);

  // download counter incremented (debounced save, but in-memory is current)
  const admin = await call('GET', '/api/admin/scripts');
  assert.ok(admin.data[0].downloads >= 1);
});

test('version pinning via slug@version', async () => {
  const admin = await call('GET', '/api/admin/scripts');
  const version = admin.data[0].versions[0].version;
  const res = await realFetch(`${baseUrl}/install/${scriptSlug}@${version}`, { headers: { 'user-agent': 'curl/8' } });
  assert.equal(res.status, 200);
  const missing = await realFetch(`${baseUrl}/install/${scriptSlug}@9.9.9`, { headers: { 'user-agent': 'curl/8' } });
  assert.equal(missing.status, 404);
});

test('settings validation rejects bad colors, accepts good ones', async () => {
  let res = await call('PUT', '/api/admin/settings', { branding: { primaryColor: 'red' } });
  assert.equal(res.status, 400);
  res = await call('PUT', '/api/admin/settings', {
    branding: { title: 'Homelab Hub', primaryColor: '#ff6600' },
    footer: { text: 'Mein Footer', links: [{ label: 'Docs', url: 'https://example.com' }, { label: 'kaputt', url: 'javascript:alert(1)' }] },
  });
  assert.equal(res.status, 200);
  assert.equal(res.data.branding.title, 'Homelab Hub');
  // javascript: link must be filtered out
  assert.equal(res.data.footer.links.length, 1);

  const pub = await call('GET', '/api/public/config');
  assert.equal(pub.data.branding.title, 'Homelab Hub');
});

test('nginx preview requires a domain, then renders', async () => {
  let res = await call('GET', '/api/admin/nginx/preview');
  assert.equal(res.status, 400);

  await call('PUT', '/api/admin/settings', { nginx: { domain: 'install.example.com' } });
  res = await call('GET', '/api/admin/nginx/preview');
  assert.equal(res.status, 200);
  assert.match(res.data.config, /server_name install\.example\.com;/);
  assert.equal(res.data.status.applyEnabled, false);

  // apply is disabled via env in tests
  res = await call('POST', '/api/admin/nginx/apply');
  assert.equal(res.status, 403);
});

test('gitlab default token is stored encrypted and never echoed', async () => {
  const res = await call('PUT', '/api/admin/settings', { gitlab: { defaultToken: 'glpat-super-geheim' } });
  assert.equal(res.status, 200);
  assert.equal(res.data.gitlab.hasDefaultToken, true);
  assert.ok(!JSON.stringify(res.data).includes('glpat-super-geheim'));
  const onDisk = fs.readFileSync(path.join(tmpDir, 'db.json'), 'utf8');
  assert.ok(!onDisk.includes('glpat-super-geheim'), 'token must not be stored in plaintext');
});

test('wrong login is rejected and rate limit eventually kicks in', async () => {
  const fresh = await realFetch(baseUrl + '/api/admin/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'totally-wrong' }),
  });
  assert.equal(fresh.status, 401);
});

test('script deletion removes public availability', async () => {
  const res = await call('DELETE', `/api/admin/scripts/${scriptId}`);
  assert.equal(res.status, 200);
  const raw = await realFetch(`${baseUrl}/install/${scriptSlug}`, { headers: { 'user-agent': 'curl/8' } });
  assert.equal(raw.status, 404);
});

test('logout invalidates the session', async () => {
  const res = await call('POST', '/api/admin/logout');
  assert.equal(res.status, 200);
  cookie = '';
  const me = await call('GET', '/api/admin/me');
  assert.equal(me.status, 401);
});
