import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { initialLang } from "../../app/lang-default";
import { uiLang } from "../../server/settings";

describe("French is the language at start", () => {
  it("in the interface, unless the creator chose English", () => {
    expect(initialLang(null)).toBe("fr");
    expect(initialLang("fr")).toBe("fr");
    expect(initialLang("en")).toBe("en");
    expect(initialLang("de")).toBe("fr");
  });
  it("on the server, for what Adam writes", () => {
    const dir = mkdtempSync(join(tmpdir(), "adam-lang-"));
    expect(uiLang(join(dir, "none.json"))).toBe("fr");
    const chosen = join(dir, "ui.json");
    writeFileSync(chosen, JSON.stringify({ lang: "en" }));
    expect(uiLang(chosen)).toBe("en");
  });
});
