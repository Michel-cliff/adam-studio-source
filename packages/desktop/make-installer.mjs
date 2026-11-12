import {createRequire} from 'node:module';import {dirname,join} from 'node:path';import {fileURLToPath} from 'node:url';import {copyFileSync,existsSync,linkSync,mkdirSync,createReadStream,readFileSync,readdirSync,rmSync,writeFileSync} from 'node:fs';import {createHash} from 'node:crypto';
const here=dirname(fileURLToPath(import.meta.url)),require=createRequire(import.meta.url),{createWindowsInstaller}=require('electron-winstaller');
// npm installations with lifecycle scripts disabled still need the host 7-Zip helper.
const installerRoot=dirname(require.resolve('electron-winstaller/package.json'));
if(!existsSync(join(installerRoot,'vendor/7z.exe'))||!existsSync(join(installerRoot,'vendor/7z.dll'))){
 const {execFileSync}=await import('node:child_process');
 execFileSync(process.execPath,[join(installerRoot,'script/select-7z-arch.js')],{cwd:installerRoot,stdio:'inherit',windowsHide:true});
}
// The app sets its own icon when it installs (main.cjs): the package names no remote one, which would be downloaded.
const nuspec=join(installerRoot,'template.nuspectemplate'),template=readFileSync(nuspec,'utf8'),noIcon=template.replace(/\s*<iconUrl>.*<\/iconUrl>/,'');
if(noIcon!==template)writeFileSync(nuspec,noIcon);
const appDirectory=join(here,'out/AdamStudio-win32-x64'),outputDirectory=join(here,'out/make/squirrel.windows/x64');
const {execFileSync}=await import('node:child_process');
const signer=process.env.ADAM_WINDOWS_SIGN_THUMBPRINT;
if(signer && !/^[a-f0-9]{40}$/i.test(signer))throw Error('Invalid Windows signing certificate thumbprint.');
if(process.env.ADAM_RELEASE_BUILD==='1' && !signer)throw Error('Production releases require ADAM_WINDOWS_SIGN_THUMBPRINT.');
const signArgs=signer?['/sha1',signer,'/fd','SHA256','/tr','https://timestamp.digicert.com','/td','SHA256']:null;
const signTool=process.env.ADAM_SIGNTOOL||'signtool.exe';
const sign=file=>execFileSync(signTool,['sign',...signArgs,file],{stdio:'inherit',windowsHide:true});
const verify=file=>execFileSync(signTool,['verify','/pa',file],{stdio:'inherit',windowsHide:true});
const payload=join(appDirectory,'resources/payload');
if(!existsSync(join(payload,'runtime.json')))throw Error('Run the package step first.');
const packagedVersion=tool=>execFileSync(join(payload,tool),['--version'],{encoding:'utf8',windowsHide:true}).trim();
if(process.env.ADAM_RELEASE_BUILD==='1'){
 const python=packagedVersion('python/python.exe').match(/^Python 3\.12\.(\d+)$/);
 const node=packagedVersion('bin/node.exe').match(/^v24\.(\d+)\.(\d+)$/);
 if(!python||Number(python[1])<16)throw Error('Use Python 3.12.16 or newer in ADAM_PYTHON_BASE for the release build.');
 if(!node||Number(node[1])*1000+Number(node[2])<22002)throw Error('Use Node.js 24.22.2 or newer on the Node.js 24 LTS line for the release build.');
}
mkdirSync(outputDirectory,{recursive:true});
// The app directory is a disposable build artifact. Avoid a second full copy of the Python runtime.
if(signArgs){const exe=join(appDirectory,'AdamStudio.exe');sign(exe);verify(exe);}
await createWindowsInstaller({...(signArgs?{signWithParams:signArgs.join(' ')}:{}),appDirectory,outputDirectory,name:'AdamStudio',title:'Adam Studio',authors:'Michel-Cliff',description:'Adam Studio : création et montage vidéo assistés',exe:'AdamStudio.exe',setupExe:'AdamStudio-Setup.exe',setupIcon:join(here,'assets/adam.ico'),loadingGif:join(here,'assets/install.gif'),noMsi:true});
const file=join(outputDirectory,'AdamStudio-Setup.exe');if(!existsSync(file))throw Error('Setup was not produced');
if(signArgs)verify(file);
async function sha256(path){
 const digest=createHash('sha256');
 for await(const chunk of createReadStream(path))digest.update(chunk);
 return digest.digest('hex');
}
console.log('WINDOWS_INSTALLER_READY '+file);
// The file people download: the installer and how to get past the first screens.
const version=JSON.parse(readFileSync(join(here,'package.json'),'utf8')).version,zipName=`AdamStudio-${version}-Windows.zip`,zip=join(outputDirectory,zipName);
copyFileSync(join(here,'LISEZMOI.txt'),join(outputDirectory,'LISEZMOI.txt'));rmSync(zip,{force:true});
// People open a small launcher that answers at once and refuses a second run: Setup itself shows nothing for a minute or two.
const windows=process.env.SystemRoot||'C:\\Windows',staging=join(outputDirectory,'zip-staging');
rmSync(staging,{recursive:true,force:true});mkdirSync(join(staging,'fichiers'),{recursive:true});
execFileSync(join(windows,'Microsoft.NET/Framework64/v4.0.30319/csc.exe'),['-nologo','-target:winexe','-codepage:65001','-utf8output',`-win32icon:${join(here,'assets/adam.ico')}`,'-r:System.Windows.Forms.dll','-r:System.Drawing.dll','-r:System.Core.dll',`-out:${join(staging,'Installer Adam Studio.exe')}`,join(here,'installer-launcher.cs')],{stdio:'inherit',windowsHide:true});
if(signArgs){const launcher=join(staging,'Installer Adam Studio.exe');sign(launcher);verify(launcher);}
copyFileSync(join(here,'LISEZMOI.txt'),join(staging,'LISEZMOI.txt'));linkSync(file,join(staging,'fichiers/AdamStudio-Setup.exe'));
execFileSync(join(windows,'System32/tar.exe'),['-a','-c','-f',zip,'Installer Adam Studio.exe','LISEZMOI.txt','fichiers'],{cwd:staging,stdio:'inherit',windowsHide:true});
rmSync(staging,{recursive:true,force:true});
const packageNames = new Set([`AdamStudio-${version}-full.nupkg`, `AdamStudio-${version}-delta.nupkg`]);
const names = ['AdamStudio-Setup.exe', zipName, ...readdirSync(outputDirectory).filter(name => packageNames.has(name))];
const sums = [];
for (const name of names) sums.push(`${await sha256(join(outputDirectory, name))}  ${name}`);
writeFileSync(join(outputDirectory,'SHA256SUMS.txt'),sums.join('\n')+'\n');
// The RELEASES to publish. The one beside the packages stays as Squirrel wrote it: the next build needs it to make its delta.
const {releasesForFeed}=require('./updates.cjs');
mkdirSync(join(outputDirectory,'github'),{recursive:true});writeFileSync(join(outputDirectory,'github/RELEASES'),releasesForFeed(readFileSync(join(outputDirectory,'RELEASES'),'utf8'),version));
console.log('WINDOWS_ZIP_READY '+zip);
