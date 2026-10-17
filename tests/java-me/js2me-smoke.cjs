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
  constructor() { super(); this.children=[]; this.style={}; this.classList={add(){},remove(){},toggle(){}}; }
  appendChild(node) { node.parentNode=this; node.isConnected=true;this.children.push(node);return node; }
  removeChild(node) {this.children=this.children.filter(n=>n!==node);node.isConnected=false;}
  remove() { this.parentNode?.removeChild(this); }
  set innerHTML(value) {this.children=[];} get innerHTML(){return '';}
  get firstChild(){return this.children[0];}get lastChild(){return this.children.at(-1);}
  setAttribute(){} focus(){} querySelector(){return new Element();}
}
async function createVm(jar, records={}, extras={}) {
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
    addEventListener:events.addEventListener.bind(events),removeEventListener:events.removeEventListener.bind(events),...extras});
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
  for (const name of ['Command','List','Alert']) await new Promise((resolve,reject)=>keys.context.js2me.loadClass('javaRoot.$javax.$microedition.$lcdui.$'+name,resolve,reject));
  vm.runInContext(`
    var ui=javaRoot.$javax.$microedition.$lcdui;
    var display=ui.$Display.prototype.$getDisplay$Ljavax_microedition_midlet_MIDlet_$Ljavax_microedition_lcdui_Display_({});
    var menu=new ui.$List(); menu._init$Ljava_lang_String_I$V(new javaRoot.$java.$lang.$String('Menu'),3);
    menu.$append$Ljava_lang_String_Ljavax_microedition_lcdui_Image_$I(new javaRoot.$java.$lang.$String('One'),null);
    menu.$append$Ljava_lang_String_Ljavax_microedition_lcdui_Image_$I(new javaRoot.$java.$lang.$String('Two'),null);
    var picked=-1, command=new ui.$Command(); command._init$Ljava_lang_String_II$V(new javaRoot.$java.$lang.$String('Select'),4,0);
    menu.$setSelectCommand$Ljavax_microedition_lcdui_Command_$V(command);
    menu.$setCommandListener$Ljavax_microedition_lcdui_CommandListener_$V({$commandAction$Ljavax_microedition_lcdui_Command_Ljavax_microedition_lcdui_Displayable_$V:function(c,d){picked=d.selectedItem;}});
    display.$setCurrent$Ljavax_microedition_lcdui_Displayable_$V(menu);
  `,keys.context);
  await wait(30); const menuFrames=keys.frames;
  keys.context.bridge.key(-2,true); keys.context.bridge.key(-2,false);
  keys.context.bridge.key(-5,true); keys.context.bridge.key(-5,false); await wait(30);
  assert.equal(keys.context.picked,1,'Nokia arrows and OK must invoke real List command');
  vm.runInContext(`
    var alertScreen=new ui.$Alert(); alertScreen._init$Ljava_lang_String_$V(new javaRoot.$java.$lang.$String('Alert'));
    alertScreen.$setString$Ljava_lang_String_$V(new javaRoot.$java.$lang.$String('Message'));
    display.$setCurrent$Ljavax_microedition_lcdui_Displayable_$V(alertScreen);
  `,keys.context);
  await wait(30); assert.ok(keys.frames>menuFrames,'a real LCDUI Alert must signal rendered readiness');
  keys.context.bridge.key(-5,true); keys.context.bridge.key(-5,false); await wait(30);
  assert.equal(keys.context.display.current,keys.context.menu,'OK dismisses Alert to preceding displayable');
  keys.context.menu.$deleteAll$$V(); assert.equal(keys.context.menu.$size$$I(),0);
  // Proxy deletion must affect the persisted game-only cache, not just the empty Proxy target.
  keys.context.js2me.rmsStorage['removed-record']='value'; delete keys.context.js2me.rmsStorage['removed-record'];
  await keys.context.bridge.flush(); assert.ok(!Object.hasOwn(keys.snapshot,'removed-record'));
  assert.deepEqual(keys.errors,[]);await keys.close();
  const audio=[];
  class AudioContext {
    constructor(){this.currentTime=0;this.destination={};audio.push('context');}
    resume(){audio.push('resume');return Promise.resolve();} suspend(){audio.push('suspend');return Promise.resolve();} close(){audio.push('close');return Promise.resolve();}
    createGain(){return {gain:{value:0},connect(){},disconnect(){}};}
    createOscillator(){return {frequency:{value:0},connect(){},disconnect(){},start(){audio.push(this.frequency.value);},stop(at){audio.push(at);}};}
  }
  const rms1=await createVm(path.join(root,'javagames/fixtures/rms-audio-test.jar'),{}, {AudioContext});
  assert.equal(rms1.field('$statusLjava_lang_String_').text,'RMS launches: 1');await rms1.context.bridge.flush();
  const saved=rms1.snapshot;assert.ok(Object.values(saved).includes('1'));
  rms1.context.bridge.key(53,true); rms1.context.bridge.key(53,false); await wait(30);
  assert.ok(audio.includes(440),'real Java Manager.playTone must schedule the 440 Hz Web Audio oscillator');
  rms1.context.bridge.pause(); rms1.context.bridge.pause(); rms1.context.bridge.resume();
  await rms1.close();assert.ok(audio.includes('close'),'stop closes the audio context');
  const rms2=await createVm(path.join(root,'javagames/fixtures/rms-audio-test.jar'),saved);
  assert.equal(rms2.field('$statusLjava_lang_String_').text,'RMS launches: 2');await rms2.close();
  console.log('PASS: actual JAR ZIP/bytecode -> 240x320 native Canvas; 19 Nokia keys; hold/release; List/Alert; RMS deletion/reopen 1 -> 2; Web Audio API scheduling/close.');
  console.log('Not verified here: browser sandbox, browser IndexedDB, audible sound, Gameloft story.');
})().catch(error=>{console.error(error);process.exitCode=1;setTimeout(()=>process.exit(1),100);});
