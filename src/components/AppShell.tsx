"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useOnline } from "@/lib/client/hooks";
import { useAuth } from "./AuthProvider";

const NAV = [
  { href: "/", label: "الرئيسية", icon: "🏠" },
  { href: "/new", label: "تمرين جديد", icon: "✏️" },
  { href: "/history", label: "السجل", icon: "🗂️" },
  { href: "/library", label: "المكتبة", icon: "📚" },
  { href: "/settings", label: "حسابي", icon: "👤" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const online = useOnline();
  const { user } = useAuth();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <div className="flex min-h-dvh flex-col">
      {!online && (
        <div role="status" className="bg-amber-100 px-4 py-2 text-center text-sm font-bold text-amber-900">
          أنت غير متصل بالإنترنت. يمكنك مراجعة تمارينك المحفوظة وكتابة تمارين جديدة؛ طلبات الذكاء الاصطناعي تحتاج اتصالاً.
        </div>
      )}
      <header className="sticky top-0 z-30 border-b border-stone-200 bg-[#f7f5ef]/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="flex items-center gap-2">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-teal-700 text-xl text-white">م</span>
            <span className="leading-tight">
              <span className="block text-lg font-extrabold text-teal-900">المساعد</span>
              <span className="block text-[11px] font-bold tracking-widest text-stone-500">AL MOUASSID</span>
            </span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex" aria-label="التنقل الرئيسي">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={`rounded-xl px-3 py-2 text-sm font-bold ${active(n.href) ? "bg-teal-700 text-white" : "text-stone-700 hover:bg-stone-200/60"}`}
              >
                {n.label}
              </Link>
            ))}
            <Link href="/status" className={`rounded-xl px-3 py-2 text-sm font-bold ${active("/status") ? "bg-teal-700 text-white" : "text-stone-700 hover:bg-stone-200/60"}`}>
              حالة الخدمات
            </Link>
            {user?.role === "admin" && (
              <Link href="/admin/providers" className={`rounded-xl px-3 py-2 text-sm font-bold ${active("/admin") ? "bg-amber-500 text-white" : "text-amber-800 hover:bg-amber-100"}`}>
                الإدارة
              </Link>
            )}
          </nav>
          {user ? (
            <Link href="/settings" className="chip hidden md:inline-flex">
              👤 {user.name}
            </Link>
          ) : (
            <Link href="/login" className="btn-soft !min-h-10 !px-4 !py-2 text-sm">
              دخول
            </Link>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-28 pt-6 md:pb-12">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-stone-200 bg-white/95 backdrop-blur md:hidden" aria-label="التنقل السفلي">
        <ul className="mx-auto grid max-w-md grid-cols-5">
          {NAV.map((n) => (
            <li key={n.href}>
              <Link href={n.href} className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-bold ${active(n.href) ? "text-teal-800" : "text-stone-500"}`}>
                <span className={`grid h-8 w-12 place-items-center rounded-full text-lg ${active(n.href) ? "bg-teal-100" : ""}`}>{n.icon}</span>
                {n.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
