import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { logError } from "./logger";

export class ApiError extends Error {
  status: number; code: string; data?: Record<string, unknown>;
  constructor(status: number, message: string, code = "error", data?: Record<string, unknown>) { super(message); this.status = status; this.code = code; this.data = data; }
}
const noStore = { "cache-control": "no-store, max-age=0", "x-content-type-options": "nosniff" };
export function ok<T extends Record<string, unknown>>(data: T, status = 200) { return NextResponse.json(data, { status, headers: noStore }); }
export async function handle(scope: string, fn: () => Promise<Response>): Promise<Response> {
  try { return await fn(); }
  catch (e) {
    if (e instanceof ApiError) return NextResponse.json({ error: e.message, code: e.code, ...(e.data ?? {}) }, { status: e.status, headers: noStore });
    if (e instanceof ZodError) return NextResponse.json({ error: "بيانات غير صالحة", code: "validation", issues: e.issues.map(i => `${i.path.join(".")}: ${i.message}`) }, { status: 400, headers: noStore });
    logError(scope, e);
    return NextResponse.json({ error: "حدث خطأ داخلي في الخادم", code: "internal" }, { status: 500, headers: noStore });
  }
}

export async function parseBody<T>(req: Request, schema: ZodType<T>, maxBytes = 8 * 1024 * 1024): Promise<T> {
  const ct = req.headers.get("content-type") ?? "";
  if (!/^application\/json(?:\s*;|$)/i.test(ct)) throw new ApiError(415, "يجب أن يكون الطلب بصيغة JSON", "unsupported_media");
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > maxBytes) throw new ApiError(413, "حجم الطلب أكبر من الحد المسموح.", "body_too_large");
  if (!req.body) throw new ApiError(400, "جسم الطلب فارغ.", "bad_json");
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = []; let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) { await reader.cancel(); throw new ApiError(413, "حجم الطلب أكبر من الحد المسموح.", "body_too_large"); }
      chunks.push(value);
    }
  } catch (e) { if (e instanceof ApiError) throw e; throw new ApiError(400, "تعذر قراءة الطلب.", "bad_json"); }
  const bytes = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let raw: unknown;
  try { raw = JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new ApiError(400, "JSON غير صالح", "bad_json"); }
  return schema.parse(raw);
}

export function clientIp(req: Request): string {
  // لا نثق بـ x-forwarded-for إلا إذا كان الوكيل الأمامي يضبطه ويستبدله.
  // على Vercel يُستخدم x-real-ip الذي يمرره الوكيل، وإلا نرجع إلى قيمة عامة.
  const real = req.headers.get("x-real-ip");
  const forwarded = req.headers.get("x-forwarded-for");
  const candidate = real ?? (forwarded ? forwarded.split(",").at(-1)?.trim() : null) ?? "unknown";
  return candidate.slice(0, 80);
}
