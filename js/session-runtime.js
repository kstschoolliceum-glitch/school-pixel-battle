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
