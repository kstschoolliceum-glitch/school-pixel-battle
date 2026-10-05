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
    await piCoin.load({ offerDailyBonus: true });
    await mapItems.load();
    await piTicker.load();

    await checkAdminStatus();
    await updatePushNotificationStatus();

    await startOnlinePresence();

    startSeasonWatcher();
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
    await piCoin.load({ offerDailyBonus: true });
    await mapItems.load();
    await piTicker.load();

    await checkAdminStatus();
    await updatePushNotificationStatus();

    await startOnlinePresence();

    startSeasonWatcher();
  }
);
