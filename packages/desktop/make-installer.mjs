import {createRequire} from 'node:module';import {dirname,join} from 'node:path';import {fileURLToPath} from 'node:url';import {copyFileSync,existsSync,mkdirSync,createReadStream,readFileSync,rmSync,writeFileSync} from 'node:fs';import {createHash} from 'node:crypto';
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
if(!existsSync(join(appDirectory,'resources/payload/runtime.json')))throw Error('Run the package step first.');
mkdirSync(outputDirectory,{recursive:true});
// The app directory is a disposable build artifact. Avoid a second full copy of the Python runtime.
await createWindowsInstaller({appDirectory,outputDirectory,name:'AdamStudio',title:'Adam Studio',authors:'Michel-Cliff',description:'Adam Studio : création et montage vidéo assistés',exe:'AdamStudio.exe',setupExe:'AdamStudio-Setup.exe',setupIcon:join(here,'assets/adam.ico'),noMsi:true});
const file=join(outputDirectory,'AdamStudio-Setup.exe');if(!existsSync(file))throw Error('Setup was not produced');
const digest=createHash('sha256');for await(const chunk of createReadStream(file))digest.update(chunk);const hash=digest.digest('hex');writeFileSync(join(outputDirectory,'SHA256SUMS.txt'),hash+'  AdamStudio-Setup.exe\n');
console.log('WINDOWS_INSTALLER_READY '+file);
// The file people download: the installer and how to get past the first screens.
const {execFileSync}=await import('node:child_process');
const version=JSON.parse(readFileSync(join(here,'package.json'),'utf8')).version,zipName=`AdamStudio-${version}-Windows.zip`,zip=join(outputDirectory,zipName);
copyFileSync(join(here,'LISEZMOI.txt'),join(outputDirectory,'LISEZMOI.txt'));rmSync(zip,{force:true});
execFileSync(join(process.env.SystemRoot||'C:\\Windows','System32/tar.exe'),['-a','-c','-f',zipName,'AdamStudio-Setup.exe','LISEZMOI.txt'],{cwd:outputDirectory,stdio:'inherit',windowsHide:true});
const zipDigest=createHash('sha256');for await(const chunk of createReadStream(zip))zipDigest.update(chunk);
writeFileSync(join(outputDirectory,'SHA256SUMS.txt'),`${hash}  AdamStudio-Setup.exe\n${zipDigest.digest('hex')}  ${zipName}\n`);
console.log('WINDOWS_ZIP_READY '+zip);
