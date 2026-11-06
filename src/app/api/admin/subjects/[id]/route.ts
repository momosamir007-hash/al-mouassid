import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { subjects } from "@/db/schema";
import { LEVEL_IDS } from "@/lib/constants";
import { requireAdmin } from "@/server/auth/session";
import { ApiError, handle, ok, parseBody } from "@/server/utils/api";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  nameAr: z.string().trim().min(1).max(60).optional(),
  icon: z.string().trim().min(1).max(8).optional(),
  levels: z.array(z.enum(LEVEL_IDS)).min(1).optional(),
  sortOrder: z.number().int().min(1).max(1000).optional(),
  enabled: z.boolean().optional(),
});

function parseId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new ApiError(400, "معرّف غير صالح", "bad_id");
  return id;
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle("admin.subjects.patch", async () => {
    await requireAdmin();
    const id = parseId((await ctx.params).id);
    const body = await parseBody(req, patchSchema);
    await db.update(subjects).set(body).where(eq(subjects.id, id));
    return ok({ ok: true });
  });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle("admin.subjects.delete", async () => {
    await requireAdmin();
    await db.delete(subjects).where(eq(subjects.id, parseId((await ctx.params).id)));
    return ok({ ok: true });
  });
}
