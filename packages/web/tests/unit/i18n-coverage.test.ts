import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "@babel/parser";
import { expect, it } from "vitest";
import { FR } from "../../app/i18n-fr";
import { toFrench } from "../../app/translate";
import { WEB } from "../../server/paths";

it("every static UI label, conditional label, tooltip and placeholder has a French entry", () => {
  const neutral = new Set(["Inspiration", "k tok", "#5AC576", "Aa", "references/", "PNG · JPG · PDF · CSV", "tiktok.com/@…, youtube.com/…", "MP4", "CAPCUT", "AUTO ·", "ADAM STUDIO", "ADAM", "SCRIPT", "MS", "PDF", "CSV", "FR", "EN", "Codex", "Claude", "YouTube", "TikTok", "Instagram", "LinkedIn", "Ko-fi", "ChatGPT", "PNG", "FPS", "UI", "TTF", "OTF"]);
  const missing: string[] = [];
  const values = new Set(Object.values(FR));
  for (const file of readdirSync(join(WEB, "app")).filter(f => f.endsWith(".tsx"))) {
    const ast = parse(readFileSync(join(WEB, "app", file), "utf8"), { sourceType: "module", plugins: ["typescript", "jsx"] });
    const add = (text: string, node: any) => {
      if (Object.hasOwn(FR, text.trim())) return;
      const s = text.replace(/\s+/g, " ").trim();
      if (/[a-zA-Z]{2}/.test(s) && !Object.hasOwn(FR, s) && !values.has(s) && !neutral.has(s) && toFrench(s) === null) missing.push(`${file}:${node.loc.start.line} ${s}`);
    };
    const labels = (node: any) => {
      if (!node) return;
      if (node.type === "StringLiteral") add(node.value, node);
      if (node.type === "ConditionalExpression") { labels(node.consequent); labels(node.alternate); }
      if (node.type === "LogicalExpression") labels(node.right);
    };
    const walk = (node: any, parent?: any) => {
      if (!node || typeof node !== "object") return;
      if (node.type === "JSXText") add(node.value, node);
      if (node.type === "JSXExpressionContainer" && parent?.type !== "JSXAttribute") labels(node.expression);
      if (node.type === "JSXAttribute" && ["placeholder", "title", "aria-label", "alt"].includes(node.name.name)) { if (node.value?.type === "StringLiteral") add(node.value.value, node); else if (node.value?.type === "JSXExpressionContainer") labels(node.value.expression); }
      if (node.type === "CallExpression" && ["t", "tr", "uiText"].includes(node.callee.name) && node.arguments[0]?.type === "StringLiteral") add(node.arguments[0].value, node);
      for (const [key, value] of Object.entries(node)) { if (key === "loc") continue; if (Array.isArray(value)) value.forEach(v => walk(v, node)); else if (value && typeof value === "object") walk(value, node); }
    };
    walk(ast);
  }
  expect(missing).toEqual([]);
});

it("translates native confirmations while preserving project and file names", () => {
  expect(toFrench("Replace your script with one written from the transcript?")).toMatch(/^Remplacer ton script/);
  expect(toFrench("Delete “Mon projet” from your Inspiration folder?\n\nIt moves to the folder's .trash.")).toBe("Supprimer « Mon projet » du dossier Inspiration ?\n\nLe fichier sera déplacé dans sa corbeille (.trash).");
  expect(toFrench("Remove “photo.png” from Ep2?\n\nIts file moves to the project's .trash.")).toBe("Retirer « photo.png » de Ep2 ?\n\nLe fichier sera déplacé dans la corbeille du projet (.trash).");
  expect(toFrench("Delete “Ep2”?\n\nIt moves to the .trash folder inside your projects folder: you can still get it back from there.")).toMatch(/^Supprimer « Ep2 »/);
  expect(toFrench("Remove “My reference” from your references?")).toBe("Retirer « My reference » de tes références ?");
  expect(toFrench("My own script: Keep building.")).toBeNull();
});

it("translates proposal badges with any count", () => {
  expect(toFrench("3 NEW")).toBe("3 NOUV.");
  expect(toFrench("12 NEW")).toBe("12 NOUV.");
});
