"use client";

import { useCallback, useEffect, useState } from "react";
import { inspectDevice, type DeviceReport } from "@/lib/client/capabilities";

interface ProviderStatus {
  id: number;
  name: string;
  kind: string;
  isLocal: boolean;
  supportsVision: boolean;
  state: string;
  stateAr: string;
  local?: { available?: boolean; loaded?: boolean; ready: boolean; reason?: string };
}
interface StatusRes {
  time: string;
  database: boolean;
  policy: string;
  aiAvailable: boolean;
  providers: ProviderStatus[];
}

const TONE: Record<string, string> = {
  ready: "bg-emerald-100 text-emerald-900",
  untested: "bg-sky-100 text-sky-900",
  disabled: "bg-stone-200 text-stone-600",
  no_key: "bg-stone-200 text-stone-700",
  cooldown: "bg-amber-100 text-amber-900",
  error: "bg-rose-100 text-rose-900",
  not_ready: "bg-rose-100 text-rose-900",
};
const POLICY_AR: Record<string, string> = { quality: "الجودة أولاً", cost: "التكلفة أولاً (المحلي ثم الأرخص)", speed: "السرعة أولاً" };
const LOCAL_REASON: Record<string, string> = {
  unreachable: "خدمة Ollama غير متصلة",
  model_not_pulled: "النموذج غير منزَّل",
  timeout: "الخدمة لا تستجيب",
};

