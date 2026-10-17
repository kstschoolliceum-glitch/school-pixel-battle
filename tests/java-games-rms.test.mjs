import test from 'node:test';
import assert from 'node:assert/strict';
import { createRmsStore, validateSnapshot } from '../js/java-games/rms-store.js';
const game = { id:'test-game', sha256:'a'.repeat(64) };
function databaseDouble() {
  const entries = new Map(); let transaction, request;
  const db = {
    close() {},
    transaction(_, mode) {
      request = {};
      transaction = { mode, objectStore() { return {
        get(key) { request.key=key; return request; },
        put(value,key) { request.key=key; request.value=value; return request; }
      }; } };
      return transaction;
    }
  };
  return { entries, factory:{open(){const open={};queueMicrotask(()=>{open.result=db;open.onsuccess();});return open;}},
    get transaction(){return transaction;},
    success() {request.result=entries.get(request.key);request.onsuccess();},
    complete() {if(transaction.mode==='readwrite')entries.set(request.key,request.value);transaction.oncomplete();},
    abort() {transaction.onabort();}
  };
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('RMS write is acknowledged only after transaction completion, not request success', async()=>{
  const db=databaseDouble(),store=createRmsStore(game,db.factory);
  let acknowledged=false;
  const saving=store.save({'fixture/1':'12,34'}).then(()=>{acknowledged=true;});
  await tick();db.success();await tick();assert.equal(acknowledged,false);
  db.complete();await saving;assert.equal(acknowledged,true);
  const loading=store.load();await tick();db.success();db.complete();assert.equal((await loading)['fixture/1'],'12,34');
  await store.close();
});
test('RMS abort rejects a successful request and does not acknowledge persistence',async()=>{
  const db=databaseDouble(),store=createRmsStore(game,db.factory);
  const saving=store.save({counter:'1'});await tick();db.success();db.abort();await assert.rejects(saving,/отменена/);
});
test('game and JAR namespaces differ, with quotas and prototype keys rejected', async()=>{
  const db=databaseDouble();
  for(const identity of [game,{...game,id:'second-game'},{...game,sha256:'b'.repeat(64)}]){
    const store=createRmsStore(identity,db.factory),saving=store.save({value:identity.sha256});await tick();db.success();db.complete();await saving;
  }
  assert.equal(db.entries.size,3);
  assert.throws(()=>validateSnapshot({value:'x'.repeat(3*1024*1024)}),/лимит/);
  assert.throws(()=>validateSnapshot(JSON.parse('{"__proto__":"bad"}')),/запись/);
  assert.throws(()=>validateSnapshot({nested:{value:1}}),/запись/);
});
