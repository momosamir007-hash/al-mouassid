import { z } from "zod";
import { LEVEL_IDS } from "@/lib/constants";
import { requireUser } from "@/server/auth/session";
import { deleteExercisesByClientIds, listExerciseDeletions, listExercisesWithMessages, upsertExercise } from "@/server/conversation/conversation";
import { ApiError, clientIp, handle, ok, parseBody } from "@/server/utils/api";
import { rateLimit } from "@/server/utils/ratelimit";
export const dynamic = "force-dynamic";
const schema = z.object({
  exercises: z.array(z.object({ clientId: z.string().min(1).max(64), level: z.enum(LEVEL_IDS), subject: z.string().regex(/^[a-z0-9-]{2,40}$/),
    text: z.string().min(1).max(4000), title: z.string().max(120).optional(), updatedAt: z.number().int().positive().refine(v => v <= Date.now() + 5 * 60_000, "التوقيت في المستقبل بشكل غير معقول") })).max(200),
  deletes: z.array(z.string().min(1).max(64)).max(500).default([]),
});
export async function POST(req: Request) {
  return handle("exercises.sync", async () => {
    const user = await requireUser();
    if (!(await rateLimit(`sync:${user.id}:${clientIp(req)}`, 30, 10 * 60_000))) throw new ApiError(429, "طلبات مزامنة كثيرة؛ حاول بعد قليل.", "rate_limited");
    const body = await parseBody(req, schema);
    await deleteExercisesByClientIds(user.id, body.deletes);
    const tombstones = await listExerciseDeletions(user.id);
    const deleted = new Set(tombstones.map(t => t.clientId));
    for (const ex of body.exercises) if (!deleted.has(ex.clientId)) await upsertExercise(user.id, ex, new Date(ex.updatedAt));
    return ok({ exercises: await listExercisesWithMessages(user.id), deletedClientIds: [...deleted] });
  });
}
