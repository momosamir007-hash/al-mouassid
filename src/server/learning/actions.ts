import type { HelpActionId, TaskId } from "@/lib/constants";

export interface ActionSpec {
  /** تعليمات التعليم لهذا الزر. */
  instruction: string;
  /** هل يُسمح بكشف الحل النهائي؟ */
  revealsSolution: boolean;
  needsAnswer: boolean;
}

/**
 * منطق المساعدة التدريجية: كل زر مستقل ويمكن طلبه في أي وقت وبأي ترتيب.
 * أي زر غير full_solution يمنع كشف النتيجة النهائية.
 */
export const ACTION_SPECS: Record<HelpActionId, ActionSpec> = {
  hint_1: {
    revealsSolution: false,
    needsAnswer: false,
    instruction:
      "المطلوب: تلميح أول واحد فقط، قصير (جملة أو جملتان)، يوجّه تفكير المتعلم نحو الفكرة الأساسية أو السؤال الذي يجب أن يسأله لنفسه. لا تذكر خطوات الحل ولا النتيجة ولا القانون كاملاً.",
  },
  hint_2: {
    revealsSolution: false,
    needsAnswer: false,
    instruction:
      "المطلوب: توضيح التلميح السابق بدرجة أعمق. ابنِ على التلميح الذي قدّمته سابقاً (انظر المحادثة) ولا تكرره حرفياً. يمكنك ذكر القاعدة أو المفهوم المطلوب بوضوح أكبر، لكن لا تُجرِ الحساب ولا تكشف النتيجة. إن لم يوجد تلميح سابق فقدّم تلميحاً أولاً ثم وضّحه.",
  },
  first_step: {
    revealsSolution: false,
    needsAnswer: false,
    instruction:
      "المطلوب: اذكر الخطوة الأولى فقط من الحل مع سبب اختيارها، ثم توقف واطلب من المتعلم أن يجرّبها بنفسه. لا تنتقل إلى الخطوة الثانية ولا تذكر النتيجة.",
  },
  next_step: {
    revealsSolution: false,
    needsAnswer: false,
    instruction:
      "المطلوب: ساعد في الخطوة التالية فقط. اعتمد على ما قُدّم سابقاً في المحادثة وعلى محاولة المتعلم الحالية إن وُجدت (لتعرف أين وصل). إن لم يوجد تقدّم سابق فابدأ بالخطوة الأولى. قدّم خطوة واحدة فقط ثم اطلب من المتعلم المحاولة. لا تكشف النتيجة النهائية.",
  },
  explain_other: {
    revealsSolution: false,
    needsAnswer: false,
    instruction:
      "المطلوب: اشرح الفكرة بطريقة مختلفة تماماً عن شرحك السابق (مثال مختلف، تشبيه، تمثيل نصي أو جدول) دون كشف الحل النهائي. تجنّب تكرار الصياغة السابقة. اختم بسؤال قصير واحد لاختبار فهم المتعلم.",
  },
  check_answer: {
    revealsSolution: false,
    needsAnswer: true,
    instruction:
      "المطلوب: قيّم إجابة المتعلم: «صحيحة» أو «خاطئة» أو «صحيحة جزئياً». إن كانت خاطئة فحدّد موضع الخطأ ونوعه (وبيّن إن كان خطأً شائعاً) دون كتابة الحل الكامل، وأعطِ توجيهاً لتصحيحه. إن كانت صحيحة فأثنِ بإيجاز وبيّن لماذا هي صحيحة. إذا وُجدت «نتيجة تحقق حسابي مؤكدة» فالتزم بها ولا تخالفها.",
  },
  full_solution: {
    revealsSolution: true,
    needsAnswer: false,
    instruction:
      "المطلوب: اعرض الحل الكامل مقسّماً إلى خطوات مرقمة، مع تعليل كل خطوة، ثم الخلاصة/النتيجة النهائية بوضوح. التزم بما قلته سابقاً ولا تناقضه. اختم بسؤال قصير واحد يختبر فهم المتعلم للفكرة الأساسية.",
  },
};

/** نوع المهمة الذي يحدد المزود المناسب في الموجّه. */
export function taskFor(action: HelpActionId, subjectSlug: string): TaskId {
  if (action === "check_answer") return "verify";
  if (subjectSlug === "math" || subjectSlug === "physics") return "math";
  if (action === "explain_other") return "explain";
  return "explain";
}
