import type {StudioDocument} from './document';
import type {RenderVariables} from '@/lib/renderer/template-schema';
import type {StudioAssets} from './render';
import type {AudioFeatureTable} from '@/lib/renderer/audio-features';
import type { FFmpeg } from '@ffmpeg/ffmpeg';
let loading: Promise<{ FFmpeg: new () => FFmpeg }> | null = null;
function loadLocalEncoder(): Promise<{ FFmpeg: new () => FFmpeg }> {
 const runtime = globalThis as typeof globalThis & { FFmpegWASM?: { FFmpeg: new () => FFmpeg } };
 if (runtime.FFmpegWASM) return Promise.resolve(runtime.FFmpegWASM);
 loading ??= new Promise<{ FFmpeg: new () => FFmpeg }>((resolve,reject)=>{const script=document.createElement('script');script.src='/ffmpeg/ffmpeg.js';script.onload=()=>runtime.FFmpegWASM?resolve(runtime.FFmpegWASM):reject(new Error('Compatibility encoder did not initialize.'));script.onerror=()=>{script.remove();reject(new Error('Could not load the local compatibility encoder.'));};document.head.appendChild(script);}).catch(error=>{loading=null;throw error;});
 return loading;
}
/** Slow compatibility path. All binaries are self-hosted, never fetched from a CDN. */
export async function encodeWithFfmpeg(input:{document:StudioDocument;vars:RenderVariables;assets:StudioAssets;audio:File;duration:number;features?:AudioFeatureTable;fps:number},options:{signal?:AbortSignal;onProgress?:(stage:string,pct:number)=>void}):Promise<Blob>{
 const [{FFmpeg},{drawDocument}]=await Promise.all([loadLocalEncoder(),import('./render')]);
 const ffmpeg=new FFmpeg();const abort=()=>ffmpeg.terminate();options.signal?.addEventListener('abort',abort,{once:true});
 try{
  options.signal?.throwIfAborted();options.onProgress?.('Loading compatibility encoder',0);
  const loadTimeout=AbortSignal.timeout(60000);
  const loadSignal=options.signal?AbortSignal.any([options.signal,loadTimeout]):loadTimeout;
  await ffmpeg.load({coreURL:'/ffmpeg/ffmpeg-core.js',wasmURL:'/ffmpeg/ffmpeg-core.wasm'},{signal:loadSignal});
  options.signal?.throwIfAborted();const canvas=new OffscreenCanvas(1920,1080),ctx=canvas.getContext('2d',{alpha:false});if(!ctx)throw new Error('Canvas is unavailable.');
  const count=Math.max(1,Math.ceil(input.duration*input.fps));let stagedBytes=0;
  // JPEG staging and WASM share memory: reject rather than exhaust an older machine.
  const limit=96*1024*1024;
  for(let i=0;i<count;i++){
   options.signal?.throwIfAborted();drawDocument(ctx,input.document,input.vars,input.assets,{time:i/input.fps,duration:input.duration,features:input.features});
   const jpg=await canvas.convertToBlob({type:'image/jpeg',quality:.85});stagedBytes+=jpg.size;if(stagedBytes>limit)throw new Error('Compatibility render exceeded its 96 MiB frame budget. Use WebCodecs in Chrome/Edge or a shorter track.');
   await ffmpeg.writeFile(`frame-${String(i).padStart(5,'0')}.jpg`,new Uint8Array(await jpg.arrayBuffer()));options.onProgress?.('Staging compatibility frames',(i+1)/count);
  }
  await ffmpeg.writeFile('source-audio',new Uint8Array(await input.audio.arrayBuffer()));
  ffmpeg.on('progress',event=>options.onProgress?.('Compatibility encoding',Math.max(0,Math.min(1,event.progress))));
  const code=await ffmpeg.exec(['-framerate',String(input.fps),'-i','frame-%05d.jpg','-i','source-audio','-t',String(input.duration),'-c:v','libx264','-preset','veryfast','-profile:v','high','-level:v','4.0','-b:v',input.fps>1?'3000k':'1800k','-pix_fmt','yuv420p','-vf','scale=in_range=full:in_color_matrix=bt601:out_range=tv:out_color_matrix=bt709','-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709','-color_range','tv','-c:a','aac','-b:a','288k','-ar','48000','-ac','2','-movflags','+faststart','output.mp4']);
  options.signal?.throwIfAborted();if(code!==0)throw new Error(`Compatibility encoder failed (${code}).`);
  const bytes=await ffmpeg.readFile('output.mp4');if(typeof bytes==='string'||bytes.byteLength===0)throw new Error('Compatibility encoder produced no MP4.');
  if(bytes.byteLength>208*1024*1024)throw new Error('Compatibility output exceeded the 208 MiB limit.');
  return new Blob([new Uint8Array(bytes)],{type:'video/mp4'});
 }catch(error){options.signal?.throwIfAborted();throw error;}finally{options.signal?.removeEventListener('abort',abort);ffmpeg.terminate();}
}
