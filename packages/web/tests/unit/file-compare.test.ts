import * as fs from "node:fs";
import { it, expect, vi } from "vitest";
import { sameBytes } from "../../server/file-compare";

it("releases the first descriptor when the second media file cannot be opened", () => {
  const closeSync = vi.fn();
  const io = { ...fs, statSync: vi.fn(() => ({ size: 4 })), openSync: vi.fn().mockReturnValueOnce(7).mockImplementationOnce(() => { throw Error("EPERM"); }), closeSync };
  expect(() => sameBytes("upload", "locked-media", io as unknown as typeof fs)).toThrow("EPERM");
  expect(closeSync).toHaveBeenCalledExactlyOnceWith(7);
});
