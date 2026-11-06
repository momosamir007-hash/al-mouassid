import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { aiProviders, aiUsage } from "@/db/schema";
import { createAdapter } from "./providers";
import { DbProviderStore, ensureDefaultProviders, resolveApiKey, rowToRecord, type ProviderRow } from "./store";
import type { ReadyState } from "./types";

export type ProviderState = "disabled" | "no_key" | "cooldown" | "error" | "ready" | "untested" | "not_ready";

export const STATE_AR: Record<ProviderState, string> = {
  disabled: "معطّل",
  no_key: "لا يوجد مفتاح",
  cooldown: "موقوف مؤقتاً بعد خطأ",
  error: "آخر اتصال فشل",
  ready: "جاهز",
  untested: "مفعّل (لم يُختبر بعد)",
  not_ready: "غير جاهز",
};

export interface ProviderStatus {
  row: ProviderRow;
  state: ProviderState;
  local?: ReadyState;
}

/** يحسب حالة كل مزود؛ المحلي يُفحص فعلياً، والسحابي يعتمد على آخر نتيجة (دون إنفاق رصيد). */
export async function getProviderStatuses(): Promise<ProviderStatus[]> {
  await ensureDefaultProviders();
  const rows = await db.select().from(aiProviders).orderBy(aiProviders.priority, aiProviders.id);
  return Promise.all(
    rows.map(async (row): Promise<ProviderStatus> => {
      if (!row.enabled) return { row, state: "disabled" };
      if (row.isLocal) {
        const local = await createAdapter(rowToRecord(row)).checkReady();
        return { row, state: local.ready ? "ready" : "not_ready", local };
      }
      const needsKey = row.kind !== "openai-compatible";
      if (needsKey && !resolveApiKey(row)) return { row, state: "no_key" };
      if (row.cooldownUntil && row.cooldownUntil.getTime() > Date.now()) return { row, state: "cooldown" };
      if (row.status === "ok") return { row, state: "ready" };
      if (row.status === "untested") return { row, state: "untested" };
      return { row, state: "error" };
    }),
  );
}

export async function providerStats(providerId: number) {
  const store = new DbProviderStore();
  const today = await store.usageToday(providerId);
  const errors = await db
    .select({
      at: aiUsage.createdAt,
      kind: aiUsage.errorKind,
      message: aiUsage.errorMessage,
      task: aiUsage.task,
    })
    .from(aiUsage)
    .where(and(eq(aiUsage.providerId, providerId), eq(aiUsage.ok, false)))
    .orderBy(desc(aiUsage.createdAt))
    .limit(5);
  return { today, errors };
}
