const SUPABASE_URL =
  "https://rfhrqjowxwxpaqmjoikn.supabase.co";

const SUPABASE_KEY =
  "sb_publishable_SictxwPd578IRmRLeoDzBw_7kEG-Y8-";

const supabaseClient =
  window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
  );

const authScreen =
  document.getElementById("auth-screen");

const loginForm =
  document.getElementById("login-form");

const loginUsername =
  document.getElementById("login-username");

const showLogin =
  document.getElementById("show-login");

const showRegister =
  document.getElementById("show-register");

const registerForm =
  document.getElementById("register-form");

const registerInvite =
  document.getElementById("register-invite");

const registerUsername =
  document.getElementById("register-username");

const registerNickname =
  document.getElementById("register-nickname");

const registerPassword =
  document.getElementById("register-password");

const registerPasswordRepeat =
  document.getElementById(
    "register-password-repeat"
  );

const registerMessage =
  document.getElementById("register-message");

const loginPassword =
  document.getElementById("login-password");

const loginError =
  document.getElementById("login-error");

let currentUser = null;
const MAP_WIDTH = 300;
const MAP_HEIGHT = 424;

const canvas = document.getElementById("pixel-canvas");
const ctx = canvas.getContext("2d");

const container = document.getElementById("canvas-container");
const placeButton = document.getElementById("place-button");
const coordinatesText = document.getElementById("coordinates");
const pixelCountText = document.getElementById("pixel-count");
const cooldownText = document.getElementById("cooldown-text");

canvas.width = MAP_WIDTH;
canvas.height = MAP_HEIGHT;

ctx.imageSmoothingEnabled = false;

/*
 * Карта.
 * 0 означает белый пиксель.
 * В дальнейшем эти данные будут приходить из Supabase.
 */
const pixels = new Uint8Array(MAP_WIDTH * MAP_HEIGHT);

const COLORS = [
  "#ffffff",
  "#ef4444",
  "#f97316",
  "#facc15",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#111111"
];

let selectedColor = "#ef4444";

let selectedX = null;
let selectedY = null;

let scale = 1;

let offsetX = 0;
let offsetY = 0;

let isDragging = false;

let dragStartX = 0;
let dragStartY = 0;

let startOffsetX = 0;
let startOffsetY = 0;

let moved = false;

let pixelCount = 0;

/*
 * Пока cooldown делаем локальным.
 * Когда подключим Supabase, проверка будет серверной.
 */
const COOLDOWN_SECONDS = 20;

let cooldownRemaining = 0;
let cooldownTimer = null;


/* -------------------------
   РИСОВАНИЕ КАРТЫ
------------------------- */

function drawMap() {

  ctx.clearRect(
    0,
    0,
    MAP_WIDTH,
    MAP_HEIGHT
  );

  ctx.fillStyle = "#ffffff";

  ctx.fillRect(
    0,
    0,
    MAP_WIDTH,
    MAP_HEIGHT
  );


  for (let y = 0; y < MAP_HEIGHT; y++) {

    for (let x = 0; x < MAP_WIDTH; x++) {

      const index = y * MAP_WIDTH + x;
      const colorIndex = pixels[index];

      if (colorIndex === 0) {
        continue;
      }

      ctx.fillStyle = COLORS[colorIndex];

      ctx.fillRect(
        x,
        y,
        1,
        1
      );

    }

  }


  /*
   * Показываем выбранную клетку.
   * Рамка масштабируется вместе с картой.
   */

  if (
    selectedX !== null &&
    selectedY !== null
  ) {

    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 0.35;

    ctx.strokeRect(
      selectedX + 0.05,
      selectedY + 0.05,
      0.9,
      0.9
    );

  }

}


/* -------------------------
   РАЗМЕР КАРТЫ НА ЭКРАНЕ
------------------------- */

function calculateInitialScale() {

  const rect = container.getBoundingClientRect();

  const horizontalPadding = 30;
  const verticalPadding = 30;

  const availableWidth =
    rect.width - horizontalPadding;

  const availableHeight =
    rect.height - verticalPadding;

  const scaleX =
    availableWidth / MAP_WIDTH;

  const scaleY =
    availableHeight / MAP_HEIGHT;

  /*
   * Не уменьшаем слишком сильно.
   */

  scale = Math.min(
    scaleX,
    scaleY
  );

  scale = Math.max(
    scale,
    0.5
  );

  offsetX = 0;
  offsetY = 0;

  updateTransform();

}


