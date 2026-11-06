/**
 * محرك حساب آمن (بدون eval) للتحقق المحلي من التمارين الحسابية البسيطة.
 * يُستخدم على الخادم (كحقيقة مؤكدة تُمرَّر للنموذج) وعلى العميل (للعمل دون اتصال).
 */

const AR = "٠١٢٣٤٥٦٧٨٩";
const FA = "۰۱۲۳۴۵۶۷۸۹";

export function normalizeDigits(s: string): string {
  return s
    .replace(/[٠-٩]/g, (d) => String(AR.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String(FA.indexOf(d)));
}

export function normalizeMath(s: string): string {
  return normalizeDigits(s)
    .replace(/[×✕·⋅]/g, "*")
    .replace(/÷/g, "/")
    .replace(/[−–—]/g, "-")
    .replace(/٫/g, ".")
    .replace(/(\d),(\d)/g, "$1.$2")
    .replace(/(\d)\s*[xX]\s*(?=\d)/g, "$1*");
}

class ParseError extends Error {}

/** يقيّم تعبيراً حسابياً: + - * / ^ وأقواساً وأعداداً عشرية. يرمي خطأ إن كان غير صالح. */
export function evaluateExpression(input: string): number {
  const s = normalizeMath(input).replace(/\s+/g, "");
  if (!s || s.length > 200) throw new ParseError("bad length");
  if (!/^[0-9.+\-*/^()]+$/.test(s)) throw new ParseError("bad chars");
  let i = 0;

  const peek = () => s[i];
  function parseExpr(): number {
    let v = parseTerm();
    while (peek() === "+" || peek() === "-") {
      const op = s[i++];
      const r = parseTerm();
      v = op === "+" ? v + r : v - r;
    }
    return v;
  }
  function parseTerm(): number {
    let v = parsePower();
    while (peek() === "*" || peek() === "/") {
      const op = s[i++];
      const r = parsePower();
      if (op === "/" && r === 0) throw new ParseError("div by zero");
      v = op === "*" ? v * r : v / r;
    }
    return v;
  }
  function parsePower(): number {
    const base = parseUnary();
    if (peek() === "^") {
      i++;
      const exp = parsePower();
      return Math.pow(base, exp);
    }
    return base;
  }
  function parseUnary(): number {
    if (peek() === "-") {
      i++;
      return -parseUnary();
    }
    if (peek() === "+") {
      i++;
      return parseUnary();
    }
    return parsePrimary();
  }
  function parsePrimary(): number {
    if (peek() === "(") {
      i++;
      const v = parseExpr();
      if (peek() !== ")") throw new ParseError("missing )");
      i++;
      return v;
    }
    const m = /^\d+(?:\.\d+)?/.exec(s.slice(i));
    if (!m) throw new ParseError("number expected");
    i += m[0].length;
    return parseFloat(m[0]);
  }

  const result = parseExpr();
  if (i !== s.length) throw new ParseError("trailing input");
  if (!Number.isFinite(result)) throw new ParseError("not finite");
  return result;
}

/** تقييم من اليسار إلى اليمين دون أولوية العمليات (لاكتشاف خطأ شائع). */
function evaluateLeftToRight(expression: string): number | null {
  const s = normalizeMath(expression).replace(/\s+/g, "");
  if (/[()^]/.test(s)) return null;
  const tokens = s.match(/\d+(?:\.\d+)?|[+\-*/]/g);
  if (!tokens || tokens.length < 3 || tokens.join("") !== s) return null;
  let v = parseFloat(tokens[0]);
  if (Number.isNaN(v)) return null;
  for (let k = 1; k < tokens.length; k += 2) {
    const n = parseFloat(tokens[k + 1]);
    if (Number.isNaN(n)) return null;
    const op = tokens[k];
    if (op === "+") v += n;
    else if (op === "-") v -= n;
    else if (op === "*") v *= n;
    else {
      if (n === 0) return null;
      v /= n;
    }
  }
  return v;
}

/** يجد مقاطع تحتوي تعبيراً حسابياً (أرقام وعمليات بينها). */
export function findExpressionRegions(text: string): string[] {
  const s = normalizeMath(text);
  const runs = s.match(/[0-9(][0-9.+\-*/^()\s]*/g) ?? [];
  const out: string[] = [];
  for (const raw of runs) {
    const run = raw.replace(/[^0-9)]+$/, "").trim();
    if (!/\d\s*[+\-*/^]\s*[\d(]/.test(run) && !/\)\s*[*/^]|[*/^]\s*\(/.test(run)) continue;
    const open = (run.match(/\(/g) ?? []).length;
    const close = (run.match(/\)/g) ?? []).length;
    if (open !== close) continue;
    out.push(run);
  }
  return out;
}

const COMMAND_WORDS =
  /احسب|أوجد|اوجد|جد|ما\s*ناتج|ناتج|ما\s*قيمة|قيمة|حل|calcul\w*|compute|evaluate|solve|r[ée]sous|what\s+is|find|value\s+of|combien|vaut/gi;

export interface ArithExercise {
  expression: string;
  value: number;
}

/** يتعرف على التمرين إذا كان تعبيراً حسابياً خالصاً (مع كلمة أمر اختيارية مثل «احسب»). */
export function extractArithmetic(exerciseText: string): ArithExercise | null {
  const regions = findExpressionRegions(exerciseText);
  if (regions.length !== 1) return null;
  const region = regions[0];
  const normalized = normalizeMath(exerciseText);
  const rest = normalized.replace(region, " ").replace(COMMAND_WORDS, " ");
  const letters = (rest.match(/\p{L}/gu) ?? []).length;
  if (letters > 3) return null;
  try {
    return { expression: region, value: evaluateExpression(region) };
  } catch {
    return null;
  }
}

export type CommonError = "order_of_operations" | "sign" | "rounding" | "off_by_one";

export interface ArithVerdict {
  expression: string;
  expected: number;
  given: number;
  correct: boolean;
  commonError?: CommonError;
}

function parseGivenAnswer(answer: string): number | null {
  const s = normalizeMath(answer);
  const afterEq = s.includes("=") ? s.slice(s.lastIndexOf("=") + 1) : s;
  const regions = findExpressionRegions(afterEq);
  if (regions.length > 0) {
    try {
      return evaluateExpression(regions[regions.length - 1]);
    } catch {
      /* نكمل بمحاولة رقم مفرد */
    }
  }
  const nums = afterEq.match(/-?\d+(?:\.\d+)?/g);
  if (!nums) return null;
  return parseFloat(nums[nums.length - 1]);
}

/** تحقق حتمي من إجابة طالب لتمرين حسابي خالص؛ يعيد null إن لم يكن التمرين حسابياً خالصاً. */
export function checkArithmeticAnswer(exerciseText: string, answer: string): ArithVerdict | null {
  const ex = extractArithmetic(exerciseText);
  if (!ex) return null;
  const given = parseGivenAnswer(answer);
  if (given === null) return null;
  const tol = 1e-9 * Math.max(1, Math.abs(ex.value));
  const correct = Math.abs(given - ex.value) <= tol;
  const verdict: ArithVerdict = { expression: ex.expression, expected: ex.value, given, correct };
  if (!correct) {
    const ltr = evaluateLeftToRight(ex.expression);
    if (ltr !== null && Math.abs(ltr - given) <= 1e-9 && Math.abs(ltr - ex.value) > tol) {
      verdict.commonError = "order_of_operations";
    } else if (Math.abs(given + ex.value) <= tol) {
      verdict.commonError = "sign";
    } else if (Math.abs(given - ex.value) < 0.01) {
      verdict.commonError = "rounding";
    } else if (Math.abs(Math.abs(given - ex.value) - 1) < 1e-9) {
      verdict.commonError = "off_by_one";
    }
  }
  return verdict;
}

const COMMON_ERROR_TEXT: Record<CommonError, string> = {
  order_of_operations:
    "يبدو أنك حسبت العمليات من اليسار إلى اليمين دون مراعاة أولوية العمليات (الأقواس ثم القوى ثم الضرب والقسمة ثم الجمع والطرح).",
  sign: "انتبه إلى إشارة الناتج؛ يبدو أن الإشارة معكوسة.",
  rounding: "إجابتك قريبة جداً؛ راجع التقريب أو الكسر العشري.",
  off_by_one: "إجابتك تبعد عن الناتج بوحدة واحدة؛ راجع عملية الجمع أو الطرح الأخيرة.",
};

/** نص عربي للتحقق المحلي الحتمي؛ لا يكشف القيمة الصحيحة حين تكون الإجابة خاطئة. */
export function describeVerdict(v: ArithVerdict): string {
  if (v.correct) return `✅ إجابتك صحيحة. أحسنت! (التحقق تم حسابياً على جهازك/الخادم دون ذكاء اصطناعي)`;
  const tip = v.commonError ? `\n${COMMON_ERROR_TEXT[v.commonError]}` : "\nأعد حساب كل خطوة بهدوء ثم جرّب مرة أخرى.";
  return `❌ إجابتك ليست صحيحة بعد.${tip}\n(التحقق تم حسابياً دون ذكاء اصطناعي، ولم نكشف الناتج الصحيح كي تحاول مجدداً.)`;
}
