import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { subjects } from "@/db/schema";
import { DEFAULT_SUBJECTS, HELP_ACTION_IDS, LEVEL_IDS } from "@/lib/constants";
import { getRouter, NoProviderAvailableError } from "@/server/ai";
import { noProviderMessage, publicAttempts } from "@/server/ai/explain";
import { getSessionUser } from "@/server/auth/session";
import { loadHistory, saveTurn, upsertExercise } from "@/server/conversation/conversation";
import { EngineInputError, runHelp } from "@/server/learning/engine";
import { userTurnText } from "@/server/learning/prompts";
import { ApiError, clientIp, handle, ok, parseBody } from "@/server/utils/api";
import { rateLimit } from "@/server/utils/ratelimit";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const schema = z.object({
  clientId: z.string().min(1).max(64),
  level: z.enum(LEVEL_IDS),
  subject: z.string().min(1).max(40),
  exerciseText: z.string().min(1).max(4000),
  action: z.enum(HELP_ACTION_IDS),
  studentAnswer: z.string().max(2000).optional(),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        action: z.string().max(40),
        content: z.string().max(4000),
      }),
    )
    .max(24)
    .optional(),
  image: z
    .object({
      mime: z.enum(["image/jpeg", "image/png", "image/webp"]),
      data: z.string().max(6_000_000).regex(/^[A-Za-z0-9+/=]+$/),
    })
    .optional(),
});

async function subjectName(slug: string): Promise<string> {
  try {
    const [row] = await db.select().from(subjects).where(eq(subjects.slug, slug)).limit(1);
    if (row) return row.nameAr;
  } catch {
    /* نكمل بالقيمة الافتراضية */
  }
  return DEFAULT_SUBJECTS.find((s) => s.slug === slug)?.nameAr ?? slug;
}

export async function POST(req: Request) {
  return handle("help", async () => {
    const user = await getSessionUser();
    const rateKey = user ? `help:${user.id}` : `help:ip:${clientIp(req)}`;
    if (!rateLimit(rateKey, 40, 10 * 60_000)) {
      throw new ApiError(429, "طلبات كثيرة خلال وقت قصير. خذ استراحة قصيرة ثم تابع.", "rate_limited");
    }
    const body = await parseBody(req, schema);

    try {
      let exerciseId: string | null = null;
      let history = body.history ?? [];

      if (user) {
        const exercise = await upsertExercise(user.id, {
          clientId: body.clientId,
          level: body.level,
          subject: body.subject,
          text: body.exerciseText,
        });
        exerciseId = exercise.id;
        history = await loadHistory(exercise.id);
      }

      const out = await runHelp(
        {
          level: body.level,
          subjectSlug: body.subject,
          subjectName: await subjectName(body.subject),
          action: body.action,
          exerciseText: body.exerciseText,
          studentAnswer: body.studentAnswer,
          history,
          image: body.image ?? null,
          userId: user?.id ?? null,
        },
        getRouter(),
      );

      if (user && exerciseId) {
        const { userRow, assistantRow } = await saveTurn({
          exerciseId,
          action: body.action,
          studentAnswer: body.studentAnswer,
          reply: out.text,
          providerName: out.provider.name,
          providerLocal: out.provider.isLocal,
          model: out.provider.model,
        });

        return ok({
          userMessage: { id: userRow.id, role: "user", action: body.action, content: userRow.content, createdAt: userRow.createdAt.getTime() },
          message: {
            id: assistantRow.id,
            role: "assistant",
            action: body.action,
            content: assistantRow.content,
            provider: { name: out.provider.name, isLocal: out.provider.isLocal, model: out.provider.model },
            createdAt: assistantRow.createdAt.getTime(),
          },
          source: out.source,
          imageRequested: out.imageRequested,
          imageUsed: out.imageUsed,
          fallbacks: publicAttempts(out.attempts).filter((a) => a.outcome === "failed"),
        });
      }

      const now = Date.now();
      return ok({
        userMessage: {
          id: randomUUID(),
          role: "user",
          action: body.action,
          content: userTurnText(body.action, body.studentAnswer),
          createdAt: now,
        },
        message: {
          id: randomUUID(),
          role: "assistant",
          action: body.action,
          content: out.text,
          provider: { name: out.provider.name, isLocal: out.provider.isLocal, model: out.provider.model },
          createdAt: now + 1,
        },
        source: out.source,
        imageRequested: out.imageRequested,
        imageUsed: out.imageUsed,
        fallbacks: publicAttempts(out.attempts).filter((a) => a.outcome === "failed"),
      });
    } catch (e) {
      if (e instanceof EngineInputError) {
        throw new ApiError(e.code === "unclear" ? 422 : 400, e.message, e.code, { reasons: e.reasons });
      }
      if (e instanceof NoProviderAvailableError) {
        throw new ApiError(503, noProviderMessage(e.code, e.attempts), "no_provider", {
          attempts: publicAttempts(e.attempts),
        });
      }
      throw e;
    }
  });
}
