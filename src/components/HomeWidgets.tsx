"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { levelLabel } from "@/lib/constants";
import { useExercises } from "@/lib/client/exerciseStore";

export function ContinueCard() {
  const list = useExercises();
  const last = list[0];
  if (!last) return null;
  return (
    <Link href={`/solve?id=${encodeURIComponent(last.id)}`} className="card block transition hover:-translate-y-0.5">
      <p className="text-sm font-bold text-teal-700">تابع من حيث توقفت</p>
      <p className="mt-1 line-clamp-2 text-lg font-extrabold">{last.title}</p>
      <p className="mt-1 text-sm text-stone-500">
        {levelLabel(last.level)} · {last.messages.filter((m) => m.role === "assistant").length} رد مساعدة
      </p>
    </Link>
  );
}

interface StatusLite {
  aiAvailable: boolean;
  providers: { state: string; isLocal: boolean }[];
}

export function AiStatusChip() {
  const [s, setS] = useState<StatusLite | null | "error">(null);
  useEffect(() => {
    fetch("/api/status")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j: StatusLite) => setS(j))
      .catch(() => setS("error"));
  }, []);
  let text = "جارٍ فحص الخدمات…";
  let tone = "bg-stone-100 text-stone-600";
  if (s === "error") {
    text = "تعذّر فحص الخدمات (قد تكون غير متصل)";
    tone = "bg-amber-100 text-amber-900";
  } else if (s) {
    const ready = s.providers.filter((p) => p.state === "ready" || p.state === "untested").length;
    if (s.aiAvailable) {
      text = `المساعد الذكي متاح (${ready} مزود مفعّل)`;
      tone = "bg-emerald-100 text-emerald-900";
    } else {
      text = "المساعد الذكي غير متاح الآن — يمكنك كتابة التمارين وحفظها";
      tone = "bg-rose-100 text-rose-900";
    }
  }
  return (
    <Link href="/status" className={`chip ${tone}`}>
      ● {text}
    </Link>
  );
}
