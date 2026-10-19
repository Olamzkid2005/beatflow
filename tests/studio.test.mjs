import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDocument, createNode, resolveDocument, resolveBranding, DEFAULT_BRANDING, documentSchema, variablesForTrack, migratePreset } from '../lib/studio/document.ts';
import { evaluateNode, sampleTrack } from '../lib/studio/timeline.ts';
import { FIRST_LIGHT_TEMPLATE } from '../lib/templates/first-light.ts';
import { ORBITAL_TEMPLATE } from '../lib/templates/orbital.ts';
import { trackSnapshot } from '../lib/studio/document.ts';
import { resolveImageBindings } from '../lib/studio/document.ts';

test('customizing preserves preset text fitting, conditional text and graphic recipes',()=>{
 for(const preset of [FIRST_LIGHT_TEMPLATE,ORBITAL_TEMPLATE]){
  const doc=migratePreset(preset);
  preset.layers.forEach((layer,i)=>{
   const node=doc.nodes[i];
   if(layer.type==='text'){
    assert.equal(node.minFontSize,layer.minFontSize);
    assert.equal(node.lineHeight,layer.lineHeight);
    assert.equal(node.requires,layer.requires??null);
   }
   if(layer.type==='graphic'){
    assert.deepEqual(node.orbitalSettings,layer.settings);
    assert.deepEqual(node.orbitalColors,layer.colors);
   }
  });
 }
});
test('preview and approval resolve the same title, branding, image bindings and variables',()=>{
 const doc=createDocument('Logo');doc.nodes=[createNode('image',{binding:'logo'})];
 const brand={...DEFAULT_BRANDING,logoAssetId:'brand-logo',purchaseUrl:'https://example.com/beat'};
 const track={file:{name:'Night.wav'},templateId:doc.id,title:' Night ',bpm:'',key:'',purchaseUrl:'',backgroundId:null};
 const snapshot=trackSnapshot(track,[doc],brand);
 assert.equal(snapshot.vars.track_name,'Night');
 assert.equal(snapshot.vars.purchase_url,brand.purchaseUrl);
 assert.deepEqual(resolveImageBindings(snapshot.document,track.backgroundId),{logo:'brand-logo'});
});
test('node-specific asset IDs do not compete with inherited logo bindings',()=>{
 const doc=createDocument();doc.nodes=[createNode('image',{assetId:'photo'}),createNode('image',{binding:'logo'})];
 const resolved=resolveDocument(doc,[doc],{...DEFAULT_BRANDING,logoAssetId:'logo-id'});
 assert.deepEqual(resolveImageBindings(resolved.document,null),{photo:'photo',logo:'logo-id'});
});

test('portable packages reject unreferenced assets instead of creating orphan records',async()=>{
 const {importTemplate}=await import('../lib/studio/library.ts');
 const file=new File([JSON.stringify({format:'beatflow-template',version:1,document:createDocument(),assets:[{id:'unused',name:'x.png',data:'data:image/png;base64,AA=='}]})],'template.json');
 await assert.rejects(importTemplate(file),/unreferenced/i);
});
test('legacy presets migrate to valid editor-neutral documents', () => { const d=migratePreset(FIRST_LIGHT_TEMPLATE);assert.equal(documentSchema.parse(d).nodes.length,FIRST_LIGHT_TEMPLATE.layers.length); });
test('master branding propagates but queued snapshots remain immutable', () => {
 const master=createDocument('Official');master.branding={producerName:'Nova',color:'#123456'};
 const child=createDocument('Dark');child.parentId=master.id;child.branding={message:'Buy this beat'};child.nodes=[createNode('text',{brandRole:'color'})];
 const snapshot=resolveDocument(child,[master,child],DEFAULT_BRANDING);
 assert.equal(snapshot.branding.producerName,'Nova');assert.equal(snapshot.document.nodes[0].fill,'#123456');
 master.branding.producerName='Changed';assert.equal(resolveBranding(child,[master,child]).producerName,'Changed');assert.equal(snapshot.branding.producerName,'Nova');
 master.parentId=child.id;assert.throws(()=>resolveBranding(child,[master,child]),/cycle/);
});
test('all requested variables receive supplied/default values without guessing BPM or key',()=>{const v=variablesForTrack('Midnight.mp3',{bpm:'140'}, {...DEFAULT_BRANDING,producerName:'Nova',purchaseUrl:'https://example.com'},new Date('2026-01-01'));assert.equal(v.year,'2026');assert.equal(v.purchase_url,'https://example.com');assert.equal(v.track_name,'Midnight');assert.equal(v.bpm,'140');assert.equal(v.key,undefined);});
test('timeline seeks are deterministic, ordered and obey fade/clip boundaries',()=>{
 const track={property:'x',frames:[{time:2,value:100,easing:'linear'},{time:0,value:0,easing:'linear'}]};
 assert.equal(sampleTrack(track,1),50);
 const n=createNode('rect',{start:1,end:5,fadeIn:1,fadeOut:1,animations:[track]});
 assert.equal(evaluateNode(n,0,6).visible,false);assert.equal(evaluateNode(n,1.5,6).opacity,.5);assert.equal(evaluateNode(n,4.5,6).opacity,.5);assert.equal(evaluateNode(n,5,6).visible,false);assert.equal(evaluateNode(n,1.5,6).x,75);
});
test('invalid duplicate layers and keyframe values are rejected',()=>{const d=createDocument();const n=createNode('rect');d.nodes=[n,n];assert.equal(documentSchema.safeParse(d).success,false);});
