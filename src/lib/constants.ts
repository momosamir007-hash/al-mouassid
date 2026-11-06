export const LEVELS = [
  { id: "primary", label: "ابتدائي", desc: "كلمات سهلة وأمثلة من الحياة", emoji: "🎒" },
  { id: "middle", label: "متوسط", desc: "قواعد وخطوات واضحة وأمثلة تطبيقية", emoji: "📐" },
  { id: "secondary", label: "ثانوي", desc: "تحليل أعمق وتفسير للقوانين", emoji: "🔬" },
  { id: "university", label: "جامعي", desc: "شرح أكاديمي ومصطلحات تخصصية", emoji: "🎓" },
] as const;

export type LevelId = (typeof LEVELS)[number]["id"];
export const LEVEL_IDS = LEVELS.map((l) => l.id) as [LevelId, ...LevelId[]];

export function levelLabel(id: string): string {
  return LEVELS.find((l) => l.id === id)?.label ?? id;
}

export interface SubjectDef {
  slug: string;
  nameAr: string;
  icon: string;
  levels: string[];
  sortOrder?: number;
}

const ALL_LEVELS = ["primary", "middle", "secondary", "university"];

/** مواد افتراضية؛ تُستخدم عند تعذر الاتصال بالخادم وكبيانات بذر لقاعدة البيانات. */
export const DEFAULT_SUBJECTS: SubjectDef[] = [
  { slug: "math", nameAr: "الرياضيات", icon: "➗", levels: ALL_LEVELS, sortOrder: 10 },
  { slug: "arabic", nameAr: "اللغة العربية", icon: "📖", levels: ALL_LEVELS, sortOrder: 20 },
  { slug: "french", nameAr: "اللغة الفرنسية", icon: "🇫🇷", levels: ALL_LEVELS, sortOrder: 30 },
  { slug: "english", nameAr: "اللغة الإنجليزية", icon: "🇬🇧", levels: ALL_LEVELS, sortOrder: 40 },
  { slug: "natural-sciences", nameAr: "العلوم الطبيعية", icon: "🌱", levels: ALL_LEVELS, sortOrder: 50 },
  { slug: "physics", nameAr: "الفيزياء", icon: "⚛️", levels: ["middle", "secondary", "university"], sortOrder: 60 },
  { slug: "history-geo", nameAr: "التاريخ والجغرافيا", icon: "🌍", levels: ALL_LEVELS, sortOrder: 70 },
  { slug: "university-other", nameAr: "تخصصات جامعية أخرى", icon: "🏛️", levels: ["university"], sortOrder: 80 },
];

/** أزرار المساعدة السبعة المستقلة (بالترتيب المطلوب). */
export const HELP_ACTIONS = [
  { id: "hint_1", label: "أعطني تلميحاً أولاً", icon: "💡" },
  { id: "hint_2", label: "وضّح التلميح أكثر", icon: "🔍" },
  { id: "first_step", label: "ما الخطوة الأولى؟", icon: "1️⃣" },
  { id: "next_step", label: "ساعدني في الخطوة التالية", icon: "➡️" },
  { id: "explain_other", label: "اشرح بطريقة أخرى", icon: "🔄" },
  { id: "check_answer", label: "تحقّق من إجابتي", icon: "✅" },
  { id: "full_solution", label: "اعرض الحل الكامل", icon: "📝" },
] as const;

export type HelpActionId = (typeof HELP_ACTIONS)[number]["id"];
export const HELP_ACTION_IDS = HELP_ACTIONS.map((a) => a.id) as [HelpActionId, ...HelpActionId[]];

export function actionLabel(id: string): string {
  return HELP_ACTIONS.find((a) => a.id === id)?.label ?? id;
}

export const TASKS = ["text", "math", "explain", "verify"] as const;
export type TaskId = (typeof TASKS)[number];
export const TASK_LABELS: Record<TaskId, string> = {
  text: "نص عام",
  math: "رياضيات",
  explain: "شرح",
  verify: "تحقق",
};

export const PROVIDER_KINDS = [
  { id: "openai", label: "OpenAI" },
  { id: "gemini", label: "Google Gemini" },
  { id: "anthropic", label: "Anthropic Claude" },
  { id: "openai-compatible", label: "واجهة متوافقة مع OpenAI" },
  { id: "ollama", label: "Ollama (محلي)" },
] as const;
export type ProviderKind = (typeof PROVIDER_KINDS)[number]["id"];
