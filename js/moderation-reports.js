/* ---------- MODERATION REPORTS ---------- */
(function moderationReportsModule() {
  const dialog=document.getElementById("moderation-report-dialog");
  const form=document.getElementById("moderation-report-form");
  const reason=document.getElementById("moderation-report-reason");
  const details=document.getElementById("moderation-report-details");
  const targetText=document.getElementById("moderation-report-target");
  const message=document.getElementById("moderation-report-message");
  const submit=document.getElementById("moderation-report-submit");
  let target=null;
  const labels={bullying:"Оскорбление или травля",inappropriate:"Непристойный контент",personal_data:"Чужие личные данные",spam:"Спам или намеренная порча",cheating:"Нечестная игра",other:"Другое нарушение"};
  window.openModerationReportDialog=value=>{
    if(!currentUser||!dialog||!value)return;
    target=value;reason.value="";details.value="";message.textContent="";message.classList.remove("error");
    targetText.textContent=value.type==="chat"?"Сообщение: "+String(value.label||"").slice(0,180):"Пиксель: X "+value.x+", Y "+value.y;
    if(!dialog.open)dialog.showModal();
  };
  document.getElementById("moderation-report-close")?.addEventListener("click",()=>dialog.close());
  dialog?.addEventListener("click",event=>{
    if(event.target!==dialog)return;
    const r=dialog.getBoundingClientRect();
    if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();
  });
  document.getElementById("pixel-report-button")?.addEventListener("click",()=>{
    if(selectedX===null||selectedY===null||!activeSeason)return;
    window.openModerationReportDialog({type:"pixel",seasonId:activeSeason.id,x:selectedX,y:selectedY});
  });
  form?.addEventListener("submit",async event=>{
    event.preventDefault();if(!target||!reason.value)return;
    submit.disabled=true;submit.textContent="ОТПРАВЛЯЕМ…";message.textContent="";
    const chat=target.type==="chat";
    const args=chat?{p_message_id:target.messageId,p_reason:reason.value,p_details:details.value.trim()}:{p_season_id:target.seasonId,p_x:target.x,p_y:target.y,p_reason:reason.value,p_details:details.value.trim()};
    const {data,error}=await supabaseClient.rpc(chat?"create_chat_report":"create_pixel_report",args);
    submit.disabled=false;submit.textContent="ОТПРАВИТЬ ЖАЛОБУ";
    if(error||!data?.success){
      const code=String(data?.error||error?.message||"");
      message.textContent=code.includes("DUPLICATE")?"Вы уже отправляли жалобу на этот объект.":code.includes("LIMIT")?"Слишком много жалоб. Попробуйте позже.":code.includes("OWN")?"Нельзя пожаловаться на собственный контент.":"Не удалось отправить жалобу.";
      message.classList.add("error");return;
    }
    message.textContent="Жалоба отправлена администратору.";
    setTimeout(()=>dialog.close(),900);
  });

  const adminTab=document.getElementById("admin-reports-tab");
  const filter=document.getElementById("admin-reports-status");
  const list=document.getElementById("admin-reports-list");
  const count=document.getElementById("admin-reports-count");
  const statusNames={open:"Ожидает",resolved:"Рассмотрено",dismissed:"Отклонено"};

  function addBox(card,className,text){
    const box=document.createElement("div");box.className=className;box.textContent=text;card.appendChild(box);return box;
  }
  function render(reports){
    list.replaceChildren();count.textContent=reports.length.toLocaleString("ru-RU");
    if(!reports.length){list.innerHTML='<p class="admin-reports-empty">Жалоб с таким статусом нет.</p>';return;}
    reports.forEach(item=>{
      const card=document.createElement("article");card.className="admin-report-card";
      const header=document.createElement("div");header.className="admin-report-header";
      const title=document.createElement("div"),strong=document.createElement("strong"),date=document.createElement("span"),badge=document.createElement("span");
      strong.textContent=item.target_type==="chat"?"💬 Сообщение":"🎨 Пиксель";date.textContent=new Date(item.created_at).toLocaleString("ru-RU");
      badge.className="admin-report-status "+item.status;badge.textContent=statusNames[item.status]||item.status;
      title.append(strong,date);header.append(title,badge);card.appendChild(header);
      addBox(card,"admin-report-meta","Жалоба от: "+item.reporter_nickname+" ("+item.reporter_username+") · Автор: "+(item.target_nickname||"неизвестно")+" ("+(item.target_username||"—")+")");
      const reasonBox=addBox(card,"admin-report-reason",labels[item.reason]||item.reason);
      if(item.details){const p=document.createElement("p");p.textContent=item.details;reasonBox.appendChild(p);}
      addBox(card,"admin-report-evidence",item.target_type==="chat"?"Сообщение: "+(item.content_snapshot||"недоступно"):"Координаты: X "+item.pixel_x+", Y "+item.pixel_y+" · Цвет: "+(item.pixel_color||"—")+" · Класс: "+(item.target_class_name||"—"));
      if(item.status==="open"){
        const actions=document.createElement("div");actions.className="admin-report-actions";
        [["✓ РАССМОТРЕНО","resolved"],["ОТКЛОНИТЬ","dismissed"]].forEach(pair=>{
          const button=document.createElement("button");button.type="button";button.textContent=pair[0];
          button.addEventListener("click",async()=>{
            const note=prompt("Комментарий администратора (необязательно):","");if(note===null)return;
            actions.querySelectorAll("button").forEach(b=>b.disabled=true);
            const {data,error}=await supabaseClient.rpc("admin_review_moderation_report",{p_report_id:item.report_id,p_status:pair[1],p_note:note.trim()});
            if(error||!data?.success){alert("Не удалось сохранить решение.");actions.querySelectorAll("button").forEach(b=>b.disabled=false);return;}
            await load();
          });actions.appendChild(button);
        });card.appendChild(actions);
      }else if(item.admin_note){addBox(card,"admin-report-note","Комментарий администратора: "+item.admin_note);}
      list.appendChild(card);
    });
  }
  async function load(){
    if(!currentUserIsAdmin)return;
    list.innerHTML='<p class="admin-reports-empty">Загрузка…</p>';
    const {data,error}=await supabaseClient.rpc("admin_get_moderation_reports",{p_status:filter.value});
    if(error){list.innerHTML='<p class="admin-reports-empty error">Не удалось загрузить жалобы.</p>';return;}
    render(data?.reports||[]);
  }
  adminTab?.addEventListener("click",load);
  filter?.addEventListener("change",load);
  document.getElementById("admin-reports-refresh")?.addEventListener("click",load);
})();
