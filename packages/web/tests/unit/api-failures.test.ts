import { afterEach, expect, it, vi } from "vitest";
import { api } from "../../app/api";
import { takeProblem } from "../../app/problem-events";

afterEach(() => { takeProblem(); vi.unstubAllGlobals(); });
const setup = (response: Response | Error) => {
  vi.stubGlobal("dispatchEvent", vi.fn());
  vi.stubGlobal("fetch", response instanceof Error ? vi.fn().mockRejectedValue(response) : vi.fn().mockResolvedValue(response));
};
it("rejects an HTML page masquerading as a successful API response and offers reporting", async () => {
  setup(new Response("<html>wrong server</html>", { status: 200 }));
  await expect(api("/tasks")).rejects.toThrow(/invalid response/);
  expect(takeProblem()?.kind).toBe("request");
});
it("keeps quota and sign-in recovery separate from bug reports", async () => {
  setup(Response.json({ error: "quota", aiFailure: true }, { status: 503 }));
  await expect(api("/ask")).rejects.toThrow("quota");
  expect(takeProblem()).toBeNull();
});
it("offers diagnostics for internal server or connection failures", async () => {
  setup(Response.json({ error: "disk failure" }, { status: 500 }));
  await expect(api("/save")).rejects.toThrow("disk failure");
  expect(takeProblem()?.kind).toBe("request");
  setup(new TypeError("network"));
  await expect(api("/ping")).rejects.toThrow("network");
  expect(takeProblem()?.kind).toBe("connection");
});
