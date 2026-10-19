import { decodeAudioFile } from "@/lib/renderer/audio";
import { decodeImageFile, ensureTemplateFonts, resolveFontFamily } from "@/lib/renderer/assets";
import { analyzeAudio } from "@/lib/renderer/audio-analysis";
import { sampleFeatures, type AudioFeatureTable } from "@/lib/renderer/audio-features";
import { encodeMp4 } from "@/lib/renderer/encode";
import { checkRenderCapabilities } from "@/lib/renderer/capabilities";
import { drawOrbital, prepareOrbital, ORBITAL_DEFAULTS, type PreparedOrbital } from "@/lib/renderer/graphics";
import { interpolateTemplateValue, type RenderVariables } from "@/lib/renderer/template-schema";
import { layoutText, type DrawingContext } from "@/lib/renderer/scene";
import { documentSchema, isMovingDocument, type StudioDocument, type StudioNode } from "./document";
import { evaluateNode } from "./timeline";
export type StudioAssets = Record<string, ImageBitmap>;
export type StudioFrame = { time: number; duration: number; features?: AudioFeatureTable };
const graphics = new WeakMap<StudioNode, PreparedOrbital>();
const textLayouts = new WeakMap<StudioNode, {key: string; layout: ReturnType<typeof layoutText>}>();
export function drawDocument(ctx: DrawingContext, doc: StudioDocument, vars: RenderVariables, assets: StudioAssets, frame: StudioFrame): void {
  ctx.save();ctx.clearRect(0,0,1920,1080);
  if (doc.canvas.gradient) { const g=ctx.createLinearGradient(0,0,1920,1080);g.addColorStop(0,doc.canvas.backgroundColor);g.addColorStop(1,doc.canvas.endColor);ctx.fillStyle=g; }
  else ctx.fillStyle=doc.canvas.backgroundColor;
  ctx.fillRect(0,0,1920,1080);
  for (const source of doc.nodes) {
    const node=evaluateNode(source,frame.time,frame.duration);
    if (!node.visible || node.opacity<=0) continue;
    ctx.save();ctx.translate(node.x,node.y);ctx.rotate(node.rotation*Math.PI/180);ctx.scale(node.scaleX,node.scaleY);ctx.globalAlpha=node.opacity;
    ctx.fillStyle=node.fill;ctx.strokeStyle=node.stroke;ctx.lineWidth=node.strokeWidth;
    ctx.shadowColor=node.shadowColor;ctx.shadowBlur=node.shadowBlur;ctx.shadowOffsetX=node.shadowOffsetX;ctx.shadowOffsetY=node.shadowOffsetY;
    const {width:w,height:h}=node;
    if(node.type==='text') {
      if(node.requires&&!vars[node.requires]?.trim()){ctx.restore();continue;}
      const raw=interpolateTemplateValue(node.text,vars);const text=node.uppercase?raw.toUpperCase():raw;
      const family=resolveFontFamily(node.fontFamily);
      const key=JSON.stringify([text,node.fontSize,node.minFontSize,w,h,node.fontWeight,family,node.letterSpacing,node.maxLines,node.lineHeight]);
      let cached=textLayouts.get(source);
      if(!cached||cached.key!==key){cached={key,layout:layoutText({text,fontSize:node.fontSize,minFontSize:Math.min(node.minFontSize,node.fontSize),maxWidth:w,maxHeight:h,weight:node.fontWeight,family,letterSpacing:node.letterSpacing,maxLines:node.maxLines,lineHeight:node.lineHeight,measure:(value,font)=>{ctx.font=font;ctx.letterSpacing='0px';return ctx.measureText(value).width;}})};textLayouts.set(source,cached);}
      const layout=cached.layout;
      ctx.font=`${node.fontWeight} ${layout.fontSize}px ${family}`;ctx.letterSpacing=`${node.letterSpacing}px`;ctx.textBaseline='top';ctx.textAlign=node.align;
      const x=node.align==='left'?0:node.align==='center'?w/2:w;
      layout.lines.forEach((line,i)=>{if(node.strokeWidth)ctx.strokeText(line,x,i*layout.lineHeight);ctx.fillText(line,x,i*layout.lineHeight);});
    } else if(node.type==='image') {
      const image=assets[node.binding==='asset'?(node.assetId??''):node.binding];
      if(image){ctx.beginPath();ctx.rect(0,0,w,h);ctx.clip();ctx.filter=`blur(${node.blur}px) brightness(${node.brightness}) contrast(${node.contrast})`;
        const scale=node.fit==='cover'?Math.max(w/image.width,h/image.height):Math.min(w/image.width,h/image.height);const dw=image.width*scale,dh=image.height*scale;
        ctx.drawImage(image,(w-dw)/2+node.cropX*(dw-w)/2,(h-dh)/2+node.cropY*(dh-h)/2,dw,dh);}
    } else if(node.type==='orbital') {
      let prepared=graphics.get(source);if(!prepared){prepared=prepareOrbital(node.orbitalSettings??ORBITAL_DEFAULTS,node.orbitalColors??{base:'#0b0b12',ink:node.fill,muted:'#4d4860',glow:'#e3dcff'});graphics.set(source,prepared);}
      drawOrbital(ctx,prepared,{x:0,y:0,width:w,height:h},{timeSeconds:frame.time,durationSeconds:frame.duration,features:frame.features?sampleFeatures(frame.features,frame.time):{rms:0,low:0,mid:0,high:0}});
    } else if(node.type==='waveform') {
      const bars=80,energy=frame.features?sampleFeatures(frame.features,frame.time):null;
      for(let i=0;i<bars;i++){const feature=frame.features?sampleFeatures(frame.features,frame.duration*i/bars).rms:0;const height=Math.max(2,feature*h*(0.6+(energy?.rms??0)*0.4));ctx.fillRect(i*w/bars,(h-height)/2,Math.max(1,w/bars-3),height);}
    } else if(node.type==='progress') {ctx.fillRect(0,0,w*Math.min(1,Math.max(0,frame.time/frame.duration)),h);}
    else {
      if(node.gradient){const g=ctx.createLinearGradient(0,0,w,h);g.addColorStop(0,node.fill);g.addColorStop(1,node.endFill);ctx.fillStyle=g;}
      ctx.beginPath();if(node.type==='ellipse')ctx.ellipse(w/2,h/2,w/2,h/2,0,0,Math.PI*2);else if(node.type==='line'){ctx.moveTo(0,h/2);ctx.lineTo(w,h/2);}else ctx.roundRect(0,0,w,h,Math.min(node.radius,w/2,h/2));
      if(node.type!=='line')ctx.fill();if(node.strokeWidth||node.type==='line'){ctx.lineWidth=node.strokeWidth||2;ctx.stroke();}
    }
    ctx.restore();
  }
  ctx.restore();
}
export async function loadStudioAssets(doc: StudioDocument, files: Record<string,File>): Promise<StudioAssets> {
  const assets:StudioAssets={};
  try {for(const node of doc.nodes){if(node.type!=='image'||!node.visible)continue;const key=node.binding==='asset'?node.assetId:node.binding;if(!key)throw new Error(`Choose an image for layer “${node.name}”.`);if(assets[key])continue;const file=files[key];if(!file)throw new Error(`Missing image for layer “${node.name}”.`);assets[key]=await decodeImageFile(file);}return assets;}
  catch(error){Object.values(assets).forEach(a=>a.close());throw error;}
}
export async function ensureStudioFonts(doc:StudioDocument):Promise<void>{
  await ensureTemplateFonts({schemaVersion:1,name:doc.name,canvas:doc.canvas,layers:doc.nodes.filter(n=>n.type==='text').map(n=>({type:'text',value:n.text,x:n.x,y:n.y,maxWidth:n.width,fontFamily:n.fontFamily,fontWeight:n.fontWeight,fontSize:n.fontSize,minFontSize:16,lineHeight:1.1,color:n.fill,align:n.align,uppercase:n.uppercase,letterSpacing:n.letterSpacing}))});
}
export async function renderDocument(input:{document:StudioDocument;audio:File;vars:RenderVariables;files:Record<string,File>},options:{signal?:AbortSignal;encoder?:'auto'|'webcodecs'|'ffmpeg';onProgress?:(stage:string,pct:number)=>void}={}):Promise<Blob>{
  const doc=documentSchema.parse(input.document),vars=structuredClone(input.vars),moving=isMovingDocument(doc),fps=moving?30:1;
  const capabilities=await checkRenderCapabilities({fps,bitrate:moving?3000000:1800000});
  const fallback=options.encoder==='ffmpeg'||(!capabilities.supported&&options.encoder!=='webcodecs');
  if(!capabilities.supported&&!fallback)throw new Error(capabilities.reasons.join(' '));
  options.signal?.throwIfAborted();options.onProgress?.('Decoding audio',0);
  const audio=await decodeAudioFile(input.audio,moving?300:900);options.signal?.throwIfAborted();
  let features:AudioFeatureTable|undefined;
  if(doc.nodes.some(n=>n.type==='orbital'||n.type==='waveform')){options.onProgress?.('Analyzing audio',0);features=(await analyzeAudio(audio.buffer,{signal:options.signal,onProgress:p=>options.onProgress?.('Analyzing audio',p)})).table;}
  await ensureStudioFonts(doc);const assets=await loadStudioAssets(doc,input.files);
  try {
    if(fallback){const {encodeWithFfmpeg}=await import('./fallback');return await encodeWithFfmpeg({document:doc,vars,assets,audio:input.audio,duration:audio.duration,features,fps},options);}
    const canvas=new OffscreenCanvas(1920,1080),ctx=canvas.getContext('2d',{alpha:false});if(!ctx)throw new Error('Canvas is unavailable.');
    const draw=(time:number)=>drawDocument(ctx,doc,vars,assets,{time,duration:audio.duration,features});draw(0);
    return await encodeMp4({canvas,audio:audio.buffer,fps,bitrate:moving?3000000:1800000,signal:options.signal,drawFrame:moving?(time)=>draw(time):undefined,onProgress:(stage,pct)=>options.onProgress?.(stage,pct)});
  }finally{Object.values(assets).forEach(a=>a.close());}
}
