"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { LEVELS } from "@/lib/constants";

interface Subject {
  id: number;
  slug: string;
  nameAr: string;
  icon: string;
  levels: string[];
  sortOrder: number;
  enabled: boolean;
}

export function SubjectsAdmin() {
  const [list, setList] = useState<Subject[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [n, setN] = useState({ slug: "", nameAr: "", icon: "📘", levels: ["secondary"] as string[] });

  const load = useCallback(async () => {
    try {
      // نضمن البذر الأولي عبر الواجهة العامة ثم نقرأ القائمة الكاملة
      await fetch("/api/subjects");
      setList((await api<{ subjects: Subject[] }>("/api/admin/subjects")).subjects);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذّر التحميل");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function add() {
    setError(null);
    try {
      await api("/api/admin/subjects", { method: "POST", json: { ...n, sortOrder: 200 } });
      setN({ slug: "", nameAr: "", icon: "📘", levels: ["secondary"] });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذّر الإضافة");
    }
  }

  return (
    <div className="space-y-4">
      {error && <p className="card bg-rose-50 font-bold text-rose-900">{error}</p>}
      <section className="card space-y-3">
        <h2 className="text-lg font-extrabold">إضافة مادة</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <input className="input" placeholder="الاسم بالعربية" value={n.nameAr} onChange={(e) => setN({ ...n, nameAr: e.target.value })} />
          <input className="input text-start" dir="ltr" placeholder="slug-latin" value={n.slug} onChange={(e) => setN({ ...n, slug: e.target.value })} />
          <input className="input" placeholder="أيقونة" value={n.icon} onChange={(e) => setN({ ...n, icon: e.target.value })} />
        </div>
        <div className="flex flex-wrap gap-3">
          {LEVELS.map((l) => (
            <label key={l.id} className="flex items-center gap-2 font-bold">
              <input
                type="checkbox"
                className="h-5 w-5 accent-teal-700"
                checked={n.levels.includes(l.id)}
                onChange={(e) => setN({ ...n, levels: e.target.checked ? [...n.levels, l.id] : n.levels.filter((x) => x !== l.id) })}
              />
              {l.label}
            </label>
          ))}
        </div>
        <button className="btn-primary" disabled={!n.slug || !n.nameAr || n.levels.length === 0} onClick={add}>
          إضافة
        </button>
      </section>
      <section className="space-y-2">
        {list.map((s) => (
          <div key={s.id} className="card flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-extrabold">
                {s.icon} {s.nameAr} <span className="text-xs font-normal text-stone-400">({s.slug})</span>
              </p>
              <p className="text-sm text-stone-500">{s.levels.map((l) => LEVELS.find((x) => x.id === l)?.label).join("، ")}</p>
            </div>
            <div className="flex gap-2">
              <button
                className="btn-ghost !min-h-10 !py-2 text-sm"
                onClick={async () => {
                  await api(`/api/admin/subjects/${s.id}`, { method: "PATCH", json: { enabled: !s.enabled } });
                  await load();
                }}
              >
                {s.enabled ? "تعطيل" : "تفعيل"}
              </button>
              <button
                className="btn-ghost !min-h-10 !py-2 text-sm text-rose-700"
                onClick={async () => {
                  if (!confirm("حذف المادة؟")) return;
                  await api(`/api/admin/subjects/${s.id}`, { method: "DELETE" });
                  await load();
                }}
              >
                حذف
              </button>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
