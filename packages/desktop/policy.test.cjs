const {test}=require('node:test');const assert=require('node:assert/strict');const {fitWindow,isLocal,isExternal}=require('./policy.cjs');
test('only the support recipient and safe mail fields may open a mail program',()=>{
 assert(isExternal('mailto:hello@contact.cliffiscurious.com?subject=Bug&body=Details'));
 for(const url of [
  'mailto:someone@example.com?subject=Bug',
  'mailto:hello@contact.cliffiscurious.com?bcc=outside@example.com',
  'mailto:hello@contact.cliffiscurious.com?attachment=C:/secret.txt',
  'mailto:hello@contact.cliffiscurious.com?subject=bug%0D%0Abcc:outside@example.com',
  'mailto:hello@contact.cliffiscurious.com?body='+ 'x'.repeat(2000),
 ])assert(!isExternal(url),url);
});
const primary={x:0,y:0,width:1280,height:720};
test('recover a window from a disconnected monitor and fit a small screen',()=>{const b=fitWindow({x:3000,y:100,width:1920,height:1080},[primary]);assert.equal(b.width,1280);assert.equal(b.height,720);assert.equal(b.x,0);assert.equal(b.y,0);});
test('preserve a window on a negative-coordinate secondary display',()=>{const b={x:-1400,y:60,width:1000,height:600};assert.deepEqual(fitWindow(b,[primary,{x:-1920,y:0,width:1920,height:1080}]),b);});
test('ignore corrupted saved geometry',()=>{const b=fitWindow({x:NaN,y:0,width:-1,height:Infinity},[primary]);assert.equal(b.width,1280);assert.equal(b.height,720);});
test('only the exact local origin is trusted; external links exclude executable schemes',()=>{assert(isLocal('http://127.0.0.1:4567/#/','http://127.0.0.1:4567'));assert(!isLocal('http://127.0.0.1:4568','http://127.0.0.1:4567'));assert(!isLocal('http://127.0.0.1:4567.attacker.test','http://127.0.0.1:4567'));assert(!isExternal('file:///C:/Windows/test.exe'));assert(!isExternal('javascript:alert(1)'));assert(isExternal('https://ko-fi.com/cliffiscurious'));});
