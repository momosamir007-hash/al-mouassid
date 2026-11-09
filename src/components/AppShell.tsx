"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useOnline } from "@/lib/client/hooks";
import { useAuth } from "./AuthProvider";

type IconName = "home" | "calculator" | "camera" | "history" | "book" | "settings" | "info" | "activity" | "user" | "shield" | "plus" | "wifi";
function Icon({ name, size = 21 }: { name: IconName; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true as const };
  const paths: Record<IconName, ReactNode> = {
    home: <><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z" /></>,
    calculator: <><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 19h.01M12 19h.01M16 19h.01"/></>,
    camera: <><path d="M14 4h-4L8 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-4z"/><circle cx="12" cy="13" r="4"/></>,
    history: <><path d="M3 12a9 9 0 1 0 2.6-6.4L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/></>,
    book: <><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v18H6.5A2.5 2.5 0 0 0 4 22z"/><path d="M4 4.5V22M8 6h8M8 10h8"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.6a8 8 0 0 1-1.7 1l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.7-1l-1.7.6-1.4-2.4L7.3 15a8 8 0 0 1 0-2l-1.4-1.1 1.4-2.4 1.7.6a8 8 0 0 1 1.7-1l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.7 1l1.7-.6 1.4 2.4-1.4 1.1a8 8 0 0 1-.1 2z"/></>,
    info: <><circle cx="12" cy="12" r="10"/><path d="M12 11v5M12 7h.01"/></>,
    activity: <><path d="M3 12h4l3-8 4 16 3-8h4"/></>,
    user: <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
    shield: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11z"/><path d="m9 12 2 2 4-4"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    wifi: <><path d="M5 12.5a11 11 0 0 1 14 0M2 9a16 16 0 0 1 20 0M8.5 16a5 5 0 0 1 7 0M12 20h.01"/></>,
  };
  return <svg {...common}>{paths[name]}</svg>;
}

const NAV: { href: string; label: string; icon: IconName }[] = [
  { href: "/", label: "الرئيسية", icon: "home" },
  { href: "/new", label: "حل التمارين", icon: "calculator" },
  { href: "/capture", label: "التصوير", icon: "camera" },
  { href: "/history", label: "سجل الشروحات", icon: "history" },
  { href: "/library", label: "المكتبة", icon: "book" },
  { href: "/settings", label: "الإعدادات", icon: "settings" },
  { href: "/status", label: "حالة الخدمات", icon: "activity" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const online = useOnline();
  const { user } = useAuth();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  const links = user?.role === "admin" ? [...NAV, { href: "/admin/providers", label: "الإدارة", icon: "shield" as const }] : NAV;
  const authPage = path === "/login" || path === "/register";

  return (
    <div className={`app-frame ${authPage ? "app-frame-auth" : ""}`}>
      {!online && <div role="status" className="offline-banner">أنت غير متصل بالإنترنت. يمكنك مراجعة تمارينك المحفوظة؛ طلبات الذكاء الاصطناعي تحتاج اتصالاً.</div>}
      <header className="topbar">
        <Link href="/" className="brand" aria-label="المساعد - الرئيسية">
          <span className="brand-mark"><Icon name="book" size={25}/><span className="brand-cap">◆</span></span>
          <span><strong>المساعد</strong><small>تعلّم بذكاء .. وافهم بنفسك</small></span>
        </Link>
        <div className="topbar-tools">
          {user ? <Link href="/settings" className="profile-pill"><span className="profile-avatar"><Icon name="user" size={19}/></span><span><b>{user.name}</b><small>{user.role === "admin" ? "مدير النظام" : "حساب المتعلم"}</small></span></Link> : <Link href="/login" className="top-login">تسجيل الدخول</Link>}
        </div>
      </header>

      <div className="app-layout">
        {!authPage && <aside className="sidebar">
          <div className="sidebar-label">القائمة الرئيسية</div>
          <nav aria-label="التنقل الرئيسي" className="sidebar-nav">
            {links.map((item) => <Link key={item.href} href={item.href} className={`sidebar-link ${active(item.href) ? "is-active" : ""}`} aria-current={active(item.href) ? "page" : undefined}>
              <Icon name={item.icon}/><span>{item.label}</span>{active(item.href) && <i/>}
            </Link>)}
          </nav>
          <div className="sidebar-note"><span className="sidebar-note-icon">✦</span><b>خطوتك نحو التفوق</b><p>تعلّم بذكاء، وتقدّم خطوة بخطوة.</p></div>
          <div className="sidebar-foot"><span className={`online-dot ${online ? "" : "offline"}`}/>{online ? "متصل بالإنترنت" : "غير متصل"}</div>
        </aside>}

        <main className={`main-content ${authPage ? "main-content-auth" : ""}`}>
          {children}
          {!authPage && <footer className="app-footer"><span>© المساعد — جميع الحقوق محفوظة</span><span>معًا نحو التميز في التعلّم</span></footer>}
        </main>
      </div>

      {!authPage && <nav className="mobile-nav" aria-label="التنقل السفلي">
        {NAV.slice(0, 5).map((item) => <Link key={item.href} href={item.href} className={active(item.href) ? "is-active" : ""}><Icon name={item.icon} size={20}/><span>{item.label}</span></Link>)}
      </nav>}
    </div>
  );
}
