import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateNginxConfig } from '../src/nginx.js';
import { UserError } from '../src/gitlab.js';

const base = { domain: 'install.example.com', ssl: false, sslCertPath: '', sslKeyPath: '', redirectHttp: true };

test('http-only config proxies to the app', () => {
  const conf = generateNginxConfig({ nginx: base, appPort: 3001 });
  assert.match(conf, /server_name install\.example\.com;/);
  assert.match(conf, /proxy_pass http:\/\/127\.0\.0\.1:3001;/);
  assert.match(conf, /listen 80;/);
  assert.doesNotMatch(conf, /443/);
});

test('ssl config adds https server and redirect', () => {
  const conf = generateNginxConfig({
    nginx: { ...base, ssl: true, sslCertPath: '/etc/letsencrypt/live/x/fullchain.pem', sslKeyPath: '/etc/letsencrypt/live/x/privkey.pem' },
    appPort: 3001,
  });
  assert.match(conf, /listen 443 ssl;/);
  assert.match(conf, /return 301 https:\/\/\$host\$request_uri;/);
  assert.match(conf, /ssl_certificate\s+\/etc\/letsencrypt\/live\/x\/fullchain\.pem;/);
});

test('invalid domain or missing cert paths are rejected', () => {
  assert.throws(() => generateNginxConfig({ nginx: { ...base, domain: '' }, appPort: 3001 }), UserError);
  assert.throws(() => generateNginxConfig({ nginx: { ...base, domain: 'bad domain!' }, appPort: 3001 }), UserError);
  assert.throws(() => generateNginxConfig({ nginx: { ...base, domain: 'x; injection' }, appPort: 3001 }), UserError);
  assert.throws(
    () => generateNginxConfig({ nginx: { ...base, ssl: true }, appPort: 3001 }),
    UserError
  );
});
