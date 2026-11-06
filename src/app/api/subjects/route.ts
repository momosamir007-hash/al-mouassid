import { asc, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { subjects } from "@/db/schema";
import { DEFAULT_SUBJECTS } from "@/lib/constants";
import { handle, ok } from "@/server/utils/api";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle("subjects.list", async () => {
    const [{ n }] = await db.select({ n: count() }).from(subjects);
    if (n === 0) {
      await db
        .insert(subjects)
        .values(DEFAULT_SUBJECTS.map((s) => ({ slug: s.slug, nameAr: s.nameAr, icon: s.icon, levels: s.levels, sortOrder: s.sortOrder ?? 100 })))
        .onConflictDoNothing();
    }
    const rows = await db.select().from(subjects).where(eq(subjects.enabled, true)).orderBy(asc(subjects.sortOrder), asc(subjects.id));
    return ok({
      subjects: rows.map((r) => ({ slug: r.slug, nameAr: r.nameAr, icon: r.icon, levels: r.levels, sortOrder: r.sortOrder })),
    });
  });
}
