// ---------- PI COIN ----------
const piCoin = (() => {
  const rewards = [5, 5, 10, 10, 15, 20, 35];
  const balance = document.getElementById("pi-balance");
  const shopBalance = document.getElementById("pi-shop-balance");
  const days = document.getElementById("pi-daily-days");
  const claimButton = document.getElementById("pi-daily-claim");
  const dailyMessage = document.getElementById("pi-daily-message");
  const shopDialog = document.getElementById("pi-shop-dialog");
  const buyButton = document.getElementById("pi-buy-turbo");
  const shopMessage = document.getElementById("pi-shop-message");
  const dailyDialog = document.getElementById("pi-daily-dialog");
  const dialogDays = document.getElementById("pi-daily-dialog-days");
  const dialogClaim = document.getElementById("pi-daily-dialog-claim");
  const dialogMessage = document.getElementById("pi-daily-dialog-message");
  const todayBonusStatus = document.getElementById("today-bonus-status");
  let status = null;
  let busy = false;
  let offerPending = false;

  function message(element, text, error = false) {
    if (!element) return;
    element.textContent = text;
    element.classList.toggle("error", error);
  }

  function renderDays(host) {
    if (!host) return;
    host.replaceChildren();
    const current = Number(status?.claim_day || 1);
    rewards.forEach((reward, index) => {
      const day = index + 1;
      const item = document.createElement("span");
      item.className = "pi-daily-day";
      if (day < current || (status?.claimed_today && day === current)) item.classList.add("claimed");
      else if (day === current) item.classList.add("current");
      item.innerHTML = "<small>День " + day + "</small><strong>" + reward + " 🪙</strong>";
      host.append(item);
    });
  }

  function render() {
    const amount = Number(status?.balance || 0);
    const current = Number(status?.claim_day || 1);
    const claimed = Boolean(status?.claimed_today);
    if (balance) balance.textContent = amount.toLocaleString("ru-RU");
    if (shopBalance) shopBalance.textContent = amount.toLocaleString("ru-RU");
    renderDays(days);
    renderDays(dialogDays);
    [claimButton, dialogClaim].forEach(button => {
      if (!button) return;
      button.disabled = busy || claimed;
      button.textContent = claimed ? "БОНУС ПОЛУЧЕН ✓" : "ЗАБРАТЬ " + rewards[current - 1] + " piCoin";
    });
    if (todayBonusStatus) todayBonusStatus.textContent = claimed ? "Получено ✓" : rewards[current - 1] + " piCoin";
    if (buyButton) buyButton.disabled = busy || amount < 180;
  }

  function offerKey() {
    return "pixel-battle-daily-bonus:" + currentUser?.id + ":" + getLocalDateKey();
  }

  function wasOfferedToday() {
    try {
      return localStorage.getItem(offerKey()) === "shown";
    } catch {
      return false;
    }
  }

  function markOfferedToday() {
    try {
      localStorage.setItem(offerKey(), "shown");
    } catch {}
  }

  function openDailyBonus(automatic = false) {
    if (!dailyDialog || !currentUser || !status) return;
    if (automatic && (status.claimed_today || wasOfferedToday())) return;

    const activeDialog = document.querySelector("dialog[open]");
    if (activeDialog && activeDialog !== dailyDialog) {
      if (!automatic || offerPending) return;
      offerPending = true;
      activeDialog.addEventListener("close", () => {
        offerPending = false;
        setTimeout(() => openDailyBonus(true), 150);
      }, { once: true });
      return;
    }

    if (automatic) markOfferedToday();
    if (!dailyDialog.open) dailyDialog.showModal();
  }

  async function load(options = {}) {
    if (!currentUser) return;
    const id = currentUser.id;
    const { data, error } = await supabaseClient.rpc("get_pi_coin_status");
    if (!currentUser || currentUser.id !== id) return;
    if (error) {
      console.error("PI COIN STATUS ERROR:", error);
      message(dailyMessage, "Выполни новую SQL-миграцию, чтобы открыть бонус.", true);
      message(dialogMessage, "Не удалось загрузить ежедневный бонус.", true);
      return;
    }
    status = data;
    render();
    if (options.offerDailyBonus) openDailyBonus(true);
  }

  async function claim() {
    if (busy || status?.claimed_today) return;
    busy = true;
    render();
    message(dailyMessage, "");
    message(dialogMessage, "");
    const { data, error } = await supabaseClient.rpc("claim_pi_coin_daily");
    busy = false;
    if (error || !data?.success) {
      const text = data?.error === "ALREADY_CLAIMED"
        ? "Сегодняшний бонус уже получен."
        : "Не удалось получить бонус. Попробуй ещё раз.";
      message(dailyMessage, text, true);
      message(dialogMessage, text, true);
      await load();
      return;
    }
    status = data.status;
    const text = "Получено: +" + data.reward + " 🪙 · Баланс: " + Number(status?.balance || 0).toLocaleString("ru-RU") + " piCoin";
    message(dailyMessage, text);
    message(dialogMessage, text);
    render();
    setTimeout(() => {
      if (dailyDialog?.open) dailyDialog.close();
    }, 1400);
  }

  async function buy() {
    if (busy || Number(status?.balance || 0) < 180) return;
    if (!confirm("Купить Турбокисть на 10 минут за 180 piCoin? Она включится сразу.")) return;
    busy = true;
    render();
    message(shopMessage, "");
    const { data, error } = await supabaseClient.rpc("buy_pi_coin_turbo");
    busy = false;
    if (error || !data?.success) {
      message(shopMessage, data?.error === "NOT_ENOUGH_COINS" ? "Недостаточно piCoin." : "Не удалось выполнить покупку.", true);
      await load();
      return;
    }
    status = data.status;
    render();
    resetPixelCooldownAfterReward();
    message(shopMessage, "Турбокисть включена на 10 минут!");
  }

  async function open() {
    await Promise.all([load(), mapItems.load(), profileCosmetics.load()]);
    if (shopDialog && !shopDialog.open) shopDialog.showModal();
  }

  document.getElementById("pi-balance-button")?.addEventListener("click", open);
  document.getElementById("pi-shop-open-button")?.addEventListener("click", open);
  document.getElementById("pi-shop-close")?.addEventListener("click", () => shopDialog?.close());
  document.getElementById("today-bonus-button")?.addEventListener("click", async () => {
    await load();
    openDailyBonus(false);
  });
  document.getElementById("pi-daily-dialog-close")?.addEventListener("click", () => dailyDialog?.close());
  document.getElementById("pi-daily-dialog-later")?.addEventListener("click", () => dailyDialog?.close());
  claimButton?.addEventListener("click", claim);
  dialogClaim?.addEventListener("click", claim);
  buyButton?.addEventListener("click", buy);
  dailyDialog?.addEventListener("close", markOfferedToday);
  dailyDialog?.addEventListener("click", event => {
    if (event.target === dailyDialog) dailyDialog.close();
  });
  shopDialog?.addEventListener("click", event => {
    if (event.target !== shopDialog) return;
    const box = shopDialog.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) shopDialog.close();
  });

  return { load, open, openDailyBonus };
})();

