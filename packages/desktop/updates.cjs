// Automatic updates of the installed app (Squirrel, through Electron's free feed for public GitHub releases).
// Everything that touches Electron or time is passed in, so the rules below can be tested without an installed app.
const OWNER_REPO='Michel-cliff/adam-studio-releases';
const FIRST_CHECK=15000,EVERY=6*60*60*1000,RETRY=60000;
const TEXT={
 fr:{ready:'Une mise à jour d’Adam Studio est prête.',readyDetail:v=>`${v?`Version ${v}. `:''}Tes projets ne changent pas. Si tu préfères attendre, elle s’installera au prochain démarrage.`,ready2:['Redémarrer maintenant','Plus tard'],latest:'Tu as la dernière version d’Adam Studio.',downloading:'Une mise à jour se télécharge.',downloadingDetail:'Elle peut prendre plusieurs minutes. Adam Studio te préviendra quand elle sera prête.',failed:'Impossible de vérifier les mises à jour.',failedDetail:'Vérifie ta connexion internet, puis réessaie.',ok:'OK'},
 en:{ready:'An Adam Studio update is ready.',readyDetail:v=>`${v?`Version ${v}. `:''}Your projects do not change. If you would rather wait, it installs at the next start.`,ready2:['Restart now','Later'],latest:'You have the latest version of Adam Studio.',downloading:'An update is downloading.',downloadingDetail:'This can take several minutes. Adam Studio will tell you when it is ready.',failed:'Could not check for updates.',failedDetail:'Check your internet connection, then try again.',ok:'OK'},
};
const canCheck=({packaged,smoke,argv})=>Boolean(packaged&&!smoke&&!argv.includes('--squirrel-firstrun'));
const feedUrl=(version,env=process.env)=>env.ADAM_UPDATE_FEED||`https://update.electronjs.org/${OWNER_REPO}/win32-x64/${version}`;
function startUpdates({autoUpdater,version,lang,busy,ask,restart,log,after=setTimeout,every=setInterval,env=process.env}){
 const t=TEXT[lang]||TEXT.fr;
 let working=false,manual=false,downloaded=false,offered=false,release='';
 const info=(message,detail)=>Promise.resolve(ask({kind:'info',message,detail,buttons:[t.ok]})).catch(log);
 const isBusy=async()=>{try{return Boolean(await busy());}catch{return true;}}; // Unknown counts as busy: a render must never be cut.
 async function offer(){
  if(await isBusy()){after(offer,RETRY);return;}
  try{
   const choice=await ask({kind:'ready',message:t.ready,detail:t.readyDetail(release),buttons:t.ready2});
   if(choice!==0)return;
   if(await isBusy()){after(offer,RETRY);return;} // Work started while the question was open.
   restart();
  }catch(error){log(error);}
 }
 function check(asked=false){
  if(downloaded){if(asked)void offer();return;}
  if(working){manual=manual||asked;return;} // Two checks at once would download twice.
  working=true;manual=asked;
  try{autoUpdater.checkForUpdates();}catch(error){fail(error);}
 }
 function fail(error){
  log(error);working=false;
  if(manual){manual=false;void info(t.failed,t.failedDetail);}
 }
 autoUpdater.on('error',fail);
 autoUpdater.on('update-not-available',()=>{working=false;if(manual){manual=false;void info(t.latest);}});
 autoUpdater.on('update-available',()=>{if(manual){manual=false;void info(t.downloading,t.downloadingDetail);}}); // Still working until downloaded.
 autoUpdater.on('update-downloaded',(_event,_notes,name)=>{
  working=false;downloaded=true;release=name||release;
  if(offered)return;offered=true;void offer(); // Answering "later" is final for this session.
 });
 try{autoUpdater.setFeedURL({url:feedUrl(version,env)});}catch(error){log(error);return {check(){}};}
 after(()=>check(),FIRST_CHECK);every(()=>check(),EVERY);
 return {check};
}
module.exports={canCheck,feedUrl,startUpdates};
