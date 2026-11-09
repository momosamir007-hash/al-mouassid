import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function keyFor(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

export function hasAppSecret(): boolean {
  return Boolean(process.env.APP_SECRET && process.env.APP_SECRET.length >= 16);
}

/** تشفير AES-256-GCM لمفاتيح المزودين المخزنة. الصيغة: v1.iv.tag.ciphertext (base64url). */
export function encryptSecret(plain: string, secret = process.env.APP_SECRET): string {
  if (!secret || secret.length < 16) throw new Error("APP_SECRET غير مضبوط (16 حرفاً على الأقل)");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFor(secret), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), ct.toString("base64url")].join(".");
}

export function decryptSecret(payload: string, secret = process.env.APP_SECRET): string {
  const [v, iv, tag, ct] = payload.split(".");
  if (v !== "v1" || !iv || !tag || !ct) throw new Error("صيغة سر غير صالحة");
  const candidates = [...new Set([secret, process.env.APP_SECRET_PREVIOUS].filter((x): x is string => Boolean(x && x.length >= 16)))];
  if (!candidates.length) throw new Error("APP_SECRET غير مضبوط");
  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      const decipher = createDecipheriv("aes-256-gcm", keyFor(candidate), Buffer.from(iv, "base64url"));
      decipher.setAuthTag(Buffer.from(tag, "base64url"));
      return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
    } catch (e) { lastError = e; }
  }
  throw lastError instanceof Error ? lastError : new Error("تعذر فك تشفير المفتاح المخزن");
}

export function keyHintOf(key: string): string {
  return key.length <= 4 ? "••••" : `••••${key.slice(-4)}`;
}
