import { z } from "zod";
import { TASKS } from "@/lib/constants";
import { encryptSecret, hasAppSecret, keyHintOf } from "@/server/ai/secrets";
import { ApiError } from "@/server/utils/api";

const kinds = ["openai", "gemini", "anthropic", "openai-compatible", "ollama"] as const;
const ALLOWED_KEY_ENV = new Set(["OPENAI_API_KEY", "GEMINI_API_KEY", "ANTHROPIC_API_KEY", "GROQ_API_KEY", "OPENROUTER_API_KEY", "HUGGINGFACE_API_KEY", "SAMBANOVA_API_KEY", "GITHUB_TOKEN", "TOGETHER_API_KEY", "NVIDIA_API_KEY", "XAI_API_KEY", "COHERE_API_KEY", "REPLICATE_API_KEY"]);
function validProviderUrl(raw: string, kind?: string): boolean {
  if (!raw) return true;
  try {
    const u = new URL(raw);
    if (u.username || u.password || u.search || u.hash) return false;
    const host = u.hostname.toLowerCase();
    const loopback = host === "127.0.0.1" || host === "localhost" || host === "[::1]";
    const ipLiteral = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.startsWith("[");
    if (kind === "ollama") return loopback && u.protocol === "http:";
    return u.protocol === "https:" && !ipLiteral && host.includes(".") && !host.endsWith(".local") && !host.endsWith(".internal") && host !== "localhost";
  } catch { return false; }
}

const base = {
  name: z.string().trim().min(1).max(60),
  kind: z.enum(kinds),
  baseUrl: z
    .string()
    .trim()
    .max(300)
    .refine((v) => { if (!v) return true; try { const u = new URL(v); return !u.username && !u.password && !u.search && !u.hash && ["http:", "https:"].includes(u.protocol); } catch { return false; } }, "عنوان URL غير صالح")
    .nullable()
    .optional(),
  model: z.string().trim().min(1).max(120),
  apiKeyEnv: z
    .string()
    .trim()
    .max(80)
    .refine((v) => v === "" || ALLOWED_KEY_ENV.has(v), "اسم متغير البيئة غير مسموح؛ اختر متغير مفتاح مزود معتمداً")
    .nullable()
    .optional(),
  /** المفتاح الخام يُقبل عند الإدخال فقط ويُشفَّر ولا يُعاد أبداً. */
  apiKey: z.string().trim().max(500).optional(),
  clearKey: z.boolean().optional(),
  priority: z.number().int().min(1).max(1000).default(100),
  enabled: z.boolean().default(false),
  isLocal: z.boolean().default(false),
  tasks: z.array(z.enum(TASKS)).min(1).default([...TASKS]),
  supportsVision: z.boolean().default(false),
  timeoutMs: z.number().int().min(2000).max(180000).default(30000),
  dailyRequestLimit: z.number().int().min(1).nullable().optional(),
  dailyCostLimitUsd: z.number().min(0).nullable().optional(),
  alertPercent: z.number().int().min(1).max(100).default(80),
  costInPer1k: z.number().min(0).nullable().optional(),
  costOutPer1k: z.number().min(0).nullable().optional(),
};

export const providerCreateSchema = z.object(base).superRefine((v, ctx) => {
  if (v.baseUrl && !validProviderUrl(v.baseUrl, v.kind)) ctx.addIssue({ code: "custom", path: ["baseUrl"], message: "عنوان المزود غير آمن أو لا يطابق نوع المزود" });
});
export const providerPatchSchema = z.object(base).partial().superRefine((v, ctx) => {
  if (v.baseUrl && !v.kind) ctx.addIssue({ code: "custom", path: ["kind"], message: "أرسل نوع المزود مع عنوانه للتحقق من سلامة الوجهة" });
  if (v.baseUrl && v.kind && !validProviderUrl(v.baseUrl, v.kind)) ctx.addIssue({ code: "custom", path: ["baseUrl"], message: "عنوان المزود غير آمن أو لا يطابق نوع المزود" });
});

type Input = Partial<z.infer<typeof providerCreateSchema>>;

function secretFields(input: Input) {
  const out: { apiKeyEnc?: string | null; keyHint?: string | null; apiKeyEnv?: string | null } = {};
  if (input.clearKey) {
    out.apiKeyEnc = null;
    out.keyHint = null;
  }
  if (input.apiKey) {
    if (!hasAppSecret()) {
      throw new ApiError(
        400,
        "لا يمكن حفظ مفتاح في قاعدة البيانات لأن APP_SECRET غير مضبوط. ضع المفتاح في متغير بيئة واذكر اسمه في «اسم متغير البيئة».",
        "no_app_secret",
      );
    }
    out.apiKeyEnc = encryptSecret(input.apiKey);
    out.keyHint = keyHintOf(input.apiKey);
  }
  if (input.apiKeyEnv !== undefined) out.apiKeyEnv = input.apiKeyEnv || null;
  return out;
}

function common(input: Input) {
  return {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.kind !== undefined ? { kind: input.kind } : {}),
    ...(input.baseUrl !== undefined ? { baseUrl: input.baseUrl || null } : {}),
    ...(input.model !== undefined ? { model: input.model } : {}),
    ...(input.priority !== undefined ? { priority: input.priority } : {}),
    ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
    ...(input.isLocal !== undefined ? { isLocal: input.isLocal } : {}),
    ...(input.tasks !== undefined ? { tasks: input.tasks } : {}),
    ...(input.supportsVision !== undefined ? { supportsVision: input.supportsVision } : {}),
    ...(input.timeoutMs !== undefined ? { timeoutMs: input.timeoutMs } : {}),
    ...(input.dailyRequestLimit !== undefined ? { dailyRequestLimit: input.dailyRequestLimit } : {}),
    ...(input.dailyCostLimitUsd !== undefined ? { dailyCostLimitUsd: input.dailyCostLimitUsd } : {}),
    ...(input.alertPercent !== undefined ? { alertPercent: input.alertPercent } : {}),
    ...(input.costInPer1k !== undefined ? { costInPer1k: input.costInPer1k } : {}),
    ...(input.costOutPer1k !== undefined ? { costOutPer1k: input.costOutPer1k } : {}),
  };
}

export function toInsertValues(input: z.infer<typeof providerCreateSchema>) {
  return {
    ...common(input),
    ...secretFields(input),
    name: input.name,
    kind: input.kind,
    model: input.model,
    tasks: input.tasks,
    // إن كان المزود محلياً (Ollama) نعيّنه محلياً تلقائياً
    isLocal: input.isLocal || input.kind === "ollama",
  };
}

export function toPatchValues(input: Input) {
  return { ...common(input), ...secretFields(input) };
}
