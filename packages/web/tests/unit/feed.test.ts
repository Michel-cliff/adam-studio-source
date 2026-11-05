import { describe, expect, it } from "vitest";
import { aiOf, readEvent } from "../../app/feed";

describe("the feed of an ask", () => {
  it("reads what Claude Code does and says", () => {
    expect(readEvent({ type: "assistant", message: { content: [{ type: "tool_use", name: "mcp__adam-studio__propose" }] } })).toEqual({ tools: ["propose"] });
    expect(readEvent({ type: "result", result: "**Done.**\n\nJ'ai ajouté `ask.hook.x` trois titres." })).toEqual({ say: "J'ai ajouté  trois titres." });
  });
  it("reads what Codex does and says", () => {
    expect(readEvent({ type: "item.started", item: { type: "mcp_tool_call", server: "adam-studio", tool: "get_transcript" } })).toEqual({ tools: ["get_transcript"] });
    expect(readEvent({ type: "item.completed", item: { type: "agent_message", text: "Trois accroches proposées." } })).toEqual({ say: "Trois accroches proposées." });
    expect(readEvent({ type: "turn.failed", error: { message: "Quota exceeded" } })).toEqual({ say: "Quota exceeded" });
    expect(readEvent({ type: "thread.started" })).toEqual({});
    expect(readEvent({ type: "turn.failed", error: { message: "unexpected status 401 Unauthorized: Missing bearer" } }).say).toMatch(/not signed in.*codex login/);
  });
  it("knows which AI ran a job, and its step", () => {
    expect(aiOf("Codex: hook (do)")).toEqual({ ai: "Codex", step: "hook" });
    expect(aiOf("Claude: visuals")).toEqual({ ai: "Claude", step: "visuals" });
    expect(aiOf("Render")).toBeNull();
  });
});
