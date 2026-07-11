import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { renderFavicon } from '../src/favicon.js';
import { normalizeIcon, DEFAULT_ICON } from '../src/scripts.js';
import { loadConfig } from '../src/config.js';

test('favicon: default mark uses branding colors', () => {
  const { type, body } = renderFavicon({ primaryColor: '#ff6600', accentColor: '#00ccff', logo: '' });
  assert.equal(type, 'image/svg+xml');
  assert.ok(body.includes('#ff6600'));
  assert.ok(body.includes('#00ccff'));
});

test('favicon: emoji logo becomes an SVG glyph, XML-escaped', () => {
  const { body } = renderFavicon({ logo: '🐳' });
  assert.ok(body.includes('🐳'));
  const evil = renderFavicon({ logo: '"><script>' });
  assert.ok(!evil.body.includes('<script>'));
});

test('favicon: raster logo is wrapped in scalable SVG', () => {
  const dataUrl = 'data:image/png;base64,iVBORw0KGgo=';
  const { type, body } = renderFavicon({ logo: dataUrl });
  assert.equal(type, 'image/svg+xml');
  assert.ok(body.includes(`href="${dataUrl}"`));
});

test('favicon: uploaded SVG logo is served directly', () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>';
  const dataUrl = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
  const { body } = renderFavicon({ logo: dataUrl });
  assert.equal(body, svg);
});

test('normalizeIcon: accepts valid Font Awesome classes', () => {
  assert.equal(normalizeIcon('fa-solid fa-server'), 'fa-solid fa-server');
  assert.equal(normalizeIcon('fa-brands fa-docker'), 'fa-brands fa-docker');
  assert.equal(normalizeIcon('  fa-solid   fa-box  '), 'fa-solid fa-box');
});

test('normalizeIcon: rejects malformed fa values, keeps emoji/urls', () => {
  assert.equal(normalizeIcon('fa-solid fa-server" onload="x'), DEFAULT_ICON);
  assert.equal(normalizeIcon('fa-evil'), DEFAULT_ICON);
  assert.equal(normalizeIcon(''), DEFAULT_ICON);
  assert.equal(normalizeIcon('🐳'), '🐳');
  assert.equal(normalizeIcon('https://example.com/logo.png'), 'https://example.com/logo.png');
  assert.equal(normalizeIcon('fa-garbage', '🐳'), '🐳');
});

test('config: INSTALLATION_DOMAIN acts as publicUrl fallback (default http)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'esw-cfg-'));
  try {
    const plain = loadConfig({ DATA_DIR: dir, SESSION_SECRET: 'x', INSTALLATION_DOMAIN: 'install.example.com' });
    assert.equal(plain.publicUrl, 'http://install.example.com');
    const withScheme = loadConfig({ DATA_DIR: dir, SESSION_SECRET: 'x', INSTALLATION_DOMAIN: 'https://install.example.com/' });
    assert.equal(withScheme.publicUrl, 'https://install.example.com');
    const publicWins = loadConfig({ DATA_DIR: dir, SESSION_SECRET: 'x', PUBLIC_URL: 'https://a.example.com', INSTALLATION_DOMAIN: 'b.example.com' });
    assert.equal(publicWins.publicUrl, 'https://a.example.com');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
