import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_TABS, renderAttempts, progressReporter, stallGuard } from "../../src/lib/render-watch";

describe("a long render", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("says where it is every 5 %, with the time left", () => {
    let t = 0;
    const report = progressReporter(() => t);
    expect(report(0)).toBe("rendering: 0 %");
    t = 60000;
    expect(report(0.02)).toBeNull();
    expect(report(0.25)).toBe("rendering: 25 %, about 3 min left");
    expect(report(0.26)).toBeNull();
    expect(report(1)).toBe("rendering: 100 %");
  });
  it("is declared stuck only when progress has stopped for the whole delay", () => {
    const stuck = vi.fn();
    const guard = stallGuard(stuck, 60000, 1000, Date.now);
    vi.advanceTimersByTime(50000); guard.ping(0.1);
    vi.advanceTimersByTime(50000); expect(stuck).not.toHaveBeenCalled();
    guard.ping(0.1); // The same value is not progress.
    vi.advanceTimersByTime(11000); expect(stuck).toHaveBeenCalledOnce();
  });
  it("stays quiet once the render is over", () => {
    const stuck = vi.fn();
    const guard = stallGuard(stuck, 60000, 1000, Date.now);
    guard.stop(); vi.advanceTimersByTime(120000);
    expect(stuck).not.toHaveBeenCalled();
  });
});

describe("how a video is rendered", () => {
  it("tries the graphics card first, then the processor alone: a card that fails never costs the export", () => {
    expect(renderAttempts(false, {})).toEqual([{ gl: "angle", label: "graphics card" }, { gl: null, label: "processor" }]);
  });
  it("keeps the processor for a transparent layer, whose alpha CapCut reads", () => {
    expect(renderAttempts(true, {})).toEqual([{ gl: null, label: "processor" }]);
  });
  it("can be forced to the processor", () => {
    expect(renderAttempts(false, { ADAM_RENDER_GL: "off" })).toEqual([{ gl: null, label: "processor" }]);
  });
  it("uses few tabs: measured, more than four gain nothing and cost memory", () => {
    expect(MAX_TABS).toBe(4);
  });
});
