// Password hashing via Node's built-in scrypt — no extra dependency, no
// native module to compile. Each password gets its own random salt; the
// stored value is "salt:hash" (both hex), so a leaked db.json doesn't leak
// plaintext or a crackable-without-salt hash.

import crypto from "crypto";

const KEYLEN = 64;

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, KEYLEN).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  if (!stored || !stored.includes(":")) return false;
  const [salt, hash] = stored.split(":");
  const hashBuffer = Buffer.from(hash, "hex");
  const candidateBuffer = crypto.scryptSync(password, salt, KEYLEN);
  if (hashBuffer.length !== candidateBuffer.length) return false;
  return crypto.timingSafeEqual(hashBuffer, candidateBuffer);
}

// Used for admin-issued temp passwords — short enough to read aloud/type,
// long enough to not be guessable before the employee changes it.
export function generateTempPassword() {
  return crypto.randomBytes(9).toString("base64url"); // ~12 chars
}
