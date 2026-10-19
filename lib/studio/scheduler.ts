import { z } from "zod";
import { toUtcIso8601 } from "@/lib/time";
export const scheduleSchema=z.object({startDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),timezone:z.string().min(1),slots:z.array(z.object({day:z.number().int().min(0).max(6),time:z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)}).strict()).min(1).max(28)}).strict();
export type WeeklySchedule=z.infer<typeof scheduleSchema>;
export function allocateSlots(input:WeeklySchedule,count:number,occupied:string[]=[],now=new Date()):string[]{
 const schedule=scheduleSchema.parse(input);new Intl.DateTimeFormat('en',{timeZone:schedule.timezone}).format(now);
 const start=Date.parse(`${schedule.startDate}T00:00:00Z`);
 if(!Number.isFinite(start)||new Date(start).toISOString().slice(0,10)!==schedule.startDate)throw new Error('Choose a valid start date.');
 if(!Number.isInteger(count)||count<0||count>1000)throw new Error('Batch must contain at most 1000 tracks.');
 const busy=new Set(occupied.map(value=>Date.parse(value))),result:string[]=[];
 // Bounded to ten years; enough for 1000 tracks with multiple weekly slots.
 for(let day=0;day<3660&&result.length<count;day++){
  const date=new Date(start+day*86400000),local=date.toISOString().slice(0,10);
  const candidates=schedule.slots.filter(slot=>slot.day===date.getUTCDay()).map(slot=>{
   try{return toUtcIso8601(`${local}T${slot.time}`,schedule.timezone);}catch(error){if(error instanceof Error&&/clocks change/.test(error.message))return null;throw error;}
  }).filter((value):value is string=>value!==null).sort();
  for(const instant of candidates){const ms=Date.parse(instant);if(ms<=now.getTime()||busy.has(ms))continue;result.push(instant);busy.add(ms);if(result.length===count)break;}
 }
 if(result.length!==count)throw new Error('Not enough available publication slots in the next ten years.');return result;
}
