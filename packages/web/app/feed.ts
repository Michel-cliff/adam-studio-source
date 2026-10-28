// An ask's output, line by line: Claude Code's stream-json or Codex's JSON events, read the same way.

/** Plain words only: no markdown, no internal ids; the last paragraph is the message to the creator. */
function plain(text: string): string {
  const p = text.replace(/\*\*|`/g, "").replace(/\bask\.[\w.]+/g, "").trim();
  const last = p.split(/\n\s*\n/).pop() ?? p;
  return last.length > 320 ? `${last.slice(0, 317)}...` : last;
}

/** The adam-studio tools an event calls, or what the AI says. */
export function readEvent(e: any): { tools?: string[]; say?: string } {
  if (e?.type === "assistant") {
    const tools = (e.message?.content ?? []).filter((c: any) => c.type === "tool_use").map((c: any) => String(c.name).replace(/^mcp__adam-studio__/, ""));
    return tools.length ? { tools } : {};
  }
  if (e?.type === "result") return { say: plain(String(e.result ?? "")) };
  if ((e?.type === "item.started" || e?.type === "item.completed") && e.item) {
    if (e.item.type === "mcp_tool_call" && e.type === "item.started") return { tools: [String(e.item.tool)] };
    if (e.item.type === "agent_message" && e.type === "item.completed") return { say: plain(String(e.item.text ?? "")) };
  }
  if (e?.type === "turn.failed") {
    const m = String(e.error?.message ?? "Failed");
    return { say: /401|Unauthorized/.test(m) ? "Codex is not signed in on this computer: open a terminal and run codex login." : m };
  }
  return {};
}

/** The AI and the step of an ask job, from its label ("Codex: hook (do)"); null for other jobs. */
export function aiOf(label: string): { ai: string; step: string } | null {
  const m = label.match(/^(Claude|Codex): (\w+)/);
  return m ? { ai: m[1]!, step: m[2]! } : null;
}
