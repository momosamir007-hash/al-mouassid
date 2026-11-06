import { classifyHttpError, ProviderError, redactSecret } from "./errors";
import type { ChatMessage } from "./types";

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
export async function requestJson(url: string, opts: JsonRequestOptions): Promise<unknown> {
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
    const text = await res.text();
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
