import type { ProviderKind } from "../types";

export interface AdapterConfig {
  kind: ProviderKind;
  baseUrl: string | null;
  model: string;
  apiKey: string | null;
  timeoutMs: number;
}
