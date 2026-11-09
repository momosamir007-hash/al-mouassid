/** يحذف البيانات الشخصية الواضحة قبل إرسال النصوص إلى مزودي الذكاء الاصطناعي. */
export function redactPII(text: string): string {
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[بريد محذوف]")
    // \p{N} يشمل الأرقام العربية والهندية وغيرها، وليس 0-9 فقط.
    .replace(/(?<![\p{N}.])[+＋]?[\p{N}](?:[\p{N}\s().\-–—]{6,}[\p{N}])(?![\p{N}.])/gu, (m) => {
      const digits = (m.match(/\p{N}/gu) ?? []).length;
      return digits >= 8 && digits <= 15 && !m.includes("\n") ? "[رقم محذوف]" : m;
    });
}
