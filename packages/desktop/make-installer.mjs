import {createRequire} from 'node:module';import {dirname,join} from 'node:path';import {fileURLToPath} from 'node:url';import {existsSync,mkdirSync,createReadStream,writeFileSync} from 'node:fs';import {createHash} from 'node:crypto';
const here=dirname(fileURLToPath(import.meta.url)),require=createRequire(import.meta.url),{createWindowsInstaller}=require('electron-winstaller');
// npm installations with lifecycle scripts disabled still need the host 7-Zip helper.
const installerRoot=dirname(require.resolve('electron-winstaller/package.json'));
if(!existsSync(join(installerRoot,'vendor/7z.exe'))||!existsSync(join(installerRoot,'vendor/7z.dll'))){
 const {execFileSync}=await import('node:child_process');
 execFileSync(process.execPath,[join(installerRoot,'script/select-7z-arch.js')],{cwd:installerRoot,stdio:'inherit',windowsHide:true});
}
const appDirectory=join(here,'out/AdamStudio-win32-x64'),outputDirectory=join(here,'out/make/squirrel.windows/x64');
if(!existsSync(join(appDirectory,'resources/payload/runtime.json')))throw Error('Run the package step first.');
mkdirSync(outputDirectory,{recursive:true});
// The app directory is a disposable build artifact. Avoid a second full copy of the Python runtime.
await createWindowsInstaller({appDirectory,outputDirectory,name:'AdamStudio',title:'Adam Studio',authors:'Michel-Cliff',description:'Adam Studio — création et montage vidéo assistés',exe:'AdamStudio.exe',iconUrl:'',setupExe:'AdamStudio-Setup.exe',setupIcon:join(here,'assets/adam.ico'),noMsi:true});
const file=join(outputDirectory,'AdamStudio-Setup.exe');if(!existsSync(file))throw Error('Setup was not produced');
const digest=createHash('sha256');for await(const chunk of createReadStream(file))digest.update(chunk);const hash=digest.digest('hex');writeFileSync(join(outputDirectory,'SHA256SUMS.txt'),hash+'  AdamStudio-Setup.exe\n');
console.log('WINDOWS_INSTALLER_READY '+file);
