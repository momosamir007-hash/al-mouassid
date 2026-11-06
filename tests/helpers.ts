import type {
  ErrorKind,
  ProviderAdapter,
  ProviderRecord,
  ProviderStore,
  UsageToday,
} from "@/server/ai/types";

export function provider(over: Partial<ProviderRecord> & { id: number; name: string }): ProviderRecord {
  return {
    kind: "openai-compatible",
    baseUrl: null,
    model: "m",
    priority: 100,
    enabled: true,
    isLocal: false,
    tasks: ["text", "math", "explain", "verify"],
    supportsVision: false,
    timeoutMs: 2000,
    dailyRequestLimit: null,
    dailyCostLimitUsd: null,
    alertPercent: 80,
    costInPer1k: null,
    costOutPer1k: null,
    cooldownUntil: null,
    lastLatencyMs: null,
    ...over,
  };
}

export class MemoryStore implements ProviderStore {
  successes: { id: number; costUsd: number | null }[] = [];
  failures: { id: number; kind: ErrorKind; cooldownMs: number }[] = [];
  usage = new Map<number, UsageToday>();
  constructor(public providers: ProviderRecord[]) {}
  async listProviders() {
    return this.providers.map((p) => ({ ...p }));
  }
  async usageToday(id: number) {
    return this.usage.get(id) ?? { requests: 0, costUsd: 0 };
  }
  async recordSuccess(id: number, info: { costUsd: number | null }) {
    this.successes.push({ id, costUsd: info.costUsd });
    const u = this.usage.get(id) ?? { requests: 0, costUsd: 0 };
    this.usage.set(id, { requests: u.requests + 1, costUsd: u.costUsd + (info.costUsd ?? 0) });
  }
  async recordFailure(id: number, info: { kind: ErrorKind; cooldownMs: number }) {
    this.failures.push({ id, kind: info.kind, cooldownMs: info.cooldownMs });
    const u = this.usage.get(id) ?? { requests: 0, costUsd: 0 };
    this.usage.set(id, { requests: u.requests + 1, costUsd: u.costUsd });
  }
}

export function fakeAdapter(behaviour: () => Promise<string>, ready = true): ProviderAdapter & { calls: number; lastImages?: number } {
  const a = {
    calls: 0,
    lastImages: undefined as number | undefined,
    async chat(req: { images?: unknown[] }) {
      a.calls++;
      a.lastImages = req.images?.length;
      return { text: await behaviour(), inputTokens: 100, outputTokens: 50 };
    },
    async checkReady() {
      return ready ? { ready: true } : { ready: false, reason: "unreachable" };
    },
  };
  return a as unknown as ProviderAdapter & { calls: number; lastImages?: number };
}
