import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createApp } from "../../server/app";
import { JobManager } from "../../server/jobs";
import { setProjectsRoot } from "../../server/settings";
import type { AddressInfo } from "node:net";
it("reopens an import without its job URL, lists it on Home, then switches to the finished project", async () => {
 const root=mkdtempSync(join(tmpdir(),"adam-pending-")),settingsFile=join(root,"ui.json"),jobs=new JobManager();setProjectsRoot(root,settingsFile);
 const job=jobs.start("pending",{cmd:process.execPath,args:["-e","setTimeout(()=>{},15000)"],label:"New project"});
 const server=createApp({settingsFile,jobs}).listen(0,"127.0.0.1");await new Promise(r=>server.once("listening",r));const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
 try {
  const response=await fetch(base+"/api/projects/pending");expect(response.status).toBe(200);expect(await response.json()).toMatchObject({importing:true,jobs:[{id:job.id,state:"running"}]});
  expect(await(await fetch(base+"/api/projects?full=1")).json()).toMatchObject([{name:"pending",importing:true}]);
  expect(await(await fetch(base+"/api/projects")).json()).toMatchObject([{name:"pending"}]);
  expect((await fetch(base+"/api/projects/missing")).status).toBe(404);
  mkdirSync(join(root,"pending"));writeFileSync(join(root,"pending/project.json"),JSON.stringify({version:1,name:"pending",canvas:{format:"9:16",fps:30},style:"style.json",assets:[{id:"v",kind:"video",path:"take.mp4"}],story:[{id:"c",asset:"v",inMs:0,outMs:1000}]}));
  const done=await(await fetch(base+"/api/projects/pending")).json();expect(done.importing).toBeUndefined();expect(done.ok).toBe(true);
 } finally {jobs.stopAll();server.close();}
});

it("forgets a finished import once its project is gone, and keeps a failed one's log without listing it", async () => {
 const root=mkdtempSync(join(tmpdir(),"adam-pending-")),settingsFile=join(root,"ui.json"),jobs=new JobManager();setProjectsRoot(root,settingsFile);
 const ended=(job:{id:string})=>new Promise<void>(r=>jobs.subscribe(job.id,(e:{type:string})=>{if(e.type==="end")r();}));
 const done=jobs.start("trashed",{cmd:process.execPath,args:["-e",""],label:"New project"});await ended(done);
 const failed=jobs.start("broken",{cmd:process.execPath,args:["-e","process.exit(1)"],label:"New project"});await ended(failed);
 const server=createApp({settingsFile,jobs}).listen(0,"127.0.0.1");await new Promise(r=>server.once("listening",r));const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
 try {
  expect(await(await fetch(base+"/api/projects")).json()).toEqual([]);
  expect(await(await fetch(base+"/api/projects?full=1")).json()).toEqual([]);
  expect((await fetch(base+"/api/projects/trashed")).status).toBe(404);
  expect(await(await fetch(base+"/api/projects/broken")).json()).toMatchObject({importing:true,jobs:[{id:failed.id,state:"failed"}]});
 } finally {jobs.stopAll();server.close();}
});
