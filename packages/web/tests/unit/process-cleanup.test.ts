import * as fs from "node:fs";
import { dirname, basename } from "node:path";
import { vi, it, expect } from "vitest";
import { spawnCommand } from "../../server/process-input";
vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof fs>("node:fs");
  return { ...actual, rmSync: vi.fn() };
});
it("does not crash or retry forever when Windows locks a temporary AI prompt", async () => {
  const actual = await vi.importActual<typeof fs>("node:fs");
  vi.mocked(fs.rmSync).mockImplementation(() => { throw Object.assign(Error("locked"), { code: "EPERM" }); });
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.useFakeTimers();
  const child = spawnCommand({ cmd: process.execPath, args: ["-e", "process.exit(0)", "--", "--append-system-prompt", "synthetic"] });
  const file = child.spawnargs.at(-1)!;
  try {
    await new Promise<void>((resolve, reject) => { child.once("error", reject); child.once("close", () => resolve()); });
    await vi.advanceTimersByTimeAsync(5000);
    expect(fs.rmSync).toHaveBeenCalledTimes(3);
    expect(warn).toHaveBeenCalledExactlyOnceWith("AI temporary file cleanup failed:", "EPERM");
  } finally {
    vi.useRealTimers(); warn.mockRestore();
    if (!basename(dirname(file)).startsWith("adam-ai-")) throw Error("unexpected test folder");
    actual.rmSync(dirname(file), { recursive: true, force: true });
  }
});
