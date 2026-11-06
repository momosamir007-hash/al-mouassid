import { ProviderError } from "../errors";
import { normalizeMessages, requestJson } from "../http";
import type { ChatRequest, ChatResult, ProviderAdapter, ReadyState } from "../types";
import type { AdapterConfig } from "./config";

interface OpenAIResponse {
  choices?: { message?: { content?: string | null }; finish_reason?: string }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/** يغطي OpenAI الرسمي وكل واجهة متوافقة (OpenRouter, Groq, LM Studio, vLLM, ...). */
export class OpenAICompatibleAdapter implements ProviderAdapter {
  constructor(private cfg: AdapterConfig) {}

  private get base() {
    return (this.cfg.baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");
  }

  async checkReady(): Promise<ReadyState> {
    if (this.cfg.kind === "openai" && !this.cfg.apiKey) return { ready: false, reason: "no_key" };
    return { ready: true };
  }

  async chat(req: ChatRequest): Promise<ChatResult> {
    const msgs = normalizeMessages(req.messages);
    const messages: unknown[] = [{ role: "system", content: req.system }];
    msgs.forEach((m, idx) => {
      const isLastUser = idx === msgs.length - 1 && m.role === "user";
      if (isLastUser && req.images?.length) {
        messages.push({
          role: "user",
          content: [
            { type: "text", text: m.content },
            ...req.images.map((im) => ({
              type: "image_url",
              image_url: { url: `data:${im.mime};base64,${im.data}` },
            })),
          ],
        });
      } else messages.push({ role: m.role, content: m.content });
    });

    const isOfficial = this.cfg.kind === "openai";
    const body: Record<string, unknown> = { model: this.cfg.model, messages };
    // نماذج OpenAI الحديثة ترفض max_tokens وتغيير temperature؛ الواجهات المتوافقة تتوقعهما.
    if (isOfficial) {
      body.max_completion_tokens = req.maxTokens ?? 1200;
    } else {
      body.max_tokens = req.maxTokens ?? 1200;
      if (req.temperature !== undefined) body.temperature = req.temperature;
    }

    const headers: Record<string, string> = {};
    if (this.cfg.apiKey) headers.authorization = `Bearer ${this.cfg.apiKey}`;
    const json = (await requestJson(`${this.base}/chat/completions`, {
      headers,
      body,
      timeoutMs: this.cfg.timeoutMs,
      secret: this.cfg.apiKey,
    })) as OpenAIResponse;

    const text = json.choices?.[0]?.message?.content?.trim();
    if (!text) throw new ProviderError("unavailable", "رد فارغ من المزود");
    return {
      text,
      inputTokens: json.usage?.prompt_tokens,
      outputTokens: json.usage?.completion_tokens,
    };
  }
}
