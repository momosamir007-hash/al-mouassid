import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { logError } from "./logger";

export class ApiError extends Error {
  status: number;
  code: string;
  data?: Record<string, unknown>;
  constructor(status: number, message: string, code = "error", data?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

export function ok<T extends Record<string, unknown>>(data: T, status = 200) {
  return NextResponse.json(data, { status, headers: { "cache-control": "no-store" } });
}

/** يغلّف المعالج: يحوّل الأخطاء إلى ردود JSON مفهومة دون تسريب تفاصيل داخلية. */
export async function handle(scope: string, fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ApiError) {
      return NextResponse.json({ error: e.message, code: e.code, ...(e.data ?? {}) }, { status: e.status });
    }
    if (e instanceof ZodError) {
      return NextResponse.json(
        { error: "بيانات غير صالحة", code: "validation", issues: e.issues.map((i) => `${i.path.join(".")}: ${i.message}`) },
        { status: 400 },
      );
    }
    logError(scope, e);
    return NextResponse.json({ error: "حدث خطأ داخلي في الخادم", code: "internal" }, { status: 500 });
  }
}

export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) throw new ApiError(415, "يجب أن يكون الطلب بصيغة JSON", "unsupported_media");
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ApiError(400, "JSON غير صالح", "bad_json");
  }
  return schema.parse(raw);
}

export function clientIp(req: Request): string {
  return (req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
}
