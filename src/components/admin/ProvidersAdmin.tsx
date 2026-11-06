"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { PROVIDER_KINDS, TASKS, TASK_LABELS } from "@/lib/constants";

interface Provider {
  id: number;
  name: string;
  kind: string;
  baseUrl: string | null;
  model: string;
  priority: number;
  enabled: boolean;
  isLocal: boolean;
  tasks: string[];
  supportsVision: boolean;
  timeoutMs: number;
  dailyRequestLimit: number | null;
  dailyCostLimitUsd: number | null;
  alertPercent: number;
  costInPer1k: number | null;
  costOutPer1k: number | null;
  state: string;
  stateAr: string;
  local?: { available?: boolean; loaded?: boolean; ready: boolean; reason?: string };
  lastError: string | null;
  lastErrorAt: string | null;
  lastOkAt: string | null;
  lastLatencyMs: number | null;
  lastCheckedAt: string | null;
  cooldownUntil: string | null;
  key: { source: "stored" | "env" | "none"; hint: string | null; envName: string | null; envPresent: boolean };
  usageToday: { requests: number; costUsd: number; percent: number; alert: boolean };
  recentErrors: { at: string; kind: string | null; message: string | null; task: string }[];
}

interface ListRes {
  providers: Provider[];
  policy: string;
  canStoreKeys: boolean;
}

interface Form {
  id?: number;
  name: string;
  kind: string;
  baseUrl: string;
  model: string;
  apiKeyEnv: string;
  apiKey: string;
  clearKey: boolean;
  priority: string;
  enabled: boolean;
  isLocal: boolean;
  tasks: string[];
  supportsVision: boolean;
  timeoutSec: string;
  dailyRequestLimit: string;
  dailyCostLimitUsd: string;
  alertPercent: string;
  costInPer1k: string;
  costOutPer1k: string;
}

const EMPTY: Form = {
  name: "",
  kind: "openai-compatible",
  baseUrl: "",
  model: "",
  apiKeyEnv: "",
  apiKey: "",
  clearKey: false,
  priority: "50",
  enabled: true,
  isLocal: false,
  tasks: [...TASKS],
  supportsVision: false,
  timeoutSec: "30",
  dailyRequestLimit: "",
  dailyCostLimitUsd: "",
  alertPercent: "80",
  costInPer1k: "",
  costOutPer1k: "",
};

const TONE: Record<string, string> = {
  ready: "bg-emerald-100 text-emerald-900",
  untested: "bg-sky-100 text-sky-900",
  disabled: "bg-stone-200 text-stone-600",
  no_key: "bg-stone-200 text-stone-700",
  cooldown: "bg-amber-100 text-amber-900",
  error: "bg-rose-100 text-rose-900",
  not_ready: "bg-rose-100 text-rose-900",
};

const KIND_HINT: Record<string, { baseUrl: string; model: string }> = {
  openai: { baseUrl: "", model: "gpt-4o-mini" },
  gemini: { baseUrl: "", model: "gemini-2.5-flash" },
  anthropic: { baseUrl: "", model: "claude-3-5-haiku-latest" },
  "openai-compatible": { baseUrl: "https://openrouter.ai/api/v1", model: "" },
  ollama: { baseUrl: "http://127.0.0.1:11434", model: "qwen2.5:3b" },
};

const num = (s: string): number | null => (s.trim() === "" ? null : Number(s));

function fromProvider(p: Provider): Form {
  return {
    id: p.id,
    name: p.name,
    kind: p.kind,
    baseUrl: p.baseUrl ?? "",
    model: p.model,
    apiKeyEnv: p.key.envName ?? "",
    apiKey: "",
    clearKey: false,
    priority: String(p.priority),
    enabled: p.enabled,
    isLocal: p.isLocal,
    tasks: p.tasks,
    supportsVision: p.supportsVision,
    timeoutSec: String(Math.round(p.timeoutMs / 1000)),
    dailyRequestLimit: p.dailyRequestLimit?.toString() ?? "",
    dailyCostLimitUsd: p.dailyCostLimitUsd?.toString() ?? "",
    alertPercent: String(p.alertPercent),
    costInPer1k: p.costInPer1k?.toString() ?? "",
    costOutPer1k: p.costOutPer1k?.toString() ?? "",
  };
}

