const {app,autoUpdater,BrowserWindow,dialog,Menu,screen,shell,nativeImage}=require('electron');
const {fork,spawn,spawnSync}=require('node:child_process');
const {join,dirname,basename}=require('node:path');
const {readFileSync,writeFileSync,mkdirSync}=require('node:fs');
const {randomBytes}=require('node:crypto');
const {fitWindow,isLocal,isExternal}=require('./policy.cjs');
const {canCheck,startUpdates}=require('./updates.cjs');
// Squirrel invokes these hooks during per-user install/update/uninstall. Never open the Studio for them.
if(app.isPackaged && process.argv.some(a=>['--squirrel-install','--squirrel-updated','--squirrel-uninstall','--squirrel-obsolete'].includes(a))){
 const event=process.argv.find(a=>['--squirrel-install','--squirrel-updated','--squirrel-uninstall','--squirrel-obsolete'].includes(a));
 if(['--squirrel-install','--squirrel-updated'].includes(event)){
  // Keep the Windows Apps list icon local; Squirrel otherwise downloads its default Electron icon.
  try {
   const icon=join(dirname(dirname(process.execPath)),'app.ico');
   writeFileSync(icon,readFileSync(join(__dirname,'assets/adam.ico')));
   const reg=spawnSync(join(process.env.SystemRoot||'C:\\Windows','System32/reg.exe'),['add','HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\AdamStudio','/v','DisplayIcon','/t','REG_SZ','/d',icon,'/f'],{windowsHide:true,encoding:'utf8'});
   if(reg.error||reg.status!==0)console.error('Windows icon registration:',reg.error?.message||reg.stderr);
  }catch(error){console.error('Windows icon:',error.message);}
 }
 if(['--squirrel-install','--squirrel-updated','--squirrel-uninstall'].includes(event)){
  const update=join(dirname(dirname(process.execPath)),'Update.exe');
  const task=spawn(update,[event==='--squirrel-uninstall'?'--removeShortcut':'--createShortcut',basename(process.execPath)],{windowsHide:true});
  task.on('error',()=>app.quit());task.on('close',()=>app.quit());setTimeout(()=>app.quit(),5000);
 }else app.quit();
 return;
}
app.setName('Adam Studio');
if(process.platform==='win32')app.setAppUserModelId('com.squirrel.AdamStudio.AdamStudio');
if(process.env.ADAM_DESKTOP_DATA)app.setPath('userData',process.env.ADAM_DESKTOP_DATA);
const smoke=process.argv.includes('--smoke-test');
if(smoke && app.isPackaged && !process.env.ADAM_DESKTOP_DATA){
 const {mkdtempSync}=require('node:fs'),{tmpdir}=require('node:os');
 const dir=mkdtempSync(join(tmpdir(),'adam-installed-smoke-'));app.setPath('userData',dir);
 process.env.ADAM_DESKTOP_SETTINGS=join(dir,'ui.json');process.env.ADAM_DESKTOP_SMOKE='1';
 writeFileSync(process.env.ADAM_DESKTOP_SETTINGS,JSON.stringify({projectsRoot:join(dir,'projects'),lang:'fr'}));
 writeFileSync(join(dir,'onboarding.json'),JSON.stringify({completed:true}));
}
if(!app.requestSingleInstanceLock()){app.quit();}else{
let win,child,origin,lang='fr',quitting=false,checking=false,forceKilled=false;
const runtime=app.isPackaged?require('./runtime.cjs').packagedRuntime(process.resourcesPath,app.getPath('userData')):null;
const pending=new Map();let seq=0;const root=runtime?runtime.root:join(__dirname,'../..');
const token=randomBytes(32).toString('hex');
const stateFile=()=>join(app.getPath('userData'),'window-state.json');
function saved(){try{return JSON.parse(readFileSync(stateFile(),'utf8'));}catch{return {};}}
function save(){if(!win||win.isDestroyed())return;try{mkdirSync(app.getPath('userData'),{recursive:true});writeFileSync(stateFile(),JSON.stringify({bounds:win.getNormalBounds(),maximized:win.isMaximized(),zoom:win.webContents.getZoomFactor()}));}catch(e){console.error('Window state:',e.message);}}
function killBackend(){if(!child||child.exitCode!==null||forceKilled)return;forceKilled=true;if(process.platform==='win32'&&child.pid)spawnSync('taskkill',['/pid',String(child.pid),'/T','/F'],{windowsHide:true});else child.kill('SIGTERM');}
function request(type){return new Promise((resolve,reject)=>{const id=++seq;const timer=setTimeout(()=>{pending.delete(id);reject(Error('Backend timeout'));},5000);pending.set(id,v=>{clearTimeout(timer);resolve(v);});child.send({type,id});});}
async function release(){
 quitting=true;save();
 await new Promise(resolve=>{if(!child||child.exitCode!==null)return resolve();const timer=setTimeout(resolve,4000);child.once('message',m=>{if(m.type==='stopped'){clearTimeout(timer);resolve();}});child.once('exit',()=>{clearTimeout(timer);resolve();});child.send({type:'shutdown'});});
 killBackend();
}
async function stop(){if(quitting)return;await release();if(win&&!win.isDestroyed())win.destroy();app.quit();}
// quitAndInstall closes the windows and quits by itself, and must be the one to do it: Squirrel then swaps the version and relaunches.
async function installUpdate(){if(quitting)return;await release();try{autoUpdater.quitAndInstall();}catch(error){console.error('Update:',error);app.quit();}}
async function close(){
 if(checking||quitting)return;checking=true;
 try{
  let busy=true;try{busy=(await request('status')).busy;}catch{}
  if(busy){const choice=await dialog.showMessageBox(win,{type:'question',title:'Adam Studio',message:lang==='fr'?'Une génération est en cours.':'A task is still running.',detail:lang==='fr'?'Tu peux revenir au Studio ou arrêter les tâches et fermer.':'Return to the Studio or stop the tasks and close.',buttons:lang==='fr'?['Revenir au Studio','Arrêter et fermer']:['Return to Studio','Stop and close'],defaultId:0,cancelId:0,noLink:true});if(choice.response!==1)return;}
  await stop();
 }finally{checking=false;}
}
function startBackend(){return new Promise((resolve,reject)=>{
 const timeout=setTimeout(()=>reject(Error('Le moteur Adam ne répond pas.')),30000);
 child=fork(join(root,'packages/desktop/backend.ts'),[],{execPath:runtime?runtime.node:process.env.ADAM_DESKTOP_NODE,execArgv:['--import','tsx'],cwd:root,env:{...(runtime?runtime.env:process.env),ADAM_DESKTOP_TOKEN:token},stdio:['ignore','pipe','pipe','ipc'],windowsHide:true});
 child.stdout.on('data',d=>process.stdout.write(d));child.stderr.on('data',d=>process.stderr.write(d));
 child.on('message',m=>{if(m.type==='ready'){clearTimeout(timeout);resolve(m);}if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}});
 child.on('error',reject);child.on('exit',(code)=>{clearTimeout(timeout);if(!origin)reject(Error(`Le moteur Adam s’est arrêté (${code}).`));else if(!quitting){dialog.showErrorBox('Adam Studio',lang==='fr'?'Le moteur s’est arrêté. Relance Adam Studio.':'The engine stopped. Restart Adam Studio.');quitting=true;app.quit();}});
});}
app.on('second-instance',()=>{if(win){if(win.isMinimized())win.restore();win.show();win.focus();}});
app.on('before-quit',e=>{if(!quitting){e.preventDefault();void close();}});
app.on('will-quit',killBackend);
app.whenReady().then(async()=>{
 const ready=await startBackend();origin=ready.url;lang=ready.lang;
 const state=saved();const areas=screen.getAllDisplays().map(d=>d.workArea);const bounds=fitWindow(state.bounds,areas);
 const windowIcon=nativeImage.createFromBuffer(readFileSync(join(__dirname,'assets/adam.png'))).resize({width:256,height:256});
 if(windowIcon.isEmpty())throw Error('Adam Studio icon could not be loaded');
 win=new BrowserWindow({...bounds,show:false,title:'Adam Studio',icon:windowIcon,backgroundColor:'#252422',webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}});
 win.setIcon(windowIcon);
 if(process.platform==='win32')win.setAppDetails({appId:'com.squirrel.AdamStudio.AdamStudio',appIconPath:app.isPackaged?process.execPath:join(__dirname,'assets/adam.ico'),appIconIndex:0,relaunchCommand:'"'+process.execPath+'"',relaunchDisplayName:'Adam Studio'});
 win.webContents.session.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
 win.webContents.session.webRequest.onBeforeSendHeaders((details,callback)=>{
  const headers={...details.requestHeaders};for(const key of Object.keys(headers))if(key.toLowerCase()==='x-adam-desktop-token')delete headers[key];
  if(isLocal(details.url,origin))headers['X-Adam-Desktop-Token']=token;callback({requestHeaders:headers});
 });
 win.webContents.on('will-navigate',(e,url)=>{if(!isLocal(url,origin))e.preventDefault();});
 win.webContents.on('will-redirect',(e,url)=>{if(!isLocal(url,origin))e.preventDefault();});
 win.webContents.setWindowOpenHandler(({url})=>{if(isLocal(url,origin))win.webContents.downloadURL(url);else if(isExternal(url))void shell.openExternal(url);return {action:'deny'};});
 const updates=canCheck({packaged:app.isPackaged,smoke,argv:process.argv})?startUpdates({autoUpdater,version:app.getVersion(),lang,busy:async()=>(await request('status')).busy,ask:async({message,detail,buttons})=>(await dialog.showMessageBox(win,{type:'info',title:'Adam Studio',message,detail,buttons,defaultId:0,cancelId:buttons.length-1,noLink:true})).response,restart:()=>void installUpdate(),log:error=>console.error('Update:',error?.message||error)}):null;
 const appMenu=[...(updates?[{label:lang==='fr'?'Rechercher les mises à jour':'Check for updates',click:()=>updates.check(true)}]:[]),...(runtime?[{label:lang==='fr'?'Licences':'Licences',click:()=>void shell.openPath(join(root,'licenses'))}]:[]),{type:'separator'},{label:lang==='fr'?'Quitter':'Quit',click:()=>void close()}];
 Menu.setApplicationMenu(Menu.buildFromTemplate([{label:lang==='fr'?'Application':'Application',submenu:appMenu},{label:lang==='fr'?'Édition':'Edit',submenu:[{role:'undo'},{role:'redo'},{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}]},{label:lang==='fr'?'Affichage':'View',submenu:[{role:'reload'},{role:'resetZoom'},{role:'zoomIn'},{role:'zoomOut'},{role:'togglefullscreen'}]}]));
 win.on('close',e=>{if(!quitting){e.preventDefault();void close();}});
 let saveTimer;for(const event of ['move','resize','maximize','unmaximize'])win.on(event,()=>{clearTimeout(saveTimer);saveTimer=setTimeout(save,300);});
 const adapt=()=>{if(win&&!win.isDestroyed()&&!win.isMaximized())win.setBounds(fitWindow(win.getBounds(),screen.getAllDisplays().map(d=>d.workArea)));};
 screen.on('display-removed',adapt);screen.on('display-metrics-changed',adapt);
 if(!smoke)win.show();
 await win.loadURL(origin);if(Number.isFinite(state.zoom))win.webContents.setZoomFactor(Math.max(.5,Math.min(2,state.zoom)));
 if(state.maximized)win.maximize();
 if(smoke){
  const anonymous=await fetch(origin+'/api/ping');if(anonymous.status!==403)throw Error('API protection failed');
  const result=await win.webContents.executeJavaScript(`(async()=>({ping:await(await fetch('/api/ping')).json(),node:typeof process,nav:!!document.querySelector('.topnav')}))()`);
  if(result.ping.app!=='adam-studio'||result.node!=='undefined'||!result.nav)throw Error('Desktop UI verification failed');
  child.send({type:'smoke-job'});await new Promise(resolve=>child.once('message',resolve));
  if(!(await request('status')).busy)throw Error('Active job was not detected');
  console.log('DESKTOP_SMOKE_OK '+JSON.stringify({...result,busyDetected:true,bounds:win.getBounds(),backendPid:child.pid}));await stop();
 }else win.show();
}).catch(async e=>{console.error(e);if(!smoke)dialog.showErrorBox('Adam Studio',e.message);quitting=true;killBackend();app.exit(1);});
}
