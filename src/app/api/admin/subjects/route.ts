import { asc } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { subjects } from "@/db/schema";
import { LEVEL_IDS } from "@/lib/constants";
import { requireAdmin } from "@/server/auth/session";
import { handle, ok, parseBody } from "@/server/utils/api";

export const dynamic = "force-dynamic";

const subjectSchema = z.object({
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,40}$/, "معرّف لاتيني قصير (a-z, 0-9, -)"),
  nameAr: z.string().trim().min(1).max(60),
  icon: z.string().trim().min(1).max(8).default("📘"),
  levels: z.array(z.enum(LEVEL_IDS)).min(1),
  sortOrder: z.number().int().min(1).max(1000).default(100),
  enabled: z.boolean().default(true),
});

export async function GET() {
  return handle("admin.subjects.list", async () => {
    await requireAdmin();
    return ok({ subjects: await db.select().from(subjects).orderBy(asc(subjects.sortOrder), asc(subjects.id)) });
  });
}

export async function POST(req: Request) {
  return handle("admin.subjects.create", async () => {
    await requireAdmin();
    const body = await parseBody(req, subjectSchema);
    await db.insert(subjects).values(body);
    return ok({ ok: true }, 201);
  });
}
