import { createHash } from "node:crypto";
import { lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { apiRateLimits } from "@/db/schema";

/** محدد معدل ذري ومشترك بين نسخ Serverless عبر PostgreSQL. */
let lastCleanup = 0;
export async function rateLimit(key: string, max: number, windowMs: number): Promise<boolean> {
  const hashedKey = createHash("sha256").update(key).digest("hex");
  const now = new Date();
  const cutoff = new Date(now.getTime() - windowMs);
  const result = await db.insert(apiRateLimits).values({ key: hashedKey, windowStart: now, hits: 1 })
    .onConflictDoUpdate({
      target: apiRateLimits.key,
      set: {
        windowStart: sql`CASE WHEN ${apiRateLimits.windowStart} <= ${cutoff} THEN ${now} ELSE ${apiRateLimits.windowStart} END`,
        hits: sql`CASE WHEN ${apiRateLimits.windowStart} <= ${cutoff} THEN 1 ELSE ${apiRateLimits.hits} + 1 END`,
      },
    }).returning({ hits: apiRateLimits.hits });
  if (now.getTime() - lastCleanup > 60 * 60_000) {
    lastCleanup = now.getTime();
    await db.delete(apiRateLimits).where(lt(apiRateLimits.windowStart, new Date(now.getTime() - 24 * 60 * 60_000)));
  }
  return Number(result[0]?.hits ?? max + 1) <= max;
}
