const {join,dirname,resolve,relative,isAbsolute}=require('node:path');const {readFileSync,writeFileSync,existsSync,mkdirSync,readdirSync,statSync,cpSync,rmSync}=require('node:fs');const {createHash}=require('node:crypto');
function folderHash(dir){
 const hash=createHash('sha256');
 const walk=(at,rel)=>{for(const name of readdirSync(at).sort()){const full=join(at,name),path=rel+'/'+name;if(statSync(full).isDirectory())walk(full,path);else{hash.update(path+'\0');hash.update(readFileSync(full));hash.update('\0');}}};
 walk(dir,'');return hash.digest('hex');
}
// The skill follows the app through updates, unless the creator changed it or brought their own: what was installed is remembered by its hash.
function installSkill(source,target,memory){
 if(!existsSync(join(source,'SKILL.md')))return;
 const bundled=folderHash(source),remember=()=>writeFileSync(memory,JSON.stringify({hash:bundled}));
 let installed='';try{installed=JSON.parse(readFileSync(memory,'utf8')).hash||'';}catch{}
 const copy=()=>{mkdirSync(dirname(target),{recursive:true});cpSync(source,target,{recursive:true,force:true});remember();};
 if(!existsSync(join(target,'SKILL.md')))return copy();
 const current=folderHash(target);
 if(current===bundled)return remember();
 if(current===installed){rmSync(target,{recursive:true,force:true});copy();}
}
function packagedRuntime(resources,userData,originalEnv=process.env){
 const root=join(resources,'payload'),manifest=JSON.parse(readFileSync(join(root,'runtime.json'),'utf8'));
 const locate=value=>{if(typeof value!=='string'||isAbsolute(value)||relative(root,resolve(root,value)).startsWith('..'))throw Error('Chemin de moteur invalide');return resolve(root,value);};
 const node=locate(manifest.node),python=locate(manifest.python),browser=locate(manifest.browser);
 for(const p of [node,python,browser,join(root,'packages/desktop/backend.ts')])if(!existsSync(p))throw Error('Installation incomplète : '+p);
 const tools=join(userData,'tools'),cache=join(userData,'cache');mkdirSync(tools,{recursive:true});mkdirSync(cache,{recursive:true});
 const size=p=>{try{return statSync(p).size;}catch{return 0;}};
 const list=p=>{try{return readdirSync(p);}catch{return [];}};
 const host=originalEnv.ADAM_HOST_HOME||originalEnv.USERPROFILE||originalEnv.HOME||'';
 const hostApp=originalEnv.ADAM_HOST_APPDATA||originalEnv.APPDATA||'';
 const hfDefault=join(userData,'models/huggingface'),torchDefault=join(userData,'models/torch');
 const hfCandidates=[hfDefault,originalEnv.HF_HOME,originalEnv.ADAM_HOST_HF_HOME,host&&join(host,'.cache/huggingface'),hostApp&&join(hostApp,'Adam Studio/models/huggingface')].filter(Boolean);
 const hfReady=folder=>list(join(folder,'hub/models--mobiuslabsgmbh--faster-whisper-large-v3-turbo/snapshots')).some(name=>size(join(folder,'hub/models--mobiuslabsgmbh--faster-whisper-large-v3-turbo/snapshots',name,'model.bin'))>1000000&&size(join(folder,'hub/models--mobiuslabsgmbh--faster-whisper-large-v3-turbo/snapshots',name,'config.json'))>0);
 const hf=hfCandidates.find(hfReady)||hfDefault;
 const torchCandidates=[torchDefault,originalEnv.TORCH_HOME,originalEnv.ADAM_HOST_TORCH_HOME,host&&join(host,'.cache/torch'),hostApp&&join(hostApp,'Adam Studio/models/torch')].filter(Boolean);
 const torchScore=folder=>Number(size(join(folder,'hub/PeterL1n_RobustVideoMatting_53d74c6826735f01f4406b5ca9075eee27bec094/hubconf.py'))>0&&size(join(folder,'hub/checkpoints/rvm_mobilenetv3.pth'))>1000000)+Number(size(join(folder,'hub/checkpoints/big-lama.pt'))>1000000);
 const torch=torchCandidates.reduce((best,folder)=>torchScore(folder)>torchScore(best)?folder:best,torchDefault);
 const skillSource=join(root,'skills/adam-studio'),skillHome=originalEnv.USERPROFILE||originalEnv.HOME||require('node:os').homedir();
 const skillTarget=join(originalEnv.CLAUDE_CONFIG_DIR||join(skillHome,'.claude'),'skills/adam-studio');
 try{installSkill(skillSource,skillTarget,join(userData,'skill-installed.json'));}catch(error){console.error('Skill:',error.message);}
 // House fonts: copied once where projects can keep pointing at them, whatever the version installed.
 const fontsTarget=join(userData,'fonts'),bundledFonts=join(root,'fonts');mkdirSync(fontsTarget,{recursive:true});
 for(const name of list(bundledFonts)){const to=join(fontsTarget,name);if(!existsSync(to))cpSync(join(bundledFonts,name),to);}
 const env={...originalEnv,ADAM_FONTS:fontsTarget,ADAM_CAPCUT_LAB:join(root,'capcut-lab'),ADAM_APP_ROOT:root,ADAM_PACKAGED:'1',ADAM_TOOLS:tools,ADAM_ANALYSIS_PYTHON:python,ADAM_CAPCUT_PYTHON:python,ADAM_BROWSER_EXECUTABLE:browser,ADAM_CACHE_DIR:cache,ADAM_NODE:node,PYTHONNOUSERSITE:'1',PYTHONDONTWRITEBYTECODE:'1',HF_HOME:hf,TORCH_HOME:torch,XDG_CACHE_HOME:cache};
 const key=Object.keys(env).find(k=>k.toLowerCase()==='path')||'PATH';env[key]=[dirname(node),dirname(python),tools,env[key]||''].join(';');delete env.PYTHONHOME;delete env.PYTHONPATH;delete env.ELECTRON_RUN_AS_NODE;
 return {root,node,env};
}
module.exports={packagedRuntime};
