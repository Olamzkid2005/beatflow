"use client";
import { useEffect,useRef,useState } from 'react';
import {Stage,Layer,Rect,Transformer,Line} from 'react-konva';
import type Konva from 'konva';
import type {StudioDocument,StudioNode} from '@/lib/studio/document';
import {evaluateNode} from '@/lib/studio/timeline';
export default function TemplateCanvas({document:doc,selected,onSelect,onChange,time,duration,snapping}:{document:StudioDocument;selected:string[];onSelect:(ids:string[])=>void;onChange:(nodes:StudioNode[])=>void;time:number;duration:number;snapping:boolean}){
 const host=useRef<HTMLDivElement>(null),transformer=useRef<Konva.Transformer>(null),layer=useRef<Konva.Layer>(null);const [width,setWidth]=useState(800);const [guides,setGuides]=useState<number[]>([]);
 useEffect(()=>{const el=host.current;if(!el)return;const observer=new ResizeObserver(()=>setWidth(el.clientWidth));observer.observe(el);setWidth(el.clientWidth);return()=>observer.disconnect();},[]);
 useEffect(()=>{const tr=transformer.current,l=layer.current;if(!tr||!l)return;tr.nodes(selected.flatMap(id=>{const node=l.findOne('#'+id);return node?[node]:[];}));tr.getLayer()?.batchDraw();},[selected,doc.nodes,time,width]);
 const scale=width/1920;
 const select=(node:StudioNode,add:boolean)=>{const ids=node.groupId?doc.nodes.filter(n=>n.groupId===node.groupId&&!n.locked).map(n=>n.id):[node.id];onSelect(add?[...new Set([...selected,...ids])]:ids);};
 return <div ref={host} className="absolute inset-0" aria-label="Interactive design canvas"><Stage width={width} height={width*1080/1920} scaleX={scale} scaleY={scale} onMouseDown={e=>{if(e.target===e.target.getStage())onSelect([]);}} onTouchStart={e=>{if(e.target===e.target.getStage())onSelect([]);}}><Layer ref={layer}>
 {doc.nodes.map(source=>{const n=evaluateNode(source,time,duration);if(!n.visible||n.locked)return null;return <Rect key={n.id} id={n.id} x={n.x} y={n.y} width={n.width} height={n.height} rotation={n.rotation} scaleX={n.scaleX} scaleY={n.scaleY} fill="rgba(255,255,255,0.001)" stroke={selected.includes(n.id)?'#cabeff':undefined} strokeWidth={selected.includes(n.id)?1:0} draggable onClick={e=>select(source,e.evt.shiftKey)} onTap={()=>select(source,false)} onDragStart={()=>{if(!selected.includes(n.id))select(source,false);}}
 onDragMove={e=>{if(!snapping)return;const target=e.target,found:number[]=[];let x=target.x(),y=target.y();for(const guide of [0,960,1920]){if(Math.abs(x-guide)<10){x=guide;found.push(guide);}if(Math.abs(x+n.width/2-guide)<10){x=guide-n.width/2;found.push(guide);}}for(const guide of [0,540,1080]){if(Math.abs(y-guide)<10)y=guide;if(Math.abs(y+n.height/2-guide)<10)y=guide-n.height/2;}target.position({x,y});setGuides(found);}}
 onDragEnd={e=>{setGuides([]);const dx=e.target.x()-n.x,dy=e.target.y()-n.y;const ids=selected.includes(n.id)?selected:[n.id];onChange(doc.nodes.map(v=>ids.includes(v.id)?{...v,x:v.x+dx,y:v.y+dy}:v));}}
 onTransformEnd={()=>{const l=layer.current;if(!l)return;onChange(doc.nodes.map(v=>{if(!selected.includes(v.id))return v;const shape=l.findOne('#'+v.id);return shape?{...v,x:shape.x(),y:shape.y(),rotation:shape.rotation(),scaleX:Math.max(.01,shape.scaleX()),scaleY:Math.max(.01,shape.scaleY())}:v;}));}}/>;})}
 {guides.map(g=><Line key={g} points={[g,0,g,1080]} stroke="#8ce5d7" strokeWidth={1} dash={[5,5]}/>)}
 <Transformer ref={transformer} flipEnabled={false} rotateEnabled boundBoxFunc={(oldBox,newBox)=>newBox.width<8||newBox.height<8?oldBox:newBox}/>
 </Layer></Stage></div>;
}
