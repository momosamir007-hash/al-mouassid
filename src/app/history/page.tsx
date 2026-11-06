"use client";

import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { levelLabel } from "@/lib/constants";
import { clearAllLocal, removeExercise, useExercises } from "@/lib/client/exerciseStore";
import { api } from "@/lib/client/api";
import { useHydrated, useOnline, useSubjects } from "@/lib/client/hooks";

export default function HistoryPage() {
  const list = useExercises();
  const hydrated = useHydrated();
  const online = useOnline();
  const subjects = useSubjects();
  const { user, syncing, syncMessage, syncNow } = useAuth();
  const [q, setQ] = useState("");

  const filtered = list.filter((e) => !q.trim() || e.text.includes(q.trim()) || e.title.includes(q.trim()));
  const subjName = (slug: string) => subjects.find((s) => s.slug === slug)?.nameAr ?? slug;

  async function clearAll() {
    if (!confirm("حذف كل سجل التمارين من هذا الجهاز ومن الخادم؟ لا يمكن التراجع.")) return;
    if (user && online) {
      try {
        await api("/api/exercises", { method: "DELETE" });
        clearAllLocal();
        return;
      } catch {
        /* نكمل بالحذف المعلّق */
      }
    }
    // دون اتصال: نحذف محلياً ونسجّل الحذف ليُطبَّق على الخادم عند المزامنة
    for (const e of list) removeExercise(e.id);
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold">سجل التمارين</h1>
        <div className="flex items-center gap-2">
          {user && (
            <button className="btn-soft !min-h-10 !py-2 text-sm" disabled={syncing || !online} onClick={() => syncNow()}>
              {syncing ? "جارٍ المزامنة…" : "🔄 مزامنة"}
            </button>
          )}
          <Link href="/new" className="btn-primary !min-h-10 !py-2 text-sm">
            + تمرين جديد
          </Link>
        </div>
      </header>
      {syncMessage && user && <p className="text-sm text-stone-500">{syncMessage}</p>}
      {!user && hydrated && (
        <p className="rounded-2xl bg-teal-50 p-3 text-sm font-bold text-teal-900">
          سجلك محفوظ على هذا الجهاز فقط. <Link href="/login" className="underline">سجّل الدخول</Link> لمزامنته بين أجهزتك.
        </p>
      )}

      {list.length > 0 && <input className="input" placeholder="🔎 ابحث في التمارين…" value={q} onChange={(e) => setQ(e.target.value)} />}

      {hydrated && list.length === 0 && (
        <div className="card space-y-2 text-center">
          <div className="text-4xl">🗂️</div>
          <p className="text-stone-600">لا توجد تمارين محفوظة بعد.</p>
          <Link href="/new" className="btn-primary mx-auto">
            ابدأ أول تمرين
          </Link>
        </div>
      )}

      <ul className="space-y-3">
        {filtered.map((e) => (
          <li key={e.id} className="card flex items-center gap-3">
            <Link href={`/solve?id=${encodeURIComponent(e.id)}`} className="min-w-0 flex-1">
              <p className="truncate text-lg font-extrabold" dir="auto">
                {e.title}
              </p>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-stone-500">
                <span className="chip">{levelLabel(e.level)}</span>
                <span className="chip">{subjName(e.subject)}</span>
                <span>{new Date(e.updatedAt).toLocaleDateString("ar")}</span>
                <span>· {e.messages.filter((m) => m.role === "assistant").length} رد</span>
                {user && <span className={e.synced ? "text-emerald-700" : "text-amber-700"}>{e.synced ? "✓ متزامن" : "● بانتظار المزامنة"}</span>}
              </p>
            </Link>
            <button
              className="btn-ghost !min-h-10 !px-3 !py-2 text-rose-700"
              aria-label="حذف التمرين"
              onClick={() => {
                if (confirm("حذف هذا التمرين؟")) removeExercise(e.id);
              }}
            >
              🗑️
            </button>
          </li>
        ))}
      </ul>

      {list.length > 0 && (
        <button className="btn-ghost w-full text-rose-700" onClick={clearAll}>
          🗑️ حذف كل السجل
        </button>
      )}
    </div>
  );
}
