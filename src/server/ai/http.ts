import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { classifyHttpError, ProviderError, redactSecret } from "./errors";
import type { ChatMessage } from "./types";

function isPrivateIp(address: string): boolean {
  if (address.includes(":")) {
    const ip = address.toLowerCase();
    return ip === "::" || ip === "::1" || ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe8") || ip.startsWith("fe9") || ip.startsWith("fea") || ip.startsWith("feb") || ip.startsWith("::ffff:") || ip.startsWith("2001:db8:");
  }
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a,b] = octets;
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
}

async function assertSafeOutboundTarget(raw: string): Promise<void> {
  // اختبارات المحولات تستخدم خوادم loopback وهمية؛ في الإنتاج نمنع DNS الداخلي وعناوين الشبكات الخاصة.
  if (process.env.NODE_ENV === "test") return;
  let url: URL;
  try { url = new URL(raw); } catch { throw new ProviderError("bad_request", "عنوان المزود غير صالح."); }
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  let trustedOllamaOrigin = false;
  try { trustedOllamaOrigin = Boolean(process.env.OLLAMA_BASE_URL) && new URL(process.env.OLLAMA_BASE_URL!).origin === url.origin; } catch { /* إعداد بيئة غير صالح */ }
  if (host === "localhost" || trustedOllamaOrigin) return; // وجهة محلية أو وجهة Ollama التي ضبطها المشغّل.
  const literal = isIP(host);
  if (literal) {
    if (isPrivateIp(host) && (host === "127.0.0.1" || host === "::1")) return;
    if (isPrivateIp(host)) throw new ProviderError("bad_request", "تم منع الاتصال بعنوان شبكة داخلية.");
    return;
  }
  let addresses: { address: string; family: number }[];
  try { addresses = await lookup(host, { all: true, verbatim: true }); }
  catch { throw new ProviderError("network", "تعذر التحقق من عنوان مزود الذكاء الاصطناعي."); }
  if (!addresses.length || addresses.some(a => isPrivateIp(a.address))) throw new ProviderError("bad_request", "تم منع المزود لأن عنوانه يحل إلى شبكة داخلية أو خاصة.");
}

export interface JsonRequestOptions {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs: number;
  secret?: string | null;
}

/**
 * طلب HTTP واحد بمهلة زمنية. لا توجد أي إعادة محاولة هنا:
 * الطلب المدفوع لا يُعاد إرساله عند عدم اليقين بنتيجته (مهلة/انقطاع).
 */
async function readLimitedText(res: Response, maxBytes = 2 * 1024 * 1024): Promise<string> {
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > maxBytes) throw new ProviderError("unavailable", "رد المزود أكبر من الحد المسموح.");
  if (!res.body) return "";
  const reader = res.body.getReader(); const chunks: Uint8Array[] = []; let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) { await reader.cancel(); throw new ProviderError("unavailable", "رد المزود أكبر من الحد المسموح."); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}

export async function requestJson(url: string, opts: JsonRequestOptions): Promise<unknown> {
  await assertSafeOutboundTarget(url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? "POST",
      headers: { "content-type": "application/json", ...(opts.headers ?? {}) },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: controller.signal,
      cache: "no-store",
      redirect: "manual",
    });
  } catch (e) {
    clearTimeout(timer);
    const err = e as { name?: string; message?: string; cause?: { code?: string } };
    if (err?.name === "AbortError") {
      throw new ProviderError("timeout", `انتهت المهلة بعد ${Math.round(opts.timeoutMs / 1000)} ثانية`);
    }
    const code = err?.cause?.code ? ` (${err.cause.code})` : "";
    throw new ProviderError("network", redactSecret(`تعذّر الاتصال بالمزود${code}`, opts.secret));
  }
  try {
    const text = await readLimitedText(res);
    if (!res.ok) {
      const e = classifyHttpError(res.status, text, res.headers.get("retry-after"));
      throw new ProviderError(e.kind, redactSecret(e.message, opts.secret), {
        status: e.status,
        retryAfterMs: e.retryAfterMs,
      });
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new ProviderError("unavailable", "ردّ غير صالح (ليس JSON) من المزود");
    }
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    const err = e as { name?: string };
    if (err?.name === "AbortError") throw new ProviderError("timeout", "انتهت المهلة أثناء قراءة الرد");
    throw new ProviderError("network", "انقطع الاتصال أثناء قراءة الرد");
  } finally {
    clearTimeout(timer);
  }
}

/** يدمج الرسائل المتتالية من الدور نفسه ويضمن البدء برسالة مستخدم (شرط Anthropic وGemini). */
export function normalizeMessages(messages: ChatMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const m of messages) {
    if (!m.content.trim()) continue;
    const last = out[out.length - 1];
    if (last && last.role === m.role) last.content += `\n\n${m.content}`;
    else out.push({ ...m });
  }
  while (out.length && out[0].role !== "user") out.shift();
  return out;
}
