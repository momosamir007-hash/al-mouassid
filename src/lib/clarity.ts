import { normalizeMath } from "@/lib/arith";
export interface Clarity { clear: boolean; reasons: string[] }

/** تنظيف محافظ: لا نحذف | أو ~ أو علامات عدم اليقين ولا نعيد ترتيب الأقواس. */
export function cleanOcrOutput(raw: string): string {
  return raw.replace(/\uFFFD+/g, "�").replace(/[ \t]{2,}/g, " ").trim();
}

export function assessClarity(raw: string): Clarity {
  const reasons: string[] = [];
  const text = raw.trim();
  if (text.length < 4) return { clear: false, reasons: ["النص قصير جداً؛ اكتب التمرين كاملاً."] };
  if (text.length > 4000) reasons.push("النص طويل جداً (الحد 4000 حرف).");
  if (/\uFFFD|\?{2,}|\[\s*\?\s*\]|\[(?:illisible|unclear)\]/i.test(text)) {
    reasons.push("يوجد جزء غير مقروء في النص. صحّحه قبل المتابعة.");
  }
  const total = Array.from(text.replace(/\s/g, "")).length;
  const meaningful = (text.match(/[\p{L}\p{M}\p{N}+\-*/=()[\]{}.,:;?!%^√π×÷<>≤≥≠±'"«»؟،؛٫²³°∞∑∫|/\\_$&#@~•–—…ـ]/gu) ?? []).length;
  if (total && meaningful / total < 0.7) reasons.push("يحتوي النص على رموز غريبة كثيرة غالباً من خطأ في التعرف على الصورة.");

  const withoutListMarkers = text.replace(/(?:^|[\s\n])(?:\d+|[٠-٩]+|[a-zA-Zأ-ي])\)/gu, " ");
  if ((withoutListMarkers.match(/\(/g) ?? []).length !== (withoutListMarkers.match(/\)/g) ?? []).length) {
    reasons.push("الأقواس غير متوازنة؛ صحّحها يدوياً ولا نعِد ترتيبها تلقائياً.");
  }
  for (const line of text.split(/\n/).map(l => normalizeMath(l).trim())) {
    const stripped = line.replace(/^\d+[.)\-]\s*/, "").trim();
    if (/^[\d\s+\-*/^().=x]+$/i.test(stripped) && /\d/.test(stripped)) {
      if (/[+\-*/^]\s*$/.test(stripped.replace(/=\s*\??$/, "").trim())) {
        reasons.push(`المعادلة ناقصة: «${stripped}».`); break;
      }
      if (/(^|[^\d.])\.(?!\d)|\d\.\d*\./.test(stripped)) { reasons.push(`رقم غير واضح في: «${stripped}».`); break; }
    }
  }
  return { clear: reasons.length === 0, reasons };
}
