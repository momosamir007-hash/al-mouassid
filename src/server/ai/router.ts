import { cooldownFor, ProviderError, redactSecret } from "./errors";
import type {
  Attempt,
  ChatRequest,
  ProviderAdapter,
  ProviderRecord,
  ProviderStore,
  ReadyState,
  RouteResult,
  TaskId,
} from "./types";

export type RoutingPolicy = "quality" | "cost" | "speed";

export interface RouterOptions {
  store: ProviderStore;
  createAdapter: (p: ProviderRecord) => ProviderAdapter;
  policy?: RoutingPolicy;
  /** مدة تخزين نتيجة فحص الجاهزية مؤقتاً (للمحلي). */
  readyTtlMs?: number;
  now?: () => number;
}

export interface RouteInput {
  task: TaskId;
  request: ChatRequest;
  userId?: string | null;
}

export class NoProviderAvailableError extends Error {
  attempts: Attempt[];
  code: "none_configured" | "all_failed";
  constructor(code: "none_configured" | "all_failed", attempts: Attempt[]) {
    super(code === "none_configured" ? "لا يوجد مزود ذكاء اصطناعي مناسب ومفعّل" : "تعذّر على كل المزودين تنفيذ الطلب");
    this.name = "NoProviderAvailableError";
    this.code = code;
    this.attempts = attempts;
  }
}

/**
 * سياسة الاختيار:
 *  - quality: المزودون السحابيون بحسب الأولوية، ثم المحليون (احتياطي).
 *  - cost: المحلي أولاً ثم الأرخص (تكلفة غير معروفة تُعدّ الأغلى).
 *  - speed: الأسرع بحسب آخر زمن استجابة مسجّل.
 * عند وجود صورة: المزودون الداعمون للرؤية يُجرَّبون أولاً ثم الباقون بنص التمرين فقط.
 */
export function orderProviders(list: ProviderRecord[], policy: RoutingPolicy, hasImage: boolean): ProviderRecord[] {
  const cost = (p: ProviderRecord) =>
    p.costInPer1k == null || p.costOutPer1k == null ? Number.POSITIVE_INFINITY : p.costInPer1k + p.costOutPer1k;
  const cmp = (a: ProviderRecord, b: ProviderRecord): number => {
    if (policy === "cost") {
      if (a.isLocal !== b.isLocal) return a.isLocal ? -1 : 1;
      const dc = cost(a) - cost(b);
      if (Number.isFinite(dc) && dc !== 0) return dc;
    } else if (policy === "speed") {
      const la = a.lastLatencyMs ?? Number.MAX_SAFE_INTEGER;
      const lb = b.lastLatencyMs ?? Number.MAX_SAFE_INTEGER;
      if (la !== lb) return la - lb;
    } else if (a.isLocal !== b.isLocal) {
      return a.isLocal ? 1 : -1;
    }
    return a.priority - b.priority || a.id - b.id;
  };
  const sorted = [...list].sort(cmp);
  if (!hasImage) return sorted;
  return [...sorted.filter((p) => p.supportsVision), ...sorted.filter((p) => !p.supportsVision)];
}

export class AiRouter {
  private readyCache = new Map<number, { at: number; state: ReadyState }>();
  private now: () => number;
  private policy: RoutingPolicy;
  private readyTtl: number;

  constructor(private opts: RouterOptions) {
    this.now = opts.now ?? Date.now;
    this.policy = opts.policy ?? "quality";
    this.readyTtl = opts.readyTtlMs ?? 15_000;
  }

  private async readiness(p: ProviderRecord, adapter: ProviderAdapter): Promise<ReadyState> {
    const cached = this.readyCache.get(p.id);
    if (cached && this.now() - cached.at < this.readyTtl) return cached.state;
    const state = await adapter.checkReady();
    this.readyCache.set(p.id, { at: this.now(), state });
    return state;
  }