// ---------- PROFILE AND CHAT COSMETICS ----------
const profileCosmetics=(()=>{
 const list=document.getElementById("cosmetic-shop-list"),messageEl=document.getElementById("cosmetic-shop-message");
 let status=null,busy=false;
 function say(text,error=false){if(!messageEl)return;messageEl.textContent=text;messageEl.classList.toggle("error",error)}
 function apply(target,frame,color,nickname){
  if(target)target.dataset.profileFrame=frame||"";
  if(nickname)nickname.style.color=color||"";
 }
 async function publicStatus(userId){
  if(!currentUser||!userId)return null;
  const {data,error}=await supabaseClient.rpc("get_public_profile_cosmetics",{p_user_id:userId});
  return error?null:data;
 }
 async function applyOwn(){
  const data=await publicStatus(currentUser?.id);
  if(!data)return;
  apply(document.querySelector("#profile-panel .profile-info"),data.profile_frame,data.nickname_color,document.getElementById("profile-nickname"));
 }
 async function applyPlayerCard(userId,dialog,nickname){
  const data=await publicStatus(userId);
  if(!data)return;
  apply(dialog,data.profile_frame,data.nickname_color,nickname);
 }
 function render(){
  if(!list||!status)return;list.replaceChildren();
  const owned=new Set(status.owned||[]),equipped=status.equipped||{};
  (status.catalog||[]).forEach(item=>{
   const card=document.createElement("article");card.className="cosmetic-shop-item";card.dataset.category=item.category;
   const preview=document.createElement("span");preview.className="cosmetic-preview";preview.textContent=item.category==="chat_color"?"Aa":"🪪";
   if(item.color)preview.style.color=item.color;if(item.frame)preview.dataset.previewFrame=item.frame;
   const info=document.createElement("div"),title=document.createElement("h4"),description=document.createElement("p"),price=document.createElement("strong"),button=document.createElement("button");
   title.textContent=item.name;description.textContent=item.description;price.textContent=item.price+" 🪙";
   const active=equipped[item.category]===item.id,isOwned=owned.has(item.id);
   button.type="button";button.dataset.cosmeticId=item.id;button.dataset.cosmeticAction=isOwned?"equip":"buy";
   button.disabled=busy||active||(!isOwned&&Number(status.balance||0)<Number(item.price||0));
   button.textContent=active?"ВЫБРАНО":isOwned?"ВЫБРАТЬ":"КУПИТЬ";
   info.append(title,description);card.append(preview,info,price,button);list.append(card);
  });
 }
 async function load(){
  if(!currentUser)return;const userId=currentUser.id;
  const {data,error}=await supabaseClient.rpc("get_cosmetic_shop_status");
  if(!currentUser||currentUser.id!==userId)return;
  if(error){say("Выполните SQL-миграцию магазина косметики.",true);return}
  status=data;render();applyOwn();
 }
 async function act(action,itemId){
  if(busy)return;if(action==="buy"&&!confirm("Купить эту косметику навсегда?"))return;
  busy=true;render();say("");
  const rpc=action==="buy"?"buy_profile_cosmetic":"equip_profile_cosmetic";
  const args=action==="buy"?{p_item_id:itemId}:{p_item_id:itemId};
  const {data,error}=await supabaseClient.rpc(rpc,args);busy=false;
  if(error||!data?.success){const code=data?.error;say(code==="NOT_ENOUGH_COINS"?"Недостаточно piCoin.":code==="ALREADY_OWNED"?"Эта косметика уже куплена.":"Не удалось выполнить действие.",true);await load();return}
  status=data.status;render();applyOwn();loadChatMessages();piCoin.load();
  say(action==="buy"?"Косметика куплена и выбрана!":"Оформление выбрано!");
 }
 list?.addEventListener("click",event=>{const button=event.target.closest("[data-cosmetic-action]");if(!button||button.disabled)return;act(button.dataset.cosmeticAction,button.dataset.cosmeticId)});
 return {load,applyOwn,applyPlayerCard};
})();

