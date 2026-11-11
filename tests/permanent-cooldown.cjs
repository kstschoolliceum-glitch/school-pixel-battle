const {readFileSync}=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const element=()=>({textContent:'',disabled:false,style:{},classList:{add(){},remove(){}},addEventListener(){}});
const nodes=new Map();
const context=vm.createContext({console,setInterval,clearInterval,setTimeout,performance,
 document:{getElementById(id){if(!nodes.has(id))nodes.set(id,element());return nodes.get(id)}},
 window:{setTimeout},alert(){},
 currentUser:{id:'test'},selectedX:1,selectedY:1,selectedColor:'#ef4444',MAP_WIDTH:300,MAP_HEIGHT:424,
 pixels:new Uint8Array(300*424),pixelOwners:[],COLORS:['#ffffff','#ef4444'],
 placeButton:element(),cooldownText:element(),pixelCountText:element(),selectionIndicator:null,
 pixelCount:0,cooldownRemaining:0,cooldownTimer:null,COOLDOWN_SECONDS:1,
 GAME_CONFIG:{BOOSTS_ENABLED:false},supabaseClient:{},
 dailyTasks:{recordPiPixel(){},applyStatus(){}},drawMap(){},scheduleRankingRefresh(){},
 updateDisplayedProfileAfterPixel(){}
});
vm.runInContext(readFileSync('js/pixel-placement.js','utf8'),context);
(async()=>{
 let calls=0,finish;
 context.supabaseClient.rpc=()=>{calls++;return new Promise(r=>finish=r)};
 const first=context.placePixel();
 await context.placePixel();
 assert.equal(calls,1,'parallel clicks must share one in-flight request');
 finish({data:{success:true,x:1,y:1,color:'#ef4444',cooldown:1},error:null});
 await first;
 assert.equal(context.cooldownRemaining,1);
 assert.equal(context.placeButton.disabled,true);
 context.resetPixelCooldownAfterReward();
 assert.equal(context.cooldownRemaining,1,'old rewards must not reset cooldown');
 await new Promise(r=>setTimeout(r,1100));
 assert.equal(context.cooldownRemaining,0);
 assert.equal(context.placeButton.disabled,false);
 context.selectedX=2;
 context.supabaseClient.rpc=async()=>({data:{success:false,reason:'COOLDOWN',remaining:1},error:null});
 await context.placePixel();
 assert.equal(context.cooldownRemaining,1,'server rejection must restart timer');
 clearInterval(context.cooldownTimer);
 console.log('PASS: parallel clicks, 1 second timer, reward guard, server rejection');
})().catch(e=>{console.error(e);process.exitCode=1});
