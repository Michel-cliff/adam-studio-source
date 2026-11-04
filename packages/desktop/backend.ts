import {spawnSync} from "node:child_process";
import {createApp} from '../web/server/app';
import {JobManager} from '../web/server/jobs';
import {SETTINGS_FILE,uiLang} from '../web/server/settings';
const settingsFile=process.env.ADAM_DESKTOP_SETTINGS||SETTINGS_FILE;
const jobs=new JobManager();
const server=createApp({settingsFile,jobs,sessionToken:process.env.ADAM_DESKTOP_TOKEN});
const send = (message: object) => { if (process.connected) process.send?.(message); };
let closing=false;
const shutdown=()=>{
 if(closing)return;closing=true;
 server.closeAllConnections();server.close(()=>send({type:'stopped'}));
};
process.on('message',(message:any)=>{
 if(message?.type==='shutdown')shutdown();
 if(message?.type==='status')send({type:'status',id:message.id,busy:server.hasActiveWork()});
 if(message?.type==='smoke-job'&&process.env.ADAM_DESKTOP_SMOKE==='1'){
  const job=jobs.start('desktop-smoke',{cmd:process.execPath,args:['-e','setInterval(()=>{},1000)'],label:'Desktop smoke job'});
  send({type:'smoke-job',job:job.id});
 }
});
process.on('disconnect',()=>{shutdown();setTimeout(()=>{if(process.platform==='win32')spawnSync('taskkill',['/pid',String(process.pid),'/T','/F'],{windowsHide:true});process.exit(0);},1000).unref();});
server.listen(0,'127.0.0.1',()=>{
 const address=server.address();if(address&&typeof address==='object')send({type:'ready',url:`http://127.0.0.1:${address.port}`,lang:uiLang(settingsFile)});
});
