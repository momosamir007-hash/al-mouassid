import { AiRouter, type RoutingPolicy } from "./router";
import { createAdapter } from "./providers";
import { DbProviderStore } from "./store";

export function currentPolicy(): RoutingPolicy {
  const p = process.env.AI_ROUTING_POLICY;
  return p === "cost" || p === "speed" ? p : "quality";
}

/** يُنشأ الموجّه عند كل طلب (بلا حالة مشتركة سوى قاعدة البيانات) لتنعكس تعديلات المدير فوراً. */
export function getRouter(): AiRouter {
  return new AiRouter({ store: new DbProviderStore(), createAdapter, policy: currentPolicy() });
}

export { NoProviderAvailableError } from "./router";
