import { eq } from "drizzle-orm";
import { db } from "@/db";
import { aiProviders } from "@/db/schema";
import { ProviderError, redactSecret } from "@/server/ai/errors";
import { createAdapter } from "@/server/ai/providers";
import { reasonAr } from "@/server/ai/explain";
import { DbProviderStore, resolveApiKey, rowToRecord } from "@/server/ai/store";
import { requireAdmin } from "@/server/auth/session";
import { ApiError, handle, ok } from "@/server/utils/api";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** اختبار اتصال حقيقي: فحص الجاهزية ثم طلب صغير جداً (يستهلك بضعة رموز). */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle("admin.providers.test", async () => {
    const admin = await requireAdmin();
    const id = Number((await ctx.params).id);
    if (!Number.isInteger(id)) throw new ApiError(400, "معرّف غير صالح", "bad_id");
    const [row] = await db.select().from(aiProviders).where(eq(aiProviders.id, id)).limit(1);
    if (!row) throw new ApiError(404, "المزود غير موجود", "not_found");

    const store = new DbProviderStore();
    const adapter = createAdapter(rowToRecord(row));
    const ready = await adapter.checkReady();
    if (!ready.ready) {
      await db
        .update(aiProviders)
        .set({ status: row.isLocal ? "not_ready" : "auth", lastError: `غير جاهز: ${reasonAr(`not_ready:${ready.reason}`)}`, lastErrorAt: new Date(), lastCheckedAt: new Date() })
        .where(eq(aiProviders.id, id));
      return ok({ ok: false, stage: "ready", reason: ready.reason, message: reasonAr(`not_ready:${ready.reason}`), local: ready });
    }

    const started = Date.now();
    let out;
    try {
      out = await adapter.chat({ system: "Reply with the single word OK.", messages: [{ role: "user", content: "ping" }], maxTokens: 256, temperature: 0 });
    } catch (e) {
      const err = e instanceof ProviderError ? e : new ProviderError("unknown", redactSecret((e as Error).message, resolveApiKey(row)));
      try { await store.recordFailure(id, { task: "test", userId: admin.id, kind: err.kind, message: err.message, latencyMs: Date.now() - started, cooldownMs: 0 }); } catch { /* لا نخفي نتيجة الاختبار بسبب فشل التسجيل */ }
      await db.update(aiProviders).set({ lastCheckedAt: new Date() }).where(eq(aiProviders.id, id));
      return ok({ ok: false, stage: "chat", kind: err.kind, message: err.message });
    }
    const latencyMs = Date.now() - started;
    const costUsd = out.inputTokens != null && out.outputTokens != null && row.costInPer1k != null && row.costOutPer1k != null
      ? (out.inputTokens / 1000) * row.costInPer1k + (out.outputTokens / 1000) * row.costOutPer1k : null;
    try { await store.recordSuccess(id, { task: "test", userId: admin.id, latencyMs, inputTokens: out.inputTokens, outputTokens: out.outputTokens, costUsd }); }
    catch { /* الاتصال نجح حتى لو تعذر تسجيل الاستهلاك */ }
    await db.update(aiProviders).set({ lastCheckedAt: new Date() }).where(eq(aiProviders.id, id));
    return ok({ ok: true, latencyMs, local: ready });
  });
}
