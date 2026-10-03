async function loadMyProfile() {
  const profileUserId = currentUser?.id;

  const {
    data,
    error
  } =
    await supabaseClient.rpc(
      "get_my_profile"
    );


  if (error) {

    console.error(
      "PROFILE ERROR:",
      error
    );

    return;
  }


  if (
    !data ||
    data.length === 0
  ) {
    return;
  }


  if (!currentUser || currentUser.id !== profileUserId) return;
  const profile =
    data[0];
  currentChatNickname =
    normalizeChatMentionName(
      profile.nickname
    );
  dailyTasks.setProfile(profile, profileUserId);


  document.getElementById(
    "profile-nickname"
  ).textContent =
    profile.nickname;
  profileCosmetics.applyOwn();


  document.getElementById(
    "profile-class"
  ).textContent =
    profile.class_name ?? "—";


  document.getElementById(
    "profile-username"
  ).textContent =
    profile.username ?? "—";


  document.getElementById(
    "profile-weekly-pixels"
  ).textContent =
    Number(
      profile.weekly_pixels
    ).toLocaleString("ru-RU");


  document.getElementById(
    "profile-total-pixels"
  ).textContent =
    Number(
      profile.total_pixels
    ).toLocaleString("ru-RU");

  await piCoin.load();
}

function incrementDisplayedProfilePixelCount(
  elementId
) {
  const element =
    document.getElementById(
      elementId
    );

  if (!element) return;

  const current =
    Number(
      String(element.textContent || "")
        .replace(/[^0-9]/g, "")
    );

  element.textContent =
    (Number.isFinite(current) ? current + 1 : 1)
      .toLocaleString("ru-RU");
}

function updateDisplayedProfileAfterPixel() {
  incrementDisplayedProfilePixelCount(
    "profile-weekly-pixels"
  );

  incrementDisplayedProfilePixelCount(
    "profile-total-pixels"
  );
}

let activeSeason = null;
let seasonCountdownTimer = null;
let seasonCheckTimer = null;

function startSeasonCountdown() {

  clearInterval(
    seasonCountdownTimer
  );


  const countdownElement =
    document.getElementById(
      "season-countdown"
    );


  function updateCountdown() {

    if (!activeSeason) {

      countdownElement.textContent = "";

      return;
    }


    const endTime =
      new Date(
        activeSeason.ends_at
      ).getTime();

    const now =
      Date.now();

    let difference =
      endTime - now;


    if (difference <= 0) {

      countdownElement.textContent =
        "Сезон завершён";

      clearInterval(
        seasonCountdownTimer
      );

      return;
    }


    const days =
      Math.floor(
        difference /
        (1000 * 60 * 60 * 24)
      );


    difference %=
      1000 * 60 * 60 * 24;


    const hours =
      Math.floor(
        difference /
        (1000 * 60 * 60)
      );


    difference %=
      1000 * 60 * 60;


    const minutes =
      Math.floor(
        difference /
        (1000 * 60)
      );


    if (days > 0) {

      countdownElement.textContent =
        `Осталось ${days} дн. ${hours} ч.`;

    } else if (hours > 0) {

      countdownElement.textContent =
        `Осталось ${hours} ч. ${minutes} мин.`;

    } else {

      countdownElement.textContent =
        `Осталось ${minutes} мин.`;

    }

  }


  updateCountdown();


  seasonCountdownTimer =
    setInterval(
      updateCountdown,
      30000
    );

}
async function loadActiveSeason() {

  const seasonElement =
    document.getElementById(
      "season-info"
    );


  const {
    data,
    error
  } =
    await supabaseClient
      .from("seasons")
      .select(`
        id,
        number,
        title,
        map_width,
        map_height,
        starts_at,
        ends_at,
        status
      `)
      .eq("is_active", true)
      .eq("status", "active")
      .lte(
        "starts_at",
        new Date().toISOString()
      )
      .gt(
        "ends_at",
        new Date().toISOString()
      )
      .order(
        "starts_at",
        {
          ascending: false
        }
      )
      .limit(1);


  if (
    error ||
    !data ||
    data.length === 0
  ) {

    console.error(
      "ACTIVE SEASON ERROR:",
      error
    );

    activeSeason = null;

    seasonElement.textContent =
      "Нет активного сезона";

    return null;
  }


  activeSeason =
    data[0];


  seasonElement.textContent =
    `Неделя #${activeSeason.number}`;


  console.log(
    "Активный сезон:",
    activeSeason
  );

  startSeasonCountdown();

  return activeSeason;

}
let lastSeasonCheckAt = 0;

