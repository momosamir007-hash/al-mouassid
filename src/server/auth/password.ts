import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

function scryptAsync(password: string, salt: Buffer, len: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, len, { N: 16384, r: 8, p: 1 }, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, 64);
  return `s1.${salt.toString("base64url")}.${key.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [v, saltB64, keyB64] = stored.split(".");
  if (v !== "s1" || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, "base64url");
  const actual = await scryptAsync(password, Buffer.from(saltB64, "base64url"), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
