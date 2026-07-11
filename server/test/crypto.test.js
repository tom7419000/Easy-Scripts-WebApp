import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, encryptSecret, decryptSecret, sha256hex } from '../src/crypto.js';

test('password hash roundtrip', () => {
  const hash = hashPassword('correct horse battery staple');
  assert.ok(hash.startsWith('scrypt$'));
  assert.ok(verifyPassword('correct horse battery staple', hash));
  assert.ok(!verifyPassword('wrong password', hash));
  assert.ok(!verifyPassword('correct horse battery staple', 'garbage'));
});

test('secret encryption roundtrip', () => {
  const secret = 'app-secret-key';
  const enc = encryptSecret('glpat-token-123', secret);
  assert.notEqual(enc, 'glpat-token-123');
  assert.equal(decryptSecret(enc, secret), 'glpat-token-123');
  assert.equal(decryptSecret(enc, 'other-secret'), null);
  assert.equal(decryptSecret('tampered.value', secret), null);
});

test('sha256hex', () => {
  assert.equal(
    sha256hex('hello'),
    '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'
  );
});