async function checkForSeasonChange(force = false) {

  if (
    !currentUser ||
    document.hidden ||
    (!force && Date.now() - lastSeasonCheckAt < 2 * 60 * 1000)
  ) {
    return;
  }

  lastSeasonCheckAt = Date.now();


  const {
    data,
    error
  } =
    await supabaseClient
      .from("seasons")
      .select(`
        id,
        number,
        title,
        map_width,
        map_height,
        starts_at,
        ends_at,
        status
      `)
      .eq("is_active", true)
      .eq("status", "active")
      .lte(
        "starts_at",
        new Date().toISOString()
      )
      .gt(
        "ends_at",
        new Date().toISOString()
      )
      .order(
        "starts_at",
        {
          ascending: false
        }
      )
      .limit(1);


  if (error) {

    console.error(
      "SEASON CHECK ERROR:",
      error
    );

    return;
  }


  if (
    !data ||
    data.length === 0
  ) {
    return;
  }


  const serverSeason =
    data[0];


  /*
   * Первый запуск — просто запоминаем сезон.
   */

  if (!activeSeason) {

    activeSeason =
      serverSeason;

    startSeasonCountdown();

    return;
  }


  /*
   * Сезон тот же — ничего не делаем.
   */

  if (
    serverSeason.id ===
    activeSeason.id
  ) {
    return;
  }


  /*
   * Сервер переключил неделю.
   */

  console.log(
    `Смена сезона: #${activeSeason.number} → #${serverSeason.number}`
  );


  activeSeason =
    serverSeason;


  // Убираем старую карту из памяти браузера.

  pixels.fill(0);
  pixelOwners.fill(null);

  selectedX = null;
  selectedY = null;

  setPixelInformation();


  // Обновляем название недели.

  const seasonElement =
    document.getElementById(
      "season-info"
    );

  seasonElement.textContent =
    `Неделя #${activeSeason.number}`;


  // Перезапускаем таймер.

  startSeasonCountdown();


  // Загружаем данные новой недели.

  await loadPixels();
  await loadClassRanking();
  await loadMyProfile();
  await dailyTasks.load();
    await mapItems.load();
    await piTicker.load();



  drawMap();


  console.log(
    "Новая неделя загружена."
  );

}
function startSeasonWatcher() {

  clearTimeout(seasonCheckTimer);

  const fallbackDelay = 30 * 60 * 1000;
  const endsAt = Date.parse(activeSeason?.ends_at || "");
  const untilSeasonEnd = Number.isFinite(endsAt)
    ? endsAt - Date.now() + 5000
    : fallbackDelay;
  const delay = Math.max(
    30000,
    Math.min(fallbackDelay, untilSeasonEnd)
  );

  seasonCheckTimer = setTimeout(
    async () => {
      await checkForSeasonChange(true);
      startSeasonWatcher();
    },
    delay
  );
}
const referralProfileStatus =
  document.getElementById("referral-profile-status");
const referralLinkRow =
  document.getElementById("referral-link-row");
const referralLinkInput =
  document.getElementById("referral-link-input");
const referralCopyButton =
  document.getElementById("referral-copy-button");
const referralCreateButton =
  document.getElementById("referral-create-button");
const referralInvitedList =
  document.getElementById("referral-invited-list");

async function loadMyReferralProfile() {
  if (!currentUser) {
    return;
  }

  const { data, error } =
    await supabaseClient.rpc(
      "get_my_referral_dashboard"
    );

  if (error) {
    console.error("MY REFERRALS ERROR:", error);
    referralProfileStatus.textContent =
      "Не удалось загрузить приглашения.";
    return;
  }

  const dashboard =
    data ?? {};

  const code =
    dashboard.referral_code ?? "";

  referralProfileStatus.textContent =
    `Приглашено учеников: ${Number(dashboard.invited_count ?? 0)}`;

  referralLinkRow.classList.toggle(
    "hidden",
    !code
  );
  referralCreateButton.classList.toggle(
    "hidden",
    Boolean(code)
  );

  if (code) {
    const url =
      new URL(window.location.href);
    url.search = "";
    url.hash = "";
    url.searchParams.set("ref", code);
    referralLinkInput.value = url.toString();
  }

  referralInvitedList.innerHTML = "";

  for (const item of dashboard.invited ?? []) {
    const row =
      document.createElement("div");
    row.className =
      "referral-invited-item";
    row.textContent =
      `${item.nickname} (${item.username}) · ${item.class_name ?? "без класса"}`;
    enablePlayerCardLink(row, item.user_id);
    referralInvitedList.appendChild(row);
  }

  if ((dashboard.invited ?? []).length === 0) {
    referralInvitedList.textContent =
      "По вашей ссылке пока никто не зарегистрировался.";
  }
}

