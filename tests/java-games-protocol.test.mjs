import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
globalThis.location={hostname:'localhost'};
globalThis.window=new EventTarget();
const sent=[],frames=[];
const records=new Map();
globalThis.indexedDB={open(){const open={};queueMicrotask(()=>{open.result={close(){},transaction(_,mode){const tx={objectStore(){return {
  get(key){const req={};queueMicrotask(()=>{req.result=records.get(key);req.onsuccess();tx.oncomplete();});return req;},
  put(value,key){const req={};queueMicrotask(()=>{records.set(key,value);req.onsuccess();tx.oncomplete();});return req;}
};}};return tx;}};open.onsuccess();});return open;}};
const receive=(frame,type,extra={},source=frame.contentWindow,origin='null')=>{
  const event=new Event('message');Object.assign(event,{source,origin,data:{protocol:'spb-j2me-v1',channel:new URL(frame.src).hash.slice(1),type,...extra}});window.dispatchEvent(event);
};
globalThis.document={createElement(tag){assert.equal(tag,'iframe');const frame={attributes:{},setAttribute(k,v){this.attributes[k]=v;},remove(){this.removed=true;}};
  frame.contentWindow={postMessage(data){sent.push(data);if(data.type==='start')queueMicrotask(()=>receive(frame,'started'));
    if(data.type==='stop')queueMicrotask(()=>receive(frame,'rms-save',{id:1,records:{'fixture/1':'2'}}));
    if(data.type==='rms-ack'&&data.ok)queueMicrotask(()=>receive(frame,'stopped'));
  }};frames.push(frame);return frame;}};
const canvas={insertAdjacentElement(_,frame){queueMicrotask(()=>{
  receive(frame,'started',{},{}); // Wrong WindowProxy must not start the runtime.
  receive(frame,'started',{},frame.contentWindow,'https://wrong.example');
  receive(frame,'boot');
});}};
const {startRuntime}=await import('../js/java-games/runtime.js');
const {GAMES}=await import('../js/java-games/games.js');
const game=GAMES.find(g=>g.id==='nokia-test');
const bytes=await readFile(new URL('../javagames/fixtures/nokia-test.jar',import.meta.url));
const jar=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
test('opaque iframe, limited protocol, input, stop-save acknowledgement and repeat launch',async()=>{
  const controller=new AbortController();
  const runtime=await startRuntime({jar,game,canvas,signal:controller.signal});
  const frame=frames.at(-1);
  assert.equal(frame.attributes.sandbox,'allow-scripts');assert.equal(frame.attributes.allow,'autoplay');
  assert.equal(frame.hidden,false);assert.ok(sent.some(m=>m.type==='start'));
  assert.ok(sent.every(m=>!('token' in m)&&!('supabase' in m)&&!('localStorage' in m)));
  runtime.key('right',true);runtime.key('right',false);runtime.pause();runtime.resume();
  assert.deepEqual(sent.filter(m=>m.type==='key').map(m=>[m.code,m.down]),[[-4,true],[-4,false]]);
  await assert.rejects(startRuntime({jar,game,canvas,signal:new AbortController().signal}),/уже/);
  await runtime.stop();assert.ok(frame.removed);assert.equal(records.size,1);
  const next=await startRuntime({jar,game,canvas,signal:new AbortController().signal});
  assert.equal(sent.filter(m=>m.type==='start').at(-1).records['fixture/1'],'2');
  await next.stop();
});
test('abort tears down the active frame and permits a fresh instance',async()=>{
  const controller=new AbortController();const runtime=await startRuntime({jar,game,canvas,signal:controller.signal});
  controller.abort();assert.ok(runtime.frame.removed);await runtime.stop();
  const next=await startRuntime({jar,game,canvas,signal:new AbortController().signal});await next.stop();
});
