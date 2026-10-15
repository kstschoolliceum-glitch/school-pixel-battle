/* Owner-only controls; every corresponding RPC also checks the caller. */
window.adminStaff = (() => {
  let superAdmin = false;
  let request = 0;
  let busy = false;
  let searchRequest = 0;
  let avatarUrls = [];
  let beforeAuditId = null;
  const status = document.getElementById("admin-staff-status");
  const results = document.getElementById("admin-staff-search-results");
  const list = document.getElementById("admin-staff-list");
  const audit = document.getElementById("admin-staff-audit");
  const moreAudit = document.getElementById("admin-staff-audit-more");

  function message(text, error = false) {
    status.textContent = text;
    status.classList.toggle("error", error);
  }
  function syncControls() {
    document.querySelectorAll("[data-super-admin-only]").forEach(element => {
      element.hidden = !superAdmin;
      if (element.hasAttribute("data-admin-panel")) {
        const active = document.getElementById("admin-staff-tab").classList.contains("active");
        element.classList.toggle("hidden", !superAdmin || !active);
      } else element.classList.toggle("hidden", !superAdmin);
    });
    if (!superAdmin) {
      results.replaceChildren(); list.replaceChildren(); audit.replaceChildren();
      avatarUrls.forEach(url => URL.revokeObjectURL(url)); avatarUrls = [];
      searchRequest++;
    }
  }
  async function refreshAccess() {
    const ownRequest = ++request;
    superAdmin = false;
    syncControls();
    if (!currentUserIsAdmin || !currentUser) return;
    const userId = currentUser.id;
    const { data, error } = await supabaseClient.rpc("get_my_admin_access");
    if (ownRequest !== request || currentUser?.id !== userId) return;
    superAdmin = !error && data?.is_super_admin === true;
    if (!error && data?.is_admin === false) currentUserIsAdmin = false;
    syncControls();
    if (superAdmin && document.getElementById("admin-staff-tab").classList.contains("active")) await load();
  }
  function node(tag, text, className) {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    return element;
  }
  function date(value) {
    return value ? new Date(value).toLocaleString("ru-RU") : "—";
  }
  async function setAssistant(user, active) {
    if (!superAdmin || busy) return;
    if (!confirm((active ? "Назначить помощником: " : "Отозвать права: ") + (user.nickname || "Ученик") + "?")) return;
    busy = true;
    message("Сохранение…");
    try {
      const { data, error } = await supabaseClient.rpc("owner_set_assistant_admin", {
        p_user_id: user.user_id, p_active: active
      });
      if (error || !data?.success) {
        message("Не удалось изменить права. Проверьте блокировку пользователя и свои полномочия.", true);
        return;
      }
      results.replaceChildren();
      await load();
      message(active ? "Помощник назначен. Доступ появится при следующем входе в админ-панель или обновлении игры." : "Права помощника отозваны.");
    } finally { busy = false; }
  }
  async function search(event) {
    event.preventDefault();
    if (!superAdmin) return;
    const query = document.getElementById("admin-staff-search").value.trim();
    if (query.length < 2) { message("Введите не менее двух символов ника."); return; }
    const ownRequest = ++searchRequest;
    const { data, error } = await supabaseClient.rpc("owner_search_admin_candidates", { p_query: query });
    if (ownRequest !== searchRequest || !superAdmin) return;
    results.replaceChildren();
    avatarUrls.forEach(url => URL.revokeObjectURL(url)); avatarUrls = [];
    if (error) { message("Поиск недоступен. Проверьте SQL-миграцию и права владельца.", true); return; }
    message(data?.length ? "Выберите зарегистрированного ученика." : "Никого не найдено.");
    (data || []).forEach(user => {
      const row = node("div", undefined, "admin-staff-row");
      const avatar = node("span", "👤", "admin-staff-avatar");
      const identity = node("div");
      identity.append(node("strong", user.nickname || "Без ника"),
        node("p", (user.class_name || "Без класса") + " · " +
          (user.banned ? "Заблокирован" : user.admin_role === "super_admin" ? "Владелец" :
            user.admin_role === "assistant_admin" ? "Помощник" : "Ученик")));
      const appoint = node("button", "Назначить помощником администратора");
      appoint.type = "button";
      appoint.disabled = user.banned || user.admin_role !== "student";
      appoint.addEventListener("click", () => setAssistant(user, true));
      row.append(avatar, identity, appoint); results.append(row);
      // Reuse the existing private profile photo bucket, with the caller's RLS.
      supabaseClient.storage.from("profile-photos").download(user.user_id + "/avatar.webp")
        .then(({ data: photo, error: photoError }) => {
          if (photoError || !photo || ownRequest !== searchRequest || !superAdmin || !row.isConnected) return;
          const image = node("img"); image.alt = "";
          image.src = URL.createObjectURL(photo); avatarUrls.push(image.src);
          avatar.replaceChildren(image);
        }).catch(() => {});
    });
  }
  async function loadAudit(append = false) {
    if (!superAdmin) return;
    moreAudit.disabled = true;
    const { data, error } = await supabaseClient.rpc("owner_get_admin_audit", {
      p_before_id: append ? beforeAuditId : null
    });
    if (!superAdmin) return;
    moreAudit.disabled = false;
    if (error) { message("Не удалось загрузить журнал.", true); return; }
    if (!append) audit.replaceChildren();
    (data || []).forEach(item => {
      audit.append(node("li", date(item.created_at) + " · " +
        (item.actor_nickname || "Администратор") + " · " + item.operation + " · " + item.result +
        (item.target_id ? " · " + item.target_id : "")));
    });
    beforeAuditId = data?.length ? data[data.length - 1].id : null;
    moreAudit.hidden = !data || data.length < 100;
  }
  async function load() {
    if (!superAdmin) return;
    const { data, error } = await supabaseClient.rpc("owner_get_admin_staff");
    if (!superAdmin) return;
    if (error) { message("Список помощников недоступен.", true); return; }
    list.replaceChildren();
    (data || []).forEach(user => {
      const row = node("div", undefined, "admin-staff-row");
      const info = node("div");
      info.append(node("strong", user.nickname || "Без ника"),
        node("p", (user.class_name || "Без класса") + " · " +
          (user.active ? user.banned ? "Заблокирован" : "Активен" : "Права отозваны")),
        node("p", "Назначен: " + date(user.appointed_at) + " · " + (user.appointed_by_nickname || "Владелец")));
      if (user.revoked_at) info.append(node("p", "Отозваны: " + date(user.revoked_at)));
      row.append(info);
      if (user.active) {
        const revoke = node("button", "Отозвать права"); revoke.type = "button";
        revoke.addEventListener("click", () => setAssistant(user, false)); row.append(revoke);
      }
      list.append(row);
    });
    if (!data?.length) list.append(node("p", "Помощников пока нет."));
    await loadAudit();
  }
  document.getElementById("admin-staff-search-form").addEventListener("submit", search);
  document.getElementById("admin-staff-tab").addEventListener("click", load);
  moreAudit.addEventListener("click", () => loadAudit(true));
  syncControls();
  return { refreshAccess, isSuperAdmin: () => superAdmin };
})();
