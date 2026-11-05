// The setup kit: checks this computer, installs every required piece that is missing (tools, analysis
// environment and models, an AI, the skill), then offers the optional ones (fonts, CapCut).
// Runs after npm install and on the first launch; `npm run setup` runs it again at any time.
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createInterface } from "node:readline/promises";
import { diagnose, realCtx, refreshPath, runFix, type Check } from "./doctor";
import { SETTINGS_FILE } from "./settings";

const MARKER = `${dirname(SETTINGS_FILE)}/setup.json`;
const line = (c: Check) => `  ${c.ok ? "ok  " : c.need === "required" ? "MISS" : "--  "}  ${c.label.padEnd(30)} ${c.detail}`;

async function ask(q: string): Promise<boolean> {
  if (!process.stdin.isTTY) return false;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const a = await rl.question(`${q} [y/N] `);
  rl.close();
  return /^y/i.test(a.trim());
}

async function main(): Promise<number> {
  const ctx = realCtx(dirname(SETTINGS_FILE));
  // The studio asks for the checks only, as JSON.
  if (process.argv.includes("--json")) { process.stdout.write(JSON.stringify(diagnose(ctx))); return 0; }
  if (process.env.CI || process.env.ADAM_SKIP_SETUP) return 0;
  console.log("\nAdam Studio setup: checking this computer…\n");
  let checks = diagnose(ctx);
  checks.forEach((c) => console.log(line(c)));

  for (const c of checks.filter((x) => x.need === "required" && !x.ok)) {
    if (!c.fixable) { console.log(`\n${c.label}: install it by hand (${c.hint ?? "see the README"}).`); continue; }
    console.log(`\nInstalling ${c.label}…`);
    try { await runFix(ctx, c.id, (s) => console.log(`    ${s}`)); } catch (e) { console.log(`    failed: ${(e as Error).message}`); }
  }
  for (const id of ["fonts", "capcut"]) {
    const c = checks.find((x) => x.id === id)!;
    if (c.ok || !c.fixable) continue;
    if (await ask(`\nOptional: install ${c.label} (${c.detail})?`)) {
      try { await runFix(ctx, id, (s) => console.log(`    ${s}`)); } catch (e) { console.log(`    failed: ${(e as Error).message}`); }
    }
  }

  refreshPath(ctx);
  checks = diagnose(ctx);
  const missing = checks.filter((c) => c.need === "required" && !c.ok);
  console.log("\nResult:\n");
  checks.forEach((c) => console.log(line(c)));
  if (checks.some((c) => c.id === "ai" && c.ok)) console.log("\nSign in to Adam's engine once if not done yet: run `claude` (or `codex`) in a terminal.");
  const optional = checks.filter((c) => c.need === "optional" && !c.ok);
  if (optional.length) console.log(`Optional, from the studio's Projects page: ${optional.map((c) => c.label).join(", ")}.`);
  mkdirSync(dirname(MARKER), { recursive: true });
  writeFileSync(MARKER, `${JSON.stringify({ at: new Date().toISOString(), missing: missing.map((c) => c.id) }, null, 2)}\n`);
  console.log(missing.length ? `\nStill missing: ${missing.map((c) => c.label).join(", ")}. Run \`npm run setup\` again once fixed.` : "\nAdam Studio is ready: npm run ui");
  return 0;
}

main().then((code) => process.exit(code), (e) => { console.error(e); process.exit(0); });
