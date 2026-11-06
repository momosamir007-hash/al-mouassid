import { MiniCalculator } from "@/components/MiniCalculator";

const LESSONS = [
  {
    icon: "🔢",
    title: "ترتيب العمليات الحسابية",
    body: ["1) الأقواس ( )", "2) القوى (الأسس)", "3) الضرب والقسمة من اليسار إلى اليمين", "4) الجمع والطرح من اليسار إلى اليمين", "مثال: 12 + 7 × 3 = 12 + 21 = 33 (وليس 57)."],
  },
  {
    icon: "🍕",
    title: "الكسور",
    body: ["جمع كسرين: وحّد المقامين أولاً.", "a/b + c/d = (a×d + c×b) / (b×d)", "اختزال الكسر: اقسم البسط والمقام على قاسم مشترك.", "مثال: 1/2 + 1/3 = 3/6 + 2/6 = 5/6"],
  },
  {
    icon: "📐",
    title: "المساحات والمحيطات",
    body: ["المستطيل: المساحة = الطول × العرض، المحيط = 2 × (الطول + العرض)", "المربع: المساحة = الضلع²، المحيط = 4 × الضلع", "المثلث: المساحة = ½ × القاعدة × الارتفاع", "الدائرة: المساحة = π × r²، المحيط = 2 × π × r"],
  },
  {
    icon: "⚛️",
    title: "قوانين فيزيائية أساسية",
    body: ["السرعة: v = d / t", "الكثافة: ρ = m / V", "الضغط: P = F / S", "قانون أوم: U = R × I", "انتبه دائماً إلى توحيد وحدات القياس قبل التطبيق."],
  },
  {
    icon: "🇫🇷",
    title: "Français : avoir et être (présent)",
    body: ["avoir : j'ai, tu as, il/elle a, nous avons, vous avez, ils/elles ont", "être : je suis, tu es, il/elle est, nous sommes, vous êtes, ils/elles sont"],
  },
  {
    icon: "🇬🇧",
    title: "English: Present Simple",
    body: ["I/You/We/They + verb → I play", "He/She/It + verb + s → She plays", "Negative: do/does + not + base verb → He does not play", "Question: Do/Does + subject + base verb? → Does she play?"],
  },
  {
    icon: "📖",
    title: "الجملة الاسمية والفعلية",
    body: ["الجملة الاسمية تبدأ باسم: المبتدأ مرفوع والخبر مرفوع. مثال: العِلمُ نورٌ.", "الجملة الفعلية تبدأ بفعل: الفاعل مرفوع والمفعول به منصوب. مثال: قرأَ الطالبُ الدرسَ."],
  },
];

export default function LibraryPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-extrabold">المكتبة والأدوات المحلية</h1>
        <p className="mt-1 text-stone-600">
          هذه المحتويات مخزّنة مسبقاً في تطبيقك وتعمل دون إنترنت. (محتوى تجريبي مبسّط للمراجعة السريعة وليس بديلاً عن الكتاب المدرسي.)
        </p>
      </header>
      <MiniCalculator />
      <div className="grid gap-4 md:grid-cols-2">
        {LESSONS.map((l) => (
          <article key={l.title} className="card">
            <h2 className="text-lg font-extrabold">
              <span className="me-2">{l.icon}</span>
              {l.title}
            </h2>
            <ul className="mt-2 space-y-1 text-stone-700">
              {l.body.map((b) => (
                <li key={b} dir="auto">
                  {b}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </div>
  );
}
