import { normalizeMath } from "@/lib/arith";

export interface Clarity {
  clear: boolean;
  reasons: string[];
}

/**
 * ينظّف النص المستخرج من الكاميرا أو الـ OCR التقليدي من الرموز التالفة والأقواس المكسورة
 * حتى لا تتعطل عملية المتابعة بسبب أخطاء OCR البسيطة.
 */
export function cleanOcrOutput(raw: string): string {
  let text = raw
    .replace(/\uFFFD+/g, "")
    .replace(/\[\?\]|\[illisible\]|\[unclear\]/gi, "")
    .replace(/\?{2,}/g, "؟")
    .replace(/[|~`]+/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

  // موازنة الأقواس تلقائياً إذا ترك الـ OCR قوساً مفتوحاً أو مغلقاً دون مقابل (بعد استثناء ترقيم الفقرات مثل 1) أو أ))
  const withoutListMarkers = text.replace(/(?:^|[\s\n])(?:\d+|[٠-٩]+|[a-zA-Zأ-ي])\)/gu, " ");
  const open = (withoutListMarkers.match(/\(/g) ?? []).length;
  const close = (withoutListMarkers.match(/\)/g) ?? []).length;
  if (open > close) {
    text = text + ")".repeat(open - close);
  } else if (close > open) {
    // إذا كان هناك قوس إغلاق زائد ليس ترقيماً، نزيله من النهاية أو نضيف قوس فتح
    let diff = close - open;
    text = text.replace(/\)/g, (m, offset, str) => {
      if (diff <= 0) return m;
      const before = str.slice(Math.max(0, offset - 3), offset);
      if (/(?:^|[\s\n])(?:\d+|[٠-٩]+|[a-zA-Zأ-ي])$/u.test(before)) return m;
      diff--;
      return "";
    });
  }

  return text.trim();
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
  const meaningful = (
    text.match(/[\p{L}\p{M}\p{N}+\-*/=()[\]{}.,:;?!%^√π×÷<>≤≥≠±'"«»؟،؛٫²³°∞∑∫|/\\_$&#@~•–—…ـ]/gu) ?? []
  ).length;
  if (total > 0 && meaningful / total < 0.7) {
    reasons.push("يحتوي النص على رموز غريبة كثيرة غالباً من خطأ في التعرف على الصورة.");
  }

  // استثناء ترقيم الأسئلة الشائع في الكتب المدرسية مثل: 1) أو 2) أو أ) أو ب) أو a)
  const textWithoutListParens = text.replace(/(?:^|[\s\n])(?:\d+|[٠-٩]+|[a-zA-Zأ-ي])\)/gu, " ");
  const open = (textWithoutListParens.match(/\(/g) ?? []).length;
  const close = (textWithoutListParens.match(/\)/g) ?? []).length;
  if (open !== close) reasons.push("الأقواس غير متوازنة؛ تأكد من المعادلة.");

  const lines = text.split(/\n/).map((l) => normalizeMath(l).trim());
  for (const line of lines) {
    // تجاهل ترقيم بداية السطر مثل "1." أو "2-" عند فحص المعادلات الحسابية الخالصة
    const strippedLine = line.replace(/^\d+[.)\-]\s*/, "").trim();
    if (/^[\d\s+\-*/^().=x]+$/i.test(strippedLine) && /\d/.test(strippedLine)) {
      if (/[+\-*/^]\s*$/.test(strippedLine.replace(/=\s*\??$/, "").trim())) {
        reasons.push(`المعادلة ناقصة: «${strippedLine}».`);
        break;
      }
      if (!strippedLine.includes("..") && (/(^|[^\d.])\.(?!\d)|\d\.\d*\./.test(strippedLine))) {
        reasons.push(`رقم غير واضح في: «${strippedLine}».`);
        break;
      }
    }
  }

  return { clear: reasons.length === 0, reasons };
}
