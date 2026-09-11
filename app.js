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
const telegramPopup =
  document.getElementById(
    "telegram-popup"
  );

const telegramJoinButton =
  document.getElementById(
    "telegram-join-button"
  );

const telegramLaterButton =
  document.getElementById(
    "telegram-later-button"
  );
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
let onlinePresenceChannel = null;
const MAP_WIDTH = 300;
const MAP_HEIGHT = 424;

const canvas = document.getElementById("pixel-canvas");
const ctx = canvas.getContext("2d");

const container = document.getElementById("canvas-container");
const pixelGrid =
  document.getElementById(
    "pixel-grid"
  );
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
/*
 * Текущий класс-владелец каждой клетки.
 * null означает свободную клетку.
 */
const pixelOwners =
  new Array(
    MAP_WIDTH * MAP_HEIGHT
  ).fill(null);
/*
 * Справочник:
 * class_id → название класса.
 *
 * Нужен для Realtime, потому что
 * изменение pixels содержит class_id,
 * но не содержит classes.name.
 */
const classNamesById =
  new Map();
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
  "#111111",

  "#92400e",
  "#fb923c",
  "#f472b6",
  "#a78bfa",
  "#38bdf8",
  "#84cc16",
  "#cbd5e1",
  "#475569"
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
const COOLDOWN_SECONDS = 5;

let cooldownRemaining = 0;
let cooldownTimer = null;


/* -------------------------
   РИСОВАНИЕ КАРТЫ
------------------------- */

function getContrastColor(hexColor) {

  const hex =
    hexColor.replace("#", "");

  const r =
    parseInt(hex.substring(0, 2), 16);

  const g =
    parseInt(hex.substring(2, 4), 16);

  const b =
    parseInt(hex.substring(4, 6), 16);


  /*
   * Воспринимаемая яркость цвета.
   */

  const brightness =
    (
      r * 299 +
      g * 587 +
      b * 114
    ) / 1000;


  /*
   * На тёмном фоне — белый прицел.
   * На светлом — чёрный.
   */

  return brightness < 140
    ? "#ffffff"
    : "#000000";
}
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
 *
 * При небольшом масштабе используем
 * крупный маркер, чтобы выбранное место
 * было хорошо видно на компьютере.
 *
 * При большом увеличении выделяем
 * уже саму клетку.
 */

