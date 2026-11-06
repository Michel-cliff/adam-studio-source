// The source code of the GPL programs shipped with a release (FFmpeg with its libraries, yt-dlp), in one ZIP to attach to it.
//   node make-gpl-sources.mjs <release version> <output folder>
// Reads the versions from the shipped tools (out/.../licenses/ffmpeg/README.txt, yt-dlp --version) and fails on a tool
// that changed, so a new FFmpeg build cannot silently get the sources of the old one: update LIBS with its README.
// MANIFEST.txt says, for each component, what was fetched, from where, with its SHA-256, and what could not be.
import {createHash} from 'node:crypto';
import {execFile,execFileSync} from 'node:child_process';
import {existsSync,mkdirSync,readFileSync,renameSync,rmSync,statSync,writeFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
const here=dirname(fileURLToPath(import.meta.url)),run=promisify(execFile);
const [version,outDir]=process.argv.slice(2);if(!version||!outDir)throw Error('usage: make-gpl-sources.mjs <version> <folder>');
const payload=join(here,'out/AdamStudio-win32-x64/resources/payload');
const FFMPEG='bf1b838f2a',FFMPEG_VERSION='9.0.1',YTDLP='2026.10.21',X264='3223',X264_COMMIT='0480cb05'; // r3223: the 3223rd commit of x264, checked against its history
const readme=readFileSync(join(payload,'licenses/ffmpeg/README.txt'),'utf8');
if(!readme.includes(`x264 v0.165.${X264}`))throw Error('x264 changed: update this file');
if(!readme.includes(`Version: ${FFMPEG_VERSION}-full_build`)||!readme.includes(`commit/${FFMPEG}`))throw Error('FFmpeg changed: update this file');
const ytdlp=execFileSync(join(payload,'bin/yt-dlp.exe'),['--version'],{encoding:'utf8'}).trim();if(ytdlp!==YTDLP)throw Error(`yt-dlp is ${ytdlp}: update this file`);
const gh=(repo,...refs)=>refs.map(r=>`https://github.com/${repo}/archive/${r}.tar.gz`);
const lab=(host,repo,name,...refs)=>refs.map(r=>`https://${host}/${repo}/-/archive/${r}/${name}-${r.replace(/\//g,'-')}.tar.gz`);
const sf=path=>[`https://downloads.sourceforge.net/project/${path}`];
// name, version as printed by the build's README, where to get exactly that; last, when that version is not published any more, the closest one.
const LIBS=[
 ['AMF','v1.5.2-2-gc35f613',gh('GPUOpen-LibrariesAndSDKs/AMF','c35f613')],
 ['aom','v3.14.1-147-gec0dedc1a2',[...gh('jbeich/aom','ec0dedc1a2'),'https://aomedia.googlesource.com/aom/+archive/ec0dedc1a2.tar.gz']],
 ['aribb24','v1.0.3-5-g5e9be27',gh('nkoriyama/aribb24','5e9be27')],
 ['aribcaption','1.1.2',gh('xqq/libaribcaption','v1.1.2')],
 ['AviSynthPlus','v3.7.5-362-gf4628d0a',gh('AviSynth/AviSynthPlus','f4628d0a')],
 ['bs2b','3.1.0',sf('bs2b/libbs2b/3.1.0/libbs2b-3.1.0.tar.gz')],
 ['bzip2','1.0.8-3',['https://sourceware.org/pub/bzip2/bzip2-1.0.8.tar.gz']],
 ['cairo','1.18.5',lab('gitlab.freedesktop.org','cairo/cairo','cairo','1.18.5'),lab('gitlab.freedesktop.org','cairo/cairo','cairo','1.18.6')],
 ['chromaprint','1.6.1',gh('acoustid/chromaprint','v1.6.1','1.6.1')],
 ['codec2','1.2.0-108-g310777b1',gh('drowe67/codec2','310777b1')],
 ['dav1d','1.5.4',gh('videolan/dav1d','1.5.4')],
 ['davs2','1.7-1-gb41cf11',gh('pkuvcl/davs2','b41cf11')],
 ['dvdnav','7.0.0-16-g2ffc50b',lab('code.videolan.org','videolan/libdvdnav','libdvdnav','2ffc50b')],
 ['dvdread','7.1.1-92-g50009a0',lab('code.videolan.org','videolan/libdvdread','libdvdread','50009a0')],
 ['ffnvcodec','n13.1.15.0-1-geddcea9',gh('FFmpeg/nv-codec-headers','eddcea9')],
 ['flite','v2.2-55-g6c9f20d',gh('festvox/flite','6c9f20d')],
 ['fontconfig','2.18.3',lab('gitlab.freedesktop.org','fontconfig/fontconfig','fontconfig','2.18.3')],
 ['freetype','VER-2-14-3',gh('freetype/freetype','VER-2-14-3')],
 ['frei0r','v3.2.3',gh('dyne/frei0r','v3.2.3')],
 ['fribidi','v1.0.16-5-g069a7e3',gh('fribidi/fribidi','069a7e3')],
 ['gmp','6.3.0-2',['https://ftp.gnu.org/gnu/gmp/gmp-6.3.0.tar.xz']],
 ['gnutls','3.8.13-1',['https://www.gnupg.org/ftp/gcrypt/gnutls/v3.8/gnutls-3.8.13.tar.xz']],
 ['gsm','1.0.24',['https://www.quut.com/gsm/gsm-1.0.24.tar.gz']],
 ['harfbuzz','14.3.0-10-g9f2f0317',gh('harfbuzz/harfbuzz','9f2f0317')],
 ['ladspa-sdk','1.17',['https://www.ladspa.org/download/ladspa_sdk_1.17.tgz']],
 ['lame','3.100',sf('lame/lame/3.100/lame-3.100.tar.gz')],
 ['lc3','1.1.3',gh('google/liblc3','v1.1.3')],
 ['lcms2','2.16',gh('mm2/Little-CMS','lcms2.16')],
 ['lensfun','v0.3.95-1996-g6804b5f5',gh('lensfun/lensfun','6804b5f5')],
 ['libass','0.17.5-3-g89cc0f4',gh('libass/libass','89cc0f4')],
 ['libcdio-paranoia','10.2',['https://ftp.gnu.org/gnu/libcdio/libcdio-paranoia-10.2+2.0.2.tar.bz2']],
 ['libgme','0.6.6',gh('libgme/game-music-emu','0.6.6'),gh('libgme/game-music-emu','0.6.5')],
 ['libiconv','1.19-1',['https://ftp.gnu.org/gnu/libiconv/libiconv-1.19.tar.gz']],
 ['libilbc','v3.0.4-346-g6adb26d4a4',gh('TimothyGu/libilbc','6adb26d4a4')],
 ['libjxl','v0.12-snapshot-3-ge8ff0976',gh('libjxl/libjxl','e8ff0976')],
 ['opencore-amr','0.1.6',sf('opencore-amr/opencore-amr/opencore-amr-0.1.6.tar.gz')],
 ['libplacebo','v7.360.0-109-g4d82c68',gh('haasn/libplacebo','4d82c68')],
 ['libsoxr','0.1.3',sf('soxr/soxr-0.1.3-Source.tar.xz')],
 ['libssh','0.12.0',['https://www.libssh.org/files/0.12/libssh-0.12.0.tar.xz']],
 ['libtheora','v1.2.0',gh('xiph/theora','v1.2.0')],
 ['libwebp','v1.6.0-199-g94d3c4a',gh('webmproject/libwebp','94d3c4a')],
 ['libxml2','v2.15.0-122-gddcb79dc',gh('GNOME/libxml2','ddcb79dc')],
 ['openAL','1.25.2',gh('kcat/openal-soft','1.25.2')],
 ['openapv','v0.3.0.0-9-ga5312e4',gh('AcademySoftwareFoundation/openapv','a5312e4')],
 ['openjpeg2','2.5.4',gh('uclouvain/openjpeg','v2.5.4')],
 ['openmpt','libopenmpt-0.6.28-40-gefc11a27',gh('OpenMPT/openmpt','efc11a27')],
 ['opus','v1.6.1-50-g3da9f7a6',gh('xiph/opus','3da9f7a6')],
 ['qrencode','4.1.1',gh('fukuchi/libqrencode','v4.1.1')],
 ['quirc','1.2',gh('dlbeer/quirc','v1.2')],
 ['rav1e','p20250624-3-g564ae3b',gh('xiph/rav1e','564ae3b')],
 ['rist','0.2.20',lab('code.videolan.org','rist/librist','librist','v0.2.20')],
 ['rubberband','v4.0.0',gh('breakfastquay/rubberband','v4.0.0')],
 ['SDL','release-2.32.0-228-ga2e7c76bd',gh('libsdl-org/SDL','a2e7c76bd')],
 ['shaderc','v2026.3-9-g7060a66',gh('google/shaderc','7060a66')],
 ['shine','3.1.1',gh('toots/shine','3.1.1')],
 ['snappy','1.2.2',gh('google/snappy','1.2.2')],
 ['speex','Speex-1.2.1-51-g0589522',gh('xiph/speex','0589522')],
 ['srt','v1.5.6-2-gfcae571',gh('Haivision/srt','fcae571')],
 ['SVT-AV1','v4.2.0-72-gae2658e53',gh('AOMediaCodec/SVT-AV1','ae2658e53')],
 ['SVT-JPEG-XS','v0.9.0-78-g8056642',gh('OpenVisualCloud/SVT-JPEG-XS','8056642')],
 ['twolame','0.4.0',gh('njh/twolame','0.4.0')],
 ['uavs3d','v1.1-50-g0e20d2c',gh('uavs3/uavs3d','0e20d2c')],
 ['VAAPI','2.25.0',gh('intel/libva','2.25.0'),gh('intel/libva','2.23.0','2.22.0')],
 ['vidstab','v1.1.2-105-gc7a720a',gh('georgmartius/vid.stab','c7a720a')],
 ['vmaf','v3.2.0-9-g4991d2b5',gh('Netflix/vmaf','4991d2b5')],
 ['vo-amrwbenc','0.1.3',sf('opencore-amr/vo-amrwbenc/vo-amrwbenc-0.1.3.tar.gz')],
 ['vorbis','v1.3.7-37-g1b75110b',gh('xiph/vorbis','1b75110b')],
 ['VPL','2.17',gh('intel/libvpl','v2.17.0')],
 ['vpx','v1.16.0-184-g0cfc6da39',gh('webmproject/libvpx','0cfc6da39')],
 ['vulkan-loader','v1.4.359',gh('KhronosGroup/Vulkan-Loader','v1.4.359')],
 ['vvenc','v1.14.0-160-ga03b882',gh('fraunhoferhhi/vvenc','a03b882')],
 ['whisper.cpp','1.9.1',gh('ggml-org/whisper.cpp','v1.9.1')],
 ['x264',`r${X264} ${X264_COMMIT}`,[...gh('mirror/x264',X264_COMMIT),...lab('code.videolan.org','videolan/x264','x264',X264_COMMIT)]],
 ['x265','4.3-6-g9ddc216',['https://bitbucket.org/multicoreware/x265_git/get/9ddc216.tar.gz'],['https://bitbucket.org/multicoreware/x265_git/get/4.3.tar.gz','https://bitbucket.org/multicoreware/x265_git/get/Release_4.3.tar.gz','https://bitbucket.org/multicoreware/x265_git/get/4.1.tar.gz']],
 ['xavs2','1.4',gh('pkuvcl/xavs2','1.4')],
 ['xevd','0.5.0',gh('mpeg5/xevd','v0.5.0')],
 ['xeve','0.5.1',gh('mpeg5/xeve','v0.5.1')],
 ['xvid','v1.3.7',['https://downloads.xvid.com/downloads/xvidcore-1.3.7.tar.gz']],
 ['zeromq','4.3.5',gh('zeromq/libzmq','v4.3.5')],
 ['zimg','release-3.0.6-252-gf6cc75a',gh('sekrit-twc/zimg','f6cc75a')],
 ['zvbi','v0.2.44-8-g4e222f9',gh('zapping-vbi/zvbi','4e222f9')],
];
const MAIN=[['FFmpeg',`${FFMPEG_VERSION} ${FFMPEG}`,gh('FFmpeg/FFmpeg',FFMPEG)],['yt-dlp',YTDLP,[`https://github.com/yt-dlp/yt-dlp/releases/download/${YTDLP}/yt-dlp.tar.gz`,...gh('yt-dlp/yt-dlp',YTDLP)]]];
// Enabled in the build, with no version in its README: nothing here can claim to be the exact source.
const UNVERSIONED=['libbluray','libcaca','libcdio','libmodplug','libmysofa','liblzma','zlib','nettle (through gnutls)'];
const dir=join(outDir,'sources');mkdirSync(dir,{recursive:true});
const ext=url=>url.match(/\.(tar\.\w+|tgz)$/)?.[1]??'tar.gz';
async function fetchOne([name,ver,urls,closest=[]]){
 const safe=`${name}-${ver.replace(/[^\w.+-]+/g,'_')}`;
 for(const url of [...urls,...closest]){
  const near=closest.includes(url),file=join(dir,`${safe}${near?'.CLOSEST':''}.${ext(url)}`),part=file+'.part';
  if(existsSync(file))return {name,ver,url,file,near};
  try{
   await run('curl.exe',['-fsSL','--max-time','600','-o',part,url]);
   if(statSync(part).size<1000)throw Error('too small');
   renameSync(part,file);console.log(`ok ${name} ${(statSync(file).size/1e6).toFixed(1)} MB`);
   return {name,ver,url,file,near};
  }catch(e){rmSync(part,{force:true});console.log(`.. ${name}: ${url}: ${(e.stderr||e.message).trim().slice(0,120)}`);}
 }
 console.log(`MISSING ${name}`);return {name,ver,urls};
}
const all=[...MAIN,...LIBS],results=[];let next=0;
await Promise.all(Array.from({length:6},async()=>{while(next<all.length){const job=all[next++];results.push(await fetchOne(job));}}));
const sha=f=>createHash('sha256').update(readFileSync(f)).digest('hex');
const byName=(a,b)=>a.name.localeCompare(b.name),found=results.filter(r=>r.file&&!r.near).sort(byName),close=results.filter(r=>r.near).sort(byName),missing=results.filter(r=>!r.file).sort(byName);
writeFileSync(join(outDir,'MANIFEST.txt'),[
 `Source code of the GPL programs shipped with Adam Studio ${version}.`,'',
 `FFmpeg ${FFMPEG_VERSION} (gyan.dev full build, commit ${FFMPEG}) and yt-dlp ${YTDLP}. Each library is at the version printed in the build's README, included as ffmpeg-README.txt with the full configuration.`,
 'The build itself is by gyan.dev (https://www.gyan.dev/ffmpeg/builds/): its build scripts and any patch are not published as part of these archives. yt-dlp.exe also bundles Python and the packages of its official release.','',
 `FETCHED AT THE VERSION OF THE BUILD (${found.length})`,...found.map(r=>`${r.name}  ${r.ver}\n  ${r.url}\n  sha256 ${sha(r.file)}`),'',
 `THE VERSION OF THE BUILD IS NOT PUBLISHED ANY MORE: CLOSEST VERSION, NOT THE EXACT SOURCE (${close.length})`,...close.map(r=>`${r.name}  build: ${r.ver}\n  ${r.url}\n  sha256 ${sha(r.file)}`),'',
 `NOT FOUND AT THIS VERSION (${missing.length})`,...missing.map(r=>`${r.name}  ${r.ver}  ${r.urls[0]}`),'',
 'ENABLED WITHOUT A VERSION IN THE README',...UNVERSIONED,'',
].join('\n'));
writeFileSync(join(outDir,'ffmpeg-README.txt'),readme);
const zip=join(dirname(outDir),`AdamStudio-${version}-GPL-sources.zip`);rmSync(zip,{force:true});
execFileSync(join(process.env.SystemRoot||'C:/Windows','System32/tar.exe'),['-a','-cf',zip,'-C',outDir,'MANIFEST.txt','ffmpeg-README.txt','sources'],{stdio:'inherit'});
console.log(`GPL_SOURCES_READY ${zip} ${(statSync(zip).size/1e6).toFixed(0)} MB exact ${found.length} closest ${close.length}: ${close.map(m=>m.name).join(', ')} missing ${missing.length}: ${missing.map(m=>m.name).join(', ')}`);
