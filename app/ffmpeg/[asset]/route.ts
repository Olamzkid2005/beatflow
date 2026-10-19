import {readFile} from 'node:fs/promises';
import path from 'node:path';
export const runtime='nodejs';
export async function GET(_request:Request,{params}:{params:Promise<{asset:string}>}){
 const {asset}=await params;
 if(!['ffmpeg-core.js','ffmpeg-core.wasm','ffmpeg.js','814.ffmpeg.js'].includes(asset))return new Response('Not found',{status:404});
 try {const file=asset.startsWith('ffmpeg-core')?path.join(process.cwd(),'node_modules/@ffmpeg/core/dist/umd',asset):path.join(process.cwd(),'node_modules/@ffmpeg/ffmpeg/dist/umd',asset);const bytes=await readFile(file);return new Response(bytes,{headers:{'Content-Type':asset.endsWith('.wasm')?'application/wasm':'text/javascript','Cache-Control':'public, max-age=86400'}});}
 catch{return new Response('Compatibility encoder assets are not installed.',{status:503});}
}