referralCreateButton.addEventListener(
  "click",
  async () => {
    referralCreateButton.disabled = true;

    const { error } =
      await supabaseClient.rpc(
        "create_my_referral_code"
      );

    referralCreateButton.disabled = false;

    if (error) {
      console.error("CREATE REFERRAL ERROR:", error);
      alert("Не удалось создать ссылку.");
      return;
    }

    await loadMyReferralProfile();
  }
);

referralCopyButton.addEventListener(
  "click",
  async () => {
    try {
      await navigator.clipboard.writeText(
        referralLinkInput.value
      );
      referralCopyButton.textContent =
        "✓ СКОПИРОВАНО";
      setTimeout(() => {
        referralCopyButton.textContent =
          "📋 КОПИРОВАТЬ";
      }, 1500);
    } catch (error) {
      referralLinkInput.select();
      document.execCommand("copy");
    }
  }
);

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
function getLocalDateKey() {

  const now =
    new Date();

  const year =
    now.getFullYear();

  const month =
    String(
      now.getMonth() + 1
    ).padStart(2, "0");

  const day =
    String(
      now.getDate()
    ).padStart(2, "0");


  return `${year}-${month}-${day}`;
}


function showTelegramPopupOnceToday() {

  if (!telegramPopup) {
    return;
  }


  const today =
    getLocalDateKey();


  const lastShown =
    localStorage.getItem(
      "pixelBattleTelegramPopupDate"
    );


  /*
   * Сегодня уже показывали.
   */

  if (lastShown === today) {
    return;
  }


  /*
   * Сразу запоминаем сегодняшний день.
   * Даже если ученик просто обновит страницу,
   * второй раз окно сегодня не появится.
   */

  localStorage.setItem(
    "pixelBattleTelegramPopupDate",
    today
  );


  telegramPopup.classList.remove(
    "hidden"
  );

}


async function showPushPermissionPromptIfNeeded() {

  if (
    !currentUser ||
    !pushPermissionPopup
  ) {
    return;
  }


  if (
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  ) {
    return;
  }


  if (
    Notification.permission ===
    "denied"
  ) {
    return;
  }


  try {

    const registration =
      await navigator.serviceWorker.ready;

    currentPushSubscription =
      await registration.pushManager
        .getSubscription();


    if (currentPushSubscription) {
      return;
    }


    if (
      isIosDevice() &&
      !isStandaloneApp()
    ) {

      pushPermissionPopupText.textContent =
        "На iPhone добавь Pixel Battle на экран «Домой», чтобы включить уведомления о сезонах.";

      pushPermissionEnableButton.textContent =
        "КАК ВКЛЮЧИТЬ";

    } else {

      pushPermissionPopupText.textContent =
        "Включи уведомления, чтобы узнать о начале нового сезона и последних часах перед его завершением.";

      pushPermissionEnableButton.textContent =
        "🔔 ВКЛЮЧИТЬ УВЕДОМЛЕНИЯ";

    }


    pushPermissionPopup.classList.remove(
      "hidden"
    );

  } catch (error) {

    console.error(
      "PUSH PROMPT CHECK ERROR:",
      error
    );

  }

}


function closePushPermissionPopup() {

  pushPermissionPopup?.classList.add(
    "hidden"
  );

}


function closeTelegramPopup() {

  telegramPopup?.classList.add(
    "hidden"
  );


  setTimeout(
    showPushPermissionPromptIfNeeded,
    250
  );

}


telegramLaterButton?.addEventListener(
  "click",
  closeTelegramPopup
);


telegramJoinButton?.addEventListener(
  "click",
  closeTelegramPopup
);


pushPermissionLaterButton?.addEventListener(
  "click",
  closePushPermissionPopup
);


