import { describe, expect, it } from "vitest";
import { ProviderError } from "@/server/ai/errors";
import { AiRouter, NoProviderAvailableError, orderProviders } from "@/server/ai/router";
import type { ChatRequest, ProviderAdapter } from "@/server/ai/types";
import { fakeAdapter, MemoryStore, provider } from "./helpers";

const req: ChatRequest = { system: "s", messages: [{ role: "user", content: "hi" }] };

function makeRouter(
  store: MemoryStore,
  adapters: Record<number, ProviderAdapter>,
  policy: "quality" | "cost" | "speed" = "quality",
  now?: () => number,
) {
  return new AiRouter({ store, createAdapter: (p) => adapters[p.id], policy, readyTtlMs: 0, now });
}

const fail = (kind: ConstructorParameters<typeof ProviderError>[0]) => async () => {
  throw new ProviderError(kind, `simulated ${kind}`);
};

describe("AI Router — التحويل التلقائي", () => {
  it("يستخدم المزود الأساسي عند نجاحه", async () => {
    const a = fakeAdapter(async () => "من الأول");
    const b = fakeAdapter(async () => "من الثاني");
    const store = new MemoryStore([provider({ id: 1, name: "A", priority: 1 }), provider({ id: 2, name: "B", priority: 2 })]);
    const res = await makeRouter(store, { 1: a, 2: b }).run({ task: "explain", request: req });
    expect(res.provider.name).toBe("A");
    expect(b.calls).toBe(0);
  });

  it.each(["quota", "rate_limit", "auth", "unavailable", "network", "timeout"] as const)(
    "ينتقل إلى البديل عند الخطأ القابل للتحويل: %s — ولا يعيد الطلب للمزود نفسه",
    async (kind) => {
      const a = fakeAdapter(fail(kind));
      const b = fakeAdapter(async () => "من البديل");
      const store = new MemoryStore([provider({ id: 1, name: "A", priority: 1 }), provider({ id: 2, name: "B", priority: 2 })]);
      const res = await makeRouter(store, { 1: a, 2: b }).run({ task: "explain", request: req });
      expect(res.text).toBe("من البديل");
      expect(a.calls).toBe(1); // محاولة واحدة فقط — لا إعادة إرسال عشوائية
      expect(store.failures[0]).toMatchObject({ id: 1, kind });
      expect(store.failures[0].cooldownMs).toBeGreaterThan(0);
      expect(res.attempts.map((x) => x.outcome)).toEqual(["failed", "success"]);
    },
  );


  it("ينتقل إلى البديل إذا رمى فحص الجاهزية استثناءً", async () => {
    const broken = {
      async checkReady() { throw new Error("readiness crashed"); },
      async chat() { throw new Error("must not be called"); },
    } as unknown as ProviderAdapter;
    const good = fakeAdapter(async () => "البديل يعمل");
    const store = new MemoryStore([provider({ id: 1, name: "Broken", priority: 1 }), provider({ id: 2, name: "Good", priority: 2 })]);
    const result = await makeRouter(store, { 1: broken, 2: good }).run({ task: "explain", request: req });
    expect(result.text).toBe("البديل يعمل");
    expect(result.attempts[0].outcome).toBe("failed");
  });

  it("لا يهدر إجابة ناجحة إذا فشل تسجيل الاستهلاك", async () => {
    const good = fakeAdapter(async () => "إجابة ناجحة");
    const store = new MemoryStore([provider({ id: 1, name: "Good" })]);
    store.recordSuccess = async () => { throw new Error("database write failed"); };
    const result = await makeRouter(store, { 1: good }).run({ task: "explain", request: req });
    expect(result.text).toBe("إجابة ناجحة");
    expect(good.calls).toBe(1);
  });

  it("يتخطى المزود الموقوف مؤقتاً (cooldown) دون استدعائه", async () => {
    const a = fakeAdapter(async () => "x");
    const b = fakeAdapter(async () => "من B");
    const store = new MemoryStore([
      provider({ id: 1, name: "A", priority: 1, cooldownUntil: new Date(Date.now() + 60_000) }),
      provider({ id: 2, name: "B", priority: 2 }),
    ]);
    const res = await makeRouter(store, { 1: a, 2: b }).run({ task: "text", request: req });
    expect(a.calls).toBe(0);
    expect(res.attempts[0]).toMatchObject({ outcome: "skipped", reason: "cooldown" });
  });

  it("يحترم الحد اليومي للطلبات والتكلفة", async () => {
    const a = fakeAdapter(async () => "x");
    const b = fakeAdapter(async () => "x");
    const c = fakeAdapter(async () => "من C");
    const store = new MemoryStore([
      provider({ id: 1, name: "A", priority: 1, dailyRequestLimit: 5 }),
      provider({ id: 2, name: "B", priority: 2, dailyCostLimitUsd: 1 }),
      provider({ id: 3, name: "C", priority: 3 }),
    ]);
    store.usage.set(1, { requests: 5, costUsd: 0 });
    store.usage.set(2, { requests: 1, costUsd: 1.5 });
    const res = await makeRouter(store, { 1: a, 2: b, 3: c }).run({ task: "text", request: req });
    expect(res.provider.name).toBe("C");
    expect(res.attempts.map((x) => x.reason)).toEqual(["limit_requests", "limit_cost", undefined]);
  });

  it("يتخطى المزودين المعطلين أو غير الداعمين للمهمة", async () => {
    const a = fakeAdapter(async () => "x");
    const b = fakeAdapter(async () => "x");
    const c = fakeAdapter(async () => "من C");
    const store = new MemoryStore([
      provider({ id: 1, name: "A", priority: 1, enabled: false }),
      provider({ id: 2, name: "B", priority: 2, tasks: ["math"] }),
      provider({ id: 3, name: "C", priority: 3 }),
    ]);
    const res = await makeRouter(store, { 1: a, 2: b, 3: c }).run({ task: "verify", request: req });
    expect(res.provider.name).toBe("C");
    expect(a.calls + b.calls).toBe(0);
  });

  it("السحابي أولاً ثم المحلي احتياطاً (سياسة الجودة) والمحلي لا يُستخدم قبل التحقق من جاهزيته", async () => {
    const cloud = fakeAdapter(fail("quota"));
    const local = fakeAdapter(async () => "محلي", false); // غير جاهز
    const store = new MemoryStore([
      provider({ id: 1, name: "سحابي", priority: 10 }),
      provider({ id: 2, name: "محلي", priority: 1, isLocal: true, kind: "ollama" }),
    ]);
    const err = await makeRouter(store, { 1: cloud, 2: local })
      .run({ task: "explain", request: req })
      .catch((e) => e);
    expect(err).toBeInstanceOf(NoProviderAvailableError);
    expect(err.code).toBe("all_failed");
    expect(local.calls).toBe(0); // لم يُستدعَ لأنه غير جاهز
    expect(err.attempts[1]).toMatchObject({ outcome: "skipped", reason: "not_ready:unreachable", isLocal: true });
  });

  it("يستخدم النموذج المحلي عند نفاد رصيد السحابي إذا كان جاهزاً فعلاً", async () => {
    const cloud = fakeAdapter(fail("quota"));
    const local = fakeAdapter(async () => "إجابة محلية");
    const store = new MemoryStore([
      provider({ id: 1, name: "سحابي", priority: 10 }),
      provider({ id: 2, name: "محلي", priority: 1, isLocal: true, kind: "ollama" }),
    ]);
    const res = await makeRouter(store, { 1: cloud, 2: local }).run({ task: "explain", request: req });
    expect(res.provider).toMatchObject({ name: "محلي", isLocal: true });
  });

  it("لا مزودين مفعّلين → none_configured ولا يخترع إجابة", async () => {
    const store = new MemoryStore([provider({ id: 1, name: "A", enabled: false })]);
    const err = await makeRouter(store, { 1: fakeAdapter(async () => "x") })
      .run({ task: "text", request: req })
      .catch((e) => e);
    expect(err).toBeInstanceOf(NoProviderAvailableError);
    expect(err.code).toBe("none_configured");
  });

  it("الصورة تُرسل لمزود الرؤية فقط، ويُنزَل لغيره النص وحده", async () => {
    const text = fakeAdapter(async () => "نصي");
    const vision = fakeAdapter(fail("unavailable"));
    const store = new MemoryStore([
      provider({ id: 1, name: "نصي", priority: 1 }),
      provider({ id: 2, name: "رؤية", priority: 5, supportsVision: true }),
    ]);
    const withImage: ChatRequest = { ...req, images: [{ mime: "image/png", data: "AAAA" }] };
    const res = await makeRouter(store, { 1: text, 2: vision }).run({ task: "text", request: withImage });
    expect(vision.lastImages).toBe(1); // جُرّب أولاً رغم أولويته الأقل
    expect(text.lastImages).toBeUndefined(); // لم تصل الصورة للنموذج النصي
    expect(res.imageRequested).toBe(true);
    expect(res.imageUsed).toBe(false);
  });

  it("يحسب التكلفة من الرموز عند توفر الأسعار", async () => {
    const a = fakeAdapter(async () => "x");
    const store = new MemoryStore([provider({ id: 1, name: "A", costInPer1k: 0.01, costOutPer1k: 0.02 })]);
    await makeRouter(store, { 1: a }).run({ task: "text", request: req });
    expect(store.successes[0].costUsd).toBeCloseTo(0.002, 6);
  });
});

describe("سياسات الاختيار", () => {
  const list = [
    provider({ id: 1, name: "غالي", priority: 1, costInPer1k: 0.01, costOutPer1k: 0.03, lastLatencyMs: 900 }),
    provider({ id: 2, name: "رخيص", priority: 2, costInPer1k: 0.0001, costOutPer1k: 0.0002, lastLatencyMs: 300 }),
    provider({ id: 3, name: "محلي", priority: 3, isLocal: true, lastLatencyMs: 2000 }),
  ];
  it("quality: بالأولوية والمحلي أخيراً", () => {
    expect(orderProviders(list, "quality", false).map((p) => p.name)).toEqual(["غالي", "رخيص", "محلي"]);
  });
  it("cost: المحلي ثم الأرخص", () => {
    expect(orderProviders(list, "cost", false).map((p) => p.name)).toEqual(["محلي", "رخيص", "غالي"]);
  });
  it("speed: الأقل زمن استجابة", () => {
    expect(orderProviders(list, "speed", false).map((p) => p.name)).toEqual(["رخيص", "غالي", "محلي"]);
  });
});