function updateTransform() {

  canvas.style.width =
    `${MAP_WIDTH * scale}px`;

  canvas.style.height =
    `${MAP_HEIGHT * scale}px`;

  canvas.style.transform =
    `translate(${offsetX}px, ${offsetY}px)`;

}


/* -------------------------
   ПАЛИТРА
------------------------- */

const colorButtons =
  document.querySelectorAll(".color");

colorButtons.forEach((button) => {

  button.addEventListener(
    "click",
    () => {

      colorButtons.forEach((item) => {
        item.classList.remove("active");
      });

      button.classList.add("active");

      selectedColor =
        button.dataset.color;

    }
  );

});


/* -------------------------
   КООРДИНАТЫ
------------------------- */

function screenToPixel(clientX, clientY) {

  const rect =
    canvas.getBoundingClientRect();

  const x =
    Math.floor(
      (clientX - rect.left) /
      (rect.width / MAP_WIDTH)
    );

  const y =
    Math.floor(
      (clientY - rect.top) /
      (rect.height / MAP_HEIGHT)
    );

  if (
    x < 0 ||
    y < 0 ||
    x >= MAP_WIDTH ||
    y >= MAP_HEIGHT
  ) {
    return null;
  }

  return { x, y };

}


/* -------------------------
   ВЫБОР ПИКСЕЛЯ
------------------------- */

function selectPixel(clientX, clientY) {

  const pixel =
    screenToPixel(
      clientX,
      clientY
    );

  if (!pixel) {
    return;
  }

  selectedX = pixel.x;
  selectedY = pixel.y;

  coordinatesText.textContent =
    `X: ${selectedX}  Y: ${selectedY}`;

  updatePlaceButton();
  drawMap();

}


/* -------------------------
   УСТАНОВКА ПИКСЕЛЯ
------------------------- */

function getColorIndex(color) {

  return COLORS.indexOf(color);

}


async function placePixel() {

  if (
    selectedX === null ||
    selectedY === null
  ) {
    return;
  }


  if (!currentUser) {

    alert("Сначала войдите в аккаунт.");

    return;
  }


  if (cooldownRemaining > 0) {
    return;
  }


  placeButton.disabled = true;


  const {
    data,
    error
  } =
    await supabaseClient.rpc(
      "place_pixel",
      {
        p_x: selectedX,
        p_y: selectedY,
        p_color: selectedColor
      }
    );


  if (error) {

    console.error(
      "Ошибка установки пикселя:",
      error
    );

    alert(
      "Не удалось поставить пиксель."
    );

    updatePlaceButton();

    return;
  }


  /*
   * Сервер сообщил, что cooldown
   * ещё не закончился.
   */

  if (!data.success) {

    if (
      data.reason === "COOLDOWN"
    ) {

      cooldownRemaining =
        data.remaining;

      updateCooldown();

      clearInterval(
        cooldownTimer
      );

      cooldownTimer =
        setInterval(() => {

          cooldownRemaining--;

          if (
            cooldownRemaining <= 0
          ) {

            cooldownRemaining = 0;

            clearInterval(
              cooldownTimer
            );

          }

          updateCooldown();

        }, 1000);

    }

    return;
  }


  /*
   * Сервер разрешил установку.
   */

  const index =
    data.y * MAP_WIDTH +
    data.x;

  const colorIndex =
    COLORS.indexOf(
      data.color
    );

  pixels[index] =
    colorIndex;


  pixelCount++;

  pixelCountText.textContent =
    pixelCount.toLocaleString(
      "ru-RU"
    );


  drawMap();

  startCooldown();

  loadClassRanking();
  loadMyProfile();
}

placeButton.addEventListener(
  "click",
  placePixel
);


/* -------------------------
   COOLDOWN
------------------------- */

function startCooldown() {

  cooldownRemaining =
    COOLDOWN_SECONDS;

  updateCooldown();

  clearInterval(cooldownTimer);

  cooldownTimer =
    setInterval(() => {

      cooldownRemaining--;

      if (cooldownRemaining <= 0) {

        cooldownRemaining = 0;

        clearInterval(
          cooldownTimer
        );

      }

      updateCooldown();

    }, 1000);

}