pushPermissionEnableButton?.addEventListener(
  "click",
  async () => {

    if (
      isIosDevice() &&
      !isStandaloneApp()
    ) {

      alert(
        "Откройте меню «Поделиться», выберите «На экран Домой», затем запустите Pixel Battle с нового значка."
      );

      closePushPermissionPopup();

      return;

    }


    pushPermissionEnableButton.disabled =
      true;

    pushPermissionEnableButton.textContent =
      "ПОДКЛЮЧЕНИЕ...";


    await enablePushNotifications();


    if (currentPushSubscription) {

      closePushPermissionPopup();

    } else {

      pushPermissionEnableButton.disabled =
        false;

      pushPermissionEnableButton.textContent =
        "🔔 ПОПРОБОВАТЬ СНОВА";

    }

  }
);
async function recordCurrentUserIp() {
  if (!currentUser) {
    return;
  }

  const storageKey = `pixel-battle-ip-recorded:${currentUser.id}`;
  const lastRecordedAt = Number(localStorage.getItem(storageKey) || 0);

  if (Date.now() - lastRecordedAt < 6 * 60 * 60 * 1000) {
    return;
  }

  try {
    const { error } =
      await supabaseClient.functions.invoke(
        "record-client-ip",
        { body: {} }
      );

    if (error) {
      console.warn("IP RECORD ERROR:", error);
      return;
    }

    localStorage.setItem(storageKey, String(Date.now()));
  } catch (error) {
    console.warn("IP RECORD REQUEST ERROR:", error);
  }
}

async function initializeAuth() {

  const {
    data: { session }
  } =
    await supabaseClient.auth.getSession();

  if (session) {

    currentUser = session.user;

    authScreen.classList.add("hidden");
    window.showUserAgreementIfNeeded?.();
    await restoreStencilForCurrentUser();
    recordCurrentUserIp();
    await loadMyReferralProfile();

    await loadActiveSeason();
    await loadClassNames();
    await loadPixels();
    await loadClassRanking();
    await loadMyProfile();
    await dailyTasks.load();
    await mapItems.load();
    await piTicker.load();

    await checkAdminStatus();
    await updatePushNotificationStatus();

    await startOnlinePresence();

    startSeasonWatcher();
    showTelegramPopupOnceToday();
  } else {

    authScreen.classList.remove("hidden");

  }

}


loginForm.addEventListener(
  "submit",
  async (event) => {

    event.preventDefault();

    loginError.textContent = "";

    const username =
      loginUsername.value
        .trim()
        .toLowerCase();

    const password =
      loginPassword.value;


    if (
      !/^[a-z0-9_]{3,20}$/.test(username)
    ) {

      loginError.textContent =
        "Проверьте логин.";

     return;

    }


/*
 * Ученик вводит dragon77,
 * а Supabase получает технический email.
 */

  const email =
    `${username}@pixel.local`;

    const {
      data,
      error
    } =
      await supabaseClient.auth.signInWithPassword({
        email,
        password
      });


    if (error) {

      console.error(error);

      loginError.textContent =
        "Неверный логин или пароль";

      return;
    }


    currentUser =
      data.user;

    authScreen.classList.add("hidden");
    window.showUserAgreementIfNeeded?.();
    await restoreStencilForCurrentUser();
    recordCurrentUserIp();
    await loadMyReferralProfile();

    await loadActiveSeason();
    await loadClassNames();
    await loadPixels();
    await loadClassRanking();
    await loadMyProfile();
    await dailyTasks.load();
    await mapItems.load();
    await piTicker.load();

    await checkAdminStatus();
    await updatePushNotificationStatus();

    await startOnlinePresence();

    startSeasonWatcher();
    showTelegramPopupOnceToday();
  }
);
async function loadClassNames() {

  const {
    data,
    error
  } =
    await supabaseClient
      .from("classes")
      .select("id,name")
      .eq("is_active", true);

  if (error) {

    console.error(
      "CLASS NAMES ERROR:",
      error
    );

    return;
  }

  classNamesById.clear();

  for (const item of data ?? []) {

    classNamesById.set(
      String(item.id),
      item.name
    );

  }

}
function decodeMapSnapshotBytes(
  encoded,
  expectedLength
) {
  const normalized =
    String(encoded || "")
      .replace(/\s+/g, "");

  const binary =
    atob(normalized);

  if (binary.length !== expectedLength) {
    throw new Error(
      "MAP_SNAPSHOT_LENGTH_MISMATCH"
    );
  }

  const output =
    new Uint8Array(expectedLength);

  for (
    let index = 0;
    index < expectedLength;
    index++
  ) {
    output[index] =
      binary.charCodeAt(index);
  }

  return output;
}