  async run(input: RouteInput): Promise<RouteResult> {
    const attempts: Attempt[] = [];
    const all = await this.opts.store.listProviders();
    const hasImage = Boolean(input.request.images?.length);
    const eligible = all.filter((p) => p.enabled && p.tasks.includes(input.task));
    if (eligible.length === 0) throw new NoProviderAvailableError("none_configured", attempts);

    const ordered = orderProviders(eligible, this.policy, hasImage);
    const base = (p: ProviderRecord) => ({ providerId: p.id, providerName: p.name, isLocal: p.isLocal });

    for (const p of ordered) {
      if (p.cooldownUntil && p.cooldownUntil.getTime() > this.now()) {
        attempts.push({ ...base(p), outcome: "skipped", reason: "cooldown" });
        continue;
      }
      const usage = await this.opts.store.usageToday(p.id);
      if (p.dailyRequestLimit != null && usage.requests >= p.dailyRequestLimit) {
        attempts.push({ ...base(p), outcome: "skipped", reason: "limit_requests" });
        continue;
      }
      if (p.dailyCostLimitUsd != null && (p.costInPer1k == null || p.costOutPer1k == null)) {
        attempts.push({ ...base(p), outcome: "skipped", reason: "cost_unknown" });
        continue;
      }
      if (p.dailyCostLimitUsd != null && usage.costUsd >= p.dailyCostLimitUsd) {
        attempts.push({ ...base(p), outcome: "skipped", reason: "limit_cost" });
        continue;
      }

      let adapter: ProviderAdapter;
      try {
        adapter = this.opts.createAdapter(p);
      } catch (e) {
        attempts.push({ ...base(p), outcome: "skipped", reason: "bad_config", message: (e as Error).message });
        continue;
      }
      let ready: ReadyState;
      try { ready = await this.readiness(p, adapter); }
      catch (e) {
        const err = e instanceof ProviderError ? e : new ProviderError("unknown", redactSecret((e as Error)?.message ?? "فشل فحص الجاهزية", p.getApiKey?.()));
        attempts.push({ ...base(p), outcome: "failed", reason: `readiness:${err.kind}`, message: err.message });
        this.readyCache.delete(p.id);
        try { await this.opts.store.recordFailure(p.id, { task: input.task, userId: input.userId, kind: err.kind, message: err.message, latencyMs: 0, cooldownMs: cooldownFor(err) }); } catch { /* لا نوقف التحويل الاحتياطي بسبب سجل */ }
        continue;
      }
      if (!ready.ready) { attempts.push({ ...base(p), outcome: "skipped", reason: `not_ready:${ready.reason ?? "unknown"}` }); continue; }

      // نرسل الصورة فقط إلى نموذج يدعم الرؤية؛ غيره يتلقى النص وحده.
      const useImage = hasImage && p.supportsVision;
      const request: ChatRequest = { ...input.request, images: useImage ? input.request.images : undefined };

      const started = this.now();
      try {
        const out = await adapter.chat(request);
        const latencyMs = this.now() - started;
        const costUsd = out.inputTokens != null && out.outputTokens != null && p.costInPer1k != null && p.costOutPer1k != null
          ? (out.inputTokens / 1000) * p.costInPer1k + (out.outputTokens / 1000) * p.costOutPer1k : null;
        // فشل تسجيل الاستخدام لا يحوّل إجابة صحيحة إلى فشل ولا يرسل طلباً مدفوعاً ثانياً.
        try { await this.opts.store.recordSuccess(p.id, { task: input.task, userId: input.userId, latencyMs,
          inputTokens: out.inputTokens, outputTokens: out.outputTokens, costUsd }); }
        catch (e) { console.error("[ai-router] failed to record successful usage", e); }
        attempts.push({ ...base(p), outcome: "success" });
        return {
          text: out.text,
          provider: { id: p.id, name: p.name, model: p.model, isLocal: p.isLocal },
          attempts,
          imageUsed: useImage,
          imageRequested: hasImage,
          inputTokens: out.inputTokens,
          outputTokens: out.outputTokens,
          latencyMs,
        };
      } catch (e) {
        const err =
          e instanceof ProviderError ? e : new ProviderError("unknown", redactSecret((e as Error)?.message ?? "خطأ غير معروف", p.getApiKey?.()));
        const cooldownMs = cooldownFor(err);
        this.readyCache.delete(p.id);
        try { await this.opts.store.recordFailure(p.id, { task: input.task, userId: input.userId, kind: err.kind,
          message: err.message, latencyMs: this.now() - started, cooldownMs }); }
        catch (recordError) { console.error("[ai-router] failed to record provider failure", recordError); }
        attempts.push({ ...base(p), outcome: "failed", reason: err.kind, message: err.message });
        // لا إعادة إرسال إلى المزود نفسه أبداً؛ ننتقل إلى المزود التالي فقط.
      }
    }
    throw new NoProviderAvailableError("all_failed", attempts);
  }
}
