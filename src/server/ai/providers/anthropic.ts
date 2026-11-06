import { ProviderError } from "../errors";
import { normalizeMessages, requestJson } from "../http";
import type { ChatRequest, ChatResult, ProviderAdapter, ReadyState } from "../types";
import type { AdapterConfig } from "./config";

interface AnthropicResponse {
  content?: { type: string; text?: string }[];
  usage?: { input_tokens?: number; output_tokens?: number };
}

export class AnthropicAdapter implements ProviderAdapter {
  constructor(private cfg: AdapterConfig) {}

  async checkReady(): Promise<ReadyState> {
    return this.cfg.apiKey ? { ready: true } : { ready: false, reason: "no_key" };
  }

  async chat(req: ChatRequest): Promise<ChatResult> {
    const base = (this.cfg.baseUrl || "https://api.anthropic.com").replace(/\/+$/, "");
    const msgs = normalizeMessages(req.messages);
    const messages = msgs.map((m, idx) => {
      if (idx === msgs.length - 1 && m.role === "user" && req.images?.length) {
        return {
          role: "user",
          content: [
            ...req.images.map((im) => ({
              type: "image",
              source: { type: "base64", media_type: im.mime, data: im.data },
            })),
            { type: "text", text: m.content },
          ],
        };
      }
      return { role: m.role, content: m.content };
    });

    const json = (await requestJson(`${base}/v1/messages`, {
      headers: { "x-api-key": this.cfg.apiKey ?? "", "anthropic-version": "2023-06-01" },
      body: {
        model: this.cfg.model,
        max_tokens: req.maxTokens ?? 1200,
        system: req.system,
        messages,
        ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
      },
      timeoutMs: this.cfg.timeoutMs,
      secret: this.cfg.apiKey,
    })) as AnthropicResponse;

    const text = json.content
      ?.filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("")
      .trim();
    if (!text) throw new ProviderError("unavailable", "رد فارغ من المزود");
    return { text, inputTokens: json.usage?.input_tokens, outputTokens: json.usage?.output_tokens };
  }
}