if (
  selectedX !== null &&
  selectedY !== null
) {
    const selectedIndex =
    selectedY * MAP_WIDTH +
    selectedX;

  const selectedPixelColor =
    COLORS[
      pixels[selectedIndex]
    ] ?? "#ffffff";

  const crosshairColor =
    getContrastColor(
      selectedPixelColor
    );

  const oppositeColor =
    crosshairColor === "#ffffff"
      ? "#000000"
      : "#ffffff";

  /*
   * МАЛЕНЬКИЙ ZOOM
   * Крупный маркер выбранного места.
   */

  if (scale < 5) {

    const markerSize =
      Math.max(
        3,
        12 / scale
      );

    const markerX =
      selectedX + 0.5;

    const markerY =
      selectedY + 0.5;


    /*
     * Чёрная внешняя рамка.
     */

    ctx.strokeStyle =
      oppositeColor;

    ctx.lineWidth =
      Math.max(
        0.5,
        2 / scale
      );

    ctx.strokeRect(
      markerX - markerSize / 2,
      markerY - markerSize / 2,
      markerSize,
      markerSize
    );


    /*
     * Белая внутренняя рамка.
     */

    ctx.strokeStyle =
      crosshairColor;

    ctx.lineWidth =
      Math.max(
        0.25,
        1 / scale
      );

    ctx.strokeRect(
      markerX - markerSize / 2 + 0.3,
      markerY - markerSize / 2 + 0.3,
      markerSize - 0.6,
      markerSize - 0.6
    );

  } else {

  /*
   * БОЛЬШОЙ ZOOM
   * Простая чёрная рамка выбранной клетки.
   */

  /*
 * Внешний контур.
 */

ctx.strokeStyle =
  oppositeColor;

ctx.lineWidth =
  0.35;

ctx.strokeRect(
  selectedX + 0.03,
  selectedY + 0.03,
  0.94,
  0.94
);


/*
 * Внутренний контрастный контур.
 */

ctx.strokeStyle =
  crosshairColor;

ctx.lineWidth =
  0.18;

ctx.strokeRect(
  selectedX + 0.15,
  selectedY + 0.15,
  0.70,
  0.70
);

  }

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

function clampOffsets() {

  const containerRect =
    container.getBoundingClientRect();

  const scaledWidth =
    MAP_WIDTH * scale;

  const scaledHeight =
    MAP_HEIGHT * scale;


  /*
   * Оставляем часть карты видимой,
   * чтобы её невозможно было полностью
   * потерять за пределами экрана.
   */

  const minVisible =
    window.innerWidth <= 650
      ? 80
      : 120;


  const maxX =
    containerRect.width / 2 +
    scaledWidth / 2 -
    minVisible;

  const maxY =
    containerRect.height / 2 +
    scaledHeight / 2 -
    minVisible;


  offsetX =
    Math.max(
      -maxX,
      Math.min(maxX, offsetX)
    );


  offsetY =
    Math.max(
      -maxY,
      Math.min(maxY, offsetY)
    );

}
function updateTransform() {

  clampOffsets();


  const scaledWidth =
    MAP_WIDTH * scale;

  const scaledHeight =
    MAP_HEIGHT * scale;


  /*
   * Масштабируем игровую карту.
   */

  canvas.style.width =
    `${scaledWidth}px`;

  canvas.style.height =
    `${scaledHeight}px`;

  canvas.style.transform =
    `translate(${offsetX}px, ${offsetY}px)`;


  /*
   * Сетка полностью повторяет
   * размер и положение карты.
   */

  pixelGrid.style.width =
    `${scaledWidth}px`;

  pixelGrid.style.height =
    `${scaledHeight}px`;

  pixelGrid.style.transform =
    `translate(
      calc(-50% + ${offsetX}px),
      calc(-50% + ${offsetY}px)
    )`;


  /*
   * Показываем сетку только тогда,
   * когда одна клетка уже достаточно
   * большая на экране.
   */

  if (scale >= 5) {

    pixelGrid.style.display =
      "block";

    pixelGrid.style.backgroundImage = `
      linear-gradient(
        to right,
        rgba(0, 0, 0, 0.28) 1px,
        transparent 1px
      ),
      linear-gradient(
        to bottom,
        rgba(0, 0, 0, 0.28) 1px,
        transparent 1px
      )
    `;

    pixelGrid.style.backgroundSize =
      `${scale}px ${scale}px`;

  } else {

    pixelGrid.style.display =
      "none";

  }

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

  const index =
  selectedY * MAP_WIDTH +
  selectedX;

  const owner =
  pixelOwners[index];

  coordinatesText.textContent =
  owner
    ? `X: ${selectedX}  Y: ${selectedY} • 🏫 ${owner}`
    : `X: ${selectedX}  Y: ${selectedY} • Свободная клетка`;

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

  scheduleRankingRefresh();
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

  /*
   * Идёт cooldown.
   */

  if (cooldownRemaining > 0) {

    placeButton.disabled = true;

    placeButton.textContent =
      `ПОДОЖДИТЕ ${cooldownRemaining} СЕК.`;

    return;
  }


  /*
   * Пиксель ещё не выбран.
   */

  if (
    selectedX === null ||
    selectedY === null
  ) {

    placeButton.disabled = true;

    placeButton.textContent =
      "ВЫБЕРИТЕ ПИКСЕЛЬ";

    return;
  }


  /*
   * Можно ставить пиксель.
   */

  placeButton.disabled = false;

  placeButton.textContent =
    "ПОСТАВИТЬ ПИКСЕЛЬ";

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
      0.75,
      Math.min(scale, 12)
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

      startOffsetX =
        offsetX;

      startOffsetY =
        offsetY;

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

  const touch1 =
    event.touches[0];

  const touch2 =
    event.touches[1];


  const newDistance =
    getTouchDistance(
      touch1,
      touch2
    );


  const newScale =
    Math.max(
      0.75,
      Math.min(
        touchStartScale *
        (
          newDistance /
          touchStartDistance
        ),
        12
      )
    );


  /*
   * Текущий центр двух пальцев.
   */

  const currentCenter = {

    x:
      (
        touch1.clientX +
        touch2.clientX
      ) / 2,

    y:
      (
        touch1.clientY +
        touch2.clientY
      ) / 2

  };


  const containerRect =
    container.getBoundingClientRect();


  const oldCenterX =
    touchStartCenter.x -
    containerRect.left -
    containerRect.width / 2;

  const oldCenterY =
    touchStartCenter.y -
    containerRect.top -
    containerRect.height / 2;


  const newCenterX =
    currentCenter.x -
    containerRect.left -
    containerRect.width / 2;

  const newCenterY =
    currentCenter.y -
    containerRect.top -
    containerRect.height / 2;


  const ratio =
    newScale /
    touchStartScale;


  /*
   * Сохраняем точку карты между пальцами
   * и одновременно разрешаем двигать
   * центр pinch-жеста.
   */

  offsetX =
    newCenterX -
    (
      oldCenterX -
      startOffsetX
    ) * ratio;


  offsetY =
    newCenterY -
    (
      oldCenterY -
      startOffsetY
    ) * ratio;


  scale =
    newScale;


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

showLogin.addEventListener(
  "click",
  openLogin
);


showRegister.addEventListener(
  "click",
  openRegister
);

applyInviteFromUrl();

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
/* =========================
   РЕЙТИНГ ТОПА ЧЕТВЕРТИ
========================= */

async function loadQuarterRanking() {

  const rankingElement =
    document.getElementById(
      "class-ranking"
    );


  if (!rankingElement) {
    return;
  }


  rankingElement.innerHTML =
    "<div><span>Загрузка рейтинга...</span></div>";


  const {
    data,
    error
  } =
    await supabaseClient.rpc(
      "get_quarter_ranking"
    );


  if (error) {

    console.error(
      "QUARTER RANKING ERROR:",
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
      "<div><span>ТОП четверти пока пуст</span></div>";

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
        `${Number(
          item.points ?? 0
        ).toLocaleString("ru-RU")} очк.`;


      row.appendChild(name);
      row.appendChild(score);

      rankingElement.appendChild(row);

    }
  );

}

/*
 * Realtime-события пикселей могут приходить
 * много раз в секунду.
 *
 * Карту рисуем сразу, а недельный рейтинг
 * запрашиваем не чаще одного раза в 7 секунд.
 */

const RANKING_REFRESH_DELAY = 7000;

let rankingRefreshTimer = null;
let rankingRefreshInProgress = false;


function scheduleRankingRefresh() {

  if (
    !currentUser ||
    rankingRefreshTimer
  ) {
    return;
  }


  rankingRefreshTimer =
    setTimeout(
      async () => {

        rankingRefreshTimer = null;


        /*
         * Если открыт ТОП четверти,
         * недельный рейтинг сейчас не нужен.
         */

        if (
          !weeklyRankingTab.classList.contains(
            "active"
          )
        ) {
          return;
        }


        /*
         * Не запускаем второй запрос,
         * пока предыдущий ещё выполняется.
         */

        if (rankingRefreshInProgress) {

          scheduleRankingRefresh();

          return;
        }


        rankingRefreshInProgress = true;


        try {

          await loadClassRanking();

        } finally {

          rankingRefreshInProgress = false;

        }

      },
      RANKING_REFRESH_DELAY
    );

}

const weeklyRankingTab =
  document.getElementById(
    "weekly-ranking-tab"
  );

const quarterRankingTab =
  document.getElementById(
    "quarter-ranking-tab"
  );


weeklyRankingTab.addEventListener(
  "click",
  async () => {

    weeklyRankingTab.classList.add(
      "active"
    );

    quarterRankingTab.classList.remove(
      "active"
    );

    await loadClassRanking();

  }
);


quarterRankingTab.addEventListener(
  "click",
  async () => {

    quarterRankingTab.classList.add(
      "active"
    );

    weeklyRankingTab.classList.remove(
      "active"
    );

    await loadQuarterRanking();

  }
);
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
  pixelOwners.fill(null);

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
async function startOnlinePresence() {

  if (!currentUser) {
    return;
  }


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


function closeTelegramPopup() {

  telegramPopup?.classList.add(
    "hidden"
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
async function initializeAuth() {

  const {
    data: { session }
  } =
    await supabaseClient.auth.getSession();

  if (session) {

    currentUser = session.user;

    authScreen.classList.add("hidden");

    await loadActiveSeason();
    await loadClassNames();
    await loadPixels();
    await loadClassRanking();
    await loadMyProfile();
    await checkAdminStatus();

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

    await loadActiveSeason();
    await loadClassNames();
    await loadPixels();
    await loadClassRanking();
    await loadMyProfile();
    await checkAdminStatus();

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

        drawMap();
        
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


    if (
      !easyRegistration &&
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
    "register-student",
    {
      body: easyRegistration
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


    /*
     * Загружаем игру точно так же,
     * как после обычного входа.
     */

    await loadActiveSeason();

    await loadClassNames();

    await loadPixels();

    await loadClassRanking();

    await loadMyProfile();

    await checkAdminStatus();

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
/* -------------------------
   ЧАТ
------------------------- */

const chatMessages =
  document.getElementById(
    "chat-messages"
  );

const chatForm =
  document.getElementById(
    "chat-form"
  );

const chatInput =
  document.getElementById(
    "chat-input"
  );

const chatSendButton =
  document.getElementById(
    "chat-send-button"
  );

function showChatUnreadDot() {

  const button =
    document.getElementById(
      "mobile-chat-button"
    );

  button.classList.add(
    "has-unread"
  );

}


function hideChatUnreadDot() {

  const button =
    document.getElementById(
      "mobile-chat-button"
    );

  button.classList.remove(
    "has-unread"
  );

}

function createChatMessageElement(item) {

  const row =
    document.createElement("div");

  row.className =
    "chat-message";


  const content =
    document.createElement("span");

  content.className =
    "chat-message-content";


  const author =
    document.createElement("strong");

  author.className =
    "chat-message-author";

  author.textContent =
    `${item.nickname} [${item.class_name ?? "—"}]:`;


  /*
   * Цвет зависит от класса.
   * Один класс всегда получает один цвет.
   */

  const classColors = [
    "#f87171",
    "#fb923c",
    "#facc15",
    "#4ade80",
    "#22d3ee",
    "#60a5fa",
    "#a78bfa",
    "#f472b6"
  ];

  const className =
    item.class_name ?? "—";

  let hash = 0;

  for (
    let i = 0;
    i < className.length;
    i++
  ) {

    hash =
      className.charCodeAt(i) +
      ((hash << 5) - hash);

  }

  const colorIndex =
    Math.abs(hash) %
    classColors.length;

  author.style.color =
    classColors[colorIndex];


  const text =
    document.createElement("span");

  text.textContent =
    ` ${item.message}`;


  content.append(
    author,
    text
  );


  /*
   * Время сообщения.
   */

  const time =
    document.createElement("span");

  time.className =
    "chat-message-time";


  if (item.created_at) {

    time.textContent =
      new Date(
        item.created_at
      ).toLocaleTimeString(
        "ru-RU",
        {
          hour: "2-digit",
          minute: "2-digit"
        }
      );

  }


  row.append(
    content,
    time
  );


  return row;
}


async function loadChatMessages() {

  if (!currentUser) {
    return;
  }


  const {
    data,
    error
  } =
    await supabaseClient.rpc(
      "get_chat_messages",
      {
        p_limit: 50
      }
    );


  if (error) {

    console.error(
      "CHAT LOAD ERROR:",
      error
    );

    chatMessages.textContent =
      "Не удалось загрузить сообщения";

    return;
  }


  chatMessages.innerHTML = "";


  if (
    !data ||
    data.length === 0
  ) {

    const empty =
      document.createElement("div");

    empty.className =
      "chat-empty";

    empty.textContent =
      "Сообщений пока нет";

    chatMessages.appendChild(
      empty
    );

    return;
  }


  /*
   * Сервер отдаёт сначала новые.
   * На экране показываем:
   * старые сверху → новые снизу.
   */

  const messages =
    [...data].reverse();


  for (const item of messages) {

    chatMessages.appendChild(
      createChatMessageElement(item)
    );

  }


  chatMessages.scrollTop =
    chatMessages.scrollHeight;
}

/* -------------------------
   REALTIME ЧАТ
------------------------- */

function subscribeToChat() {

  supabaseClient
    .channel("school-chat")
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "chat_messages"
      },
      async () => {

  const chatIsOpen =
    document.body.classList.contains(
      "mobile-chat-view"
    );


  if (chatIsOpen) {

    /*
     * Чат сейчас открыт —
     * сразу показываем сообщение.
     */

    await loadChatMessages();

  } else {

    /*
     * Пользователь находится
     * в другом разделе.
     */

    showChatUnreadDot();

  }

}
    )
    .subscribe((status) => {

      console.log(
        "Chat Realtime:",
        status
      );

    });

}
chatForm.addEventListener(
  "submit",
  async (event) => {

    event.preventDefault();


    const message =
      chatInput.value.trim();


    if (!message) {
      return;
    }


    if (message.length > 100) {
      return;
    }


    chatSendButton.disabled =
      true;


    const {
      error
    } =
      await supabaseClient.rpc(
        "send_chat_message",
        {
          p_message: message
        }
      );


    chatSendButton.disabled =
      false;


    if (error) {

      console.error(
        "CHAT SEND ERROR:",
        error
      );

      return;
    }


    chatInput.value = "";


    await loadChatMessages();


    chatInput.focus();

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
const mobileChatButton =
  document.getElementById(
    "mobile-chat-button"
  );
const mobileProfileButton =
  document.getElementById(
    "mobile-profile-button"
  );


function setMobileView(view) {

  document.body.classList.remove(
    "mobile-ranking-view",
    "mobile-chat-view",
    "mobile-profile-view"
  );


  mobileMapButton.classList.remove(
    "selected"
  );

  mobileRankingButton.classList.remove(
    "selected"
  );
  
  mobileChatButton.classList.remove(
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

  if (view === "chat") {

  document.body.classList.add(
    "mobile-chat-view"
  );

  mobileChatButton.classList.add(
    "selected"
  );
    
  hideChatUnreadDot();
  loadChatMessages();

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
mobileChatButton.addEventListener(
  "click",
  () => {
    setMobileView("chat");
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
  
  adminSeasonsContent.classList.add(
    "hidden"
  );
  adminClassesContent.classList.add(
    "hidden"
  );
  adminStudentsContent.classList.add(
    "hidden"
  );

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
  adminSeasonsContent.classList.add(
    "hidden"
  );
  adminClassesContent.classList.add(
    "hidden"
  );
  adminStudentsContent.classList.add(
    "hidden"
  );
  
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
      .eq("is_active", true)
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
async function loadInviteStats() {

  if (!currentUserIsAdmin) {
    return;
  }

  const body =
    document.getElementById(
      "invite-stats-body"
    );

  if (!body) {
    console.error(
      "invite-stats-body не найден"
    );
    return;
  }

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


// старый код продолжается
const generateInvitesButton =
  document.getElementById(
    "generate-invites-button"
  );

const copyInvitesButton =
  document.getElementById(
    "copy-invites-button"
  );
const printInvitesButton =
  document.getElementById(
    "print-invites-button"
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

  /*
   * Полная ссылка приглашения.
   */

  const inviteUrl =
    `${window.location.origin}${window.location.pathname}?invite=${encodeURIComponent(code)}`;


  /*
   * Карточка приглашения.
   */

  const card =
    document.createElement(
      "div"
    );

  card.className =
    "generated-invite-card";


  /*
   * QR.
   */

  const qrContainer =
    document.createElement(
      "div"
    );

  qrContainer.className =
    "generated-invite-qr";


  /*
   * Текстовый код под QR.
   */

  const codeElement =
    document.createElement(
      "strong"
    );

  codeElement.className =
    "generated-invite-code";

  codeElement.textContent =
    code;


  /*
   * Кнопка копирования ссылки.
   */

  const copyButton =
    document.createElement(
      "button"
    );

  copyButton.type =
    "button";

  copyButton.className =
    "generated-invite-copy";

  copyButton.textContent =
    "📋 Ссылка";


  copyButton.addEventListener(
    "click",
    async () => {

      try {

        await navigator.clipboard.writeText(
          inviteUrl
        );

        copyButton.textContent =
          "✓ Скопировано";


        setTimeout(
          () => {

            copyButton.textContent =
              "📋 Ссылка";

          },
          1200
        );

      } catch (error) {

        console.error(
          "COPY INVITE URL ERROR:",
          error
        );

      }

    }
  );


  /*
   * Собираем карточку.
   */

  card.appendChild(
    qrContainer
  );

  card.appendChild(
    codeElement
  );

  card.appendChild(
    copyButton
  );

  resultList.appendChild(
    card
  );


  /*
   * Генерируем QR уже после того,
   * как контейнер создан.
   */

  new QRCode(
    qrContainer,
    {
      text: inviteUrl,
      width: 150,
      height: 150,
      correctLevel:
        QRCode.CorrectLevel.M
    }
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
  lastGeneratedInvites
    .map(
      code =>
        `${window.location.origin}${window.location.pathname}?invite=${encodeURIComponent(code)}`
    )
    .join(
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
printInvitesButton.addEventListener(
  "click",
  () => {

    if (
      lastGeneratedInvites.length === 0
    ) {

      alert(
        "Сначала создайте приглашения."
      );

      return;
    }


    /*
     * Получаем название выбранного класса.
     */

    const classSelect =
      document.getElementById(
        "invite-class-select"
      );

    const className =
      classSelect.options[
        classSelect.selectedIndex
      ]?.textContent?.trim() ?? "";


    /*
     * Открываем отдельное окно печати.
     */

    const printWindow =
      window.open(
        "",
        "_blank"
      );


    if (!printWindow) {

      alert(
        "Браузер заблокировал окно печати."
      );

      return;
    }


    /*
     * Создаём HTML печатного листа.
     */

    printWindow.document.write(`
      <!DOCTYPE html>

      <html lang="ru">

      <head>

        <meta charset="UTF-8">

        <title>
          Pixel Battle — ${className}
        </title>

        <style>

          @page {
            size: A4;
            margin: 10mm;
          }

          * {
            box-sizing: border-box;
          }

          body {
            margin: 0;

            font-family:
              Arial,
              Helvetica,
              sans-serif;

            color: #111827;
            background: white;
          }


          .print-header {
            margin-bottom: 8mm;

            text-align: center;
          }


          .print-header h1 {
            margin: 0 0 2mm;

            font-size: 22px;
          }


          .print-header p {
            margin: 0;

            color: #475569;

            font-size: 14px;
          }


          .cards {
            display: grid;

            grid-template-columns:
              repeat(3, 1fr);

            gap: 5mm;
          }


          .card {
            min-height: 78mm;
            padding: 5mm;

            display: flex;
            flex-direction: column;
            align-items: center;

            border: 1px dashed #94a3b8;
            border-radius: 3mm;

            text-align: center;

            break-inside: avoid;
          }


          .logo {
            margin-bottom: 2mm;

            font-size: 16px;
            font-weight: 800;
          }


          .instruction {
            margin-bottom: 3mm;

            color: #475569;

            font-size: 11px;
          }


          .qr {
            width: 38mm;
            height: 38mm;

            display: flex;
            align-items: center;
            justify-content: center;
          }


          .qr img,
          .qr canvas {
            width: 38mm !important;
            height: 38mm !important;
          }


          .code-label {
            margin-top: 3mm;

            color: #64748b;

            font-size: 9px;
          }


          .code {
            margin-top: 1mm;

            font-family: monospace;
            font-size: 13px;
            font-weight: 700;
          }


          @media print {

            body {
              print-color-adjust: exact;
              -webkit-print-color-adjust: exact;
            }

          }

        </style>

      </head>

      <body>

        <div class="print-header">

          <h1>
            👑 PIXEL BATTLE
          </h1>

          <p>
            Приглашения • ${className}
          </p>

        </div>


        <div
          id="print-cards"
          class="cards"
        ></div>

      </body>

      </html>
    `);


    printWindow.document.close();


    const cardsContainer =
      printWindow.document.getElementById(
        "print-cards"
      );


    /*
     * Создаём карточку для каждого
     * одноразового приглашения.
     */

    for (
      const code
      of lastGeneratedInvites
    ) {

      const inviteUrl =
        `${window.location.origin}${window.location.pathname}?invite=${encodeURIComponent(code)}`;


      const card =
        printWindow.document.createElement(
          "div"
        );

      card.className =
        "card";


      const logo =
        printWindow.document.createElement(
          "div"
        );

      logo.className =
        "logo";

      logo.textContent =
        "👑 PIXEL BATTLE";


      const instruction =
        printWindow.document.createElement(
          "div"
        );

      instruction.className =
        "instruction";

      instruction.textContent =
        "Отсканируй QR для регистрации";


      const qr =
        printWindow.document.createElement(
          "div"
        );

      qr.className =
        "qr";


      const codeLabel =
        printWindow.document.createElement(
          "div"
        );

      codeLabel.className =
        "code-label";

      codeLabel.textContent =
        "Код приглашения";


      const codeElement =
        printWindow.document.createElement(
          "div"
        );

      codeElement.className =
        "code";

      codeElement.textContent =
        code;


      card.appendChild(
        logo
      );

      card.appendChild(
        instruction
      );

      card.appendChild(
        qr
      );

      card.appendChild(
        codeLabel
      );

      card.appendChild(
        codeElement
      );


      cardsContainer.appendChild(
        card
      );


      /*
       * QRCode загружен в основном окне,
       * поэтому используем его отсюда.
       */

      new QRCode(
        qr,
        {
          text: inviteUrl,
          width: 180,
          height: 180,
          correctLevel:
            QRCode.CorrectLevel.M
        }
      );

    }


    /*
     * Даём браузеру время нарисовать QR,
     * затем открываем стандартную печать.
     */

    setTimeout(
      () => {

        printWindow.focus();

        printWindow.print();

      },
      500
    );

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
const adminStudentsTab =
  document.getElementById(
    "admin-students-tab"
  );

const adminStudentsContent =
  document.getElementById(
    "admin-students-content"
  );

const studentsSearch =
  document.getElementById(
    "students-search"
  );

const studentsClassFilter =
  document.getElementById(
    "students-class-filter"
  );

const studentsStatusFilter =
  document.getElementById(
    "students-status-filter"
  );


let adminStudents = [];
async function loadAdminStudents() {

  if (!currentUserIsAdmin) {
    return;
  }


  const {
    data,
    error
  } =
    await supabaseClient.rpc(
      "admin_get_students"
    );


  if (error) {

    console.error(
      "ADMIN STUDENTS ERROR:",
      error
    );

    return;
  }


  adminStudents =
    data ?? [];


  fillStudentsClassFilter();

  renderAdminStudents();

}
function fillStudentsClassFilter() {

  const currentValue =
    studentsClassFilter.value;


  const classes =
    [
      ...new Map(
        adminStudents
          .filter(
            item =>
              item.class_id &&
              item.class_name
          )
          .map(
            item => [
              String(item.class_id),
              item.class_name
            ]
          )
      ).entries()
    ];


  studentsClassFilter.innerHTML =
    '<option value="">Все классы</option>';


  for (
    const [id, name]
    of classes
  ) {

    const option =
      document.createElement(
        "option"
      );

    option.value = id;
    option.textContent = name;

    studentsClassFilter.appendChild(
      option
    );

  }


  studentsClassFilter.value =
    currentValue;

}
function renderAdminStudents() {

  const body =
    document.getElementById(
      "students-table-body"
    );

  const countElement =
    document.getElementById(
      "students-count"
    );


  const search =
    studentsSearch.value
      .trim()
      .toLowerCase();


  const classId =
    studentsClassFilter.value;


  const status =
    studentsStatusFilter.value;


  const filtered =
    adminStudents.filter(
      student => {

        const matchesSearch =
          !search ||
          String(
            student.username ?? ""
          )
            .toLowerCase()
            .includes(search) ||
          String(
            student.nickname ?? ""
          )
            .toLowerCase()
            .includes(search);


        const matchesClass =
          !classId ||
          String(student.class_id) ===
            classId;


        let matchesStatus = true;


        if (status === "active") {
          matchesStatus =
            !student.banned;
        }


        if (status === "banned") {
          matchesStatus =
            student.banned;
        }


        return (
          matchesSearch &&
          matchesClass &&
          matchesStatus
        );

      }
    );


  countElement.textContent =
    filtered.length.toLocaleString(
      "ru-RU"
    );


  body.innerHTML = "";


  if (filtered.length === 0) {

    const row =
      document.createElement("tr");

    const cell =
      document.createElement("td");

    cell.colSpan = 7;
    cell.textContent =
      "Ученики не найдены";

    row.appendChild(cell);
    body.appendChild(row);

    return;
  }


  for (const student of filtered) {

    const row =
      document.createElement("tr");


    const username =
      document.createElement("td");

    username.textContent =
      student.username ?? "—";


    const nickname =
      document.createElement("td");

    nickname.textContent =
      student.nickname ?? "—";


    const className =
      document.createElement("td");

    className.textContent =
      student.class_name ?? "—";


    const weekly =
      document.createElement("td");

    weekly.textContent =
      Number(
        student.weekly_pixels ?? 0
      ).toLocaleString("ru-RU");


    const total =
      document.createElement("td");

    total.textContent =
      Number(
        student.total_pixels ?? 0
      ).toLocaleString("ru-RU");


    const statusCell =
      document.createElement("td");


    if (student.banned) {

      statusCell.textContent =
        "🔴 Заблокирован";

      statusCell.classList.add(
        "student-status-banned"
      );

    } else {

      statusCell.textContent =
        "🟢 Активен";

      statusCell.classList.add(
        "student-status-active"
      );

    }

    const actionsCell =
  document.createElement("td");


const banButton =
  document.createElement("button");


banButton.type =
  "button";


banButton.className =
  student.banned
    ? "student-action-button unban"
    : "student-action-button ban";


banButton.textContent =
  student.banned
    ? "✅ Разблокировать"
    : "🚫 Заблокировать";


banButton.addEventListener(
  "click",
  async () => {

    const newBannedState =
      !student.banned;


    /*
     * Для блокировки просим подтверждение.
     * Для разблокировки оно не обязательно.
     */

    if (newBannedState) {

      const confirmed =
        confirm(
          `Заблокировать ${student.nickname} (${student.username})?`
        );


      if (!confirmed) {
        return;
      }

    }


    banButton.disabled = true;

    banButton.textContent =
      newBannedState
        ? "БЛОКИРОВКА..."
        : "РАЗБЛОКИРОВКА...";


    const {
      data,
      error
    } =
      await supabaseClient.rpc(
        "admin_set_student_banned",
        {
          p_user_id:
            student.user_id,

          p_banned:
            newBannedState
        }
      );


    if (error) {

      console.error(
        "BAN USER ERROR:",
        error
      );

      alert(
        "Не удалось изменить статус ученика."
      );

      banButton.disabled = false;

      renderAdminStudents();

      return;
    }


    console.log(
      "Статус ученика изменён:",
      data
    );


    /*
     * Загружаем список заново с сервера,
     * а не просто меняем его визуально.
     */

    await loadAdminStudents();

  }
);


actionsCell.appendChild(
  banButton
);

// ==========================================
// СБРОС ПАРОЛЯ
// ==========================================

const resetPasswordButton =
  document.createElement(
    "button"
  );


resetPasswordButton.type =
  "button";

resetPasswordButton.className =
  "student-action-button reset-password";

resetPasswordButton.textContent =
  "🔑 Сбросить пароль";


resetPasswordButton.addEventListener(
  "click",
  async () => {

    const confirmed =
      confirm(
        `Сбросить пароль ученика ${student.nickname} (${student.username})?`
      );


    if (!confirmed) {
      return;
    }


    resetPasswordButton.disabled =
      true;

    resetPasswordButton.textContent =
      "СБРОС...";


    const {
      data,
      error
    } =
      await supabaseClient.functions.invoke(
        "admin-reset-password",
        {
          body: {
            userId:
              student.user_id
          }
        }
      );


    resetPasswordButton.disabled =
      false;

    resetPasswordButton.textContent =
      "🔑 Сбросить пароль";


    if (error) {

      console.error(
        "RESET PASSWORD ERROR:",
        error
      );

      alert(
        "Не удалось сбросить пароль."
      );

      return;
    }


    if (
      !data?.success ||
      !data?.temporaryPassword
    ) {

      console.error(
        "RESET PASSWORD RESPONSE:",
        data
      );

      alert(
        "Сервер не вернул новый пароль."
      );

      return;
    }


    const temporaryPassword =
      data.temporaryPassword;


    /*
     * Показываем пароль администратору.
     */

    const shouldCopy =
      confirm(
        `Пароль ученика ${student.username} изменён.\n\n` +
        `Новый временный пароль:\n\n` +
        `${temporaryPassword}\n\n` +
        `Нажмите OK, чтобы скопировать пароль.`
      );


    if (shouldCopy) {

      try {

        await navigator.clipboard.writeText(
          temporaryPassword
        );

        alert(
          "Пароль скопирован."
        );

      } catch (copyError) {

        console.error(
          "PASSWORD COPY ERROR:",
          copyError
        );

        alert(
          `Не удалось скопировать автоматически.\n\nПароль:\n${temporaryPassword}`
        );

      }

    }

  }
);


actionsCell.appendChild(
  resetPasswordButton
);

    row.append(
      username,
      nickname,
      className,
      weekly,
      total,
      statusCell,
      actionsCell
    );


    body.appendChild(row);

  }

}
studentsSearch.addEventListener(
  "input",
  renderAdminStudents
);

studentsClassFilter.addEventListener(
  "change",
  renderAdminStudents
);

studentsStatusFilter.addEventListener(
  "change",
  renderAdminStudents
);
async function openAdminStudents() {

  if (!currentUserIsAdmin) {
    return;
  }
  adminSeasonsContent.classList.add(
    "hidden"
  );
  adminClassesContent.classList.add(
    "hidden"
  );
  adminOverviewContent.classList.add(
    "hidden"
  );

  adminInvitesContent.classList.add(
    "hidden"
  );

  adminStudentsContent.classList.remove(
    "hidden"
  );


  adminOverviewTab.classList.remove(
    "active"
  );

  adminInvitesTab.classList.remove(
    "active"
  );

  adminStudentsTab.classList.add(
    "active"
  );


  await loadAdminStudents();

}


adminStudentsTab.addEventListener(
  "click",
  openAdminStudents
);
const adminClassesTab =
  document.getElementById(
    "admin-classes-tab"
  );

const adminClassesContent =
  document.getElementById(
    "admin-classes-content"
  );

const newClassName =
  document.getElementById(
    "new-class-name"
  );

const newClassGrade =
  document.getElementById(
    "new-class-grade"
  );

const createClassButton =
  document.getElementById(
    "create-class-button"
  );

const classCreateMessage =
  document.getElementById(
    "class-create-message"
  );


let adminClasses = [];
async function loadAdminClasses() {

  if (!currentUserIsAdmin) {
    return;
  }


  const body =
    document.getElementById(
      "classes-table-body"
    );


  const {
    data,
    error
  } =
    await supabaseClient.rpc(
      "admin_get_classes"
    );


  if (error) {

    console.error(
      "ADMIN CLASSES ERROR:",
      error
    );

    body.innerHTML = `
      <tr>
        <td colspan="6">
          Не удалось загрузить классы
        </td>
      </tr>
    `;

    return;
  }


  adminClasses =
    data ?? [];


  renderAdminClasses();

}
function renderAdminClasses() {

  const body =
    document.getElementById(
      "classes-table-body"
    );


  body.innerHTML = "";


  if (adminClasses.length === 0) {

    const row =
      document.createElement("tr");

    const cell =
      document.createElement("td");

    cell.colSpan = 6;

    cell.textContent =
      "Классы не найдены";

    row.appendChild(cell);
    body.appendChild(row);

    return;
  }


  for (const item of adminClasses) {

    const row =
      document.createElement("tr");


    const nameCell =
      document.createElement("td");

    nameCell.textContent =
      item.class_name;


    const gradeCell =
      document.createElement("td");

    gradeCell.textContent =
      `${item.grade} класс`;


    const studentsCell =
      document.createElement("td");

    studentsCell.textContent =
      Number(
        item.students_count ?? 0
      ).toLocaleString("ru-RU");


    const pixelsCell =
      document.createElement("td");

    pixelsCell.textContent =
      Number(
        item.total_pixels ?? 0
      ).toLocaleString("ru-RU");


    const statusCell =
      document.createElement("td");


    if (item.is_active) {

      statusCell.textContent =
        "🟢 Активен";

      statusCell.classList.add(
        "class-active"
      );

    } else {

      statusCell.textContent =
        "🔴 Отключён";

      statusCell.classList.add(
        "class-inactive"
      );

    }


    const actionsCell =
      document.createElement("td");


    const actionButton =
      document.createElement("button");


    actionButton.type =
      "button";

    actionButton.className =
      "class-action-button";


    actionButton.textContent =
      item.is_active
        ? "Отключить"
        : "Включить";


    actionButton.addEventListener(
      "click",
      async () => {

        const newState =
          !item.is_active;


        if (!newState) {

          const confirmed =
            confirm(
              `Отключить класс ${item.class_name}?`
            );


          if (!confirmed) {
            return;
          }

        }


        actionButton.disabled =
          true;


        actionButton.textContent =
          newState
            ? "ВКЛЮЧЕНИЕ..."
            : "ОТКЛЮЧЕНИЕ...";


        const {
          error
        } =
          await supabaseClient.rpc(
            "admin_set_class_active",
            {
              p_class_id:
                item.class_id,

              p_active:
                newState
            }
          );


        if (error) {

          console.error(
            "CLASS STATUS ERROR:",
            error
          );

          alert(
            "Не удалось изменить статус класса."
          );

          await loadAdminClasses();

          return;
        }


        await loadAdminClasses();

      }
    );


    actionsCell.appendChild(
      actionButton
    );


    row.append(
      nameCell,
      gradeCell,
      studentsCell,
      pixelsCell,
      statusCell,
      actionsCell
    );


    body.appendChild(row);

  }

}
createClassButton.addEventListener(
  "click",
  async () => {

    classCreateMessage.classList.remove(
      "success"
    );

    classCreateMessage.textContent = "";


    const name =
      newClassName.value
        .trim()
        .toUpperCase();


    const grade =
      Number(
        newClassGrade.value
      );


    if (!name) {

      classCreateMessage.textContent =
        "Введите название класса.";

      return;
    }


    if (
      !Number.isInteger(grade) ||
      grade < 1 ||
      grade > 11
    ) {

      classCreateMessage.textContent =
        "Выберите параллель.";

      return;
    }


    createClassButton.disabled =
      true;

    createClassButton.textContent =
      "ДОБАВЛЕНИЕ...";


    const {
      data,
      error
    } =
      await supabaseClient.rpc(
        "admin_create_class",
        {
          p_name: name,
          p_grade: grade
        }
      );


    createClassButton.disabled =
      false;

    createClassButton.textContent =
      "ДОБАВИТЬ КЛАСС";


    if (error) {

      console.error(
        "CREATE CLASS ERROR:",
        error
      );


      if (
        error.message?.includes(
          "CLASS_ALREADY_EXISTS"
        )
      ) {

        classCreateMessage.textContent =
          "Такой класс уже существует.";

      } else {

        classCreateMessage.textContent =
          "Не удалось добавить класс.";

      }

      return;
    }


    classCreateMessage.classList.add(
      "success"
    );

    classCreateMessage.textContent =
      `Класс ${data.class_name} добавлен.`;


    newClassName.value = "";
    newClassGrade.value = "";


    await loadAdminClasses();

  }
);
async function openAdminClasses() {

  if (!currentUserIsAdmin) {
    return;
  }
  adminSeasonsContent.classList.add(
    "hidden"
  );

  adminOverviewContent.classList.add(
    "hidden"
  );

  adminStudentsContent.classList.add(
    "hidden"
  );

  adminInvitesContent.classList.add(
    "hidden"
  );

  adminClassesContent.classList.remove(
    "hidden"
  );


  adminOverviewTab.classList.remove(
    "active"
  );

  adminStudentsTab.classList.remove(
    "active"
  );

  adminInvitesTab.classList.remove(
    "active"
  );

  adminClassesTab.classList.add(
    "active"
  );


  await loadAdminClasses();

}


adminClassesTab.addEventListener(
  "click",
  openAdminClasses
);
const adminSeasonsTab =
  document.getElementById(
    "admin-seasons-tab"
  );

const adminSeasonsContent =
  document.getElementById(
    "admin-seasons-content"
  );
async function loadAdminCurrentSeason() {

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
      "ADMIN SEASON ERROR:",
      error
    );

    return;
  }


  const titleElement =
    document.getElementById(
      "admin-current-season-title"
    );

  const datesElement =
    document.getElementById(
      "admin-current-season-dates"
    );

  const timeElement =
    document.getElementById(
      "admin-season-time-left"
    );

  const pixelsElement =
    document.getElementById(
      "admin-season-pixels"
    );

  const playersElement =
    document.getElementById(
      "admin-season-players"
    );

  const leaderElement =
    document.getElementById(
      "admin-season-leader"
    );


  if (!data?.active_season) {

    titleElement.textContent =
      "Нет активного сезона";

    datesElement.textContent = "—";
    timeElement.textContent = "—";
    pixelsElement.textContent = "0";
    playersElement.textContent = "0";
    leaderElement.textContent = "—";

    return;
  }


  const season =
    data.active_season;


  titleElement.textContent =
    season.title ||
    `Неделя #${season.number}`;


  const startDate =
    new Date(season.starts_at);

  const endDate =
    new Date(season.ends_at);


  datesElement.textContent =
    `${startDate.toLocaleDateString("ru-RU")} — ${endDate.toLocaleDateString("ru-RU")}`;


  let difference =
    endDate.getTime() -
    Date.now();


  if (difference <= 0) {

    timeElement.textContent =
      "Завершается...";

  } else {

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


    if (days > 0) {

      timeElement.textContent =
        `${days} дн. ${hours} ч.`;

    } else {

      const minutes =
        Math.floor(
          difference /
          (1000 * 60)
        );

      timeElement.textContent =
        `${hours} ч. ${minutes} мин.`;

    }

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
async function loadAdminQuarterCompetition() {

  if (!currentUserIsAdmin) {
    return;
  }


  const statusElement =
    document.getElementById(
      "admin-quarter-status"
    );

  const titleElement =
    document.getElementById(
      "admin-quarter-title"
    );

  const detailsElement =
    document.getElementById(
      "admin-quarter-details"
    );

  const startButton =
    document.getElementById(
      "admin-quarter-start-button"
    );

  const finishButton =
    document.getElementById(
      "admin-quarter-finish-button"
    );

  const messageElement =
    document.getElementById(
      "admin-quarter-message"
    );


  messageElement.textContent = "";


  const {
    data,
    error
  } =
    await supabaseClient.rpc(
      "get_quarter_competition_status"
    );


  if (error) {

    console.error(
      "QUARTER STATUS ERROR:",
      error
    );

    statusElement.textContent =
      "🔴 Ошибка";

    detailsElement.textContent =
      "Не удалось загрузить состояние.";

    return;
  }


  if (!data?.exists) {

    statusElement.textContent =
      "⚪ Не запущен";

    titleElement.textContent =
      "ТОП четверти";

    detailsElement.textContent =
      "Недель пока не учтено.";

    startButton.classList.remove(
      "hidden"
    );

    finishButton.classList.add(
      "hidden"
    );

    return;
  }


  const started =
    new Date(
      data.started_at
    ).toLocaleDateString(
      "ru-RU"
    );


  statusElement.textContent =
    "🟢 Активен";

  titleElement.textContent =
    data.title ?? "ТОП четверти";

  detailsElement.textContent =
    `Начат: ${started} • Учтено недель: ${Number(
      data.weeks_count ?? 0
    )}`;


  startButton.classList.add(
    "hidden"
  );

  finishButton.classList.remove(
    "hidden"
  );

}
const adminQuarterStartButton =
  document.getElementById(
    "admin-quarter-start-button"
  );


adminQuarterStartButton.addEventListener(
  "click",
  async () => {

    if (!currentUserIsAdmin) {
      return;
    }


    const confirmed =
      confirm(
        "Начать новый ТОП четверти?\n\nЗавершённые с этого момента недели будут учитываться в общем рейтинге."
      );


    if (!confirmed) {
      return;
    }


    adminQuarterStartButton.disabled =
      true;

    adminQuarterStartButton.textContent =
      "ЗАПУСК...";


    const {
      data,
      error
    } =
      await supabaseClient.rpc(
        "start_quarter_competition",
        {
          p_title: "ТОП четверти"
        }
      );


    adminQuarterStartButton.disabled =
      false;

    adminQuarterStartButton.textContent =
      "▶ НАЧАТЬ ТОП ЧЕТВЕРТИ";


    if (error) {

      console.error(
        "START QUARTER ERROR:",
        error
      );

      document.getElementById(
        "admin-quarter-message"
      ).textContent =
        "Не удалось запустить ТОП четверти.";

      return;
    }


    console.log(
      "ТОП четверти запущен:",
      data
    );


    await loadAdminQuarterCompetition();

  }
);
const adminQuarterFinishButton =
  document.getElementById(
    "admin-quarter-finish-button"
  );


adminQuarterFinishButton.addEventListener(
  "click",
  async () => {

    if (!currentUserIsAdmin) {
      return;
    }


    const confirmed =
      confirm(
        "Завершить текущий ТОП четверти?\n\nБудут зафиксированы окончательные места, очки и победитель."
      );


    if (!confirmed) {
      return;
    }


    const finalConfirmed =
      confirm(
        "Подтвердите ещё раз.\n\nПосле завершения результаты ТОПа изменить через админ-панель будет нельзя."
      );


    if (!finalConfirmed) {
      return;
    }


    const messageElement =
      document.getElementById(
        "admin-quarter-message"
      );


    adminQuarterFinishButton.disabled =
      true;

    adminQuarterFinishButton.textContent =
      "ЗАВЕРШЕНИЕ...";

    messageElement.classList.remove(
      "success"
    );

    messageElement.textContent = "";


    const {
      data,
      error
    } =
      await supabaseClient.rpc(
        "finish_quarter_competition"
      );


    if (error) {

      console.error(
        "FINISH QUARTER ERROR:",
        error
      );


      adminQuarterFinishButton.disabled =
        false;

      adminQuarterFinishButton.textContent =
        "🏁 ЗАВЕРШИТЬ ТОП ЧЕТВЕРТИ";


      if (
        error.message?.includes(
          "QUARTER_HAS_NO_SEASONS"
        )
      ) {

        messageElement.textContent =
          "Нельзя завершить ТОП без учтённых недель.";

      } else if (
        error.message?.includes(
          "QUARTER_HAS_UNFINISHED_SEASONS"
        )
      ) {

        messageElement.textContent =
          "В ТОПе есть незавершённая неделя.";

      } else if (
        error.message?.includes(
          "ACTIVE_QUARTER_NOT_FOUND"
        )
      ) {

        messageElement.textContent =
          "Активный ТОП четверти не найден.";

      } else {

        messageElement.textContent =
          "Не удалось завершить ТОП четверти.";

      }

      return;
    }


    await loadAdminQuarterCompetition();


    messageElement.classList.add(
      "success"
    );

    messageElement.textContent =
      `ТОП четверти завершён. Победитель: ${data?.winner_class_name ?? "—"}.`;


    alert(
      `ТОП четверти завершён!\n\nПобедитель: ${data?.winner_class_name ?? "—"}\nУчтено недель: ${Number(data?.weeks_count ?? 0)}`
    );

  }
);


async function loadAdminSeasonHistory() {

  if (!currentUserIsAdmin) {
    return;
  }


  const list =
    document.getElementById(
      "admin-season-history-list"
    );


  const {
    data,
    error
  } =
    await supabaseClient.rpc(
      "get_season_archive"
    );


  if (error) {

    console.error(
      "SEASON ARCHIVE ERROR:",
      error
    );

    list.innerHTML =
      '<div class="season-history-loading">Не удалось загрузить архив</div>';

    return;
  }


  list.innerHTML = "";


  if (
    !data ||
    data.length === 0
  ) {

    list.innerHTML =
      '<div class="season-history-loading">Завершённых сезонов пока нет</div>';

    return;
  }


  for (const season of data) {

    const card =
      document.createElement("div");

    card.className =
      "season-history-card";


    const heading =
      document.createElement("h3");

    heading.textContent =
      `Неделя #${season.season_number}`;


    const title =
      document.createElement("div");

    title.className =
      "season-history-title";

    title.textContent =
      season.title ?? "Без названия";


    const winner =
      document.createElement("div");

    winner.className =
      "season-history-row";

    winner.innerHTML =
      `<span>🏆 Победитель</span><strong>${season.winner_class ?? "—"}</strong>`;


    const pixels =
      document.createElement("div");

    pixels.className =
      "season-history-row";

    pixels.innerHTML =
      `<span>🎨 Пикселей</span><strong>${Number(
        season.total_pixels ?? 0
      ).toLocaleString("ru-RU")}</strong>`;


    const players =
      document.createElement("div");

    players.className =
      "season-history-row";

    players.innerHTML =
      `<span>👥 Участников</span><strong>${Number(
        season.total_players ?? 0
      ).toLocaleString("ru-RU")}</strong>`;


    const finished =
      document.createElement("div");

    finished.className =
      "season-history-row";


    const finishedDate =
      season.finished_at
        ? new Date(
            season.finished_at
          ).toLocaleDateString(
            "ru-RU"
          )
        : "—";


    finished.innerHTML =
      `<span>📅 Завершён</span><strong>${finishedDate}</strong>`;

const mapButton =
  document.createElement(
    "button"
  );

mapButton.type =
  "button";

mapButton.className =
  "season-history-map-button";

mapButton.textContent =
  "🗺️ Посмотреть карту";


mapButton.addEventListener(
  "click",
  () => {

    openArchivedSeasonMap(
      season
    );

  }
);
    
    card.append(
      heading,
      title,
      winner,
      pixels,
      players,
      finished,
      mapButton
    );


    list.appendChild(card);

  }

}
async function openAdminSeasons() {

  if (!currentUserIsAdmin) {
    return;
  }


  adminOverviewContent.classList.add(
    "hidden"
  );

  adminStudentsContent.classList.add(
    "hidden"
  );

  adminInvitesContent.classList.add(
    "hidden"
  );

  adminClassesContent.classList.add(
    "hidden"
  );

  adminSeasonsContent.classList.remove(
    "hidden"
  );


  adminOverviewTab.classList.remove(
    "active"
  );

  adminStudentsTab.classList.remove(
    "active"
  );

  adminInvitesTab.classList.remove(
    "active"
  );

  adminClassesTab.classList.remove(
    "active"
  );

  adminSeasonsTab.classList.add(
    "active"
  );


  await loadAdminCurrentSeason();
  await loadAdminQuarterCompetition();
  await loadAdminSeasonHistory();

}


adminSeasonsTab.addEventListener(
  "click",
  openAdminSeasons
);
let openedArchivedSeason = null;

let openedArchivedFinalPixels = [];

let seasonTimelapseHistory = [];
let seasonTimelapseIndex = 0;
let seasonTimelapseFrame = null;
let seasonTimelapsePlaying = false;
let seasonTimelapseSeasonId = null;


const seasonTimelapseButton =
  document.getElementById(
    "season-timelapse-button"
  );

const seasonTimelapseControls =
  document.getElementById(
    "season-timelapse-controls"
  );

const seasonTimelapseCounter =
  document.getElementById(
    "season-timelapse-counter"
  );

const seasonTimelapseTime =
  document.getElementById(
    "season-timelapse-time"
  );

const seasonTimelapseProgress =
  document.getElementById(
    "season-timelapse-progress"
  );

const seasonTimelapsePlayButton =
  document.getElementById(
    "season-timelapse-play-button"
  );

const seasonTimelapseRestartButton =
  document.getElementById(
    "season-timelapse-restart-button"
  );

const seasonTimelapseFinalButton =
  document.getElementById(
    "season-timelapse-final-button"
  );

const seasonTimelapseSpeed =
  document.getElementById(
    "season-timelapse-speed"
  );

const seasonTimelapseWebmButton =
  document.getElementById(
    "season-timelapse-webm-button"
  );

const seasonTimelapseGifButton =
  document.getElementById(
    "season-timelapse-gif-button"
  );

const seasonTimelExportStatus =
  document.getElementById(
       "-t-lapse-exportExportStatus"
  );

let seasonTimelapseExporting = false;
let seasonTimelapseGifWorkerUrl = null;


function stopSeasonTimelapse() {

  seasonTimelapsePlaying = false;


  if (seasonTimelapseFrame) {

    cancelAnimationFrame(
      seasonTimelapseFrame
    );

    seasonTimelapseFrame = null;

  }


  if (
    seasonTimelapseIndex <
    seasonTimelapseHistory.length
  ) {

    seasonTimelapsePlayButton.textContent =
      "▶ Продолжить";

  } else {

    seasonTimelapsePlayButton.textContent =
      "▶ Сначала";

  }

}


function clearArchivedSeasonCanvas() {

  const canvas =
    document.getElementById(
      "season-map-canvas"
    );

  const context =
    canvas.getContext(
      "2d"
    );


  context.fillStyle = "#ffffff";

  context.fillRect(
    0,
    0,
    canvas.width,
    canvas.height
  );

}


function updateSeasonTimelapseStatus() {

  const total =
    seasonTimelapseHistory.length;


  seasonTimelapseCounter.textContent =
    `${seasonTimelapseIndex.toLocaleString("ru-RU")} / ${total.toLocaleString("ru-RU")}`;


  seasonTimelapseProgress.max =
    String(total);

  seasonTimelapseProgress.value =
    String(seasonTimelapseIndex);


  if (seasonTimelapseIndex === 0) {

    seasonTimelapseTime.textContent =
      "Начало сезона";

    return;
  }


  const currentMove =
    seasonTimelapseHistory[
      seasonTimelapseIndex - 1
    ];


  seasonTimelapseTime.textContent =
    new Date(
      currentMove.created_at
    ).toLocaleString(
      "ru-RU"
    );

}


function drawSeasonTimelapseUntil(
  targetIndex
) {

  stopSeasonTimelapse();

  clearArchivedSeasonCanvas();


  const canvas =
    document.getElementById(
      "season-map-canvas"
    );

  const context =
    canvas.getContext(
      "2d"
    );


  const safeTarget =
    Math.max(
      0,
      Math.min(
        Number(targetIndex) || 0,
        seasonTimelapseHistory.length
      )
    );


  for (
    let index = 0;
    index < safeTarget;
    index++
  ) {

    const move =
      seasonTimelapseHistory[index];


    context.fillStyle =
      move.color;

    context.fillRect(
      move.x,
      move.y,
      1,
      1
    );

  }


  seasonTimelapseIndex =
    safeTarget;


  updateSeasonTimelapseStatus();

}


function renderSeasonTimelapseFrame() {

  if (!seasonTimelapsePlaying) {
    return;
  }


  const canvas =
    document.getElementById(
      "season-map-canvas"
    );

  const context =
    canvas.getContext(
      "2d"
    );

  const speed =
    Number(
      seasonTimelapseSpeed.value
    ) || 1;

  const movesPerFrame =
    Math.max(
      1,
      5 * speed
    );

  const endIndex =
    Math.min(
      seasonTimelapseIndex +
        movesPerFrame,
      seasonTimelapseHistory.length
    );


  while (
    seasonTimelapseIndex <
    endIndex
  ) {

    const move =
      seasonTimelapseHistory[
        seasonTimelapseIndex
      ];


    context.fillStyle =
      move.color;

    context.fillRect(
      move.x,
      move.y,
      1,
      1
    );


    seasonTimelapseIndex++;

  }


  updateSeasonTimelapseStatus();


  if (
    seasonTimelapseIndex >=
    seasonTimelapseHistory.length
  ) {

    stopSeasonTimelapse();

    document.getElementById(
      "download-season-png-button"
    ).disabled = false;

    return;

  }


  seasonTimelapseFrame =
    requestAnimationFrame(
      renderSeasonTimelapseFrame
    );

}


function playSeasonTimelapse() {

  if (
    seasonTimelapseHistory.length === 0
  ) {
    return;
  }


  if (
    seasonTimelapseIndex >=
    seasonTimelapseHistory.length
  ) {

    drawSeasonTimelapseUntil(0);

  }


  seasonTimelapsePlaying = true;

  seasonTimelapsePlayButton.textContent =
    "⏸ Пауза";


  document.getElementById(
    "download-season-png-button"
  ).disabled = true;


  seasonTimelapseFrame =
    requestAnimationFrame(
      renderSeasonTimelapseFrame
    );

}


function showArchivedFinalMap() {

  stopSeasonTimelapse();

  clearArchivedSeasonCanvas();


  const canvas =
    document.getElementById(
      "season-map-canvas"
    );

  const context =
    canvas.getContext(
      "2d"
    );


  for (
    const pixel
    of openedArchivedFinalPixels
  ) {

    context.fillStyle =
      pixel.color;

    context.fillRect(
      pixel.x,
      pixel.y,
      1,
      1
    );

  }


  seasonTimelapseControls.classList.add(
    "hidden"
  );

  seasonTimelapseButton.textContent =
    "▶ Таймлапс";


  document.getElementById(
    "download-season-png-button"
  ).disabled = false;

}


function resetSeasonTimelapse() {

  stopSeasonTimelapse();

  seasonTimelapseHistory = [];
  seasonTimelapseIndex = 0;
  seasonTimelapseSeasonId = null;

  seasonTimelapseControls.classList.add(
    "hidden"
  );

  seasonTimelapseButton.disabled = false;

  seasonTimelapseButton.textContent =
    "▶ Таймлапс";

}


async function loadAndPlaySeasonTimelapse() {

  if (
    !currentUserIsAdmin ||
    !openedArchivedSeason
  ) {
    return;
  }


  const seasonId =
    openedArchivedSeason.season_id;


  resetSeasonTimelapse();

  seasonTimelapseButton.disabled = true;

  seasonTimelapseButton.textContent =
    "ЗАГРУЗКА...";


  const PAGE_SIZE = 1000;

  let offset = 0;

  const history = [];


  while (true) {

    const {
      data,
      error
    } =
      await supabaseClient.rpc(
        "get_season_timelapse",
        {
          p_season_id: seasonId,
          p_offset: offset,
          p_limit: PAGE_SIZE
        }
      );


    if (
      openedArchivedSeason?.season_id !==
      seasonId
    ) {
      return;
    }


    if (error) {

      console.error(
        "SEASON TIMELAPSE ERROR:",
        error
      );

      resetSeasonTimelapse();

      alert(
        "Не удалось загрузить таймлапс сезона."
      );

      return;
    }


    const page =
      data ?? [];


    history.push(
      ...page
    );


    if (
      page.length < PAGE_SIZE
    ) {
      break;
    }


    offset += PAGE_SIZE;

  }


  if (history.length === 0) {

    resetSeasonTimelapse();

    alert(
      "В этом сезоне нет истории ходов."
    );

    return;
  }


  seasonTimelapseHistory =
    history;

  seasonTimelapseSeasonId =
    seasonId;

  seasonTimelapseIndex = 0;


  seasonTimelapseButton.disabled = false;

  seasonTimelapseButton.textContent =
    "↻ Запустить заново";


  seasonTimelapseControls.classList.remove(
    "hidden"
  );


  seasonTimelapseProgress.max =
    String(
      seasonTimelapseHistory.length
    );


  drawSeasonTimelapseUntil(0);

  playSeasonTimelapse();

}


seasonTimelapseButton.addEventListener(
  "click",
  loadAndPlaySeasonTimelapse
);


seasonTimelapsePlayButton.addEventListener(
  "click",
  () => {

    if (seasonTimelapsePlaying) {

      stopSeasonTimelapse();

    } else {

      playSeasonTimelapse();

    }

  }
);


seasonTimelapseRestartButton.addEventListener(
  "click",
  () => {

    drawSeasonTimelapseUntil(0);

    playSeasonTimelapse();

  }
);


seasonTimelapseFinalButton.addEventListener(
  "click",
  showArchivedFinalMap
);


function setSeasonTimelapseExporting(
  exporting,
  message = ""
) {

  seasonTimelapseExporting =
    exporting;

  seasonTimelapseWebmButton.disabled =
    exporting;

  seasonTimelapseGifButton.disabled =
    exporting;

  seasonTimelapseExportStatus.textContent =
    message;

}


function downloadSeasonTimelapseBlob(
  blob,
  extension
) {

  const url =
    URL.createObjectURL(
      blob
    );

  const link =
    document.createElement(
      "a"
    );


  link.href =
    url;

  link.download =
    `pixel-battle-week-${openedArchivedSeason?.season_number ?? "season"}-timelapse.${extension}`;


  document.body.appendChild(
    link
  );

  link.click();

  link.remove();


  setTimeout(
    () => {

      URL.revokeObjectURL(
        url
      );

    },
    1000
  );

}


function createSeasonTimelapseExportCanvas(
  scale
) {

  const sourceCanvas =
    document.getElementById(
      "season-map-canvas"
    );

  const exportCanvas =
    document.createElement(
      "canvas"
    );


  exportCanvas.width =
    sourceCanvas.width *
    scale;

  exportCanvas.height =
    sourceCanvas.height *
    scale;


  const context =
    exportCanvas.getContext(
      "2d"
    );


  context.imageSmoothingEnabled =
    false;

  context.fillStyle =
    "#ffffff";

  context.fillRect(
    0,
    0,
    exportCanvas.width,
    exportCanvas.height
  );


  return {
    canvas: exportCanvas,
    context
  };

}


function drawMoveOnExportCanvas(
  context,
  move,
  scale
) {

  context.fillStyle =
    move.color;

  context.fillRect(
    move.x * scale,
    move.y * scale,
    scale,
    scale
  );

}


function waitForExportFrame(
  milliseconds
) {

  return new Promise(
    resolve => {

      setTimeout(
        resolve,
        milliseconds
      );

    }
  );

}


async function exportSeasonTimelapseWebm() {

  if (
    seasonTimelapseExporting ||
    seasonTimelapseHistory.length === 0
  ) {
    return;
  }


  if (
    typeof MediaRecorder === "undefined"
  ) {

    alert(
      "Этот браузер не поддерживает запись WebM."
    );

    return;
  }


  const mimeTypes = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm"
  ];

  const mimeType =
    mimeTypes.find(
      type =>
        MediaRecorder.isTypeSupported(
          type
        )
    );


  if (!mimeType) {

    alert(
      "Этот браузер не поддерживает формат WebM."
    );

    return;
  }


  setSeasonTimelapseExporting(
    true,
    "Подготовка WebM..."
  );


  try {

    const scale = 2;

    const {
      canvas,
      context
    } =
      createSeasonTimelapseExportCanvas(
        scale
      );


    const framesPerSecond = 30;
    const maximumFrames = 600;

    const movesPerFrame =
      Math.max(
        1,
        Math.ceil(
          seasonTimelapseHistory.length /
          maximumFrames
        )
      );


    const stream =
      canvas.captureStream(
        framesPerSecond
      );

    const chunks = [];

    const recorder =
      new MediaRecorder(
        stream,
        {
          mimeType,
          videoBitsPerSecond:
            5000000
        }
      );


    recorder.addEventListener(
      "dataavailable",
      event => {

        if (event.data.size > 0) {

          chunks.push(
            event.data
          );

        }

      }
    );


    const finished =
      new Promise(
        (resolve, reject) => {

          recorder.addEventListener(
            "stop",
            resolve,
            {
              once: true
            }
          );

          recorder.addEventListener(
            "error",
            reject,
            {
              once: true
            }
          );

        }
      );


    recorder.start();


    let moveIndex = 0;
    let frameNumber = 0;

    const totalFrames =
      Math.ceil(
        seasonTimelapseHistory.length /
        movesPerFrame
      );


    while (
      moveIndex <
      seasonTimelapseHistory.length
    ) {

      const endIndex =
        Math.min(
          moveIndex + movesPerFrame,
          seasonTimelapseHistory.length
        );


      while (
        moveIndex < endIndex
      ) {

        drawMoveOnExportCanvas(
          context,
          seasonTimelapseHistory[
            moveIndex
          ],
          scale
        );

        moveIndex++;

      }


      frameNumber++;


      if (
        frameNumber % 10 === 0 ||
        frameNumber === totalFrames
      ) {

        seasonTimelapseExportStatus.textContent =
          `Создание WebM: ${Math.round(
            frameNumber /
            totalFrames *
            100
          )}%`;

      }


      await waitForExportFrame(
        1000 / framesPerSecond
      );

    }


    await waitForExportFrame(
      700
    );


    recorder.stop();

    await finished;


    const blob =
      new Blob(
        chunks,
        {
          type: mimeType
        }
      );


    downloadSeasonTimelapseBlob(
      blob,
      "webm"
    );


    setSeasonTimelapseExporting(
      false,
      "WebM скачан."
    );

  } catch (error) {

    console.error(
      "WEBM EXPORT ERROR:",
      error
    );

    setSeasonTimelapseExporting(
      false,
      ""
    );

    alert(
      "Не удалось создать WebM."
    );

  }

}


async function getSeasonTimelapseGifWorkerUrl() {

  if (seasonTimelapseGifWorkerUrl) {

    return seasonTimelapseGifWorkerUrl;

  }


  const response =
    await fetch(
      "https://cdn.jsdelivr.net/npm/gif.js.optimized@1.0.1/dist/gif.worker.js"
    );


  if (!response.ok) {

    throw new Error(
      "GIF worker download failed"
    );

  }


  const workerBlob =
    await response.blob();


  seasonTimelapseGifWorkerUrl =
    URL.createObjectURL(
      workerBlob
    );


  return seasonTimelapseGifWorkerUrl;

}


async function exportSeasonTimelapseGif() {

  if (
    seasonTimelapseExporting ||
    seasonTimelapseHistory.length === 0
  ) {
    return;
  }


  if (typeof GIF === "undefined") {

    alert(
      "Модуль создания GIF не загрузился."
    );

    return;
  }


  setSeasonTimelapseExporting(
    true,
    "Подготовка GIF..."
  );


  try {

    const workerUrl =
      await getSeasonTimelapseGifWorkerUrl();

    const scale = 1;

    const {
      canvas,
      context
    } =
      createSeasonTimelapseExportCanvas(
        scale
      );


    const maximumFrames = 180;

    const movesPerFrame =
      Math.max(
        1,
        Math.ceil(
          seasonTimelapseHistory.length /
          maximumFrames
        )
      );


    const gif =
      new GIF({
        workers: 2,
        quality: 10,
        repeat: 0,
        width: canvas.width,
        height: canvas.height,
        workerScript: workerUrl
      });


    gif.addFrame(
      canvas,
      {
        copy: true,
        delay: 500
      }
    );


    let moveIndex = 0;


    while (
      moveIndex <
      seasonTimelapseHistory.length
    ) {

      const endIndex =
        Math.min(
          moveIndex + movesPerFrame,
          seasonTimelapseHistory.length
        );


      while (
        moveIndex < endIndex
      ) {

        drawMoveOnExportCanvas(
          context,
          seasonTimelapseHistory[
            moveIndex
          ],
          scale
        );

        moveIndex++;

      }


      gif.addFrame(
        canvas,
        {
          copy: true,
          delay: 100
        }
      );

    }


    gif.addFrame(
      canvas,
      {
        copy: true,
        delay: 1000
      }
    );


    gif.on(
      "progress",
      progress => {

        seasonTimelapseExportStatus.textContent =
          `Создание GIF: ${Math.round(
            progress * 100
          )}%`;

      }
    );


    gif.on(
      "finished",
      blob => {

        downloadSeasonTimelapseBlob(
          blob,
          "gif"
        );

        setSeasonTimelapseExporting(
          false,
          "GIF скачан."
        );

      }
    );


    gif.on(
      "abort",
      () => {

        setSeasonTimelapseExporting(
          false,
          ""
        );

      }
    );


    gif.render();

  } catch (error) {

    console.error(
      "GIF EXPORT ERROR:",
      error
    );

    setSeasonTimelapseExporting(
      false,
      ""
    );

    alert(
      "Не удалось создать GIF."
    );

  }

}


seasonTimelapseWebmButton.addEventListener(
  "click",
  exportSeasonTimelapseWebm
);


seasonTimelapseGifButton.addEventListener(
  "click",
  exportSeasonTimelapseGif
);


seasonTimelapseProgress.addEventListener(
  "input",
  () => {

    seasonTimelapseCounter.textContent =
      `${Number(
        seasonTimelapseProgress.value
      ).toLocaleString("ru-RU")} / ${seasonTimelapseHistory.length.toLocaleString("ru-RU")}`;

  }
);


seasonTimelapseProgress.addEventListener(
  "change",
  () => {

    drawSeasonTimelapseUntil(
      Number(
        seasonTimelapseProgress.value
      )
    );

  }
);


async function openArchivedSeasonMap(
  season
) {

  if (!currentUserIsAdmin) {
    return;
  }
  
openedArchivedSeason =
  season;

resetSeasonTimelapse();

openedArchivedFinalPixels = [];

  const viewer =
    document.getElementById(
      "season-map-viewer"
    );


  const canvas =
    document.getElementById(
      "season-map-canvas"
    );


  const ctx =
    canvas.getContext(
      "2d"
    );


  canvas.width =
    Number(
      season.map_width ?? 300
    );

  canvas.height =
    Number(
      season.map_height ?? 424
    );


  /*
   * Начинаем с чистой белой карты.
   */

  ctx.fillStyle = "#ffffff";

  ctx.fillRect(
    0,
    0,
    canvas.width,
    canvas.height
  );


  /*
   * Supabase ограничивает количество строк
   * в одном ответе, поэтому архивную карту
   * тоже загружаем страницами.
   */

  const PAGE_SIZE = 1000;

  let from = 0;

  const allArchivedPixels = [];


  while (true) {

    const {
      data,
      error
    } =
      await supabaseClient
        .rpc(
          "get_season_map",
          {
            p_season_id:
              season.season_id
          }
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
        "SEASON MAP ERROR:",
        error
      );

      alert(
        "Не удалось загрузить карту сезона."
      );

      return;
    }


    const page =
      data ?? [];


    allArchivedPixels.push(
      ...page
    );


    if (
      page.length < PAGE_SIZE
    ) {
      break;
    }


    from += PAGE_SIZE;

  }


  console.log(
    `Архивная карта загружена полностью: ${allArchivedPixels.length} пикселей`
  );

  openedArchivedFinalPixels =
    allArchivedPixels;


  /*
   * Используем ту же палитру,
   * что и игровая карта.
   *
   * В нашей БД color хранится как цвет.
   */

  for (const pixel of allArchivedPixels) {

    ctx.fillStyle =
      pixel.color;

    ctx.fillRect(
      pixel.x,
      pixel.y,
      1,
      1
    );

  }


  document.getElementById(
    "season-map-viewer-title"
  ).textContent =
    `Неделя #${season.season_number}`;


  document.getElementById(
    "season-map-viewer-subtitle"
  ).textContent =
    season.title ??
    "Завершённый сезон";


  document.getElementById(
    "season-map-winner"
  ).textContent =
    season.winner_class ?? "—";


  document.getElementById(
    "season-map-pixels"
  ).textContent =
    Number(
      season.total_pixels ?? 0
    ).toLocaleString("ru-RU");


  document.getElementById(
    "season-map-players"
  ).textContent =
    Number(
      season.total_players ?? 0
    ).toLocaleString("ru-RU");


  viewer.classList.remove(
    "hidden"
  );


  viewer.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });

}
const closeSeasonMapButton =
  document.getElementById(
    "close-season-map-button"
  );


closeSeasonMapButton.addEventListener(
  "click",
  () => {

    resetSeasonTimelapse();

    openedArchivedSeason = null;
    openedArchivedFinalPixels = [];

    document
      .getElementById(
        "season-map-viewer"
      )
      .classList.add(
        "hidden"
      );

  }
);
const downloadSeasonPngButton =
  document.getElementById(
    "download-season-png-button"
  );


downloadSeasonPngButton.addEventListener(
  "click",
  () => {

    if (
      !currentUserIsAdmin ||
      !openedArchivedSeason
    ) {
      return;
    }


    const sourceCanvas =
      document.getElementById(
        "season-map-canvas"
      );


    /*
     * Увеличиваем экспорт в 6 раз.
     *
     * Исходная карта:
     * 300 × 424
     *
     * PNG:
     * 1800 × 2544
     */

    const exportScale = 6;


    const exportCanvas =
      document.createElement(
        "canvas"
      );


    exportCanvas.width =
      sourceCanvas.width *
      exportScale;

    exportCanvas.height =
      sourceCanvas.height *
      exportScale;


    const exportContext =
      exportCanvas.getContext(
        "2d"
      );


    /*
     * КРИТИЧНО:
     * отключаем сглаживание.
     *
     * Каждый игровой пиксель
     * превращается в чёткий квадрат 6×6.
     */

    exportContext.imageSmoothingEnabled =
      false;


    exportContext.drawImage(
      sourceCanvas,

      0,
      0,

      sourceCanvas.width,
      sourceCanvas.height,

      0,
      0,

      exportCanvas.width,
      exportCanvas.height
    );


    exportCanvas.toBlob(
      blob => {

        if (!blob) {

          alert(
            "Не удалось создать PNG."
          );

          return;
        }


        const url =
          URL.createObjectURL(
            blob
          );


        const link =
          document.createElement(
            "a"
          );


        link.href =
          url;


        link.download =
          `pixel-battle-week-${openedArchivedSeason.season_number}.png`;


        document.body.appendChild(
          link
        );


        link.click();


        link.remove();


        URL.revokeObjectURL(
          url
        );

      },

      "image/png"

    );

  }
);
initializeAuth();
subscribeToPixels();
subscribeToChat();