// ---------- MAP ITEMS ----------
const mapItems=(()=>{
 const counts={bomb:0,beacon:0,detector:0},prices={bomb:550,beacon:100,detector:15},names={bomb:"💣 Бомба",beacon:"📍 Маяк",detector:"🕵️ Детектор"};let beacons=[],bombCells=new Set(),busy=false,openedBeacon=null;
 const output=document.getElementById("map-item-message"),guidance=document.getElementById("map-items-guidance"),totalLabel=document.getElementById("map-items-total"),shopItemButton=document.getElementById("pi-shop-open-items"),key=(x,y)=>x+":"+y;
 const beaconLayer=document.getElementById("beacon-layer"),beaconDialog=document.getElementById("beacon-dialog"),beaconLabel=document.getElementById("beacon-dialog-label"),beaconClass=document.getElementById("beacon-dialog-class"),beaconRemove=document.getElementById("beacon-remove-button"),beaconStatus=document.getElementById("beacon-dialog-status");
 function say(text,error=false){if(output){output.textContent=text;output.classList.toggle("error",error)}}
 function renderGuidance(){
  if(!guidance)return;
  guidance.replaceChildren();
  const strong=document.createElement("strong");
  if(selectedX===null||selectedY===null){
   strong.textContent="Как использовать:";
   guidance.append(strong);
   ["1. Выбери клетку на карте","2. Открой 🎒 Предметы","3. Выбери предмет"].forEach(text=>{const span=document.createElement("span");span.textContent=text;guidance.append(span)});
  }else{
   strong.textContent="📍 Выбрана клетка X:"+selectedX+" Y:"+selectedY;
   const span=document.createElement("span");span.textContent="Выбери предмет:";guidance.append(strong,span);
  }
 }
 function applyStatus(data){
  if(!data)return;
  const inv=data.inventory||{};
  Object.keys(counts).forEach(type=>{
   counts[type]=Number(inv[type]||0);
   document.querySelectorAll('[data-item-stock="'+type+'"]').forEach(el=>el.textContent=counts[type]);
   const el=document.getElementById("map-"+type+"-count");
   if(el)el.textContent=counts[type];
   document.querySelector('[data-map-item-row="'+type+'"]')?.classList.toggle("hidden",counts[type]<1);
  });
  const total=Object.values(counts).reduce((sum,count)=>sum+count,0);
  if(totalLabel)totalLabel.textContent=total?" · "+total:"";
  document.getElementById("map-items-empty")?.classList.toggle("hidden",total>0);
  const remaining=data.purchase_remaining||{};
  Object.keys(counts).forEach(type=>{
   document.querySelectorAll('[data-item-remaining="'+type+'"]').forEach(el=>el.textContent=data.unlimited_purchases?"∞":Number(remaining[type]??0));
  });
  if(data.balance!==undefined){
   document.getElementById("pi-balance").textContent=Number(data.balance||0).toLocaleString("ru-RU");
   document.getElementById("pi-shop-balance").textContent=Number(data.balance||0).toLocaleString("ru-RU");
  }
  beacons=Array.isArray(data.beacons)?data.beacons:[];
  bombCells=new Set((data.bomb_cells||[]).map(c=>key(c.x,c.y)));
  renderGuidance();
  renderBeaconButtons();
  drawMap();
 }
 async function load(){if(!currentUser||!activeSeason?.id)return;const {data,error}=await supabaseClient.rpc("get_map_item_status",{p_season_id:activeSeason.id});if(error){console.warn("MAP ITEMS:",error);say("Выполните новую SQL-миграцию для предметов.",true);return}applyStatus(data)}
 async function buy(type){if(busy||!prices[type])return;if(!confirm("Купить за "+prices[type]+" piCoin?"))return;busy=true;const {data,error}=await supabaseClient.rpc("buy_map_item",{p_item_type:type});busy=false;if(error||!data?.success){console.warn("MAP ITEM PURCHASE:",error||data);const e=data?.error;say(e==="NOT_ENOUGH_COINS"?"Недостаточно piCoin.":e==="DAILY_LIMIT"?"Суточный лимит покупок исчерпан.":e==="INVENTORY_LIMIT"?"Инвентарь заполнен.":"Покупка не выполнена. Обновите страницу и попробуйте снова.",true);return}applyStatus(data.status);const shopOutput=document.getElementById("pi-shop-message");if(shopOutput){shopOutput.textContent=names[type]+" куплена. Теперь она находится в 🎒 Моих предметах на карте.";shopOutput.classList.remove("error")}shopItemButton?.classList.remove("hidden")}
 async function use(type){if(busy)return;if(selectedX===null||selectedY===null){say("Сначала выберите клетку.",true);return}if(counts[type]<=0){say("Сначала купите предмет.",true);return}busy=true;let result;
  if(type==="bomb"){if(!confirm("Создать увеличенную воронку из 145 пикселей?")){busy=false;return}result=await supabaseClient.rpc("use_map_bomb",{p_x:selectedX,p_y:selectedY})}
  else if(type==="beacon"){const label=prompt("Подпись маяка — до 32 символов:","");if(label===null){busy=false;return}if(!label.trim()||label.trim().length>32){busy=false;say("Нужно от 1 до 32 символов.",true);return}result=await supabaseClient.rpc("place_map_beacon",{p_x:selectedX,p_y:selectedY,p_label:label.trim()})}
  else result=await supabaseClient.rpc("reveal_pixel_owner",{p_x:selectedX,p_y:selectedY});busy=false;const data=result.data,error=result.error;
  if(error||!data?.success){const e=data?.error||"",m={EDGE_LIMIT:"Выберите центр не ближе восьми клеток к краю.",ANONYMOUS_BOMB:"Автор бомбы скрыт.",OWN_PIXEL:"Это ваш пиксель.",EMPTY_PIXEL:"Клетка свободна.",BEACON_LIMIT:"Лимит маяков достигнут.",PROFANITY:"Подпись не прошла фильтр.",NO_LINKS:"Ссылки запрещены.",SEASON_LIMIT:"Две бомбы за неделю уже использованы.",CELL_OCCUPIED:"На клетке уже есть маяк."};say(m[e]||"Предмет не использован.",true);return}
  applyStatus(data.status);if(type==="bomb"){(data.cells||[]).forEach(c=>{const i=Number(c.y)*MAP_WIDTH+Number(c.x),ci=COLORS.indexOf(c.color);if(ci>=0){pixels[i]=ci;pixelOwners[i]=null}});say("Увеличенная воронка из 145 пикселей создана.");scheduleRankingRefresh()}else if(type==="beacon")say("Маяк установлен до конца недели.");else{say("Владелец: "+data.nickname+" · "+(data.class_name||"без класса"));alert("🕵️ Владелец пикселя\n"+data.nickname+" · "+(data.class_name||"без класса"))}drawMap()}
 function describeCell(x,y){if(bombCells.has(key(x,y)))return{type:"bomb"};const b=beacons.find(v=>Number(v.x)===x&&Number(v.y)===y);return b?{type:"beacon",label:b.label,class_name:b.class_name}:null}
 function updateMarkers(){if(!beaconLayer)return;beaconLayer.querySelectorAll(".map-beacon-flag").forEach(button=>{const b=beacons.find(v=>String(v.id)===button.dataset.beaconId);if(!b)return;const px=(Number(b.x)+.5-MAP_WIDTH/2)*scale,py=(Number(b.y)+.5-MAP_HEIGHT/2)*scale;button.style.transform="translate(calc(-50% + "+(offsetX+px)+"px),calc(-100% + "+(offsetY+py)+"px))"})}
 function openBeacon(beacon){openedBeacon=beacon;beaconClass.textContent=beacon.class_name||"Без класса";beaconLabel.textContent=beacon.label;beaconRemove.classList.toggle("hidden",!beacon.is_owner);beaconStatus.textContent="";if(beaconDialog&&!beaconDialog.open)beaconDialog.showModal()}
 function renderBeaconButtons(){if(!beaconLayer)return;beaconLayer.replaceChildren();beacons.forEach(beacon=>{const button=document.createElement("button");button.type="button";button.className="map-beacon-flag";button.dataset.beaconId=String(beacon.id);button.textContent="🚩";button.title=beacon.label;button.setAttribute("aria-label","Открыть маяк: "+beacon.label);button.addEventListener("click",event=>{event.stopPropagation();openBeacon(beacon)});beaconLayer.append(button)});updateMarkers()}
 async function removeBeacon(){if(!openedBeacon?.is_owner||busy)return;if(!confirm("Убрать этот маяк с карты?"))return;busy=true;beaconRemove.disabled=true;const {data,error}=await supabaseClient.rpc("remove_map_beacon",{p_beacon_id:openedBeacon.id});busy=false;beaconRemove.disabled=false;if(error||!data?.success){beaconStatus.textContent="Не удалось убрать маяк.";beaconStatus.classList.add("error");return}beaconDialog.close();openedBeacon=null;applyStatus(data.status);say("Маяк убран.")}
 function drawMarkers(){}
 async function openItems(){
  await load();
  renderGuidance();
  if(itemDialog&&!itemDialog.open)itemDialog.showModal();
 }
 document.querySelectorAll("[data-map-item-buy]").forEach(b=>b.addEventListener("click",()=>buy(b.dataset.mapItemBuy)));
 document.querySelectorAll("[data-map-item-use]").forEach(b=>b.addEventListener("click",()=>use(b.dataset.mapItemUse)));
 const itemDialog=document.getElementById("map-items-dialog");
 document.getElementById("map-items-open")?.addEventListener("click",openItems);
 document.getElementById("map-items-close")?.addEventListener("click",()=>itemDialog?.close());
 document.getElementById("map-items-shop")?.addEventListener("click",()=>{itemDialog?.close();piCoin.open()});
 shopItemButton?.addEventListener("click",()=>{document.getElementById("pi-shop-dialog")?.close();shopItemButton.classList.add("hidden");openItems()});
 document.getElementById("beacon-dialog-close")?.addEventListener("click",()=>beaconDialog?.close());
 beaconRemove?.addEventListener("click",removeBeacon);
 itemDialog?.addEventListener("click",event=>{if(event.target!==itemDialog)return;const b=itemDialog.getBoundingClientRect();if(event.clientX<b.left||event.clientX>b.right||event.clientY<b.top||event.clientY>b.bottom)itemDialog.close()});
 setInterval(()=>{if(!document.hidden&&currentUser&&activeSeason)load()},120000);
 window.addEventListener("focus",()=>{if(currentUser&&activeSeason)load()});
 const api={load,open:openItems,describeCell,drawMarkers,updateMarkers};window.mapItems=api;return api;
})();


