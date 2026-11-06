import { existsSync, mkdirSync, mkdtempSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { allowedFile, checkLook, checkSource, landing, libraryUrl, publicUrl } from "../src/access";
import { importAsset } from "../src/importer";

const temp = () => mkdtempSync(join(tmpdir(), "adam-access-"));

describe("what an id can write", () => {
  for (const id of ["../../evil", "..\\..\\evil", "C:\\evil", "a/b", "a.b", "", ".hidden", "a b", "x".repeat(65)]) {
    it(`refuses the id ${JSON.stringify(id.slice(0, 20))} and writes nothing`, async () => {
      const dir = temp(), src = join(dir, "photo.png");
      writeFileSync(src, "x");
      await expect(importAsset(join(dir, "p"), { path: src }, id)).rejects.toThrow(/asset id/);
      expect(existsSync(join(dir, "p"))).toBe(false);
      expect(existsSync(join(dir, "evil.png"))).toBe(false);
    });
  }

  it("keeps ordinary ids, and the names made from titles", async () => {
    const dir = temp(), src = join(dir, "photo.png");
    writeFileSync(src, "x");
    expect((await importAsset(dir, { path: src }, "logo_v2-final")).path).toBe("assets/logo_v2-final.png");
    expect((await importAsset(dir, { path: src, title: "Été à Paris !" })).id).toBe("ete_a_paris");
  });

  it("gives a program named by its kind the extension of that kind", async () => {
    const dir = temp(), src = join(dir, "run.bat");
    writeFileSync(src, "x");
    const a = await importAsset(dir, { path: src, kind: "image" }, "start");
    expect(a.path).toBe("assets/start.jpg");
    expect(readdirSync(join(dir, "assets"))).toEqual(["start.jpg"]);
  });
});

describe("what a URL can reach", () => {
  it("takes the online libraries over https", () => {
    for (const u of ["https://cdn.pixabay.com/video/a.mp4", "https://pixabay.com/get/a.jpg?x=1", "https://cdn.freesound.org/previews/1/a.mp3"]) expect(libraryUrl(u), u).toBe(true);
  });

  it("refuses everything else", () => {
    for (const u of ["http://cdn.pixabay.com/a.jpg", "https://evil.example/a.jpg?secret=1", "https://pixabay.com.evil.example/a.jpg", "https://evilpixabay.com/a.jpg", "https://pixabay.com@evil.example/a.jpg", "https://user:pw@pixabay.com/a.jpg", "https://pixabay.com:8443/a.jpg", "http://127.0.0.1:3000/a.jpg", "file:///C:/a.jpg", "not a url"]) expect(libraryUrl(u), u).toBe(false);
  });

  it("stops a download sent elsewhere by the server", async () => {
    const dir = temp(), real = globalThis.fetch;
    globalThis.fetch = (async () => Object.defineProperty(new Response("x"), "url", { value: "https://evil.example/a.jpg" })) as typeof fetch;
    try {
      await expect(importAsset(dir, { url: "https://pixabay.com/a.jpg" }, "a", libraryUrl)).rejects.toThrow(/sent elsewhere/);
      expect(existsSync(join(dir, "assets", "a.jpg"))).toBe(false);
    } finally { globalThis.fetch = real; }
  });
});

describe("what a path can read", () => {
  it("opens media inside the folders only", () => {
    const root = temp(), out = temp();
    writeFileSync(join(root, "a.png"), "x");
    writeFileSync(join(root, ".env"), "x");
    writeFileSync(join(root, "notes.txt"), "x");
    writeFileSync(join(out, "b.png"), "x");
    expect(allowedFile(join(root, "a.png"), [root])).toBe(true);
    for (const p of [join(out, "b.png"), join(root, ".env"), join(root, "notes.txt"), join(root, "..", "b.png"), "a.png", "\\\\evil\\share\\a.png", "//evil/share/a.png"]) expect(allowedFile(p, [root]), p).toBe(false);
  });

  it("does not follow a link out of the folder", () => {
    const root = temp(), out = temp();
    writeFileSync(join(out, "secret.png"), "x");
    mkdirSync(join(root, "sub"));
    try { symlinkSync(out, join(root, "sub", "link"), "junction"); } catch { return; }
    expect(allowedFile(join(root, "sub", "link", "secret.png"), [root])).toBe(false);
  });

  it("explains the refusal, for a path as for a URL", () => {
    const root = temp();
    expect(() => checkSource({ path: "C:\\Windows\\win.ini" }, [root])).toThrow(/Inspiration/);
    expect(() => checkSource({ url: "https://evil.example/?d=1" }, [root])).toThrow(/online libraries/);
    expect(() => checkLook("C:\\Windows\\win.ini", [root])).toThrow(/Inspiration/);
    expect(() => checkLook("https://evil.example/a.png", [root])).toThrow(/online libraries/);
    expect(() => checkLook("ftp://evil.example/a.png", [root])).toThrow(/online libraries/);
  });
});

describe("what the creator wrote in their request", () => {
  const words = "Mets ce logo https://cdn.example.com/brand/logo.png?v=2 et aussi D:\\Marque\\logo.png, merci. http://insecure.example/a.png https://127.0.0.1/a.png https://192.168.1.4/a.png D:\\Marque\\notes.txt";
  const root = temp();

  it("opens exactly the link or the path written", () => {
    expect(() => checkSource({ url: "https://cdn.example.com/brand/logo.png?v=2" }, [root], words)).not.toThrow();
    expect(() => checkLook("https://cdn.example.com/brand/logo.png?v=2", [root], words)).not.toThrow();
    expect(() => checkSource({ path: "D:\\Marque\\logo.png" }, [root], words)).not.toThrow();
  });

  it("refuses a link made longer to carry data, or another one", () => {
    for (const url of ["https://cdn.example.com/brand/logo.png?v=2&secret=abc", "https://cdn.example.com/brand/logo.png?v=2/abc", "https://evil.example/logo.png"]) expect(() => checkSource({ url }, [root], words), url).toThrow(/online libraries/);
  });

  it("refuses what they wrote when it is not https, reaches this machine, or is not a media file", () => {
    for (const url of ["http://insecure.example/a.png", "https://127.0.0.1/a.png", "https://192.168.1.4/a.png"]) expect(() => checkSource({ url }, [root], words), url).toThrow(/online libraries/);
    expect(() => checkSource({ path: "D:\\Marque\\notes.txt" }, [root], words)).toThrow(/Inspiration/);
  });

  it("gives nothing without a request", () => {
    expect(() => checkSource({ url: "https://cdn.example.com/a.png" }, [root], "")).toThrow(/online libraries/);
    expect(() => checkSource({ path: "D:\\Marque\\logo.png" }, [root], "")).toThrow(/Inspiration/);
  });

  it("lets a link of theirs be redirected to a public host, never to this machine; a library result stays in the library", () => {
    expect(landing("https://cdn.example.com/a.png")("https://objects.example.net/a.png")).toBe(true);
    expect(landing("https://cdn.example.com/a.png")("https://localhost/a.png")).toBe(false);
    expect(landing("https://pixabay.com/a.png")("https://objects.example.net/a.png")).toBe(false);
    for (const u of ["https://[::1]/a", "https://10.0.0.1/a", "https://172.16.0.1/a", "https://169.254.169.254/a", "https://printer.local/a", "https://[fd00::1]/a"]) expect(publicUrl(u), u).toBe(false);
    for (const u of ["https://172.15.0.1/a", "https://example.com/a", "https://10.example.com/a"]) expect(publicUrl(u), u).toBe(true);
  });
});
