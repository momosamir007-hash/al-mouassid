import { checkArithmeticAnswer, describeVerdict } from "@/lib/arith";
import { assessClarity } from "@/lib/clarity";
import type { HelpActionId, LevelId } from "@/lib/constants";
import { NoProviderAvailableError, type AiRouter } from "@/server/ai/router";
import type { Attempt, ChatImage } from "@/server/ai/types";
import { ACTION_SPECS, taskFor } from "./actions";
import { redactPII } from "./privacy";
import { buildSystemPrompt, buildTurns, type HistoryItem } from "./prompts";

export interface HelpInput {
  level: LevelId;
  subjectSlug: string;
  subjectName: string;
  action: HelpActionId;
  exerciseText: string;
  studentAnswer?: string;
  history: HistoryItem[];
  image?: ChatImage | null;
  userId?: string | null;
}

export interface HelpOutput {
  source: "ai" | "local";
  text: string;
  provider: { name: string; model: string; isLocal: boolean };
  imageRequested: boolean;
  imageUsed: boolean;
  attempts: Attempt[];
}

export class EngineInputError extends Error {
  code: "unclear" | "needs_answer";
  reasons: string[];
  constructor(code: "unclear" | "needs_answer", message: string, reasons: string[] = []) {
    super(message);
    this.code = code;
    this.reasons = reasons;
  }
}

/**
 * PROGRESSIVE LEARNING ENGINE: يفهم الطلب، يتحقق من وضوح التمرين، يبني التعليمات
 * بحسب المستوى والمادة والزر، ويمرّر الطلب إلى الموجّه. لا يعرف شيئاً عن واجهة React
 * ولا عن مزودين بعينهم.
 */
export async function runHelp(input: HelpInput, router: AiRouter): Promise<HelpOutput> {
  const clarity = assessClarity(input.exerciseText);
  if (!clarity.clear) {
    throw new EngineInputError("unclear", "نص التمرين غير واضح بعد؛ صحّحه قبل طلب المساعدة.", clarity.reasons);
  }
  const spec = ACTION_SPECS[input.action];
  if (spec.needsAnswer && !input.studentAnswer?.trim()) {
    throw new EngineInputError("needs_answer", "اكتب إجابتك أولاً ثم اضغط «تحقّق من إجابتي».");
  }

  const verdict =
    input.action === "check_answer" && input.studentAnswer
      ? checkArithmeticAnswer(input.exerciseText, input.studentAnswer)
      : null;

  const exerciseText = redactPII(input.exerciseText);
  const answer = input.studentAnswer ? redactPII(input.studentAnswer) : undefined;

  const system = buildSystemPrompt({
    level: input.level,
    subjectSlug: input.subjectSlug,
    subjectName: input.subjectName,
    action: input.action,
    exerciseText,
    history: input.history,
    verdict,
    hasImage: Boolean(input.image),
  });
  const messages = buildTurns(input.history, input.action, answer);

  try {
    const res = await router.run({
      task: taskFor(input.action, input.subjectSlug),
      userId: input.userId,
      request: {
        system,
        messages,
        images: input.image ? [input.image] : undefined,
        maxTokens: input.action === "full_solution" ? 1800 : 800,
        temperature: 0.4,
      },
    });
    return {
      source: "ai",
      text: res.text,
      provider: { name: res.provider.name, model: res.provider.model, isLocal: res.provider.isLocal },
      imageRequested: res.imageRequested,
      imageUsed: res.imageUsed,
      attempts: res.attempts,
    };
  } catch (e) {
    // تحقق حسابي حتمي ممكن دون أي نموذج لغوي؛ هذا ليس «اختراع إجابة».
    if (e instanceof NoProviderAvailableError && verdict) {
      return {
        source: "local",
        text: describeVerdict(verdict),
        provider: { name: "تحقق حسابي محلي", model: "arith", isLocal: true },
        imageRequested: Boolean(input.image),
        imageUsed: false,
        attempts: e.attempts,
      };
    }
    throw e;
  }
}
