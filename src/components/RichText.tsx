import type { ReactNode } from "react";

const LATEX_SYMBOLS: [RegExp, string][] = [
  [/\\times\b/g, "×"],
  [/\\div\b/g, "÷"],
  [/\\cdot\b/g, "·"],
  [/\\pm\b/g, "±"],
  [/\\mp\b/g, "∓"],
  [/\\(?:leq|le)\b/g, "≤"],
  [/\\(?:geq|ge)\b/g, "≥"],
  [/\\(?:neq|ne)\b/g, "≠"],
  [/\\approx\b/g, "≈"],
  [/\\equiv\b/g, "≡"],
  [/\\(?:Rightarrow|implies)\b/g, "⇒"],
  [/\\(?:Leftrightarrow|iff)\b/g, "⇔"],
  [/\\(?:rightarrow|to)\b/g, "→"],
  [/\\leftarrow\b/g, "←"],
  [/\\infty\b/g, "∞"],
  [/\\pi\b/g, "π"],
  [/\\Delta\b/g, "Δ"],
  [/\\theta\b/g, "θ"],
  [/\\alpha\b/g, "α"],
  [/\\beta\b/g, "β"],
  [/\\gamma\b/g, "γ"],
  [/\\lambda\b/g, "λ"],
  [/\\mu\b/g, "μ"],
  [/\\sigma\b/g, "σ"],
  [/\\omega\b/g, "ω"],
  [/\\Omega\b/g, "Ω"],
  [/\\sum\b/g, "∑"],
  [/\\int\b/g, "∫"],
  [/\\partial\b/g, "∂"],
  [/\\forall\b/g, "∀"],
  [/\\exists\b/g, "∃"],
  [/\\notin\b/g, "∉"],
  [/\\in\b/g, "∈"],
  [/\\subset\b/g, "⊂"],
  [/\\cup\b/g, "∪"],
  [/\\cap\b/g, "∩"],
  [/\\emptyset\b/g, "∅"],
  [/\\angle\b/g, "∠"],
  [/\\perp\b/g, "⊥"],
  [/\\parallel\b/g, "∥"],
  [/\\triangle\b/g, "△"],
  [/\\^\{\\circ\}|\\circ\b/g, "°"],
  [/\\(?:left|right)\s*([()[\]{}|])/g, "$1"],
  [/\\(?:quad|qquad|,|;|!)\b/g, " "],
  [/\\(?:text|mathrm|mathbf|mathit)\{([^{}]*)\}/g, "$1"],
];

function replaceSymbols(input: string): string {
  let out = input;
  for (const [re, rep] of LATEX_SYMBOLS) {
    out = out.replace(re, rep);
  }
  return out;
}

/** يقرأ محتوى بين قوسين متوازنين { ... } بدءاً من الموضع pos */
function readBraced(str: string, pos: number): { content: string; nextPos: number } | null {
  while (pos < str.length && str[pos] === " ") pos++;
  if (str[pos] !== "{") return null;
  let depth = 0;
  let start = pos + 1;
  for (let i = pos; i < str.length; i++) {
    if (str[i] === "{") depth++;
    else if (str[i] === "}") {
      depth--;
      if (depth === 0) {
        return { content: str.slice(start, i), nextPos: i + 1 };
      }
    }
  }
  return null;
}

/**
 * يحوّل تعبير رياضي (LaTeX أو صيغة رياضية) إلى عناصر React منسّقة:
 * كسور عمودية حقيقية (\frac{a}{b})، جذور (\sqrt{x})، أسس (x^2)، وأدلة سفلية (x_1).
 */
