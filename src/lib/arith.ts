/**
 * محرك حساب آمن (بدون eval) للتحقق المحلي من التمارين الحسابية البسيطة.
 * يدعم أولوية العمليات الصحيحة: الأسس قبل الإشارة الأحادية، والأسس يمينية الترابط.
 */
const AR = "٠١٢٣٤٥٦٧٨٩";
const FA = "۰۱۲۳۴۵۶۷۸۹";

export function normalizeDigits(s: string): string {
  return s.replace(/[٠-٩]/g, d => String(AR.indexOf(d))).replace(/[۰-۹]/g, d => String(FA.indexOf(d)));
}

export function normalizeMath(s: string): string {
  return normalizeDigits(s)
    .replace(/[×✕·⋅]/g, "*").replace(/÷/g, "/")
    .replace(/[−–—]/g, "-").replace(/٫/g, ".")
    .replace(/(\d),(\d)/g, "$1.$2").replace(/(\d)\s*[xX]\s*(?=\d)/g, "$1*");
}

class ParseError extends Error {}

/** محلل recursive-descent؛ لا يستخدم eval أو Function مطلقاً. */
export function evaluateExpression(input: string): number {
  const s = normalizeMath(input).replace(/\s+/g, "");
  if (!s || s.length > 200 || !/^[0-9.+\-*/^()]+$/.test(s)) throw new ParseError("bad expression");
  let i = 0;
  const peek = () => s[i];

  function parseExpr(): number {
    let v = parseTerm();
    while (peek() === "+" || peek() === "-") {
      const op = s[i++]; const rhs = parseTerm();
      v = op === "+" ? v + rhs : v - rhs;
    }
    return v;
  }
  function parseTerm(): number {
    let v = parseUnary();
    while (peek() === "*" || peek() === "/") {
      const op = s[i++]; const rhs = parseUnary();
      if (op === "/" && rhs === 0) throw new ParseError("division by zero");
      v = op === "*" ? v * rhs : v / rhs;
    }
    return v;
  }
  // الإشارة أقل أولوية من القوة: -2^2 = -(2^2)، مع دعم 2^-2.
  function parseUnary(): number {
    if (peek() === "+") { i++; return parseUnary(); }
    if (peek() === "-") { i++; return -parseUnary(); }
    return parsePower();
  }
  function parsePower(): number {
    const base = parsePrimary();
    if (peek() === "^") { i++; return Math.pow(base, parseUnary()); }
    return base;
  }
  function parsePrimary(): number {
    if (peek() === "(") {
      i++; const v = parseExpr();
      if (peek() !== ")") throw new ParseError("missing )");
      i++; return v;
    }
    const m = /^(?:\d+(?:\.\d*)?|\.\d+)/.exec(s.slice(i));
    if (!m) throw new ParseError("number expected");
    i += m[0].length;
    return Number(m[0]);
  }

  const result = parseExpr();
  if (i !== s.length || !Number.isFinite(result)) throw new ParseError("invalid result");
  return result;
}

