import Link from "next/link";
import { AiStatusChip, ContinueCard } from "@/components/HomeWidgets";

const QUICK = [
  { href: "/history", icon: "◷", title: "سجل الشروحات", sub: "راجع حلولك السابقة", tone: "blue" },
  { href: "/library", icon: "▤", title: "المكتبة", sub: "المواد التعليمية", tone: "gold" },
  { href: "/new", icon: "▦", title: "حل التمارين", sub: "ابدأ تمريناً جديداً", tone: "mint" },
  { href: "/capture", icon: "▣", title: "التصوير", sub: "استخراج التمرين", tone: "mint" },
];

export default function HomePage() {
  return <div className="home-dashboard">
    <section className="home-hero">
      <div className="hero-copy"><span className="eyebrow">للابتدائي والمتوسط والثانوي والجامعة</span><h1>مرحباً بك في المساعد</h1><p>تعلّم بذكاء… وافهم بنفسك</p><Link href="/new" className="hero-cta">ابدأ الآن <span>←</span></Link></div>
      {/* eslint-disable-next-line @next/next/no-img-element */}<img className="hero-student" src="/images/student-photo.png" alt="طالب مبتسم يحمل جهازاً لوحياً" />
      <span className="math-mark mark-one">π</span><span className="math-mark mark-two">x²</span><span className="math-mark mark-three">△</span>
    </section>
    <section className="home-status-grid"><div className="progress-card"><div><span className="section-kicker">جاهز للتعلّم</span><h2>خطوتك القادمة تبدأ هنا</h2><p>اختر تمريناً أو راجع شرحاً سابقاً.</p><AiStatusChip /></div><div className="progress-ring"><span>✓</span></div></div><div className="continue-slot"><ContinueCard /></div></section>
    <section className="quick-grid" aria-label="اختصارات الموقع">{QUICK.map((item) => <Link href={item.href} key={item.href} className={`quick-card ${item.tone}`}><span className="quick-icon">{item.icon}</span><span><b>{item.title}</b><small>{item.sub}</small></span><span className="quick-arrow">←</span></Link>)}</section>
    <section className="home-lower-grid"><div className="card home-info-card"><div className="section-heading"><h2>كيف يساعدك المساعد؟</h2><span>✦</span></div><div className="feature-row"><span>①</span><div><b>افهم السؤال</b><p>راجع نص التمرين وحدد المادة والمستوى.</p></div></div><div className="feature-row"><span>②</span><div><b>تعلّم خطوة بخطوة</b><p>اطلب تلميحاً أو شرحاً أو تحققاً من إجابتك.</p></div></div><div className="feature-row"><span>③</span><div><b>احتفظ بتقدمك</b><p>ارجع إلى سجل التمارين متى احتجت.</p></div></div></div><div className="daily-tip"><span className="tip-bulb">✦</span><div><b>نصيحة اليوم</b><p>الممارسة المستمرة هي مفتاح التفوق في التعلّم.</p></div></div></section>
  </div>;
}
