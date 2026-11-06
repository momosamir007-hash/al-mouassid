import { ProviderError } from "../errors";
import { normalizeMessages, requestJson } from "../http";
import type { ChatRequest, ChatResult, ProviderAdapter, ReadyState } from "../types";
import type { AdapterConfig } from "./config";

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

export class GeminiAdapter implements ProviderAdapter {
  constructor(private cfg: AdapterConfig) {}

  async checkReady(): Promise<ReadyState> {
    return this.cfg.apiKey ? { ready: true } : { ready: false, reason: "no_key" };
  }

  async chat(req: ChatRequest): Promise<ChatResult> {
    const base = (this.cfg.baseUrl || "https://generativelanguage.googleapis.com/v1beta").replace(/\/+$/, "");
    const msgs = normalizeMessages(req.messages);
    const contents = msgs.map((m, idx) => {
      const parts: unknown[] = [{ text: m.content }];
      if (idx === msgs.length - 1 && m.role === "user" && req.images?.length) {
        for (const im of req.images) parts.push({ inlineData: { mimeType: im.mime, data: im.data } });
      }
      return { role: m.role === "assistant" ? "model" : "user", parts };
    });

    const json = (await requestJson(`${base}/models/${encodeURIComponent(this.cfg.model)}:generateContent`, {
      headers: { "x-goog-api-key": this.cfg.apiKey ?? "" },
      body: {
        systemInstruction: { parts: [{ text: req.system }] },
        contents,
        generationConfig: {
          maxOutputTokens: Math.max(req.maxTokens ?? 1200, 512),
          ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
        },
      },
      timeoutMs: this.cfg.timeoutMs,
      secret: this.cfg.apiKey,
    })) as GeminiResponse;

    if (json.promptFeedback?.blockReason) {
      throw new ProviderError("bad_request", `حجب المزود المحتوى (${json.promptFeedback.blockReason})`);
    }
    const text = json.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? "")
      .join("")
      .trim();
    if (!text) throw new ProviderError("unavailable", "رد فارغ من المزود");
    return {
      text,
      inputTokens: json.usageMetadata?.promptTokenCount,
      outputTokens: json.usageMetadata?.candidatesTokenCount,
    };
  }
}
