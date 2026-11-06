import Link from "next/link";
import { AiStatusChip, ContinueCard } from "@/components/HomeWidgets";

const FEATURES = [
  { icon: "💡", title: "مساعدة تدريجية", text: "تلميح، ثم توضيح، ثم خطوة… وأنت تقرّر متى تريد الحل الكامل." },
  { icon: "📷", title: "صوّر تمرينك", text: "التقط صورة، قصّها وحسّنها، وراجع النص المستخرج قبل البدء." },
  { icon: "📴", title: "يعمل دون إنترنت", text: "افتح تمارينك المحفوظة واكتب جديداً، وتتم المزامنة لاحقاً." },
];

export default function HomePage() {
  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[2rem] bg-gradient-to-br from-teal-700 via-teal-800 to-emerald-900 p-7 text-white shadow-lg md:p-12">
        <p className="text-sm font-bold text-teal-200">للابتدائي والمتوسط والثانوي والجامعة</p>
        <h1 className="mt-3 text-4xl font-extrabold leading-tight md:text-5xl">
          افهم التمرين،
          <br />
          لا تنسخ الجواب.
        </h1>
        <p className="mt-4 max-w-xl text-lg leading-8 text-teal-50">
          «المساعد» معلّم خصوصي ذكي يقودك خطوة بخطوة حتى تصل إلى الحل بنفسك، وبأسلوب يناسب مستواك.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link href="/new" className="btn bg-amber-400 text-stone-900 hover:bg-amber-300">
            ✏️ ابدأ تمريناً جديداً
          </Link>
          <Link href="/capture" className="btn bg-white/15 text-white ring-1 ring-white/40 hover:bg-white/25">
            📷 صوّر التمرين
          </Link>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <AiStatusChip />
      </div>

      <ContinueCard />

      <section className="grid gap-4 md:grid-cols-3" aria-label="المزايا">
        {FEATURES.map((f) => (
          <div key={f.title} className="card">
            <div className="text-3xl">{f.icon}</div>
            <h2 className="mt-2 text-lg font-extrabold">{f.title}</h2>
            <p className="mt-1 text-stone-600">{f.text}</p>
          </div>
        ))}
      </section>

      <section className="card bg-amber-50 ring-amber-200">
        <h2 className="text-lg font-extrabold text-amber-900">خصوصيتك أولاً</h2>
        <p className="mt-1 text-amber-950/80">
          عند طلب مساعدة ذكية يُرسَل نص التمرين فقط (بعد حذف البريد والأرقام الشخصية) إلى مزود ذكاء اصطناعي يختاره النظام، وقد يكون
          خارجياً. صور التمارين لا تُخزَّن أبداً. يمكنك حذف سجلك في أي وقت من «حسابي».
        </p>
      </section>
    </div>
  );
}
