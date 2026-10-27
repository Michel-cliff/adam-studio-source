import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { REPO } from "../../server/paths";
import { editingRulesMarkdown } from "../../server/skill";
import { GENERAL_RULES, STEP_RULES } from "../../server/rules";

describe("the adam-studio skill", () => {
  it("carries every rule the studio sends to Claude", () => {
    const md = editingRulesMarkdown();
    expect(md).toContain(GENERAL_RULES.split("\n")[1]!);
    for (const r of Object.values(STEP_RULES)) expect(md).toContain(r.split("\n").at(-1)!);
  });

  it("is in step with rules.ts (run npm run skill after changing the rules)", () => {
    const committed = readFileSync(join(REPO, "skills", "adam-studio", "references", "editing-rules.md"), "utf8").replace(/\r\n/g, "\n");
    expect(committed).toBe(editingRulesMarkdown());
  });
});
