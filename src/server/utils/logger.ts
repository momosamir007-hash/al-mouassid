import { redactSecret } from "@/server/ai/errors";

/** تسجيل أخطاء تقنية فقط: لا نصوص تمارين ولا كلمات مرور ولا مفاتيح. */
export function logError(scope: string, err: unknown, meta?: Record<string, string | number | boolean | null | undefined>) {
  const e = err as { name?: string; message?: string; code?: string };
  const msg = redactSecret(String(e?.message ?? err)).slice(0, 300);
  console.error(`[${scope}]`, e?.name ?? "Error", e?.code ?? "", msg, meta ? JSON.stringify(meta) : "");
}
