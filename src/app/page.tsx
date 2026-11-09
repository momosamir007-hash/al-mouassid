"use client";

import Link from "next/link";
import Image from "next/image";
import { AiStatusChip } from "@/components/HomeWidgets";
import { useExercises } from "@/lib/client/exerciseStore";
import { useSubjects } from "@/lib/client/hooks";

function TileIcon({ type }: { type: "camera" | "calc" | "book" | "history" | "trophy" | "check" | "chart" }) {
  const paths = {
    camera: <><path d="M14 4h-4L8 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-4z"/><circle cx="12" cy="13" r="4"/></>,
    calc: <><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01"/></>,
    book: <><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v18H6.5A2.5 2.5 0 0 0 4 22z"/><path d="M4 4.5V22"/></>,
    history: <><path d="M3 12a9 9 0 1 0 2.6-6.4L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/></>,
    trophy: <><path d="M8 21h8M12 17v4M7 4h10v6a5 5 0 0 1-10 0zM7 6H4v2a4 4 0 0 0 4 4M17 6h3v2a4 4 0 0 1-4 4"/></>,
    check: <><circle cx="12" cy="12" r="10"/><path d="m8 12 3 3 5-6"/></>,
    chart: <><path d="M4 20V10M10 20V4M16 20v-7M22 20V7"/></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{paths[type]}</svg>;
}

export default function HomePage() {
  const exercises = useExercises();
  const subjects = useSubjects();
  const recent = exercises.slice(0, 3);
  const replies = exercises.reduce((sum, exercise) => sum + exercise.messages.filter((m) => m.role === "assistant").length, 0);

  return <div className="dashboard-stack">
    <section className="welcome-grid">
      <div className="welcome-banner">
        <div className="welcome-copy"><span className="eyebrow">منصتك التعليمية الذكية</span><h1>مرحباً بك في المساعد</h1><p>تعلّم بذكاء .. وافهم بنفسك</p><Link href="/new" className="welcome-cta">ابدأ الآن <span>←</span></Link></div>
        <div className="welcome-art" aria-hidden="true"><span className="math-symbol symbol-pi">π</span><span className="math-symbol symbol-x">x²</span><span className="math-symbol symbol-root">√</span><Image className="student-illustration" src="/images/student-photo.png" alt="طالب يحمل جهازًا لوحيًا ويستعد للتعلم" width={382} height={256} priority />
        <svg className="book-illustration" viewBox="0 0 260 210" fill="none"><path d="M28 142c42-18 75-16 103 3v43c-30-18-66-20-103-3z" fill="#087d75"/><path d="M131 145c31-18 66-20 102-3v43c-37-17-72-15-102 3z" fill="#075f60"/><path d="M28 142c42-18 75-16 103 3 31-18 66-20 102-3" stroke="#e9fff8" strokeWidth="5"/><path d="M35 130c39-16 68-13 96 5 29-18 60-20 94-5" stroke="#fff" strokeWidth="8" strokeLinecap="round"/><path d="M130 148v42" stroke="#f5c34b" strokeWidth="4"/><path d="M48 92 130 54l82 38-82 39z" fill="#064c59" stroke="#0d8f82" strokeWidth="4"/><path d="m48 92 82 39 82-39" stroke="#0b716d" strokeWidth="4"/><path d="M130 54v-17" stroke="#f6c64f" strokeWidth="3"/><path d="M130 37c-14-9-31-8-42 1 13 10 28 12 42 8 15 4 30 2 43-8-12-9-29-10-43-1" fill="#f5c34b"/><path d="M88 38v52" stroke="#f5c34b" strokeWidth="4"/><path d="M84 88h8l-4 16z" fill="#f5c34b"/></svg></div>
      </div>
      <section className="progress-card"><div className="progress-ring"><span>{exercises.length}</span></div><div><span className="progress-label">تمرين محفوظ</span><strong>تقدّمك الدراسي</strong><p>كل تمرين يقربك من هدفك</p><Link href="/history">عرض السجل ←</Link></div></section>
    </section>

    <div className="quick-actions">
      <Link href="/capture" className="quick-action quick-mint"><TileIcon type="camera"/><span><b>التصوير</b><small>واستخراج التمرين</small></span></Link>
      <Link href="/new" className="quick-action quick-green"><TileIcon type="calc"/><span><b>حل التمارين</b><small>ابدأ تمريناً جديداً</small></span></Link>
      <Link href="/library" className="quick-action quick-gold"><TileIcon type="book"/><span><b>المكتبة</b><small>الموارد التعليمية</small></span></Link>
      <Link href="/history" className="quick-action quick-blue"><TileIcon type="history"/><span><b>سجل الشروحات</b><small>راجع تمارينك السابقة</small></span></Link>
    </div>

    <div className="dashboard-columns">
      <section className="panel recent-panel"><header className="panel-heading"><h2><TileIcon type="history"/> آخر التمارين</h2><Link href="/history">عرض الكل ←</Link></header>
        {recent.length ? <div className="recent-list">{recent.map((exercise) => <Link href={`/solve?id=${encodeURIComponent(exercise.id)}`} key={exercise.id} className="recent-row"><span className="recent-doc"><TileIcon type="book"/></span><span className="recent-title">{exercise.title || exercise.text.slice(0, 72)}</span><small>{new Date(exercise.updatedAt).toLocaleDateString("ar-DZ")}</small></Link>)}</div> : <div className="empty-recent"><span className="empty-icon">✎</span><b>لم تبدأ أي تمرين بعد</b><p>ابدأ بتمرينك الأول وسيظهر هنا لتتمكن من العودة إليه بسهولة.</p><Link href="/new" className="panel-button">ابدأ تمريناً جديداً</Link></div>}
      </section>
      <section className="panel stats-panel"><header className="panel-heading"><h2><TileIcon type="chart"/> إحصائياتك</h2><span className="panel-subtitle">من نشاطك المحفوظ</span></header>
        <div className="stats-grid"><div className="stat-box stat-teal"><TileIcon type="book"/><strong>{exercises.length}</strong><span>تمرين محفوظ</span></div><div className="stat-box stat-blue"><TileIcon type="check"/><strong>{replies}</strong><span>رد مساعدة</span></div><div className="stat-box stat-violet"><TileIcon type="trophy"/><strong>{subjects.length}</strong><span>مادة متاحة</span></div></div>
        <div className="ai-status"><span>حالة المساعد الذكي</span><AiStatusChip/></div>
      </section>
    </div>
    <section className="daily-tip"><span className="tip-bulb">✦</span><div><b>نصيحة اليوم</b><p>الممارسة المستمرة والمراجعة خطوة بخطوة تساعدك على ترسيخ ما تتعلمه.</p></div></section>
  </div>;
}
