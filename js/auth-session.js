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
