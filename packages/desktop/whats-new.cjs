const {mkdirSync,readFileSync,writeFileSync}=require('node:fs');
const {dirname}=require('node:path');
const parts=v=>String(v).split('.').map(Number);
function newer(a,b){const x=parts(a),y=parts(b);for(let i=0;i<3;i++){if((x[i]||0)!==(y[i]||0))return (x[i]||0)>(y[i]||0);}return false;}
/** The notes of what changed after `last`, up to `current`, newest first. Without `last`, those of `current` alone. */
function notesFor(all,last,current,lang){
 const versions=Object.keys(all).filter(v=>!newer(v,current)&&(last?newer(v,last):v===current)).sort((a,b)=>newer(a,b)?-1:1);
 return versions.map(version=>({version,items:all[version]?.[lang]||all[version]?.en||[]})).filter(n=>n.items.length);
}
function message(notes,lang){
 const lines=notes.flatMap((n,i)=>[...(notes.length>1?[`${i?'\n':''}${n.version}`]:[]),...n.items.map(item=>`• ${item}`)]);
 return {message:lang==='fr'?`Adam Studio ${notes[0].version} : les nouveautés`:`Adam Studio ${notes[0].version}: what's new`,detail:lines.join('\n')};
}
/**
 * Once per version: what to show now, or null. The version is written first, so a message that fails is not shown at
 * every launch. A first install shows nothing. Coming from a version too old to have written the file, `used` tells
 * the app ran here before: the notes of this version are shown.
 */
function whatsNew({file,version,notes,lang,used}){
 let last=null;try{last=JSON.parse(readFileSync(file,'utf8')).version||null;}catch{}
 if(last===version)return null;
 mkdirSync(dirname(file),{recursive:true});writeFileSync(file,JSON.stringify({version}));
 if(!last&&!used)return null;
 if(last&&!newer(version,last))return null;
 const shown=notesFor(notes,last,version,lang);
 return shown.length?message(shown,lang):null;
}
module.exports={whatsNew,notesFor,newer};
