import { requireUser } from "@/server/auth/session";
import { deleteAllExercises, listExercisesWithMessages } from "@/server/conversation/conversation";
import { handle, ok } from "@/server/utils/api";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle("exercises.list", async () => {
    const user = await requireUser();
    return ok({ exercises: await listExercisesWithMessages(user.id) });
  });
}

/** حذف كل سجل التمارين للمستخدم من الخادم. */
export async function DELETE() {
  return handle("exercises.clear", async () => {
    const user = await requireUser();
    await deleteAllExercises(user.id);
    return ok({ ok: true });
  });
}
