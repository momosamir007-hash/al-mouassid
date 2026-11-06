import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { AuthProvider } from "@/components/AuthProvider";
import { SwRegister } from "@/components/SwRegister";
import "./globals.css";

export const metadata: Metadata = {
  title: "المساعد – AL MOUASSID",
  description: "مساعد تعليمي ذكي يساعدك على فهم التمارين وحلها تدريجياً بدل إعطائك الإجابة مباشرة.",
  manifest: "/manifest.webmanifest",
  applicationName: "المساعد",
  appleWebApp: { capable: true, title: "المساعد", statusBarStyle: "default" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/icon-192.png" },
};

export const viewport: Viewport = {
  themeColor: "#0f766e",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body className="antialiased">
        <AuthProvider>
          <AppShell>{children}</AppShell>
        </AuthProvider>
        <SwRegister />
      </body>
    </html>
  );
}