async function loadPixelsFromSnapshot(
  seasonId
) {
  const {
    data,
    error
  } =
    await supabaseClient.rpc(
      "get_map_snapshot_v1",
      {
        p_season_id: seasonId
      }
    );

  if (error) {
    if (
      error.code !== "PGRST202" &&
      error.code !== "42883"
    ) {
      console.warn(
        "MAP SNAPSHOT ERROR, USING FALLBACK:",
        error
      );
    }

    return false;
  }

  if (!data?.success) {
    return false;
  }

  const width =
    Number(data.width);

  const height =
    Number(data.height);

  if (
    width !== MAP_WIDTH ||
    height !== MAP_HEIGHT
  ) {
    console.warn(
      "MAP SNAPSHOT SIZE MISMATCH:",
      width,
      height
    );

    return false;
  }

  try {
    const cellCount =
      MAP_WIDTH * MAP_HEIGHT;

    const colorBytes =
      decodeMapSnapshotBytes(
        data.colors,
        cellCount
      );

    const ownerBytes =
      decodeMapSnapshotBytes(
        data.owners,
        cellCount
      );

    const classNamesByCode = [];

    for (
      const item
      of Array.isArray(data.classes)
        ? data.classes
        : []
    ) {
      const code =
        Number(item.code);

      const name =
        String(item.name || "");

      if (
        code > 0 &&
        code <= 255 &&
        name
      ) {
        classNamesByCode[code] =
          name;

        if (item.id !== null &&
            item.id !== undefined) {
          classNamesById.set(
            String(item.id),
            name
          );
        }
      }
    }

    pixelOwners.fill(null);

    for (
      let position = 0;
      position < cellCount;
      position++
    ) {
      const colorIndex =
        colorBytes[position];

      pixels[position] =
        colorIndex < COLORS.length
          ? colorIndex
          : 0;

      const ownerCode =
        ownerBytes[position];

      pixelOwners[position] =
        ownerCode > 0
          ? classNamesByCode[ownerCode] ?? null
          : null;
    }

    pixelCount =
      Math.max(
        0,
        Number(data.pixel_count) || 0
      );

    pixelCountText.textContent =
      pixelCount.toLocaleString(
        "ru-RU"
      );

    console.log(
      `Карта загружена компактным снимком: ${pixelCount} пикселей`
    );

    drawMap();

    return true;
  } catch (snapshotError) {
    console.warn(
      "MAP SNAPSHOT DECODE ERROR, USING FALLBACK:",
      snapshotError
    );

    return false;
  }
}

async function loadPixels() {

  if (!activeSeason) {
    await loadActiveSeason();
  }


  if (!activeSeason) {

    console.error(
      "Нельзя загрузить карту: активного сезона нет."
    );

    return;
  }


  const seasonId =
    activeSeason.id;


  if (
    await loadPixelsFromSnapshot(
      seasonId
    )
  ) {
    return;
  }


  /*
   * Supabase ограничивает количество строк
   * в одном ответе.
   *
   * Поэтому загружаем карту страницами.
   */

  const PAGE_SIZE = 1000;

  let from = 0;

  let allPixels = [];


  while (true) {

    const {
      data,
      error
    } =
      await supabaseClient
        .from("pixels")
        .select(`
          x,
          y,
          color,
          class_id,
          classes (
            name
          )
        `)
        .eq(
          "season_id",
          seasonId
        )
        .order(
          "y",
          {
            ascending: true
          }
        )
        .order(
          "x",
          {
            ascending: true
          }
        )
        .range(
          from,
          from + PAGE_SIZE - 1
        );


    if (error) {

      console.error(
        "Ошибка загрузки карты:",
        error
      );

      return;
    }


    const page =
      data ?? [];


    allPixels.push(
      ...page
    );


    /*
     * Если сервер вернул меньше 1000,
     * значит это последняя страница.
     */

    if (
      page.length < PAGE_SIZE
    ) {
      break;
    }


    from += PAGE_SIZE;

  }


  /*
   * Только после успешной загрузки
   * всей карты очищаем старое состояние.
   */

  pixels.fill(0);

  pixelOwners.fill(null);


  for (
    const pixel
    of allPixels
  ) {

    const colorIndex =
      COLORS.indexOf(
        pixel.color
      );


    if (
      colorIndex === -1
    ) {
      continue;
    }


    const index =
      pixel.y * MAP_WIDTH +
      pixel.x;


    pixels[index] =
      colorIndex;


    pixelOwners[index] =
      pixel.classes?.name ??
      null;


    if (
      pixel.class_id &&
      pixel.classes?.name
    ) {

      classNamesById.set(
        String(
          pixel.class_id
        ),
        pixel.classes.name
      );

    }

  }


  pixelCount =
    allPixels.length;


  pixelCountText.textContent =
    pixelCount.toLocaleString(
      "ru-RU"
    );


  console.log(
    `Карта загружена полностью: ${pixelCount} пикселей`
  );


  drawMap();

}

