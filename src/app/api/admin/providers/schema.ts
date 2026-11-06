import { z } from "zod";
import { TASKS } from "@/lib/constants";
import { encryptSecret, hasAppSecret, keyHintOf } from "@/server/ai/secrets";
import { ApiError } from "@/server/utils/api";

const kinds = ["openai", "gemini", "anthropic", "openai-compatible", "ollama"] as const;

const base = {
  name: z.string().trim().min(1).max(60),
  kind: z.enum(kinds),
  baseUrl: z
    .string()
    .trim()
    .max(300)
    .refine((v) => v === "" || /^https?:\/\//i.test(v), "يجب أن يبدأ العنوان بـ http:// أو https://")
    .nullable()
    .optional(),
  model: z.string().trim().min(1).max(120),
  apiKeyEnv: z
    .string()
    .trim()
    .max(80)
    .regex(/^[A-Z][A-Z0-9_]*$|^$/, "اسم متغير بيئة بأحرف كبيرة وشرطة سفلية")
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

export const providerCreateSchema = z.object(base);
export const providerPatchSchema = z.object(base).partial();

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
