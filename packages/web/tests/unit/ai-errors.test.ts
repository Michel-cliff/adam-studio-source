import { describe, expect, it } from "vitest";
import { aiRunner } from "../../server/ai";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("when the AI fails", () => {
  it("says why (Codex's usage limit), not its last line on stderr", async () => {
    const fake = join(mkdtempSync(join(tmpdir(), "adam-ai-")), "codex.cjs");
    writeFileSync(fake, `console.log(JSON.stringify({type:"thread.started"}));
console.log(JSON.stringify({type:"error",message:"You've hit your usage limit. Try again at 8:34 PM."}));
console.log(JSON.stringify({type:"turn.failed",error:{message:"You've hit your usage limit. Try again at 8:34 PM."}}));
console.error("Reading additional input from stdin...");process.exit(1);`);
    const before = process.env.ADAM_CODEX;
    process.env.ADAM_CODEX = process.execPath;
    try {
      const ask = aiRunner(() => "codex", () => "default", 20000, () => ({ NODE_OPTIONS: `--require ${fake}` }));
      await expect(ask({ prompt: "x" })).rejects.toThrow(/usage limit/);
    } finally { if (before === undefined) delete process.env.ADAM_CODEX; else process.env.ADAM_CODEX = before; }
  }, 30000);
});