function subscribeToPixels() {

  console.log("Подключаем Realtime...");

  supabaseClient
    .channel("pixel-map")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "pixels"
      },
      (payload) => {

        console.log(
          "Realtime pixel:",
          payload
        );

        const pixel = payload.new;

        if (!pixel) {
          return;
        }

        const x = pixel.x;
        const y = pixel.y;

        if (
          x < 0 ||
          y < 0 ||
          x >= MAP_WIDTH ||
          y >= MAP_HEIGHT
        ) {
          return;
        }

        const colorIndex =
          COLORS.indexOf(pixel.color);

        if (colorIndex === -1) {
          return;
        }

        const index =
          y * MAP_WIDTH + x;

        pixels[index] =
          colorIndex;
        pixelOwners[index] =
          pixel.class_id
            ? classNamesById.get(
                String(pixel.class_id)
              ) ?? null
            : null;

        scheduleMapDraw();

        scheduleRankingRefresh();
      }
    )
    .subscribe((status) => {

      console.log(
        "Realtime status:",
        status
      );

    });

}

registerForm.addEventListener(
  "submit",
  async (event) => {

    event.preventDefault();

    registerMessage.classList.remove(
      "success"
    );

    registerMessage.textContent = "";


    const inviteCode =
      registerInvite.value
        .trim()
        .toUpperCase();

    const username =
      registerUsername.value
        .trim()
        .toLowerCase();

    const nickname =
      registerNickname.value.trim();

    const password =
      registerPassword.value;

    const passwordRepeat =
      registerPasswordRepeat.value;

    const easyRegistration =
      registerForm.classList.contains(
        "easy-registration"
      );

    const referralRegistration =
      registerForm.classList.contains(
        "referral-registration"
      );

    const referralClassId =
      referralClassSelect.value;


    if (
      !easyRegistration &&
      !/^[a-z0-9_]{3,20}$/.test(username)
    ) {

      registerMessage.textContent =
        "Логин: 3–20 латинских букв, цифр или _";

      return;
    }


    if (
      referralRegistration &&
      !referralClassId
    ) {
      registerMessage.textContent =
        "Выберите свой класс.";
      return;
    }


    if (
      nickname.length < 3 ||
      nickname.length > 20
    ) {

      registerMessage.textContent =
        "Никнейм должен содержать 3–20 символов.";

      return;
    }


    if (
      !easyRegistration &&
      password.length < 8
    ) {

      registerMessage.textContent =
        "Пароль должен содержать минимум 8 символов.";

      return;
    }


    if (
      !easyRegistration &&
      password !== passwordRepeat
    ) {

      registerMessage.textContent =
        "Пароли не совпадают.";

      return;
    }


    const submitButton =
      registerForm.querySelector(
        'button[type="submit"]'
      );

    submitButton.disabled = true;
    submitButton.textContent =
      "СОЗДАЁМ АККАУНТ...";


    try {

const {
  data,
  error
} =
  await supabaseClient.functions.invoke(
    referralRegistration
      ? "register-referral-student"
      : "register-student",
    {
      body: referralRegistration
        ? {
            referralCode:
              referralRegistrationCode,
            classId:
              referralClassId,
            nickname
          }
        : easyRegistration
          ? {
              inviteCode,
              nickname,
              easy: true
            }
          : {
              inviteCode,
              username,
              nickname,
              password
            }
    }
  );


/*
 * Сообщения ошибок регистрации
 */

const messages = {

  INVALID_REFERRAL:
    "Реферальная ссылка недействительна.",

  INVALID_CLASS:
    "Выбранный класс недоступен.",

  REFERRER_UNAVAILABLE:
    "Пригласивший аккаунт недоступен.",

  INVALID_INVITE:
    "Такого кода приглашения нет.",

  INVITE_ALREADY_USED:
    "Этот код уже использован.",

  INVITE_EXPIRED:
    "Срок действия кода закончился.",

  INVITE_REVOKED:
    "Этот код был отозван.",

  USERNAME_TAKEN:
    "Этот логин уже занят.",

  NICKNAME_TAKEN:
    "Этот никнейм уже занят.",

  INVALID_USERNAME:
    "Недопустимый логин.",

  INVALID_NICKNAME:
    "Недопустимый никнейм.",

  PASSWORD_TOO_SHORT:
    "Пароль слишком короткий.",

  CREATE_USER_FAILED:
    "Не удалось создать аккаунт.",

  REGISTRATION_FAILED:
    "Не удалось зарегистрироваться."
};


/*
 * Если Edge Function вернула HTTP 4xx/5xx,
 * Supabase помещает ответ в error.
 *
 * Пытаемся получить настоящий JSON-ответ
 * функции, чтобы не показывать ученику
 * ложную «ошибку соединения».
 */

if (error) {

  console.error(
    "REGISTER FUNCTION ERROR:",
    error
  );


  let serverErrorCode = null;


  try {

    if (
      error.context &&
      typeof error.context.json === "function"
    ) {

      const errorBody =
        await error.context.json();


      serverErrorCode =
        errorBody?.error ?? null;


      console.log(
        "REGISTER SERVER RESPONSE:",
        errorBody
      );

    }

  } catch (parseError) {

    console.error(
      "REGISTER ERROR PARSE:",
      parseError
    );

  }


  if (serverErrorCode) {

    registerMessage.textContent =
      messages[serverErrorCode] ??
      "Не удалось зарегистрироваться.";

  } else {

    registerMessage.textContent =
      "Ошибка соединения с сервером.";

  }


  return;
}


/*
 * На случай, если функция вернула HTTP 2xx,
 * но success = false.
 */

if (!data?.success) {

  registerMessage.textContent =
    messages[data?.error] ??
    "Не удалось зарегистрироваться.";

  return;
}
if (easyRegistration) {

  /*
   * Быстрая регистрация.
   *
   * Сервер вернул автоматически
   * созданные логин и пароль.
   */

  const generatedUsername =
    data.username;

  const generatedPassword =
    data.password;


  if (
    !generatedUsername ||
    !generatedPassword
  ) {

    registerMessage.textContent =
      "Аккаунт создан, но не удалось получить данные для входа.";

    return;
  }


  /*
   * Скрываем форму регистрации.
   */

  registerForm.classList.add(
    "hidden"
  );


  /*
   * Скрываем вкладки Вход / Регистрация,
   * чтобы ученик сначала сохранил данные.
   */

  const authTabs =
    document.querySelector(
      ".auth-tabs"
    );

  if (authTabs) {

    authTabs.classList.add(
      "hidden"
    );

  }


  /*
   * Заполняем экран результата.
   */

  document.getElementById(
    "easy-success-nickname"
  ).textContent =
    nickname;


  document.getElementById(
    "easy-success-username"
  ).textContent =
    generatedUsername;


  document.getElementById(
    "easy-success-password"
  ).value =
    generatedPassword;


  /*
   * Показываем карточку.
   */

  document.getElementById(
    "easy-register-success"
  ).classList.remove(
    "hidden"
  );


  /*
   * Сохраняем данные только
   * в памяти текущей страницы.
   *
   * В localStorage пароль НЕ кладём.
   */

  window.easyRegistrationCredentials = {
    username:
      generatedUsername,

    password:
      generatedPassword
  };


} else {

  /*
   * Обычная старая регистрация
   * работает как раньше.
   */

  registerMessage.classList.add(
    "success"
  );

  registerMessage.textContent =
    "Аккаунт создан! Сейчас можно войти.";


  loginUsername.value =
    username;


  registerForm.reset();


  setTimeout(
    () => {

      openLogin();

      loginUsername.value =
        username;

      loginPassword.focus();

    },
    1200
  );

}

    } catch (error) {

      console.error(error);

      registerMessage.textContent =
        "Не удалось связаться с сервером.";

    } finally {

      submitButton.disabled = false;

      submitButton.textContent =
        "СОЗДАТЬ АККАУНТ";

    }

  }
);
const easyPasswordInput =
  document.getElementById(
    "easy-success-password"
  );


