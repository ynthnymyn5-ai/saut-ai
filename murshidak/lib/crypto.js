import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

let KEY;

/** Load the at-rest encryption key from MURSHIDAK_SECRET, or a generated key file. */
export function initKey(dataDir) {
  let secret = process.env.MURSHIDAK_SECRET;
  if (!secret) {
    const file = path.join(dataDir, '.secret');
    if (fs.existsSync(file)) secret = fs.readFileSync(file, 'utf8').trim();
    else {
      secret = crypto.randomBytes(32).toString('hex');
      fs.writeFileSync(file, secret, { mode: 0o600 });
    }
  }
  KEY = crypto.createHash('sha256').update(secret).digest();
}

/** AES-256-GCM. Output layout: iv(12) | tag(16) | ciphertext. */
export function encrypt(buf) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([c.update(buf), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), enc]);
}

export function decrypt(buf) {
  const d = crypto.createDecipheriv('aes-256-gcm', KEY, buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]);
}

export const encryptText = (s) => (s ? encrypt(Buffer.from(String(s), 'utf8')).toString('base64') : null);
export const decryptText = (s) => (s ? decrypt(Buffer.from(s, 'base64')).toString('utf8') : '');

export const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
export const randomToken = () => crypto.randomBytes(32).toString('base64url');
export const randomId = () => crypto.randomBytes(16).toString('hex');

/** Never show full ID numbers in lists: keep only the last 4 characters. */
export function mask(num) {
  if (!num) return '';
  const s = String(num).replace(/\s+/g, '');
  if (s.length <= 4) return '•'.repeat(s.length);
  return '•••• ' + s.slice(-4);
}
