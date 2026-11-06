"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { assessClarity, cleanOcrOutput } from "@/lib/clarity";
import { LEVELS } from "@/lib/constants";
import { api } from "@/lib/client/api";
import { createExercise, setPrefs, usePrefs } from "@/lib/client/exerciseStore";
import { useSubjects } from "@/lib/client/hooks";
import { canvasToJpegBase64, loadImage, renderEdited, setHandoff, type EditOptions } from "@/lib/client/image";
import { OCR_LANGS, recognize } from "@/lib/client/ocr";
import { RichText } from "./RichText";

type Stage = "pick" | "edit" | "review";
type OcrSource = "vision" | "ai_refined" | "tesseract" | null;

interface AiOcrResponse {
  mode: "vision" | "ai_refined" | "needs_local_ocr";
  text: string;
  provider?: { name: string; model: string; isLocal: boolean };
}

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
  const [refineBusy, setRefineBusy] = useState(false);
  const [progress, setProgress] = useState<{ pct: number; status: string } | null>(null);
  const [text, setText] = useState("");
  const [confidence, setConfidence] = useState<number | null>(null);
  const [ocrSource, setOcrSource] = useState<OcrSource>(null);
  const [ocrProviderName, setOcrProviderName] = useState<string | null>(null);
  const [sendImage, setSendImage] = useState(true);
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

  function enterReview(extracted: string, src: OcrSource, prov: string | null, conf: number | null) {
    setText(cleanOcrOutput(extracted));
    setOcrSource(src);
    setOcrProviderName(prov);
    setConfidence(conf);
    if (!prefs.level) setPrefs({ level: "middle", subject: prefs.subject || "math" });
    else if (!prefs.subject) setPrefs({ subject: "math" });
    setStage("review");
  }

  /** الاستخراج التقليدي عبر Tesseract.js داخل المتصفح */
  async function runOcr() {
    if (!img) return;
    setOcrBusy(true);
    setError(null);
    setProgress({ pct: 0, status: "تحضير الاستخراج المحلي (Tesseract)" });
    try {
      const canvas = renderEdited(img, { ...opts, maxSide: 1800 });
      const r = await recognize(canvas, prefs.ocrLang, (pct, status) => setProgress({ pct, status }));
      enterReview(r.text, "tesseract", null, r.confidence);
    } catch {
      setError("تعذّر تشغيل التعرف المحلي على النص. يمكنك استخدام زر «الاستخراج بالذكاء الاصطناعي» أو كتابة النص يدوياً.");
    } finally {
      setOcrBusy(false);
      setProgress(null);
    }
  }

  /** الاستخراج الذكي بالذكاء الاصطناعي (Vision AI أولاً، ثم الهجين Tesseract + تصحيح AI احتياطياً) */
  async function runAiOcr() {
    if (!img) return;
    setOcrBusy(true);
    setError(null);
    setProgress({ pct: 25, status: "🤖 جارٍ قراءة الصورة والمعادلات بالذكاء الاصطناعي…" });
    try {
      // للذكاء الاصطناعي البصري نرسل الصورة مضغوطة بوضوح عالٍ (سريعة الرفع من الهاتف)
      const visionCanvas = renderEdited(img, { ...opts, enhance: false, maxSide: 1200 });
      const b64 = canvasToJpegBase64(visionCanvas, 0.78);

      const res = await api<AiOcrResponse>("/api/ocr", {
        method: "POST",
        json: {
          image: { mime: "image/jpeg", data: b64 },
          lang: prefs.ocrLang,
        },
      });

      if (res.mode === "vision" && res.text.trim()) {
        enterReview(res.text, "vision", res.provider?.name ?? "AI Vision", null);
        return;
      }

      // إذا لم يتوفر نموذج رؤية في اللحظة الحالية، نشغّل Tesseract محلياً ثم نصلح النص بالذكاء الاصطناعي النصي
      setProgress({ pct: 50, status: "🔤 استخراج أولي محلي ثم تصحيح بالذكاء الاصطناعي…" });
      const localCanvas = renderEdited(img, { ...opts, maxSide: 1800 });
      const localRes = await recognize(localCanvas, prefs.ocrLang, (pct, status) =>
        setProgress({ pct: Math.min(85, 50 + Math.round(pct * 0.35)), status }),
      );

      if (localRes.text.trim()) {
        setProgress({ pct: 90, status: "✨ تصحيح الكلمات والمعادلات بالذكاء الاصطناعي…" });
        try {
          const refined = await api<AiOcrResponse>("/api/ocr", {
            method: "POST",
            json: { rawOcrText: localRes.text, lang: prefs.ocrLang },
          });
          if (refined.text.trim()) {
            enterReview(refined.text, "ai_refined", refined.provider?.name ?? "AI", localRes.confidence);
            return;
          }
        } catch {
          /* إذا تعذر التصحيح السحابي نكتفي بنص Tesseract */
        }
      }

      enterReview(localRes.text, "tesseract", null, localRes.confidence);
    } catch {
      // في حال انقطاع الإنترنت أو تعذر الخادم، نتحول تلقائياً إلى Tesseract المحلي
      try {
        setProgress({ pct: 10, status: "التحويل إلى الاستخراج المحلي (Tesseract)…" });
        const canvas = renderEdited(img, { ...opts, maxSide: 1800 });
        const r = await recognize(canvas, prefs.ocrLang, (pct, status) => setProgress({ pct, status }));
        enterReview(r.text, "tesseract", null, r.confidence);
      } catch {
        setError("تعذّر استخراج النص من الصورة. تأكد من اتصالك بالإنترنت أو اكتب التمرين يدوياً.");
      }
    } finally {
      setOcrBusy(false);
      setProgress(null);
    }
  }

  /** تصحيح النص الحالي في مرحلة المراجعة عبر الذكاء الاصطناعي */
  async function refineCurrentText() {
    if (!text.trim() && !img) return;
    setRefineBusy(true);
    setError(null);
    try {
      const imagePayload = img
        ? {
            mime: "image/jpeg" as const,
            data: canvasToJpegBase64(renderEdited(img, { ...opts, enhance: false, maxSide: 1200 }), 0.78),
          }
        : undefined;

      const res = await api<AiOcrResponse>("/api/ocr", {
        method: "POST",
        json: {
          image: imagePayload,
          rawOcrText: text.trim() || undefined,
          lang: prefs.ocrLang,
        },
      });
      if (res.text.trim()) {
        setText(cleanOcrOutput(res.text));
        setOcrSource(res.mode === "vision" ? "vision" : "ai_refined");
        setOcrProviderName(res.provider?.name ?? "AI");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذّر تصحيح النص بالذكاء الاصطناعي حالياً.");
    } finally {
      setRefineBusy(false);
    }
  }

  const level = prefs.level || "middle";
  const subject = prefs.subject || "math";
  const clarity = assessClarity(text);
  const availableSubjects = subjects.filter((s) => !level || s.levels.includes(level));
  const canContinue = clarity.clear && Boolean(level) && Boolean(subject);

  function confirm() {
    const cleaned = cleanOcrOutput(text);
    const finalClarity = assessClarity(cleaned);
    if (!finalClarity.clear) {
      setText(cleaned);
      return;
    }
    const ex = createExercise({ level, subject, text: cleaned });
    if (sendImage && img) {
      const full = renderEdited(img, { ...opts, enhance: false, maxSide: 1200 });
      const thumb = renderEdited(img, { ...opts, enhance: false, maxSide: 120 });
      setHandoff({ exerciseId: ex.id, mime: "image/jpeg", data: canvasToJpegBase64(full, 0.78), preview: thumb.toDataURL("image/jpeg", 0.6) });
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
              setOcrSource(null);
              setOcrProviderName(null);
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
            تحسين الوضوح (تدرج رمادي + تباين) لتحسين التعرف المحلي (Tesseract)
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
              <p className="mt-1 text-sm font-bold text-teal-800">
                {progress.status} ({progress.pct}%)
              </p>
            </div>
          )}
          <div className="space-y-2">
            <div className="grid gap-2 sm:grid-cols-2">
              <button className="btn-primary" disabled={ocrBusy} onClick={runAiOcr}>
                {ocrBusy ? "جارٍ القراءة…" : "🤖 استخراج بالذكاء الاصطناعي (للكاميرا والمعادلات)"}
              </button>
              <button className="btn-soft" disabled={ocrBusy} onClick={runOcr}>
                {ocrBusy ? "جارٍ الاستخراج…" : "🔤 استخراج تقليدي محلي (Tesseract)"}
              </button>
            </div>
            <button
              className="btn-ghost w-full"
              disabled={ocrBusy}
              onClick={() => {
                setImg(null);
                setStage("pick");
              }}
            >
              📷 اختيار أو التقاط صورة أخرى
            </button>
          </div>
        </section>
      )}

      {stage === "review" && (
        <section className="card space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-lg font-extrabold">راجع النص وصحّحه</h2>
              <p className="text-sm text-stone-600">
                تأكد من مطابقة الأرقام والرموز الرياضية للصورة قبل البدء في الحل.
              </p>
            </div>
            {(img || text.trim()) && (
              <button
                type="button"
                className="btn-soft !min-h-9 !px-3 !py-1.5 text-xs font-extrabold"
                disabled={refineBusy}
                onClick={refineCurrentText}
              >
                {refineBusy ? "جارٍ التصحيح بالذكاء الاصطناعي…" : "✨ إعادة قراءة/تصحيح بالذكاء الاصطناعي"}
              </button>
            )}
          </div>

          {ocrSource === "vision" && (
            <p className="chip bg-emerald-100 text-emerald-900">
              🤖 تم استخراج النص والمعادلات بالذكاء الاصطناعي البصري ({ocrProviderName})
            </p>
          )}
          {ocrSource === "ai_refined" && (
            <p className="chip bg-teal-100 text-teal-900">
              ✨ تم استخراج النص وتصحيحه بالذكاء الاصطناعي ({ocrProviderName})
            </p>
          )}
          {ocrSource === "tesseract" && confidence !== null && (
            <p className={`chip ${confidence >= 75 ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900"}`}>
              🔤 استخراج تقليدي (Tesseract) — ثقة التعرف: {confidence}%
            </p>
          )}
          {ocrSource === "tesseract" && confidence !== null && confidence < 75 && (
            <p className="rounded-2xl bg-amber-50 p-3 text-sm text-amber-900">
              ⚠️ الثقة منخفضة في الاستخراج التقليدي. يمكنك الضغط على زر <b>«✨ إعادة قراءة/تصحيح بالذكاء الاصطناعي»</b> أعلاه لقراءة الصورة بدقة أعلى!
            </p>
          )}

          <textarea className="input" rows={7} dir="auto" value={text} onChange={(e) => setText(e.target.value)} aria-label="النص المستخرج" />
          {text.trim() && /\\frac|\\sqrt|\$|\^|_/.test(text) && (
            <div className="rounded-2xl bg-teal-50/60 p-3 ring-1 ring-teal-200">
              <p className="mb-1 text-xs font-extrabold text-teal-800">📐 معاينة عرض المعادلات والكسور:</p>
              <div className="text-base" dir="auto">
                <RichText text={text} />
              </div>
            </div>
          )}
          {text.trim() && !clarity.clear && (
            <div className="rounded-2xl bg-rose-50 p-3 text-sm font-bold text-rose-900 space-y-2">
              <ul>
                {clarity.reasons.map((r) => (
                  <li key={r}>⚠️ {r}</li>
                ))}
              </ul>
              <button
                type="button"
                className="btn-soft !min-h-8 !px-3 !py-1 text-xs"
                onClick={() => setText(cleanOcrOutput(text))}
              >
                🔧 إصلاح الرموز والأقواس تلقائياً
              </button>
            </div>
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
                <b>أرسل الصورة الأصلية أيضاً إلى نموذج يدعم الرؤية أثناء الحل</b> (مفيد للأشكال الهندسية والجداول والمعادلات).
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