const toggleEasyPassword =
  document.getElementById(
    "toggle-easy-password"
  );


toggleEasyPassword.addEventListener(
  "click",
  () => {

    const passwordVisible =
      easyPasswordInput.type ===
      "text";


    easyPasswordInput.type =
      passwordVisible
        ? "password"
        : "text";


    toggleEasyPassword.textContent =
      passwordVisible
        ? "👁"
        : "🙈";

  }
);
const copyEasyUsername =
  document.getElementById(
    "copy-easy-username"
  );


const copyEasyPassword =
  document.getElementById(
    "copy-easy-password"
  );


copyEasyUsername.addEventListener(
  "click",
  async () => {

    const username =
      document.getElementById(
        "easy-success-username"
      ).textContent;


    await navigator.clipboard.writeText(
      username
    );


    copyEasyUsername.textContent =
      "✓";


    setTimeout(
      () => {

        copyEasyUsername.textContent =
          "📋";

      },
      1200
    );

  }
);


copyEasyPassword.addEventListener(
  "click",
  async () => {

    const password =
      easyPasswordInput.value;


    await navigator.clipboard.writeText(
      password
    );


    copyEasyPassword.textContent =
      "✓";


    setTimeout(
      () => {

        copyEasyPassword.textContent =
          "📋";

      },
      1200
    );

  }
);
const easyStartButton =
  document.getElementById(
    "easy-start-button"
  );