export function renderMathExpr(expr: string, keyBase: string, depth = 0): ReactNode[] {
  const s = replaceSymbols(expr.trim());
  if (depth > 6 || !s) return [s];

  const nodes: ReactNode[] = [];
  let buf = "";
  let i = 0;

  const flushBuf = () => {
    if (!buf) return;
    // تحويل الكسور البسيطة مثل a/b أو 3/4 داخل الوضع الرياضي إلى كسر عمودي أنيق
    const parts = buf.split(/(?<![\w\\])(\d+|\([^{}()]+?\)|[a-zA-Z]+)\s*\/\s*(\d+|\([^{}()]+?\)|[a-zA-Z]+)(?![\w])/g);
    if (parts.length > 1 && depth < 3) {
      for (let idx = 0; idx < parts.length; idx += 3) {
        if (parts[idx]) nodes.push(<span key={`${keyBase}-t-${i}-${idx}`}>{parts[idx]}</span>);
        if (idx + 2 < parts.length) {
          const num = parts[idx + 1].replace(/^\((.*)\)$/, "$1");
          const den = parts[idx + 2].replace(/^\((.*)\)$/, "$1");
          nodes.push(
            <span
              key={`${keyBase}-sf-${i}-${idx}`}
              dir="ltr"
              className="mx-1 inline-flex flex-col items-center justify-center align-middle text-[0.92em] leading-none"
            >
              <span className="border-b border-current px-1 pb-0.5 font-semibold">{num}</span>
              <span className="px-1 pt-0.5 font-semibold">{den}</span>
            </span>,
          );
        }
      }
    } else {
      nodes.push(<span key={`${keyBase}-b-${i}`}>{buf}</span>);
    }
    buf = "";
  };

  while (i < s.length) {
    // 1. \frac{num}{den} أو \dfrac{num}{den} أو \tfrac{num}{den}
    const fracMatch = /^\\(?:d|t)?frac\b/.exec(s.slice(i));
    if (fracMatch) {
      const first = readBraced(s, i + fracMatch[0].length);
      if (first) {
        const second = readBraced(s, first.nextPos);
        if (second) {
          flushBuf();
          nodes.push(
            <span
              key={`${keyBase}-frac-${i}`}
              dir="ltr"
              className="mx-1 inline-flex flex-col items-center justify-center align-middle text-[0.95em] leading-tight"
            >
              <span className="border-b border-current px-1.5 pb-0.5 text-center font-semibold">
                {renderMathExpr(first.content, `${keyBase}-fn-${i}`, depth + 1)}
              </span>
              <span className="px-1.5 pt-0.5 text-center font-semibold">
                {renderMathExpr(second.content, `${keyBase}-fd-${i}`, depth + 1)}
              </span>
            </span>,
          );
          i = second.nextPos;
          continue;
        }
      }
    }

    // 2. \sqrt[n]{x} أو \sqrt{x}
    const sqrtMatch = /^\\sqrt(?:\[([^\]]+)\])?/.exec(s.slice(i));
    if (sqrtMatch) {
      const deg = sqrtMatch[1];
      const rad = readBraced(s, i + sqrtMatch[0].length);
      if (rad) {
        flushBuf();
        nodes.push(
          <span key={`${keyBase}-sqrt-${i}`} dir="ltr" className="mx-0.5 inline-flex items-baseline align-middle">
            {deg && <sup className="-me-0.5 text-[0.65em] font-bold">{deg}</sup>}
            <span className="text-[1.1em] font-bold leading-none">√</span>
            <span className="border-t border-current px-1 pt-0.5 font-semibold">
              {renderMathExpr(rad.content, `${keyBase}-sq-${i}`, depth + 1)}
            </span>
          </span>,
        );
        i = rad.nextPos;
        continue;
      }
    }

    // 3. الأسس: ^{...} أو ^2
    if (s[i] === "^") {
      const braced = readBraced(s, i + 1);
      if (braced) {
        flushBuf();
        nodes.push(
          <sup key={`${keyBase}-sup-${i}`} className="ms-0.5 text-[0.75em] font-bold">
            {renderMathExpr(braced.content, `${keyBase}-sp-${i}`, depth + 1)}
          </sup>,
        );
        i = braced.nextPos;
        continue;
      }
      const simpleSup = /^\^([0-9a-zA-Z+\-]+|\([^)]+\))/.exec(s.slice(i));
      if (simpleSup) {
        flushBuf();
        nodes.push(
          <sup key={`${keyBase}-sup-${i}`} className="ms-0.5 text-[0.75em] font-bold">
            {simpleSup[1]}
          </sup>,
        );
        i += simpleSup[0].length;
        continue;
      }
    }

    // 4. الأدلة السفلية: _{...} أو _1
    if (s[i] === "_") {
      const braced = readBraced(s, i + 1);
      if (braced) {
        flushBuf();
        nodes.push(
          <sub key={`${keyBase}-sub-${i}`} className="ms-0.5 text-[0.75em]">
            {renderMathExpr(braced.content, `${keyBase}-sb-${i}`, depth + 1)}
          </sub>,
        );
        i = braced.nextPos;
        continue;
      }
      const simpleSub = /^_([0-9a-zA-Z]+)/.exec(s.slice(i));
      if (simpleSub) {
        flushBuf();
        nodes.push(
          <sub key={`${keyBase}-sub-${i}`} className="ms-0.5 text-[0.75em]">
            {simpleSub[1]}
          </sub>,
        );
        i += simpleSub[0].length;
        continue;
      }
    }

    buf += s[i];
    i++;
  }

  flushBuf();
  return nodes;
}

