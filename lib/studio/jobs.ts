import {z} from 'zod';
import {documentSchema,trackSnapshot,resolveImageBindings,type StudioDocument,type Branding} from './document';
import {getRecord,listRecords,putRecord,putRecords,assetFile,type StoredAsset} from './store';
import {renderDocument} from './render';
import {uploadToResumableSession,UploadOutcomeUnknownError,UploadError,DEFAULT_CHUNK_SIZE} from '@/lib/youtube/uploader';
import {videoMetadataSchema} from '@/lib/youtube/metadata';
import {addHistoryEntry,readHistory} from '@/lib/history';
export const jobSchema=z.object({
 id:z.string(),batchId:z.string(),createdAt:z.string(),approvedAt:z.string().nullable(),
 uploadApproved:z.boolean().default(false),title:z.string().min(1).max(100),description:z.string(),tags:z.array(z.string()),publishAt:z.string().nullable(),
 document:documentSchema,vars:z.record(z.string(),z.string()),audioAssetId:z.string(),imageBindings:z.record(z.string(),z.string()),
 state:z.enum(['draft','queued','rendering','rendered','initializing','uploading','accepted','processing','scheduled','published','private','unlisted','paused','failed','unknown','cancelled']),
 stage:z.string(),percent:z.number(),error:z.string().nullable(),outputAssetId:z.string().nullable(),sessionUri:z.string().nullable(),videoId:z.string().nullable(),attemptStartedAt:z.string().nullable(),
}).strict();
export type BatchJob=z.infer<typeof jobSchema>;
export type TrackDraft={id:string;file:File;templateId:string;title:string;bpm:string;key:string;purchaseUrl:string;publishAt:string;description:string;tags:string[];backgroundId:string|null};
export async function listJobs():Promise<BatchJob[]>{return(await listRecords<unknown>('job')).map(value=>jobSchema.parse(value)).sort((a,b)=>a.createdAt.localeCompare(b.createdAt));}
export async function saveJob(job:BatchJob):Promise<void>{await putRecord('job',job.id,jobSchema.parse(job));}
export async function approveBatch(tracks:TrackDraft[],templates:StudioDocument[],brand:Branding,uploadApproved=false):Promise<BatchJob[]>{
 if(!tracks.length)throw new Error('Add at least one beat.');if(tracks.length>100)throw new Error('Use at most 100 tracks per batch.');
 const batchId=crypto.randomUUID(),now=new Date().toISOString(),jobs:BatchJob[]=[],items:Array<{kind:'asset'|'job';id:string;value:unknown}>=[];
 const reserved=new Set((await listJobs()).filter(j=>j.publishAt&&!['failed','cancelled'].includes(j.state)).map(j=>Date.parse(j.publishAt!)));
 for (const receipt of await readHistory()) if (receipt.publishAt) reserved.add(Date.parse(receipt.publishAt));
 for(const track of tracks){
  const metadata=videoMetadataSchema.parse({title:track.title,description:track.description,tags:track.tags,privacyStatus:'private',publishAt:track.publishAt});
  if(!track.publishAt)throw new Error('Each batch track needs an explicit future publication date.');
  const date=Date.parse(track.publishAt);if(reserved.has(date))throw new Error('A publication slot is already reserved. Regenerate the schedule preview.');reserved.add(date);
  const resolved=trackSnapshot({...track,title:metadata.title},templates,brand),audioId=crypto.randomUUID(),bindings:Record<string,string>={};
  items.push({kind:'asset',id:audioId,value:{id:audioId,name:track.file.name,blob:track.file,type:track.file.type,createdAt:now} satisfies StoredAsset});
  for(const [binding,original] of Object.entries(resolveImageBindings(resolved.document,track.backgroundId))){
   const asset=await getRecord<StoredAsset>('asset',original);if(!asset)throw new Error('An image asset is missing. Re-import it before approving.');const snapshotId=crypto.randomUUID();items.push({kind:'asset',id:snapshotId,value:{...asset,id:snapshotId}});bindings[binding]=snapshotId;
  }
  const vars=resolved.vars;
  const job=jobSchema.parse({id:crypto.randomUUID(),batchId,createdAt:now,approvedAt:now,uploadApproved,title:metadata.title,description:metadata.description,tags:metadata.tags,publishAt:metadata.publishAt,document:resolved.document,vars,audioAssetId:audioId,imageBindings:bindings,state:'queued',stage:'Approved',percent:0,error:null,outputAssetId:null,sessionUri:null,videoId:null,attemptStartedAt:null});jobs.push(job);items.push({kind:'job',id:job.id,value:job});
 }
 await putRecords(items);return jobs;
}
export async function recoverInterruptedJobs():Promise<void>{
 for(const job of await listJobs()){
  if(job.state==='rendering')await saveJob({...job,state:'paused',stage:'Render interrupted; restart safely',percent:0});
  if(job.state==='initializing')await saveJob({...job,state:'unknown',error:'Upload initialization was interrupted. Check the channel before creating another session.',stage:'Needs recovery'});
  if(job.state==='uploading')await saveJob({...job,state:'paused',stage:'Upload interrupted; resume existing session'});
 }
}
export function nextJob(jobs:BatchJob[]):BatchJob|undefined{return jobs.find(j=>j.approvedAt&&['queued','rendered'].includes(j.state));}
export function canRun(job:BatchJob):boolean{return Boolean(job.approvedAt)&&!job.videoId&&['queued','rendered','paused','failed'].includes(job.state);}
export async function retryJob(job:BatchJob):Promise<void>{
 if(job.videoId)throw new Error('This job already has a YouTube video. Refresh its status instead of uploading again.');
 if(job.state==='unknown'&&!job.sessionUri)throw new Error('Resolve the unknown outcome on your channel before retrying.');
 await saveJob({...job,state:job.outputAssetId?'rendered':'queued',error:null});
}
async function api(path:string,body:unknown,signal?:AbortSignal):Promise<Record<string,unknown>>{
 const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(30000)]):AbortSignal.timeout(30000)});
 const data=await response.json().catch(()=>null);if(!response.ok||!data)throw new Error(data?.issues?.map((i:{message:string})=>i.message).join(' ')||data?.error||`Request failed (${response.status}).`);return data;
}
export async function refreshJob(job:BatchJob):Promise<BatchJob>{
 if(!job.videoId)return job;const result=await api('/api/youtube/video-status',{videoIds:[job.videoId]});const videos=result.videos as Array<Record<string,unknown>>|undefined;const video=videos?.find(v=>v.videoId===job.videoId);
 if(!video){const missing={...job,state:'unknown' as const,error:'YouTube did not return this video. Check its availability and the connected channel.'};await saveJob(missing);return missing;}
 let state:BatchJob['state']='processing';let error:string|null=null;
 if(video.failureReason||['failed','rejected'].includes(String(video.uploadStatus))||video.processingStatus==='failed'){state='failed';error=String(video.failureReason??'YouTube processing failed.');}
 else if(video.privacyStatus==='public')state='published';else if(video.privacyStatus==='unlisted')state='unlisted';else if(video.publishAt)state='scheduled';else if(video.processingStatus==='succeeded')state='private';
 const next={...job,state,error,publishAt:typeof video.publishAt==='string'?video.publishAt:job.publishAt,stage:`YouTube: ${state}`};await saveJob(next);
 const saved=await addHistoryEntry({videoId:job.videoId,title:job.title,channelTitle:null,publishAt:typeof video.publishAt==='string'?video.publishAt:null,privacyStatus:String(video.privacyStatus),createdAt:job.createdAt,checkedAt:new Date().toISOString(),uploadStatus:typeof video.uploadStatus==='string'?video.uploadStatus:null,processingStatus:typeof video.processingStatus==='string'?video.processingStatus:null,failureReason:error});
 if(!saved)await saveJob({...next,error:'YouTube status checked; receipt history could not be saved. The batch job retains the video ID.'});return next;
}
export async function runJob(original:BatchJob,options:{signal:AbortSignal;onProgress?:(stage:string,pct:number)=>void;upload:boolean}):Promise<void>{
 // Ignore stale UI snapshots, especially after another tab completed this job.
 const stored=await getRecord<unknown>('job',original.id);
 if(!stored)throw new Error('This job no longer exists. Refresh the queue.');
 let job=jobSchema.parse(stored);if(!canRun(job))throw new Error('Job is not approved or is already uploaded.');
 const update=async(patch:Partial<BatchJob>)=>{job={...job,...patch};await saveJob(job);options.onProgress?.(job.stage,job.percent);};
 try{
  if(!job.outputAssetId){await update({state:'rendering',stage:'Loading local assets',error:null,percent:0});const audio=await assetFile(job.audioAssetId),files:Record<string,File>={};for(const [binding,id]of Object.entries(job.imageBindings))files[binding]=await assetFile(id);
   const output=await renderDocument({document:job.document,audio,vars:job.vars,files},{signal:options.signal,onProgress:(stage,pct)=>options.onProgress?.(stage,pct*100)});options.signal.throwIfAborted();
   const outputId=crypto.randomUUID();job={...job,outputAssetId:outputId,state:'rendered',stage:'MP4 saved locally',percent:100};await putRecords([{kind:'asset',id:outputId,value:{id:outputId,name:`${job.title}.mp4`,blob:output,type:'video/mp4',createdAt:new Date().toISOString()} satisfies StoredAsset},{kind:'job',id:job.id,value:job}]);
  }
  if(!options.upload||!job.uploadApproved)return;
  options.signal.throwIfAborted();const file=await assetFile(job.outputAssetId!);
  if(!job.sessionUri){if(!job.publishAt||Date.parse(job.publishAt)<Date.now()+10*60000)throw new Error('Publication is less than 10 minutes away or past. Review a new date; this job will not upload immediately.');
   await update({state:'initializing',stage:'Creating YouTube session',attemptStartedAt:new Date().toISOString(),percent:0});
   const data=await api('/api/youtube/init-upload',{metadata:{title:job.title,description:job.description,tags:job.tags,privacyStatus:'private',publishAt:job.publishAt},fileSize:file.size},options.signal);
   if(typeof data.sessionUri!=='string'||!data.sessionUri.startsWith('https://'))throw new UploadOutcomeUnknownError('Initialization returned no valid session. Check YouTube before trying again.');
   await update({sessionUri:data.sessionUri,state:'uploading',stage:'Uploading'});
  }
  await update({state:'uploading',stage:'Uploading / confirming stored bytes'});
  const id=await uploadToResumableSession({file,sessionUri:job.sessionUri!,chunkSize:DEFAULT_CHUNK_SIZE,resume:true,signal:options.signal,onProgress:p=>options.onProgress?.('Uploading',p.percent)});
  // Persist the identity even if cancellation arrives after Google commits.
  options.onProgress?.(`YouTube accepted video ${id}; saving receipt`,100);
  await update({state:'accepted',stage:'Accepted by YouTube; status unverified',videoId:id,percent:100,error:null});
  await addHistoryEntry({videoId:id,title:job.title,channelTitle:null,publishAt:job.publishAt,privacyStatus:'unknown',createdAt:job.createdAt});
  try{await refreshJob(job);}catch(error){await update({error:`Upload accepted (${id}); status check failed: ${error instanceof Error?error.message:String(error)}`});}
 }catch(error){
  const message=error instanceof Error?error.message:String(error);
  const unknown=error instanceof UploadOutcomeUnknownError||job.state==='initializing';
  if(job.videoId){try{await update({state:'accepted',error:message});}catch{throw new Error(`YouTube accepted video ${job.videoId}, but local persistence failed. Copy this ID and check YouTube Studio; do not re-upload. ${message}`);}return;}
  await update({state:unknown?'unknown':options.signal.aborted?'paused':'failed',error:message,stage:unknown?'Needs recovery':options.signal.aborted?'Paused':'Failed'});
  if(error instanceof UploadError&&[404,410].includes(error.status))await update({state:'unknown',error:'The resumable session expired. Check YouTube before creating a replacement upload.'});
  throw error;
 }
}
export async function withQueueLock(work:()=>Promise<void>):Promise<void>{
 if(!navigator.locks)throw new Error('This browser cannot safely coordinate a queue across tabs. Use current Chrome or Edge.');
 await navigator.locks.request('beatflow-batch-runner',{ifAvailable:true},async lock=>{if(!lock)throw new Error('A batch is running in another tab. Pause it before starting here.');await work();});
}
