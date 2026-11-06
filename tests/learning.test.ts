import { describe, expect, it } from "vitest";
import { checkArithmeticAnswer, describeVerdict, evaluateExpression, extractArithmetic, normalizeDigits } from "@/lib/arith";
import { assessClarity } from "@/lib/clarity";
import { ACTION_SPECS, taskFor } from "@/server/learning/actions";
import { runHelp, EngineInputError } from "@/server/learning/engine";
import { redactPII } from "@/server/learning/privacy";
import { buildSystemPrompt, summarizeProgress } from "@/server/learning/prompts";
import { AiRouter } from "@/server/ai/router";
import { decryptSecret, encryptSecret } from "@/server/ai/secrets";
import { HELP_ACTION_IDS } from "@/lib/constants";
import { fakeAdapter, MemoryStore, provider } from "./helpers";

describe("المحرك الحسابي الآمن", () => {
  it("يحترم أولوية العمليات والأقواس", () => {
    expect(evaluateExpression("12 + 7 × 3")).toBe(33);
    expect(evaluateExpression("(12 + 7) × 3")).toBe(57);
    expect(evaluateExpression("2^3^2")).toBe(512);
    expect(evaluateExpression("-3 + 5")).toBe(2);
    expect(evaluateExpression("٣ + ٤")).toBe(7);
    expect(evaluateExpression("10 ÷ 4")).toBe(2.5);
  });
  it("يرفض أي شيء غير حسابي (لا eval)", () => {
    expect(() => evaluateExpression("process.exit()")).toThrow();
    expect(() => evaluateExpression("1/0")).toThrow();
    expect(() => evaluateExpression("(1+2")).toThrow();
  });
  it("يتعرف على التمرين الحسابي الخالص فقط", () => {
    expect(extractArithmetic("احسب: 12 + 7 × 3")?.value).toBe(33);
    expect(extractArithmetic("12+7×3 = ?")?.value).toBe(33);
    expect(extractArithmetic("اشترى أحمد 5 تفاحات وأكل منها 2 ثم أعطى صديقه كمية، كم بقي له؟")).toBeNull();
    expect(extractArithmetic("حل المعادلة 2x + 3 = 7")).toBeNull();
  });
  it("يتحقق من إجابة الطالب ويكتشف الخطأ الشائع", () => {
    expect(checkArithmeticAnswer("12 + 7 × 3", "33")?.correct).toBe(true);
    expect(checkArithmeticAnswer("12 + 7 × 3", "= ٣٣")?.correct).toBe(true);
    const wrong = checkArithmeticAnswer("12 + 7 × 3", "57");
    expect(wrong?.correct).toBe(false);
    expect(wrong?.commonError).toBe("order_of_operations");
    expect(checkArithmeticAnswer("5 - 8", "3")?.commonError).toBe("sign");
    expect(describeVerdict(wrong!)).not.toContain("33"); // لا يكشف الناتج الصحيح
  });
  it("تطبيع الأرقام الهندية", () => expect(normalizeDigits("١٢٣٤٥٦٧٨٩٠")).toBe("1234567890"));
});

describe("وضوح التمرين (بوابة OCR)", () => {
  it("يرفض النص القصير والتالف والمعادلة الناقصة والأقواس غير المتوازنة", () => {
    expect(assessClarity("ab").clear).toBe(false);
    expect(assessClarity("احسب 12 + ???").clear).toBe(false);
    expect(assessClarity("احسب (3 + 4 × 2").clear).toBe(false);
    expect(assessClarity("12 + 7 ×").clear).toBe(false);
    expect(assessClarity("a\uFFFDb\uFFFD c\uFFFD d").clear).toBe(false);
  });
  it("يقبل تمريناً واضحاً", () => {
    expect(assessClarity("حل المعادلة التالية: 2x + 3 = 7").clear).toBe(true);
    expect(assessClarity("Calculate 12 + 7 × 3 =").clear).toBe(true);
  });
});

