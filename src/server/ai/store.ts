import { and, count, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { aiProviders, aiUsage } from "@/db/schema";
import { TASKS, type TaskId } from "@/lib/constants";
import { decryptSecret } from "./secrets";
import type { ErrorKind, ProviderKind, ProviderRecord, ProviderStore, UsageToday } from "./types";

export type ProviderRow = typeof aiProviders.$inferSelect;

export function resolveApiKey(row: ProviderRow): string | null {
  if (row.apiKeyEnc) {
    try {
      return decryptSecret(row.apiKeyEnc);
    } catch {
      return null;
    }
  }
  if (row.apiKeyEnv) return process.env[row.apiKeyEnv] || null;
  return null;
}

export function keySource(row: ProviderRow): "stored" | "env" | "none" {
  if (row.apiKeyEnc) return "stored";
  if (row.apiKeyEnv) return "env";
  return "none";
}

export function rowToRecord(row: ProviderRow): ProviderRecord {
  const tasks = (row.tasks ?? []).filter((t): t is TaskId => (TASKS as readonly string[]).includes(t));
  return {
    id: row.id,
    name: row.name,
    kind: row.kind as ProviderKind,
    baseUrl: row.baseUrl,
    model: row.model,
    priority: row.priority,
    enabled: row.enabled,
    isLocal: row.isLocal,
    tasks,
    supportsVision: row.supportsVision,
    timeoutMs: row.timeoutMs,
    dailyRequestLimit: row.dailyRequestLimit,
    dailyCostLimitUsd: row.dailyCostLimitUsd,
    alertPercent: row.alertPercent,
    costInPer1k: row.costInPer1k,
    costOutPer1k: row.costOutPer1k,
    cooldownUntil: row.cooldownUntil,
    lastLatencyMs: row.lastLatencyMs,
    getApiKey: () => resolveApiKey(row),
  };
}

export function startOfTodayUtc(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

let seeding: Promise<void> | null = null;

/** يبذر مزودين افتراضيين (معطّلون ما لم يوجد مفتاح البيئة) عند فراغ الجدول. */
export function ensureDefaultProviders(): Promise<void> {
  if (!seeding) {
    seeding = (async () => {
      const [{ n }] = await db.select({ n: count() }).from(aiProviders);
      if (n > 0) return;
      const allTasks = [...TASKS];
      await db.insert(aiProviders).values([
        {
          name: "OpenAI",
          kind: "openai",
          model: "gpt-4o-mini",
          apiKeyEnv: "OPENAI_API_KEY",
          priority: 10,
          enabled: Boolean(process.env.OPENAI_API_KEY),
          tasks: allTasks,
          supportsVision: true,
          costInPer1k: 0.00015,
          costOutPer1k: 0.0006,
        },
        {
          name: "Google Gemini",
          kind: "gemini",
          model: "gemini-2.5-flash",
          apiKeyEnv: "GEMINI_API_KEY",
          priority: 20,
          enabled: Boolean(process.env.GEMINI_API_KEY),
          tasks: allTasks,
          supportsVision: true,
        },
        {
          name: "Anthropic Claude",
          kind: "anthropic",
          model: "claude-3-5-haiku-latest",
          apiKeyEnv: "ANTHROPIC_API_KEY",
          priority: 30,
          enabled: Boolean(process.env.ANTHROPIC_API_KEY),
          tasks: allTasks,
          supportsVision: true,
        },
        {
          name: "Ollama (محلي)",
          kind: "ollama",
          baseUrl: process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434",
          model: process.env.OLLAMA_MODEL || "qwen2.5:3b",
          priority: 100,
          enabled: true,
          isLocal: true,
          tasks: allTasks,
          supportsVision: false,
          timeoutMs: 90000,
        },
      ]);
    })().catch((e) => {
      seeding = null;
      throw e;
    });
  }
  return seeding;
}

export class DbProviderStore implements ProviderStore {
  async listProviders(): Promise<ProviderRecord[]> {
    await ensureDefaultProviders();
    const rows = await db.select().from(aiProviders);
    return rows.map(rowToRecord);
  }

  async usageToday(providerId: number): Promise<UsageToday> {
    const [r] = await db
      .select({ n: count(), cost: sql<number>`coalesce(sum(${aiUsage.costUsd}), 0)` })
      .from(aiUsage)
      .where(and(eq(aiUsage.providerId, providerId), gte(aiUsage.createdAt, startOfTodayUtc())));
    return { requests: Number(r?.n ?? 0), costUsd: Number(r?.cost ?? 0) };
  }

  async recordSuccess(
    providerId: number,
    info: {
      task: string;
      userId?: string | null;
      latencyMs: number;
      inputTokens?: number;
      outputTokens?: number;
      costUsd: number | null;
    },
  ): Promise<void> {
    await db.insert(aiUsage).values({
      providerId,
      userId: info.userId ?? null,
      task: info.task,
      ok: true,
      inputTokens: info.inputTokens,
      outputTokens: info.outputTokens,
      costUsd: info.costUsd,
      latencyMs: info.latencyMs,
    });
    await db
      .update(aiProviders)
      .set({ status: "ok", lastOkAt: new Date(), lastLatencyMs: info.latencyMs, cooldownUntil: null })
      .where(eq(aiProviders.id, providerId));
  }

  async recordFailure(
    providerId: number,
    info: {
      task: string;
      userId?: string | null;
      kind: ErrorKind;
      message: string;
      latencyMs: number;
      cooldownMs: number;
    },
  ): Promise<void> {
    const msg = info.message.slice(0, 300);
    await db.insert(aiUsage).values({
      providerId,
      userId: info.userId ?? null,
      task: info.task,
      ok: false,
      errorKind: info.kind,
      errorMessage: msg,
      latencyMs: info.latencyMs,
    });
    await db
      .update(aiProviders)
      .set({
        status: info.kind,
        lastError: msg,
        lastErrorAt: new Date(),
        cooldownUntil: new Date(Date.now() + info.cooldownMs),
      })
      .where(eq(aiProviders.id, providerId));
  }
}
