import { ProviderError } from "../errors";
import { normalizeMessages, requestJson } from "../http";
import type { ChatRequest, ChatResult, ProviderAdapter, ReadyState } from "../types";
import type { AdapterConfig } from "./config";

interface OllamaChatResponse {
  message?: { content?: string };
  prompt_eval_count?: number;
  eval_count?: number;
}
interface OllamaTags {
  models?: { name?: string; model?: string }[];
}
interface OllamaPs {
  models?: { name?: string; model?: string }[];
}

function sameModel(listed: string | undefined, wanted: string): boolean {
  if (!listed) return false;
  if (listed === wanted) return true;
  const strip = (s: string) => s.replace(/:latest$/, "");
  return strip(listed) === strip(wanted);
}

/** نموذج محلي عبر Ollama؛ يتحقق فعلياً من توفر الخدمة والنموذج وتحميله قبل الاستخدام. */
export class OllamaAdapter implements ProviderAdapter {
  constructor(private cfg: AdapterConfig) {}

  private get base() {
    return (this.cfg.baseUrl || "http://127.0.0.1:11434").replace(/\/+$/, "");
  }

  async checkReady(): Promise<ReadyState> {
    try {
      const tags = (await requestJson(`${this.base}/api/tags`, {
        method: "GET",
        timeoutMs: 3000,
      })) as OllamaTags;
      const available = (tags.models ?? []).some(
        (m) => sameModel(m.name, this.cfg.model) || sameModel(m.model, this.cfg.model),
      );
      if (!available) return { ready: false, available: false, loaded: false, reason: "model_not_pulled" };
      let loaded = false;
      try {
        const ps = (await requestJson(`${this.base}/api/ps`, { method: "GET", timeoutMs: 2000 })) as OllamaPs;
        loaded = (ps.models ?? []).some((m) => sameModel(m.name, this.cfg.model) || sameModel(m.model, this.cfg.model));
      } catch {
        /* /api/ps غير متاح في النسخ القديمة؛ لا يمنع الجاهزية */
      }
      return { ready: true, available: true, loaded };
    } catch (e) {
      const kind = e instanceof ProviderError ? e.kind : "network";
      return { ready: false, available: false, loaded: false, reason: kind === "timeout" ? "timeout" : "unreachable" };
    }
  }

  async chat(req: ChatRequest): Promise<ChatResult> {
    const msgs = normalizeMessages(req.messages);
    const messages: unknown[] = [{ role: "system", content: req.system }];
    msgs.forEach((m, idx) => {
      if (idx === msgs.length - 1 && m.role === "user" && req.images?.length) {
        messages.push({ role: "user", content: m.content, images: req.images.map((i) => i.data) });
      } else messages.push({ role: m.role, content: m.content });
    });
    const json = (await requestJson(`${this.base}/api/chat`, {
      body: {
        model: this.cfg.model,
        messages,
        stream: false,
        options: {
          num_predict: req.maxTokens ?? 1200,
          ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
        },
      },
      timeoutMs: this.cfg.timeoutMs,
    })) as OllamaChatResponse;
    const text = json.message?.content?.trim();
    if (!text) throw new ProviderError("unavailable", "رد فارغ من النموذج المحلي");
    return { text, inputTokens: json.prompt_eval_count, outputTokens: json.eval_count };
  }
}
