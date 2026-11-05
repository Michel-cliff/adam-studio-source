import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { keyStatus, setKey } from "../../server/keys";

describe("the library keys (Pixabay, Freesound)", () => {
  it("are kept in the .env next to the settings, shown by their last four characters, other lines kept", () => {
    const dir = mkdtempSync(join(tmpdir(), "adam keys-"));
    writeFileSync(join(dir, ".env"), "OTHER=abc\n");
    setKey(dir, "pixabay", "12345678-0123456789abcdef0123456789ab");
    setKey(dir, "freesound", "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789wxyz");
    expect(keyStatus(dir)).toEqual({ pixabay: "…89ab", freesound: "…wxyz" });
    const env = readFileSync(join(dir, ".env"), "utf8");
    expect(env).toMatch(/^OTHER=abc$/m);
    expect(env).toMatch(/^PIXABAY_API_KEY=12345678-/m);
    expect(env).toMatch(/^FREESOUND_API_KEY=AbCd/m);
    setKey(dir, "pixabay", "");
    expect(keyStatus(dir).pixabay).toBeNull();
    expect(() => setKey(dir, "freesound", "a b")).toThrow(/Freesound/);
  });
});
