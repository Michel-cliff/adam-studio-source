function fitWindow(saved,areas){
 const valid=saved&&['x','y','width','height'].every(k=>Number.isFinite(saved[k]));
 const area=(valid&&areas.find(a=>saved.x>=a.x&&saved.y>=a.y&&saved.x+Math.min(saved.width,160)<=a.x+a.width&&saved.y+Math.min(saved.height,100)<=a.y+a.height))||areas[0];
 const width=Math.min(area.width,Math.max(480,valid?saved.width:1440)),height=Math.min(area.height,Math.max(400,valid?saved.height:900));
 return {width,height,x:valid?Math.max(area.x,Math.min(saved.x,area.x+area.width-width)):Math.round(area.x+(area.width-width)/2),y:valid?Math.max(area.y,Math.min(saved.y,area.y+area.height-height)):Math.round(area.y+(area.height-height)/2)};
}
function isLocal(url,origin){try{return new URL(url).origin===origin;}catch{return false;}}
function isExternal(url){try{return ['https:','http:'].includes(new URL(url).protocol);}catch{return false;}}
module.exports={fitWindow,isLocal,isExternal};
