import type { Attempt } from "./types";

const REASON_AR: Record<string, string> = {
  quota: "نفد الرصيد أو الحصة",
  rate_limit: "تجاوز حد الطلبات مؤقتاً",
  timeout: "انتهت المهلة",
  network: "تعذّر الاتصال",
  auth: "خطأ في المفتاح/المصادقة",
  unavailable: "الخدمة متوقفة مؤقتاً",
  unsupported: "لا يدعم هذا النوع من المدخلات",
  bad_request: "رفض الطلب أو النموذج غير صالح",
  unknown: "خطأ غير معروف",
  cooldown: "موقوف مؤقتاً بعد خطأ سابق",
  limit_requests: "بلغ حد الطلبات اليومي",
  limit_cost: "بلغ حد التكلفة اليومي",
  bad_config: "إعداد غير صالح",
  "not_ready:no_key": "لا يوجد مفتاح",
  "not_ready:unreachable": "الخدمة المحلية غير متصلة",
  "not_ready:timeout": "الخدمة المحلية لا تستجيب",
  "not_ready:model_not_pulled": "النموذج المحلي غير منزَّل",
};

export function reasonAr(reason?: string): string {
  if (!reason) return "";
  return REASON_AR[reason] ?? reason;
}

export function publicAttempts(attempts: Attempt[]) {
  return attempts.map((a) => ({
    name: a.providerName,
    isLocal: a.isLocal,
    outcome: a.outcome,
    reason: a.reason,
    reasonAr: reasonAr(a.reason),
  }));
}

/** رسالة واضحة للمتعلم عند تعذر كل المزودين. لا نختلق إجابة. */
export function noProviderMessage(code: "none_configured" | "all_failed", attempts: Attempt[]): string {
  if (code === "none_configured") {
    return "لا يوجد حالياً أي مزود ذكاء اصطناعي مفعّل لهذه المهمة. لم نُنشئ أي إجابة بديلة. يمكنك مراجعة التمرين وحفظه، وسيتمكن صاحب المنصة من تفعيل مزود من لوحة الإدارة.";
  }
  const localTried = attempts.find((a) => a.isLocal);
  const localNote = localTried
    ? localTried.outcome === "success"
      ? ""
      : ` النموذج المحلي غير جاهز أيضاً (${reasonAr(localTried.reason) || "تعذّر التشغيل"}).`
    : " لا يوجد نموذج محلي جاهز كاحتياط.";
  return `تعذّر الوصول إلى خدمات الذكاء الاصطناعي الآن (نفاد رصيد، أو تجاوز حدود، أو توقف مؤقت).${localNote} لم نُنشئ أي إجابة بديلة كي لا نعطيك معلومة غير موثوقة. جرّب لاحقاً، وتمرينك محفوظ.`;
}
