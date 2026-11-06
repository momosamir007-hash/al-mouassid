"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { assessClarity } from "@/lib/clarity";
import { LEVELS } from "@/lib/constants";
import { createExercise, setPrefs, usePrefs } from "@/lib/client/exerciseStore";
import { useSubjects } from "@/lib/client/hooks";
import { canvasToJpegBase64, loadImage, renderEdited, setHandoff, type EditOptions } from "@/lib/client/image";
import { OCR_LANGS, recognize } from "@/lib/client/ocr";

type Stage = "pick" | "edit" | "review";

const DEFAULT_OPTS: EditOptions = { rotation: 0, crop: { left: 0, top: 0, right: 0, bottom: 0 }, enhance: true, maxSide: 1600 };

export function CaptureFlow() {
  const router = useRouter();
  const prefs = usePrefs();
  const subjects = useSubjects();
  const [stage, setStage] = useState<Stage>("pick");
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [opts, setOpts] = useState<EditOptions>(DEFAULT_OPTS);
  const [error, setError] = useState<string | null>(null);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [progress, setProgress] = useState<{ pct: number; status: string } | null>(null);
  const [text, setText] = useState("");
  const [confidence, setConfidence] = useState<number | null>(null);
  const [sendImage, setSendImage] = useState(false);
  const previewRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!img || stage !== "edit" || !previewRef.current) return;
    const c = renderEdited(img, { ...opts, maxSide: 900 });
    const p = previewRef.current;
    p.width = c.width;
    p.height = c.height;
    p.getContext("2d")!.drawImage(c, 0, 0);
  }, [img, opts, stage]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (!/^image\//.test(file.type)) {
      setError("الملف المختار ليس صورة.");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setError("حجم الصورة كبير جداً (الحد 15 ميغابايت).");
      return;
    }
    try {
      setImg(await loadImage(file));
      setOpts(DEFAULT_OPTS);
      setStage("edit");
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذّر فتح الصورة.");
    }
  }

  async function runOcr() {
    if (!img) return;
    setOcrBusy(true);
    setError(null);
    setProgress({ pct: 0, status: "تحضير" });
    try {
      const canvas = renderEdited(img, { ...opts, maxSide: 2000 });
      const r = await recognize(canvas, prefs.ocrLang, (pct, status) => setProgress({ pct, status }));
      setText(r.text);
      setConfidence(r.confidence);
      setStage("review");
    } catch {
      setError("تعذّر تشغيل التعرف على النص. يحتاج التشغيل الأول إلى اتصال بالإنترنت لتنزيل ملفات اللغة. يمكنك كتابة النص يدوياً.");
    } finally {
      setOcrBusy(false);
      setProgress(null);
    }
  }

  const level = prefs.level;
  const subject = prefs.subject;
  const clarity = assessClarity(text);
  const availableSubjects = subjects.filter((s) => !level || s.levels.includes(level));
  const canContinue = clarity.clear && Boolean(level) && Boolean(subject);

  function confirm() {
    if (!canContinue || !level || !subject) return;
    const ex = createExercise({ level, subject, text });
    if (sendImage && img) {
      const full = renderEdited(img, { ...opts, enhance: false, maxSide: 1280 });
      const thumb = renderEdited(img, { ...opts, enhance: false, maxSide: 120 });
      setHandoff({ exerciseId: ex.id, mime: "image/jpeg", data: canvasToJpegBase64(full), preview: thumb.toDataURL("image/jpeg", 0.6) });
    } else setHandoff(null);
    router.push(`/solve?id=${encodeURIComponent(ex.id)}`);
  }

  const slider = (key: keyof EditOptions["crop"], label: string) => (
    <label className="block text-sm font-bold text-stone-700">
      {label}: {opts.crop[key]}%
      <input
        type="range"
        min={0}
        max={45}
        value={opts.crop[key]}
        onChange={(e) => setOpts((o) => ({ ...o, crop: { ...o.crop, [key]: Number(e.target.value) } }))}
        className="mt-1 w-full accent-teal-700"
      />
    </label>
  );

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-extrabold">تصوير التمرين</h1>

      {error && (
        <div role="alert" className="card bg-rose-50 font-bold text-rose-900 ring-rose-200">
          {error}
        </div>
      )}

      {stage === "pick" && (
        <section className="card space-y-4">
          <p className="text-stone-600">اختر طريقة إدخال الصورة. ضع الورقة في إضاءة جيدة وصوّرها مستقيمة قدر الإمكان.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="btn-primary cursor-pointer">
              📷 التقاط بالكاميرا
              <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
            </label>
            <label className="btn-soft cursor-pointer">
              🖼️ اختيار من الجهاز
              <input type="file" accept="image/*" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
            </label>
          </div>
          <button
            className="text-sm font-bold text-teal-700 underline"
            onClick={() => {
              setText("");
              setConfidence(null);
              setStage("review");
            }}
          >
            أفضّل كتابة التمرين يدوياً
          </button>
        </section>
      )}

      {stage === "edit" && img && (
        <section className="card space-y-4">
          <div className="grid place-items-center overflow-hidden rounded-2xl bg-stone-100 p-2">
            <canvas ref={previewRef} className="max-h-[50vh] max-w-full rounded-lg" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button className="btn-ghost" onClick={() => setOpts((o) => ({ ...o, rotation: ((o.rotation + 270) % 360) as EditOptions["rotation"] }))}>
              ↺ تدوير يساراً
            </button>
            <button className="btn-ghost" onClick={() => setOpts((o) => ({ ...o, rotation: ((o.rotation + 90) % 360) as EditOptions["rotation"] }))}>
              ↻ تدوير يميناً
            </button>
          </div>
          <details open className="rounded-2xl bg-stone-50 p-3">
            <summary className="cursor-pointer font-extrabold">✂️ القص</summary>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {slider("top", "من الأعلى")}
              {slider("bottom", "من الأسفل")}
              {slider("left", "من اليسار")}
              {slider("right", "من اليمين")}
            </div>
          </details>
          <label className="flex items-center gap-3 font-bold">
            <input type="checkbox" className="h-5 w-5 accent-teal-700" checked={opts.enhance} onChange={(e) => setOpts((o) => ({ ...o, enhance: e.target.checked }))} />
            تحسين الوضوح (تدرج رمادي + تباين) لتحسين التعرف على النص
          </label>
          <div>
            <label className="label" htmlFor="lang">
              لغة التمرين
            </label>
            <select id="lang" className="input" value={prefs.ocrLang} onChange={(e) => setPrefs({ ocrLang: e.target.value })}>
              {OCR_LANGS.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
          {progress && (
            <div aria-live="polite">
              <div className="h-3 overflow-hidden rounded-full bg-stone-200">
                <div className="h-full bg-teal-600 transition-all" style={{ width: `${progress.pct}%` }} />
              </div>
              <p className="mt-1 text-sm text-stone-500">
                {progress.status} {progress.pct}% — قد يستغرق التشغيل الأول وقتاً لتنزيل ملفات اللغة.
              </p>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary flex-1" disabled={ocrBusy} onClick={runOcr}>
              {ocrBusy ? "جارٍ استخراج النص…" : "🔤 استخراج النص"}
            </button>
            <button
              className="btn-ghost"
              disabled={ocrBusy}
              onClick={() => {
                setImg(null);
                setStage("pick");
              }}
            >
              صورة أخرى
            </button>
          </div>
        </section>
      )}

      {stage === "review" && (
        <section className="card space-y-4">
          <div>
            <h2 className="text-lg font-extrabold">راجع النص وصحّحه</h2>
            <p className="text-sm text-stone-600">
              التعرف الآلي قد يخطئ، خاصة في الأرقام والرموز الرياضية والكتابة اليدوية. لن نبدأ الحل حتى يصبح النص واضحاً.
            </p>
          </div>
          {confidence !== null && (
            <p className={`chip ${confidence >= 75 ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900"}`}>
              ثقة التعرف: {confidence}%
            </p>
          )}
          {confidence !== null && confidence < 75 && (
            <p className="rounded-2xl bg-amber-50 p-3 text-sm text-amber-900">
              ⚠️ الثقة منخفضة. قارن النص بالصورة بعناية، وانتبه خصوصاً للأرقام والإشارات (+ − × ÷).
            </p>
          )}
          <textarea className="input" rows={7} dir="auto" value={text} onChange={(e) => setText(e.target.value)} aria-label="النص المستخرج" />
          {text.trim() && !clarity.clear && (
            <ul className="rounded-2xl bg-rose-50 p-3 text-sm font-bold text-rose-900">
              {clarity.reasons.map((r) => (
                <li key={r}>⚠️ {r}</li>
              ))}
            </ul>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="lv">
                المستوى
              </label>
              <select id="lv" className="input" value={level ?? ""} onChange={(e) => setPrefs({ level: e.target.value || null, subject: null })}>
                <option value="">— اختر —</option>
                {LEVELS.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="sb">
                المادة
              </label>
              <select id="sb" className="input" value={subject ?? ""} onChange={(e) => setPrefs({ subject: e.target.value || null })}>
                <option value="">— اختر —</option>
                {availableSubjects.map((s) => (
                  <option key={s.slug} value={s.slug}>
                    {s.icon} {s.nameAr}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {img && (
            <label className="flex items-start gap-3 rounded-2xl bg-stone-50 p-3 text-sm">
              <input type="checkbox" className="mt-1 h-5 w-5 accent-teal-700" checked={sendImage} onChange={(e) => setSendImage(e.target.checked)} />
              <span>
                <b>أرسل الصورة الأصلية أيضاً إلى نموذج يدعم الرؤية</b> (مفيد للأشكال والجداول والمعادلات). ستُرسل مع طلبات المساعدة إلى مزود
                ذكاء اصطناعي قد يكون خارجياً، ولا تُخزَّن في أي مكان. إن لم يتوفر نموذج رؤية يُستعمل النص فقط.
              </span>
            </label>
          )}
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary flex-1" disabled={!canContinue} onClick={confirm}>
              اعتماد النص والمتابعة ←
            </button>
            {img && (
              <button className="btn-ghost" onClick={() => setStage("edit")}>
                → العودة للصورة
              </button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