easyStartButton.addEventListener(
  "click",
  async () => {

    /*
     * Получаем логин и пароль,
     * которые сервер создал
     * при easy-регистрации.
     */

    const credentials =
      window.easyRegistrationCredentials;


    if (
      !credentials ||
      !credentials.username ||
      !credentials.password
    ) {

      alert(
        "Не удалось получить данные аккаунта."
      );

      return;
    }


    easyStartButton.disabled =
      true;

    easyStartButton.textContent =
      "ВХОДИМ...";


    const username =
      credentials.username;

    const password =
      credentials.password;


    /*
     * Как и при обычном входе,
     * превращаем логин во внутренний email.
     */

    const email =
      `${username}@pixel.local`;


    const {
      data,
      error
    } =
      await supabaseClient.auth
        .signInWithPassword({
          email,
          password
        });


    if (error) {

      console.error(
        "EASY LOGIN ERROR:",
        error
      );


      alert(
        "Аккаунт создан, но автоматически войти не удалось. Сохрани логин и пароль и войди обычным способом."
      );


      easyStartButton.disabled =
        false;

      easyStartButton.textContent =
        "🎮 НАЧАТЬ ИГРАТЬ";

      return;
    }


    /*
     * Вход выполнен.
     */

    currentUser =
      data.user;

    await restoreStencilForCurrentUser();
    recordCurrentUserIp();
    await loadMyReferralProfile();


    /*
     * Пароль больше не нужен.
     * Удаляем его из памяти страницы.
     */

    window.easyRegistrationCredentials =
      null;


    /*
     * Убираем пароль из поля
     * карточки результата.
     */

    easyPasswordInput.value =
      "";


    /*
     * Скрываем экран авторизации.
     */

    authScreen.classList.add(
      "hidden"
    );

    window.showUserAgreementIfNeeded?.();


    /*
     * Загружаем игру точно так же,
     * как после обычного входа.
     */

    await loadActiveSeason();

    await loadClassNames();

    await loadPixels();

    await loadClassRanking();

    await loadMyProfile();
    await dailyTasks.load();
    await mapItems.load();
    await piTicker.load();


    await checkAdminStatus();

    await updatePushNotificationStatus();

    await startOnlinePresence();

    startSeasonWatcher();

    showTelegramPopupOnceToday();


    easyStartButton.disabled =
      false;

    easyStartButton.textContent =
      "🎮 НАЧАТЬ ИГРАТЬ";

  }
);
const logoutButton =
  document.getElementById(
    "logout-button"
  );


logoutButton.addEventListener(
  "click",
  async () => {

    logoutButton.disabled = true;
    logoutButton.textContent =
      "ВЫХОД...";

    await saveStencilNow();

    const {
      error
    } =
      await supabaseClient.auth.signOut();


    if (error) {

      console.error(
        "LOGOUT ERROR:",
        error
      );

      logoutButton.disabled = false;
      logoutButton.textContent =
        "ВЫЙТИ ИЗ АККАУНТА";

      return;
    }

    if (onlinePresenceChannel) {

  await supabaseClient.removeChannel(
    onlinePresenceChannel
  );

  onlinePresenceChannel = null;
}
    clearStencilView();
    currentUser = null;
    currentChatNickname = "";
    dailyTasks.reset();
    unblockMeGame.reset();
    sokobanGame.reset();
      fifteenGame.reset();
    referralProfileStatus.textContent = "Загрузка…";
    referralInvitedList.innerHTML = "";

    currentOnlineUserIds = [];
    hideAdminOnlineUsers();

    currentUserIsAdmin = false;

document
  .getElementById("admin-button")
  .classList.add("hidden");

    clearInterval(
  seasonCheckTimer
);

seasonCheckTimer = null;

    openLogin();

    authScreen.classList.remove(
      "hidden"
    );


    logoutButton.disabled = false;
    logoutButton.textContent =
      "ВЫЙТИ ИЗ АККАУНТА";

  }
);
