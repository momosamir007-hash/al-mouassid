import { and, count, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { aiProviders, aiUsage } from "@/db/schema";
import { TASKS, type TaskId } from "@/lib/constants";
import { decryptSecret } from "./secrets";
import type { ErrorKind, ProviderKind, ProviderRecord, ProviderStore, UsageToday } from "./types";

export type ProviderRow = typeof aiProviders.$inferSelect;

const ALLOWED_PROVIDER_ENV = new Set(["OPENAI_API_KEY", "GEMINI_API_KEY", "ANTHROPIC_API_KEY", "GROQ_API_KEY", "OPENROUTER_API_KEY", "HUGGINGFACE_API_KEY", "SAMBANOVA_API_KEY", "GITHUB_TOKEN", "TOGETHER_API_KEY", "NVIDIA_API_KEY", "XAI_API_KEY", "COHERE_API_KEY", "REPLICATE_API_KEY"]);
export function resolveApiKey(row: ProviderRow): string | null {
  if (row.apiKeyEnc) {
    try {
      return decryptSecret(row.apiKeyEnc);
    } catch {
      return null;
    }
  }
  if (row.apiKeyEnv && ALLOWED_PROVIDER_ENV.has(row.apiKeyEnv)) return process.env[row.apiKeyEnv] || null;
  return null;
}

export function keySource(row: ProviderRow): "stored" | "env" | "none" {
  if (row.apiKeyEnc) return "stored";
  if (row.apiKeyEnv && ALLOWED_PROVIDER_ENV.has(row.apiKeyEnv)) return "env";
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
      await db.transaction(async tx => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(741852964)`);
        const [{ n }] = await tx.select({ n: count() }).from(aiProviders);
        if (n > 0) return;
        const allTasks = [...TASKS];
        await tx.insert(aiProviders).values([
        {
          name: "Groq Vision (Llama 4 - قراءة الصور والكاميرا)",
          kind: "openai-compatible",
          baseUrl: "https://api.groq.com/openai/v1",
          model: "meta-llama/llama-4-scout-17b-16e-instruct",
          apiKeyEnv: "GROQ_API_KEY",
          priority: 10,
          enabled: Boolean(process.env.GROQ_API_KEY),
          tasks: allTasks,
          supportsVision: true,
        },
        {
          name: "Groq Fast (Llama 3.3 70B - نصوص ورياضيات)",
          kind: "openai-compatible",
          baseUrl: "https://api.groq.com/openai/v1",
          model: "llama-3.3-70b-versatile",
          apiKeyEnv: "GROQ_API_KEY",
          priority: 15,
          enabled: Boolean(process.env.GROQ_API_KEY),
          tasks: allTasks,
          supportsVision: false,
        },
        {
          name: "Google AI Studio (Gemini 2.5 Flash)",
          kind: "gemini",
          model: "gemini-2.5-flash",
          apiKeyEnv: "GEMINI_API_KEY",
          priority: 20,
          enabled: Boolean(process.env.GEMINI_API_KEY),
          tasks: allTasks,
          supportsVision: true,
        },
        {
          name: "OpenRouter (رؤية + نصوص)",
          kind: "openai-compatible",
          baseUrl: "https://openrouter.ai/api/v1",
          model: "google/gemma-3-27b-it:free",
          apiKeyEnv: "OPENROUTER_API_KEY",
          priority: 25,
          enabled: Boolean(process.env.OPENROUTER_API_KEY),
          tasks: allTasks,
          supportsVision: true,
        },
        {
          name: "Hugging Face (Qwen 2.5 VL - رؤية ونصوص)",
          kind: "openai-compatible",
          baseUrl: "https://router.huggingface.co/v1",
          model: "Qwen/Qwen2.5-VL-72B-Instruct",
          apiKeyEnv: "HUGGINGFACE_API_KEY",
          priority: 30,
          enabled: Boolean(process.env.HUGGINGFACE_API_KEY),
          tasks: allTasks,
          supportsVision: true,
        },
        {
          name: "SambaNova (Llama 4 Maverick - رؤية ونصوص)",
          kind: "openai-compatible",
          baseUrl: "https://api.sambanova.ai/v1",
          model: "Llama-4-Maverick-17B-128E-Instruct",
          apiKeyEnv: "SAMBANOVA_API_KEY",
          priority: 35,
          enabled: Boolean(process.env.SAMBANOVA_API_KEY),
          tasks: allTasks,
          supportsVision: true,
        },
        {
          name: "GitHub Models (GPT-4o mini - رؤية ونصوص)",
          kind: "openai-compatible",
          baseUrl: "https://models.inference.ai.azure.com",
          model: "gpt-4o-mini",
          apiKeyEnv: "GITHUB_TOKEN",
          priority: 40,
          enabled: Boolean(process.env.GITHUB_TOKEN),
          tasks: allTasks,
          supportsVision: true,
        },
        {
          name: "Together AI (Llama Vision - رؤية ونصوص)",
          kind: "openai-compatible",
          baseUrl: "https://api.together.xyz/v1",
          model: "meta-llama/Llama-Vision-Free",
          apiKeyEnv: "TOGETHER_API_KEY",
          priority: 45,
          enabled: Boolean(process.env.TOGETHER_API_KEY),
          tasks: allTasks,
          supportsVision: true,
        },
        {
          name: "NVIDIA NIM (Llama 3.2 90B Vision - رؤية ونصوص)",
          kind: "openai-compatible",
          baseUrl: "https://integrate.api.nvidia.com/v1",
          model: "meta/llama-3.2-90b-vision-instruct",
          apiKeyEnv: "NVIDIA_API_KEY",
          priority: 50,
          enabled: Boolean(process.env.NVIDIA_API_KEY),
          tasks: allTasks,
          supportsVision: true,
        },
        {
          name: "xAI Grok (رؤية ونصوص)",
          kind: "openai-compatible",
          baseUrl: "https://api.x.ai/v1",
          model: "grok-2-vision-latest",
          apiKeyEnv: "XAI_API_KEY",
          priority: 55,
          enabled: Boolean(process.env.XAI_API_KEY),
          tasks: allTasks,
          supportsVision: true,
        },
        {
          name: "Cohere (Command A - نصوص وعربية)",
          kind: "openai-compatible",
          baseUrl: "https://api.cohere.ai/compatibility/v1",
          model: "command-a-03-2025",
          apiKeyEnv: "COHERE_API_KEY",
          priority: 60,
          enabled: Boolean(process.env.COHERE_API_KEY),
          tasks: allTasks,
          supportsVision: false,
        },
        {
          name: "Replicate (Llama 3 70B)",
          kind: "openai-compatible",
          baseUrl: "https://api.replicate.com/v1",
          model: "meta/meta-llama-3-70b-instruct",
          apiKeyEnv: "REPLICATE_API_KEY",
          priority: 65,
          enabled: Boolean(process.env.REPLICATE_API_KEY),
          tasks: allTasks,
          supportsVision: false,
        },
        {
          name: "Pollinations AI (مجاني بدون مفتاح)",
          kind: "openai-compatible",
          baseUrl: "https://text.pollinations.ai/openai",
          model: "openai",
          priority: 90,
          enabled: true,
          status: "ok",
          tasks: allTasks,
          supportsVision: false,
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
          costInPer1k: 0,
          costOutPer1k: 0,
        },
        ]);
      });
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
    await db.transaction(async tx => {
      await tx.insert(aiUsage).values({ providerId, userId: info.userId ?? null, task: info.task, ok: true,
        inputTokens: info.inputTokens, outputTokens: info.outputTokens, costUsd: info.costUsd, latencyMs: info.latencyMs });
      await tx.update(aiProviders).set({ status: "ok", lastOkAt: new Date(), lastLatencyMs: info.latencyMs, cooldownUntil: null })
        .where(eq(aiProviders.id, providerId));
    });
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
    await db.transaction(async tx => {
      await tx.insert(aiUsage).values({ providerId, userId: info.userId ?? null, task: info.task, ok: false,
        errorKind: info.kind, errorMessage: msg, latencyMs: info.latencyMs });
      await tx.update(aiProviders).set({ status: info.kind, lastError: msg, lastErrorAt: new Date(),
        cooldownUntil: new Date(Date.now() + info.cooldownMs) }).where(eq(aiProviders.id, providerId));
    });
  }
}
