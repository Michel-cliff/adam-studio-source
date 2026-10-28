import { describe, expect, it } from "vitest";
import { askBrief } from "../../server/claude";

describe("the language of what Adam writes", () => {
  it("is the creator's interface language when they asked: labels, titles and captions", () => {
    const fr = askBrief("p", "captions", "Propose captions", null, { lang: "fr" }).system;
    expect(fr).toMatch(/creator's language is French/);
    expect(fr).toMatch(/captions \(translate the spoken words/);
    expect(fr).not.toMatch(/in the transcript's language/);
    expect(askBrief("p", "hook", "Propose hooks", null, { lang: "en" }).system).toMatch(/creator's language is English/);
  });
  it("lets a language named in the request win", () => {
    expect(askBrief("p", "hook", "x", null, { lang: "fr" }).system).toMatch(/language named in the creator's request overrides/);
  });
});
