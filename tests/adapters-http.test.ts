import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAdapter } from "@/server/ai/providers";
import { AiRouter } from "@/server/ai/router";
import { ProviderError } from "@/server/ai/errors";
import { MemoryStore, provider } from "./helpers";

/**
 * اختبارات تكامل حقيقية عبر HTTP: خوادم وهمية محلية تتحدث بروتوكولات
 * OpenAI وGemini وClaude وOllama، فتُختبر المحوّلات الحقيقية وتصنيف الأخطاء والتحويل.
 */

type Handler = (req: http.IncomingMessage, body: string, res: http.ServerResponse) => void;
let server: http.Server;
let base = "";
const hits: { url: string; body: string; headers: http.IncomingHttpHeaders }[] = [];
let handler: Handler = (_r, _b, res) => res.end("{}");

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      hits.push({ url: req.url ?? "", body, headers: req.headers });
      handler(req, body, res);
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

const json = (res: http.ServerResponse, status: number, data: unknown, headers: Record<string, string> = {}) => {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(JSON.stringify(data));
};
const chatReq = { system: "sys", messages: [{ role: "user" as const, content: "سؤال" }] };

describe("المحوّلات: نجاح وبروتوكولات", () => {
  it("OpenAI-compatible: يرسل Authorization ويقرأ الرد والرموز", async () => {
    handler = (_r, _b, res) =>
      json(res, 200, { choices: [{ message: { content: "مرحبا" } }], usage: { prompt_tokens: 7, completion_tokens: 3 } });
    const a = createAdapter(provider({ id: 1, name: "o", kind: "openai-compatible", baseUrl: `${base}/v1`, getApiKey: () => "sk-secret-123456" }));
    const out = await a.chat(chatReq);
    expect(out).toMatchObject({ text: "مرحبا", inputTokens: 7, outputTokens: 3 });
    const h = hits.at(-1)!;
    expect(h.url).toBe("/v1/chat/completions");
    expect(h.headers.authorization).toBe("Bearer sk-secret-123456");
  });

  it("OpenAI-compatible: يرسل الصورة بصيغة image_url", async () => {
    handler = (_r, _b, res) => json(res, 200, { choices: [{ message: { content: "ok" } }] });
    const a = createAdapter(provider({ id: 1, name: "o", kind: "openai-compatible", baseUrl: base }));
    await a.chat({ ...chatReq, images: [{ mime: "image/png", data: "QUJD" }] });
    expect(hits.at(-1)!.body).toContain("data:image/png;base64,QUJD");
  });

  it("Gemini: يستعمل x-goog-api-key وinlineData ويقرأ النص", async () => {
    handler = (_r, _b, res) =>
      json(res, 200, { candidates: [{ content: { parts: [{ text: "جيميني" }] } }], usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 2 } });
    const a = createAdapter(provider({ id: 2, name: "g", kind: "gemini", baseUrl: base, model: "gem-x", getApiKey: () => "AIzaSyFAKEFAKEFAKE" }));
    const out = await a.chat({ ...chatReq, images: [{ mime: "image/jpeg", data: "QUJD" }] });
    expect(out.text).toBe("جيميني");
    const h = hits.at(-1)!;
    expect(h.url).toContain("/models/gem-x:generateContent");
    expect(h.headers["x-goog-api-key"]).toBe("AIzaSyFAKEFAKEFAKE");
    expect(h.url).not.toContain("AIza"); // المفتاح ليس في الرابط
    expect(h.body).toContain("inlineData");
  });

  it("Anthropic: يستعمل x-api-key وanthropic-version ويقرأ النص", async () => {
    handler = (_r, _b, res) => json(res, 200, { content: [{ type: "text", text: "كلود" }], usage: { input_tokens: 5, output_tokens: 1 } });
    const a = createAdapter(provider({ id: 3, name: "c", kind: "anthropic", baseUrl: base, getApiKey: () => "sk-ant-xxxxxxxx" }));
    const out = await a.chat(chatReq);
    expect(out).toMatchObject({ text: "كلود", inputTokens: 5 });
    const h = hits.at(-1)!;
    expect(h.url).toBe("/v1/messages");
    expect(h.headers["x-api-key"]).toBe("sk-ant-xxxxxxxx");
    expect(h.headers["anthropic-version"]).toBeTruthy();
  });

  it("Ollama: checkReady يميّز: غير منزَّل / جاهز ومحمّل / غير متصل", async () => {
    handler = (req, _b, res) => {
      if (req.url === "/api/tags") return json(res, 200, { models: [{ name: "qwen2.5:3b" }] });
      if (req.url === "/api/ps") return json(res, 200, { models: [] });
      json(res, 404, {});
    };
    const ready = await createAdapter(provider({ id: 4, name: "o", kind: "ollama", baseUrl: base, model: "qwen2.5:3b" })).checkReady();
    expect(ready).toMatchObject({ ready: true, available: true, loaded: false });
    const missing = await createAdapter(provider({ id: 4, name: "o", kind: "ollama", baseUrl: base, model: "llama3" })).checkReady();
    expect(missing).toMatchObject({ ready: false, reason: "model_not_pulled" });
    const down = await createAdapter(provider({ id: 4, name: "o", kind: "ollama", baseUrl: "http://127.0.0.1:1", model: "x" })).checkReady();
    expect(down).toMatchObject({ ready: false, reason: "unreachable" });
  });

  it("Ollama: chat يقرأ الرد", async () => {
    handler = (_r, _b, res) => json(res, 200, { message: { content: "محلي" }, prompt_eval_count: 9, eval_count: 4 });
    const out = await createAdapter(provider({ id: 4, name: "o", kind: "ollama", baseUrl: base })).chat(chatReq);
    expect(out).toMatchObject({ text: "محلي", inputTokens: 9, outputTokens: 4 });
  });
});

