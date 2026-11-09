import type { ProviderAdapter, ProviderRecord } from "../types";
import { AnthropicAdapter } from "./anthropic";
import { GeminiAdapter } from "./gemini";
import { OllamaAdapter } from "./ollama";
import { OpenAICompatibleAdapter } from "./openai-compatible";
import type { AdapterConfig } from "./config";

/**
 * مصنع المحوّلات: لإضافة مزود جديد اكتب محوّلاً ينفّذ ProviderAdapter ثم سجّله هنا فقط.
 * منطق التطبيق والموجّه لا يتغيران.
 */
const registry: Record<string, (cfg: AdapterConfig) => ProviderAdapter> = {
  openai: (c) => new OpenAICompatibleAdapter(c),
  "openai-compatible": (c) => new OpenAICompatibleAdapter(c),
  gemini: (c) => new GeminiAdapter(c),
  anthropic: (c) => new AnthropicAdapter(c),
  ollama: (c) => new OllamaAdapter(c),
};

function safeEndpoint(p: ProviderRecord): boolean {
  if (!p.baseUrl) return true;
  try {
    const u = new URL(p.baseUrl);
    if (u.username || u.password || u.search || u.hash) return false;
    const host = u.hostname.toLowerCase();
    if (p.kind === "ollama") return u.protocol === "http:" && (["127.0.0.1", "localhost", "[::1]"].includes(host) || p.baseUrl === process.env.OLLAMA_BASE_URL);
    if (process.env.NODE_ENV === "test" && u.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(host)) return true;
    const ipLiteral = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.startsWith("[");
    return u.protocol === "https:" && !ipLiteral && host.includes(".") && !host.endsWith(".local") && !host.endsWith(".internal");
  } catch { return false; }
}
export function createAdapter(p: ProviderRecord): ProviderAdapter {
  if (!safeEndpoint(p)) throw new Error("عنوان المزود غير آمن؛ تم منع الاتصال به.");
  const factory = registry[p.kind];
  if (!factory) throw new Error(`نوع مزود غير مدعوم: ${p.kind}`);
  return factory({
    kind: p.kind,
    baseUrl: p.baseUrl,
    model: p.model,
    apiKey: p.getApiKey?.() ?? null,
    timeoutMs: p.timeoutMs,
  });
}
