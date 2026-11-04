const {join}=require('node:path');
module.exports={
 packagerConfig:{icon:join(__dirname,'assets/adam.ico'),name:'AdamStudio',executableName:'AdamStudio',appBundleId:'com.cliffiscurious.adamstudio',appCopyright:'Michel-Cliff',asar:true,prune:true,extraResource:[join(__dirname,'.build/payload')],ignore:[/^\/(\.build|out|node_modules|policy\.test\.cjs|prepare-runtime\.mjs|launch\.mjs|README\.md|backend\.ts|tsconfig\.json)/]},
 makers:[{name:'@electron-forge/maker-squirrel',config:{name:'AdamStudio',authors:'Michel-Cliff',description:'Adam Studio — création et montage vidéo assistés',iconUrl:'',setupExe:'AdamStudio-Setup.exe',setupIcon:join(__dirname,'assets/adam.ico'),noMsi:true}}],
};
