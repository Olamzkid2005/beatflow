import { documentSchema, documentAssetIds, resolveBranding, resolveDocument, brandingSchema, DEFAULT_BRANDING, type StudioDocument, type Branding } from "./document";
import { getRecord, putRecord, putRecords, listRecords, deleteRecord, type StoredAsset } from "./store";
export async function listTemplates():Promise<StudioDocument[]>{return (await listRecords<unknown>('template')).map(d=>documentSchema.parse(d)).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));}
export async function readBranding():Promise<Branding>{const brand=await getRecord<unknown>('brand','default');return brand?brandingSchema.parse(brand):{...DEFAULT_BRANDING};}
export async function saveBranding(brand:Branding):Promise<void>{await putRecord('brand','default',brandingSchema.parse(brand));}
export async function saveTemplate(doc:StudioDocument):Promise<StudioDocument>{
 const parsed=documentSchema.parse({...doc,revision:doc.revision+1,updatedAt:new Date().toISOString()});
 const others=await listTemplates();resolveBranding(parsed,[...others.filter(d=>d.id!==parsed.id),parsed]);
 await putRecord('template',parsed.id,parsed);return parsed;
}
export async function removeTemplate(id:string):Promise<void>{const all=await listTemplates();if(all.some(d=>d.parentId===id))throw new Error('This master has inherited templates. Remove their inheritance before deleting it.');await deleteRecord('template',id);const value=await getRecord<string>('preference','default-template');if(value===id)await deleteRecord('preference','default-template');}
export async function duplicateTemplate(doc:StudioDocument):Promise<StudioDocument>{const now=new Date().toISOString();return saveTemplate({...structuredClone(doc),id:crypto.randomUUID(),name:`${doc.name.slice(0,70)} copy`,createdAt:now,updatedAt:now,revision:1});}
export async function defaultTemplateId():Promise<string|undefined>{return getRecord<string>('preference','default-template');}
export async function setDefaultTemplate(id:string):Promise<void>{if(!await getRecord('template',id))throw new Error('Save the template first.');await putRecord('preference','default-template',id);}
export function downloadBlob(blob:Blob,name:string):void {const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export async function exportTemplate(doc:StudioDocument,all:StudioDocument[],brand:Branding):Promise<Blob>{
 // Flatten branding references so an imported design never depends on another machine's IDs.
 const {document:flattened,branding:resolved}=resolveDocument(doc,all,brand);
 const ids=[...new Set([...documentAssetIds(flattened),...(resolved.logoAssetId?[resolved.logoAssetId]:[])])];
 const assets=[];let bytes=0;
 for(const id of ids){const asset=await getRecord<StoredAsset>('asset',id);if(!asset)throw new Error('A template asset is missing. Restore it before exporting.');bytes+=asset.blob.size;if(bytes>64*1024*1024)throw new Error('Portable template assets exceed the 64 MiB export limit.');
 const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(reader.error);reader.readAsDataURL(asset.blob);});assets.push({id,name:asset.name,type:asset.type,data});}
 return new Blob([JSON.stringify({format:'beatflow-template',version:1,document:flattened,assets},null,2)],{type:'application/json'});
}
export async function importTemplate(file:File):Promise<StudioDocument>{
 if(file.size>90*1024*1024)throw new Error('Template import exceeds 90 MiB.');
 const payload=JSON.parse(await file.text());if(payload.format!=='beatflow-template'||payload.version!==1||!Array.isArray(payload.assets))throw new Error('Not a supported BeatFlow template package.');
 const doc=documentSchema.parse(payload.document);if(doc.parentId)throw new Error('Portable templates must include resolved branding.');
 if(payload.assets.length>100)throw new Error('Too many imported assets.');
 const referenced=new Set([...documentAssetIds(doc),...(doc.branding.logoAssetId?[doc.branding.logoAssetId]:[])]);
 for(const asset of payload.assets)if(!referenced.has(asset.id))throw new Error('The package contains an unreferenced asset.');
 const remap=new Map<string,string>();const items:Array<{kind:'asset'|'template';id:string;value:unknown}>=[];let bytes=0;
 for(const asset of payload.assets){if(typeof asset.id!=='string'||typeof asset.name!=='string'||typeof asset.data!=='string'||!/^data:image\/(png|jpeg|webp|gif);base64,/.test(asset.data))throw new Error('Only embedded PNG, JPEG, WebP or GIF assets are supported.');
 if(remap.has(asset.id))throw new Error('Duplicate imported asset ID.');
 const raw=atob(asset.data.slice(asset.data.indexOf(',')+1));bytes+=raw.length;if(bytes>64*1024*1024)throw new Error('Imported assets exceed 64 MiB.');
 const type=asset.data.slice(5,asset.data.indexOf(';'));const blob=new Blob([Uint8Array.from(raw,c=>c.charCodeAt(0))],{type});const id=crypto.randomUUID();remap.set(asset.id,id);items.push({kind:'asset',id,value:{id,name:asset.name,blob,type,createdAt:new Date().toISOString()} satisfies StoredAsset});}
 const mapId=(id:string|null)=>{if(!id)return null;const replacement=remap.get(id);if(!replacement)throw new Error('The package is missing an embedded asset.');return replacement;};
 doc.nodes=doc.nodes.map(n=>({...n,assetId:mapId(n.assetId)}));if(doc.branding.logoAssetId)doc.branding.logoAssetId=mapId(doc.branding.logoAssetId);
 const now=new Date().toISOString();doc.id=crypto.randomUUID();doc.createdAt=now;doc.updatedAt=now;doc.revision=1;
 items.push({kind:'template',id:doc.id,value:doc});await putRecords(items);return doc;
}
