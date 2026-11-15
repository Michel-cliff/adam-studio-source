import { copyFileSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";

/** Node's older Windows directory copier mangles Unicode destinations. Copy explicit paths instead. */
export function copyBundle(from: string, to: string): void {
  mkdirSync(to, { recursive: true });
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    const src = join(from, entry.name), dst = join(to, entry.name);
    if (entry.isDirectory()) copyBundle(src, dst);
    else if (entry.isFile()) copyFileSync(src, dst);
    else throw new Error("Unexpected non-file in render bundle.");
  }
}
