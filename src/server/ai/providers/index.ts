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

export function createAdapter(p: ProviderRecord): ProviderAdapter {
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
