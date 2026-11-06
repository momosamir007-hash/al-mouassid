"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { api } from "@/lib/client/api";
import { clearAllLocal, setPrefs, unsyncedCount, usePrefs, useExercises } from "@/lib/client/exerciseStore";
import { useOnline } from "@/lib/client/hooks";
import { LEVELS } from "@/lib/constants";

export default function SettingsPage() {
  const router = useRouter();
  const { user, loading, setUser, logout, syncNow, syncing, syncMessage, refresh } = useAuth();
  const prefs = usePrefs();
  const list = useExercises();
  const online = useOnline();
  const [name, setName] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function saveProfile(patch: { name?: string; defaultLevel?: string | null }) {
    try {
      const r = await api<{ user: typeof user }>("/api/auth/me", { method: "PATCH", json: patch });
      if (r.user) setUser(r.user);
      setMsg("تم الحفظ.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "تعذّر الحفظ");
    }
  }

  async function deleteAccount() {
    const password = prompt("لحذف حسابك وكل بياناتك نهائياً اكتب كلمة المرور:");
    if (!password) return;
    try {
      await api("/api/auth/me", { method: "DELETE", json: { password } });
      clearAllLocal();
      localStorage.removeItem("mouassid:owner:v1");
      await refresh();
      router.push("/");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "تعذّر الحذف");
    }
  }

  async function doLogout() {
    const pending = unsyncedCount();
    if (pending > 0 && !online && !confirm(`لديك ${pending} عنصر غير متزامن ولا يوجد اتصال؛ سيُحذف من هذا الجهاز عند الخروج. المتابعة؟`)) return;
    await logout();
    router.push("/");
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <h1 className="text-2xl font-extrabold">حسابي وإعداداتي</h1>
      {msg && <p className="rounded-2xl bg-teal-50 p-3 text-sm font-bold text-teal-900">{msg}</p>}

      <section className="card space-y-3">
        <h2 className="text-lg font-extrabold">الحساب</h2>
        {loading ? (
          <p className="text-stone-500">…</p>
        ) : user ? (
          <>
            <p className="text-stone-600" dir="auto">
              {user.email} · {user.role === "admin" ? "صاحب المنصة (مدير)" : "متعلّم"}
            </p>
            <div>
              <label className="label" htmlFor="nm">
                الاسم أو اللقب
              </label>
              <div className="flex gap-2">
                <input id="nm" className="input" value={name ?? user.name} onChange={(e) => setName(e.target.value)} maxLength={40} />
                <button className="btn-soft" disabled={!name?.trim()} onClick={() => saveProfile({ name: name!.trim() })}>
                  حفظ
                </button>
              </div>
            </div>
            <div>
              <label className="label" htmlFor="dl">
                المستوى الافتراضي
              </label>
              <select id="dl" className="input" value={user.defaultLevel ?? ""} onChange={(e) => saveProfile({ defaultLevel: e.target.value || null })}>
                <option value="">—</option>
                {LEVELS.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap gap-2">
              {user.role === "admin" && (
                <Link href="/admin/providers" className="btn-soft">
                  ⚙️ إدارة المزودين
                </Link>
              )}
              <button className="btn-ghost" onClick={doLogout}>
                تسجيل الخروج
              </button>
            </div>
          </>
        ) : (
          <div className="space-y-2">
            <p className="text-stone-600">أنت تستخدم التطبيق كضيف. الحساب يفعّل المساعد الذكي والمزامنة بين الأجهزة.</p>
            <div className="flex gap-2">
              <Link href="/login" className="btn-primary">
                دخول
              </Link>
              <Link href="/register" className="btn-soft">
                حساب جديد
              </Link>
            </div>
          </div>
        )}
      </section>

      <section className="card space-y-3">
        <h2 className="text-lg font-extrabold">العرض</h2>
        <label className="flex items-center gap-3 font-bold">
          <input type="checkbox" className="h-5 w-5 accent-teal-700" checked={prefs.showProvider} onChange={(e) => setPrefs({ showProvider: e.target.checked })} />
          إظهار اسم المزود الذي عالج كل رد (محلي/خارجي)
        </label>
      </section>

      <section className="card space-y-3">
        <h2 className="text-lg font-extrabold">بياناتي</h2>
        <p className="text-stone-600">على هذا الجهاز {list.length} تمرين.</p>
        {user && (
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-soft" disabled={syncing || !online} onClick={() => syncNow()}>
              {syncing ? "جارٍ المزامنة…" : "🔄 مزامنة الآن"}
            </button>
            {syncMessage && <span className="text-sm text-stone-500">{syncMessage}</span>}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            className="btn-ghost text-rose-700"
            onClick={() => {
              if (confirm("حذف كل التمارين من هذا الجهاز فقط؟ (قد تعود عند المزامنة إن كانت محفوظة في حسابك)")) clearAllLocal();
            }}
          >
            حذف السجل المحلي
          </button>
          {user && (
            <>
              <button
                className="btn-ghost text-rose-700"
                disabled={!online}
                onClick={async () => {
                  if (!confirm("حذف كل سجلك من الخادم ومن هذا الجهاز؟")) return;
                  await api("/api/exercises", { method: "DELETE" });
                  clearAllLocal();
                  setMsg("حُذف السجل من الخادم والجهاز.");
                }}
              >
                حذف السجل من الخادم والجهاز
              </button>
              <button className="btn-danger" disabled={!online} onClick={deleteAccount}>
                حذف الحساب نهائياً
              </button>
            </>
          )}
        </div>
      </section>

      <section className="card space-y-2 text-sm text-stone-600">
        <h2 className="text-lg font-extrabold text-stone-900">الخصوصية</h2>
        <ul className="list-disc space-y-1 ps-5">
          <li>عند طلب المساعدة يُرسل نص التمرين إلى مزود ذكاء اصطناعي، وقد يكون خارجياً (OpenAI/Google/Anthropic) أو محلياً على خادم المنصة.</li>
          <li>نحذف البريد الإلكتروني وأرقام الهاتف الظاهرة من النص قبل إرساله.</li>
          <li>صور التمارين لا تُحفظ؛ تُعالج في المتصفح (OCR) وتُرسل مع الطلب فقط إن اخترت ذلك.</li>
          <li>أسرار المزودين لا تصل إلى المتصفح أبداً، وسجلات الأخطاء لا تتضمن نصوصك.</li>
          <li>يمكنك حذف سجلك وحسابك في أي وقت.</li>
        </ul>
      </section>
    </div>
  );
}
