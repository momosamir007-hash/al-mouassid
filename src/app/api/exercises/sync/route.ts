import { z } from "zod";
import { LEVEL_IDS } from "@/lib/constants";
import { requireUser } from "@/server/auth/session";
import {
  deleteExercisesByClientIds,
  listExercisesWithMessages,
  upsertExercise,
} from "@/server/conversation/conversation";
import { handle, ok, parseBody } from "@/server/utils/api";

export const dynamic = "force-dynamic";

const schema = z.object({
  exercises: z
    .array(
      z.object({
        clientId: z.string().min(1).max(64),
        level: z.enum(LEVEL_IDS),
        subject: z.string().min(1).max(40),
        text: z.string().min(1).max(4000),
        title: z.string().max(120).optional(),
        updatedAt: z.number().int().positive(),
      }),
    )
    .max(200),
  deletes: z.array(z.string().max(64)).max(500).default([]),
});

/**
 * قواعد المزامنة:
 *  1) الحذف المعلّق من الجهاز يُطبَّق أولاً على الخادم.
 *  2) التمارين المحلية تُرفع بالمعرّف clientId (الأحدث updatedAt يفوز في الحقول).
 *  3) يعيد الخادم كل تمارين المستخدم مع رسائلها ليدمجها الجهاز (اتحاد الرسائل بالمعرّف).
 */
export async function POST(req: Request) {
  return handle("exercises.sync", async () => {
    const user = await requireUser();
    const body = await parseBody(req, schema);
    await deleteExercisesByClientIds(user.id, body.deletes);
    const deleted = new Set(body.deletes);
    for (const ex of body.exercises) {
      if (deleted.has(ex.clientId)) continue;
      await upsertExercise(user.id, ex, new Date(ex.updatedAt));
    }
    return ok({ exercises: await listExercisesWithMessages(user.id) });
  });
}
