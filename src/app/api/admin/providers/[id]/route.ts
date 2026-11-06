import { eq } from "drizzle-orm";
import { db } from "@/db";
import { aiProviders } from "@/db/schema";
import { requireAdmin } from "@/server/auth/session";
import { ApiError, handle, ok, parseBody } from "@/server/utils/api";
import { providerPatchSchema, toPatchValues } from "../schema";

export const dynamic = "force-dynamic";

function parseId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new ApiError(400, "معرّف غير صالح", "bad_id");
  return id;
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle("admin.providers.patch", async () => {
    await requireAdmin();
    const id = parseId((await ctx.params).id);
    const body = await parseBody(req, providerPatchSchema);
    const values = toPatchValues(body);
    // أي تعديل يدوي يزيل الإيقاف المؤقت التلقائي ليُعاد اختبار المزود
    const [row] = await db
      .update(aiProviders)
      .set({ ...values, cooldownUntil: null })
      .where(eq(aiProviders.id, id))
      .returning({ id: aiProviders.id });
    if (!row) throw new ApiError(404, "المزود غير موجود", "not_found");
    return ok({ ok: true });
  });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle("admin.providers.delete", async () => {
    await requireAdmin();
    const id = parseId((await ctx.params).id);
    await db.delete(aiProviders).where(eq(aiProviders.id, id));
    return ok({ ok: true });
  });
}
