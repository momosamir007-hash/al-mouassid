"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { checkArithmeticAnswer, describeVerdict } from "@/lib/arith";
import { assessClarity } from "@/lib/clarity";
import { actionLabel, HELP_ACTIONS, levelLabel, type HelpActionId } from "@/lib/constants";
import { api, ApiClientError } from "@/lib/client/api";
import { addMessages, newId, updateExercise, useExercises, usePrefs, type LocalMessage } from "@/lib/client/exerciseStore";
import { useHydrated, useOnline, useSubjects } from "@/lib/client/hooks";
import { getHandoff } from "@/lib/client/image";
import { useAuth } from "./AuthProvider";
import { MiniCalculator } from "./MiniCalculator";
import { RichText } from "./RichText";

interface HelpResponse {
  userMessage: LocalMessage;
  message: LocalMessage;
  source: "ai" | "local";
  imageRequested: boolean;
  imageUsed: boolean;
  fallbacks: { name: string; reasonAr: string }[];
}

type Problem =
  | { kind: "unclear"; reasons: string[] }
  | { kind: "text"; text: string }
  | { kind: "no_provider"; text: string; attempts: { name: string; isLocal: boolean; outcome: string; reasonAr: string }[] };

export function SolveView() {
  const params = useSearchParams();
  const id = params.get("id");
  const exercises = useExercises();
  const ex = exercises.find((e) => e.id === id);
  const { user, loading } = useAuth();
  const online = useOnline();
  const prefs = usePrefs();
  const subjects = useSubjects();
  const hydrated = useHydrated();

  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState<HelpActionId | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [img, setImg] = useState<{ mime: "image/jpeg"; data: string; preview: string } | null>(null);
  const [attach, setAttach] = useState(true);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (id) {
       
      setImg(getHandoff(id));
    }
  }, [id]);

  const msgCount = ex?.messages.length ?? 0;
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgCount, busy]);

  if (!hydrated) return <p className="text-center text-stone-500">جارٍ التحميل…</p>;
  if (!id) return null;
  if (!ex) {
    return (
      <div className="card mx-auto max-w-lg space-y-3 text-center">
        <div className="text-4xl">🔎</div>
        <h1 className="text-xl font-extrabold">لم نجد هذا التمرين على هذا الجهاز</h1>
        <p className="text-stone-600">قد يكون محذوفاً، أو لم تتم مزامنته بعد على هذا الجهاز.</p>
        <div className="flex justify-center gap-3">
          <Link href="/history" className="btn-primary">
            سجل التمارين
          </Link>
          <Link href="/new" className="btn-soft">
            تمرين جديد
          </Link>
        </div>
      </div>
    );
  }

  const subject = subjects.find((s) => s.slug === ex.subject);
  const clarity = assessClarity(ex.text);

  function localCheck(): boolean {
    if (!ex) return false;
    const verdict = checkArithmeticAnswer(ex.text, answer);
    if (!verdict) return false;
    const now = Date.now();
    addMessages(ex.id, [
      { id: `l-${newId()}`, role: "user", action: "check_answer", content: `طلبي: ${actionLabel("check_answer")}\nإجابتي/محاولتي:\n${answer.trim()}`, createdAt: now },
      {
        id: `l-${newId()}`,
        role: "assistant",
        action: "check_answer",
        content: describeVerdict(verdict),
        provider: { name: "تحقق حسابي محلي", isLocal: true, model: "arith" },
        createdAt: now + 1,
      },
    ]);
    return true;
  }

  async function ask(action: HelpActionId) {
    if (!ex || busy) return;
    setProblem(null);
    setNotice(null);
    if (!clarity.clear) {
      setProblem({ kind: "unclear", reasons: clarity.reasons });
      return;
    }
    if (action === "check_answer" && !answer.trim()) {
      setProblem({ kind: "text", text: "اكتب إجابتك أولاً في الخانة ثم اضغط «تحقّق من إجابتي»." });
      return;
    }
    if (!online) {
      if (action === "check_answer" && localCheck()) {
        setNotice("تم التحقق حسابياً على جهازك دون ذكاء اصطناعي.");
        return;
      }
      setProblem({
        kind: "text",
        text: "أنت غير متصل بالإنترنت، والمساعدة الذكية تحتاج اتصالاً. تمرينك محفوظ، وسيعمل المساعد عند عودة الاتصال. (التحقق الحسابي البسيط متاح دون اتصال للتمارين الحسابية الخالصة.)",
      });
      return;
    }

    setBusy(action);
    try {
      const res = await api<HelpResponse>("/api/help", {
        method: "POST",
        json: {
          clientId: ex.id,
          level: ex.level,
          subject: ex.subject,
          exerciseText: ex.text,
          action,
          studentAnswer: answer.trim() || undefined,
          history: ex.messages.slice(-16).map((m) => ({ role: m.role, action: m.action, content: m.content })),
          image: img && attach ? { mime: img.mime, data: img.data } : undefined,
        },
      });
      addMessages(ex.id, [res.userMessage, res.message]);
      if (res.source === "local") setNotice("لا يتوفر مزود ذكاء حالياً؛ أُجريَ التحقق حسابياً دون ذكاء اصطناعي.");
      else if (res.imageRequested && !res.imageUsed) {
        setNotice("لا يتوفر الآن نموذج يدعم الصور، لذلك اعتمد المساعد على النص المكتوب فقط.");
      }
    } catch (e) {
      if (e instanceof ApiClientError) {
        if (e.status === 0) setProblem({ kind: "text", text: e.message });
        else if (e.code === "unclear") setProblem({ kind: "unclear", reasons: (e.data.reasons as string[]) ?? [e.message] });
        else if (e.code === "no_provider") {
          setProblem({
            kind: "no_provider",
            text: e.message,
            attempts: (e.data.attempts as { name: string; isLocal: boolean; outcome: string; reasonAr: string }[]) ?? [],
          });
        } else if (e.status === 401) {
          setProblem({ kind: "text", text: "انتهت جلستك. سجّل الدخول من جديد." });
        } else setProblem({ kind: "text", text: e.message });
      } else setProblem({ kind: "text", text: "حدث خطأ غير متوقع." });
    } finally {
      setBusy(null);
    }
  }

  function providerLabel(m: LocalMessage): string | null {
    if (!prefs.showProvider || !m.provider) return null;
    return m.provider.isLocal ? `🖥️ عولج محلياً — ${m.provider.name}` : `☁️ عولج لدى مزود خارجي — ${m.provider.name}`;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <Link href="/history" className="text-sm font-bold text-teal-700">
          → السجل
        </Link>
        <div className="flex gap-2">
          <span className="chip">{levelLabel(ex.level)}</span>
          <span className="chip">
            {subject?.icon} {subject?.nameAr ?? ex.subject}
          </span>
        </div>
      </div>

      <section className="card">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-sm font-bold text-stone-500">التمرين</h1>
          {!editing && (
            <button
              className="text-sm font-bold text-teal-700"
              onClick={() => {
                setDraft(ex.text);
                setEditing(true);
              }}
            >
              ✎ تعديل
            </button>
          )}
        </div>
        {editing ? (
          <div className="mt-2 space-y-2">
            <textarea className="input" rows={5} value={draft} onChange={(e) => setDraft(e.target.value)} />
            <div className="flex gap-2">
              <button
                className="btn-primary"
                disabled={!draft.trim()}
                onClick={() => {
                  updateExercise(ex.id, { text: draft.trim() });
                  setEditing(false);
                  setProblem(null);
                }}
              >
                حفظ
              </button>
              <button className="btn-ghost" onClick={() => setEditing(false)}>
                إلغاء
              </button>
            </div>
          </div>
        ) : (
          <p className="mt-1 whitespace-pre-wrap text-lg leading-8" dir="auto">
            {ex.text}
          </p>
        )}
        {!clarity.clear && !editing && (
          <ul className="mt-3 rounded-2xl bg-amber-50 p-3 text-sm text-amber-900">
            {clarity.reasons.map((r) => (
              <li key={r}>⚠️ {r}</li>
            ))}
            <li className="mt-1 font-bold">عدّل التمرين أولاً؛ لن نبدأ الحل قبل أن يصبح واضحاً.</li>
          </ul>
        )}
        {img && (
          <label className="mt-3 flex items-center gap-3 rounded-2xl bg-stone-50 p-2 text-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img.preview} alt="صورة التمرين" className="h-14 w-14 rounded-xl object-cover" />
            <span className="flex-1">أرسل الصورة الأصلية مع الطلب لنموذج يدعم الرؤية (لا تُحفظ على الخادم).</span>
            <input type="checkbox" className="h-5 w-5" checked={attach} onChange={(e) => setAttach(e.target.checked)} />
          </label>
        )}
      </section>

      {!loading && !user && (
        <div className="card flex flex-wrap items-center justify-between gap-3 bg-teal-50 ring-teal-200">
          <p className="text-sm font-bold text-teal-900">💡 المساعد الذكي متاح لك مجاناً! سجّل دخولك إذا أردت حفظ تمارينك ومزامنتها بين أجهزتك.</p>
          <div className="flex gap-2">
            <Link href={`/login?next=${encodeURIComponent(`/solve?id=${ex.id}`)}`} className="btn-primary !min-h-10 !py-2">
              دخول
            </Link>
            <Link href={`/register?next=${encodeURIComponent(`/solve?id=${ex.id}`)}`} className="btn-ghost !min-h-10 !py-2">
              حساب جديد
            </Link>
          </div>
        </div>
      )}

      <section className="card space-y-3">
        <label className="label" htmlFor="ans">
          محاولتك أو إجابتك (اختياري — مطلوبة لزر التحقق)
        </label>
        <textarea
          id="ans"
          rows={3}
          className="input"
          placeholder="اكتب ما توصلت إليه هنا…"
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
        />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="group" aria-label="أزرار المساعدة">
          {HELP_ACTIONS.map((a) => (
            <button
              key={a.id}
              onClick={() => ask(a.id)}
              disabled={busy !== null}
              className={`${a.id === "full_solution" ? "btn bg-amber-100 text-amber-950 ring-1 ring-amber-300 hover:bg-amber-200" : a.id === "check_answer" ? "btn-primary" : "btn-soft"} !px-3 text-sm sm:text-base ${a.id === "full_solution" ? "sm:col-span-1" : ""}`}
            >
              <span aria-hidden>{a.icon}</span>
              {busy === a.id ? "جارٍ…" : a.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-stone-500">
          🔒 عند الضغط يُرسَل نص التمرين (بدون بريد أو أرقام هاتف) إلى مزود ذكاء اصطناعي قد يكون خارجياً. لا تكتب معلومات شخصية.
        </p>
      </section>

      {problem && (
        <div role="alert" className="card space-y-2 bg-rose-50 ring-rose-200">
          {problem.kind === "unclear" && (
            <>
              <p className="font-extrabold text-rose-900">التمرين غير واضح بعد</p>
              <ul className="list-disc ps-5 text-rose-900">
                {problem.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </>
          )}
          {problem.kind === "text" && <p className="font-bold text-rose-900">{problem.text}</p>}
          {problem.kind === "no_provider" && (
            <>
              <p className="font-extrabold text-rose-900">المساعد الذكي غير متاح الآن</p>
              <p className="text-rose-900">{problem.text}</p>
              {problem.attempts.length > 0 && (
                <details className="text-sm text-rose-800">
                  <summary className="cursor-pointer font-bold">تفاصيل المحاولات</summary>
                  <ul className="mt-1 list-disc ps-5">
                    {problem.attempts.map((a, i) => (
                      <li key={i}>
                        {a.isLocal ? "🖥️" : "☁️"} {a.name}: {a.outcome === "failed" ? "فشل" : "تخطّاه النظام"} — {a.reasonAr}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              <Link href="/status" className="text-sm font-bold text-rose-900 underline">
                عرض حالة الخدمات
              </Link>
            </>
          )}
        </div>
      )}
      {notice && <div className="card bg-sky-50 text-sm font-bold text-sky-900 ring-sky-200">ℹ️ {notice}</div>}

      <section className="space-y-3" aria-live="polite">
        {ex.messages.map((m) => (
          <article key={m.id} className={`flex ${m.role === "user" ? "justify-start" : "justify-end"}`}>
            <div
              className={`max-w-[92%] rounded-3xl px-4 py-3 ${m.role === "user" ? "bg-stone-200/70 text-stone-800" : "bg-white shadow ring-1 ring-teal-200"}`}
            >
              {m.role === "user" ? (
                <p className="whitespace-pre-wrap text-sm">{m.content.replace(/^طلبي: /, "🙋 ")}</p>
              ) : (
                <>
                  <p className="mb-1 text-xs font-bold text-teal-700">
                    {HELP_ACTIONS.find((a) => a.id === m.action)?.icon} {actionLabel(m.action)}
                  </p>
                  <RichText text={m.content} />
                  {providerLabel(m) && <p className="mt-2 text-[11px] text-stone-400">{providerLabel(m)}</p>}
                </>
              )}
            </div>
          </article>
        ))}
        {busy && (
          <div className="flex justify-end">
            <div className="animate-pulse rounded-3xl bg-white px-4 py-3 text-stone-500 shadow ring-1 ring-teal-200">
              المساعد يفكّر: {actionLabel(busy)}…
            </div>
          </div>
        )}
        <div ref={endRef} />
      </section>

      <details className="card">
        <summary className="cursor-pointer font-extrabold">🧮 أدوات محلية (دون إنترنت)</summary>
        <div className="mt-3">
          <MiniCalculator />
        </div>
      </details>
    </div>
  );
}
