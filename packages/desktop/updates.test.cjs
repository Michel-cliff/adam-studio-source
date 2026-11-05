const {test}=require('node:test');const assert=require('node:assert/strict');const {EventEmitter}=require('node:events');
const {canCheck,feedUrl,startUpdates}=require('./updates.cjs');

function setup(over={}){
 const updater=Object.assign(new EventEmitter(),{feed:null,checks:0,setFeedURL(o){this.feed=o.url;},checkForUpdates(){this.checks++;}});
 const asked=[];let restarted=0;const timers=[],repeats=[];
 const s=startUpdates({autoUpdater:updater,version:'0.1.0',lang:'fr',busy:async()=>false,ask:async m=>{asked.push(m);return m.kind==='ready'?0:0;},restart:()=>{restarted++;},log:()=>{},after:(f,ms)=>timers.push({f,ms}),every:(f,ms)=>repeats.push({f,ms}),env:{},...over});
 return {updater,asked,timers,repeats,s,restarts:()=>restarted};
}
const flush=()=>new Promise(r=>setImmediate(r));

test('updates are only looked for in the installed app, and never just after installing',()=>{
 assert.equal(canCheck({packaged:true,smoke:false,argv:['app.exe']}),true);
 assert.equal(canCheck({packaged:false,smoke:false,argv:[]}),false);
 assert.equal(canCheck({packaged:true,smoke:true,argv:[]}),false);
 assert.equal(canCheck({packaged:true,smoke:false,argv:['app.exe','--squirrel-firstrun']}),false);
});
test('the feed names the version, and can be pointed elsewhere to test',()=>{
 assert.equal(feedUrl('0.1.0',{}),'https://update.electronjs.org/Michel-cliff/adam-studio-releases/win32-x64/0.1.0');
 assert.equal(feedUrl('0.1.0',{ADAM_UPDATE_FEED:'http://127.0.0.1:9000'}),'http://127.0.0.1:9000');
});
test('the first check waits for Squirrel to let go, then comes back regularly',()=>{
 const {updater,timers,repeats}=setup();
 assert.equal(updater.feed,'https://update.electronjs.org/Michel-cliff/adam-studio-releases/win32-x64/0.1.0');
 assert.equal(updater.checks,0);assert.ok(timers[0].ms>=10000);
 timers[0].f();assert.equal(updater.checks,1);assert.ok(repeats[0].ms>=3600000);
});
test('a check in progress is not started twice: that would download twice',()=>{
 const {updater,s}=setup();s.check();s.check();assert.equal(updater.checks,1);
 updater.emit('update-not-available');s.check();assert.equal(updater.checks,2);
});
test('a downloaded update asks before restarting, and restarts only on yes',async()=>{
 const {updater,asked,restarts}=setup();updater.emit('update-downloaded',{}, '', '0.1.1');await flush();
 assert.equal(asked.length,1);assert.equal(asked[0].kind,'ready');assert.match(asked[0].message,/mise à jour/i);assert.equal(restarts(),1);
});
test('later means later: no second question, the update applies at the next start',async()=>{
 const seen=[];const {updater,restarts,repeats}=setup({ask:async m=>{seen.push(m);return 1;}});
 updater.emit('update-downloaded',{}, '', '0.1.1');await flush();assert.equal(seen.length,1);assert.equal(restarts(),0);
 updater.emit('update-downloaded',{}, '', '0.1.1');await flush();assert.equal(seen.length,1);
 const before=updater.checks;repeats[0].f();assert.equal(updater.checks,before,'nothing is downloaded a second time');
});
test('never asks during a render: it waits for the work to end',async()=>{
 let working=true;const asked=[];
 const {updater,timers}=setup({busy:async()=>working,ask:async m=>{asked.push(m);return 1;}});
 updater.emit('update-downloaded',{}, '', '0.1.1');await flush();
 assert.equal(asked.length,0);assert.ok(timers.length>=2);
 working=false;timers[timers.length-1].f();await flush();assert.equal(asked.length,1);
});
test('if the work cannot be read, it counts as busy',async()=>{
 const asked=[];const {updater}=setup({busy:async()=>{throw Error('no backend');},ask:async m=>{asked.push(m);return 1;}});
 updater.emit('update-downloaded',{}, '', '0.1.1');await flush();assert.equal(asked.length,0);
});
test('a failure stays quiet in the background, and is said when the creator asked',async()=>{
 const asked=[],logged=[];const {updater,s}=setup({ask:async m=>{asked.push(m);return 0;},log:e=>logged.push(e)});
 updater.emit('error',Error('offline'));await flush();assert.equal(asked.length,0);assert.equal(logged.length,1);
 s.check(true);updater.emit('error',Error('offline'));await flush();assert.equal(asked.length,1);assert.equal(asked[0].kind,'info');
});
test('when the creator asks, the answer is given either way',async()=>{
 const asked=[];const {updater,s}=setup({ask:async m=>{asked.push(m);return 0;}});
 s.check(true);updater.emit('update-not-available');await flush();assert.match(asked[0].message,/dernière version/i);
 s.check(true);updater.emit('update-available');await flush();assert.match(asked[1].message,/télécharge/i);
});
test('after later, asking from the menu offers the restart again',async()=>{
 const seen=[];const {updater,s,restarts}=setup({ask:async m=>{seen.push(m);return seen.length===1?1:0;}});
 updater.emit('update-downloaded',{}, '', '0.1.1');await flush();assert.equal(restarts(),0);
 s.check(true);await flush();assert.equal(seen.length,2);assert.equal(restarts(),1);
});
test('work started while the question was open stops the restart',async()=>{
 let working=false;const {updater,restarts,timers}=setup({busy:async()=>working,ask:async()=>{working=true;return 0;}});
 const before=timers.length;updater.emit('update-downloaded',{}, '', '0.1.1');await flush();
 assert.equal(restarts(),0);assert.equal(timers.length,before+1);
});
test('a failed feed setting never stops the app',()=>{
 const updater=Object.assign(new EventEmitter(),{setFeedURL(){throw Error('not installed');},checkForUpdates(){}});
 assert.doesNotThrow(()=>startUpdates({autoUpdater:updater,version:'0.1.0',lang:'en',busy:async()=>false,ask:async()=>1,restart(){},log(){},after(){},every(){},env:{}}));
});
