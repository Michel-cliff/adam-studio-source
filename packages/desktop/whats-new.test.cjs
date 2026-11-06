const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {whatsNew,notesFor,newer}=require('./whats-new.cjs');
const notes={'0.1.5':{fr:['cinq'],en:['five']},'0.1.6':{fr:['six'],en:['six en']},'0.1.10':{fr:['dix'],en:['ten']}};
const temp=()=>path.join(fs.mkdtempSync(path.join(os.tmpdir(),'adam-news-')),'seen.json');
const run=(file,version,used=true,lang='fr',all=notes)=>whatsNew({file,version,notes:all,lang,used});
const seen=file=>JSON.parse(fs.readFileSync(file,'utf8')).version;

test('after an update, the notes of the new version, once',()=>{const f=temp();fs.writeFileSync(f,JSON.stringify({version:'0.1.5'}));
 const m=run(f,'0.1.6');assert.match(m.message,/0\.1\.6/);assert.match(m.detail,/six/);assert.doesNotMatch(m.detail,/cinq/);assert.equal(seen(f),'0.1.6');assert.equal(run(f,'0.1.6'),null);});
test('a first install shows nothing, and remembers its version',()=>{const f=temp();assert.equal(run(f,'0.1.5',false),null);assert.equal(seen(f),'0.1.5');assert.equal(run(f,'0.1.5',false),null);});
test('coming from a version that never wrote the file, the notes of this version',()=>{const f=temp();assert.match(run(f,'0.1.5',true).detail,/cinq/);assert.equal(run(f,'0.1.5',true),null);});
test('several versions skipped: all of them, newest first',()=>{const f=temp();fs.writeFileSync(f,JSON.stringify({version:'0.1.4'}));const {detail}=run(f,'0.1.10');assert.ok(detail.indexOf('dix')<detail.indexOf('six')&&detail.indexOf('six')<detail.indexOf('cinq'));assert.match(detail,/0\.1\.10/);});
test('10 is newer than 9, not older',()=>{assert.equal(newer('0.1.10','0.1.9'),true);assert.equal(newer('0.1.9','0.1.10'),false);assert.equal(newer('0.2.0','0.1.10'),true);assert.equal(newer('0.1.5','0.1.5'),false);});
test('a version without notes, or going back, shows nothing and is remembered',()=>{const f=temp();fs.writeFileSync(f,JSON.stringify({version:'0.1.6'}));assert.equal(run(f,'0.1.7'),null);assert.equal(seen(f),'0.1.7');assert.equal(run(f,'0.1.5'),null);assert.equal(seen(f),'0.1.5');});
test('notes of a later version are not announced early',()=>assert.deepEqual(notesFor(notes,'0.1.4','0.1.5','fr').map(n=>n.version),['0.1.5']));
test('follows the language, English when a language is missing',()=>{const f=temp();fs.writeFileSync(f,JSON.stringify({version:'0.1.4'}));assert.match(run(f,'0.1.5',true,'en').detail,/five/);assert.match(notesFor({'1.0.0':{en:['only en']}},null,'1.0.0','fr')[0].items[0],/only en/);});
test('a damaged file counts as no file',()=>{const f=temp();fs.writeFileSync(f,'{broken');assert.match(run(f,'0.1.5',true).detail,/cinq/);assert.equal(seen(f),'0.1.5');});
test('the notes shipped are written in both languages, with no long dash',()=>{const shipped=JSON.parse(fs.readFileSync(path.join(__dirname,'whats-new.json'),'utf8'));for(const [v,n]of Object.entries(shipped)){assert.match(v,/^\d+\.\d+\.\d+$/);assert.ok(n.fr?.length&&n.en?.length,v);assert.doesNotMatch(JSON.stringify(n),/—/);}});
