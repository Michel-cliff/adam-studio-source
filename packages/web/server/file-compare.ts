import * as fs from "node:fs";

/** Compare large media in chunks, releasing the first handle even if the second open fails. */
export function sameBytes(a: string, b: string, io: Pick<typeof fs, "statSync" | "openSync" | "readSync" | "closeSync"> = fs): boolean {
  if (io.statSync(a).size !== io.statSync(b).size) return false;
  const fa = io.openSync(a, "r");
  let fb: number | undefined;
  try {
    fb = io.openSync(b, "r");
    const ba = Buffer.alloc(1 << 20), bb = Buffer.alloc(1 << 20);
    for (;;) {
      const na = io.readSync(fa, ba, 0, ba.length, null), nb = io.readSync(fb, bb, 0, bb.length, null);
      if (na !== nb || !ba.subarray(0, na).equals(bb.subarray(0, nb))) return false;
      if (na === 0) return true;
    }
  } finally {
    try { if (fb !== undefined) io.closeSync(fb); } finally { io.closeSync(fa); }
  }
}
