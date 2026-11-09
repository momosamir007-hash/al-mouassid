import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { verifyPassword } from "@/server/auth/password";
import { startSession } from "@/server/auth/session";
import { ApiError, clientIp, handle, ok, parseBody } from "@/server/utils/api";
import { rateLimit } from "@/server/utils/ratelimit";

export const dynamic = "force-dynamic";

const DUMMY_HASH = `s1.${Buffer.alloc(16).toString("base64url")}.${Buffer.alloc(64).toString("base64url")}`;
const schema = z.object({
  email: z.string().trim().toLowerCase().email().max(120),
  password: z.string().min(1).max(100),
});

export async function POST(req: Request) {
  return handle("auth.login", async () => {
    const body = await parseBody(req, schema);
    if (!(await rateLimit(`login:${clientIp(req)}:${body.email}`, 8, 15 * 60_000))) {
      throw new ApiError(429, "محاولات كثيرة، حاول بعد قليل.", "rate_limited");
    }
    const [user] = await db.select().from(users).where(eq(users.email, body.email)).limit(1);
    const valid = await verifyPassword(body.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !valid) throw new ApiError(401, "البريد أو كلمة المرور غير صحيحة.", "invalid_credentials");
    await startSession(user.id);
    return ok({ user: { id: user.id, email: user.email, name: user.name, role: user.role, defaultLevel: user.defaultLevel } });
  });
}