function updateCooldown() {

  if (cooldownRemaining <= 0) {

    cooldownText.textContent =
      "Пиксель готов";

  } else {

    cooldownText.textContent =
      `Следующий пиксель через ${cooldownRemaining} сек.`;

  }

  updatePlaceButton();

}


function updatePlaceButton() {

  placeButton.disabled =
    selectedX === null ||
    selectedY === null ||
    cooldownRemaining > 0;

}


/* -------------------------
   МЫШЬ — ПК
------------------------- */

canvas.addEventListener(
  "mousedown",
  (event) => {

    isDragging = true;
    moved = false;

    dragStartX =
      event.clientX;

    dragStartY =
      event.clientY;

    startOffsetX =
      offsetX;

    startOffsetY =
      offsetY;

  }
);


window.addEventListener(
  "mousemove",
  (event) => {

    if (!isDragging) {
      return;
    }

    const dx =
      event.clientX -
      dragStartX;

    const dy =
      event.clientY -
      dragStartY;

    if (
      Math.abs(dx) > 3 ||
      Math.abs(dy) > 3
    ) {
      moved = true;
    }

    offsetX =
      startOffsetX + dx;

    offsetY =
      startOffsetY + dy;

    updateTransform();

  }
);


window.addEventListener(
  "mouseup",
  (event) => {

    if (!isDragging) {
      return;
    }

    isDragging = false;

    if (!moved) {

      selectPixel(
        event.clientX,
        event.clientY
      );

    }

  }
);


/* -------------------------
   ZOOM КОЛЁСИКОМ
------------------------- */

container.addEventListener(
  "wheel",
  (event) => {

    event.preventDefault();

    const oldScale =
      scale;

    const zoom =
      event.deltaY < 0
        ? 1.15
        : 0.87;

    scale *= zoom;

    scale = Math.max(
      0.5,
      Math.min(scale, 30)
    );

    /*
     * Стараемся приблизить карту
     * относительно положения курсора.
     */

    const containerRect =
      container.getBoundingClientRect();

    const mouseX =
      event.clientX -
      containerRect.left -
      containerRect.width / 2;

    const mouseY =
      event.clientY -
      containerRect.top -
      containerRect.height / 2;

    const ratio =
      scale / oldScale;

    offsetX =
      mouseX -
      (mouseX - offsetX) *
      ratio;

    offsetY =
      mouseY -
      (mouseY - offsetY) *
      ratio;

    updateTransform();

  },
  {
    passive: false
  }
);


/* -------------------------
   TOUCH — ТЕЛЕФОН
------------------------- */

let touchStartDistance = null;
let touchStartScale = 1;

let touchStartCenter = null;


function getTouchDistance(
  touch1,
  touch2
) {

  const dx =
    touch2.clientX -
    touch1.clientX;

  const dy =
    touch2.clientY -
    touch1.clientY;

  return Math.sqrt(
    dx * dx +
    dy * dy
  );

}


canvas.addEventListener(
  "touchstart",
  (event) => {

    event.preventDefault();

    if (event.touches.length === 1) {

      const touch =
        event.touches[0];

      isDragging = true;
      moved = false;

      dragStartX =
        touch.clientX;

      dragStartY =
        touch.clientY;

      startOffsetX =
        offsetX;

      startOffsetY =
        offsetY;

    }


    if (event.touches.length === 2) {

      isDragging = false;

      touchStartDistance =
        getTouchDistance(
          event.touches[0],
          event.touches[1]
        );

      touchStartScale =
        scale;

      touchStartCenter = {
        x:
          (
            event.touches[0].clientX +
            event.touches[1].clientX
          ) / 2,

        y:
          (
            event.touches[0].clientY +
            event.touches[1].clientY
          ) / 2
      };

    }

  },
  {
    passive: false
  }
);


