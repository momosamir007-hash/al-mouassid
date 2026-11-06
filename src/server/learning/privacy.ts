/** يحذف البيانات الشخصية الواضحة من النص قبل إرساله إلى أي نموذج. */
export function redactPII(text: string): string {
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[بريد محذوف]")
    .replace(/(?<![\d.])\+?\d[\d\s-]{7,}\d(?![\d.])/g, (m) => {
      const digits = m.replace(/\D/g, "").length;
      return digits >= 9 && digits <= 15 && !/\n/.test(m) ? "[رقم محذوف]" : m;
    });
}
