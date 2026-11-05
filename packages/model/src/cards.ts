// Text-only mode (default art direction): a script with no footage, laid out as cards of six archetypes. The words are
// the creator's: a line's shape picks its archetype, nothing is rewritten. Sizes are for a 1080 wide frame.
import type { CardProps } from "./schema/kinds";
import type { ElementInput } from "./schema/project";

export type { CardProps };

/** Reading time: 0.35 s a word plus 0.6 s, between 1.6 and 3.0 s. */
export function cardDurationMs(words: number): number {
  return Math.round(Math.min(3000, Math.max(1600, 350 * words + 600)));
}

const wordCount = (c: CardProps) => [c.text ?? "", c.label ?? "", c.against ?? "", ...(c.items ?? [])].join(" ").split(/\s+/).filter(Boolean).length;
const dropPeriod = (t: string) => t.trim().replace(/(?<!\.)\.$/, "").trim();

const NUMBER = /^([+\-]?\d[\d\s.,]*?\s?(?:%|x|×|k|K|M|€|\$)?)(?:\s+(.+))?$/;
const OPPOSITION = /^(.+?)\s+(?:vs\.?|VS|versus|contre|\|)\s+(.+)$/;
const QUOTE = /^[«"“]\s*(.+?)\s*[»"”]\s*(?:[-–—]\s*(.+))?$/;
const ITEM = /^[-•*]\s+(.+)$/;

/** The cards of a script: one line, one card (a list takes its title line and up to four item lines). */
export function scriptCards(script: string): CardProps[] {
  const lines = script.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const cards: CardProps[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const titled = /:$/.test(line) && ITEM.test(lines[i + 1] ?? "");
    if (titled || ITEM.test(line)) {
      const title = titled ? line.replace(/:$/, "").trim() : "";
      const items: string[] = [];
      let j = titled ? i + 1 : i;
      for (; j < lines.length && ITEM.test(lines[j]!); j++) items.push(dropPeriod(lines[j]!.match(ITEM)![1]!));
      for (let k = 0; k < items.length; k += 4) cards.push({ archetype: "list", text: title, items: items.slice(k, k + 4) });
      i = j - 1;
      continue;
    }
    let m: RegExpMatchArray | null;
    if ((m = line.match(QUOTE))) cards.push({ archetype: "quote", text: m[1]!, ...(m[2] ? { label: dropPeriod(m[2]) } : {}) });
    else if ((m = line.match(NUMBER))) cards.push({ archetype: "number", text: m[1]!.trim(), ...(m[2] ? { label: dropPeriod(m[2]) } : {}) });
    else if ((m = line.match(OPPOSITION))) cards.push({ archetype: "opposition", text: dropPeriod(m[1]!), against: dropPeriod(m[2]!) });
    else if (!/\s/.test(dropPeriod(line))) cards.push({ archetype: "breath", text: dropPeriod(line).replace(/[!?]+$/, "") });
    else cards.push({ archetype: "statement", text: dropPeriod(line) });
  }
  return cards;
}

// Main and second level of each archetype (px), and how many lines the main level may take before it shrinks.
const SIZES: Record<CardProps["archetype"], { main: number; secondary?: number; maxLines: number }> = {
  statement: { main: 92, secondary: 36, maxLines: 4 },
  number: { main: 240, secondary: 36, maxLines: 1 },
  opposition: { main: 92, maxLines: 2 },
  list: { main: 92, secondary: 36, maxLines: 2 },
  quote: { main: 72, secondary: 28, maxLines: 5 },
  breath: { main: 140, maxLines: 1 },
};
export const LINE_PX = 720;
const CHAR_EM = 0.56; // average glyph width of the house sans, as a share of the size

/** How many lines a text takes at a size, wrapped on words within the 720 px line. */
export function linesAt(text: string, size: number): number {
  let lines = 1, width = 0;
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const w = word.length * CHAR_EM * size, space = CHAR_EM * size;
    if (width > 0 && width + space + w > LINE_PX) { lines++; width = w; } else width += (width > 0 ? space : 0) + w;
  }
  return lines;
}

/** The sizes a card is drawn at: the main level shrinks (4 px at a time, not under 40) until it fits its lines. */
export function cardLayout(c: CardProps): { main: number; secondary?: number; lines: number } {
  const s = SIZES[c.archetype];
  const longest = [c.text ?? "", ...(c.archetype === "opposition" ? [c.against ?? ""] : [])].reduce((a, b) => (b.length > a.length ? b : a), "");
  let main = s.main;
  while (main > 40 && linesAt(longest, main) > s.maxLines) main -= 4;
  const hasSecondary = s.secondary !== undefined && (c.archetype === "list" ? !!c.text && !!c.items?.length : !!c.label);
  return { main, ...(hasSecondary ? { secondary: s.secondary } : {}), lines: linesAt(longest, main) };
}

const NAMES: Record<CardProps["archetype"], string> = { statement: "statements", number: "numbers", opposition: "oppositions", list: "lists", quote: "quotes", breath: "breaths" };

/**
 * The three anti-slideshow rules: a card's two levels at least 2.5:1 apart (blocking), never two cards of the same
 * archetype in a row, and at least one breath or opposition in any five cards running.
 */
export function cardChecks(cards: CardProps[]): { blocking: string[]; warnings: string[] } {
  const blocking: string[] = [], warnings: string[] = [];
  cards.forEach((c, i) => {
    const l = cardLayout(c);
    if (l.secondary && l.main / l.secondary < 2.5) blocking.push(`card ${i + 1} is too long for its form: its text and its label are less than 2.5:1 apart (shorten the text or split the card)`);
    if (i > 0 && cards[i - 1]!.archetype === c.archetype) warnings.push(`cards ${i} and ${i + 1} are both ${NAMES[c.archetype]}: give the second one another form`);
  });
  for (let i = 0; i + 5 <= cards.length; i++) {
    if (cards.slice(i, i + 5).some((c) => c.archetype === "breath" || c.archetype === "opposition")) continue;
    warnings.push(`cards ${i + 1} to ${i + 5} have neither a breath nor an opposition: the video reads like a slideshow`);
    i += 4;
  }
  return { blocking, warnings };
}

/** The cards as elements, one after the other from 0, with the video's length. */
export function cardElements(cards: CardProps[]): { elements: ElementInput[]; totalMs: number } {
  let at = 0;
  const elements = cards.map((c, i) => {
    const durationMs = cardDurationMs(wordCount(c));
    const e: ElementInput = { id: `card${i + 1}`, kind: "card", anchor: { atMs: at }, durationMs, props: { ...c } };
    at += durationMs;
    return e;
  });
  return { elements, totalMs: at };
}
