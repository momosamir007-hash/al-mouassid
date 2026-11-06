"use client";

import { useState } from "react";
import { evaluateExpression } from "@/lib/arith";

/** حاسبة محلية آمنة (بدون eval) تعمل دون إنترنت ودون نموذج لغوي. */
export function MiniCalculator() {
  const [expr, setExpr] = useState("");
  let result: string | null = null;
  let error = false;
  if (expr.trim()) {
    try {
      const v = evaluateExpression(expr);
      result = String(Math.round(v * 1e9) / 1e9);
    } catch {
      error = true;
    }
  }
  return (
    <section className="card space-y-2">
      <h2 className="text-lg font-extrabold">🧮 حاسبة محلية</h2>
      <p className="text-sm text-stone-600">تدعم + − × ÷ ^ والأقواس وتراعي أولوية العمليات.</p>
      <input
        dir="ltr"
        className="input text-start"
        inputMode="text"
        placeholder="(12 + 7) × 3"
        value={expr}
        onChange={(e) => setExpr(e.target.value)}
        aria-label="تعبير حسابي"
      />
      <p className="min-h-7 text-lg font-extrabold" dir="ltr" style={{ textAlign: "start" }}>
        {result !== null && <span className="text-teal-800">= {result}</span>}
        {error && <span className="text-sm font-bold text-stone-400">تعبير غير مكتمل أو غير صالح</span>}
      </p>
    </section>
  );
}
