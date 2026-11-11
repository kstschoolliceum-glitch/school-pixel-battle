import asyncio,json
from playwright.async_api import async_playwright
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True)
  page=await browser.new_page()
  errors=[]
  page.on('pageerror',lambda e:errors.append(e.stack or str(e)))
  async def route(r):
   if 'supabase-js' in r.request.url:
    await r.fulfill(content_type='text/javascript',body='''
    const channel={on(){return this},subscribe(){return this},unsubscribe(){},track(){},presenceState(){return {}}};
    let query;
    query=new Proxy({}, {get(_target,key){
      if(key==='then') return (resolve,reject)=>Promise.resolve({data:[],error:null}).then(resolve,reject);
      return ()=>query;
    }});
    window.supabase={createClient(){return {from:()=>query,auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},channel:()=>channel,rpc:async()=>({data:null,error:null}),removeChannel(){}}}};
    ''')
   elif r.request.url.startswith('http://localhost:8080'):
    await r.continue_()
   else: await r.fulfill(body='',content_type='text/javascript')
  await page.route('**/*',route)
  await page.goto('http://localhost:8080')
  await page.wait_for_function("typeof initializeAuth === 'function'")
  await page.wait_for_timeout(700)
  print('page errors',errors)
  assert not errors,errors
  for w,h in [(1440,1000),(390,844)]:
   await page.set_viewport_size({'width':w,'height':h})
   for selector in ['#weekly-ranking-tab','#quarter-ranking-tab','#season-countdown','#pi-buy-turbo','#admin-seasons-tab']:
    assert not await page.locator(selector).is_visible(),selector
   assert await page.locator('#students-ranking-tab').text_content() and 'ТОП УЧЕНИКОВ' in await page.locator('#students-ranking-tab').text_content()
  result=await page.evaluate('''async()=>{
    currentUser={id:'test'}; selectedX=1; selectedY=1; selectedColor='#ef4444';
    let calls=0,finish;
    supabaseClient.rpc=()=>{calls++;return new Promise(r=>finish=r)};
    const first=placePixel(); placePixel();
    if(calls!==1)throw Error('duplicate request');
    finish({data:{success:true,x:1,y:1,color:'#ef4444',cooldown:1},error:null});
    await first;
    if(!placeButton.disabled || cooldownRemaining!==1)throw Error('missing cooldown');
    resetPixelCooldownAfterReward();
    if(cooldownRemaining!==1)throw Error('reward bypass');
    await new Promise(r=>setTimeout(r,1100));
    if(cooldownRemaining!==0 || placeButton.disabled)throw Error('cooldown did not end');
    startSeasonWatcher();
    if(seasonCheckTimer!==null)throw Error('season timer');
    return {calls,cooldownRemaining};
  }''')
  print('desktop/mobile visibility and placement',result)
  assert not errors,errors
  await browser.close()
asyncio.run(main())
