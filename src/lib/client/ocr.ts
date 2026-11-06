export const OCR_LANGS = [
  { id: "ara+eng", label: "عربي + إنجليزي + أرقام" },
  { id: "fra+eng", label: "فرنسي + إنجليزي + أرقام" },
  { id: "ara+fra+eng", label: "عربي + فرنسي + إنجليزي" },
  { id: "eng", label: "إنجليزي وأرقام ورموز فقط" },
] as const;

export interface OcrResult {
  text: string;
  confidence: number;
}

/**
 * OCR داخل المتصفح عبر Tesseract.js (لا تغادر الصورة الجهاز في هذه المرحلة).
 * ملفات اللغة تُنزَّل أول مرة من الإنترنت ثم تُخزَّن مؤقتاً في المتصفح.
 */
export async function recognize(
  canvas: HTMLCanvasElement,
  langs: string,
  onProgress: (pct: number, status: string) => void,
): Promise<OcrResult> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker(langs, 1, {
    logger: (m: { progress: number; status: string }) => onProgress(Math.round((m.progress ?? 0) * 100), m.status),
  });
  try {
    const { data } = await worker.recognize(canvas);
    return { text: data.text.trim(), confidence: Math.round(data.confidence) };
  } finally {
    await worker.terminate();
  }
}
