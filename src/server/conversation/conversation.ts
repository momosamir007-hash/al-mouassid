import { and, asc, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { exerciseDeletions, exercises, helpMessages } from "@/db/schema";
import { ApiError } from "@/server/utils/api";
import { actionLabel } from "@/lib/constants";
import { userTurnText } from "@/server/learning/prompts";
import { redactPII } from "@/server/learning/privacy";
import type { HelpActionId } from "@/lib/constants";

export interface ExerciseInput { clientId: string; level: string; subject: string; text: string; title?: string }
export function makeTitle(text: string): string { const t = text.replace(/\s+/g, " ").trim(); return t.length > 60 ? `${t.slice(0, 60)}…` : t; }

/** الأحدث يفوز على الخادم نفسه؛ والبيانات القديمة لا تستبدل النسخة الأحدث. */
export async function upsertExercise(userId: string, ex: ExerciseInput, updatedAt = new Date()) {
  return db.transaction(async tx => {
    const [tombstone] = await tx.select().from(exerciseDeletions).where(and(eq(exerciseDeletions.userId, userId), eq(exerciseDeletions.clientId, ex.clientId))).limit(1);
    if (tombstone) throw new ApiError(409, "هذا التمرين حُذف من جهاز آخر؛ أنشئ تمريناً جديداً إذا أردت البدء من جديد.", "exercise_deleted");
    const [before] = await tx.select().from(exercises).where(and(eq(exercises.userId, userId), eq(exercises.clientId, ex.clientId))).limit(1);
    if (before && before.updatedAt.getTime() >= updatedAt.getTime()) return before;
    const [row] = await tx.insert(exercises).values({ userId, clientId: ex.clientId, level: ex.level, subject: ex.subject,
      text: ex.text, title: ex.title || makeTitle(ex.text), updatedAt })
      .onConflictDoUpdate({
        target: [exercises.userId, exercises.clientId],
        set: { level: ex.level, subject: ex.subject, text: ex.text, title: ex.title || makeTitle(ex.text), updatedAt },
        setWhere: lt(exercises.updatedAt, updatedAt),
      }).returning();
    const current = row ?? (await tx.select().from(exercises).where(and(eq(exercises.userId, userId), eq(exercises.clientId, ex.clientId))).limit(1))[0];
    if (before && current && (before.text !== current.text || before.level !== current.level || before.subject !== current.subject)) {
      await tx.delete(helpMessages).where(eq(helpMessages.exerciseId, current.id));
    }
    if (!current) throw new Error("تعذر حفظ التمرين في قاعدة البيانات.");
    return current;
  });
}

export async function loadHistory(exerciseId: string) {
  const rows = await db.select().from(helpMessages).where(eq(helpMessages.exerciseId, exerciseId)).orderBy(desc(helpMessages.createdAt)).limit(24);
  return rows.reverse().map(r => ({ role: r.role as "user" | "assistant", action: r.action, content: r.content }));
}

export async function saveTurn(params: { exerciseId: string; action: HelpActionId; studentAnswer?: string; reply: string; providerName: string; providerLocal: boolean; model: string }) {
  return db.transaction(async tx => {
    await tx.execute(sql`SELECT id FROM exercises WHERE id = ${params.exerciseId} FOR UPDATE`);
    const [userRow] = await tx.insert(helpMessages).values({ exerciseId: params.exerciseId, role: "user", action: params.action,
      content: redactPII(userTurnText(params.action, params.studentAnswer)) }).returning();
    const [assistantRow] = await tx.insert(helpMessages).values({ exerciseId: params.exerciseId, role: "assistant", action: params.action,
      content: params.reply, providerName: params.providerName, providerLocal: params.providerLocal, model: params.model,
      createdAt: new Date(userRow.createdAt.getTime() + 1) }).returning();
    return { userRow, assistantRow };
  });
}

export async function listExercisesWithMessages(userId: string) {
  const exRows = await db.select().from(exercises).where(eq(exercises.userId, userId));
  if (!exRows.length) return [];
  const ids = exRows.map(e => e.id);
  const msgs = await db.select().from(helpMessages).where(inArray(helpMessages.exerciseId, ids)).orderBy(asc(helpMessages.createdAt));
  const byExercise = new Map<string, typeof msgs>();
  for (const m of msgs) { const list = byExercise.get(m.exerciseId) ?? []; list.push(m); byExercise.set(m.exerciseId, list); }
  return exRows.map(ex => ({
    clientId: ex.clientId, level: ex.level, subject: ex.subject, title: ex.title, text: ex.text,
    createdAt: ex.createdAt.getTime(), updatedAt: ex.updatedAt.getTime(),
    messages: (byExercise.get(ex.id) ?? []).map(m => ({ id: m.id, role: m.role as "user" | "assistant", action: m.action,
      content: m.content, label: actionLabel(m.action),
      provider: m.providerName ? { name: m.providerName, isLocal: Boolean(m.providerLocal), model: m.model } : null,
      createdAt: m.createdAt.getTime() })),
  }));
}

export async function deleteExercisesByClientIds(userId: string, clientIds: string[]) {
  if (!clientIds.length) return;
  await db.transaction(async tx => {
    const now = new Date();
    for (const clientId of clientIds) {
      await tx.insert(exerciseDeletions).values({ userId, clientId, deletedAt: now })
        .onConflictDoUpdate({ target: [exerciseDeletions.userId, exerciseDeletions.clientId], set: { deletedAt: now } });
    }
    await tx.delete(exercises).where(and(eq(exercises.userId, userId), inArray(exercises.clientId, clientIds)));
  });
}
export async function listExerciseDeletions(userId: string) {
  return db.select({ clientId: exerciseDeletions.clientId }).from(exerciseDeletions).where(eq(exerciseDeletions.userId, userId));
}
export async function deleteAllExercises(userId: string) {
  await db.transaction(async tx => {
    const rows = await tx.select({ clientId: exercises.clientId }).from(exercises).where(eq(exercises.userId, userId));
    const now = new Date();
    for (const row of rows) await tx.insert(exerciseDeletions).values({ userId, clientId: row.clientId, deletedAt: now })
      .onConflictDoUpdate({ target: [exerciseDeletions.userId, exerciseDeletions.clientId], set: { deletedAt: now } });
    await tx.delete(exercises).where(eq(exercises.userId, userId));
  });
}
