import { count, eq, sql } from "drizzle-orm";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { LEVEL_IDS } from "@/lib/constants";
import { hashPassword } from "@/server/auth/password";
import { startSession } from "@/server/auth/session";
import { ApiError, clientIp, handle, ok, parseBody } from "@/server/utils/api";
import { rateLimit } from "@/server/utils/ratelimit";

export const dynamic = "force-dynamic";
const schema = z.object({
  email: z.string().trim().toLowerCase().email().max(120),
  password: z.string().min(8, "كلمة المرور 8 أحرف على الأقل").max(100),
  name: z.string().trim().min(1).max(40),
  level: z.enum(LEVEL_IDS).optional(),
  bootstrapToken: z.string().max(200).optional(),
});
function tokenMatches(provided: string | undefined, expected: string | undefined): boolean {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided); const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  return handle("auth.register", async () => {
    if (!(await rateLimit(`register:${clientIp(req)}`, 8, 15 * 60_000))) throw new ApiError(429, "محاولات كثيرة، حاول لاحقاً.", "rate_limited");
    const body = await parseBody(req, schema);
    const passwordHash = await hashPassword(body.password);
    const bootstrapSecret = process.env.BOOTSTRAP_ADMIN_TOKEN;
    const wantsAdmin = tokenMatches(body.bootstrapToken, bootstrapSecret);

    // قفل PostgreSQL يمنع تسجيلين متزامنين من استهلاك رمز التأسيس أو إنشاء مديرين أوليين.
    const user = await db.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(741852963)`);
      const [existing] = await tx.select({ id: users.id }).from(users).where(eq(users.email, body.email)).limit(1);
      if (existing) throw new ApiError(409, "هذا البريد مسجّل مسبقاً.", "email_taken");
      const [{ n: adminCount }] = await tx.select({ n: count() }).from(users).where(eq(users.role, "admin"));
      const role = wantsAdmin && adminCount === 0 ? "admin" : "learner";
      const [created] = await tx.insert(users).values({ email: body.email, name: body.name, passwordHash, role, defaultLevel: body.level ?? null }).returning();
      return created;
    });
    await startSession(user.id);
    return ok({ user: { id: user.id, email: user.email, name: user.name, role: user.role, defaultLevel: user.defaultLevel } }, 201);
  });
}
