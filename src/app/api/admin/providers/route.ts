import { db } from "@/db";
import { aiProviders } from "@/db/schema";
import { currentPolicy } from "@/server/ai";
import { hasAppSecret } from "@/server/ai/secrets";
import { getProviderStatuses, providerStats, STATE_AR } from "@/server/ai/status";
import { keySource } from "@/server/ai/store";
import { requireAdmin } from "@/server/auth/session";
import { handle, ok, parseBody } from "@/server/utils/api";
import { providerCreateSchema, toInsertValues } from "./schema";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle("admin.providers.list", async () => {
    await requireAdmin();
    const statuses = await getProviderStatuses();
    const providers = await Promise.all(
      statuses.map(async ({ row, state, local }) => {
        const stats = await providerStats(row.id);
        const reqPct = row.dailyRequestLimit ? Math.round((stats.today.requests / row.dailyRequestLimit) * 100) : null;
        const costPct = row.dailyCostLimitUsd ? Math.round((stats.today.costUsd / row.dailyCostLimitUsd) * 100) : null;
        const pct = Math.max(reqPct ?? 0, costPct ?? 0);
        return {
          id: row.id,
          name: row.name,
          kind: row.kind,
          baseUrl: row.baseUrl,
          model: row.model,
          priority: row.priority,
          enabled: row.enabled,
          isLocal: row.isLocal,
          tasks: row.tasks,
          supportsVision: row.supportsVision,
          timeoutMs: row.timeoutMs,
          dailyRequestLimit: row.dailyRequestLimit,
          dailyCostLimitUsd: row.dailyCostLimitUsd,
          alertPercent: row.alertPercent,
          costInPer1k: row.costInPer1k,
          costOutPer1k: row.costOutPer1k,
          state,
          stateAr: STATE_AR[state],
          local,
          lastError: row.lastError,
          lastErrorAt: row.lastErrorAt,
          lastOkAt: row.lastOkAt,
          lastLatencyMs: row.lastLatencyMs,
          lastCheckedAt: row.lastCheckedAt,
          cooldownUntil: row.cooldownUntil,
          // لا نُرجع المفتاح أبداً؛ فقط مصدره وآخر 4 أحرف
          key: {
            source: keySource(row),
            hint: row.keyHint,
            envName: keySource(row) === "env" ? row.apiKeyEnv : null,
            envPresent: row.apiKeyEnv ? Boolean(process.env[row.apiKeyEnv]) : false,
          },
          usageToday: { requests: stats.today.requests, costUsd: stats.today.costUsd, percent: pct, alert: pct >= row.alertPercent && pct > 0 },
          recentErrors: stats.errors,
        };
      }),
    );
    return ok({ providers, policy: currentPolicy(), canStoreKeys: hasAppSecret() });
  });
}

export async function POST(req: Request) {
  return handle("admin.providers.create", async () => {
    await requireAdmin();
    const body = await parseBody(req, providerCreateSchema);
    const [row] = await db.insert(aiProviders).values(toInsertValues(body)).returning({ id: aiProviders.id });
    return ok({ id: row.id }, 201);
  });
}
