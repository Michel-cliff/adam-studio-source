import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { aiEnv, keyStatus, setKey } from "../../server/keys";

describe("the creator's API keys", () => {
  it("are kept in the .env next to the settings, shown by their last four characters, and handed to the AI", () => {
    const dir = mkdtempSync(join(tmpdir(), "adam keys-"));
    writeFileSync(join(dir, ".env"), "PIXABAY_KEY=abc\n");
    setKey(dir, "anthropic", "sk-ant-api03-abcdefghijklmnopqrstuvwxyz1234");
    setKey(dir, "openai", "sk-proj-abcdefghijklmnopqrstuvwxyz9876");
    expect(keyStatus(dir)).toEqual({ anthropic: "…1234", openai: "…9876" });
    expect(readFileSync(join(dir, ".env"), "utf8")).toMatch(/^PIXABAY_KEY=abc$/m);
    expect(aiEnv(dir)).toEqual({ ANTHROPIC_API_KEY: "sk-ant-api03-abcdefghijklmnopqrstuvwxyz1234", OPENAI_API_KEY: "sk-proj-abcdefghijklmnopqrstuvwxyz9876", CODEX_API_KEY: "sk-proj-abcdefghijklmnopqrstuvwxyz9876" });
    setKey(dir, "openai", "");
    expect(keyStatus(dir).openai).toBeNull();
    expect(aiEnv(dir).OPENAI_API_KEY).toBeUndefined();
    expect(() => setKey(dir, "anthropic", "hello")).toThrow(/sk-ant-/);
  });
});
