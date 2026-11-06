const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs'),os=require('node:os'),path=require('node:path');const {packagedRuntime}=require('./runtime.cjs');
function fixture(){const root=fs.mkdtempSync(path.join(os.tmpdir(),'adam-runtime-test-'));const payload=path.join(root,'payload');for(const name of ['bin/node.exe','python/python.exe','browser/chrome.exe','packages/desktop/backend.ts']){const p=path.join(payload,name);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,'fixture');}fs.writeFileSync(path.join(payload,'runtime.json'),JSON.stringify({node:'bin/node.exe',python:'python/python.exe',browser:'browser/chrome.exe'}));return root;}
test('packaged runtime chooses only bundled engines and writable user caches',()=>{const resources=fixture(),data=path.join(resources,'user');const r=packagedRuntime(resources,data,{Path:'C:\\old',PYTHONHOME:'C:\\host-python',PYTHONPATH:'C:\\private',ELECTRON_RUN_AS_NODE:'1'});assert.equal(r.node,path.join(resources,'payload/bin/node.exe'));assert.equal(r.env.ADAM_ANALYSIS_PYTHON,path.join(resources,'payload/python/python.exe'));assert.equal(r.env.PYTHONHOME,undefined);assert.equal(r.env.ELECTRON_RUN_AS_NODE,undefined);assert(r.env.Path.startsWith(path.join(resources,'payload/bin')));assert(r.env.HF_HOME.startsWith(data));assert(r.env.ADAM_TOOLS.startsWith(data));});
test('an incomplete installed runtime fails before launching a host fallback',()=>{const resources=fixture();fs.unlinkSync(path.join(resources,'payload/python/python.exe'));assert.throws(()=>packagedRuntime(resources,path.join(resources,'user')),/Installation incomplète/);});
test('a manifest cannot select an executable outside the installed payload',()=>{const resources=fixture();fs.writeFileSync(path.join(resources,'payload/runtime.json'),JSON.stringify({node:'../other.exe',python:'python/python.exe',browser:'browser/chrome.exe'}));assert.throws(()=>packagedRuntime(resources,path.join(resources,'user')),/Chemin de moteur invalide/);});

test('reuse complete host model caches without importing host account data, and stage the bundled skill',()=>{
 const resources=fixture(),host=path.join(resources,'host'),profile=path.join(resources,'empty-profile'),data=path.join(resources,'user');
 const files=[['.cache/huggingface/hub/models--mobiuslabsgmbh--faster-whisper-large-v3-turbo/snapshots/rev/model.bin',1000001],['.cache/huggingface/hub/models--mobiuslabsgmbh--faster-whisper-large-v3-turbo/snapshots/rev/config.json',10],['.cache/torch/hub/PeterL1n_RobustVideoMatting_53d74c6826735f01f4406b5ca9075eee27bec094/hubconf.py',10],['.cache/torch/hub/checkpoints/rvm_mobilenetv3.pth',1000001],['.cache/torch/hub/checkpoints/big-lama.pt',1000001]];
 for(const [name,size]of files){const file=path.join(host,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,Buffer.alloc(size));}
 const source=path.join(resources,'payload/skills/adam-studio');fs.mkdirSync(source,{recursive:true});fs.writeFileSync(path.join(source,'SKILL.md'),'bundled skill');
 const env={USERPROFILE:profile,HOME:profile,ADAM_HOST_HOME:host,CODEX_HOME:path.join(profile,'.codex')};
 const r=packagedRuntime(resources,data,env);
 assert.equal(r.env.HF_HOME,path.join(host,'.cache/huggingface'));assert.equal(r.env.TORCH_HOME,path.join(host,'.cache/torch'));
 assert.equal(r.env.USERPROFILE,profile);assert.equal(r.env.CODEX_HOME,env.CODEX_HOME);
 const skill=path.join(profile,'.claude/skills/adam-studio/SKILL.md');assert.equal(fs.readFileSync(skill,'utf8'),'bundled skill');
 fs.writeFileSync(skill,'custom skill');packagedRuntime(resources,data,env);assert.equal(fs.readFileSync(skill,'utf8'),'custom skill');
});
test('empty or partial host model caches do not suppress a required download',()=>{
 const resources=fixture(),host=path.join(resources,'host'),data=path.join(resources,'user');
 const snapshot=path.join(host,'.cache/huggingface/hub/models--mobiuslabsgmbh--faster-whisper-large-v3-turbo/snapshots/rev');fs.mkdirSync(snapshot,{recursive:true});fs.writeFileSync(path.join(snapshot,'model.bin'),'');
 const r=packagedRuntime(resources,data,{ADAM_HOST_HOME:host});assert.equal(r.env.HF_HOME,path.join(data,'models/huggingface'));
});

test('the bundled fonts land in a folder that survives updates, and a font already there is kept',()=>{
 const resources=fixture(),data=path.join(resources,'user'),fonts=path.join(resources,'payload/fonts');
 fs.mkdirSync(fonts,{recursive:true});fs.writeFileSync(path.join(fonts,'Anton-Regular.ttf'),'bundled');
 const r=packagedRuntime(resources,data,{});
 assert.equal(r.env.ADAM_FONTS,path.join(data,'fonts'));
 const file=path.join(data,'fonts/Anton-Regular.ttf');assert.equal(fs.readFileSync(file,'utf8'),'bundled');
 fs.writeFileSync(file,'kept');packagedRuntime(resources,data,{});assert.equal(fs.readFileSync(file,'utf8'),'kept');
});
test('the CapCut export uses the bundled library, never a folder of the machine',()=>{
 const resources=fixture(),data=path.join(resources,'user');
 const r=packagedRuntime(resources,data,{ADAM_CAPCUT_LAB:'C:\\elsewhere'});
 assert.equal(r.env.ADAM_CAPCUT_LAB,path.join(resources,'payload/capcut-lab'));
});

test('an update refreshes the skill it installed, but never one the creator changed or brought',()=>{
 const resources=fixture(),profile=path.join(resources,'p'),data=path.join(resources,'user');
 const source=path.join(resources,'payload/skills/adam-studio');fs.mkdirSync(source,{recursive:true});fs.writeFileSync(path.join(source,'SKILL.md'),'v1');
 const env={USERPROFILE:profile,HOME:profile},skill=path.join(profile,'.claude/skills/adam-studio/SKILL.md');
 packagedRuntime(resources,data,env);assert.equal(fs.readFileSync(skill,'utf8'),'v1');
 fs.writeFileSync(path.join(source,'SKILL.md'),'v2');packagedRuntime(resources,data,env);assert.equal(fs.readFileSync(skill,'utf8'),'v2');
 fs.writeFileSync(skill,'mine');fs.writeFileSync(path.join(source,'SKILL.md'),'v3');packagedRuntime(resources,data,env);assert.equal(fs.readFileSync(skill,'utf8'),'mine');
});
