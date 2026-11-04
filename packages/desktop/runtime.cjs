const {join,dirname,resolve,relative,isAbsolute}=require('node:path');const {readFileSync,existsSync,mkdirSync,readdirSync,statSync,cpSync}=require('node:fs');
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
 const torchScore=folder=>Number(size(join(folder,'hub/PeterL1n_RobustVideoMatting_master/hubconf.py'))>0&&size(join(folder,'hub/checkpoints/rvm_mobilenetv3.pth'))>1000000)+Number(size(join(folder,'hub/checkpoints/big-lama.pt'))>1000000);
 const torch=torchCandidates.reduce((best,folder)=>torchScore(folder)>torchScore(best)?folder:best,torchDefault);
 const skillSource=join(root,'skills/adam-studio'),skillHome=originalEnv.USERPROFILE||originalEnv.HOME||require('node:os').homedir();
 const skillTarget=join(originalEnv.CLAUDE_CONFIG_DIR||join(skillHome,'.claude'),'skills/adam-studio');
 if(existsSync(join(skillSource,'SKILL.md'))&&!existsSync(join(skillTarget,'SKILL.md'))){mkdirSync(dirname(skillTarget),{recursive:true});cpSync(skillSource,skillTarget,{recursive:true,force:false,errorOnExist:true});}
 const env={...originalEnv,ADAM_APP_ROOT:root,ADAM_PACKAGED:'1',ADAM_TOOLS:tools,ADAM_ANALYSIS_PYTHON:python,ADAM_CAPCUT_PYTHON:python,ADAM_BROWSER_EXECUTABLE:browser,ADAM_CACHE_DIR:cache,ADAM_NODE:node,PYTHONNOUSERSITE:'1',PYTHONDONTWRITEBYTECODE:'1',HF_HOME:hf,TORCH_HOME:torch,XDG_CACHE_HOME:cache};
 const key=Object.keys(env).find(k=>k.toLowerCase()==='path')||'PATH';env[key]=[dirname(node),dirname(python),tools,env[key]||''].join(';');delete env.PYTHONHOME;delete env.PYTHONPATH;delete env.ELECTRON_RUN_AS_NODE;
 return {root,node,env};
}
module.exports={packagedRuntime};
