import { ProviderError } from "../errors";
import { normalizeMessages, requestJson } from "../http";
import type { ChatRequest, ChatResult, ProviderAdapter, ReadyState } from "../types";
import type { AdapterConfig } from "./config";
interface OpenAIResponse {
  choices?: { message?: { content?: string | null; reasoning?: string | null; reasoning_content?: string | null }; finish_reason?: string }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  output?: string | string[];
}
function cleanModelOutput(raw: string): string {
  // حذف كتل التفكير المكتملة وغير المكتملة؛ لا نرجع النص الخام إذا أصبح فارغاً.
  return raw.replace(/<think\b[^>]*>[\s\S]*?(?:<\/think\s*>|$)/gi, "").trim();
}
export class OpenAICompatibleAdapter implements ProviderAdapter {
  constructor(private cfg: AdapterConfig) {}
  private get base() { return (this.cfg.baseUrl || "https://api.openai.com/v1").replace(/\/+$/, ""); }
  async checkReady(): Promise<ReadyState> {
    const keyless = /text\.pollinations\.ai/i.test(this.base);
    if (!this.cfg.apiKey && !keyless) return { ready: false, reason: "no_key" };
    return { ready: true };
  }
  async chat(req: ChatRequest): Promise<ChatResult> {
    const msgs = normalizeMessages(req.messages);
    if (this.base.includes("api.replicate.com")) {
      const prompt = msgs.map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`).join("\n\n");
      const headers: Record<string,string> = { Prefer: "wait" }; if (this.cfg.apiKey) headers.authorization = `Bearer ${this.cfg.apiKey}`;
      const modelPath = this.cfg.model.replace(/^\/+|\/+$/g, "");
      const json = await requestJson(`${this.base}/models/${modelPath}/predictions`, { headers,
        body: { input: { system_prompt: req.system, prompt, max_tokens: req.maxTokens ?? 1200, temperature: req.temperature ?? 0.4 } },
        timeoutMs: this.cfg.timeoutMs, secret: this.cfg.apiKey }) as OpenAIResponse;
      const raw = Array.isArray(json.output) ? json.output.join("") : (json.output ?? "");
      const text = cleanModelOutput(String(raw)); if (!text) throw new ProviderError("unavailable", "رد فارغ أو تفكير داخلي فقط من Replicate");
      return { text };
    }
    const messages: unknown[] = [{ role: "system", content: req.system }];
    msgs.forEach((m, idx) => {
      if (idx === msgs.length - 1 && m.role === "user" && req.images?.length) messages.push({ role: "user", content: [
        { type: "text", text: m.content }, ...req.images.map(im => ({ type: "image_url", image_url: { url: `data:${im.mime};base64,${im.data}` } }))] });
      else messages.push({ role: m.role, content: m.content });
    });
    const isOfficial = this.cfg.kind === "openai";
    const body: Record<string,unknown> = { model: this.cfg.model, messages };
    if (isOfficial) body.max_completion_tokens = req.maxTokens ?? 1200;
    else { body.max_tokens = req.maxTokens ?? 1200; if (req.temperature !== undefined) body.temperature = req.temperature; }
    const headers: Record<string,string> = {}; if (this.cfg.apiKey) headers.authorization = `Bearer ${this.cfg.apiKey}`;
    const json = await requestJson(`${this.base}/chat/completions`, { headers, body, timeoutMs: this.cfg.timeoutMs, secret: this.cfg.apiKey }) as OpenAIResponse;
    const choice = json.choices?.[0];
    if (choice?.finish_reason === "length") throw new ProviderError("unavailable", "انتهى حد الرموز قبل اكتمال الإجابة؛ لم نعرض الرد المبتور.");
    // لا نستخدم reasoning/reasoning_content كبديل عن الإجابة النهائية.
    const raw = choice?.message?.content?.trim() ?? "";
    const text = cleanModelOutput(raw);
    if (!text) throw new ProviderError("unavailable", "لم يُرجع المزود إجابة نهائية صالحة.");
    return { text, inputTokens: json.usage?.prompt_tokens, outputTokens: json.usage?.completion_tokens };
  }
}