/** يستخرج المقاطع الحسابية مع الاحتفاظ بالإشارة السالبة في بداية التعبير. */
export function findExpressionRegions(text: string): string[] {
  const s = normalizeMath(text);
  const re = /(?<![\p{L}\p{N}_])[-+]?(?:\d+(?:\.\d*)?|\.\d+|\()[\d.+\-*/^()\s]*/gu;
  const out: string[] = [];
  for (const match of s.matchAll(re)) {
    let run = match[0].trim();
    // لا نسمح بنهاية معلّقة على عامل حسابي أو قوس فتح.
    run = run.replace(/[+\-*/^.(\s]+$/g, "").trim();
    if (!run || !/\d/.test(run)) continue;
    if (!/[+\-*/^]/.test(run)) continue;
    const opens = (run.match(/\(/g) ?? []).length;
    const closes = (run.match(/\)/g) ?? []).length;
    if (opens !== closes) continue;
    out.push(run);
  }
  return [...new Set(out)];
}

function evaluateLeftToRight(expression: string): number | null {
  const s = normalizeMath(expression).replace(/\s+/g, "");
  if (/[()^]/.test(s) || /^[+-]/.test(s)) return null;
  const tokens = s.match(/(?:^|[+*/-])(?:\d+(?:\.\d*)?|\.\d+)|[+*/-]/g);
  if (!tokens || tokens.join("") !== s) return null;
  const normalized = s.match(/\d+(?:\.\d*)?|\.\d+|[+*/-]/g);
  if (!normalized || normalized.length < 3 || normalized.length % 2 === 0) return null;
  let value = Number(normalized[0]);
  for (let i = 1; i < normalized.length; i += 2) {
    const rhs = Number(normalized[i + 1]); const op = normalized[i];
    if (!Number.isFinite(rhs)) return null;
    if (op === "+") value += rhs; else if (op === "-") value -= rhs; else if (op === "*") value *= rhs;
    else { if (rhs === 0) return null; value /= rhs; }
  }
  return Number.isFinite(value) ? value : null;
}

const COMMAND_WORDS = /احسب|أوجد|اوجد|جد|ما\s*ناتج|ناتج|ما\s*قيمة|قيمة|حل|calcul\w*|compute|evaluate|solve|r[ée]sous|what\s+is|find|value\s+of|combien|vaut/gi;
export interface ArithExercise { expression: string; value: number }

export function extractArithmetic(exerciseText: string): ArithExercise | null {
  const regions = findExpressionRegions(exerciseText);
  if (regions.length !== 1) return null;
  const region = regions[0];
  const rest = normalizeMath(exerciseText).replace(region, " ").replace(COMMAND_WORDS, " ");
  if ((rest.match(/\p{L}/gu) ?? []).length > 3) return null;
  try { return { expression: region, value: evaluateExpression(region) }; } catch { return null; }
}

export type CommonError = "order_of_operations" | "sign" | "rounding" | "off_by_one";
export interface ArithVerdict { expression: string; expected: number; given: number; correct: boolean; commonError?: CommonError }

function parseGivenAnswer(answer: string): number | null {
  let s = normalizeMath(answer).trim();
  if (!s) return null;
  if (s.includes("=")) s = s.slice(s.lastIndexOf("=") + 1).trim();
  else {
    // نقبل عبارات نهائية صريحة فقط؛ لا نلتقط آخر رقم عشوائياً من شرح طويل.
    s = s.replace(/^(?:الإجابة|الجواب|الناتج|يساوي|answer|result)\s*[:：=]?\s*/i, "").trim();
  }
  s = s.replace(/[.،؛;:!?؟]+$/u, "").trim();
  try { return evaluateExpression(s); } catch { return null; }
}

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
    if (ltr !== null && Math.abs(ltr - given) <= tol && Math.abs(ltr - ex.value) > tol) verdict.commonError = "order_of_operations";
    else if (Math.abs(given + ex.value) <= tol) verdict.commonError = "sign";
    else if (Math.abs(given - ex.value) < 0.01) verdict.commonError = "rounding";
    else if (Math.abs(Math.abs(given - ex.value) - 1) < 1e-9) verdict.commonError = "off_by_one";
  }
  return verdict;
}

const COMMON_ERROR_TEXT: Record<CommonError, string> = {
  order_of_operations: "يبدو أنك لم تراعِ أولوية العمليات (الأقواس ثم القوى ثم الضرب والقسمة ثم الجمع والطرح).",
  sign: "انتبه إلى إشارة الناتج؛ يبدو أن الإشارة معكوسة.",
  rounding: "إجابتك قريبة جداً؛ راجع التقريب أو الكسر العشري.",
  off_by_one: "إجابتك تبعد عن الناتج بوحدة واحدة؛ راجع العملية الأخيرة.",
};
export function describeVerdict(v: ArithVerdict): string {
  if (v.correct) return "✅ إجابتك صحيحة. أحسنت! (تم التحقق حسابياً دون ذكاء اصطناعي)";
  const tip = v.commonError ? `\n${COMMON_ERROR_TEXT[v.commonError]}` : "\nأعد حساب كل خطوة بهدوء ثم جرّب مرة أخرى.";
  return `❌ إجابتك ليست صحيحة بعد.${tip}\n(لم نكشف الناتج الصحيح كي تحاول مجدداً.)`;
}
