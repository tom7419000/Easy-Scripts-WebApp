import crypto from 'node:crypto';

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };
const KEY_LEN = 64;

/** Hash a password with scrypt (built-in, no native deps). */
export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, KEY_LEN, SCRYPT_PARAMS);
  return ['scrypt', SCRYPT_PARAMS.N, SCRYPT_PARAMS.r, SCRYPT_PARAMS.p, salt.toString('base64'), hash.toString('base64')].join('$');
}

/** Verify a password against a stored hash in constant time. */
export function verifyPassword(password, stored) {
  try {
    const [algo, N, r, p, saltB64, hashB64] = String(stored).split('$');
    if (algo !== 'scrypt') return false;
    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(hashB64, 'base64');
    const actual = crypto.scryptSync(password, salt, expected.length, {
      N: Number(N), r: Number(r), p: Number(p),
    });
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function sha256hex(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function hmac(value, secret) {
  return crypto.createHmac('sha256', secret).update(value).digest('base64url');
}

function deriveKey(secret, info) {
  return Buffer.from(crypto.hkdfSync('sha256', secret, Buffer.alloc(0), info, 32));
}

/**
 * Encrypt a small secret (e.g. GitLab access token) with AES-256-GCM.
 * The key is derived from the app secret, so encrypted values are useless
 * without the server's .secret file / SESSION_SECRET.
 */
export function encryptSecret(plaintext, secret) {
  const key = deriveKey(secret, 'secret-encryption');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join('.');
}

export function decryptSecret(payload, secret) {
  try {
    const [version, ivB64, tagB64, dataB64] = String(payload).split('.');
    if (version !== 'v1') return null;
    const key = deriveKey(secret, 'secret-encryption');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    const dec = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]);
    return dec.toString('utf8');
  } catch {
    return null;
  }
}
