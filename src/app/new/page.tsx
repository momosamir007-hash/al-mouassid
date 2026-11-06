"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { assessClarity } from "@/lib/clarity";
import { LEVELS } from "@/lib/constants";
import { createExercise, setPrefs, usePrefs } from "@/lib/client/exerciseStore";
import { useSubjects } from "@/lib/client/hooks";

type Step = "level" | "subject" | "exercise";

export default function NewExercisePage() {
  const router = useRouter();
  const prefs = usePrefs();
  const { user } = useAuth();
  const subjects = useSubjects();
  const [step, setStep] = useState<Step>("level");
  const [text, setText] = useState("");

  const level = prefs.level ?? user?.defaultLevel ?? null;
  const availableSubjects = subjects.filter((s) => !level || s.levels.includes(level));
  const subject = subjects.find((s) => s.slug === prefs.subject);
  const clarity = text.trim() ? assessClarity(text) : null;

  const steps: { id: Step; label: string }[] = [
    { id: "level", label: "المستوى" },
    { id: "subject", label: "المادة" },
    { id: "exercise", label: "التمرين" },
  ];

  function start() {
    if (!level || !prefs.subject || !text.trim()) return;
    const ex = createExercise({ level, subject: prefs.subject, text });
    router.push(`/solve?id=${encodeURIComponent(ex.id)}`);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <ol className="flex items-center gap-2" aria-label="الخطوات">
        {steps.map((s, i) => (
          <li key={s.id} className="flex flex-1 items-center gap-2">
            <button
              onClick={() => (s.id === "level" || (s.id === "subject" && level) || (s.id === "exercise" && level && prefs.subject) ? setStep(s.id) : undefined)}
              className={`flex-1 rounded-2xl px-3 py-2 text-center text-sm font-bold ${step === s.id ? "bg-teal-700 text-white" : "bg-white text-stone-500 ring-1 ring-stone-200"}`}
            >
              {i + 1}. {s.label}
            </button>
          </li>
        ))}
      </ol>

      {step === "level" && (
        <section className="space-y-3">
          <h1 className="text-2xl font-extrabold">ما مستواك الدراسي؟</h1>
          <div className="grid gap-3 sm:grid-cols-2">
            {LEVELS.map((l) => (
              <button
                key={l.id}
                onClick={() => {
                  setPrefs({ level: l.id, subject: null });
                  setStep("subject");
                }}
                className={`card text-start transition hover:-translate-y-0.5 ${level === l.id ? "ring-2 ring-teal-600" : ""}`}
              >
                <div className="text-3xl">{l.emoji}</div>
                <div className="mt-1 text-xl font-extrabold">{l.label}</div>
                <div className="text-sm text-stone-600">{l.desc}</div>
              </button>
            ))}
          </div>
        </section>
      )}

      {step === "subject" && (
        <section className="space-y-3">
          <h1 className="text-2xl font-extrabold">ما المادة؟</h1>
          <div className="grid grid-cols-2 gap-3">
            {availableSubjects.map((s) => (
              <button
                key={s.slug}
                onClick={() => {
                  setPrefs({ subject: s.slug });
                  setStep("exercise");
                }}
                className={`card text-start transition hover:-translate-y-0.5 ${prefs.subject === s.slug ? "ring-2 ring-teal-600" : ""}`}
              >
                <div className="text-3xl">{s.icon}</div>
                <div className="mt-1 text-lg font-extrabold">{s.nameAr}</div>
              </button>
            ))}
          </div>
          <button className="btn-ghost" onClick={() => setStep("level")}>
            ← تغيير المستوى
          </button>
        </section>
      )}

      {step === "exercise" && (
        <section className="space-y-4">
          <h1 className="text-2xl font-extrabold">اكتب تمرينك أو صوّره</h1>
          <p className="text-stone-600">
            {LEVELS.find((l) => l.id === level)?.label} · {subject?.icon} {subject?.nameAr}{" "}
            <button className="font-bold text-teal-700 underline" onClick={() => setStep("level")}>
              تغيير
            </button>
          </p>
          <div className="card space-y-3">
            <label className="label" htmlFor="ex">
              نص التمرين
            </label>
            <textarea
              id="ex"
              rows={6}
              className="input"
              placeholder="مثال: احسب 12 + 7 × 3"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            {clarity && !clarity.clear && (
              <ul className="rounded-2xl bg-amber-50 p-3 text-sm text-amber-900">
                {clarity.reasons.map((r) => (
                  <li key={r}>⚠️ {r}</li>
                ))}
              </ul>
            )}
            <button className="btn-primary w-full" disabled={!text.trim()} onClick={start}>
              ابدأ المساعدة ←
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Link href="/capture" className="btn-soft">
              📷 تصوير بالكاميرا
            </Link>
            <Link href="/capture?source=file" className="btn-soft">
              🖼️ صورة من الجهاز
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