function toPayload(f: Form) {
  return {
    name: f.name.trim(),
    kind: f.kind,
    baseUrl: f.baseUrl.trim() || null,
    model: f.model.trim(),
    apiKeyEnv: f.apiKeyEnv.trim() || null,
    ...(f.apiKey.trim() ? { apiKey: f.apiKey.trim() } : {}),
    ...(f.clearKey ? { clearKey: true } : {}),
    priority: Number(f.priority) || 100,
    enabled: f.enabled,
    isLocal: f.isLocal,
    tasks: f.tasks,
    supportsVision: f.supportsVision,
    timeoutMs: (Number(f.timeoutSec) || 30) * 1000,
    dailyRequestLimit: num(f.dailyRequestLimit),
    dailyCostLimitUsd: num(f.dailyCostLimitUsd),
    alertPercent: Number(f.alertPercent) || 80,
    costInPer1k: num(f.costInPer1k),
    costOutPer1k: num(f.costOutPer1k),
  };
}

interface TestResult {
  ok: boolean;
  latencyMs?: number;
  message?: string;
  kind?: string;
}
interface RouterTest {
  ok: boolean;
  provider?: { name: string; isLocal: boolean };
  latencyMs?: number;
  code?: string;
  attempts: { name: string; isLocal: boolean; outcome: string; reasonAr: string }[];
}

