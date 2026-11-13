import { existsSync, readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { spawnCommand } from "../../server/process-input";
import { askCommand } from "../../server/claude";
import { codexAskCommand } from "../../server/codex";

it("passes a large request over a closed stdin pipe and removes Claude's system file", async () => {
  const text = "é".repeat(100_000);
  const child = spawnCommand({ cmd: process.execPath, args: ["-e",
    'let data="";process.stdin.setEncoding("utf8");process.stdin.on("data",x=>data+=x);process.stdin.on("end",()=>console.log(JSON.stringify({size:data.length,file:process.argv[2]})));',
    "--", "--append-system-prompt", text], input: text });
  const file = child.spawnargs.at(-1)!;
  expect(readFileSync(file, "utf8")).toBe(text);
  let output = "";
  child.stdout!.on("data", data => output += data);
  await new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", code => code === 0 ? resolve() : reject(new Error(output)));
  });
  expect(JSON.parse(output).size).toBe(text.length);
  expect(existsSync(file)).toBe(false);
});


it("launches a short YouTube request with a large project context for either provider", async () => {
  const url = "https://youtu.be/YUYeHMsqbmY?si=cV9KpLiCC3_fgKze";
  const request = "Ajoute des extraits de cette vidéo au montage : " + url;
  const context = "Contexte du projet et transcription. ".repeat(3000);
  const commands = [
    askCommand("p", "visuals", request, "default", null, { context, projectsRoot: "C:/test-projects" }),
    codexAskCommand("p", "visuals", request, "default", null, { context, projectsRoot: "C:/test-projects" }),
  ];
  const probe = 'let input="";process.stdin.setEncoding("utf8");process.stdin.on("data",s=>input+=s);process.stdin.on("end",()=>{const args=process.argv.slice(1);const i=args.indexOf("--append-system-prompt-file");const system=i<0?"":require("node:fs").readFileSync(args[i+1],"utf8");console.log(JSON.stringify({input,system,maxArg:Math.max(...args.map(s=>s.length))}));});';
  for (const command of commands) {
    const child = spawnCommand({ ...command, cmd: process.execPath, args: ["-e", probe, "--", ...command.args] });
    let output = "";
    child.stdout!.on("data", data => output += data);
    await new Promise<void>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", code => code === 0 ? resolve() : reject(new Error(output)));
    });
    const received = JSON.parse(output);
    expect(child.spawnargs.join(" ")).toContain("C:/test-projects");
    expect(received.input).toContain(url);
    expect(received.input + received.system).toContain(context);
    expect(received.maxArg).toBeLessThan(8192);
  }
});

it("keeps both providers' prompts off the command line without shortening them", () => {
  const request = "demande ".repeat(10_000);
  for (const c of [askCommand("p", "hook", request), codexAskCommand("p", "hook", request)]) {
    expect(c.args.some(arg => arg.includes(request))).toBe(false);
    expect(c.input).toContain(request);
  }
});
