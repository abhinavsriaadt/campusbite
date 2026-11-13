import { useEffect, useRef, useState } from "react";
import { errorMessage } from "../../api/client";
import { aiApi } from "../../api/endpoints";
import Markdown from "../../components/Markdown";
import { Alert, Button, Chip, Icon, PageLoader } from "../../components/ui";
import { useAsync } from "../../hooks/useAsync";
import { plural, timeAgo } from "../../utils/format";

// The four suggestions from DESIGN.md §4, sent as full questions (they match the brief's example queries).
const SUGGESTIONS = [
  { label: "Summarize my last 5 orders", q: "Summarize my last five orders." },
  { label: "What's not delivered yet?", q: "Which of my orders are still not delivered?" },
  { label: "How much did I spend this week?", q: "How much did I spend this week?" },
  { label: "What do I order most?", q: "Which food items have I ordered most frequently?" },
];

export default function AiInsights() {
  const status = useAsync(() => aiApi.status(), []);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages, busy]);

  async function ask(question) {
    const q = question.trim();
    if (q.length < 3 || busy) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text: q }]);
    setBusy(true);
    try {
      const res = await aiApi.ask(q);
      setMessages((m) => [...m, { role: "ai", text: res.answer, count: res.orders_considered, at: res.generated_at }]);
    } catch (err) {
      setMessages((m) => [...m, { role: "error", text: errorMessage(err, "The assistant couldn't answer right now.") }]);
    } finally {
      setBusy(false);
    }
  }

  if (status.loading) return <PageLoader />;
  const enabled = !!status.data?.enabled;

  return (
    <div className="narrow ai">
      <div className="page-head">
        <div><h1 className="row-nowrap"><Icon name="sparkles" /> AI order insights</h1><p>Ask about your own order history: spending, favourites, what's on the way.</p></div>
      </div>
      {status.error && <Alert>{status.error}</Alert>}
      {status.data && !enabled && (
        <Alert type="warning">AI insights aren't set up on this server yet. An administrator needs to set <code>OPENAI_API_KEY</code> in the backend environment.</Alert>
      )}

      <div className="chips ai__chips" role="group" aria-label="Suggested questions">
        {SUGGESTIONS.map((s) => <Chip key={s.label} disabled={!enabled || busy} onClick={() => ask(s.q)}>{s.label}</Chip>)}
      </div>

      <div className="ai__log" aria-live="polite">
        {messages.length === 0 && (
          <div className="card card--pad ai__intro">
            <Icon name="sparkles" />
            <p>I only look at <b>your</b> orders, never anyone else's. Pick a question above or type your own.</p>
          </div>
        )}
        {messages.map((m, i) => m.role === "user" ? (
          <p key={i} className="ai__q">{m.text}</p>
        ) : m.role === "error" ? (
          <Alert key={i}>{m.text}</Alert>
        ) : (
          <article key={i} className="card card--pad ai__a">
            <Markdown text={m.text} />
            <p className="text-xs muted ai__caption">Based on your last {plural(m.count, "order")} · {timeAgo(m.at)}</p>
          </article>
        ))}
        {busy && <div className="card card--pad ai__a" aria-label="The assistant is typing"><span className="typing"><span /><span /><span /></span></div>}
        <div ref={endRef} />
      </div>

      <form className="ai__input" onSubmit={(e) => { e.preventDefault(); ask(input); }}>
        <input className="input" placeholder={enabled ? "Ask about your orders…" : "AI isn't configured"} value={input} maxLength={500}
          disabled={!enabled || busy} onChange={(e) => setInput(e.target.value)} aria-label="Your question" />
        <Button type="submit" variant="primary" icon="send" disabled={!enabled || input.trim().length < 3} loading={busy}>Ask</Button>
      </form>
      {status.data && <p className="text-xs muted">Limit: {status.data.rate_limit_per_minute} questions a minute.</p>}
    </div>
  );
}
