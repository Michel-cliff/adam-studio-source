// The licence text of every shipped npm package that does not carry its own file, in third-party/npm-notices.txt.
//   node make-npm-notices.mjs                     writes the file (network: each package's repository, else the SPDX text)
//   node make-npm-notices.mjs --check <folder>    prints the packages of that node_modules covered by neither
import {existsSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'../..'),out=join(here,'third-party/npm-notices.txt');
const hasLicence=dir=>readdirSync(dir).some(f=>/^(licen[cs]e|copying|notice)/i.test(f));
const read=dir=>{try{return JSON.parse(readFileSync(join(dir,'package.json'),'utf8'));}catch{return null;}};
function* packages(folder){
 if(!existsSync(folder))return;
 for(const e of readdirSync(folder,{withFileTypes:true})){
  if(!e.isDirectory()||e.name.startsWith('.'))continue;
  const dir=join(folder,e.name);
  if(e.name.startsWith('@')){yield* packages(dir);continue;}
  const pkg=read(dir);if(pkg?.name)yield {dir,pkg};
  yield* packages(join(dir,'node_modules'));
 }
}
const ours=name=>name.startsWith('@adam-studio/');
if(process.argv[2]==='--check'){
 const known=new Set([...(existsSync(out)?readFileSync(out,'utf8'):'').matchAll(/^=== (\S+)@/gm)].map(m=>m[1]));
 for(const {dir,pkg}of packages(resolve(process.argv[3])))if(!ours(pkg.name)&&!hasLicence(dir)&&!known.has(pkg.name))console.log(pkg.name);
 process.exit(0);
}
const lock=JSON.parse(readFileSync(join(root,'package-lock.json'),'utf8'));
const shipped=Object.entries(lock.packages).filter(([path,p])=>path.startsWith('node_modules/')&&!p.dev&&!p.link&&(!p.os||p.os.includes('win32'))&&(!p.cpu||p.cpu.includes('x64')));
const get=async url=>{try{const r=await fetch(url,{signal:AbortSignal.timeout(20000)});return r.ok?await r.text():null;}catch{return null;}};
async function fromRepository(pkg,version){
 const m=String(pkg.repository?.url??pkg.repository??'').match(/github\.com[/:]([^/]+)\/([^/#.]+)/)||String(pkg.repository??'').match(/^([^/:]+)\/([^/#]+)$/);if(!m)return null;
 const sub=pkg.repository?.directory?`${pkg.repository.directory}/`:'';
 for(const ref of [`v${version}`,version,'main','master'])for(const dir of sub?[sub,'']:[''])for(const name of ['LICENSE','LICENSE.md','LICENSE.txt','LICENCE','license','license.md','LICENSE-MIT']){
  const text=await get(`https://raw.githubusercontent.com/${m[1]}/${m[2]}/${ref}/${dir}${name}`);
  if(text)return {text,from:`https://github.com/${m[1]}/${m[2]}/blob/${ref}/${dir}${name}`};
 }
 return null;
}
const entries=[];
for(const [path,p]of shipped){
 const dir=join(root,path),pkg=read(dir);if(!pkg||ours(pkg.name)||hasLicence(dir))continue;
 const licence=typeof pkg.license==='string'?pkg.license:pkg.license?.type??p.license??'see the package';
 let found=await fromRepository(pkg,pkg.version);
 if(!found){
  const spdx=await get(`https://raw.githubusercontent.com/spdx/license-list-data/main/text/${encodeURIComponent(licence.replace(/[()]/g,'').split(/ OR | AND /)[0])}.txt`);
  const author=typeof pkg.author==='string'?pkg.author:pkg.author?.name;
  if(spdx)found={text:`${author?`Copyright (c) ${author}\n\n`:''}${spdx}`,from:`standard text of ${licence}, as declared in the package's package.json`};
 }
 console.log(`${pkg.name}@${pkg.version}  ${licence}  ${found?found.from:'NOT FOUND'}`);
 entries.push(`=== ${pkg.name}@${pkg.version} ===\nLicence: ${licence}\nText from: ${found?found.from:'not found: see the package page'}\n\n${found?found.text.trim():''}\n`);
}
entries.sort();
writeFileSync(out,`Node packages shipped in Adam Studio that do not carry their own licence file (${entries.length}).\nEvery other package has its licence file in its folder, under node_modules.\n\n${entries.join('\n')}`);
console.log(`NOTICES ${entries.length} written`);