// ---------- DAILY PI COIN TICKER ----------
const piTicker=(()=>{
 const openButton=document.getElementById("pi-ticker-open"),dialog=document.getElementById("pi-ticker-dialog"),input=document.getElementById("pi-ticker-input"),bidInput=document.getElementById("pi-ticker-bid-price"),bidButton=document.getElementById("pi-ticker-bid"),statusEl=document.getElementById("pi-ticker-status");
 const nicknameEl=document.getElementById("pi-ticker-nickname"),messageEl=document.getElementById("pi-ticker-message"),dialogNickname=document.getElementById("pi-ticker-dialog-nickname"),dialogMessage=document.getElementById("pi-ticker-dialog-message"),minPriceEl=document.getElementById("pi-ticker-min-price"),priceEl=document.getElementById("pi-ticker-price");
 let state=null,busy=false,lastUserId=null;
 function showStatus(text,error=false){if(!statusEl)return;statusEl.textContent=text;statusEl.classList.toggle("error",error)}
 function updateBid(){
  const minimum=Number(state?.next_price||10),price=Number(bidInput?.value);
  priceEl.textContent=Number.isInteger(price)&&price>0?price.toLocaleString("ru-RU"):minimum.toLocaleString("ru-RU");
  bidButton.disabled=busy||Boolean(state?.is_mine)||!Number.isInteger(price)||price<minimum||price>Number(state?.balance||0);
 }
 function render(){
  const hasMessage=Boolean(state?.message),nickname=hasMessage?state.nickname:"Сегодня свободно",message=hasMessage?state.message:"Размести сообщение за 10 piCoin",minimum=Number(state?.next_price||10);
  nicknameEl.textContent=nickname;messageEl.textContent=message;dialogNickname.textContent=hasMessage?nickname:"Сегодня место свободно";dialogMessage.textContent=hasMessage?message:"Начни торги первым.";
  minPriceEl.textContent=minimum.toLocaleString("ru-RU");bidInput.min=String(minimum);
  if(!Number.isInteger(Number(bidInput.value))||Number(bidInput.value)<minimum)bidInput.value=String(minimum);
  updateBid();if(state?.is_mine)showStatus("Сейчас показывается твоё сообщение.");
 }
 async function load(){
  if(!currentUser)return;const userId=currentUser.id;const {data,error}=await supabaseClient.rpc("get_pi_ticker");
  if(!currentUser||currentUser.id!==userId)return;if(error){console.warn("PI TICKER:",error);return}state=data;render();
 }
 async function bid(){
  const message=input.value.trim(),price=Number(bidInput.value),minimum=Number(state?.next_price||10);if(busy||!message)return;
  if(message.length>80){showStatus("Не больше 80 символов.",true);return}
  if(!Number.isInteger(price)||price<minimum){showStatus("Ставка должна быть не меньше "+minimum+" piCoin.",true);return}
  if(!confirm("Разместить сообщение за "+price+" piCoin?"))return;
  busy=true;render();showStatus("");const {data,error}=await supabaseClient.rpc("bid_pi_ticker",{p_message:message,p_price:price});busy=false;
  if(error||!data?.success){const e=data?.error,m={NOT_ENOUGH_COINS:"Недостаточно piCoin.",BID_TOO_LOW:"Ставку уже перебили. Укажите новую цену.",OWN_MESSAGE:"Нельзя перебивать своё сообщение.",PROFANITY:"Сообщение не прошло фильтр.",NO_LINKS:"Ссылки запрещены.",INVALID_MESSAGE:"Нужно от 1 до 80 символов.",INVALID_PRICE:"Укажите целое число piCoin."};showStatus(m[e]||"Не удалось разместить сообщение.",true);await load();return}
  state=data.status;input.value="";document.getElementById("pi-balance").textContent=Number(state.balance||0).toLocaleString("ru-RU");document.getElementById("pi-shop-balance").textContent=Number(state.balance||0).toLocaleString("ru-RU");showStatus("Сообщение размещено!");render();
 }
 openButton?.addEventListener("click",async()=>{await load();if(dialog&&!dialog.open)dialog.showModal()});
 document.getElementById("pi-ticker-close")?.addEventListener("click",()=>dialog?.close());bidInput?.addEventListener("input",updateBid);bidButton?.addEventListener("click",bid);
 dialog?.addEventListener("click",event=>{if(event.target!==dialog)return;const b=dialog.getBoundingClientRect();if(event.clientX<b.left||event.clientX>b.right||event.clientY<b.top||event.clientY>b.bottom)dialog.close()});
 setInterval(()=>{const id=currentUser?.id||null;if(id!==lastUserId){lastUserId=id;if(id)load()}else if(id&&!document.hidden)load()},15000);
 return {load};
})();
