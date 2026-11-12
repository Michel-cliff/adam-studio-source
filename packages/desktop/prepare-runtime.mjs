import {cpSync,existsSync,mkdirSync,readFileSync,writeFileSync,readdirSync,statSync,realpathSync,rmSync} from 'node:fs';
import {dirname,join,resolve,relative,sep,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'../..'),payload=join(here,'.build','payload');
if(process.platform!=='win32'||process.arch!=='x64')throw Error('This build target requires Windows x64.');
const {version:appVersion}=JSON.parse(readFileSync(join(here,'package.json'),'utf8'));if(!JSON.parse(readFileSync(join(here,'whats-new.json'),'utf8'))[appVersion])throw Error(`No notes for ${appVersion} in whats-new.json: write what changed for the creators`);
if(!payload.startsWith(here+sep)||basename(payload)!=='payload')throw Error('Unsafe build target');
const repair=process.argv.includes('--repair-python');
if(!repair&&existsSync(payload))rmSync(payload,{recursive:true,force:true});mkdirSync(payload,{recursive:true});
const bin=join(payload,'bin');let notices=repair?JSON.parse(readFileSync(join(payload,'third-party-packages.json'),'utf8')):[];
const excluded=new Set(['.git','.venv','__pycache__','tests','test','.pytest_cache','.mypy_cache','.vitest-cache']);
const filter=p=>!p.split(/[\\/]/).some(n=>excluded.has(n)||n.startsWith('.env')||n.startsWith('__editable__'))&&!/\.(pyc|pyo)$|direct_url\.json$/.test(p);
const copy=(from,to)=>{mkdirSync(dirname(to),{recursive:true});cpSync(from,to,{recursive:true,dereference:true,filter:p=>filter(relative(from,p))&&!(basename(from)==='torch'&&relative(from,p).split(sep)[0]==='include')});};
if(!repair){
console.log('Preparing application code');
const names=['model','render','library','web','mcp'];
for(const name of names){const target=join(payload,'packages',name);mkdirSync(target,{recursive:true});const pkg=JSON.parse(readFileSync(join(root,'packages',name,'package.json')));delete pkg.devDependencies;delete pkg.scripts;writeFileSync(join(target,'package.json'),JSON.stringify(pkg));for(const folder of ['src','server','app','schema']){const from=join(root,'packages',name,folder);if(existsSync(from))copy(from,join(target,folder));}}
copy(join(root,'packages/web/dist'),join(payload,'packages/web/dist'));
// Public DA references and tutorial rushes are deliberately absent from this allowlist. dist/da is the local copy of
// third-party art-direction images (gitignored, the interface falls back to flat colours): never shipped.
for(const path of ['packages/web/app/public','packages/web/demo','packages/web/dist/da'])if(existsSync(join(payload,path)))rmSync(join(payload,path),{recursive:true,force:true});
mkdirSync(join(payload,'packages/desktop'),{recursive:true});copy(join(here,'backend.ts'),join(payload,'packages/desktop/backend.ts'));writeFileSync(join(payload,'packages/desktop/package.json'),JSON.stringify({type:'module'}));
copy(join(root,'skills/adam-studio'),join(payload,'skills/adam-studio'));copy(join(root,'py/analysis/adam_analysis'),join(payload,'py/analysis/adam_analysis'));copy(join(root,'py/capcut/adam_capcut'),join(payload,'py/capcut/adam_capcut'));
writeFileSync(join(payload,'package.json'),JSON.stringify({name:'adam-studio-runtime',version:'0.1.0',private:true,type:'module'}));
console.log('Preparing production Node dependencies');
const lock=JSON.parse(readFileSync(join(root,'package-lock.json'),'utf8'));
for(const [path,pkg]of Object.entries(lock.packages)){
 if(!path.startsWith('node_modules/')||pkg.dev||pkg.link||pkg.os&&!pkg.os.includes('win32')||pkg.cpu&&!pkg.cpu.includes('x64'))continue;
 const from=join(root,path);if(!existsSync(from))continue;copy(from,join(payload,path));notices.push({name:pkg.name||path.split('node_modules/').at(-1),version:pkg.version,license:pkg.license||'see package files'});
}
// Physical workspace copies keep Node exports portable; ADAM_APP_ROOT resolves resource paths consistently.
for(const name of names)copy(join(payload,'packages',name),join(payload,'node_modules/@adam-studio',name));
copy(join(root,'node_modules/.remotion'),join(payload,'node_modules/.remotion'));
if(existsSync(join(root,'node_modules/.bin/tsx.cmd'))){mkdirSync(join(payload,'node_modules/.bin'),{recursive:true});for(const name of ['tsx','tsx.cmd','tsx.ps1'])if(existsSync(join(root,'node_modules/.bin',name)))copy(join(root,'node_modules/.bin',name),join(payload,'node_modules/.bin',name));}
console.log('Preparing house fonts and the CapCut library');
const hostFonts=join(process.env.LOCALAPPDATA||'','Microsoft/Windows/Fonts');
mkdirSync(join(payload,'fonts'),{recursive:true});mkdirSync(join(payload,'licenses/fonts'),{recursive:true});
for(const [file,folder]of [['Anton-Regular.ttf','anton'],['DMSerifDisplay-Regular.ttf','dmserifdisplay'],['Manrope-Variable.ttf','manrope']]){
 const from=join(hostFonts,file);if(!existsSync(from))throw Error(`House font missing on this machine: ${file}. Install the fonts with npm run setup.`);
 copy(from,join(payload,'fonts',file));
 const licence=await fetch(`https://raw.githubusercontent.com/google/fonts/main/ofl/${folder}/OFL.txt`);if(!licence.ok)throw Error(`Font licence not found for ${folder}`);
 writeFileSync(join(payload,'licenses/fonts',`${folder}-OFL.txt`),await licence.text());
}
const capcutLab=process.env.ADAM_CAPCUT_LAB||join(process.env.USERPROFILE||'','ClaudeCapcut/VectCutAPI');
for(const name of ['pyJianYingDraft','draft_profiles.py','settings','template','LICENSE']){if(!existsSync(join(capcutLab,name)))throw Error(`CapCut library incomplete: ${name} missing in ${capcutLab}`);copy(join(capcutLab,name),join(payload,'capcut-lab',name));}
// The template carries the folder of the Mac it was made on: the export writes the real one, nothing needs this.
const templateDir = join(payload, 'capcut-lab/template');
const privateTemplateKeys = new Set(['device_id', 'hard_disk_id', 'mac_address', 'draft_fold_path', 'draft_root_path', 'draft_name']);
for (const entry of readdirSync(templateDir, { recursive: true, withFileTypes: true })) {
  if (!entry.isFile() || !/\.(json|bak|tmp)$/i.test(entry.name)) continue;
  const file = join(entry.parentPath, entry.name);
  const raw = readFileSync(file, 'utf8');
  if (!/"(?:device_id|hard_disk_id|mac_address|draft_fold_path|draft_root_path|draft_name)"\s*:/.test(raw)) continue;
  const data = JSON.parse(raw);
  writeFileSync(file, JSON.stringify(data, (key, value) => privateTemplateKeys.has(key) ? '' : value));
}
console.log('Preparing Node and multimedia tools');
mkdirSync(bin,{recursive:true});copy(process.execPath,join(bin,'node.exe'));
const npmRoot=join(dirname(process.execPath),'node_modules/npm');if(!existsSync(npmRoot))throw Error('Build host npm runtime missing');copy(npmRoot,join(bin,'node_modules/npm'));
writeFileSync(join(bin,'npm.cmd'),'@echo off\r\n"%~dp0node.exe" "%~dp0node_modules\\npm\\bin\\npm-cli.js" %*\r\n');
const toolPaths=JSON.parse(execFileSync('powershell.exe',['-NoProfile','-Command',"$x=@{};foreach($n in @('ffmpeg','ffprobe','yt-dlp','deno')){$c=Get-Command $n -ErrorAction Stop;$x[$n]=$c.Source};$x|ConvertTo-Json -Compress"],{encoding:'utf8',windowsHide:true}));
for(const [name,path]of Object.entries(toolPaths)){const actual=realpathSync(path);copy(actual,join(bin,name+'.exe'));for(const dir of [dirname(actual),dirname(dirname(actual))])for(const entry of readdirSync(dir)){if(/^(LICENSE|COPYING|README|NOTICE)/i.test(entry)&&statSync(join(dir,entry)).isFile())copy(join(dir,entry),join(payload,'licenses',name,entry));}}
}
console.log('Preparing relocatable Python runtime');
const analysisPython=join(root,'py/analysis/.venv/Scripts/python.exe');
const runtimePython=process.env.ADAM_PYTHON_BASE?resolve(process.env.ADAM_PYTHON_BASE):analysisPython;
const base=execFileSync(runtimePython,['-I','-c','import sys; assert sys.version_info[:2] == (3, 12); print(sys.base_prefix)'],{encoding:'utf8',windowsHide:true}).trim();const py=join(payload,'python');mkdirSync(py,{recursive:true});
for(const name of readdirSync(base)){if(/^(python.*\.exe|[^\\/]+\.dll|LICENSE(?:\.txt)?)$/i.test(name))copy(join(base,name),join(py,name));}
copy(join(base,'DLLs'),join(py,'DLLs'));
cpSync(join(base,'Lib'),join(py,'Lib'),{recursive:true,filter:p=>filter(p)&&!relative(join(base,'Lib'),p).split(sep).includes('site-packages')});
const site=join(py,'Lib/site-packages');mkdirSync(site,{recursive:true});
// Application modules come from the source tree. Do not retain stale wheel metadata from the host venv.
const isAppMetadata=entry=>/^adam_(analysis|capcut)-[^\\/]+\.dist-info$/.test(entry);
for(const entry of readdirSync(site).filter(isAppMetadata))rmSync(join(site,entry),{recursive:true,force:true});
for(const env of ['analysis','capcut']){const source=join(root,'py',env,'.venv/Lib/site-packages');for(const entry of readdirSync(source)){if(env==='capcut'&&!/^(imageio|PIL|pillow)/i.test(entry))continue;if(entry.endsWith('.pth')||entry.startsWith('__editable__')||isAppMetadata(entry)||excluded.has(entry)||existsSync(join(site,entry)))continue;copy(join(source,entry),join(site,entry));}}
const fixedPython = ['filelock==4.2.10', 'Pillow==13.0.0', 'pip==26.3', 'setuptools==84.1.0'];
const cleanPythonEnv = {...process.env};
delete cleanPythonEnv.PYTHONHOME;
delete cleanPythonEnv.PYTHONPATH;
execFileSync(join(py, 'python.exe'), ['-I', '-m', 'pip', '--isolated', 'install', '--upgrade', '--only-binary=:all:', '--no-deps', ...fixedPython], {
  cwd: payload, env: cleanPythonEnv, stdio: 'inherit', windowsHide: true,
});
for(const name of ['adam_analysis','adam_capcut'])copy(join(payload,'py',name==='adam_analysis'?'analysis':'capcut',name),join(site,name));
writeFileSync(join(payload,'third-party-packages.json'),JSON.stringify(notices,null,2));
// What the tools' own folders do not carry: their licence, and for yt-dlp what its bundled executable is under.
console.log('Preparing third-party notices');
const toolVersion=name=>execFileSync(join(bin,name+'.exe'),['--version'],{encoding:'utf8',windowsHide:true}).split(/\r?\n/)[0].trim();
mkdirSync(join(payload,'licenses/yt-dlp'),{recursive:true});mkdirSync(join(payload,'licenses/deno'),{recursive:true});
copy(join(here,'third-party/yt-dlp-LICENSE.txt'),join(payload,'licenses/yt-dlp/LICENSE-source.txt'));
copy(join(here,'third-party/GPL-3.0.txt'),join(payload,'licenses/yt-dlp/COPYING-GPL-3.0.txt'));
writeFileSync(join(payload,'licenses/yt-dlp/NOTICE.txt'),`yt-dlp ${toolVersion('yt-dlp')}\nThe source code of yt-dlp is under the Unlicense. The standalone executable shipped here bundles GPL components with PyInstaller, and is distributed under the GPL version 3 or later (see COPYING-GPL-3.0.txt).\nSource code: https://github.com/yt-dlp/yt-dlp\n`);
copy(join(here,'third-party/deno-LICENSE.md'),join(payload,'licenses/deno/LICENSE.md'));
writeFileSync(join(payload,'licenses/deno/VERSION.txt'),toolVersion('deno')+'\nSource code: https://github.com/denoland/deno\n');
copy(join(here,'THIRD-PARTY.md'),join(payload,'licenses/THIRD-PARTY.md'));
if(!repair){const missing=execFileSync(process.execPath,[join(here,'make-npm-notices.mjs'),'--check',join(payload,'node_modules')],{encoding:'utf8',windowsHide:true}).trim();if(missing)throw Error('npm packages without a licence file nor a notice (run make-npm-notices.mjs):\n'+missing);}
copy(join(here,'third-party/npm-notices.txt'),join(payload,'licenses/npm-notices.txt'));
copy(join(root,'LICENSE'),join(payload,'licenses/ADAM-STUDIO-LICENSE.txt'));
writeFileSync(join(payload,'BUILD-NOTICE.txt'),'Adam Studio for Windows x64. No user projects, credentials, model caches or private reference media included. Models download on first use. AI accounts are not bundled. Third-party components and their licenses: licenses/THIRD-PARTY.md.\n');
const chrome=find(join(payload,'node_modules/.remotion'),'chrome-headless-shell.exe');if(!chrome)throw Error('Remotion browser missing');
writeFileSync(join(payload,'runtime.json'),JSON.stringify({version:1,node:'bin/node.exe',python:'python/python.exe',browser:relative(payload,chrome)},null,2));
const env={...process.env,PYTHONNOUSERSITE:'1',PYTHONDONTWRITEBYTECODE:'1'};delete env.PYTHONHOME;delete env.PYTHONPATH;
execFileSync(join(py,'python.exe'),['-I','-c','import sys,numpy,torch,cv2,faster_whisper,adam_analysis.models,adam_capcut,imageio,PIL;assert PIL.__version__=="13.0.0",PIL.__version__;print("PACKAGED_PYTHON_OK",sys.prefix)'],{cwd:payload,env,stdio:'inherit',windowsHide:true});
execFileSync(join(py,'python.exe'),['-I','-c','import sys;sys.path.insert(0,sys.argv[1]);import draft_profiles,pyJianYingDraft,pyJianYingDraft.text_segment;p=draft_profiles.get_draft_profile();assert p.name=="capcut_legacy",p.name;print("PACKAGED_CAPCUT_OK",p.name)',join(payload,'capcut-lab')],{cwd:payload,env,stdio:'inherit',windowsHide:true});
for(const dir of ['capcut-lab','capcut-lab/pyJianYingDraft','capcut-lab/settings'])rmSync(join(payload,dir,'__pycache__'),{recursive:true,force:true});
execFileSync(join(bin,'node.exe'),['--version'],{stdio:'inherit',windowsHide:true});execFileSync(join(bin,'ffmpeg.exe'),['-v','error','-version'],{stdio:'pipe',windowsHide:true});
console.log('RUNTIME_READY '+payload);
function find(dir,name){for(const entry of readdirSync(dir,{withFileTypes:true})){const p=join(dir,entry.name);if(entry.name===name)return p;if(entry.isDirectory()){const hit=find(p,name);if(hit)return hit;}}}
