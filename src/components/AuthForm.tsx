"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api, ApiClientError } from "@/lib/client/api";
import { LEVELS } from "@/lib/constants";
import { useAuth, type User } from "./AuthProvider";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const params = useSearchParams();
  const { setUser } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isRegister = mode === "register";

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ user: User }>(`/api/auth/${mode}`, {
        method: "POST",
        json: {
          email: String(fd.get("email")),
          password: String(fd.get("password")),
          ...(isRegister ? { name: String(fd.get("name")), level: fd.get("level") || undefined } : {}),
        },
      });
      setUser(res.user);
      const next = params.get("next");
      router.push(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
    } catch (err) {
      if (err instanceof ApiClientError && err.code === "validation") setError("تحقق من البيانات: البريد صحيح وكلمة المرور 8 أحرف على الأقل.");
      else setError(err instanceof Error ? err.message : "حدث خطأ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-card-wrap mx-auto max-w-md">
      <div className="auth-visual">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/books-illustration.svg" alt="كتب دراسية وقبعة تخرج" />
        <div><b>مرحباً بك في المساعد</b><span>خطوتك نحو فهم أفضل تبدأ هنا</span></div>
      </div>
      <form onSubmit={submit} className="card space-y-4">
        <h1 className="text-2xl font-extrabold">{isRegister ? "إنشاء حساب" : "تسجيل الدخول"}</h1>
        {isRegister && (
          <>
            <div>
              <label className="label" htmlFor="name">
                الاسم أو اللقب (لا تكتب اسمك الكامل)
              </label>
              <input id="name" name="name" required maxLength={40} className="input" autoComplete="nickname" />
            </div>
            <div>
              <label className="label" htmlFor="level">
                المستوى الدراسي
              </label>
              <select id="level" name="level" className="input" defaultValue="">
                <option value="">— اختياري —</option>
                {LEVELS.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}
        <div>
          <label className="label" htmlFor="email">
            البريد الإلكتروني
          </label>
          <input id="email" name="email" type="email" required dir="ltr" className="input text-start" autoComplete="email" />
        </div>
        <div>
          <label className="label" htmlFor="password">
            كلمة المرور {isRegister && "(8 أحرف على الأقل)"}
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={isRegister ? 8 : 1}
            dir="ltr"
            className="input text-start"
            autoComplete={isRegister ? "new-password" : "current-password"}
          />
        </div>
        {isRegister && (
          <p className="text-xs text-stone-500">
            نجمع الحد الأدنى من البيانات (بريد، لقب، مستوى). إذا كان عمرك أقل من 13 سنة فأنشئ الحساب بإشراف ولي أمرك. لا نبيع بياناتك ولا نخزّن صور التمارين.
          </p>
        )}
        {error && (
          <p role="alert" className="rounded-2xl bg-rose-50 p-3 text-sm font-bold text-rose-900">
            {error}
          </p>
        )}
        <button className="btn-primary w-full" disabled={busy}>
          {busy ? "…" : isRegister ? "إنشاء الحساب" : "دخول"}
        </button>
        <p className="text-center text-sm text-stone-600">
          {isRegister ? (
            <>
              لديك حساب؟ <Link href="/login" className="font-bold text-teal-700 underline">سجّل الدخول</Link>
            </>
          ) : (
            <>
              لا تملك حساباً؟ <Link href="/register" className="font-bold text-teal-700 underline">أنشئ حساباً</Link>
            </>
          )}
        </p>
      </form>
    </div>
  );
}
