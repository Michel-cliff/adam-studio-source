const test=require('node:test');
const assert=require('node:assert/strict');
const {redact,buildReport,mailUrl,offerReport,keepTail,MAIL_LIMIT,SUPPORT_EMAIL}=require('./crash.cjs');

const context={home:'C:\\Users\\Awa Diallo',user:'Awa Diallo',secrets:['f'.repeat(16)]};

test('the home folder and the Windows user name never leave the machine',()=>{
 const out=redact('Error at C:\\Users\\Awa Diallo\\AdamStudioProjects\\Ep1 and c:/Users/Awa Diallo/x for Awa Diallo',context);
 assert.ok(!out.includes('Awa'),out);
 assert.ok(out.includes('~\\AdamStudioProjects\\Ep1'),out);
});

test('keys, tokens and email addresses are removed',()=>{
 const samples=['sk-ant-api03-abcDEF123456789','sk-proj-abcDEF123456789','ghp_abcdefghijklmnopqrstuvwxyz012345','Bearer abc.def-123456','ANTHROPIC_API_KEY=abcdef123456','"password": "hunter2hunter2"','awa@example.com','a'.repeat(32).replace(/a/g,'b1'),'f'.repeat(16)];
 for(const secret of samples){
  const out=redact(`before ${secret} after`,context);
  assert.ok(out.includes('before')&&out.includes('after'),out);
  for(const piece of ['abcDEF123456789','abcdefghijklmnop','abc.def-123456','abcdef123456','hunter2','awa@example.com','b1b1b1b1','ffffffff'])assert.ok(!out.includes(piece),`${secret} gives ${out}`);
 }
});

test('an ordinary message and its stack survive the cleaning',()=>{
 const line='TypeError: Cannot read properties of undefined (reading \'clips\') at render.ts:42:7';
 assert.equal(redact(line,context),line);
});

test('the report names the version and the system, and is cleaned',()=>{
 const report=buildReport({kind:'Moteur arrêté',error:Error('boom in C:\\Users\\Awa Diallo\\x'),log:'line for awa@example.com',version:'0.1.1',system:'win32 10.0 x64',context});
 for(const part of ['Moteur arrêté','0.1.1','win32 10.0 x64','boom in ~\\x','[email]'])assert.ok(report.includes(part),`${part} missing from ${report}`);
 assert.ok(!report.includes('Awa')&&!report.includes('awa@'));
});

test('the mail goes to the support address and stays short enough to open',()=>{
 const report='start\n'+'x'.repeat(50000)+'\nthe real error at the end';
 const url=mailUrl({report,version:'0.1.1'});
 assert.ok(url.startsWith(`mailto:${SUPPORT_EMAIL}?subject=`));
 assert.ok(url.length<=MAIL_LIMIT,`length ${url.length}`);
 const body=decodeURIComponent(url.split('body=')[1]);
 assert.ok(body.includes('the real error at the end'),'the end of the log matters most');
 assert.ok(body.includes('start'),'the header is kept');
});

test('a cut in the middle of an accent or a space never breaks the mail link',()=>{
 for(let n=0;n<40;n++){
  const url=mailUrl({report:'é &?#'.repeat(2000)+'x'.repeat(n),version:'0.1.1'});
  assert.ok(url.length<=MAIL_LIMIT);
  assert.doesNotThrow(()=>decodeURIComponent(url));
 }
});

test('the log tail keeps only the latest text',()=>{
 assert.equal(keepTail('abc','def',4),'cdef');
 assert.equal(keepTail('','ab',4),'ab');
});

const tools=(response,overrides={})=>{
 const calls={ask:[],mail:[],copied:[],saved:[]};
 return {calls,deps:{lang:'fr',report:'REPORT',version:'0.1.1',ask:async o=>{calls.ask.push(o);return typeof response==='function'?response(calls.ask.length):response;},openMail:async u=>{calls.mail.push(u);},copy:t=>calls.copied.push(t),save:t=>calls.saved.push(t),log:()=>{},...overrides}};
};

test('nothing is prepared or copied when the person says no',async()=>{
 const {calls,deps}=tools(1);
 assert.equal(await offerReport({message:'Le moteur s’est arrêté.',...deps}),'declined');
 assert.equal(calls.mail.length,0);
 assert.equal(calls.copied.length,0);
 assert.equal(calls.saved.length,0);
});

test('the person sees the report before choosing, and says no by default',async()=>{
 const {calls,deps}=tools(1);
 await offerReport({message:'Le moteur s’est arrêté.',...deps});
 const asked=calls.ask[0];
 assert.ok(asked.detail.includes('REPORT'));
 assert.equal(asked.defaultId,1);
 assert.equal(asked.cancelId,1);
 assert.ok(asked.message.includes('Le moteur s’est arrêté.'));
});

test('agreeing opens the mail, and also keeps the whole report on the clipboard',async()=>{
 const {calls,deps}=tools(0);
 assert.equal(await offerReport({message:'x',...deps}),'prepared');
 assert.equal(calls.mail.length,1);
 assert.ok(calls.mail[0].startsWith('mailto:'));
 assert.deepEqual(calls.copied,['REPORT']);
 assert.deepEqual(calls.saved,['REPORT']);
});

test('without a mail program the report is on the clipboard and the address is shown',async()=>{
 const {calls,deps}=tools(0,{openMail:async()=>{throw Error('no handler');}});
 assert.equal(await offerReport({message:'x',...deps}),'copied');
 assert.deepEqual(calls.copied,['REPORT']);
 assert.equal(calls.ask.length,2);
 assert.ok(calls.ask[1].detail.includes(SUPPORT_EMAIL));
});

test('a failing dialog never hides the crash behind a second one',async()=>{
 const {deps}=tools(0,{ask:async()=>{throw Error('window gone');}});
 assert.equal(await offerReport({message:'x',...deps}),'failed');
});
