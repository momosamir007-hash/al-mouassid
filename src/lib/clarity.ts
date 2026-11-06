import { normalizeMath } from "@/lib/arith";

export interface Clarity {
  clear: boolean;
  reasons: string[];
}

/**
 * يفحص وضوح نص التمرين قبل بدء الحل (خصوصاً بعد OCR).
 * لا نبدأ الحل إذا كانت المعادلة أو الأرقام غير واضحة.
 */
export function assessClarity(raw: string): Clarity {
  const reasons: string[] = [];
  const text = raw.trim();
  if (text.length < 4) {
    return { clear: false, reasons: ["النص قصير جداً؛ اكتب التمرين كاملاً."] };
  }
  if (text.length > 4000) reasons.push("النص طويل جداً (الحد 4000 حرف).");

  if (/\uFFFD|\?\?\?|\[\?\]|\[illisible\]|\[unclear\]/i.test(text)) {
    reasons.push("يوجد جزء غير مقروء في النص (علامات استفهام أو رموز تالفة). صحّحه قبل المتابعة.");
  }

  const total = Array.from(text.replace(/\s/g, "")).length;
  const meaningful = (text.match(/[\p{L}\p{N}+\-*/=()[\]{}.,:;?!%^√π×÷<>≤≥≠±'"«»؟،٫²³°∞∑∫|/\\_]/gu) ?? []).length;
  if (total > 0 && meaningful / total < 0.8) {
    reasons.push("يحتوي النص على رموز غريبة كثيرة غالباً من خطأ في التعرف على الصورة.");
  }

  const open = (text.match(/\(/g) ?? []).length;
  const close = (text.match(/\)/g) ?? []).length;
  if (open !== close) reasons.push("الأقواس غير متوازنة؛ تأكد من المعادلة.");

  const lines = text.split(/\n/).map((l) => normalizeMath(l).trim());
  for (const line of lines) {
    if (/^[\d\s+\-*/^().=x]+$/i.test(line) && /\d/.test(line)) {
      if (/[+\-*/^]\s*$/.test(line.replace(/=\s*\??$/, "").trim())) {
        reasons.push(`المعادلة ناقصة: «${line}».`);
        break;
      }
      if (/(^|[^\d.])\.(?!\d)|\d\.\d*\./.test(line)) {
        reasons.push(`رقم غير واضح في: «${line}».`);
        break;
      }
    }
  }

  return { clear: reasons.length === 0, reasons };
}
