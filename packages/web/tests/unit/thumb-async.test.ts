import {mkdirSync,mkdtempSync,writeFileSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {expect,it,vi} from "vitest";
vi.mock("node:child_process",()=>({execFile:vi.fn((_cmd,args,_opts,done)=>{setTimeout(()=>{writeFileSync(args.at(-1),"jpeg");done(null);},50);})}));
import {execFile} from "node:child_process";
import {thumbnail} from "../../server/thumb";
it("shares concurrent thumbnails without blocking the event loop and reuses the completed file",async()=>{
 const dir=mkdtempSync(join(tmpdir(),"adam-thumb-"));mkdirSync(join(dir,"cache/a"),{recursive:true});writeFileSync(join(dir,"cache/a/proxy.mp4"),"input");
 const a=thumbnail(dir),b=thumbnail(dir);expect(a).toBe(b);
 let done=false;a.then(()=>{done=true;});await new Promise(r=>setTimeout(r,0));expect(done).toBe(false);
 expect(await a).toBe(join(dir,"renders/.thumb.jpg"));await thumbnail(dir);expect(execFile).toHaveBeenCalledTimes(1);
});
