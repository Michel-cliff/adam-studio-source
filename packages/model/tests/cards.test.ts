import { describe, expect, it } from "vitest";
import { cardChecks, cardDurationMs, cardElements, cardLayout, scriptCards, type CardProps } from "../src/cards";
import { resolve } from "../src/resolve";
import { makeProject, makeStyle, styleInput } from "./helpers";
import { parseStyle } from "../src/parse";

describe("cardDurationMs", () => {
  it("reads 0.35 s a word plus 0.6 s, within 1.6 and 3.0 s", () => {
    expect(cardDurationMs(1)).toBe(1600);
    expect(cardDurationMs(4)).toBe(2000);
    expect(cardDurationMs(20)).toBe(3000);
  });
});

describe("scriptCards", () => {
  it("gives each line the archetype its shape asks for", () => {
    const cards = scriptCards([
      "Most people quit too early",
      "73 % of creators stop before their tenth video",
      "Talent vs habit",
      "What keeps them going:",
      "- a fixed day",
      "- a short format",
      "- one metric",
      "« Done is better than perfect » - Sheryl Sandberg",
      "Consistency.",
    ].join("\n"));
    expect(cards.map((c) => c.archetype)).toEqual(["statement", "number", "opposition", "list", "quote", "breath"]);
    expect(cards[1]).toMatchObject({ text: "73 %", label: "of creators stop before their tenth video" });
    expect(cards[2]).toMatchObject({ text: "Talent", against: "habit" });
    expect(cards[3]).toMatchObject({ text: "What keeps them going", items: ["a fixed day", "a short format", "one metric"] });
    expect(cards[4]).toMatchObject({ text: "Done is better than perfect", label: "Sheryl Sandberg" });
    expect(cards[5]).toMatchObject({ text: "Consistency" });
  });
  it("never rewrites the words, and keeps lists to four items", () => {
    const cards = scriptCards("Steps:\n- one\n- two\n- three\n- four\n- five");
    expect(cards.map((c) => c.items)).toEqual([["one", "two", "three", "four"], ["five"]]);
  });
  it("skips empty lines", () => {
    expect(scriptCards("\n\nHello there\n\n")).toHaveLength(1);
  });
});

describe("cardLayout", () => {
  it("uses the house sizes", () => {
    expect(cardLayout({ archetype: "statement", text: "Short" }).main).toBe(92);
    expect(cardLayout({ archetype: "number", text: "73 %", label: "of creators" })).toMatchObject({ main: 240, secondary: 36 });
    expect(cardLayout({ archetype: "breath", text: "Consistency" }).main).toBe(140);
  });
  it("shrinks a long statement to stay within four lines", () => {
    const long = "This sentence is long enough that at ninety two pixels it would run past four lines of seven hundred and twenty pixels";
    const l = cardLayout({ archetype: "statement", text: long });
    expect(l.main).toBeLessThan(92);
    expect(l.lines).toBeLessThanOrEqual(4);
  });
});

describe("cardChecks", () => {
  const s = (text: string): CardProps => ({ archetype: "statement", text });
  it("refuses a card whose two levels are less than 2.5:1 apart", () => {
    const r = cardChecks([{ archetype: "number", text: "1 234 567 890 123 456", label: "a label that is quite long" }]);
    expect(r.blocking.join()).toMatch(/card 1.*2\.5:1/);
  });
  it("warns on two cards of the same kind in a row", () => {
    expect(cardChecks([s("one"), s("two")]).warnings.join()).toMatch(/cards 1 and 2/);
  });
  it("warns when five cards in a row have neither a breath nor an opposition", () => {
    const five: CardProps[] = [s("a"), { archetype: "number", text: "3", label: "x" }, s("b"), { archetype: "quote", text: "c" }, s("d")];
    expect(cardChecks(five).warnings.join()).toMatch(/cards 1 to 5/);
    expect(cardChecks([...five.slice(0, 4), { archetype: "breath", text: "d" }]).warnings.join()).not.toMatch(/cards 1 to 5/);
  });
});

describe("cardElements", () => {
  it("places the cards one after the other and gives the total", () => {
    const { elements, totalMs } = cardElements([{ archetype: "breath", text: "One" }, { archetype: "statement", text: "two three four five" }]);
    expect(elements.map((e) => [e.kind, (e.anchor as { atMs: number }).atMs, e.durationMs])).toEqual([["card", 0, 1600], ["card", 1600, 2000]]);
    expect(totalMs).toBe(3600);
  });
});

describe("project format", () => {
  it("defaults to face camera", () => {
    expect(makeProject().format).toBe("facecam");
  });
  it("only pushes face camera shots", () => {
    const push = (format: string) => resolve(makeProject({ format } as never), makeStyle()).clips[0]!.zoom.driftPerSec;
    expect(push("facecam")).toBeGreaterThan(0);
    expect(push("tutorial")).toBe(0);
    expect(push("text")).toBe(0);
  });
});

describe("an important passage", () => {
  it("takes the place of the subtitles while it is on screen", () => {
    const base = makeProject({ captions: [{ words: ["a.w0", "a.w1"], text: "zero un" }, { words: ["a.w3", "a.w4"], text: "trois quatre" }] });
    const all = resolve(base, makeStyle()).captions.length;
    const p = makeProject({
      captions: [{ words: ["a.w0", "a.w1"], text: "zero un" }, { words: ["a.w3", "a.w4"], text: "trois quatre" }],
      elements: [{ id: "s1", kind: "text.stack", anchor: { word: "a.w3" }, untilWord: "a.w4", props: { text: "trois quatre" } }],
    });
    expect(resolve(p, makeStyle()).captions.length).toBe(all - 1);
  });
});

describe("the important word of a subtitle", () => {
  it("is coloured by default, or set on a block of the highlight colour", () => {
    expect(makeStyle().caption.highlightAs).toBe("color");
    expect(parseStyle({ ...styleInput, caption: { ...styleInput.caption, highlightAs: "block" } }).ok).toBe(true);
  });
});
