async function testSupabaseConnection() {

  console.log("Проверяем Supabase...");

  const { data, error } =
    await supabaseClient
      .from("seasons")
      .select("*")
      .eq("is_active", true)
      .limit(1);

  if (error) {

    console.error(
      "Ошибка Supabase:",
      error
    );

    return;
  }

  console.log(
    "Supabase подключён!",
    data
  );

}

testSupabaseConnection();
function openLogin() {

  loginForm.classList.remove("hidden");
  registerForm.classList.add("hidden");

  showLogin.classList.add("active");
  showRegister.classList.remove("active");

  loginError.textContent = "";
  registerMessage.textContent = "";

}


function openRegister() {

  loginForm.classList.add("hidden");
  registerForm.classList.remove("hidden");

  showLogin.classList.remove("active");
  showRegister.classList.add("active");

  loginError.textContent = "";
  registerMessage.textContent = "";

}
function applyInviteFromUrl() {

  const params =
    new URLSearchParams(
      window.location.search
    );

  const inviteCode =
    params.get("invite");


  if (!inviteCode) {
    return;
  }


  const cleanCode =
    inviteCode
      .trim()
      .toUpperCase();


  if (!cleanCode) {
    return;
  }


  /*
   * Подставляем код автоматически.
   */

  registerInvite.value =
    cleanCode;


  /*
   * Сразу открываем регистрацию.
   */

  openRegister();


  /*
   * Код пришёл из персональной ссылки,
   * поэтому ребёнку его вводить уже
   * не требуется.
   */

  registerInvite.readOnly = true;

  registerInvite.classList.add(
    "invite-from-link"
  );

  registerForm.classList.add(
  "easy-registration"
);


/*
 * В быстрой регистрации
 * логин и пароль создаст сервер.
 */

registerUsername.required =
  false;

registerPassword.required =
  false;

registerPasswordRepeat.required =
  false;


/*
 * Вместо кода показываем
 * понятную надпись.
 */

let easyLabel =
  document.getElementById(
    "easy-invite-label"
  );


if (!easyLabel) {

  easyLabel =
    document.createElement(
      "div"
    );

  easyLabel.id =
    "easy-invite-label";

  easyLabel.className =
    "easy-invite-label";

  easyLabel.textContent =
    "✓ Приглашение принято";


  registerForm.prepend(
    easyLabel
  );
}


  /*
   * Ставим курсор сразу в никнейм.
   */

  registerNickname.focus();

}

async function loadReferralRegistrationClasses() {
  const { data, error } =
    await supabaseClient.rpc(
      "get_referral_registration_classes"
    );

  referralClassSelect.innerHTML =
    '<option value="">Выберите класс</option>';

  if (error) {
    console.error("REFERRAL CLASSES ERROR:", error);
    referralClassSelect.innerHTML =
      '<option value="">Не удалось загрузить классы</option>';
    return;
  }

  for (const item of data ?? []) {
    const option =
      document.createElement("option");

    option.value = item.class_id;
    option.textContent = item.class_name;
    referralClassSelect.appendChild(option);
  }
}

function applySchoolRegistrationFromUrl() {
  const params =
    new URLSearchParams(window.location.search);

  if (params.get("school")?.trim().toLowerCase() !== "join") {
    return false;
  }

  openRegister();

  registerInvite.required = false;
  registerInvite.classList.add("hidden");
  referralClassField.classList.remove("hidden");
  referralClassSelect.required = true;

  registerForm.classList.add(
    "easy-registration",
    "school-registration"
  );

  registerUsername.required = false;
  registerPassword.required = false;
  registerPasswordRepeat.required = false;

  let easyLabel =
    document.getElementById("easy-invite-label");

  if (!easyLabel) {
    easyLabel = document.createElement("div");
    easyLabel.id = "easy-invite-label";
    easyLabel.className = "easy-invite-label";
    registerForm.prepend(easyLabel);
  }

  easyLabel.textContent =
    "🏫 Регистрация ученика школы";

  loadReferralRegistrationClasses();
  referralClassSelect.focus();
  return true;
}

function applyReferralFromUrl() {
  const params =
    new URLSearchParams(window.location.search);

  const referralCode =
    params.get("ref")?.trim().toUpperCase();

  if (!referralCode) {
    return false;
  }

  referralRegistrationCode =
    referralCode;

  openRegister();

  registerInvite.required = false;
  registerInvite.classList.add("hidden");
  referralClassField.classList.remove("hidden");
  referralClassSelect.required = true;

  registerForm.classList.add(
    "easy-registration",
    "referral-registration"
  );

  registerUsername.required = false;
  registerPassword.required = false;
  registerPasswordRepeat.required = false;

  let easyLabel =
    document.getElementById("easy-invite-label");

  if (!easyLabel) {
    easyLabel =
      document.createElement("div");
    easyLabel.id = "easy-invite-label";
    easyLabel.className = "easy-invite-label";
    registerForm.prepend(easyLabel);
  }

  easyLabel.textContent =
    "✓ Реферальное приглашение принято";

  loadReferralRegistrationClasses();
  registerNickname.focus();
  return true;
}

showLogin.addEventListener(
  "click",
  openLogin
);


showRegister.addEventListener(
  "click",
  openRegister
);

if (!applySchoolRegistrationFromUrl() && !applyReferralFromUrl()) {
  applyInviteFromUrl();
}
