import { afterEach, expect, it, vi } from "vitest";
import { requestProblem, shouldReportJob, takeProblem, PROBLEM_EVENT } from "../../app/problem-events";

afterEach(() => { takeProblem(); vi.unstubAllGlobals(); });
it("keeps an early renderer problem until the report UI has mounted", () => {
  const dispatch = vi.fn();
  vi.stubGlobal("dispatchEvent", dispatch);
  requestProblem({ kind: "interface", message: "startup failure" });
  expect(dispatch.mock.calls[0]![0].type).toBe(PROBLEM_EVENT);
  expect(takeProblem()).toEqual({ kind: "interface", message: "startup failure" });
  expect(takeProblem()).toBeNull();
});
it("offers a report for new unexpected failures, rather than cancellations or expected account issues", () => {
  const failed = { state: "failed" as const, endedAt: 200, hint: null };
  expect(shouldReportJob(failed, 100)).toBe(true);
  expect(shouldReportJob({ ...failed, endedAt: 99 }, 100)).toBe(false);
  expect(shouldReportJob({ ...failed, state: "stopped" }, 100)).toBe(false);
  expect(shouldReportJob({ ...failed, hint: "replace" }, 100)).toBe(false);
  expect(shouldReportJob({ ...failed, ai: { problem: "quota" } }, 100)).toBe(false);
});
