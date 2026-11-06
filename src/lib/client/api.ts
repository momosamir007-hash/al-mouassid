export class ApiClientError extends Error {
  status: number;
  code: string;
  data: Record<string, unknown>;
  constructor(status: number, message: string, code: string, data: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

/** استدعاء API: يعيد خطأً مفهوماً عند الانقطاع (status = 0). */
export async function api<T = Record<string, unknown>>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(path, {
      ...rest,
      headers: { ...(json !== undefined ? { "content-type": "application/json" } : {}), ...(headers ?? {}) },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
      credentials: "same-origin",
    });
  } catch {
    throw new ApiClientError(0, "لا يوجد اتصال بالإنترنت أو الخادم لا يستجيب.", "offline");
  }
  let data: Record<string, unknown> = {};
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    /* رد بلا JSON */
  }
  if (!res.ok) {
    throw new ApiClientError(res.status, String(data.error ?? "حدث خطأ غير متوقع"), String(data.code ?? "error"), data);
  }
  return data as T;
}
