"use client";

import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { ProvidersAdmin } from "@/components/admin/ProvidersAdmin";
import { SubjectsAdmin } from "@/components/admin/SubjectsAdmin";

export default function AdminProvidersPage() {
  const { user, loading } = useAuth();
  const [tab, setTab] = useState<"providers" | "subjects">("providers");

  if (loading) return <p className="text-center text-stone-500">…</p>;
  if (!user || user.role !== "admin") {
    return (
      <div className="card mx-auto max-w-md space-y-3 text-center">
        <div className="text-4xl">🔒</div>
        <h1 className="text-xl font-extrabold">هذه الصفحة لصاحب المنصة فقط</h1>
        <p className="text-stone-600">صلاحية المدير تُمنح فقط برمز تأسيس خادمي لمرة واحدة أو بواسطة مدير حالي.</p>
        <Link href={user ? "/" : "/login?next=/admin/providers"} className="btn-primary mx-auto">
          {user ? "الرئيسية" : "تسجيل الدخول"}
        </Link>
      </div>
    );
  }
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold">لوحة الإدارة</h1>
      <div className="flex gap-2">
        <button className={tab === "providers" ? "btn-primary" : "btn-ghost"} onClick={() => setTab("providers")}>
          مزودو الذكاء الاصطناعي
        </button>
        <button className={tab === "subjects" ? "btn-primary" : "btn-ghost"} onClick={() => setTab("subjects")}>
          المواد الدراسية
        </button>
      </div>
      {tab === "providers" ? <ProvidersAdmin /> : <SubjectsAdmin />}
    </div>
  );
}
