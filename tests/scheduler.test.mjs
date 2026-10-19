import assert from 'node:assert/strict';import {test} from 'node:test';
import {allocateSlots} from '../lib/studio/scheduler.ts';
test('five beats fill five different Wednesday 5pm slots and skip known reservations',()=>{
 const dates=allocateSlots({startDate:'2026-10-19',timezone:'Europe/London',slots:[{day:3,time:'17:00'}]},5,['2026-10-28T17:00:00Z'],new Date('2026-10-19T00:00:00Z'));
 assert.deepEqual(dates,['2026-10-21T16:00:00Z','2026-11-04T17:00:00Z','2026-11-11T17:00:00Z','2026-11-18T17:00:00Z','2026-11-25T17:00:00Z']);
});
test('multiple weekly slots are chronological and skip past slots',()=>{assert.deepEqual(allocateSlots({startDate:'2026-10-19',timezone:'UTC',slots:[{day:6,time:'17:00'},{day:3,time:'17:00'}]},3,[],new Date('2026-10-21T18:00:00Z')),['2026-10-24T17:00:00Z','2026-10-28T17:00:00Z','2026-10-31T17:00:00Z']);});
test('impossible and ambiguous local slots are skipped, not guessed',()=>{const dates=allocateSlots({startDate:'2026-10-25',timezone:'Europe/London',slots:[{day:0,time:'01:30'}]},1,[],new Date('2026-10-24T00:00:00Z'));assert.deepEqual(dates,['2026-11-01T01:30:00Z']);});
test('invalid dates, zones and empty schedules fail visibly',()=>{for(const patch of [{startDate:'2026-02-31'},{timezone:'invalid'},{slots:[]}])assert.throws(()=>allocateSlots({startDate:'2026-10-19',timezone:'UTC',slots:[{day:3,time:'17:00'}],...patch},1,[],new Date('2026-10-19')));});
