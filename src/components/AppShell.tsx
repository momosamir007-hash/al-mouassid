"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useOnline } from "@/lib/client/hooks";
import { useAuth } from "./AuthProvider";

const NAV = [
  { href: "/", label: "الرئيسية", icon: "⌂" },
  { href: "/new", label: "تمرين جديد", icon: "✎" },
  { href: "/solve", label: "حل التمارين", icon: "▦" },
  { href: "/capture", label: "التصوير", icon: "▣" },
  { href: "/history", label: "سجل الشروحات", icon: "◷" },
  { href: "/library", label: "المكتبة", icon: "▤" },
  { href: "/settings", label: "الإعدادات", icon: "⚙" },
  { href: "/status", label: "حالة الخدمات", icon: "ⓘ" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const online = useOnline();
  const { user } = useAuth();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  const authPage = path === "/login" || path === "/register";

  return (
    <div className={`app-frame min-h-dvh ${authPage ? "auth-frame" : ""}`}>
      {!online && <div role="status" className="offline-banner">أنت غير متصل بالإنترنت. يمكنك مراجعة تمارينك المحفوظة؛ طلبات الذكاء الاصطناعي تحتاج اتصالاً.</div>}
      <header className="app-header">
        <Link href="/" className="brand-lockup" aria-label="المساعد - الرئيسية">
          <span className="brand-mark">م</span>
          <span><b>المساعد</b><small>مساعدك الذكي في التعلّم</small></span>
        </Link>
        <div className="header-search" aria-hidden="true">ابحث عن تمرين أو موضوع… <span>⌕</span></div>
        <div className="header-actions">
          {user ? <Link href="/settings" className="profile-pill"><span className="profile-avatar">{user.name?.slice(0, 1) || "ط"}</span><span><b>{user.name}</b><small>حساب الطالب</small></span></Link> : <Link href="/login" className="header-login">تسجيل الدخول</Link>}
        </div>
      </header>
      <div className="app-layout">
        {!authPage && <aside className="sidebar"><div className="sidebar-title">القائمة الرئيسية</div><nav aria-label="التنقل الرئيسي">{NAV.map((n) => <Link key={n.href} href={n.href} className={`sidebar-link ${active(n.href) ? "is-active" : ""}`}><span className="sidebar-icon">{n.icon}</span><span>{n.label}</span></Link>)}{user?.role === "admin" && <Link href="/admin/providers" className={`sidebar-link ${active("/admin") ? "is-active" : ""}`}><span className="sidebar-icon">⚙</span><span>الإدارة</span></Link>}</nav><div className="sidebar-tip"><span>💡</span><b>معلومة سريعة</b><p>تعلّم بذكاء، وتقدّم خطوة بخطوة نحو أهدافك.</p></div></aside>}
        <main className={`app-main ${authPage ? "auth-main" : ""}`}>{children}</main>
      </div>
      {!authPage && <nav className="mobile-nav" aria-label="التنقل السفلي">{NAV.slice(0, 5).map((n) => <Link key={n.href} href={n.href} className={active(n.href) ? "is-active" : ""}><span>{n.icon}</span><small>{n.label}</small></Link>)}</nav>}
    </div>
  );
}
