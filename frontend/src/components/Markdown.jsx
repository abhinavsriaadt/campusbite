/**
 * Minimal, XSS-safe Markdown renderer for AI answers: paragraphs, bullet/numbered
 * lists, **bold** and *italic*. Builds React elements — never injects HTML.
 */
function inline(text, keyBase) {
  const parts = [];
  const re = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`)/g;
  let last = 0;
  let m;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const tok = m[0];
    const k = `${keyBase}-${i++}`;
    if (tok.startsWith("**")) parts.push(<strong key={k}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith("`")) parts.push(<code key={k}>{tok.slice(1, -1)}</code>);
    else parts.push(<em key={k}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export default function Markdown({ text }) {
  const lines = (text || "").replace(/\r/g, "").split("\n");
  const blocks = [];
  let list = null;

  const flush = () => {
    if (list) blocks.push(list);
    list = null;
  };

  lines.forEach((raw) => {
    const line = raw.trim();
    const bullet = line.match(/^[-*•]\s+(.*)$/);
    const numbered = line.match(/^\d+[.)]\s+(.*)$/);
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    if (bullet || numbered) {
      const type = bullet ? "ul" : "ol";
      if (!list || list.type !== type) {
        flush();
        list = { type, items: [] };
      }
      list.items.push((bullet || numbered)[1]);
    } else if (!line) {
      flush();
    } else {
      flush();
      blocks.push({ type: heading ? "h" : "p", text: heading ? heading[1] : line });
    }
  });
  flush();

  return (
    <div className="md">
      {blocks.map((b, i) => {
        if (b.type === "ul" || b.type === "ol") {
          const Tag = b.type;
          return <Tag key={i}>{b.items.map((it, j) => <li key={j}>{inline(it, `${i}-${j}`)}</li>)}</Tag>;
        }
        if (b.type === "h") return <p key={i}><strong>{inline(b.text, i)}</strong></p>;
        return <p key={i}>{inline(b.text, i)}</p>;
      })}
    </div>
  );
}
