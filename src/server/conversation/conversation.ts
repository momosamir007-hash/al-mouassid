import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { exercises, helpMessages } from "@/db/schema";
import { actionLabel } from "@/lib/constants";
import { userTurnText } from "@/server/learning/prompts";
import type { HelpActionId } from "@/lib/constants";

export interface ExerciseInput {
  clientId: string;
  level: string;
  subject: string;
  text: string;
  title?: string;
}

export function makeTitle(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > 60 ? `${t.slice(0, 60)}…` : t;
}

/** إدارة المحادثة: إنشاء/تحديث التمرين وحفظ أدوار المحادثة وتحميل السياق. */
export async function upsertExercise(userId: string, ex: ExerciseInput, updatedAt = new Date()) {
  const [row] = await db
    .insert(exercises)
    .values({
      userId,
      clientId: ex.clientId,
      level: ex.level,
      subject: ex.subject,
      text: ex.text,
      title: ex.title || makeTitle(ex.text),
      updatedAt,
    })
    .onConflictDoUpdate({
      target: [exercises.userId, exercises.clientId],
      set: { level: ex.level, subject: ex.subject, text: ex.text, title: ex.title || makeTitle(ex.text), updatedAt },
    })
    .returning();
  return row;
}

export async function loadHistory(exerciseId: string) {
  const rows = await db
    .select()
    .from(helpMessages)
    .where(eq(helpMessages.exerciseId, exerciseId))
    .orderBy(asc(helpMessages.createdAt));
  return rows.map((r) => ({
    role: r.role as "user" | "assistant",
    action: r.action,
    content: r.content,
  }));
}

export async function saveTurn(params: {
  exerciseId: string;
  action: HelpActionId;
  studentAnswer?: string;
  reply: string;
  providerName: string;
  providerLocal: boolean;
  model: string;
}) {
  const [userRow] = await db
    .insert(helpMessages)
    .values({
      exerciseId: params.exerciseId,
      role: "user",
      action: params.action,
      content: userTurnText(params.action, params.studentAnswer),
    })
    .returning();
  const [assistantRow] = await db
    .insert(helpMessages)
    .values({
      exerciseId: params.exerciseId,
      role: "assistant",
      action: params.action,
      content: params.reply,
      providerName: params.providerName,
      providerLocal: params.providerLocal,
      model: params.model,
      createdAt: new Date(userRow.createdAt.getTime() + 1),
    })
    .returning();
  await db.update(exercises).set({ updatedAt: new Date() }).where(eq(exercises.id, params.exerciseId));
  return { userRow, assistantRow };
}

export async function listExercisesWithMessages(userId: string) {
  const exRows = await db.select().from(exercises).where(eq(exercises.userId, userId));
  const result = [];
  for (const ex of exRows) {
    const msgs = await db
      .select()
      .from(helpMessages)
      .where(eq(helpMessages.exerciseId, ex.id))
      .orderBy(asc(helpMessages.createdAt));
    result.push({
      clientId: ex.clientId,
      level: ex.level,
      subject: ex.subject,
      title: ex.title,
      text: ex.text,
      createdAt: ex.createdAt.getTime(),
      updatedAt: ex.updatedAt.getTime(),
      messages: msgs.map((m) => ({
        id: m.id,
        role: m.role as "user" | "assistant",
        action: m.action,
        content: m.role === "user" ? m.content : m.content,
        label: actionLabel(m.action),
        provider: m.providerName ? { name: m.providerName, isLocal: Boolean(m.providerLocal), model: m.model } : null,
        createdAt: m.createdAt.getTime(),
      })),
    });
  }
  return result;
}

export async function deleteExercisesByClientIds(userId: string, clientIds: string[]) {
  for (const clientId of clientIds) {
    await db.delete(exercises).where(and(eq(exercises.userId, userId), eq(exercises.clientId, clientId)));
  }
}

export async function deleteAllExercises(userId: string) {
  await db.delete(exercises).where(eq(exercises.userId, userId));
}