canvas.addEventListener(
  "touchmove",
  (event) => {

    event.preventDefault();


    if (
      event.touches.length === 1 &&
      isDragging
    ) {

      const touch =
        event.touches[0];

      const dx =
        touch.clientX -
        dragStartX;

      const dy =
        touch.clientY -
        dragStartY;

      if (
        Math.abs(dx) > 4 ||
        Math.abs(dy) > 4
      ) {
        moved = true;
      }

      offsetX =
        startOffsetX + dx;

      offsetY =
        startOffsetY + dy;

      updateTransform();

    }


    if (
      event.touches.length === 2 &&
      touchStartDistance
    ) {

      const newDistance =
        getTouchDistance(
          event.touches[0],
          event.touches[1]
        );

      const ratio =
        newDistance /
        touchStartDistance;

      scale =
        touchStartScale *
        ratio;

      scale = Math.max(
        0.5,
        Math.min(scale, 30)
      );

      updateTransform();

      moved = true;

    }

  },
  {
    passive: false
  }
);


canvas.addEventListener(
  "touchend",
  (event) => {

    event.preventDefault();

    if (
      event.touches.length === 0
    ) {

      if (
        isDragging &&
        !moved &&
        event.changedTouches.length > 0
      ) {

        const touch =
          event.changedTouches[0];

        selectPixel(
          touch.clientX,
          touch.clientY
        );

      }

      isDragging = false;
      touchStartDistance = null;

    }

  },
  {
    passive: false
  }
);


/* -------------------------
   RESIZE
------------------------- */

window.addEventListener(
  "resize",
  () => {

    /*
     * Пока при изменении размера окна
     * возвращаем карту в центр.
     */

    calculateInitialScale();

  }
);


/* -------------------------
   ЗАПУСК
------------------------- */

drawMap();

requestAnimationFrame(() => {
  calculateInitialScale();
});

updateCooldown();
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


showLogin.addEventListener(
  "click",
  openLogin
);


