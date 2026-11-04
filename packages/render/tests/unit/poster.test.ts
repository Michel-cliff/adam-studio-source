import { describe, expect, it } from "vitest";
import { barcode } from "../../src/lib/poster";

describe("the barcode of a poster window", () => {
  it("is the same for the same text, and fills the width it is given", () => {
    const a = barcode("WAMI 24", 600);
    expect(barcode("WAMI 24", 600)).toEqual(a);
    expect(barcode("OTHER", 600)).not.toEqual(a);
    const end = a[a.length - 1]!;
    expect(end.x + end.w).toBeLessThanOrEqual(600);
    expect(end.x + end.w).toBeGreaterThan(560);
    for (const b of a) expect(b.w).toBeGreaterThan(0);
  });
});
