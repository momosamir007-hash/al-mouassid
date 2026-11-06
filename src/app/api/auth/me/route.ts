import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { LEVEL_IDS } from "@/lib/constants";
import { verifyPassword } from "@/server/auth/password";
import { endSession, getSessionUser, requireUser } from "@/server/auth/session";
import { ApiError, handle, ok, parseBody } from "@/server/utils/api";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle("auth.me", async () => ok({ user: await getSessionUser() }));
}

const patchSchema = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  defaultLevel: z.enum(LEVEL_IDS).nullable().optional(),
});

export async function PATCH(req: Request) {
  return handle("auth.me.patch", async () => {
    const user = await requireUser();
    const body = await parseBody(req, patchSchema);
    await db
      .update(users)
      .set({
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.defaultLevel !== undefined ? { defaultLevel: body.defaultLevel } : {}),
      })
      .where(eq(users.id, user.id));
    return ok({ user: await getSessionUser() });
  });
}

/** حذف الحساب وكل بياناته نهائياً (يتطلب كلمة المرور). */
export async function DELETE(req: Request) {
  return handle("auth.me.delete", async () => {
    const user = await requireUser();
    const body = await parseBody(req, z.object({ password: z.string().min(1).max(100) }));
    const [row] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    if (!row || !(await verifyPassword(body.password, row.passwordHash))) {
      throw new ApiError(401, "كلمة المرور غير صحيحة.", "invalid_credentials");
    }
    await db.delete(users).where(eq(users.id, user.id));
    await endSession();
    return ok({ ok: true });
  });
}
