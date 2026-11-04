import {expect,it} from "vitest";
import {quotaFromClaude} from "../../server/claude-quota";
it("reads native subscription reports without treating the session token count as quota",()=>{
 const now=Date.now(),reset=new Date(now+3600000).toISOString();
 const output=JSON.stringify({type:"assistant",usage_report:{rate_limits:{limits:[{kind:"session",percent:42,resets_at:reset},{kind:"weekly_all",percent:71,resets_at:reset}]}}});
 expect(quotaFromClaude(output,now).windows.map(w=>w.remainingPercent)).toEqual([58,29]);
 expect(quotaFromClaude(output,now+7200000).status).toBe("unavailable");
 expect(quotaFromClaude(JSON.stringify({type:"result",usage:{input_tokens:83000}})).status).toBe("unavailable");
});
