import { describe, it, expect } from "vitest";
import { CodexQuota, quotaFromSnapshot } from "../../server/codex-quota";
describe("subscription quota, not token balance", () => {
  it("normalises real quota windows and keeps missing data unavailable", () => {
    expect(quotaFromSnapshot({ rateLimits: { primary: { usedPercent: 73, windowDurationMins: 300, resetsAt: 123 }, secondary: { usedPercent: 28, windowDurationMins: 10080 } } }, 1000)).toEqual({ status: "available", updatedAt: 1000, windows: [{ label: "5 h", remainingPercent: 27, resetsAt: 123000 }, { label: "7 d", remainingPercent: 72, resetsAt: null }] });
    expect(quotaFromSnapshot({})).toMatchObject({ status: "unavailable", windows: [], updatedAt: null });
    expect(quotaFromSnapshot({ rateLimits: { primary: { usedPercent: NaN } } }).windows).toEqual([]);
  });
  it("initialises once, handles chunked RPC replies, caches reads and consumes update notifications", async () => {
    const script = `let b='';process.stdin.on('data',c=>{b+=c;let i;while((i=b.indexOf('\\n'))>=0){const e=JSON.parse(b.slice(0,i));b=b.slice(i+1);if(e.method==='initialize')process.stdout.write(JSON.stringify({id:e.id,result:{}})+'\\n');if(e.method==='account/rateLimits/read'){const s=JSON.stringify({id:e.id,result:{rateLimits:{primary:{usedPercent:20,windowDurationMins:300}}}})+'\\n';process.stdout.write(s.slice(0,12));setTimeout(()=>process.stdout.write(s.slice(12)),5);setTimeout(()=>process.stdout.write(JSON.stringify({method:'account/rateLimits/updated',params:{rateLimits:{primary:{usedPercent:35,windowDurationMins:300}}}})+'\\n'),30)}}});`;
    const q = new CodexQuota(process.execPath, ["-e", script]);
    try {
      expect((await q.read()).windows[0]!.remainingPercent).toBe(80);
      await new Promise(r => setTimeout(r, 80));
      expect((await q.read()).windows[0]!.remainingPercent).toBe(65);
    } finally { q.dispose(); }
  });
  it("reports process failure as unavailable rather than inventing a balance", async () => {
    const q = new CodexQuota(process.execPath, ["-e", "process.exit(1)"]);
    try { expect(await q.read()).toMatchObject({ status: "unavailable", windows: [] }); } finally { q.dispose(); }
  });
});