describe("منطق المساعدة التدريجية", () => {
  const base = {
    level: "primary" as const,
    subjectSlug: "math",
    subjectName: "الرياضيات",
    exerciseText: "احسب 3 + 4 × 2",
    history: [],
    hasImage: false,
  };

  it("كل زر غير الحل الكامل يمنع كشف الحل في التعليمات", () => {
    for (const id of HELP_ACTION_IDS) {
      const p = buildSystemPrompt({ ...base, action: id });
      if (id === "full_solution") {
        expect(p).not.toContain("ممنوع منعاً باتاً كشف الحل");
        expect(ACTION_SPECS[id].revealsSolution).toBe(true);
      } else {
        expect(p).toContain("ممنوع منعاً باتاً كشف الحل");
      }
    }
  });
  it("يتكيف الأسلوب مع المستوى", () => {
    expect(buildSystemPrompt({ ...base, action: "hint_1" })).toContain("جملاً قصيرة");
    expect(buildSystemPrompt({ ...base, level: "university", action: "hint_1" })).toContain("أكاديمي");
  });
  it("يحفظ سياق المساعدة السابقة لمنع التكرار", () => {
    const history = [
      { role: "user" as const, action: "hint_1", content: "q" },
      { role: "assistant" as const, action: "hint_1", content: "a" },
    ];
    expect(summarizeProgress(history)).toContain("أعطني تلميحاً أولاً");
    expect(buildSystemPrompt({ ...base, action: "hint_2", history })).toContain("المساعدة المقدَّمة سابقاً");
  });
  it("يمرّر نتيجة التحقق الحسابي المؤكدة", () => {
    const verdict = checkArithmeticAnswer("احسب 3 + 4 × 2", "14")!;
    const p = buildSystemPrompt({ ...base, action: "check_answer", verdict });
    expect(p).toContain("خاطئة");
    expect(p).toContain("11");
  });
  it("يحدد نوع المهمة", () => {
    expect(taskFor("check_answer", "arabic")).toBe("verify");
    expect(taskFor("hint_1", "math")).toBe("math");
    expect(taskFor("hint_1", "history-geo")).toBe("explain");
  });
  it("يحذف البيانات الشخصية", () => {
    expect(redactPII("راسلني على ali@example.com أو 0555 123 456")).not.toMatch(/ali@|0555/);
    expect(redactPII("احسب 12 + 7 × 3")).toBe("احسب 12 + 7 × 3");
  });
});

describe("المحرك مع الموجّه", () => {
  const input = {
    level: "middle" as const,
    subjectSlug: "math",
    subjectName: "الرياضيات",
    exerciseText: "احسب 12 + 7 × 3",
    history: [],
  };

  it("يرفض التمرين غير الواضح قبل استدعاء أي مزود", async () => {
    const a = fakeAdapter(async () => "x");
    const router = new AiRouter({ store: new MemoryStore([provider({ id: 1, name: "A" })]), createAdapter: () => a });
    await expect(runHelp({ ...input, exerciseText: "12 + ???", action: "hint_1" }, router)).rejects.toBeInstanceOf(EngineInputError);
    expect(a.calls).toBe(0);
  });
  it("التحقق من الإجابة بلا إجابة مكتوبة يُرفض", async () => {
    const router = new AiRouter({ store: new MemoryStore([]), createAdapter: () => fakeAdapter(async () => "x") });
    await expect(runHelp({ ...input, action: "check_answer" }, router)).rejects.toMatchObject({ code: "needs_answer" });
  });
  it("عند تعذر كل المزودين: تحقق حسابي حتمي للتمارين الحسابية، وخطأ صريح لغيرها", async () => {
    const down = fakeAdapter(async () => {
      throw new (await import("@/server/ai/errors")).ProviderError("quota", "no credit");
    });
    const store = () => new MemoryStore([provider({ id: 1, name: "A" })]);
    const router = new AiRouter({ store: store(), createAdapter: () => down, readyTtlMs: 0 });
    const out = await runHelp({ ...input, action: "check_answer", studentAnswer: "33" }, router);
    expect(out.source).toBe("local");
    expect(out.text).toContain("صحيحة");
    await expect(
      runHelp({ ...input, exerciseText: "اشرح سبب سقوط الأجسام نحو الأرض", subjectSlug: "physics", action: "hint_1" }, new AiRouter({ store: store(), createAdapter: () => down, readyTtlMs: 0 })),
    ).rejects.toMatchObject({ name: "NoProviderAvailableError" });
  });
});

describe("حماية المفاتيح", () => {
  it("تشفير AES-GCM ذهاباً وإياباً، والنص المشفّر لا يحتوي المفتاح", () => {
    const secret = "unit-test-secret-0123456789";
    const enc = encryptSecret("sk-live-ABCDEFG", secret);
    expect(enc).not.toContain("ABCDEFG");
    expect(decryptSecret(enc, secret)).toBe("sk-live-ABCDEFG");
    expect(() => decryptSecret(enc, "another-secret-0123456789")).toThrow();
  });
});
