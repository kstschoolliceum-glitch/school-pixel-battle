// Native Canvas harness: real ZIP decoder, JVM bytecode, drawing and RMS APIs.
// DOM doubles do NOT prove browser iframe/CSP, autoplay or actual IndexedDB behavior.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createCanvas, Image } = require('@napi-rs/canvas');
const root = path.resolve(__dirname, '../..');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
class Element extends EventTarget {
  constructor() { super(); this.children=[]; this.style={}; this.classList={add(){},remove(){}}; }
  appendChild(node) { node.parentNode=this; node.isConnected=true;this.children.push(node);return node; }
  removeChild(node) {this.children=this.children.filter(n=>n!==node);node.isConnected=false;}
  set innerHTML(value) {this.children=[];} get innerHTML(){return '';}
  get firstChild(){return this.children[0];}get lastChild(){return this.children.at(-1);}
  setAttribute(){} focus(){} querySelector(){return new Element();}
}
async function createVm(jar, records={}) {
  const errors=[], timers=new Set(), nodes=Object.fromEntries(['screen','title','choice','back'].map(id=>[id,new Element()]));
  let snapshot={...records}, frames=0;
  const later=(fn,ms,...args)=>{const id=setTimeout(()=>{timers.delete(id);try{fn(...args);}catch(e){errors.push(e);}},ms);timers.add(id);return id;};
  const cancel=id=>{clearTimeout(id);timers.delete(id);};
  class FileReader {
    readAsArrayBuffer(blob){blob.arrayBuffer().then(result=>{this.result=result;this.onload?.({target:this});}).catch(error=>this.onerror?.(error));}
  }
  const document={ body:new Element(), querySelectorAll(){return []},getElementById:id=>nodes[id]||(nodes[id]=new Element()),createElement(tag){
    if(tag==='canvas'){
      const canvas=createCanvas(240,320), events=new EventTarget();canvas.style={};
      for(const method of ['addEventListener','removeEventListener','dispatchEvent'])canvas[method]=events[method].bind(events);
      return canvas;
    }
    if(tag==='img'){
      const image=new Image();image.addEventListener=(type,fn)=>{image['on'+type]=()=>later(fn,0);};
      image.setAttribute=(name,value)=>{if(name==='src')image.src=Buffer.from(value.split(',')[1].replace(/%/g,''),'hex');};
      return image;
    }
    return new Element();
  }};
  const events=new EventTarget();
  const context=vm.createContext({console:{log(){},debug(){},warn(){},error(...args){errors.push(args.join(' '));}},document,Event,Blob,ArrayBuffer,Uint8Array,Uint8ClampedArray,FileReader,TextEncoder,TextDecoder,atob,btoa,
    setTimeout:later,clearTimeout:cancel,setInterval,clearInterval,
    addEventListener:events.addEventListener.bind(events),removeEventListener:events.removeEventListener.bind(events)});
  context.window=context;
  vm.runInContext(fs.readFileSync(path.join(root,'javagames/vendor/js2me/engine.js'),'utf8'),context);
  vm.runInContext(fs.readFileSync(path.join(root,'javagames/vm-adapter.js'),'utf8'),context);
  context.records=records;
  context.persist=async records=>{snapshot=structuredClone(records);};
  context.onFrame=()=>{frames++;};context.onError=error=>errors.push(error);
  vm.runInContext('var bridge=installJavaMe({records:records,persist:persist,onFrame:onFrame,onError:onError});',context);
  context.bytes=new Uint8Array(fs.readFileSync(jar));vm.runInContext('bridge.boot(bytes)',context);
  for(let i=0;i<150&&!frames&&!errors.length;i++)await wait(20);
  assert.ok(frames>0,'A real Java draw call must produce a connected Canvas');
  assert.deepEqual(errors,[],'VM errors');
  return {context,nodes,errors,get frames(){return frames},get snapshot(){return snapshot},
    async close(){await context.bridge.stop();for(const id of timers)clearTimeout(id);},
    screen(){return context.js2me.listeners.keypress[0].spbCanvas;},
    field(name){const screen=this.screen();return screen['$'+screen[name]];}
  };
}
(async()=>{
  const keys=await createVm(path.join(root,'javagames/fixtures/nokia-test.jar'));
  const image=keys.nodes.screen.children[0];assert.equal(image.width,240);assert.equal(image.height,320);
  assert.ok(image.toBuffer('image/png').length>1000,'Actual image/text rendering must not be an empty framebuffer');
  for(const code of [-1,-2,-3,-4,-5,-6,-7,...Array.from({length:10},(_,i)=>48+i),42,35]){
    keys.context.bridge.key(code,true);await wait(35);assert.equal(keys.field('$lastKeyI'),code);assert.equal(keys.field('$downZ'),1);
    keys.context.bridge.key(code,false);await wait(35);assert.equal(keys.field('$downZ'),0);
  }
  keys.context.bridge.key(-4,true);await wait(550);assert.equal(keys.field('$downZ'),1);
  keys.context.bridge.pause();const frameCount=keys.frames;await wait(100);assert.equal(keys.frames,frameCount);
  keys.context.bridge.resume();await wait(50);assert.equal(keys.field('$downZ'),0);
  assert.deepEqual(keys.errors,[]);await keys.close();
  const rms1=await createVm(path.join(root,'javagames/fixtures/rms-audio-test.jar'));
  assert.equal(rms1.field('$statusLjava_lang_String_').text,'RMS launches: 1');await rms1.context.bridge.flush();
  const saved=rms1.snapshot;assert.ok(Object.values(saved).includes('1'));await rms1.close();
  const rms2=await createVm(path.join(root,'javagames/fixtures/rms-audio-test.jar'),saved);
  assert.equal(rms2.field('$statusLjava_lang_String_').text,'RMS launches: 2');await rms2.close();
  console.log('PASS: actual JAR ZIP/bytecode -> 240x320 native Canvas; 19 Nokia keys; hold/release; pause/resume; RMS reopen 1 -> 2.');
  console.log('Not verified here: browser sandbox, browser IndexedDB, audible sound, Gameloft story.');
})().catch(error=>{console.error(error);process.exitCode=1;setTimeout(()=>process.exit(1),100);});
