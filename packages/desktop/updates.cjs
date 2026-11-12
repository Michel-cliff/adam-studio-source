// Automatic updates of the installed app (Squirrel, through Electron's free feed for public GitHub releases).
// Everything that touches Electron or time is passed in, so the rules below can be tested without an installed app.
const OWNER_REPO='Michel-cliff/adam-studio-releases';
const FIRST_CHECK=15000,EVERY=6*60*60*1000,RETRY=60000;
const TEXT={
 fr:{ready:'Une mise à jour d’Adam Studio est prête.',readyDetail:v=>`${v?`Version ${v}. `:''}Tes projets ne changent pas. Si tu préfères attendre, elle s’installera au prochain démarrage.`,ready2:['Redémarrer maintenant','Plus tard'],latest:'Tu as la dernière version d’Adam Studio.',downloading:'Une mise à jour se télécharge.',downloadingDetail:'Elle peut prendre plusieurs minutes. Adam Studio te préviendra quand elle sera prête. Tu peux aussi le fermer : elle se terminera toute seule.',failed:'Impossible de vérifier les mises à jour.',failedDetail:'Vérifie ta connexion internet, puis réessaie.',ok:'OK'},
 en:{ready:'An Adam Studio update is ready.',readyDetail:v=>`${v?`Version ${v}. `:''}Your projects do not change. If you would rather wait, it installs at the next start.`,ready2:['Restart now','Later'],latest:'You have the latest version of Adam Studio.',downloading:'An update is downloading.',downloadingDetail:'This can take several minutes. Adam Studio will tell you when it is ready. You can also close it: the update finishes by itself.',failed:'Could not check for updates.',failedDetail:'Check your internet connection, then try again.',ok:'OK'},
};
const canCheck=({packaged,smoke,argv})=>Boolean(packaged&&!smoke&&!argv.includes('--squirrel-firstrun'));
const feedUrl=(version,env={})=>env.ADAM_UPDATE_FEED||`https://update.electronjs.org/${OWNER_REPO}/win32-x64/${version}`;
function startUpdates({autoUpdater,version,lang,busy,ask,restart,log,closing=()=>false,onState=()=>{},after=setTimeout,every=setInterval,env={}}){
 const t=TEXT[lang]||TEXT.fr;
 let working=false,manual=false,downloaded=false,offered=false,release='',downloading=false;
 const setDownloading=value=>{if(downloading===value)return;downloading=value;onState(value);};
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
  if(working){if(asked&&downloading)void info(t.downloading,t.downloadingDetail);else manual=manual||asked;return;} // Two checks at once would download twice.
  working=true;manual=asked;
  try{autoUpdater.checkForUpdates();}catch(error){fail(error);}
 }
 function fail(error){
  log(error);working=false;setDownloading(false);
  if(manual){manual=false;void info(t.failed,t.failedDetail);}
 }
 autoUpdater.on('error',fail);
 autoUpdater.on('update-not-available',()=>{working=false;if(manual){manual=false;void info(t.latest);}});
 autoUpdater.on('update-available',()=>{setDownloading(true);if(manual){manual=false;void info(t.downloading,t.downloadingDetail);}}); // Still working until downloaded.
 autoUpdater.on('update-downloaded',(_event,_notes,name)=>{
  working=false;downloaded=true;release=name||release;
  const away=closing(); // Read first: the end of the download is what lets a hidden app close.
  setDownloading(false);
  if(away||offered)return;offered=true;void offer(); // Answering "later" is final for this session.
 });
 try{autoUpdater.setFeedURL({url:feedUrl(version,env)});}catch(error){log(error);return {check(){},downloading:()=>false};}
 after(()=>check(),FIRST_CHECK);every(()=>check(),EVERY);
 return {check,downloading:()=>downloading};
}
// The RELEASES file to publish. update.electronjs.org completes only the first package name it finds and answers with JSON
// for any other path, so the first stays a plain name (a full address there would be broken by it) and the others are complete.
function releasesForFeed(text,version,ownerRepo=OWNER_REPO){
 const lines=text.replace(/^﻿/,'').split(/\r?\n/).filter(line=>line.includes(`AdamStudio-${version}-`));
 if(!lines.length)throw Error(`RELEASES has no package for ${version}`);
 const base=`https://github.com/${ownerRepo}/releases/download/v${version}/`;
 return lines.sort((a,b)=>Number(b.includes('-full.'))-Number(a.includes('-full.'))).map((line,index)=>index?line.replace(/(\S+\.nupkg)/,base+'$1'):line).join('\n');
}
module.exports={canCheck,feedUrl,startUpdates,releasesForFeed};
