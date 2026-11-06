import type { ReactNode } from "react";

/** عرض آمن لنص بسيط (غامق، قوائم، كود) بدون dangerouslySetInnerHTML. */
function inline(text: string, keyBase: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**") && p.length > 4) return <strong key={`${keyBase}-${i}`}>{p.slice(2, -2)}</strong>;
    if (p.startsWith("`") && p.endsWith("`") && p.length > 2) return <code key={`${keyBase}-${i}`}>{p.slice(1, -1)}</code>;
    return <span key={`${keyBase}-${i}`}>{p}</span>;
  });
}

export function RichText({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  let list: { type: "ul" | "ol"; items: string[] } | null = null;
  const flush = () => {
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
  lines.forEach((raw, idx) => {
    const line = raw.trimEnd();
    const ol = /^\s*(\d+)[.)-]\s+(.*)$/.exec(line);
    const ul = /^\s*[-*•]\s+(.*)$/.exec(line);
    if (ol) {
      if (!list || list.type !== "ol") {
        flush();
        list = { type: "ol", items: [] };
      }
      list.items.push(ol[2]);
    } else if (ul) {
      if (!list || list.type !== "ul") {
        flush();
        list = { type: "ul", items: [] };
      }
      list.items.push(ul[1]);
    } else {
      flush();
      if (line.trim()) {
        const h = /^#{1,4}\s+(.*)$/.exec(line);
        blocks.push(
          h ? (
            <p key={`p${idx}`} className="mt-2 font-extrabold">
              {inline(h[1], `h${idx}`)}
            </p>
          ) : (
            <p key={`p${idx}`}>{inline(line, `p${idx}`)}</p>
          ),
        );
      }
    }
  });
  flush();
  return <div className="rich break-words">{blocks}</div>;
}
