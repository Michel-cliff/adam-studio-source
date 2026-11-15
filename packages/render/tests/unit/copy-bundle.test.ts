import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it, expect } from "vitest";
import { copyBundle } from "../../src/lib/copy-bundle";

it("keeps index.html and nested assets at accented Windows project paths", () => {
  const root = mkdtempSync(join(tmpdir(), "adam-copy-bundle-"));
  try {
    const src = join(root, "source"), dst = join(root, "projet démo", ".bundle", "run");
    mkdirSync(join(src, "assets"), { recursive: true });
    writeFileSync(join(src, "index.html"), "<html>démo</html>");
    writeFileSync(join(src, "assets", "élément.js"), "export {}");
    copyBundle(src, dst);
    expect(readFileSync(join(dst, "index.html"), "utf8")).toBe("<html>démo</html>");
    expect(readFileSync(join(dst, "assets", "élément.js"), "utf8")).toBe("export {}");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