export function ProvidersAdmin() {
  const [data, setData] = useState<ListRes | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<number | null>(null);
  const [results, setResults] = useState<Record<number, TestResult>>({});
  const [routerTest, setRouterTest] = useState<RouterTest | null>(null);
  const [routerBusy, setRouterBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api<ListRes>("/api/admin/providers"));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذّر التحميل");
    }
  }, []);

  useEffect(() => {
     
    void load();
  }, [load]);

  async function save() {
    if (!form) return;
    setSaving(true);
    setError(null);
    try {
      if (form.id) await api(`/api/admin/providers/${form.id}`, { method: "PATCH", json: toPayload(form) });
      else await api("/api/admin/providers", { method: "POST", json: toPayload(form) });
      setForm(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذّر الحفظ");
    } finally {
      setSaving(false);
    }
  }

  async function toggle(p: Provider) {
    await api(`/api/admin/providers/${p.id}`, { method: "PATCH", json: { enabled: !p.enabled } });
    await load();
  }

  async function remove(p: Provider) {
    if (!confirm(`حذف المزود «${p.name}» وسجل استهلاكه؟`)) return;
    await api(`/api/admin/providers/${p.id}`, { method: "DELETE" });
    await load();
  }

  async function test(p: Provider) {
    setTesting(p.id);
    try {
      const r = await api<TestResult>(`/api/admin/providers/${p.id}/test`, { method: "POST" });
      setResults((s) => ({ ...s, [p.id]: r }));
    } catch (e) {
      setResults((s) => ({ ...s, [p.id]: { ok: false, message: e instanceof Error ? e.message : "فشل" } }));
    }
    setTesting(null);
    await load();
  }

  async function runRouterTest() {
    setRouterBusy(true);
    try {
      setRouterTest(await api<RouterTest>("/api/admin/router-test", { method: "POST" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل اختبار الموجّه");
    }
    setRouterBusy(false);
    await load();
  }

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  return (
    <div className="space-y-5">
      {error && (
        <div role="alert" className="card bg-rose-50 font-bold text-rose-900 ring-rose-200">
          {error}
        </div>
      )}

      <section className="card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-extrabold">الموجّه (AI Router)</h2>
            <p className="text-sm text-stone-600">
              السياسة الحالية: <b>{data?.policy ?? "…"}</b> (تُضبط بمتغير AI_ROUTING_POLICY). يُجرَّب المزودون بالأولوية؛ عند نفاد الرصيد أو الخطأ القابل للتحويل
              ينتقل لما بعده، وأخيراً النموذج المحلي إن كان جاهزاً.
            </p>
          </div>
          <div className="flex gap-2">
            <button className="btn-soft" onClick={runRouterTest} disabled={routerBusy}>
              {routerBusy ? "جارٍ الاختبار…" : "اختبار الموجّه"}
            </button>
            <button className="btn-primary" onClick={() => setForm({ ...EMPTY })}>
              + إضافة مزود
            </button>
          </div>
        </div>
        {routerTest && (
          <div className={`rounded-2xl p-3 text-sm ${routerTest.ok ? "bg-emerald-50 text-emerald-900" : "bg-rose-50 text-rose-900"}`}>
            <p className="font-extrabold">
              {routerTest.ok ? `✅ أجاب: ${routerTest.provider?.name} (${routerTest.latencyMs}ms)` : routerTest.code === "none_configured" ? "❌ لا يوجد مزود مفعّل" : "❌ فشل كل المزودين"}
            </p>
            <ul className="mt-1 list-disc ps-5">
              {routerTest.attempts.map((a, i) => (
                <li key={i}>
                  {a.isLocal ? "🖥️" : "☁️"} {a.name}: {a.outcome === "success" ? "نجح" : a.outcome === "failed" ? "فشل" : "تخطّى"} {a.reasonAr && `— ${a.reasonAr}`}
                </li>
              ))}
            </ul>
          </div>
        )}
        {data && !data.canStoreKeys && (
          <p className="rounded-2xl bg-amber-50 p-3 text-sm text-amber-900">
            ⚠️ APP_SECRET غير مضبوط، لذلك لا يمكن حفظ المفاتيح في القاعدة. استعمل «اسم متغير البيئة» (مثل OPENAI_API_KEY).
          </p>
        )}
      </section>

      {form && (
        <section className="card space-y-4 ring-2 ring-teal-300">
          <h2 className="text-lg font-extrabold">{form.id ? "تعديل المزود" : "مزود جديد"}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="الاسم">
              <input className="input" value={form.name} onChange={(e) => set("name", e.target.value)} />
            </Field>
            <Field label="نوع المزود">
              <select
                className="input"
                value={form.kind}
                onChange={(e) => {
                  const kind = e.target.value;
                  setForm((f) => (f ? { ...f, kind, baseUrl: f.baseUrl || KIND_HINT[kind].baseUrl, model: f.model || KIND_HINT[kind].model, isLocal: kind === "ollama" } : f));
                }}
              >
                {PROVIDER_KINDS.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="النموذج">
              <input className="input text-start" dir="ltr" value={form.model} onChange={(e) => set("model", e.target.value)} />
            </Field>
            <Field label="عنوان الخدمة (اختياري للسحابيين)">
              <input className="input text-start" dir="ltr" value={form.baseUrl} onChange={(e) => set("baseUrl", e.target.value)} placeholder="https://…" />
            </Field>
            <Field label="مفتاح API (يُشفَّر ولا يُعرض بعد الحفظ)">
              <input
                className="input text-start"
                dir="ltr"
                type="password"
                autoComplete="off"
                value={form.apiKey}
                onChange={(e) => set("apiKey", e.target.value)}
                placeholder={form.id ? "اتركه فارغاً للإبقاء على المحفوظ" : "sk-…"}
                disabled={!data?.canStoreKeys}
              />
            </Field>
            <Field label="أو اسم متغير البيئة (الأفضل)">
              <input className="input text-start" dir="ltr" value={form.apiKeyEnv} onChange={(e) => set("apiKeyEnv", e.target.value.toUpperCase())} placeholder="OPENAI_API_KEY" />
            </Field>
            <Field label="الأولوية (الأصغر أولاً)">
              <input className="input" type="number" min={1} value={form.priority} onChange={(e) => set("priority", e.target.value)} />
            </Field>
            <Field label="المهلة (ثوانٍ)">
              <input className="input" type="number" min={2} value={form.timeoutSec} onChange={(e) => set("timeoutSec", e.target.value)} />
            </Field>
            <Field label="حد الطلبات اليومي (فارغ = بلا حد)">
              <input className="input" type="number" min={1} value={form.dailyRequestLimit} onChange={(e) => set("dailyRequestLimit", e.target.value)} />
            </Field>
            <Field label="حد التكلفة اليومي بالدولار">
              <input className="input" type="number" min={0} step="0.01" value={form.dailyCostLimitUsd} onChange={(e) => set("dailyCostLimitUsd", e.target.value)} />
            </Field>
            <Field label="تنبيه عند بلوغ (%) من الحد">
              <input className="input" type="number" min={1} max={100} value={form.alertPercent} onChange={(e) => set("alertPercent", e.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="$ لكل 1000 رمز دخل">
                <input className="input" type="number" min={0} step="any" value={form.costInPer1k} onChange={(e) => set("costInPer1k", e.target.value)} />
              </Field>
              <Field label="$ لكل 1000 رمز خرج">
                <input className="input" type="number" min={0} step="any" value={form.costOutPer1k} onChange={(e) => set("costOutPer1k", e.target.value)} />
              </Field>
            </div>
          </div>
          <fieldset>
            <legend className="label">المهام التي يستطيع تنفيذها</legend>
            <div className="flex flex-wrap gap-3">
              {TASKS.map((t) => (
                <label key={t} className="flex items-center gap-2 font-bold">
                  <input
                    type="checkbox"
                    className="h-5 w-5 accent-teal-700"
                    checked={form.tasks.includes(t)}
                    onChange={(e) => set("tasks", e.target.checked ? [...form.tasks, t] : form.tasks.filter((x) => x !== t))}
                  />
                  {TASK_LABELS[t]}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="flex flex-wrap gap-5 font-bold">
            <label className="flex items-center gap-2">
              <input type="checkbox" className="h-5 w-5 accent-teal-700" checked={form.enabled} onChange={(e) => set("enabled", e.target.checked)} />
              مفعّل
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" className="h-5 w-5 accent-teal-700" checked={form.supportsVision} onChange={(e) => set("supportsVision", e.target.checked)} />
              يدعم الصور (رؤية)
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" className="h-5 w-5 accent-teal-700" checked={form.isLocal} onChange={(e) => set("isLocal", e.target.checked)} />
              نموذج محلي
            </label>
            {form.id && (
              <label className="flex items-center gap-2 text-rose-700">
                <input type="checkbox" className="h-5 w-5" checked={form.clearKey} onChange={(e) => set("clearKey", e.target.checked)} />
                حذف المفتاح المخزَّن
              </label>
            )}
          </div>
          <div className="flex gap-2">
            <button className="btn-primary" onClick={save} disabled={saving || !form.name.trim() || !form.model.trim() || form.tasks.length === 0}>
              {saving ? "جارٍ الحفظ…" : "حفظ"}
            </button>
            <button className="btn-ghost" onClick={() => setForm(null)}>
              إلغاء
            </button>
          </div>
        </section>
      )}

      {data?.providers.map((p) => {
        const r = results[p.id];
        return (
          <section key={p.id} className="card space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-lg font-extrabold">
                  {p.isLocal ? "🖥️" : "☁️"} {p.name}
                </h3>
                <p className="text-sm text-stone-500" dir="ltr" style={{ textAlign: "start" }}>
                  {p.kind} · {p.model}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`chip ${TONE[p.state] ?? ""}`}>{p.stateAr}</span>
                <button
                  role="switch"
                  aria-checked={p.enabled}
                  onClick={() => toggle(p)}
                  className={`relative h-7 w-12 rounded-full transition ${p.enabled ? "bg-teal-600" : "bg-stone-300"}`}
                  aria-label={p.enabled ? "تعطيل" : "تفعيل"}
                >
                  <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${p.enabled ? "end-1" : "start-1"}`} />
                </button>
              </div>
            </div>

            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="font-bold text-stone-500">الأولوية</dt>
                <dd>{p.priority}</dd>
              </div>
              <div>
                <dt className="font-bold text-stone-500">المهام</dt>
                <dd>{p.tasks.map((t) => TASK_LABELS[t as keyof typeof TASK_LABELS] ?? t).join("، ")}{p.supportsVision ? " + صور" : ""}</dd>
              </div>
              <div>
                <dt className="font-bold text-stone-500">المفتاح</dt>
                <dd dir="ltr" style={{ textAlign: "start" }}>
                  {p.key.source === "stored" && `مخزَّن مشفّراً ${p.key.hint ?? ""}`}
                  {p.key.source === "env" && `${p.key.envName} — ${p.key.envPresent ? "موجود في البيئة ✓" : "غير موجود في البيئة ✗"}`}
                  {p.key.source === "none" && (p.kind === "ollama" || p.kind === "openai-compatible" ? "غير مطلوب/غير مضبوط" : "لا يوجد ✗")}
                </dd>
              </div>
              <div>
                <dt className="font-bold text-stone-500">آخر نجاح / زمن الاستجابة</dt>
                <dd>
                  {p.lastOkAt ? new Date(p.lastOkAt).toLocaleString("ar") : "—"} {p.lastLatencyMs ? `· ${p.lastLatencyMs}ms` : ""}
                </dd>
              </div>
              {p.local && (
                <div className="sm:col-span-2">
                  <dt className="font-bold text-stone-500">الحالة المحلية الفعلية</dt>
                  <dd>
                    متوفر: {p.local.available ? "نعم" : "لا"} · محمَّل: {p.local.loaded ? "نعم" : "لا"} · جاهز: {p.local.ready ? "نعم" : `لا (${p.local.reason ?? ""})`}
                  </dd>
                </div>
              )}
              {p.cooldownUntil && new Date(p.cooldownUntil) > new Date() && (
                <div className="sm:col-span-2 text-amber-800">⏸️ موقوف مؤقتاً حتى {new Date(p.cooldownUntil).toLocaleTimeString("ar")} (يُرفع عند تعديله أو نجاح اختباره)</div>
              )}
            </dl>

            <div>
              <p className="text-sm font-bold text-stone-500">
                الاستهلاك اليوم: {p.usageToday.requests} طلب · ${p.usageToday.costUsd.toFixed(4)}
                {p.dailyRequestLimit ? ` · حد الطلبات ${p.dailyRequestLimit}` : ""}
                {p.dailyCostLimitUsd ? ` · حد التكلفة $${p.dailyCostLimitUsd}` : ""}
              </p>
              {(p.dailyRequestLimit || p.dailyCostLimitUsd) && (
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-stone-200">
                  <div className={`h-full ${p.usageToday.alert ? "bg-rose-500" : "bg-teal-600"}`} style={{ width: `${Math.min(100, p.usageToday.percent)}%` }} />
                </div>
              )}
              {p.usageToday.alert && <p className="mt-1 text-sm font-bold text-rose-700">🔔 تنبيه: بلغ الاستهلاك {p.usageToday.percent}% من الحد.</p>}
            </div>

            {p.lastError && (
              <details className="rounded-2xl bg-rose-50 p-3 text-sm text-rose-900">
                <summary className="cursor-pointer font-bold">آخر أخطاء الاتصال ({p.recentErrors.length})</summary>
                <ul className="mt-2 space-y-1" dir="ltr" style={{ textAlign: "start" }}>
                  {p.recentErrors.map((e, i) => (
                    <li key={i}>
                      {new Date(e.at).toLocaleString("ar")} · <b>{e.kind}</b> · {e.message}
                    </li>
                  ))}
                  {p.recentErrors.length === 0 && <li>{p.lastError}</li>}
                </ul>
              </details>
            )}

            {r && (
              <p className={`rounded-2xl p-3 text-sm font-bold ${r.ok ? "bg-emerald-50 text-emerald-900" : "bg-rose-50 text-rose-900"}`}>
                {r.ok ? `✅ نجح الاتصال (${r.latencyMs}ms)` : `❌ فشل الاختبار: ${r.message ?? r.kind}`}
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <button className="btn-soft !min-h-10 !py-2 text-sm" onClick={() => test(p)} disabled={testing === p.id}>
                {testing === p.id ? "جارٍ الاختبار…" : "اختبار الاتصال"}
              </button>
              <button className="btn-ghost !min-h-10 !py-2 text-sm" onClick={() => setForm(fromProvider(p))}>
                تعديل
              </button>
              <button className="btn-ghost !min-h-10 !py-2 text-sm text-rose-700" onClick={() => remove(p)}>
                حذف
              </button>
            </div>
          </section>
        );
      })}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
    </label>
  );
}