describe("تصنيف الأخطاء عبر HTTP", () => {
  const cases: [string, number, unknown, Record<string, string>, string][] = [
    ["نفاد الرصيد", 429, { error: { code: "insufficient_quota", message: "You exceeded your current quota" } }, {}, "quota"],
    ["تجاوز المعدل", 429, { error: { message: "Rate limit reached" } }, { "retry-after": "7" }, "rate_limit"],
    ["مفتاح خاطئ", 401, { error: { message: "Incorrect API key sk-secret-123456" } }, {}, "auth"],
    ["دفع مطلوب", 402, { error: "payment" }, {}, "quota"],
    ["توقف المزود", 503, { error: "overloaded" }, {}, "unavailable"],
    ["نموذج غير موجود", 404, { error: "model not found" }, {}, "bad_request"],
  ];
  it.each(cases)("%s", async (_n, status, body, headers, kind) => {
    handler = (_r, _b, res) => json(res, status, body, headers);
    const a = createAdapter(provider({ id: 1, name: "o", kind: "openai-compatible", baseUrl: base, getApiKey: () => "sk-secret-123456" }));
    const err = (await a.chat(chatReq).catch((e) => e)) as ProviderError;
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.kind).toBe(kind);
    expect(err.message).not.toContain("sk-secret-123456"); // لا تسريب للمفتاح
  });

  it("انتهاء المهلة → timeout", async () => {
    handler = () => {
      /* لا رد */
    };
    const a = createAdapter(provider({ id: 1, name: "o", kind: "openai-compatible", baseUrl: base, timeoutMs: 300 }));
    const err = (await a.chat(chatReq).catch((e) => e)) as ProviderError;
    expect(err.kind).toBe("timeout");
  });

  it("انقطاع الاتصال → network", async () => {
    const a = createAdapter(provider({ id: 1, name: "o", kind: "openai-compatible", baseUrl: "http://127.0.0.1:1" }));
    const err = (await a.chat(chatReq).catch((e) => e)) as ProviderError;
    expect(err.kind).toBe("network");
  });
});

describe("التحويل التلقائي الكامل عبر HTTP حقيقي", () => {
  it("OpenAI ينفد رصيده → Gemini يجيب، وطلب واحد فقط لكل مزود", async () => {
    const seen: string[] = [];
    handler = (req, _b, res) => {
      seen.push(req.url ?? "");
      if (req.url?.startsWith("/openai")) return json(res, 429, { error: { code: "insufficient_quota" } });
      return json(res, 200, { candidates: [{ content: { parts: [{ text: "جاء من Gemini" }] } }] });
    };
    const store = new MemoryStore([
      provider({ id: 1, name: "OpenAI", kind: "openai-compatible", baseUrl: `${base}/openai`, priority: 1 }),
      provider({ id: 2, name: "Gemini", kind: "gemini", baseUrl: `${base}/gemini`, priority: 2, getApiKey: () => "k-gemini-test" }),
    ]);
    const router = new AiRouter({ store, createAdapter, readyTtlMs: 0 });
    const res = await router.run({ task: "explain", request: chatReq });
    expect(res.text).toBe("جاء من Gemini");
    expect(res.provider.name).toBe("Gemini");
    expect(seen.filter((u) => u.startsWith("/openai"))).toHaveLength(1);
    expect(store.failures).toEqual([expect.objectContaining({ id: 1, kind: "quota" })]);

    // الطلب التالي: OpenAI في فترة إيقاف مؤقت → لا يُستدعى أصلاً
    store.providers[0].cooldownUntil = new Date(Date.now() + 60_000);
    seen.length = 0;
    await router.run({ task: "explain", request: chatReq });
    expect(seen.some((u) => u.startsWith("/openai"))).toBe(false);
  });

  it("فشل كل السحابيين + Ollama حقيقي جاهز → يُجيب النموذج المحلي", async () => {
    handler = (req, _b, res) => {
      if (req.url?.startsWith("/cloud")) return json(res, 503, {});
      if (req.url === "/api/tags") return json(res, 200, { models: [{ name: "tiny:1b" }] });
      if (req.url === "/api/ps") return json(res, 200, { models: [{ name: "tiny:1b" }] });
      if (req.url === "/api/chat") return json(res, 200, { message: { content: "رد من Ollama" } });
      json(res, 404, {});
    };
    const store = new MemoryStore([
      provider({ id: 1, name: "Cloud", baseUrl: `${base}/cloud`, priority: 1 }),
      provider({ id: 2, name: "Ollama", kind: "ollama", baseUrl: base, model: "tiny:1b", isLocal: true, priority: 99 }),
    ]);
    const res = await new AiRouter({ store, createAdapter, readyTtlMs: 0 }).run({ task: "text", request: chatReq });
    expect(res.provider).toMatchObject({ name: "Ollama", isLocal: true });
    expect(res.text).toBe("رد من Ollama");
  });
});
