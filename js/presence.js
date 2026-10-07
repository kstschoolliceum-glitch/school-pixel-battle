let currentUserIsAdmin = false;

function hideAdminOnlineUsers() {
  const host = document.getElementById("admin-online-users");
  host?.classList.add("hidden");
  adminOnlineRequestNumber++;
  clearTimeout(adminOnlineRefreshTimer);
  adminOnlineRefreshTimer = null;
}

function renderAdminOnlineUsers(rows, total) {
  const host = document.getElementById("admin-online-users");
  const list = document.getElementById("admin-online-list");
  const count = document.getElementById("admin-online-count");

  if (!host || !list || !count || !currentUserIsAdmin) return;

  host.classList.remove("hidden");
  count.textContent = Number(total || 0).toLocaleString("ru-RU");
  list.replaceChildren();

  if (!rows || rows.length === 0) {
    const empty = document.createElement("p");
    empty.textContent = "Сейчас никого нет в сети.";
    list.append(empty);
    return;
  }

  rows.forEach(item => {
    const row = document.createElement("div");
    row.className = "admin-online-row";

    const dot = document.createElement("span");
    dot.className = "admin-online-dot";
    dot.setAttribute("aria-hidden", "true");

    const identity = document.createElement("div");
    identity.className = "admin-online-identity";

    const nickname = document.createElement("strong");
    nickname.textContent = item.nickname || "Без ника";
    enablePlayerCardLink(nickname, item.user_id);

    const className = document.createElement("span");
    className.textContent = item.class_name || "Администратор";

    identity.append(nickname, className);
    row.append(dot, identity);

    if (item.user_id === currentUser?.id) {
      const you = document.createElement("span");
      you.className = "admin-online-you";
      you.textContent = "ВЫ";
      row.append(you);
    }

    list.append(row);
  });
}

async function loadAdminOnlineUsers(userIds) {
  if (!currentUserIsAdmin || !currentUser) return;

  const uniqueIds = [...new Set(userIds || [])];
  const ownRequest = ++adminOnlineRequestNumber;
  const list = document.getElementById("admin-online-list");
  const host = document.getElementById("admin-online-users");
  const count = document.getElementById("admin-online-count");

  host?.classList.remove("hidden");
  if (count) count.textContent = uniqueIds.length.toLocaleString("ru-RU");

  if (uniqueIds.length === 0) {
    renderAdminOnlineUsers([], 0);
    return;
  }

  const { data, error } = await supabaseClient.rpc(
    "admin_get_online_users",
    {
      p_user_ids: uniqueIds
    }
  );

  if (ownRequest !== adminOnlineRequestNumber || !currentUserIsAdmin) return;

  if (error) {
    console.error("ADMIN ONLINE USERS ERROR:", error);
    if (list) {
      const failure = document.createElement("p");
      failure.className = "admin-online-error";
      failure.textContent = "Не удалось загрузить список онлайн.";
      list.replaceChildren(failure);
    }
    return;
  }

  renderAdminOnlineUsers(data || [], uniqueIds.length);
}

function scheduleAdminOnlineUsersRefresh(userIds = currentOnlineUserIds) {
  currentOnlineUserIds = [...new Set(userIds || [])];
  if (!currentUserIsAdmin) return;

  clearTimeout(adminOnlineRefreshTimer);
  adminOnlineRefreshTimer = setTimeout(
    () => loadAdminOnlineUsers(currentOnlineUserIds),
    800
  );
}


async function checkAdminStatus() {

  const adminButton =
    document.getElementById(
      "admin-button"
    );


  if (!currentUser) {

    currentUserIsAdmin = false;
    syncChatMessageLimit();

    adminButton.classList.add(
      "hidden"
    );

    hideAdminOnlineUsers();

    return false;
  }


  const {
    data,
    error
  } =
    await supabaseClient.rpc(
      "is_admin"
    );


  if (error) {

    console.error(
      "ADMIN CHECK ERROR:",
      error
    );

    currentUserIsAdmin = false;
    syncChatMessageLimit();

    adminButton.classList.add(
      "hidden"
    );

    hideAdminOnlineUsers();

    return false;
  }


  currentUserIsAdmin =
    data === true;

  updateCooldown();

  syncChatMessageLimit();

  if (currentUserIsAdmin) {

    adminButton.classList.remove(
      "hidden"
    );

    scheduleAdminOnlineUsersRefresh();

  } else {

    adminButton.classList.add(
      "hidden"
    );

    hideAdminOnlineUsers();

  }


  console.log(
    "Admin:",
    currentUserIsAdmin
  );


  return currentUserIsAdmin;

}
let playerActivityHeartbeatTimer = null;
let lastPlayerActivityTouchAt = 0;

async function touchPlayerActivity(force = false) {
  if (
    !currentUser ||
    document.hidden ||
    (!force && Date.now() - lastPlayerActivityTouchAt < 10 * 60 * 1000)
  ) return;

  lastPlayerActivityTouchAt = Date.now();

  const { error } = await supabaseClient.rpc(
    "touch_player_activity"
  );

  if (error && error.code !== "PGRST202" && error.code !== "42883") {
    console.warn("PLAYER ACTIVITY ERROR:", error);
  }
}

function startPlayerActivityHeartbeat() {
  clearInterval(playerActivityHeartbeatTimer);
  touchPlayerActivity(true);
  playerActivityHeartbeatTimer = setInterval(
    touchPlayerActivity,
    15 * 60 * 1000
  );
}

document.addEventListener("visibilitychange", () => {
  if (
    document.hidden ||
    !currentUser
  ) {
    return;
  }

  touchPlayerActivity();
  checkForSeasonChange();
});

async function startOnlinePresence() {

  if (!currentUser) {
    return;
  }

  startPlayerActivityHeartbeat();


  if (onlinePresenceChannel) {

    await supabaseClient.removeChannel(
      onlinePresenceChannel
    );

    onlinePresenceChannel = null;
  }


  onlinePresenceChannel =
    supabaseClient.channel(
      "pixel-battle-online",
      {
        config: {
          presence: {
            key: currentUser.id
          }
        }
      }
    );


  onlinePresenceChannel.on(
    "presence",
    {
      event: "sync"
    },
    () => {

      const state =
        onlinePresenceChannel.presenceState();


      const onlineCount =
        Object.keys(state).length;

      currentOnlineUserIds =
        Object.keys(state);


      const counter =
        document.getElementById(
          "online-users-count"
        );


      if (counter) {

        counter.textContent =
          onlineCount.toLocaleString(
            "ru-RU"
          );

      }

      scheduleAdminOnlineUsersRefresh(
        currentOnlineUserIds
      );

    }
  );


  onlinePresenceChannel.subscribe(
    async (status) => {

      if (status !== "SUBSCRIBED") {
        return;
      }


      await onlinePresenceChannel.track({
        user_id: currentUser.id,
        online_at:
          new Date().toISOString()
      });

    }
  );

}
