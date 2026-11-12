const {join}=require('node:path');
const {FusesPlugin}=require('@electron-forge/plugin-fuses');
const {FuseV1Options,FuseVersion}=require('@electron/fuses');
module.exports={
 // Build directly under out/ to avoid moving the full Windows payload out of a locked temp directory.
 packagerConfig:{tmpdir:false,icon:join(__dirname,'assets/adam.ico'),name:'AdamStudio',executableName:'AdamStudio',appBundleId:'com.cliffiscurious.adamstudio',appCopyright:'Michel-Cliff',asar:true,prune:true,extraResource:[join(__dirname,'.build/payload')],ignore:[/^\/(\.build|out|node_modules|[^/]+\.test\.cjs|THIRD-PARTY\.md|third-party|prepare-runtime\.mjs|make-npm-notices\.mjs|make-gpl-sources\.mjs|launch\.mjs|README\.md|backend\.ts|tsconfig\.json|installer-launcher\.cs)/]},
 makers:[{name:'@electron-forge/maker-squirrel',config:{name:'AdamStudio',authors:'Michel-Cliff',description:'Adam Studio : création et montage vidéo assistés',iconUrl:'',setupExe:'AdamStudio-Setup.exe',setupIcon:join(__dirname,'assets/adam.ico'),noMsi:true}}],
 // The installed exe cannot be turned into a plain Node, driven through NODE_OPTIONS or a debug port, or pointed at a changed app. The engine runs on its own node.exe.
 plugins:[new FusesPlugin({version:FuseVersion.V1,[FuseV1Options.RunAsNode]:false,[FuseV1Options.EnableCookieEncryption]:true,[FuseV1Options.EnableNodeOptionsEnvironmentVariable]:false,[FuseV1Options.EnableNodeCliInspectArguments]:false,[FuseV1Options.EnableEmbeddedAsarIntegrityValidation]:true,[FuseV1Options.OnlyLoadAppFromAsar]:true})],
};
