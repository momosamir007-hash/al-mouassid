import { sql } from "drizzle-orm";
import { db } from "@/db";
import { currentPolicy } from "@/server/ai";
import { getProviderStatuses, STATE_AR } from "@/server/ai/status";
import { ApiError, clientIp, handle, ok } from "@/server/utils/api";
import { rateLimit } from "@/server/utils/ratelimit";

export const dynamic = "force-dynamic";

/** حالة الخدمات (عامة): لا تتضمن أسراراً ولا تفاصيل أخطاء داخلية. */
export async function GET(req: Request) {
  return handle("status", async () => {
    let dbOk = true;
    try {
      await db.execute(sql`select 1`);
    } catch {
      dbOk = false;
    }
    if (dbOk && !(await rateLimit(`status:${clientIp(req)}`, 30, 10 * 60_000))) throw new ApiError(429, "طلبات حالة كثيرة؛ حاول بعد قليل.", "rate_limited");
    let providers: {
      id: number;
      name: string;
      kind: string;
      isLocal: boolean;
      supportsVision: boolean;
      state: string;
      stateAr: string;
      local?: { available?: boolean; loaded?: boolean; ready: boolean; reason?: string };
    }[] = [];
    if (dbOk) {
      const statuses = await getProviderStatuses();
      providers = statuses.map((s) => ({
        id: s.row.id,
        name: s.row.name,
        kind: s.row.kind,
        isLocal: s.row.isLocal,
        supportsVision: s.row.supportsVision,
        state: s.state,
        stateAr: STATE_AR[s.state],
        local: s.local,
      }));
    }
    return ok({
      time: new Date().toISOString(),
      database: dbOk,
      policy: currentPolicy(),
      aiAvailable: providers.some((p) => p.state === "ready" || p.state === "untested"),
      providers,
    });
  });
}