showRegister.addEventListener(
  "click",
  openRegister
);
async function loadClassRanking() {

  const rankingElement =
    document.getElementById(
      "class-ranking"
    );


  if (!rankingElement) {
    return;
  }


  const {
    data,
    error
  } =
    await supabaseClient.rpc(
      "get_class_ranking"
    );


  if (error) {

    console.error(
      "RANKING ERROR:",
      error
    );

    rankingElement.innerHTML =
      "<div><span>Не удалось загрузить рейтинг</span></div>";

    return;
  }


  rankingElement.innerHTML = "";


  if (
    !data ||
    data.length === 0
  ) {

    rankingElement.innerHTML =
      "<div><span>Рейтинг пока пуст</span></div>";

    return;
  }


  data.forEach(
    (item, index) => {

      const row =
        document.createElement("div");


      let place =
        `${index + 1}.`;


      if (index === 0) {
        place = "🥇";
      }

      if (index === 1) {
        place = "🥈";
      }

      if (index === 2) {
        place = "🥉";
      }


      const name =
        document.createElement("span");

      name.textContent =
        `${place} ${item.class_name}`;


      const score =
        document.createElement("strong");

      score.textContent =
        Number(
          item.pixels_count
        ).toLocaleString("ru-RU");


      row.appendChild(name);
      row.appendChild(score);

      rankingElement.appendChild(row);

    }
  );

}
async function loadMyProfile() {

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


  const profile =
    data[0];


  document.getElementById(
    "profile-nickname"
  ).textContent =
    profile.nickname;


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
async function checkForSeasonChange() {

  if (!currentUser) {
    return;
  }


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

  selectedX = null;
  selectedY = null;

  coordinatesText.textContent =
    "Выберите пиксель";


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


  drawMap();


  console.log(
    "Новая неделя загружена."
  );

}
function startSeasonWatcher() {

  clearInterval(
    seasonCheckTimer
  );


  /*
   * Проверяем раз в минуту.
   *
   * Cron переключает сезон максимум
   * раз в 5 минут, поэтому чаще
   * проверять нет необходимости.
   */

  seasonCheckTimer =
    setInterval(
      checkForSeasonChange,
      60000
    );

}
let currentUserIsAdmin = false;


async function checkAdminStatus() {

  const adminButton =
    document.getElementById(
      "admin-button"
    );


  if (!currentUser) {

    currentUserIsAdmin = false;

    adminButton.classList.add(
      "hidden"
    );

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

    adminButton.classList.add(
      "hidden"
    );

    return false;
  }


  currentUserIsAdmin =
    data === true;


  if (currentUserIsAdmin) {

    adminButton.classList.remove(
      "hidden"
    );

  } else {

    adminButton.classList.add(
      "hidden"
    );

  }


  console.log(
    "Admin:",
    currentUserIsAdmin
  );


  return currentUserIsAdmin;

}
async function initializeAuth() {

  const {
    data: { session }
  } =
    await supabaseClient.auth.getSession();

  if (session) {

    currentUser = session.user;

    authScreen.classList.add("hidden");

    await loadActiveSeason();
    await loadPixels();
    await loadClassRanking();
    await loadMyProfile();
    await checkAdminStatus();

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

    await loadActiveSeason();
    await loadPixels();
    await loadClassRanking();
    await loadMyProfile();
    await checkAdminStatus();

    startSeasonWatcher();
  }
);
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


  const {
    data,
    error
  } =
    await supabaseClient
      .from("pixels")
      .select("x,y,color")
      .eq("season_id", seasonId);


  if (error) {

    console.error(
      "Ошибка загрузки карты:",
      error
    );

    return;
  }


  pixels.fill(0);


  for (const pixel of data) {

    const colorIndex =
      COLORS.indexOf(pixel.color);

    if (colorIndex === -1) {
      continue;
    }

    const index =
      pixel.y * MAP_WIDTH +
      pixel.x;

    pixels[index] =
      colorIndex;

  }


  pixelCount =
    data.length;

  pixelCountText.textContent =
    pixelCount.toLocaleString("ru-RU");

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

        drawMap();
        
        loadClassRanking();
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


    if (
      !/^[a-z0-9_]{3,20}$/.test(username)
    ) {

      registerMessage.textContent =
        "Логин: 3–20 латинских букв, цифр или _";

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


    if (password.length < 8) {

      registerMessage.textContent =
        "Пароль должен содержать минимум 8 символов.";

      return;
    }


    if (password !== passwordRepeat) {

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
          "register-student",
          {
            body: {
              inviteCode,
              username,
              nickname,
              password
            }
          }
        );


      if (error) {

        console.error(
          "REGISTER FUNCTION ERROR:",
          error
        );

        registerMessage.textContent =
          "Ошибка соединения с сервером.";

        return;
      }


      if (!data?.success) {

        const messages = {

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
            "Пароль слишком короткий."

        };


        registerMessage.textContent =
          messages[data.error] ??
          "Не удалось зарегистрироваться.";

        return;
      }


      registerMessage.classList.add(
        "success"
      );

      registerMessage.textContent =
        "Аккаунт создан! Сейчас можно войти.";


      /*
       * Запоминаем логин и переключаем
       * пользователя на форму входа.
       */

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


    currentUser = null;

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
const mobileMapButton =
  document.getElementById(
    "mobile-map-button"
  );

const mobileRankingButton =
  document.getElementById(
    "mobile-ranking-button"
  );

const mobileProfileButton =
  document.getElementById(
    "mobile-profile-button"
  );


function setMobileView(view) {

  document.body.classList.remove(
    "mobile-ranking-view",
    "mobile-profile-view"
  );


  mobileMapButton.classList.remove(
    "selected"
  );

  mobileRankingButton.classList.remove(
    "selected"
  );

  mobileProfileButton.classList.remove(
    "selected"
  );


  if (view === "ranking") {

    document.body.classList.add(
      "mobile-ranking-view"
    );

    mobileRankingButton.classList.add(
      "selected"
    );

    loadClassRanking();

    return;
  }


  if (view === "profile") {

    document.body.classList.add(
      "mobile-profile-view"
    );

    mobileProfileButton.classList.add(
      "selected"
    );

    loadMyProfile();

    return;
  }


  mobileMapButton.classList.add(
    "selected"
  );

}


mobileMapButton.addEventListener(
  "click",
  () => {
    setMobileView("map");
  }
);


mobileRankingButton.addEventListener(
  "click",
  () => {
    setMobileView("ranking");
  }
);


mobileProfileButton.addEventListener(
  "click",
  () => {
    setMobileView("profile");
  }
);
const adminButton =
  document.getElementById(
    "admin-button"
  );

const adminCloseButton =
  document.getElementById(
    "admin-close-button"
  );


adminButton.addEventListener(
  "click",
  async () => {

    /*
     * Проверяем права ещё раз.
     * Не доверяем только видимости кнопки.
     */

    const isAdmin =
      await checkAdminStatus();


    if (!isAdmin) {

      console.warn(
        "Попытка открыть админку без прав."
      );

      return;
    }


    document.body.classList.add(
      "admin-view"
    );

    await loadAdminOverview();
    
  }
);


adminCloseButton.addEventListener(
  "click",
  () => {

    document.body.classList.remove(
      "admin-view"
    );

    setMobileView("map");

  }
);
async function loadAdminOverview() {

  if (!currentUserIsAdmin) {
    return;
  }


  const {
    data,
    error
  } =
    await supabaseClient.rpc(
      "get_admin_overview"
    );


  if (error) {

    console.error(
      "ADMIN OVERVIEW ERROR:",
      error
    );

    return;
  }


  if (!data?.success) {
    return;
  }


  const seasonElement =
    document.getElementById(
      "admin-season"
    );

  const pixelsElement =
    document.getElementById(
      "admin-pixels"
    );

  const playersElement =
    document.getElementById(
      "admin-players"
    );

  const leaderElement =
    document.getElementById(
      "admin-leader"
    );


  if (data.active_season) {

    seasonElement.textContent =
      `Неделя #${data.active_season.number}`;

  } else {

    seasonElement.textContent =
      "Нет активного";

  }


  pixelsElement.textContent =
    Number(
      data.pixels ?? 0
    ).toLocaleString("ru-RU");


  playersElement.textContent =
    Number(
      data.players ?? 0
    ).toLocaleString("ru-RU");


  if (data.leader) {

    leaderElement.textContent =
      `${data.leader} · ${Number(
        data.leader_pixels ?? 0
      ).toLocaleString("ru-RU")}`;

  } else {

    leaderElement.textContent =
      "Пока нет";

  }

}
const adminOverviewTab =
  document.getElementById(
    "admin-overview-tab"
  );

const adminInvitesTab =
  document.getElementById(
    "admin-invites-tab"
  );

const adminOverviewContent =
  document.getElementById(
    "admin-overview-content"
  );

const adminInvitesContent =
  document.getElementById(
    "admin-invites-content"
  );


function openAdminOverview() {

  adminOverviewContent.classList.remove(
    "hidden"
  );

  adminInvitesContent.classList.add(
    "hidden"
  );

  adminOverviewTab.classList.add(
    "active"
  );

  adminInvitesTab.classList.remove(
    "active"
  );

}


async function openAdminInvites() {

  if (!currentUserIsAdmin) {
    return;
  }

  adminOverviewContent.classList.add(
    "hidden"
  );

  adminInvitesContent.classList.remove(
    "hidden"
  );

  adminOverviewTab.classList.remove(
    "active"
  );

  adminInvitesTab.classList.add(
    "active"
  );

  await loadInviteClasses();
  await loadInviteStats();

}


adminOverviewTab.addEventListener(
  "click",
  async () => {

    openAdminOverview();

    await loadAdminOverview();

  }
);


adminInvitesTab.addEventListener(
  "click",
  openAdminInvites
);
async function loadInviteClasses() {

  const select =
    document.getElementById(
      "invite-class-select"
    );


  const {
    data,
    error
  } =
    await supabaseClient
      .from("classes")
      .select("id,name,grade")
      .order("grade")
      .order("name");


  if (error) {

    console.error(
      "CLASSES ERROR:",
      error
    );

    select.innerHTML =
      '<option value="">Ошибка загрузки</option>';

    return;
  }


  select.innerHTML =
    '<option value="">Выберите класс</option>';


  for (const item of data) {

    const option =
      document.createElement(
        "option"
      );

    option.value =
      item.id;

    option.textContent =
      item.name;

    select.appendChild(
      option
    );

  }

}
const generateInvitesButton =
  document.getElementById(
    "generate-invites-button"
  );

const copyInvitesButton =
  document.getElementById(
    "copy-invites-button"
  );

let lastGeneratedInvites = [];


generateInvitesButton.addEventListener(
  "click",
  async () => {

    const classSelect =
      document.getElementById(
        "invite-class-select"
      );

    const countInput =
      document.getElementById(
        "invite-count"
      );

    const expirationSelect =
      document.getElementById(
        "invite-expiration"
      );

    const message =
      document.getElementById(
        "invite-generator-message"
      );

    const resultBox =
      document.getElementById(
        "generated-invites"
      );

    const resultList =
      document.getElementById(
        "generated-invites-list"
      );


    message.classList.remove(
      "success"
    );

    message.textContent = "";


    const classId =
      Number(classSelect.value);

    const count =
      Number(countInput.value);

    const expiration =
      Number(expirationSelect.value);


    if (!classId) {

      message.textContent =
        "Выберите класс.";

      return;
    }


    if (
      !Number.isInteger(count) ||
      count < 1 ||
      count > 100
    ) {

      message.textContent =
        "Количество: от 1 до 100.";

      return;
    }


    generateInvitesButton.disabled =
      true;

    generateInvitesButton.textContent =
      "ГЕНЕРАЦИЯ...";


    const {
      data,
      error
    } =
      await supabaseClient.rpc(
        "admin_generate_invites",
        {
          p_class_id: classId,
          p_count: count,
          p_expires_days: expiration
        }
      );


    generateInvitesButton.disabled =
      false;

    generateInvitesButton.textContent =
      "СГЕНЕРИРОВАТЬ КОДЫ";


    if (error) {

      console.error(
        "GENERATE INVITES ERROR:",
        error
      );

      message.textContent =
        "Не удалось создать коды.";

      return;
    }


    lastGeneratedInvites =
      data.map(
        item => item.invite_code
      );


    resultList.innerHTML = "";


    for (
      const code
      of lastGeneratedInvites
    ) {

      const element =
        document.createElement(
          "div"
        );

      element.className =
        "generated-invite-code";

      element.textContent =
        code;

      resultList.appendChild(
        element
      );

    }


    document.getElementById(
      "generated-invites-title"
    ).textContent =
      `Создано кодов: ${lastGeneratedInvites.length}`;


    resultBox.classList.remove(
      "hidden"
    );


    message.classList.add(
      "success"
    );

    message.textContent =
      "Коды успешно созданы.";
    await loadInviteStats();

  }
);
copyInvitesButton.addEventListener(
  "click",
  async () => {

    if (
      lastGeneratedInvites.length === 0
    ) {
      return;
    }


    const text =
      lastGeneratedInvites.join(
        "\n"
      );


    try {

      await navigator.clipboard.writeText(
        text
      );

      copyInvitesButton.textContent =
        "✓ Скопировано";


      setTimeout(
        () => {

          copyInvitesButton.textContent =
            "📋 Копировать все";

        },
        1500
      );


    } catch (error) {

      console.error(
        "COPY ERROR:",
        error
      );

    }

  }
);
async function loadInviteStats() {

  if (!currentUserIsAdmin) {
    return;
  }

  const body =
    document.getElementById(
      "invite-stats-body"
    );

  const {
    data,
    error
  } =
    await supabaseClient.rpc(
      "admin_get_invite_stats"
    );

  if (error) {

    console.error(
      "INVITE STATS ERROR:",
      error
    );

    body.innerHTML = `
      <tr>
        <td colspan="6">
          Не удалось загрузить статистику
        </td>
      </tr>
    `;

    return;
  }

  body.innerHTML = "";

  for (const item of data) {

    const row =
      document.createElement("tr");

    const values = [
      item.class_name,
      item.total_codes,
      item.available_codes,
      item.used_codes,
      item.expired_codes,
      item.revoked_codes
    ];

    values.forEach(
      (value, index) => {

        const cell =
          document.createElement("td");

        cell.textContent =
          index === 0
            ? value
            : Number(value)
                .toLocaleString("ru-RU");

        if (index === 2) {
          cell.classList.add(
            "invite-stat-available"
          );
        }

        if (index === 3) {
          cell.classList.add(
            "invite-stat-used"
          );
        }

        if (index === 4) {
          cell.classList.add(
            "invite-stat-expired"
          );
        }

        if (index === 5) {
          cell.classList.add(
            "invite-stat-revoked"
          );
        }

        row.appendChild(cell);
      }
    );

    body.appendChild(row);
  }
}
initializeAuth();
subscribeToPixels();
