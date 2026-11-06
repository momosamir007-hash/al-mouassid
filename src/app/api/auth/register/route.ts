import { count, eq } from "drizzle-orm";
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
});

export async function POST(req: Request) {
  return handle("auth.register", async () => {
    if (!rateLimit(`register:${clientIp(req)}`, 10, 15 * 60_000)) {
      throw new ApiError(429, "محاولات كثيرة، حاول لاحقاً.", "rate_limited");
    }
    const body = await parseBody(req, schema);
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, body.email)).limit(1);
    if (existing) throw new ApiError(409, "هذا البريد مسجّل مسبقاً.", "email_taken");

    const [{ n }] = await db.select({ n: count() }).from(users);
    const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const role = n === 0 || (adminEmail && adminEmail === body.email) ? "admin" : "learner";

    const [user] = await db
      .insert(users)
      .values({
        email: body.email,
        name: body.name,
        passwordHash: await hashPassword(body.password),
        role,
        defaultLevel: body.level ?? null,
      })
      .returning();
    await startSession(user.id);
    return ok({ user: { id: user.id, email: user.email, name: user.name, role: user.role, defaultLevel: user.defaultLevel } }, 201);
  });
}
