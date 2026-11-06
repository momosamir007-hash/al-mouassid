import Link from "next/link";

export default function OfflinePage() {
  return (
    <div className="card mx-auto max-w-lg space-y-3 text-center">
      <div className="text-5xl">📴</div>
      <h1 className="text-2xl font-extrabold">أنت غير متصل</h1>
      <p className="text-stone-600">هذه الصفحة لم تُحفظ بعد على جهازك. يمكنك فتح الصفحات التي زرتها سابقاً أو الرجوع إلى القائمة.</p>
      <div className="flex flex-wrap justify-center gap-3">
        <Link href="/history" className="btn-primary">
          سجل التمارين
        </Link>
        <Link href="/library" className="btn-soft">
          المكتبة
        </Link>
      </div>
    </div>
  );
}
