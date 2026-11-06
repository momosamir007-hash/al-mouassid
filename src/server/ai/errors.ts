import type { ErrorKind } from "./types";

export class ProviderError extends Error {
  kind: ErrorKind;
  status?: number;
  retryAfterMs?: number;
  constructor(kind: ErrorKind, message: string, opts: { status?: number; retryAfterMs?: number } = {}) {
    super(message);
    this.name = "ProviderError";
    this.kind = kind;
    this.status = opts.status;
    this.retryAfterMs = opts.retryAfterMs;
  }
}

const QUOTA_RE =
  /insufficient_quota|exceeded your current quota|billing|credit balance|out of credits|quota exceeded|payment required|resource_exhausted.*quota|per day|daily limit/i;

export function parseRetryAfter(header: string | null | undefined): number | undefined {
  if (!header) return undefined;
  const secs = Number(header);
  if (Number.isFinite(secs)) return Math.max(0, secs) * 1000;
  const date = Date.parse(header);
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  return undefined;
}

/** يصنّف أخطاء HTTP إلى أنواع قابلة للمعالجة المنهجية. */
export function classifyHttpError(status: number, body: string, retryAfter?: string | null): ProviderError {
  const snippet = body.replace(/\s+/g, " ").slice(0, 240);
  const retryAfterMs = parseRetryAfter(retryAfter);
  const msg = `HTTP ${status}${snippet ? `: ${snippet}` : ""}`;
  if (status === 401 || status === 403) return new ProviderError("auth", msg, { status });
  if (status === 402) return new ProviderError("quota", msg, { status });
  if (status === 408 || status === 504) return new ProviderError("timeout", msg, { status });
  if (status === 429) {
    const isPerMinute = /rate limit reached|tokens per minute|requests per minute|tpm|rpm/i.test(body);
    return !isPerMinute && QUOTA_RE.test(body)
      ? new ProviderError("quota", msg, { status })
      : new ProviderError("rate_limit", msg, { status, retryAfterMs });
  }
  if (status === 400 && QUOTA_RE.test(body)) return new ProviderError("quota", msg, { status });
  if (status === 400 && /image|vision|multimodal|does not support/i.test(body)) {
    return new ProviderError("unsupported", msg, { status });
  }
  if (status === 400 || status === 404 || status === 422) return new ProviderError("bad_request", msg, { status });
  if (status === 529 || status >= 500) return new ProviderError("unavailable", msg, { status, retryAfterMs });
  return new ProviderError("unknown", msg, { status });
}

/** مدة الإيقاف المؤقت للمزود بعد كل نوع خطأ (قصيرة للمزودات المجانية لتعود للعمل فور انتهاء الدقيقة). */
export function cooldownFor(err: ProviderError): number {
  const sec = 1_000;
  switch (err.kind) {
    case "quota":
      return 60 * sec;
    case "auth":
      return 15 * 60 * sec;
    case "rate_limit":
      return Math.min(Math.max(err.retryAfterMs ?? 20 * sec, 10 * sec), 90 * sec);
    case "unavailable":
      return 30 * sec;
    case "timeout":
    case "network":
      return 20 * sec;
    case "unsupported":
      return 5 * 60 * sec;
    case "bad_request":
      return 60 * sec;
    default:
      return 30 * sec;
  }
}

/** يزيل أي أثر للمفتاح من رسائل الخطأ. */
export function redactSecret(message: string, secret?: string | null): string {
  let out = message;
  if (secret && secret.length >= 6) out = out.split(secret).join("***");
  return out
    .replace(/(sk-[A-Za-z0-9_-]{8,})/g, "sk-***")
    .replace(/(AIza[0-9A-Za-z_-]{10,})/g, "AIza***")
    .replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, "$1***")
    .replace(/(key=)[^&\s"]+/gi, "$1***");
}
