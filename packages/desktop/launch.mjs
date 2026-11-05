import {spawn,execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import {existsSync,mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
const here=dirname(fileURLToPath(import.meta.url)),root=join(here,'../..'),require=createRequire(import.meta.url);
if(Number(process.versions.node.split('.')[0])<24)throw Error('Node 24 or later is required for this development prototype.');
if(!existsSync(join(root,'packages/web/dist/index.html')))execFileSync(process.execPath,[join(root,'node_modules/vite/bin/vite.js'),'build'],{cwd:join(root,'packages/web'),stdio:'inherit'});
const env={...process.env,ADAM_DESKTOP_NODE:process.execPath};delete env.ELECTRON_RUN_AS_NODE;
if(process.argv.includes('--smoke-test')){
 const dir=mkdtempSync(join(tmpdir(),'adam-desktop-smoke-'));env.ADAM_DESKTOP_DATA=dir;env.ADAM_DESKTOP_SETTINGS=join(dir,'ui.json');env.ADAM_DESKTOP_SMOKE='1';
 writeFileSync(env.ADAM_DESKTOP_SETTINGS,JSON.stringify({projectsRoot:join(dir,'projects'),lang:'fr'}));
 writeFileSync(join(dir,'onboarding.json'),JSON.stringify({completed:true}));
}
const child=spawn(require('electron'),[here,...process.argv.slice(2)],{cwd:root,env,stdio:'inherit',windowsHide:process.argv.includes('--smoke-test')});
child.on('error',e=>{console.error(e);process.exitCode=1;});child.on('exit',code=>{process.exitCode=code??1;});
