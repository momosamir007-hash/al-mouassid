import { getRouter, NoProviderAvailableError } from "@/server/ai";
import { publicAttempts } from "@/server/ai/explain";
import { requireAdmin } from "@/server/auth/session";
import { handle, ok } from "@/server/utils/api";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

/** اختبار الموجّه كاملاً (التحويل التلقائي): يعرض كل محاولة وسبب التخطي أو الفشل. */
export async function POST() {
  return handle("admin.router-test", async () => {
    const admin = await requireAdmin();
    try {
      const res = await getRouter().run({
        task: "text",
        userId: admin.id,
        request: {
          system: "Reply with the single word OK.",
          messages: [{ role: "user", content: "ping" }],
          maxTokens: 256,
          temperature: 0,
        },
      });
      return ok({ ok: true, provider: res.provider, latencyMs: res.latencyMs, attempts: publicAttempts(res.attempts) });
    } catch (e) {
      if (e instanceof NoProviderAvailableError) {
        return ok({ ok: false, code: e.code, attempts: publicAttempts(e.attempts) });
      }
      throw e;
    }
  });
}
