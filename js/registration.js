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

    const schoolRegistration =
      registerForm.classList.contains(
        "school-registration"
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
      (referralRegistration || schoolRegistration) &&
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
    schoolRegistration
      ? "register-school-student"
      : referralRegistration
        ? "register-referral-student"
        : "register-student",
    {
      body: schoolRegistration
        ? {
            classId: referralClassId,
            nickname
          }
        : referralRegistration
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

  REGISTRATION_LIMIT:
    "Слишком много регистраций за короткое время. Подождите минуту и попробуйте снова.",

  ORIGIN_NOT_ALLOWED:
    "Регистрация доступна только с официального сайта игры.",

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
