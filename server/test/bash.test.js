import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { renderIndexScript, shellQuote, curlCommand } from '../src/bash.js';

const TRICKY_SCRIPTS = [
  { slug: 'docker-setup', name: "Tom's Docker \"Setup\"", version: '1.0.0', description: 'Installs `docker` & friends; $(echo pwned)' },
  { slug: 'proxmox', name: 'Proxmox Helper', version: '2.1', description: "Line one\nLine two with 'quotes'" },
];

test('shellQuote neutralises single quotes', () => {
  assert.equal(shellQuote("a'b"), `'a'\\''b'`);
  assert.equal(shellQuote('plain'), `'plain'`);
});

test('curlCommand format', () => {
  assert.equal(curlCommand('https://x.de', 's1'), 'curl -fsSL https://x.de/install/s1 | bash');
});

test('rendered index script is valid bash even with hostile metadata', () => {
  const script = renderIndexScript({
    baseUrl: 'https://install.example.com',
    title: 'Mein "Dashboard" $(evil)',
    description: 'Test; rm -rf /',
    scripts: TRICKY_SCRIPTS,
  });
  assert.match(script, /^#!\/usr\/bin\/env bash/);
  assert.ok(script.includes('docker-setup'));
  const check = spawnSync('bash', ['-n'], { input: script, encoding: 'utf8' });
  assert.equal(check.status, 0, `bash -n failed:\n${check.stderr}`);
});

test('rendered script for empty list is valid bash and says so', () => {
  const script = renderIndexScript({ baseUrl: 'http://localhost:3001', title: 'T', description: '', scripts: [] });
  assert.ok(script.includes('keine Scripts'));
  const check = spawnSync('bash', ['-n'], { input: script, encoding: 'utf8' });
  assert.equal(check.status, 0, `bash -n failed:\n${check.stderr}`);
});

test('piped execution (curl | bash) terminates cleanly', () => {
  const script = renderIndexScript({
    baseUrl: 'https://install.example.com',
    title: 'Dash',
    description: '',
    scripts: TRICKY_SCRIPTS,
  });
  // Depending on the environment /dev/tty may be missing (-> prints the curl
  // one-liners) or unreadable (-> read fails and the script aborts politely).
  // Either way it must exit 0 without hanging.
  const run = spawnSync('bash', [], { input: script, encoding: 'utf8', timeout: 10000 });
  assert.equal(run.status, 0, `script failed:\n${run.stderr}`);
  assert.ok(
    run.stdout.includes('curl -fsSL https://install.example.com/install/docker-setup | bash')
    || run.stdout.includes('Abgebrochen'),
    `unexpected output:\n${run.stdout}`
  );
});
