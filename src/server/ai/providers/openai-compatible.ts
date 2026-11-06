import { ProviderError } from "../errors";
import { normalizeMessages, requestJson } from "../http";
import type { ChatRequest, ChatResult, ProviderAdapter, ReadyState } from "../types";
import type { AdapterConfig } from "./config";

interface OpenAIResponse {
  choices?: {
    message?: {
      content?: string | null;
      reasoning?: string | null;
      reasoning_content?: string | null;
    };
    finish_reason?: string;
  }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  output?: string | string[];
  error?: string | { message?: string };
}

function cleanModelOutput(raw: string): string {
  // إزالة وسوم التفكير الداخلي <think>...</think> إن وُجدت في بعض نماذج الاستدلال (Qwen / DeepSeek / إلخ)
  const stripped = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  return stripped || raw.trim();
}

/** يغطي OpenAI الرسمي وكل واجهة متوافقة (OpenRouter, Groq, HuggingFace, SambaNova, Together, GitHub, Grok, Cohere, NVIDIA, Replicate, ...). */
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

    // دعم خاص لواجهة Replicate الرسمية (api.replicate.com/v1) عند إضافتها كمزود
    if (this.base.includes("api.replicate.com")) {
      const prompt = msgs.map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`).join("\n\n");
      const headers: Record<string, string> = { Prefer: "wait" };
      if (this.cfg.apiKey) headers.authorization = `Bearer ${this.cfg.apiKey}`;
      const modelPath = this.cfg.model.replace(/^\/+|\/+$/g, "");
      const json = (await requestJson(`${this.base}/models/${modelPath}/predictions`, {
        headers,
        body: {
          input: {
            system_prompt: req.system,
            prompt,
            max_tokens: req.maxTokens ?? 1200,
            temperature: req.temperature ?? 0.4,
          },
        },
        timeoutMs: this.cfg.timeoutMs,
        secret: this.cfg.apiKey,
      })) as OpenAIResponse;
      const outText = Array.isArray(json.output) ? json.output.join("") : (json.output ?? "");
      const cleaned = cleanModelOutput(String(outText));
      if (!cleaned) throw new ProviderError("unavailable", "رد فارغ من Replicate");
      return { text: cleaned };
    }

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
    const isReasoningModel = /gpt-oss|qwen3|deepseek-r1|o1|o3|qwq/i.test(this.cfg.model);
    const desiredTokens = isReasoningModel ? Math.max(req.maxTokens ?? 1200, 2048) : (req.maxTokens ?? 1200);
    const body: Record<string, unknown> = { model: this.cfg.model, messages };
    // نماذج OpenAI الحديثة ترفض max_tokens وتغيير temperature؛ الواجهات المتوافقة تتوقعهما.
    if (isOfficial) {
      body.max_completion_tokens = desiredTokens;
    } else {
      body.max_tokens = desiredTokens;
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

    const msgObj = json.choices?.[0]?.message;
    const rawContent = msgObj?.content?.trim() || msgObj?.reasoning_content?.trim() || msgObj?.reasoning?.trim() || "";
    const text = cleanModelOutput(rawContent);
    if (!text) throw new ProviderError("unavailable", "رد فارغ من المزود");
    return {
      text,
      inputTokens: json.usage?.prompt_tokens,
      outputTokens: json.usage?.completion_tokens,
    };
  }
}
