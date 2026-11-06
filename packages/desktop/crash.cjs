// Crash reports, only with the person's agreement. Nothing leaves the computer from here: the app shows the cleaned report,
// then prepares a mail in the person's own mail program, and they press Send themselves. No key or server is involved.
// Everything that touches Electron is passed in, so the rules below can be tested without an installed app.
const SUPPORT_EMAIL='hello@contact.cliffiscurious.com';
const MAIL_LIMIT=1900; // Windows and mail programs refuse or cut longer mailto links.
const LOG_TAIL=16000;
const PREVIEW=900;
const TEXT={
 fr:{ask:'Envoyer un rapport à l’équipe d’Adam Studio ?',detail:r=>`Il aide à corriger ce problème. Rien ne part sans toi : un e-mail se prépare dans ta messagerie, tu le relis et tu l’envoies. Ton nom d’utilisateur, tes clés et tes adresses e-mail sont retirés.\n\nAperçu :\n${r}`,buttons:['Préparer l’e-mail','Ne pas envoyer'],noMail:'Aucune messagerie ne s’est ouverte.',noMailDetail:a=>`Le rapport est copié. Colle-le dans un e-mail à ${a}.`,ok:'OK',subject:v=>`Adam Studio ${v} : rapport de problème`,cut:'[début du journal retiré pour tenir dans l’e-mail ; le rapport complet est dans le presse-papiers]'},
 en:{ask:'Send a report to the Adam Studio team?',detail:r=>`It helps fix this problem. Nothing leaves without you: a mail is prepared in your mail program, you read it and send it. Your user name, keys and email addresses are removed.\n\nPreview:\n${r}`,buttons:['Prepare the mail','Do not send'],noMail:'No mail program opened.',noMailDetail:a=>`The report is copied. Paste it in a mail to ${a}.`,ok:'OK',subject:v=>`Adam Studio ${v}: problem report`,cut:'[start of the log removed to fit in the mail; the full report is on the clipboard]'},
};
const escapeRe=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
function redact(text,{home='',user='',secrets=[]}={}){
 let out=String(text);
 for(const secret of secrets)if(secret)out=out.split(secret).join('[secret]');
 if(home){const flexible=home.split(/[\\/]+/).map(escapeRe).join('[\\\\/]+');out=out.replace(new RegExp(flexible,'gi'),'~');}
 if(user&&user.length>2)out=out.replace(new RegExp(escapeRe(user),'gi'),'[user]');
 return out
  .replace(/\bBearer\s+[\w.~+/=-]+/gi,'Bearer [secret]')
  .replace(/\b(?:sk-[\w-]{8,}|gh[pousr]_\w{16,}|github_pat_\w{16,}|xox[a-z]-[\w-]{8,}|AIza[\w-]{16,})/g,'[secret]')
  .replace(/(["']?[\w-]*(?:api[_-]?key|token|secret|password|passwd|pwd)["']?\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,;}]+)/gi,'$1[secret]')
  .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g,'[email]')
  .replace(/\b[a-f0-9]{32,}\b/gi,'[secret]');
}
function buildReport({kind,error,log='',version,system,context}){
 const stack=error?(error.stack||error.message||String(error)):'';
 return redact([`Adam Studio ${version}`,system,kind,'',stack,'','--- journal ---',log].join('\n').trim(),context);
}
// The end of a log says what went wrong, so the middle is what goes. Cuts are made on whole encoded characters.
function mailUrl({report,version,lang='fr'}){
 const t=TEXT[lang]||TEXT.fr;
 const head=`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(t.subject(version))}&body=`;
 const room=MAIL_LIMIT-head.length;
 const whole=encodeURIComponent(report);
 if(whole.length<=room)return head+whole;
 const marker=encodeURIComponent(`\n\n${t.cut}\n\n`);
 const share=room-marker.length;
 const fit=(chars,budget)=>{let out='',size=0;for(const c of chars){const piece=encodeURIComponent(c);if(size+piece.length>budget)break;out+=piece;size+=piece.length;}return out;};
 const characters=Array.from(report);
 const start=fit(characters,Math.floor(share*.35));
 const endReversed=[];let size=0;const budget=share-start.length;
 for(let i=characters.length-1;i>=0;i--){const piece=encodeURIComponent(characters[i]);if(size+piece.length>budget)break;endReversed.push(piece);size+=piece.length;}
 return head+start+marker+endReversed.reverse().join('');
}
const keepTail=(current,added,limit=LOG_TAIL)=>(current+added).slice(-limit);
const preview=report=>report.length>PREVIEW?`...\n${report.slice(-PREVIEW)}`:report;
// Asks once. "No" is the default and leaves nothing behind. Returns what happened, and never throws: it runs while the app is already failing.
async function offerReport({message,report,version,lang='fr',ask,openMail,copy,save,log=()=>{}}){
 const t=TEXT[lang]||TEXT.fr;
 try{
  const choice=await ask({message:message?`${message}\n\n${t.ask}`:t.ask,detail:t.detail(preview(report)),buttons:t.buttons,defaultId:1,cancelId:1});
  if(choice!==0)return 'declined';
  try{save(report);}catch(error){log(error);}
  copy(report);
  try{await openMail(mailUrl({report,version,lang}));return 'prepared';}
  catch(error){log(error);await ask({message:t.noMail,detail:t.noMailDetail(SUPPORT_EMAIL),buttons:[t.ok],defaultId:0,cancelId:0});return 'copied';}
 }catch(error){log(error);return 'failed';}
}
module.exports={SUPPORT_EMAIL,MAIL_LIMIT,LOG_TAIL,redact,buildReport,mailUrl,keepTail,offerReport};
