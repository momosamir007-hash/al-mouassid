export interface DeviceReport {
  webgpu: "supported" | "unsupported";
  gpuName?: string;
  deviceMemoryGb?: number;
  cores?: number;
  browser: string;
  verdict: "possible" | "limited" | "unsupported";
  notes: string[];
  /** هل المتصفح يستطيع الوصول إلى Ollama على جهاز المستخدم نفسه؟ */
  userOllama: { status: "found" | "not_found"; models: string[] };
}

function browserName(): string {
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) return "Edge";
  if (/OPR\//.test(ua)) return "Opera";
  if (/Chrome\//.test(ua)) return "Chrome";
  if (/Firefox\//.test(ua)) return "Firefox";
  if (/Safari\//.test(ua)) return "Safari";
  return "غير معروف";
}

interface GpuNav {
  gpu?: { requestAdapter(): Promise<null | { info?: { description?: string; vendor?: string } }> };
  deviceMemory?: number;
}

/** يفحص إمكانات الجهاز قبل أي محاولة لتشغيل نموذج محلي. لا يحمّل أي نموذج. */
export async function inspectDevice(): Promise<DeviceReport> {
  const nav = navigator as Navigator & GpuNav;
  const notes: string[] = [];
  let webgpu: DeviceReport["webgpu"] = "unsupported";
  let gpuName: string | undefined;
  if (nav.gpu) {
    try {
      const adapter = await nav.gpu.requestAdapter();
      if (adapter) {
        webgpu = "supported";
        gpuName = adapter.info?.description || adapter.info?.vendor || undefined;
      } else notes.push("المتصفح يدعم واجهة WebGPU لكن لا توجد بطاقة رسوم متاحة لها.");
    } catch {
      notes.push("تعذّر تهيئة WebGPU.");
    }
  } else {
    notes.push("هذا المتصفح لا يدعم WebGPU (جرّب Chrome أو Edge حديثين على حاسوب).");
  }
  const mem = nav.deviceMemory;
  const cores = nav.hardwareConcurrency;
  let verdict: DeviceReport["verdict"] = "unsupported";
  if (webgpu === "supported") {
    verdict = (mem === undefined || mem >= 4) && (cores ?? 0) >= 4 ? "possible" : "limited";
    if (mem !== undefined && mem < 4) notes.push("الذاكرة المتاحة للمتصفح قليلة؛ لن تصلح إلا نماذج صغيرة جداً.");
    if ((cores ?? 0) < 4) notes.push("عدد أنوية المعالج قليل.");
  }
  if (/Android|iPhone|iPad/i.test(navigator.userAgent)) {
    notes.push("الهواتف غالباً لا تصلح لتشغيل نماذج لغوية داخل المتصفح بجودة كافية.");
    if (verdict === "possible") verdict = "limited";
  }

  let userOllama: DeviceReport["userOllama"] = { status: "not_found", models: [] };
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 1500);
    const r = await fetch("http://127.0.0.1:11434/api/tags", { signal: ctrl.signal });
    clearTimeout(t);
    if (r.ok) {
      const j = (await r.json()) as { models?: { name: string }[] };
      userOllama = { status: "found", models: (j.models ?? []).map((m) => m.name) };
    }
  } catch {
    /* غير متاح أو محجوب (CORS/OLLAMA_ORIGINS) */
  }

  return { webgpu, gpuName, deviceMemoryGb: mem, cores, browser: browserName(), verdict, notes, userOllama };
}