export default function StatusPage() {
  const [data, setData] = useState<StatusRes | null>(null);
  const [err, setErr] = useState(false);
  const [device, setDevice] = useState<DeviceReport | null>(null);
  const [checking, setChecking] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/status", { cache: "no-store" });
      if (!r.ok) throw new Error();
      setData(await r.json());
      setErr(false);
    } catch {
      setErr(true);
    }
  }, []);

  useEffect(() => {
     
    void load();
  }, [load]);

  async function checkDevice() {
    setChecking(true);
    setDevice(await inspectDevice());
    setChecking(false);
  }

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">حالة الخدمات</h1>
        <button className="btn-soft !min-h-10 !py-2 text-sm" onClick={load}>
          🔄 تحديث
        </button>
      </header>

      {err && <div className="card bg-amber-50 font-bold text-amber-900 ring-amber-200">تعذّر الوصول إلى الخادم (ربما أنت غير متصل).</div>}

      {data && (
        <>
          <section className="grid gap-3 sm:grid-cols-3">
            <div className="card">
              <p className="text-sm text-stone-500">قاعدة البيانات</p>
              <p className={`text-xl font-extrabold ${data.database ? "text-emerald-700" : "text-rose-700"}`}>{data.database ? "تعمل" : "متوقفة"}</p>
            </div>
            <div className="card">
              <p className="text-sm text-stone-500">المساعد الذكي</p>
              <p className={`text-xl font-extrabold ${data.aiAvailable ? "text-emerald-700" : "text-rose-700"}`}>{data.aiAvailable ? "متاح" : "غير متاح"}</p>
            </div>
            <div className="card">
              <p className="text-sm text-stone-500">سياسة الاختيار</p>
              <p className="text-lg font-extrabold">{POLICY_AR[data.policy] ?? data.policy}</p>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-extrabold">مزودو الذكاء الاصطناعي</h2>
            {data.providers.map((p) => (
              <div key={p.id} className="card flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-extrabold">
                    {p.isLocal ? "🖥️" : "☁️"} {p.name}
                  </p>
                  <p className="text-sm text-stone-500">
                    {p.isLocal ? "نموذج محلي على خادم المنصة" : "مزود سحابي خارجي"} · {p.supportsVision ? "يدعم الصور" : "نص فقط"}
                  </p>
                  {p.local && (
                    <p className="mt-1 text-sm text-stone-600">
                      متوفر: {p.local.available ? "نعم" : "لا"} · محمَّل في الذاكرة: {p.local.loaded ? "نعم" : "لا"} · جاهز لاستقبال المهام:{" "}
                      <b>{p.local.ready ? "نعم" : "لا"}</b>
                      {!p.local.ready && p.local.reason ? ` (${LOCAL_REASON[p.local.reason] ?? p.local.reason})` : ""}
                    </p>
                  )}
                </div>
                <span className={`chip ${TONE[p.state] ?? ""}`}>{p.stateAr}</span>
              </div>
            ))}
            {data.providers.length === 0 && <p className="text-stone-500">لا توجد مزودات.</p>}
            <p className="text-xs text-stone-500">
              «مفعّل (لم يُختبر بعد)» يعني وجود مفتاح دون تأكيد عمله؛ لا ننفق رصيداً لفحص السحابيين تلقائياً، أما المحلي فيُفحص فعلياً عند كل تحديث.
              آخر تحديث: {new Date(data.time).toLocaleTimeString("ar")}
            </p>
          </section>
        </>
      )}

      <section className="card space-y-3">
        <h2 className="text-lg font-extrabold">الذكاء المحلي: ثلاثة خيارات مختلفة</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-start text-sm">
            <thead className="text-stone-500">
              <tr>
                <th className="py-2 text-start">الخيار</th>
                <th className="text-start">الحالة في هذه النسخة</th>
                <th className="text-start">القدرات والحدود</th>
              </tr>
            </thead>
            <tbody className="align-top">
              <tr className="border-t">
                <td className="py-2 font-bold">1) Ollama على خادم المنصة</td>
                <td>✅ مُنفَّذ ومربوط بالموجّه (يظهر أعلاه إن كان مفعّلاً)</td>
                <td>الأقوى بين المحلي؛ يدعم الصور فقط إن كان النموذج يدعمها (مثل llava). يحتاج ذاكرة/GPU على الخادم.</td>
              </tr>
              <tr className="border-t">
                <td className="py-2 font-bold">2) Ollama على جهاز المستخدم</td>
                <td>🔎 كشف فقط — غير مربوط بالمساعدة بعد</td>
                <td>يتطلب تثبيت Ollama وضبط OLLAMA_ORIGINS. يعتمد على جهازك. نفحصه أدناه دون استخدامه.</td>
              </tr>
              <tr className="border-t">
                <td className="py-2 font-bold">3) نماذج صغيرة داخل المتصفح (WebGPU/WebLLM)</td>
                <td>🔎 فحص الإمكانات فقط — النموذج غير مُحمَّل ولا مُدمج بعد</td>
                <td>نصوص فقط وجودة محدودة، تحتاج تنزيل مئات الميغابايت وGPU مناسباً؛ لا تناسب أغلب الهواتف.</td>
              </tr>
            </tbody>
          </table>
        </div>

        <button className="btn-primary" onClick={checkDevice} disabled={checking}>
          {checking ? "جارٍ الفحص…" : "فحص إمكانات جهازي"}
        </button>

        {device && (
          <div className="space-y-2 rounded-2xl bg-stone-50 p-4 text-sm">
            <p>
              المتصفح: <b>{device.browser}</b> · WebGPU: <b>{device.webgpu === "supported" ? "مدعوم" : "غير مدعوم"}</b>
              {device.gpuName ? ` (${device.gpuName})` : ""} · الذاكرة التقريبية: <b>{device.deviceMemoryGb ?? "غير معروفة"}</b> GB · الأنوية: <b>{device.cores ?? "؟"}</b>
            </p>
            <p>
              تقدير تشغيل نموذج صغير داخل المتصفح:{" "}
              <b>{device.verdict === "possible" ? "ممكن نظرياً" : device.verdict === "limited" ? "محدود" : "غير ممكن"}</b> — ولكن لم يُحمَّل أي نموذج، وحالته: <b>غير جاهز</b>.
            </p>
            <p>
              Ollama على جهازك: <b>{device.userOllama.status === "found" ? `وُجد (${device.userOllama.models.join("، ") || "بلا نماذج"})` : "لم يُكتشف"}</b>
              {device.userOllama.status === "found" && " — مكتشف فقط ولا يستخدمه المساعد حالياً."}
            </p>
            {device.notes.length > 0 && (
              <ul className="list-disc ps-5 text-stone-600">
                {device.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
