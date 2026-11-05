import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkConnector } from "../../server/connector-health";

const home = () => mkdtempSync(join(tmpdir(), "adam-health-"));
// A small MCP server. `result` is what its read-only tool answers, when it has one.
const server = (tool: string | null, result = '{content:[{type:"text",text:"[]"}]}') => ({
  command: process.execPath,
  args: ["-e", `let b="";const s=o=>process.stdout.write(JSON.stringify(o)+"\\n");process.stdin.on("data",d=>{b+=d;let i;while((i=b.indexOf("\\n"))>=0){const m=JSON.parse(b.slice(0,i));b=b.slice(i+1);
    if(m.method==="initialize")s({jsonrpc:"2.0",id:m.id,result:{protocolVersion:"2024-11-05",capabilities:{tools:{}},serverInfo:{name:"t",version:"1"}}});
    if(m.method==="tools/list")s({jsonrpc:"2.0",id:m.id,result:{tools:${tool ? `[{name:"${tool}",inputSchema:{type:"object"}}]` : "[]"}}});
    if(m.method==="tools/call")s({jsonrpc:"2.0",id:m.id,result:${result}});}});`],
});

let http: HttpServer | undefined;
afterEach(() => { http?.close(); http = undefined; });
const site = async (status: number) => {
  http = createServer((_, res) => { res.statusCode = status; res.end("{}"); }).listen(0, "127.0.0.1");
  await new Promise((r) => http!.once("listening", r));
  return { url: `http://127.0.0.1:${(http.address() as AddressInfo).port}/mcp` };
};

describe("whether a connector really works", () => {
  it("says yes for a server that answers", async () => {
    expect(await checkConnector("x", server("something"), home())).toEqual({ state: "ok" });
  });
  it("asks the service behind a server that only started", async () => {
    expect(await checkConnector("capcut", server("capcut_list_projects"), home())).toEqual({ state: "ok" });
    const off = await checkConnector("capcut", server("capcut_list_projects", '{isError:true,content:[{type:"text",text:"connect ECONNREFUSED 127.0.0.1:9001"}]}'), home());
    expect(off.state).toBe("down");
    expect(off.detail).toMatch(/ECONNREFUSED/);
    expect((await checkConnector("capcut", server("capcut_list_projects", '{content:[{type:"text",text:"fetch failed"}]}'), home())).state).toBe("down");
    // What the real CapCut connector answers with its service off: plain text, not marked as an error.
    expect((await checkConnector("capcut", server("capcut_list_projects", '{content:[{type:"text",text:"Error: CapCut API server is not responding."}]}'), home())).state).toBe("down");
  });
  it("says down for a program that cannot start, or that stops", async () => {
    expect((await checkConnector("x", { command: "no-such-program-xyz" }, home())).state).toBe("down");
    expect((await checkConnector("x", { command: process.execPath, args: ["-e", "console.error('boom');process.exit(2)"] }, home())).detail).toMatch(/boom/);
  });
  it("gives up on a server that never answers", async () => {
    expect(await checkConnector("x", { command: process.execPath, args: ["-e", "setInterval(()=>{},1000)"] }, home(), 400)).toEqual({ state: "down", detail: "no answer" });
  });
  it("asks for a sign-in when an online server refuses, unless Claude holds one", async () => {
    const h = home();
    expect(await checkConnector("savee", await site(401), h)).toEqual({ state: "sign-in" });
    mkdirSync(join(h, ".claude"));
    writeFileSync(join(h, ".claude", ".credentials.json"), JSON.stringify({ mcpOAuth: { "savee|abc": { accessToken: "" }, "other|abc": { accessToken: "t" } } }));
    expect((await checkConnector("savee", { url: (http!.address() as AddressInfo) && `http://127.0.0.1:${(http!.address() as AddressInfo).port}/mcp` }, h)).state).toBe("sign-in");
    writeFileSync(join(h, ".claude", ".credentials.json"), JSON.stringify({ mcpOAuth: { "savee|abc": { accessToken: "t" } } }));
    expect((await checkConnector("savee", { url: `http://127.0.0.1:${(http!.address() as AddressInfo).port}/mcp` }, h)).state).toBe("ok");
  });
  it("says down for an online server that is gone or failing", async () => {
    expect((await checkConnector("x", await site(500), home())).state).toBe("down");
    expect((await checkConnector("x", { url: "http://127.0.0.1:9/mcp" }, home())).state).toBe("down");
  });
});
