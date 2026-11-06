import type { ProviderKind, TaskId } from "@/lib/constants";

export type { ProviderKind, TaskId };

export type ErrorKind =
  | "quota" // نفاد الرصيد/الحصة
  | "rate_limit" // تجاوز معدل الطلبات
  | "timeout" // انتهاء المهلة (نتيجة الطلب غير مؤكدة)
  | "network" // انقطاع الاتصال
  | "auth" // خطأ مصادقة/مفتاح
  | "unavailable" // توقف مؤقت للمزود / 5xx
  | "unsupported" // النموذج لا يدعم نوع الإدخال
  | "bad_request" // طلب/نموذج غير صالح
  | "unknown";

export interface ChatImage {
  mime: string;
  /** base64 بدون بادئة data: */
  data: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  system: string;
  messages: ChatMessage[];
  images?: ChatImage[];
  maxTokens?: number;
  temperature?: number;
}

export interface ChatResult {
  text: string;
  inputTokens?: number;
  outputTokens?: number;
}

export interface ReadyState {
  ready: boolean;
  reason?: string;
  /** للنماذج المحلية */
  available?: boolean;
  loaded?: boolean;
}

export interface ProviderAdapter {
  chat(req: ChatRequest): Promise<ChatResult>;
  /** فحص الجاهزية قبل الاستخدام (للمحلي: الخدمة تعمل والنموذج موجود). */
  checkReady(): Promise<ReadyState>;
}

/** سجل مزود كما يراه الموجّه (بدون أي سر). */
export interface ProviderRecord {
  id: number;
  name: string;
  kind: ProviderKind;
  baseUrl: string | null;
  model: string;
  priority: number;
  enabled: boolean;
  isLocal: boolean;
  tasks: TaskId[];
  supportsVision: boolean;
  timeoutMs: number;
  dailyRequestLimit: number | null;
  dailyCostLimitUsd: number | null;
  alertPercent: number;
  costInPer1k: number | null;
  costOutPer1k: number | null;
  cooldownUntil: Date | null;
  lastLatencyMs: number | null;
  /** يُحلّ المفتاح عند الاستدعاء فقط. */
  getApiKey?: () => string | null;
}

export interface UsageToday {
  requests: number;
  costUsd: number;
}

export interface ProviderStore {
  listProviders(): Promise<ProviderRecord[]>;
  usageToday(providerId: number): Promise<UsageToday>;
  recordSuccess(
    providerId: number,
    info: {
      task: string;
      userId?: string | null;
      latencyMs: number;
      inputTokens?: number;
      outputTokens?: number;
      costUsd: number | null;
    },
  ): Promise<void>;
  recordFailure(
    providerId: number,
    info: {
      task: string;
      userId?: string | null;
      kind: ErrorKind;
      message: string;
      latencyMs: number;
      cooldownMs: number;
    },
  ): Promise<void>;
}

export interface Attempt {
  providerId: number;
  providerName: string;
  isLocal: boolean;
  outcome: "success" | "skipped" | "failed";
  reason?: string;
  message?: string;
}

export interface RouteResult {
  text: string;
  provider: { id: number; name: string; model: string; isLocal: boolean };
  attempts: Attempt[];
  imageUsed: boolean;
  imageRequested: boolean;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs: number;
}