/** عرض آمن لنص غني (معادلات رياضية، كسور، جذور، غامق، كود) بدون dangerouslySetInnerHTML. */
function inline(text: string, keyBase: string): ReactNode[] {
  // تقسيم النص حسب المعادلات ($...$ أو \(...\)) أو أوامر الكسور/الجذور المباشرة أو الغامق أو الكود
  const tokenRe = /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\$[^$\n]+\$|\\\([\s\S]+?\\\)|\\(?:d|t)?frac\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}|\\sqrt(?:\[[^\]]+\])?\{[^{}]+\}|\*\*[^*]+\*\*|`[^`]+`)/g;
  const parts = text.split(tokenRe);

  return parts.map((p, i) => {
    if (!p) return null;
    const k = `${keyBase}-${i}`;

    // معادلة معروضة $$...$$ أو \[...\]
    if ((p.startsWith("$$") && p.endsWith("$$") && p.length > 4) || (p.startsWith("\\[") && p.endsWith("\\]") && p.length > 4)) {
      const inner = p.slice(2, -2);
      return (
        <span
          key={k}
          dir="ltr"
          className="my-1.5 block overflow-x-auto rounded-2xl bg-teal-50/80 px-4 py-2 text-center font-mono text-base font-bold text-teal-950 ring-1 ring-teal-200"
        >
          {renderMathExpr(inner, k)}
        </span>
      );
    }

    // معادلة مضمّنة $...$ أو \(...\)
    if ((p.startsWith("$") && p.endsWith("$") && p.length > 2) || (p.startsWith("\\(") && p.endsWith("\\)") && p.length > 4)) {
      const inner = p.startsWith("$") ? p.slice(1, -1) : p.slice(2, -2);
      return (
        <span
          key={k}
          dir="ltr"
          className="mx-0.5 inline-flex items-center rounded-lg bg-stone-100/90 px-1.5 py-0.5 font-mono text-[0.95em] font-semibold text-teal-950 ring-1 ring-stone-200/80"
        >
          {renderMathExpr(inner, k)}
        </span>
      );
    }

    // أوامر \frac أو \sqrt مكتوبة مباشرة في النص بدون علامة $
    if (/^\\(?:(?:d|t)?frac|sqrt)/.test(p)) {
      return (
        <span key={k} dir="ltr" className="mx-0.5 inline-flex items-center font-mono text-[0.95em] font-semibold text-teal-950">
          {renderMathExpr(p, k)}
        </span>
      );
    }

    if (p.startsWith("**") && p.endsWith("**") && p.length > 4) {
      return <strong key={k}>{inline(p.slice(2, -2), `${k}-b`)}</strong>;
    }
    if (p.startsWith("`") && p.endsWith("`") && p.length > 2) {
      const inner = p.slice(1, -1);
      if (/\\frac|\\sqrt|\^|_/.test(inner)) {
        return (
          <span key={k} dir="ltr" className="mx-0.5 inline-flex items-center rounded-lg bg-stone-100 px-1.5 py-0.5 font-mono text-[0.95em] font-semibold text-teal-950">
            {renderMathExpr(inner, k)}
          </span>
        );
      }
      return <code key={k}>{inner}</code>;
    }

    // إذا احتوى النص العادي على رموز LaTeX مثل \times أو \div أو أسس صريحة مثل x^2
    if (/\\(?:times|div|pm|leq|geq|neq|approx|pi|infty|Rightarrow)|\b[a-zA-Z0-9]+\^\d+/.test(p)) {
      return <span key={k}>{renderMathExpr(p, k)}</span>;
    }

    return <span key={k}>{p}</span>;
  });
}

export function RichText({ text }: { text: string }) {
  // توحيد معادلات الأسطر المتعددة $$ ... $$ في سطر واحد ليسهل عرضها كبطاقة معادلة
  const normalized = text.replace(/\$\$([\s\S]*?)\$\$/g, (_m, inner) => `$$${inner.replace(/\n+/g, " ").trim()}$$`);
  const lines = normalized.split("\n");
  const blocks: ReactNode[] = [];
  let list: { type: "ul" | "ol"; items: string[] } | null = null;
  let tableRows: string[][] | null = null;

  const flushList = () => {
    if (!list) return;
    const Tag = list.type;
    const k = blocks.length;
    blocks.push(
      <Tag key={`l${k}`}>
        {list.items.map((it, i) => (
          <li key={i}>{inline(it, `li${k}-${i}`)}</li>
        ))}
      </Tag>,
    );
    list = null;
  };

  const flushTable = () => {
    if (!tableRows || tableRows.length === 0) return;
    const k = blocks.length;
    const filtered = tableRows.filter((r) => !r.every((c) => /^[-:\s]+$/.test(c)));
    if (filtered.length > 0) {
      const [head, ...body] = filtered;
      blocks.push(
        <div key={`tbl${k}`} className="my-2 overflow-x-auto rounded-xl ring-1 ring-stone-200">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-stone-100 font-extrabold text-stone-800">
              <tr>
                {head.map((cell, ci) => (
                  <th key={ci} className="border-b border-stone-200 px-3 py-2 text-start">
                    {inline(cell, `th${k}-${ci}`)}
                  </th>
                ))}
              </tr>
            </thead>
            {body.length > 0 && (
              <tbody className="divide-y divide-stone-200 bg-white">
                {body.map((row, ri) => (
                  <tr key={ri}>
                    {row.map((cell, ci) => (
                      <td key={ci} className="px-3 py-2">
                        {inline(cell, `td${k}-${ri}-${ci}`)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            )}
          </table>
        </div>,
      );
    }
    tableRows = null;
  };

  lines.forEach((raw, idx) => {
    const line = raw.trimEnd();
    const trimmed = line.trim();

    // لا نعتبر |x| قيمة مطلقة جدولاً؛ يجب وجود صف فاصل Markdown حقيقي.
    const pipeDelimited = trimmed.startsWith("|") && trimmed.endsWith("|") && trimmed.length > 2;
    const separatorNext = idx + 1 < lines.length && /^\|?\s*:?-{3,}.*\|.*-{3,}.*\|?$/.test(lines[idx + 1].trim());
    const isTableRow = pipeDelimited && (tableRows !== null || separatorNext || /^\|?\s*:?-{3,}\s*\|?$/.test(trimmed));
    if (isTableRow) {
      flushList();
      if (!tableRows) tableRows = [];
      const cells = trimmed
        .slice(1, -1)
        .split("|")
        .map((c) => c.trim());
      tableRows.push(cells);
      return;
    } else {
      flushTable();
    }

    const ol = /^\s*(\d+)[.)-]\s+(.*)$/.exec(line);
    const ul = /^\s*[-*•]\s+(.*)$/.exec(line);
    if (ol) {
      if (!list || list.type !== "ol") {
        flushList();
        list = { type: "ol", items: [] };
      }
      list.items.push(ol[2]);
    } else if (ul) {
      if (!list || list.type !== "ul") {
        flushList();
        list = { type: "ul", items: [] };
      }
      list.items.push(ul[1]);
    } else {
      flushList();
      if (trimmed) {
        const h = /^#{1,4}\s+(.*)$/.exec(trimmed);
        blocks.push(
          h ? (
            <p key={`p${idx}`} className="mt-2 font-extrabold text-teal-950">
              {inline(h[1], `h${idx}`)}
            </p>
          ) : (
            <p key={`p${idx}`}>{inline(line, `p${idx}`)}</p>
          ),
        );
      }
    }
  });
  flushList();
  flushTable();
  return <div className="rich break-words leading-relaxed">{blocks}</div>;
}
