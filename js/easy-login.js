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
    await piCoin.load({ offerDailyBonus: true });
    await mapItems.load();
    await piTicker.load();


    await checkAdminStatus();

    await updatePushNotificationStatus();

    await startOnlinePresence();

    startSeasonWatcher();



    easyStartButton.disabled =
      false;

    easyStartButton.textContent =
      "🎮 НАЧАТЬ ИГРАТЬ";

  }
);
