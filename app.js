const SUPABASE_URL =
  "https://rfhrqjowxwxpaqmjoikn.supabase.co";

const SUPABASE_KEY =
  "sb_publishable_SictxwPd578IRmRLeoDzBw_7kEG-Y8-";

const VAPID_PUBLIC_KEY =
  "BELSLl6jn7EmkjgDJ87dNCcqTSZGAO4KAJfRdj4VzZd-ibs7SROjc76hUx3MZT8_MwAHybW2hVol_qUmJ78FEzk";

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

const pushPermissionPopup =
  document.getElementById(
    "push-permission-popup"
  );

const pushPermissionPopupText =
  document.getElementById(
    "push-permission-popup-text"
  );

const pushPermissionEnableButton =
  document.getElementById(
    "push-permission-enable-button"
  );

const pushPermissionLaterButton =
  document.getElementById(
    "push-permission-later-button"
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

const referralClassField =
  document.getElementById("referral-class-field");

const referralClassSelect =
  document.getElementById("referral-class-select");

let referralRegistrationCode = "";

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
let currentOnlineUserIds = [];
let adminOnlineRefreshTimer = null;
let adminOnlineRequestNumber = 0;
const MAP_WIDTH = 300;
const MAP_HEIGHT = 424;

const canvas = document.getElementById("pixel-canvas");
const ctx = canvas.getContext("2d");

const container = document.getElementById("canvas-container");
const pixelGrid =
  document.getElementById(
    "pixel-grid"
  );
const selectionIndicator =
  document.getElementById(
    "selection-indicator"
  );

const stencilLayer = document.getElementById("stencil-layer");
const stencilCanvas = document.getElementById("stencil-canvas");
const stencilContext = stencilCanvas.getContext("2d");
stencilContext.imageSmoothingEnabled = false;
const stencilOpenButton = document.getElementById("stencil-open-button");
const stencilDialog = document.getElementById("stencil-dialog");
const stencilCloseButton = document.getElementById("stencil-close-button");
const stencilFileInput = document.getElementById("stencil-file-input");
const stencilPasteButton = document.getElementById("stencil-paste-button");
const stencilControls = document.getElementById("stencil-controls");
const stencilStatus = document.getElementById("stencil-status");
const stencilXInput = document.getElementById("stencil-x");
const stencilYInput = document.getElementById("stencil-y");
const stencilSizeInput = document.getElementById("stencil-size");
const stencilOpacityInput = document.getElementById("stencil-opacity");
const stencilXValue = document.getElementById("stencil-x-value");
const stencilYValue = document.getElementById("stencil-y-value");
const stencilSizeValue = document.getElementById("stencil-size-value");
const stencilOpacityValue = document.getElementById("stencil-opacity-value");
const stencilNudgeButtons = document.querySelectorAll("[data-stencil-dx][data-stencil-dy]");
const stencilLockButton = document.getElementById("stencil-lock-button");
const stencilDeleteButton = document.getElementById("stencil-delete-button");
const placeButton = document.getElementById("place-button");
const coordinatesText = document.getElementById("coordinates");
const coordinatePosition = document.getElementById("coordinate-position");
const pixelOwner = document.getElementById("pixel-owner");
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
  updateSelectionIndicator();
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
function updateSelectionIndicator() {
  if (
    selectedX === null ||
    selectedY === null
  ) {
    selectionIndicator.classList.add("hidden");
    return;
  }

  const indicatorSize =
    scale < 5
      ? Math.max(12, scale * 3)
      : scale;

  const pixelCenterX =
    (selectedX + 0.5 - MAP_WIDTH / 2) *
    scale;

  const pixelCenterY =
    (selectedY + 0.5 - MAP_HEIGHT / 2) *
    scale;

  selectionIndicator.style.width =
    `${indicatorSize}px`;

  selectionIndicator.style.height =
    `${indicatorSize}px`;

  selectionIndicator.style.transform =
    `translate(
      calc(-50% + ${offsetX + pixelCenterX}px),
      calc(-50% + ${offsetY + pixelCenterY}px)
    )`;

  selectionIndicator.classList.remove("hidden");
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

  updateStencilTransform();
  updateSelectionIndicator();
}


/* -------------------------
   ПОЛЬЗОВАТЕЛЬСКИЙ ТРАФАРЕТ
------------------------- */

function setPixelInformation(x = null, y = null, owner = "") {
  const reportButton =
    document.getElementById("pixel-report-button");

  if (x === null || y === null) {
    coordinatePosition.textContent = "Выберите пиксель";
    pixelOwner.textContent = "";
    reportButton?.classList.add("hidden");
    return;
  }

  coordinatePosition.textContent = `X: ${x}  Y: ${y}`;
  pixelOwner.textContent = owner
    ? `🏫 ${owner}`
    : "Свободная клетка";
  reportButton?.classList.toggle("hidden", !owner);
}

stencilOpenButton.addEventListener("click", () => {
  if (typeof stencilDialog.showModal === "function") {
    stencilDialog.showModal();
  } else {
    stencilDialog.setAttribute("open", "");
  }
});

stencilCloseButton.addEventListener("click", () => {
  stencilDialog.close();
});

stencilDialog.addEventListener("click", event => {
  if (event.target !== stencilDialog) {
    return;
  }

  const rect = stencilDialog.getBoundingClientRect();
  const inside =
    event.clientX >= rect.left &&
    event.clientX <= rect.right &&
    event.clientY >= rect.top &&
    event.clientY <= rect.bottom;

  if (!inside) {
    stencilDialog.close();
  }
});

const STENCIL_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp"
]);

const STENCIL_DATABASE_NAME = "school-pixel-battle-local";
const STENCIL_STORE_NAME = "user-stencils";

let stencilObjectUrl = "";
let stencilSourceImage = null;
let stencilSourceBlob = null;
let stencilSaveTimer = null;
let stencilDatabasePromise = null;
let stencilAspectRatio = 1;
let stencilWidth = 1;
let stencilHeight = 1;
let stencilMaxWidth = MAP_WIDTH;
let stencilX = 0;
let stencilY = 0;
let stencilOpacity = 0.55;
let stencilLocked = false;

function openStencilDatabase() {
  if (!("indexedDB" in window)) {
    return Promise.reject(new Error("IndexedDB недоступен"));
  }

  if (!stencilDatabasePromise) {
    stencilDatabasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(STENCIL_DATABASE_NAME, 1);

      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STENCIL_STORE_NAME)) {
          database.createObjectStore(STENCIL_STORE_NAME, {
            keyPath: "userId"
          });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  return stencilDatabasePromise;
}

async function readStoredStencil(userId) {
  const database = await openStencilDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(
      STENCIL_STORE_NAME,
      "readonly"
    );
    const request = transaction
      .objectStore(STENCIL_STORE_NAME)
      .get(userId);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

async function writeStoredStencil(record) {
  const database = await openStencilDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(
      STENCIL_STORE_NAME,
      "readwrite"
    );

    transaction
      .objectStore(STENCIL_STORE_NAME)
      .put(record);

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

async function deleteStoredStencil(userId) {
  const database = await openStencilDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(
      STENCIL_STORE_NAME,
      "readwrite"
    );

    transaction
      .objectStore(STENCIL_STORE_NAME)
      .delete(userId);

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

async function saveStencilNow() {
  clearTimeout(stencilSaveTimer);
  stencilSaveTimer = null;

  if (!currentUser?.id || !stencilSourceBlob) {
    return;
  }

  try {
    await writeStoredStencil({
      userId: currentUser.id,
      blob: stencilSourceBlob,
      x: stencilX,
      y: stencilY,
      width: stencilWidth,
      opacity: stencilOpacity,
      locked: stencilLocked,
      updatedAt: Date.now()
    });
  } catch (error) {
    console.warn("Не удалось сохранить локальный трафарет:", error);
  }
}

function scheduleStencilSave() {
  clearTimeout(stencilSaveTimer);
  stencilSaveTimer = setTimeout(saveStencilNow, 120);
}

function clearStencilView() {
  clearTimeout(stencilSaveTimer);
  stencilSaveTimer = null;

  if (stencilObjectUrl) {
    URL.revokeObjectURL(stencilObjectUrl);
  }

  stencilObjectUrl = "";
  stencilSourceImage = null;
  stencilSourceBlob = null;
  stencilContext.clearRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
  stencilLayer.classList.add("hidden");
  stencilControls.classList.add("hidden");
  stencilOpenButton.classList.remove("has-stencil");
}

async function restoreStencilForCurrentUser() {
  clearStencilView();

  if (!currentUser?.id) {
    return;
  }

  try {
    const stored = await readStoredStencil(currentUser.id);

    if (stored?.blob instanceof Blob) {
      loadStencilFile(stored.blob, stored);
    }
  } catch (error) {
    console.warn("Не удалось восстановить локальный трафарет:", error);
  }
}

function setStencilStatus(message, isError = false) {
  stencilStatus.textContent = message;
  stencilStatus.classList.toggle("error", isError);
}

function updateStencilReadout() {
  stencilXValue.value = String(stencilX);
  stencilYValue.value = String(stencilY);
  stencilSizeValue.value = String(stencilWidth);
  stencilOpacityValue.value = String(Math.round(stencilOpacity * 100));
}

function calculateStencilHeight(width) {
  return Math.max(
    1,
    Math.min(MAP_HEIGHT, Math.round(width / stencilAspectRatio))
  );
}

function clampStencilPosition() {
  stencilX = Math.round(
    Math.max(0, Math.min(MAP_WIDTH - stencilWidth, stencilX))
  );
  stencilY = Math.round(
    Math.max(0, Math.min(MAP_HEIGHT - stencilHeight, stencilY))
  );

  stencilXInput.max = String(Math.max(0, MAP_WIDTH - stencilWidth));
  stencilYInput.max = String(Math.max(0, MAP_HEIGHT - stencilHeight));
  stencilXInput.value = String(stencilX);
  stencilYInput.value = String(stencilY);
  updateStencilReadout();
}

function drawStencil() {
  stencilContext.clearRect(0, 0, MAP_WIDTH, MAP_HEIGHT);

  if (!stencilSourceImage) {
    return;
  }

  stencilContext.save();
  stencilContext.imageSmoothingEnabled = false;
  stencilContext.globalAlpha = stencilOpacity;
  stencilContext.drawImage(
    stencilSourceImage,
    stencilX,
    stencilY,
    stencilWidth,
    stencilHeight
  );
  stencilContext.restore();
}

function updateStencilTransform() {
  if (!stencilLayer || !stencilCanvas) {
    return;
  }

  stencilLayer.style.width = `${MAP_WIDTH * scale}px`;
  stencilLayer.style.height = `${MAP_HEIGHT * scale}px`;
  stencilLayer.style.transform =
    `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px))`;

  clampStencilPosition();
  drawStencil();
}

function removeStencil() {
  const userId = currentUser?.id;
  clearStencilView();

  if (userId) {
    deleteStoredStencil(userId).catch(error => {
      console.warn("Не удалось удалить сохранённый трафарет:", error);
    });
  }

  setStencilStatus("Трафарет удалён. Можно загрузить новый или вставить изображение.");
}

function loadStencilFile(file, savedState = null) {
  if (!file || !STENCIL_TYPES.has(file.type)) {
    setStencilStatus("Поддерживаются только PNG, JPG и WebP.", true);
    return;
  }

  const objectUrl = URL.createObjectURL(file);
  const probe = new Image();

  probe.onload = () => {
    const aspectRatio = probe.naturalWidth / probe.naturalHeight;
    const maxWidthByHeight = Math.max(
      1,
      Math.floor(MAP_HEIGHT * aspectRatio)
    );
    const maxWidth = Math.min(MAP_WIDTH, maxWidthByHeight);
    const initialWidth = Math.max(
      1,
      Math.min(probe.naturalWidth, maxWidth)
    );
    const initialHeight = Math.max(
      1,
      Math.min(MAP_HEIGHT, Math.round(initialWidth / aspectRatio))
    );

    if (stencilObjectUrl) {
      URL.revokeObjectURL(stencilObjectUrl);
    }

    stencilObjectUrl = objectUrl;
    stencilSourceImage = probe;
    stencilSourceBlob = file;
    stencilAspectRatio = aspectRatio;
    stencilMaxWidth = maxWidth;
    stencilWidth = Math.max(
      1,
      Math.min(
        stencilMaxWidth,
        Math.round(Number(savedState?.width) || initialWidth)
      )
    );
    stencilHeight = calculateStencilHeight(stencilWidth);
    stencilX = savedState
      ? Math.round(Number(savedState.x) || 0)
      : Math.round((MAP_WIDTH - stencilWidth) / 2);
    stencilY = savedState
      ? Math.round(Number(savedState.y) || 0)
      : Math.round((MAP_HEIGHT - stencilHeight) / 2);
    stencilOpacity = savedState
      ? Math.max(0.1, Math.min(1, Number(savedState.opacity) || 0.55))
      : 0.55;
    stencilLocked = Boolean(savedState?.locked);

    stencilSizeInput.max = String(stencilMaxWidth);
    stencilSizeInput.value = String(stencilWidth);
    stencilOpacityInput.value = String(Math.round(stencilOpacity * 100));
    stencilLockButton.disabled = false;
    stencilLockButton.setAttribute("aria-pressed", "false");
    stencilLockButton.textContent = "📌 ЗАКРЕПИТЬ";
    stencilLayer.classList.remove("hidden");
    stencilOpenButton.classList.add("has-stencil");
    stencilControls.classList.remove("hidden");

    updateStencilTransform();
    setStencilLocked(stencilLocked);

    if (savedState) {
      setStencilStatus(
        `Трафарет восстановлен: X ${stencilX}, Y ${stencilY}, ${stencilWidth} × ${stencilHeight} клеток.`
      );
    } else {
      setStencilStatus(
        `Точный размер: ${stencilWidth} × ${stencilHeight} клеток. Положение и размер привязаны к сетке.`
      );
      saveStencilNow();
    }
  };

  probe.onerror = () => {
    URL.revokeObjectURL(objectUrl);
    setStencilStatus("Не удалось прочитать изображение.", true);
  };

  probe.src = objectUrl;
}

function setStencilLocked(locked) {
  stencilLocked = locked;
  [
    stencilXInput,
    stencilYInput,
    stencilSizeInput,
    ...stencilNudgeButtons
  ].forEach(control => {
    control.disabled = locked;
  });

  stencilLockButton.setAttribute("aria-pressed", String(locked));
  stencilLockButton.textContent = locked
    ? "🔓 ОТКРЕПИТЬ"
    : "📌 ЗАКРЕПИТЬ";
  setStencilStatus(
    locked
      ? `Закреплено: X ${stencilX}, Y ${stencilY}, ${stencilWidth} × ${stencilHeight} клеток.`
      : "Трафарет откреплён — его снова можно перемещать по клеткам."
  );
}

stencilFileInput.addEventListener("change", () => {
  loadStencilFile(stencilFileInput.files[0]);
  stencilFileInput.value = "";
});

stencilPasteButton.addEventListener("click", async () => {
  if (!navigator.clipboard || !navigator.clipboard.read) {
    setStencilStatus("Нажми Ctrl+V или используй кнопку «Загрузить».", true);
    return;
  }

  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const type = item.types.find(candidate => STENCIL_TYPES.has(candidate));
      if (type) {
        loadStencilFile(await item.getType(type));
        return;
      }
    }
    setStencilStatus("В буфере обмена нет PNG, JPG или WebP.", true);
  } catch (error) {
    setStencilStatus("Браузер не разрешил чтение буфера. Нажми Ctrl+V или загрузи файл.", true);
  }
});

document.addEventListener("paste", event => {
  const item = Array.from(event.clipboardData?.items || [])
    .find(candidate => candidate.kind === "file" && STENCIL_TYPES.has(candidate.type));

  if (item) {
    event.preventDefault();
    loadStencilFile(item.getAsFile());
  }
});

stencilXInput.addEventListener("input", () => {
  stencilX = Math.round(Number(stencilXInput.value));
  updateStencilTransform();
  scheduleStencilSave();
});

stencilYInput.addEventListener("input", () => {
  stencilY = Math.round(Number(stencilYInput.value));
  updateStencilTransform();
  scheduleStencilSave();
});

stencilSizeInput.addEventListener("input", () => {
  const oldCenterX = stencilX + stencilWidth / 2;
  const oldCenterY = stencilY + stencilHeight / 2;

  stencilWidth = Math.max(
    1,
    Math.min(stencilMaxWidth, Math.round(Number(stencilSizeInput.value)))
  );
  stencilHeight = calculateStencilHeight(stencilWidth);
  stencilX = Math.round(oldCenterX - stencilWidth / 2);
  stencilY = Math.round(oldCenterY - stencilHeight / 2);
  updateStencilTransform();
  setStencilStatus(
    `Точный размер: ${stencilWidth} × ${stencilHeight} клеток.`
  );
  scheduleStencilSave();
});

stencilOpacityInput.addEventListener("input", () => {
  stencilOpacity = Number(stencilOpacityInput.value) / 100;
  updateStencilReadout();
  drawStencil();
  scheduleStencilSave();
});

[
  stencilXInput,
  stencilYInput,
  stencilSizeInput,
  stencilOpacityInput
].forEach(control => {
  control.addEventListener("change", () => {
    saveStencilNow();
  });
});

stencilNudgeButtons.forEach(button => {
  button.addEventListener("click", () => {
    stencilX += Number(button.dataset.stencilDx);
    stencilY += Number(button.dataset.stencilDy);
    updateStencilTransform();
    saveStencilNow();
  });
});

stencilLockButton.addEventListener("click", () => {
  setStencilLocked(!stencilLocked);
  saveStencilNow();
});

stencilDeleteButton.addEventListener("click", removeStencil);

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    saveStencilNow();
  }
});

window.addEventListener("pagehide", () => {
  saveStencilNow();

  if (stencilObjectUrl) {
    URL.revokeObjectURL(stencilObjectUrl);
  }
});


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

  setPixelInformation(selectedX, selectedY, owner);

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


  if (data.daily_tasks) {
    dailyTasks.applyStatus(data.daily_tasks);
  }

  pixelCount++;

  pixelCountText.textContent =
    pixelCount.toLocaleString(
      "ru-RU"
    );


  drawMap();

  startCooldown(Number(data.cooldown) || COOLDOWN_SECONDS);

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

function startCooldown(seconds = COOLDOWN_SECONDS) {

  cooldownRemaining =
    seconds;

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

if (!applyReferralFromUrl()) {
  applyInviteFromUrl();
}

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
  dailyTasks.setProfile(profile, profileUserId);


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
  await unblockMeGame.loadStatus();


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

    adminButton.classList.add(
      "hidden"
    );

    hideAdminOnlineUsers();

    return false;
  }


  currentUserIsAdmin =
    data === true;


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

  try {
    const { error } =
      await supabaseClient.functions.invoke(
        "record-client-ip",
        { body: {} }
      );

    if (error) {
      console.warn("IP RECORD ERROR:", error);
    }
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
    await unblockMeGame.loadStatus();
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
    await unblockMeGame.loadStatus();
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
    await unblockMeGame.loadStatus();

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
    dailyTasks.reset();
    unblockMeGame.reset();
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

  const isSystemMessage =
    item.message_type === "system";

  if (isSystemMessage) {
    row.classList.add("system");
    author.textContent = "СИСТЕМА:";
    author.style.color = "#76f5c5";
  } else {
    author.textContent =
      `${item.nickname} [${item.class_name ?? "—"}]:`;
  }


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

  if (!isSystemMessage) {
    author.style.color =
      classColors[colorIndex];
  }


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

  if (
    !isSystemMessage &&
    item.id &&
    item.user_id &&
    item.user_id !== currentUser?.id
  ) {
    const reportButton =
      document.createElement("button");
    reportButton.type = "button";
    reportButton.className = "chat-report-button";
    reportButton.textContent = "🚩";
    reportButton.title = "Пожаловаться на сообщение";
    reportButton.setAttribute("aria-label", "Пожаловаться на сообщение");
    reportButton.addEventListener("click", () => {
      window.openModerationReportDialog?.({
        type: "chat",
        messageId: item.id,
        label: `${item.nickname}: ${item.message}`
      });
    });
    row.appendChild(reportButton);
  }

  return row;
}


async function loadChatMessages() {

  if (!currentUser) {
    return;
  }


  let {
    data,
    error
  } = await supabaseClient.rpc(
    "get_chat_messages_v2",
    {
      p_limit: 50
    }
  );

  // Safe rollout: until the small chat migration is installed,
  // ordinary chat continues through the previous RPC.
  if (
    error &&
    (
      error.code === "PGRST202" ||
      error.code === "42883" ||
      String(error.message || "").includes("get_chat_messages_v2")
    )
  ) {
    ({ data, error } = await supabaseClient.rpc(
      "get_chat_messages",
      {
        p_limit: 50
      }
    ));
  }


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


    if (message.length > 200) {
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
const mobileMinigamesButton =
  document.getElementById(
    "mobile-minigames-button"
  );
const mobileProfileButton =
  document.getElementById(
    "mobile-profile-button"
  );


function setMobileView(view) {

  document.body.classList.remove(
    "mobile-ranking-view",
    "mobile-chat-view",
    "mobile-minigames-view",
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

  mobileMinigamesButton.classList.remove(
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
  if (view === "minigames") {

    document.body.classList.add(
      "mobile-minigames-view"
    );

    mobileMinigamesButton.classList.add(
      "selected"
    );

    unblockMeGame.loadStatus();

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
    dailyTasks.load();

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

mobileMinigamesButton.addEventListener(
  "click",
  () => {
    setMobileView("minigames");
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
const broadcastPushTitle =
  document.getElementById(
    "broadcast-push-title"
  );

const broadcastPushBody =
  document.getElementById(
    "broadcast-push-body"
  );

const broadcastPushButton =
  document.getElementById(
    "broadcast-push-button"
  );

const broadcastPushMessage =
  document.getElementById(
    "broadcast-push-message"
  );


broadcastPushButton.addEventListener(
  "click",
  async () => {

    if (!currentUserIsAdmin) {

      broadcastPushMessage.textContent =
        "Недостаточно прав.";

      return;

    }


    const title =
      broadcastPushTitle.value.trim();

    const body =
      broadcastPushBody.value.trim();


    broadcastPushMessage.classList.remove(
      "success"
    );


    if (!title || !body) {

      broadcastPushMessage.textContent =
        "Заполните заголовок и текст.";

      return;

    }


    const confirmed =
      confirm(
        `Отправить всем уведомление?\n\n${title}\n${body}`
      );


    if (!confirmed) {
      return;
    }


    const originalText =
      broadcastPushButton.textContent;


    broadcastPushButton.disabled =
      true;

    broadcastPushButton.textContent =
      "ОТПРАВКА...";

    broadcastPushMessage.textContent =
      "Рассылка выполняется...";


    try {

      const {
        data,
        error
      } =
        await supabaseClient.functions.invoke(
          "send-broadcast-push",
          {
            body: {
              title,
              body
            }
          }
        );


      if (error) {
        throw error;
      }


      if (
        !data?.success
      ) {
        throw new Error(
          data?.error ||
          "BROADCAST_FAILED"
        );
      }


      const sent =
        Number(data.sent || 0);

      const failed =
        Number(data.failed || 0);

      const removed =
        Number(data.removed || 0);


      broadcastPushMessage.textContent =
        `Отправлено: ${sent}. Ошибок: ${failed}. Удалено старых подписок: ${removed}.`;

      broadcastPushMessage.classList.add(
        "success"
      );

      broadcastPushBody.value = "";

    } catch (error) {

      console.error(
        "BROADCAST PUSH ERROR:",
        error
      );


      let errorDetails =
        error?.message ||
        "UNKNOWN_ERROR";


      if (error?.context) {

        const httpStatus =
          error.context.status;

        try {

          const responseBody =
            await error.context.json();

          errorDetails =
            responseBody?.error ||
            responseBody?.message ||
            JSON.stringify(
              responseBody
            );

        } catch (responseError) {

          console.error(
            "BROADCAST ERROR RESPONSE:",
            responseError
          );

        }


        if (httpStatus) {

          errorDetails =
            `HTTP ${httpStatus}: ${errorDetails}`;

        }

      }


      broadcastPushMessage.textContent =
        `Рассылка не выполнена: ${errorDetails}`;

    } finally {

      broadcastPushButton.disabled =
        false;

      broadcastPushButton.textContent =
        originalText;

    }

  }
);


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
let adminStudentIps = [];

async function loadAdminStudents() {

  if (!currentUserIsAdmin) {
    return;
  }

  const [studentsResult, ipsResult] =
    await Promise.all([
      supabaseClient.rpc(
        "admin_get_students"
      ),
      supabaseClient.rpc(
        "admin_get_student_ips"
      )
    ]);

  if (studentsResult.error) {
    console.error(
      "ADMIN STUDENTS ERROR:",
      studentsResult.error
    );
    return;
  }

  if (ipsResult.error) {
    console.warn(
      "ADMIN STUDENT IPS ERROR:",
      ipsResult.error
    );
  }

  adminStudents =
    studentsResult.data ?? [];

  adminStudentIps =
    ipsResult.error
      ? []
      : (ipsResult.data ?? []);

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
function getStudentIpRecords(userId) {
  return adminStudentIps.filter(
    item => String(item.user_id) === String(userId)
  );
}

function getStudentIpMatches(student) {
  const ownRecords =
    getStudentIpRecords(student.user_id);

  const exact = new Map();
  const similar = new Map();

  for (const own of ownRecords) {
    for (const candidate of adminStudentIps) {
      if (
        String(candidate.user_id) ===
        String(student.user_id)
      ) {
        continue;
      }

      const otherStudent =
        adminStudents.find(
          item =>
            String(item.user_id) ===
            String(candidate.user_id)
        );

      if (!otherStudent) {
        continue;
      }

      const label =
        `${otherStudent.username ?? otherStudent.nickname ?? "аккаунт"} (${candidate.ip_address})`;

      if (
        own.ip_address &&
        own.ip_address === candidate.ip_address
      ) {
        exact.set(
          `${candidate.user_id}:${candidate.ip_address}`,
          label
        );
      } else if (
        own.network_group &&
        own.network_group === candidate.network_group
      ) {
        similar.set(
          `${candidate.user_id}:${candidate.ip_address}`,
          label
        );
      }
    }
  }

  return {
    exact: [...exact.values()],
    similar: [...similar.values()]
  };
}

function createStudentIpCell(student) {
  const cell =
    document.createElement("td");

  cell.className =
    "student-ip-cell";

  const records =
    getStudentIpRecords(student.user_id);

  if (records.length === 0) {
    cell.textContent =
      "Нет данных";
    return cell;
  }

  for (const record of records) {
    const address =
      document.createElement("div");

    address.className =
      "student-ip-address";

    const lastSeen =
      record.last_seen
        ? new Date(record.last_seen)
            .toLocaleString("ru-RU")
        : "";

    address.textContent =
      record.ip_address +
      (lastSeen
        ? ` · ${lastSeen}`
        : "");

    cell.appendChild(address);
  }

  const matches =
    getStudentIpMatches(student);

  if (matches.exact.length > 0) {
    const warning =
      document.createElement("div");

    warning.className =
      "student-ip-warning exact";

    warning.textContent =
      `⚠ Совпадает: ${matches.exact.join(", ")}`;

    cell.appendChild(warning);
  }

  if (matches.similar.length > 0) {
    const warning =
      document.createElement("div");

    warning.className =
      "student-ip-warning similar";

    warning.textContent =
      `≈ Похожая сеть: ${matches.similar.join(", ")}`;

    cell.appendChild(warning);
  }

  return cell;
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
            .includes(search) ||
          getStudentIpRecords(student.user_id)
            .some(item =>
              String(item.ip_address ?? "")
                .toLowerCase()
                .includes(search)
            );


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

    cell.colSpan = 8;
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


    const ipCell =
      createStudentIpCell(student);


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
      ipCell,
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
const adminReferralsTab =
  document.getElementById("admin-referrals-tab");
const adminReferralsContent =
  document.getElementById("admin-referrals-content");
const adminReferralsBody =
  document.getElementById("admin-referrals-body");
const adminReferralsCount =
  document.getElementById("admin-referrals-count");

async function loadAdminReferrals() {
  const { data, error } =
    await supabaseClient.rpc(
      "admin_get_referrals"
    );

  adminReferralsBody.innerHTML = "";

  if (error) {
    console.error("ADMIN REFERRALS ERROR:", error);
    adminReferralsBody.innerHTML =
      '<tr><td colspan="5">Не удалось загрузить данные</td></tr>';
    return;
  }

  const rows = data ?? [];
  adminReferralsCount.textContent =
    rows.length.toLocaleString("ru-RU");

  if (rows.length === 0) {
    adminReferralsBody.innerHTML =
      '<tr><td colspan="5">Регистраций пока нет</td></tr>';
    return;
  }

  for (const item of rows) {
    const row =
      document.createElement("tr");

    const values = [
      `${item.inviter_nickname} (${item.inviter_username})`,
      item.inviter_class_name ?? "—",
      `${item.invited_nickname} (${item.invited_username})`,
      item.invited_class_name ?? "—",
      new Date(item.created_at)
        .toLocaleString("ru-RU")
    ];

    for (const value of values) {
      const cell =
        document.createElement("td");
      cell.textContent = value;
      row.appendChild(cell);
    }

    adminReferralsBody.appendChild(row);
  }
}

adminReferralsTab.addEventListener(
  "click",
  async () => {
    [
      adminOverviewContent,
      adminStudentsContent,
      adminInvitesContent,
      adminClassesContent,
      adminSeasonsContent,
      document.getElementById("admin-promos-content")
    ]
      .filter(Boolean)
      .forEach(element =>
        element.classList.add("hidden")
      );

    document
      .querySelectorAll(".admin-tab")
      .forEach(tab =>
        tab.classList.remove("active")
      );

    adminReferralsContent.classList.remove(
      "hidden"
    );
    adminReferralsTab.classList.add(
      "active"
    );

    await loadAdminReferrals();
  }
);

document
  .querySelectorAll(".admin-tab")
  .forEach(tab => {
    if (tab !== adminReferralsTab) {
      tab.addEventListener("click", () => {
        adminReferralsContent.classList.add(
          "hidden"
        );
      });
    }
  });

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

const seasonTimelapseExportStatus =
  document.getElementById(
    "season-timelapse-export-status"
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
const notificationStatus =
  document.getElementById(
    "notification-status"
  );

const notificationToggleButton =
  document.getElementById(
    "notification-toggle-button"
  );

const notificationTestButton =
  document.getElementById(
    "notification-test-button"
  );

let currentPushSubscription = null;


function base64UrlToUint8Array(
  base64Url
) {

  const padding =
    "=".repeat(
      (
        4 -
        base64Url.length % 4
      ) % 4
    );

  const base64 =
    (
      base64Url +
      padding
    )
      .replace(/-/g, "+")
      .replace(/_/g, "/");

  const rawData =
    atob(base64);

  const output =
    new Uint8Array(
      rawData.length
    );


  for (
    let index = 0;
    index < rawData.length;
    index++
  ) {

    output[index] =
      rawData.charCodeAt(
        index
      );

  }


  return output;

}


function setNotificationStatus(
  text,
  type = ""
) {

  notificationStatus.textContent =
    text;

  notificationStatus.classList.remove(
    "enabled",
    "warning",
    "error"
  );


  if (type) {

    notificationStatus.classList.add(
      type
    );

  }

}


function isIosDevice() {

  return /iPad|iPhone|iPod/.test(
    navigator.userAgent
  );

}


function isStandaloneApp() {

  return (
    window.matchMedia(
      "(display-mode: standalone)"
    ).matches ||
    window.navigator.standalone === true
  );

}


async function updatePushNotificationStatus() {

  if (
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  ) {

    setNotificationStatus(
      "Этот браузер не поддерживает push-уведомления.",
      "error"
    );

    notificationToggleButton.disabled =
      true;

    notificationTestButton.classList.add(
      "hidden"
    );

    return;

  }


  if (
    isIosDevice() &&
    !isStandaloneApp()
  ) {

    setNotificationStatus(
      "На iPhone сначала добавьте сайт на экран «Домой».",
      "warning"
    );

    notificationToggleButton.textContent =
      "КАК УСТАНОВИТЬ";

    notificationToggleButton.disabled =
      false;

    notificationTestButton.classList.add(
      "hidden"
    );

    return;

  }


  try {

    const registration =
      await navigator.serviceWorker.ready;


    currentPushSubscription =
      await registration.pushManager
        .getSubscription();


    if (
      Notification.permission ===
      "denied"
    ) {

      setNotificationStatus(
        "Уведомления запрещены в настройках браузера.",
        "error"
      );

      notificationToggleButton.textContent =
        "УВЕДОМЛЕНИЯ ЗАПРЕЩЕНЫ";

      notificationToggleButton.disabled =
        true;

      notificationTestButton.classList.add(
        "hidden"
      );

      return;

    }


    if (currentPushSubscription) {

      setNotificationStatus(
        "Уведомления включены на этом устройстве.",
        "enabled"
      );

      notificationToggleButton.textContent =
        "🔕 ОТКЛЮЧИТЬ УВЕДОМЛЕНИЯ";

      notificationToggleButton.classList.add(
        "enabled"
      );

      notificationTestButton.classList.remove(
        "hidden"
      );

    } else {

      setNotificationStatus(
        "Включите, чтобы узнавать о событиях и итогах.",
        "warning"
      );

      notificationToggleButton.textContent =
        "🔔 ВКЛЮЧИТЬ УВЕДОМЛЕНИЯ";

      notificationToggleButton.classList.remove(
        "enabled"
      );

      notificationTestButton.classList.add(
        "hidden"
      );

    }


    notificationToggleButton.disabled =
      false;

  } catch (error) {

    console.error(
      "PUSH STATUS ERROR:",
      error
    );

    setNotificationStatus(
      "Не удалось проверить уведомления.",
      "error"
    );

  }

}


async function enablePushNotifications() {

  notificationToggleButton.disabled =
    true;

  setNotificationStatus(
    "Подключение уведомлений..."
  );


  try {

    const permission =
      await Notification.requestPermission();


    if (permission !== "granted") {

      setNotificationStatus(
        "Разрешение не предоставлено.",
        "warning"
      );

      await updatePushNotificationStatus();

      return;

    }


    const registration =
      await navigator.serviceWorker.ready;


    const subscription =
      await registration.pushManager
        .subscribe({
          userVisibleOnly: true,

          applicationServerKey:
            base64UrlToUint8Array(
              VAPID_PUBLIC_KEY
            )
        });


    const subscriptionJson =
      subscription.toJSON();


    const {
      error
    } =
      await supabaseClient.rpc(
        "save_push_subscription",
        {
          p_endpoint:
            subscription.endpoint,

          p_p256dh:
            subscriptionJson.keys?.p256dh,

          p_auth_key:
            subscriptionJson.keys?.auth,

          p_user_agent:
            navigator.userAgent
        }
      );


    if (error) {

      await subscription.unsubscribe();

      throw error;

    }


    currentPushSubscription =
      subscription;


    await updatePushNotificationStatus();

  } catch (error) {

    console.error(
      "ENABLE PUSH ERROR:",
      error
    );

    setNotificationStatus(
      "Не удалось включить уведомления.",
      "error"
    );

    notificationToggleButton.disabled =
      false;

  }

}


async function disablePushNotifications() {

  if (!currentPushSubscription) {

    await updatePushNotificationStatus();

    return;

  }


  notificationToggleButton.disabled =
    true;

  setNotificationStatus(
    "Отключение уведомлений..."
  );


  try {

    const endpoint =
      currentPushSubscription.endpoint;


    const {
      error
    } =
      await supabaseClient.rpc(
        "delete_push_subscription",
        {
          p_endpoint: endpoint
        }
      );


    if (error) {
      throw error;
    }


    await currentPushSubscription
      .unsubscribe();


    currentPushSubscription = null;


    await updatePushNotificationStatus();

  } catch (error) {

    console.error(
      "DISABLE PUSH ERROR:",
      error
    );

    setNotificationStatus(
      "Не удалось отключить уведомления.",
      "error"
    );

    notificationToggleButton.disabled =
      false;

  }

}


notificationTestButton.addEventListener(
  "click",
  async () => {

    if (!currentPushSubscription) {

      alert(
        "Сначала включите уведомления на этом устройстве."
      );

      await updatePushNotificationStatus();

      return;

    }


    const originalText =
      notificationTestButton.textContent;


    notificationTestButton.disabled =
      true;

    notificationTestButton.textContent =
      "ОТПРАВКА...";


    try {

      const {
        data,
        error
      } =
        await supabaseClient.functions.invoke(
          "send-test-push",
          {
            body: {}
          }
        );


      if (error) {
        throw error;
      }


      if (data?.error) {
        throw new Error(data.error);
      }


      const sentCount =
        Number(data?.sent || 0);

      const failedCount =
        Number(data?.failed || 0);


      if (sentCount < 1) {

        throw new Error(
          "Уведомление не отправлено. Проверьте подписку и журналы Edge Function."
        );

      }


      alert(
        `Тестовое уведомление отправлено: ${sentCount}. Ошибок: ${failedCount}.`
      );

    } catch (error) {

      console.error(
        "TEST PUSH ERROR:",
        error
      );

      alert(
        "Не удалось отправить тестовое уведомление. Проверьте Edge Function send-test-push и её журналы."
      );

    } finally {

      notificationTestButton.disabled =
        false;

      notificationTestButton.textContent =
        originalText;

    }

  }
);


notificationToggleButton.addEventListener(
  "click",
  async () => {

    if (
      isIosDevice() &&
      !isStandaloneApp()
    ) {

      alert(
        "На iPhone откройте меню «Поделиться», выберите «На экран Домой», затем запустите Pixel Battle с нового значка."
      );

      return;

    }


    if (currentPushSubscription) {

      const confirmed =
        confirm(
          "Отключить уведомления Pixel Battle на этом устройстве?"
        );


      if (!confirmed) {
        return;
      }


      await disablePushNotifications();

    } else {

      await enablePushNotifications();

    }

  }
);


function registerNotificationServiceWorker() {

  if (
    !("serviceWorker" in navigator)
  ) {

    console.log(
      "Service Worker не поддерживается."
    );

    return;
  }


  window.addEventListener(
    "load",
    async () => {

      try {

        const registration =
          await navigator.serviceWorker.register(
            "./sw.js",
            {
              scope: "./"
            }
          );


        console.log(
          "Service Worker зарегистрирован:",
          registration.scope
        );

      } catch (error) {

        console.error(
          "SERVICE WORKER ERROR:",
          error
        );

      }

    }
  );

}


registerNotificationServiceWorker();

/* Old local picture quests are kept unreachable for a safe rollback. */
if (false) {
const pixelQuest = (() => {
  const QUEST_CYCLE_DAYS = 15;
  const themes = ["Крипер из Minecraft","Стив из Minecraft","Алмазный меч из Minecraft","Эндермен из Minecraft","Покебол","Пикачу","Соник","Супергриб из Mario","Кирби","Персонаж Among Us","Губка Боб","Патрик Стар","Шрек","Кот в сапогах","Нян Кэт","Гаст из Minecraft","Аксолотль из Minecraft","Верстак из Minecraft","Сундук из Minecraft","Чармандер","Бульбазавр","Сквиртл","Марио","Луиджи","Звезда из Mario","Гарфилд","Том из «Тома и Джерри»","Джерри","Доге — собака из мема","Pop Cat","Пчела из Minecraft","Блок травы из Minecraft","Кровать из Minecraft","Золотое яблоко из Minecraft","Иви","Джигглипафф","Тейлз","Наклз","Пакман","Привидение из Pac-Man","Миньон","Стич","Беззубик","Кот за клавиатурой","Капибара","Овца из Minecraft","Тотем бессмертия из Minecraft","Факел из Minecraft","Динамит TNT из Minecraft","Мяут","Снорлакс","Йоши","ВАЛЛ-И","ЕВА из «ВАЛЛ-И»","Бэймакс","Винни-Пух","Винни-Пух в смокинге","Ждун","Гравити Фолз: Билл Шифр","Гравити Фолз: Пухля"];
  const CELL_GOAL = 100;
  const COLOR_GOAL = 6;
  const badges = ['🌱', '🎨', '🚀', '🐉', '💎', '👑'];
  let state, key, dialog, panel, launcher;
  let playerProfile = null, profileOwner = null;
  let storageAvailable = true;
  const day = () => new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 10);
  function sync() {
    if (!currentUser) return false;
    const nextKey = 'spb-quest-v1:' + currentUser.id;
    if (key !== nextKey) {
      key = nextKey;
      storageAvailable = true;
      state = { day: '', cells: [], colors: [], completed: [] };
      try {
        const saved = JSON.parse(localStorage.getItem(key));
        if (saved && typeof saved.day === 'string' && Array.isArray(saved.cells) && Array.isArray(saved.colors) && Array.isArray(saved.completed)) state = saved;
      } catch (_) { storageAvailable = false; }
    }
    if (state.day !== day()) {
      state.day = day(); state.cells = []; state.colors = [];
    }
    return true;
  }
  function save() {
    try { localStorage.setItem(key, JSON.stringify(state)); }
    catch (_) { storageAvailable = false; }
  }
  // Same ordered class roster and Kazakhstan day produce the same brief on every device.
  function classBrief(date, className) {
    if (!className) return null;
    const names = [...new Set([...classNamesById.values(), className])].sort((a, b) => a.localeCompare(b, 'ru', { numeric: true }));
    const index = names.indexOf(className);
    const cycleDay = Math.floor(Date.parse(date) / 86400000) % QUEST_CYCLE_DAYS;
    // Each group of 15 classes uses its own bank of concrete subjects.
    const bankStart = Math.floor(index / QUEST_CYCLE_DAYS) * QUEST_CYCLE_DAYS;
    const themeIndex = bankStart + (cycleDay + index % QUEST_CYCLE_DAYS) % QUEST_CYCLE_DAYS;
    return themes[themeIndex % themes.length];
  }
  function setProfile(profile, userId) {
    if (!currentUser || currentUser.id !== userId) return;
    playerProfile = profile;
    profileOwner = userId;
    render();
  }
  function renderCareer() {
    const host = document.getElementById('quest-profile-career');
    if (!host) return;
    host.replaceChildren();
    if (profileOwner !== currentUser?.id || !playerProfile) {
      const pending = document.createElement('p');
      pending.textContent = 'Загружаем достижения…';
      host.append(pending);
      return;
    }
    const total = Math.max(0, Number(playerProfile.total_pixels) || 0);
    const weekly = Math.max(0, Number(playerProfile.weekly_pixels) || 0);
    const levels = [
      [0, '🌱', 'Новичок'], [100, '✏️', 'Скетчер'], [300, '🎨', 'Художник'],
      [700, '🧩', 'Пиксельный мастер'], [1500, '🚀', 'Создатель миров'],
      [3000, '🐉', 'Архитектор легенд'], [6000, '💎', 'Алмазный творец'],
      [10000, '👑', 'Легенда Pixel Battle']
    ];
    const level = levels.reduce((found, entry, index) => total >= entry[0] ? index : found, 0);
    const title = document.createElement('h3');
    title.textContent = levels[level][1] + ' ' + levels[level][2];
    const caption = document.createElement('p');
    caption.textContent = 'Уровень ' + (level + 1) + ' · ' + total.toLocaleString('ru-RU') + ' ходов за всё время';
    const bar = document.createElement('progress');
    bar.className = 'pq-career-progress';
    bar.setAttribute('aria-label', 'Прогресс до следующего уровня');
    const next = levels[level + 1];
    bar.max = next ? next[0] - levels[level][0] : 1;
    bar.value = next ? total - levels[level][0] : 1;
    const goal = document.createElement('p');
    goal.textContent = next ? 'До уровня «' + next[2] + '». Осталось ходов: ' + (next[0] - total).toLocaleString('ru-RU') : 'Все уровни открыты. Создавай новые шедевры!';
    const roadmap = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = 'Все 8 уровней';
    roadmap.append(summary);
    levels.forEach(([threshold, icon, name]) => {
      const row = document.createElement('p');
      row.textContent = (total >= threshold ? '✓ ' : '🔒 ') + icon + ' ' + name + ' · ' + threshold.toLocaleString('ru-RU');
      roadmap.append(row);
    });
    const weekTitle = document.createElement('h3');
    weekTitle.textContent = '🗺️ Экспедиция недели';
    const weekText = document.createElement('p');
    weekText.textContent = weekly.toLocaleString('ru-RU') + ' ходов в текущем сезоне. Три рубежа:';
    const stages = document.createElement('div');
    stages.className = 'pq-week-stages';
    [[100, '🥉 Старт'], [300, '🥈 Разгон'], [700, '🥇 Прорыв']].forEach(([target, name]) => {
      const stage = document.createElement('div');
      stage.className = 'pq-badge' + (weekly >= target ? ' pq-earned' : '');
      stage.textContent = name + ' · ' + Math.min(weekly, target) + '/' + target + (weekly >= target ? ' ✓' : '');
      stages.append(stage);
    });
    const note = document.createElement('small');
    note.textContent = 'Уровень рассчитан по статистике аккаунта и доступен на других устройствах. Экспедиция начинается заново с новым сезоном. Это личные достижения — очков рейтинга они не добавляют.';
    host.append(title, caption, bar, goal, roadmap, weekTitle, weekText, stages, note);
  }
  function renderCollection() {
    const host = document.getElementById('quest-profile-collection');
    if (!host) return;
    host.replaceChildren();
    const heading = document.createElement('h3');
    heading.textContent = '🏅 Мои значки квестов';
    const summary = document.createElement('p');
    summary.textContent = 'Выполнено дней: ' + state.completed.length;
    const grid = document.createElement('div');
    grid.className = 'pq-badge-grid';
    const names = ['Первый шаг', 'Художник', 'На орбите', 'Сила дракона', 'Алмазный мастер', 'Корона творчества'];
    badges.forEach((icon, index) => {
      const item = document.createElement('div');
      const earned = state.completed.length > index;
      item.className = 'pq-badge' + (earned ? ' pq-earned' : '');
      const symbol = document.createElement('span');
      symbol.textContent = earned ? icon : '🔒';
      const label = document.createElement('strong');
      label.textContent = names[index];
      const caption = document.createElement('small');
      caption.textContent = earned ? 'Получен · ' + state.completed[index].split('-').reverse().join('.') : 'За ' + (index + 1) + ' выполненных дней';
      item.append(symbol, label, caption);
      grid.append(item);
    });
    const history = document.createElement('details');
    const historyTitle = document.createElement('summary');
    historyTitle.textContent = 'Все выполненные дни · ' + state.completed.length;
    history.append(historyTitle);
    const dates = document.createElement('div');
    dates.className = 'pq-badge-history';
    state.completed.slice().reverse().forEach(date => {
      const row = document.createElement('p');
      row.textContent = '🏅 ' + date.split('-').reverse().join('.') + ' — квест выполнен';
      dates.append(row);
    });
    history.append(dates);
    const note = document.createElement('small');
    note.textContent = storageAvailable ? 'Значки сохраняются в этом браузере для твоего аккаунта. На другом устройстве коллекция отдельная. Пропуски дней не отнимают награды.' : 'Сохранение недоступно: коллекция останется только до закрытия страницы.';
    host.append(heading, summary, grid, history, note);
  }
  function render() {
    if (!sync() || !panel) return;
    renderCollection();
    renderCareer();
    const n = state.cells.length, c = state.colors.length;
    const done = state.completed.includes(state.day);
    const className = profileOwner === currentUser.id ? playerProfile?.class_name : null;
    const theme = classBrief(state.day, className);
    const goals = [['Разминка', Math.min(n, 10), 10], ['Палитра художника', Math.min(c, COLOR_GOAL), COLOR_GOAL], ['Пиксельный мастер', Math.min(n, CELL_GOAL), CELL_GOAL]];
    panel.replaceChildren();
    const title = document.createElement('h3'); title.textContent = theme ? className + ' · ' + theme : 'Загружаем тему твоего класса…';
    const intro = document.createElement('p'); intro.textContent = 'У твоего класса общий сюжет дня! Договоритесь в чате о месте и деталях рисунка. Прогресс целей — личный. Тема для вдохновения: можно рисовать свои идеи. Берегите работы других.';
    panel.append(title, intro);
    const nextTheme = document.createElement('small');
    const tomorrow = new Date(Date.parse(state.day) + 86400000).toISOString().slice(0, 10);
    nextTheme.textContent = className ? 'Завтра: ' + classBrief(tomorrow, className) : 'Тема появится после загрузки профиля.';
    panel.append(nextTheme);
    goals.forEach(([name, value, max]) => {
      const row = document.createElement('div'); row.className = 'pq-goal';
      const label = document.createElement('span'); label.textContent = (value === max ? '✓ ' : '') + name + ' · ' + value + '/' + max;
      const bar = document.createElement('progress'); bar.max = max; bar.value = value; bar.setAttribute('aria-label', name);
      row.append(label, bar); panel.append(row);
    });
    const hint = document.createElement('p'); hint.textContent = 'Цели: 10 разных клеток для разминки, 6 цветов и 100 разных клеток. Засчитываются успешные ходы после обновления, каждый день с 00:00 по Казахстану.';
    const result = document.createElement('p'); result.className = 'pq-result';
    result.textContent = done ? '✨ Квест выполнен! Значок дня в коллекции.' : 'Собери все три цели и получи значок дня.';
    const collection = document.createElement('p');
    collection.textContent = '🏅 Коллекция в разделе «Профиль» · выполнено дней: ' + state.completed.length;
    const note = document.createElement('small');
    note.textContent = storageAvailable ? 'Коллекция сохранена в этом браузере для твоего аккаунта. Значки не дают очков рейтинга. Пропуск дня ничего не отнимает.' : 'Браузер не разрешает сохранение: прогресс доступен только до закрытия страницы.';
    panel.append(hint, result, collection, note);
    launcher.textContent = done ? '✨ Квест ✓' : '🎨 Квест · ' + Math.min(n, CELL_GOAL) + '/' + CELL_GOAL;
  }
  function mount() {
    if (dialog) return;
    const style = document.createElement('style');
    style.textContent = '.map-header{gap:8px}.map-header .map-title{flex-shrink:0;gap:8px}.map-header #coordinates{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pq-launch{flex-shrink:0;white-space:nowrap;margin:0;padding:6px 8px;min-height:32px;border:1px solid #a78bfa;border-radius:12px;background:#27144c;color:#fff;font:600 12px/1.2 system-ui,sans-serif;cursor:pointer}.pq-dialog{width:min(480px,calc(100vw - 32px));max-height:85dvh;overflow:auto;box-sizing:border-box;padding:24px;border:1px solid #a78bfa;border-radius:22px;background:#101827;color:#f1f5f9;box-shadow:0 24px 90px #0009}.pq-dialog::backdrop{background:#000a}.pq-dialog h2{margin:0 0 18px}.pq-dialog h3{color:#c4b5fd}.pq-dialog p{font-size:15px;line-height:1.6}.pq-dialog small{display:block;color:#b6c3d5;line-height:1.5}.pq-goal{margin:16px 0}.pq-goal span{display:block;margin-bottom:7px}.pq-goal progress{width:100%;height:12px;accent-color:#a78bfa}.pq-result{color:#86efac;font-weight:bold}.pq-close{float:right;background:transparent;border:0;color:#fff;font-size:26px;cursor:pointer;min-width:44px;min-height:44px}';
    style.textContent += '.pq-profile{margin:18px 0;padding:16px;border:1px solid #534275;border-radius:16px;background:#17152b}.pq-profile h3{margin:0 0 12px;color:#ddd6fe}.pq-profile p{margin:10px 0}.pq-profile small{display:block;color:#aebbd0;line-height:1.5}.pq-badge-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:14px 0}.pq-badge{padding:12px 6px;border:1px solid #374151;border-radius:12px;text-align:center;color:#9ca3af}.pq-badge>span{display:block;font-size:28px;margin-bottom:6px}.pq-badge strong{display:block;font-size:12px;overflow-wrap:anywhere}.pq-earned{background:#30204c;border-color:#9d79d0;color:#fff}.pq-badge small{font-size:11px;margin-top:6px}.pq-profile details{margin:14px 0}.pq-profile summary{cursor:pointer}.pq-badge-history{max-height:180px;overflow:auto;font-size:13px}';
    style.textContent += '.pq-career-progress{width:100%;height:14px;accent-color:#a78bfa}.pq-week-stages{display:grid;gap:8px;margin:12px 0}.pq-profile details+h3{margin-top:20px}';
    document.head.append(style);
    const careerHost = document.createElement('section');
    careerHost.id = 'quest-profile-career';
    careerHost.className = 'pq-profile';
    document.querySelector('#profile-panel .profile-stats').after(careerHost);
    const collectionHost = document.createElement('section');
    collectionHost.id = 'quest-profile-collection';
    collectionHost.className = 'pq-profile';
    document.querySelector('#profile-panel .profile-stats').after(collectionHost);
    launcher = document.createElement('button'); launcher.type = 'button'; launcher.className = 'pq-launch'; launcher.textContent = '🎨 Квест дня';
    document.getElementById('online-users').after(launcher);
    launcher.setAttribute('aria-label', 'Открыть квест дня');
    dialog = document.createElement('dialog'); dialog.className = 'pq-dialog'; dialog.setAttribute('aria-labelledby', 'pq-title');
    const close = document.createElement('button'); close.className = 'pq-close'; close.type = 'button'; close.textContent = '×'; close.setAttribute('aria-label', 'Закрыть квест'); close.onclick = () => dialog.close();
    const heading = document.createElement('h2'); heading.id = 'pq-title'; heading.textContent = '🎨 Пиксельный квест';
    panel = document.createElement('div'); dialog.append(close, heading, panel); document.body.append(dialog);
    launcher.onclick = () => { render(); if (currentUser) dialog.showModal(); };
    document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
  }
  function record(data, userId) {
    if (!currentUser || currentUser.id !== userId || !sync()) return;
    const cell = data.x + ':' + data.y;
    if (state.cells.length < CELL_GOAL && !state.cells.includes(cell)) state.cells.push(cell);
    if (state.colors.length < COLOR_GOAL && !state.colors.includes(data.color)) state.colors.push(data.color);
    if (state.cells.length >= CELL_GOAL && state.colors.length >= COLOR_GOAL && !state.completed.includes(state.day)) state.completed.push(state.day);
    save(); render();
  }
  mount();
  return { record, render, setProfile };
})();
}

/* Server-backed daily tasks and the manually activated Turbo Brush reward. */
const dailyTasks = (() => {
  const button = document.getElementById("daily-tasks-button");
  const dialog = document.getElementById("daily-tasks-dialog");
  const closeButton = document.getElementById("daily-tasks-close");
  const dialogContent = document.getElementById("daily-tasks-dialog-content");
  const profileHost = document.getElementById("daily-tasks-profile");
  const careerHost = document.getElementById("player-career-profile");

  let status = null;
  let profile = null;
  let profileOwner = null;
  let loading = false;
  let requestNumber = 0;
  let clockOffsetMs = 0;
  let message = "";
  let messageIsError = false;

  function serverNow() {
    return Date.now() + clockOffsetMs;
  }

  function setClock(serverTime) {
    const parsed = Date.parse(serverTime || "");
    if (Number.isFinite(parsed)) {
      clockOffsetMs = parsed - Date.now();
    }
  }

  function formatDuration(totalSeconds) {
    const seconds = Math.max(0, Math.ceil(Number(totalSeconds) || 0));
    const minutes = Math.floor(seconds / 60);
    return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  }

  function secondsUntil(value) {
    const end = Date.parse(value || "");
    return Number.isFinite(end) ? Math.max(0, Math.ceil((end - serverNow()) / 1000)) : 0;
  }

  function effectiveRewardState() {
    if (!status) return "locked";
    if (status.reward_state === "active" && secondsUntil(status.boost_until) === 0) return "used";
    if (status.reward_state === "claimed" && secondsUntil(status.reward_expires_at) === 0) return "expired";
    return status.reward_state || "locked";
  }

  function completedCount() {
    return Array.isArray(status?.tasks)
      ? status.tasks.filter(task => task.completed).length
      : 0;
  }

  function makeProgress(task) {
    const current = Math.max(0, Number(task.current) || 0);
    const target = Math.max(1, Number(task.target) || 1);
    const progress = document.createElement("progress");
    progress.max = target;
    progress.value = Math.min(current, target);
    progress.setAttribute("aria-label", `${task.title}: ${current} из ${target}`);
    return progress;
  }

  function makeTaskCard(task, index) {
    const card = document.createElement("article");
    card.className = `daily-task-card${task.completed ? " completed" : ""}`;

    const top = document.createElement("div");
    top.className = "daily-task-top";

    const title = document.createElement("strong");
    title.textContent = `${task.completed ? "✓" : index + 1 + "."} ${task.title}`;

    const counter = document.createElement("span");
    counter.textContent = `${Math.min(Number(task.current) || 0, Number(task.target) || 0)}/${Number(task.target) || 0}`;
    top.append(title, counter);

    const description = document.createElement("p");
    description.textContent = task.description || "";

    card.append(top, description, makeProgress(task));

    if (Array.isArray(task.required_colors) && task.required_colors.length > 0) {
      const palette = document.createElement("div");
      palette.className = "daily-task-palette";
      task.required_colors.forEach(color => {
        const swatch = document.createElement("span");
        swatch.style.backgroundColor = color;
        swatch.title = color;
        palette.append(swatch);
      });
      card.append(palette);
    }

    return card;
  }

  function makeActionButton(label, action, extraClass = "") {
    const actionButton = document.createElement("button");
    actionButton.type = "button";
    actionButton.className = `daily-reward-button ${extraClass}`.trim();
    actionButton.dataset.dailyAction = action;
    actionButton.textContent = label;
    return actionButton;
  }

  function renderReward(host) {
    const reward = document.createElement("section");
    reward.className = "daily-reward";
    const heading = document.createElement("h3");
    heading.textContent = "⚡ Награда: Турбокисть";
    const state = effectiveRewardState();

    if (state === "ready") {
      const text = document.createElement("p");
      text.textContent = "Все задания выполнены. Забери бонус до 00:00 — после обновления заданий награда дня исчезнет.";
      reward.append(heading, text, makeActionButton("🎁 ЗАБРАТЬ ТУРБОКИСТЬ", "claim"));
    } else if (state === "claimed") {
      const text = document.createElement("p");
      text.textContent = `Бонус хранится ещё ${formatDuration(secondsUntil(status.reward_expires_at))}. После запуска таймер не останавливается.`;
      reward.append(heading, text, makeActionButton("⚡ ВКЛЮЧИТЬ НА 10 МИНУТ", "activate", "activate"));
    } else if (state === "active") {
      reward.classList.add("active");
      const timer = document.createElement("strong");
      timer.className = "daily-boost-timer";
      timer.textContent = `АКТИВНА · ${formatDuration(secondsUntil(status.boost_until))}`;
      const text = document.createElement("p");
      text.textContent = "Сейчас пиксели можно ставить раз в 1 секунду.";
      reward.append(heading, timer, text);
    } else if (state === "used") {
      const text = document.createElement("p");
      text.textContent = "Турбокисть использована. Новую можно получить за задания следующего дня.";
      reward.append(heading, text);
    } else if (state === "expired") {
      const text = document.createElement("p");
      text.textContent = "Срок хранения бонуса закончился. Завтра появится новый комплект заданий.";
      reward.append(heading, text);
    } else {
      const text = document.createElement("p");
      text.textContent = "Выполни все 3 задания, чтобы открыть ускорение: 1 пиксель каждую секунду в течение 10 минут.";
      reward.append(heading, text);
    }

    const note = document.createElement("small");
    note.textContent = "Ходы с активной Турбокистью учитываются на карте и в рейтинге, но не продвигают ежедневные задания.";
    reward.append(note);
    host.append(reward);
  }

  function renderTaskList(host, includeReward) {
    host.replaceChildren();

    if (loading && !status) {
      const pending = document.createElement("p");
      pending.textContent = "Загружаем задания…";
      host.append(pending);
      return;
    }

    if (!status) {
      const unavailable = document.createElement("p");
      unavailable.textContent = message || "Задания появятся после начала активного сезона.";
      if (messageIsError) unavailable.className = "daily-message error";
      host.append(unavailable);
      return;
    }

    const heading = document.createElement("div");
    heading.className = "daily-heading";
    const title = document.createElement("strong");
    title.textContent = `Сегодня · ${completedCount()}/3`;
    const date = document.createElement("span");
    date.textContent = String(status.task_date || "").split("-").reverse().join(".");
    heading.append(title, date);
    host.append(heading);

    const intro = document.createElement("p");
    intro.className = "daily-intro";
    intro.textContent = "Три личных испытания обновляются каждый день в 00:00 по времени Казахстана.";
    host.append(intro);

    (status.tasks || []).forEach((task, index) => host.append(makeTaskCard(task, index)));

    if (message) {
      const feedback = document.createElement("p");
      feedback.className = `daily-message${messageIsError ? " error" : ""}`;
      feedback.textContent = message;
      host.append(feedback);
    }

    if (includeReward) renderReward(host);
  }

  function renderCareer() {
    if (!careerHost) return;
    careerHost.replaceChildren();

    if (!profile || profileOwner !== currentUser?.id) {
      const pending = document.createElement("p");
      pending.textContent = "Загружаем достижения…";
      careerHost.append(pending);
      return;
    }

    const total = Math.max(0, Number(profile.total_pixels) || 0);
    const weekly = Math.max(0, Number(profile.weekly_pixels) || 0);
    const levels = [
      [0, "🌱", "Новичок"], [100, "✏️", "Скетчер"], [300, "🎨", "Художник"],
      [700, "🧩", "Пиксельный мастер"], [1500, "🚀", "Создатель миров"],
      [3000, "🐉", "Архитектор легенд"], [6000, "💎", "Алмазный творец"],
      [10000, "👑", "Легенда Pixel Battle"]
    ];
    const levelIndex = levels.reduce((found, level, index) => total >= level[0] ? index : found, 0);
    const level = levels[levelIndex];
    const next = levels[levelIndex + 1];

    const title = document.createElement("h3");
    title.textContent = `${level[1]} ${level[2]}`;
    const caption = document.createElement("p");
    caption.textContent = `Уровень ${levelIndex + 1} · ${total.toLocaleString("ru-RU")} ходов за всё время`;
    const progress = document.createElement("progress");
    progress.className = "career-progress";
    progress.max = next ? next[0] - level[0] : 1;
    progress.value = next ? total - level[0] : 1;
    const goal = document.createElement("p");
    goal.textContent = next
      ? `До уровня «${next[2]}» осталось ${(next[0] - total).toLocaleString("ru-RU")} ходов.`
      : "Все уровни открыты!";

    const weekTitle = document.createElement("h3");
    weekTitle.textContent = "🗺️ Экспедиция недели";
    const stages = document.createElement("div");
    stages.className = "career-stages";
    [[100, "🥉 Старт"], [300, "🥈 Разгон"], [700, "🥇 Прорыв"]].forEach(([target, name]) => {
      const stage = document.createElement("span");
      stage.className = weekly >= target ? "earned" : "";
      stage.textContent = `${name} · ${Math.min(weekly, target)}/${target}${weekly >= target ? " ✓" : ""}`;
      stages.append(stage);
    });
    const note = document.createElement("small");
    note.textContent = "Уровень хранится в аккаунте, а недельная экспедиция начинается заново с новым сезоном.";

    careerHost.append(title, caption, progress, goal, weekTitle, stages, note);
  }

  function render() {
    if (button) {
      const count = completedCount();
      const rewardState = effectiveRewardState();
      button.classList.toggle("reward-ready", rewardState === "ready" || rewardState === "claimed");
      button.classList.toggle("boost-active", rewardState === "active");
      button.textContent = rewardState === "active"
        ? `⚡ ${formatDuration(secondsUntil(status.boost_until))}`
        : rewardState === "ready"
          ? "🎁 Забрать"
          : `📋 ${count}/3`;
      button.setAttribute("aria-label", `Открыть задания дня. Выполнено ${count} из 3`);
    }
    if (dialogContent) renderTaskList(dialogContent, true);
    if (profileHost) renderTaskList(profileHost, true);
    renderCareer();
  }

  function setStatus(nextStatus) {
    status = nextStatus || null;
    if (status?.server_now) setClock(status.server_now);
    render();
  }

  async function load() {
    if (!currentUser || loading) return;
    const userId = currentUser.id;
    const ownRequest = ++requestNumber;
    loading = true;
    message = "";
    messageIsError = false;
    render();

    const { data, error } = await supabaseClient.rpc("get_daily_tasks");

    if (!currentUser || currentUser.id !== userId || ownRequest !== requestNumber) return;
    loading = false;

    if (error) {
      console.error("DAILY TASKS ERROR:", error);
      message = "Не удалось загрузить задания. Попробуй ещё раз.";
      messageIsError = true;
      render();
      return;
    }

    if (!data?.available) {
      status = null;
      message = "Задания появятся после начала активного сезона.";
      render();
      return;
    }

    setStatus(data.status);
  }

  function applyStatus(nextStatus) {
    if (!currentUser || !nextStatus) return;
    message = "";
    messageIsError = false;
    setStatus(nextStatus);
  }

  async function claimReward() {
    message = "";
    const { data, error } = await supabaseClient.rpc("claim_daily_task_reward");
    if (error) {
      console.error("DAILY REWARD CLAIM ERROR:", error);
      message = "Не удалось забрать Турбокисть. Обнови задания и попробуй снова.";
      messageIsError = true;
      render();
      return;
    }
    message = "Турбокисть сохранена! Запусти её в профиле, когда захочешь.";
    messageIsError = false;
    setStatus(data?.status);
  }

  async function activateBoost() {
    const confirmed = window.confirm(
      "Включить Турбокисть сейчас? 10 минут пойдут сразу и не остановятся, даже если закрыть сайт."
    );
    if (!confirmed) return;

    const { error } = await supabaseClient.rpc("activate_daily_task_boost");
    if (error) {
      console.error("DAILY BOOST ERROR:", error);
      message = "Не удалось включить Турбокисть. Обнови задания и попробуй снова.";
      messageIsError = true;
      render();
      return;
    }

    message = "Турбокисть включена: 1 пиксель каждую секунду в течение 10 минут!";
    messageIsError = false;
    await load();
  }

  async function handleAction(event) {
    const actionButton = event.target.closest("[data-daily-action]");
    if (!actionButton || actionButton.disabled) return;
    actionButton.disabled = true;
    if (actionButton.dataset.dailyAction === "claim") await claimReward();
    if (actionButton.dataset.dailyAction === "activate") await activateBoost();
  }

  function setProfile(nextProfile, userId) {
    if (!currentUser || currentUser.id !== userId) return;
    profile = nextProfile;
    profileOwner = userId;
    renderCareer();
  }

  function reset() {
    requestNumber++;
    loading = false;
    status = null;
    profile = null;
    profileOwner = null;
    message = "";
    if (dialog?.open) dialog.close();
    render();
  }

  button?.addEventListener("click", async () => {
    if (!currentUser) return;
    if (dialog && !dialog.open) dialog.showModal();
    await load();
  });
  closeButton?.addEventListener("click", () => dialog.close());
  dialog?.addEventListener("click", event => {
    if (event.target === dialog) dialog.close();
  });
  dialogContent?.addEventListener("click", handleAction);
  profileHost?.addEventListener("click", handleAction);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && currentUser) load();
  });
  setInterval(() => {
    if (effectiveRewardState() === "active" || effectiveRewardState() === "claimed") render();
  }, 1000);

  render();
  return { load, applyStatus, setProfile, reset };
})();


/* -------------------------
   ЕЖЕДНЕВНАЯ ИГРА UNBLOCK ME
------------------------- */

const unblockMeGame = (() => {
  const profileCard = document.getElementById("unblock-me-profile");
  const statusText = document.getElementById("unblock-me-profile-status");
  const openButton = document.getElementById("unblock-me-open");
  const badge = document.getElementById("unblock-me-badge");
  const dialog = document.getElementById("unblock-me-dialog");
  const closeButton = document.getElementById("unblock-me-close");
  const board = document.getElementById("unblock-me-board");
  const movesText = document.getElementById("unblock-me-moves");
  const message = document.getElementById("unblock-me-message");
  const resetButton = document.getElementById("unblock-me-reset");

  if (
    !profileCard || !statusText || !openButton || !dialog ||
    !closeButton || !board || !movesText || !message || !resetButton
  ) {
    return { loadStatus() {}, reset() {} };
  }

  const PUZZLE_LAYOUTS = [[[0,2,2,1,0],[3,5,3,1,0],[4,0,2,1,0],[3,0,1,2,1],[2,1,1,2,1],[4,1,1,2,1],[1,5,2,1,0],[0,3,1,3,1],[2,4,3,1,0],[2,3,2,1,0],[5,2,1,3,1]],[[0,2,2,1,0],[2,5,2,1,0],[3,3,1,2,1],[0,4,3,1,0],[1,0,2,1,0],[5,4,1,2,1],[2,1,1,2,1],[3,1,1,2,1],[5,2,1,2,1],[0,0,1,2,1]],[[0,2,2,1,0],[2,0,1,2,1],[1,3,2,1,0],[3,1,1,3,1],[5,4,1,2,1],[1,0,1,2,1],[3,4,2,1,0],[0,4,3,1,0],[1,5,3,1,0],[3,0,3,1,0]],[[0,2,2,1,0],[4,1,1,3,1],[3,4,3,1,0],[5,1,1,2,1],[2,1,1,2,1],[4,5,2,1,0],[1,0,2,1,0],[0,4,1,2,1],[1,4,1,2,1]],[[0,2,2,1,0],[2,4,2,1,0],[2,0,1,2,1],[0,3,2,1,0],[1,4,1,2,1],[4,0,1,3,1],[3,1,1,3,1],[3,5,2,1,0],[5,3,1,3,1]],[[0,2,2,1,0],[4,3,2,1,0],[4,1,2,1,0],[3,4,2,1,0],[0,0,3,1,0],[5,4,1,2,1],[3,1,1,2,1],[2,2,1,2,1],[1,1,2,1,0],[0,4,3,1,0]],[[0,2,2,1,0],[2,2,1,3,1],[0,4,2,1,0],[4,4,2,1,0],[4,2,1,2,1],[3,0,1,2,1],[5,1,1,3,1],[0,3,2,1,0],[0,0,3,1,0],[1,5,3,1,0]],[[0,2,2,1,0],[0,3,1,2,1],[3,0,1,3,1],[4,0,1,3,1],[3,5,2,1,0],[2,1,1,2,1],[2,3,3,1,0],[1,4,3,1,0],[5,2,1,2,1]],[[0,2,2,1,0],[0,5,3,1,0],[3,4,3,1,0],[0,1,3,1,0],[5,1,1,2,1],[3,5,2,1,0],[2,0,3,1,0],[2,3,1,2,1],[0,3,2,1,0],[0,0,2,1,0],[3,1,1,3,1]],[[0,2,2,1,0],[5,1,1,3,1],[2,3,3,1,0],[0,3,1,2,1],[3,4,3,1,0],[4,0,2,1,0],[2,1,2,1,0],[1,0,3,1,0],[2,4,1,2,1],[0,1,2,1,0],[3,5,3,1,0]],[[0,2,2,1,0],[1,1,3,1,0],[4,1,1,2,1],[3,2,1,2,1],[2,4,2,1,0],[4,4,2,1,0],[3,0,3,1,0],[0,0,1,2,1],[5,1,1,3,1]],[[0,2,2,1,0],[3,5,2,1,0],[4,1,1,3,1],[3,4,3,1,0],[3,1,1,2,1],[0,0,1,2,1],[1,4,1,2,1],[1,0,2,1,0],[5,1,1,2,1],[3,0,2,1,0],[0,3,2,1,0]],[[0,2,2,1,0],[5,3,1,3,1],[2,2,1,3,1],[2,1,2,1,0],[3,3,2,1,0],[5,1,1,2,1],[0,3,1,3,1],[3,0,3,1,0],[1,5,3,1,0]],[[0,2,2,1,0],[2,5,3,1,0],[1,3,1,3,1],[4,1,2,1,0],[0,3,1,3,1],[0,1,2,1,0],[5,3,1,3,1],[3,1,1,2,1],[2,0,1,3,1],[3,4,2,1,0],[3,0,3,1,0]],[[0,2,2,1,0],[5,2,1,2,1],[2,0,1,2,1],[3,0,3,1,0],[1,0,1,2,1],[0,3,3,1,0],[1,4,3,1,0],[0,4,1,2,1],[3,2,1,2,1],[4,4,1,2,1]],[[0,2,2,1,0],[5,4,1,2,1],[1,0,3,1,0],[2,4,2,1,0],[4,2,1,2,1],[4,0,1,2,1],[1,5,3,1,0],[3,1,1,2,1],[2,1,1,3,1],[0,3,1,2,1]],[[0,2,2,1,0],[2,1,1,3,1],[1,0,1,2,1],[0,4,3,1,0],[3,1,1,2,1],[5,3,1,2,1],[2,0,2,1,0],[3,5,3,1,0],[4,0,1,2,1]],[[0,2,2,1,0],[0,4,1,2,1],[3,4,3,1,0],[2,3,1,2,1],[0,3,2,1,0],[5,0,1,3,1],[4,1,1,3,1],[3,5,2,1,0],[1,0,3,1,0],[3,1,1,3,1]],[[0,2,2,1,0],[3,3,1,2,1],[2,3,1,3,1],[4,4,2,1,0],[2,0,3,1,0],[5,1,1,3,1],[3,5,2,1,0],[0,0,2,1,0],[2,1,3,1,0]],[[0,2,2,1,0],[0,1,2,1,0],[4,3,1,2,1],[1,4,1,2,1],[2,0,1,3,1],[5,1,1,3,1],[3,0,1,2,1],[0,3,3,1,0],[4,5,2,1,0],[2,5,2,1,0]],[[0,2,2,1,0],[2,5,3,1,0],[1,4,1,2,1],[2,2,1,2,1],[3,2,1,2,1],[4,1,1,3,1],[2,0,3,1,0],[0,0,1,2,1],[3,4,2,1,0],[5,1,1,2,1]],[[0,2,2,1,0],[3,0,1,3,1],[1,0,1,2,1],[5,2,1,2,1],[4,3,1,3,1],[4,1,1,2,1],[4,0,2,1,0],[0,4,1,2,1],[2,0,1,2,1],[2,3,1,2,1]],[[0,2,2,1,0],[2,0,1,2,1],[3,4,2,1,0],[3,2,1,2,1],[1,3,1,2,1],[2,2,1,2,1],[0,5,3,1,0],[4,1,1,3,1],[5,3,1,2,1],[3,0,3,1,0],[0,0,1,2,1]],[[0,2,2,1,0],[5,2,1,3,1],[0,3,2,1,0],[2,1,1,2,1],[2,5,3,1,0],[3,1,1,2,1],[4,1,1,3,1],[3,0,3,1,0],[0,4,3,1,0],[2,3,2,1,0]],[[0,2,2,1,0],[3,4,2,1,0],[0,3,1,3,1],[2,2,1,2,1],[1,1,2,1,0],[5,1,1,2,1],[5,3,1,2,1],[0,0,2,1,0],[3,0,1,3,1],[3,5,3,1,0]],[[0,2,2,1,0],[0,0,3,1,0],[3,1,1,2,1],[1,4,2,1,0],[5,2,1,3,1],[2,1,1,2,1],[3,3,1,2,1],[4,0,1,3,1],[2,5,3,1,0],[0,3,2,1,0],[0,4,1,2,1]],[[0,2,2,1,0],[0,3,1,2,1],[1,4,2,1,0],[2,0,3,1,0],[1,5,3,1,0],[5,0,1,3,1],[4,5,2,1,0],[3,3,3,1,0],[1,3,2,1,0],[0,1,3,1,0]],[[0,2,2,1,0],[2,1,1,3,1],[3,5,2,1,0],[0,1,2,1,0],[0,3,2,1,0],[3,1,1,2,1],[3,4,3,1,0],[4,1,2,1,0],[0,4,1,2,1],[1,5,2,1,0],[0,0,3,1,0]],[[0,2,2,1,0],[3,4,3,1,0],[5,0,1,3,1],[2,3,2,1,0],[4,3,2,1,0],[1,5,3,1,0],[3,0,1,2,1],[1,4,2,1,0],[2,0,1,3,1]],[[0,2,2,1,0],[3,1,2,1,0],[4,3,1,2,1],[2,0,1,3,1],[3,5,3,1,0],[5,0,1,3,1],[1,4,3,1,0],[0,3,2,1,0],[3,0,2,1,0]],[[0,2,2,1,0],[3,1,1,2,1],[1,0,2,1,0],[4,1,1,3,1],[3,4,3,1,0],[0,3,1,3,1],[1,5,2,1,0],[1,3,2,1,0],[0,1,3,1,0],[5,1,1,3,1],[3,5,2,1,0]],[[0,2,2,1,0],[2,4,1,2,1],[1,0,3,1,0],[4,2,1,3,1],[1,3,3,1,0],[3,5,2,1,0],[0,4,2,1,0],[3,1,1,2,1],[5,0,1,2,1],[0,1,3,1,0]],[[0,2,2,1,0],[0,0,1,2,1],[0,3,2,1,0],[4,1,1,2,1],[2,4,2,1,0],[5,2,1,3,1],[1,0,3,1,0],[4,3,1,3,1],[3,2,1,2,1],[1,4,1,2,1],[1,1,3,1,0]],[[0,2,2,1,0],[1,3,1,3,1],[3,1,2,1,0],[2,4,1,2,1],[3,2,1,2,1],[0,0,1,2,1],[3,4,3,1,0],[5,0,1,2,1],[2,1,1,2,1]],[[0,2,2,1,0],[2,3,1,2,1],[0,3,1,3,1],[0,0,1,2,1],[4,1,1,2,1],[2,0,2,1,0],[1,3,1,2,1],[3,3,1,3,1],[5,0,1,3,1],[4,4,2,1,0]],[[0,2,2,1,0],[0,3,1,3,1],[4,0,2,1,0],[2,3,3,1,0],[4,1,1,2,1],[2,4,3,1,0],[2,0,1,3,1],[3,1,1,2,1],[5,2,1,3,1],[0,1,2,1,0]],[[0,2,2,1,0],[1,3,1,2,1],[1,0,1,2,1],[5,0,1,3,1],[0,0,1,2,1],[1,5,3,1,0],[0,3,1,2,1],[2,4,3,1,0],[2,1,1,3,1],[3,0,1,2,1],[4,3,2,1,0]],[[0,2,2,1,0],[4,2,1,2,1],[3,1,1,3,1],[2,4,2,1,0],[0,5,2,1,0],[5,3,1,2,1],[2,1,1,3,1],[0,4,2,1,0],[4,1,2,1,0],[1,0,1,2,1],[2,0,3,1,0]],[[0,2,2,1,0],[0,3,2,1,0],[4,0,2,1,0],[4,4,2,1,0],[1,1,3,1,0],[4,1,1,2,1],[2,5,2,1,0],[1,0,3,1,0],[2,2,1,3,1],[5,2,1,2,1],[0,0,1,2,1]],[[0,2,2,1,0],[3,4,3,1,0],[1,0,3,1,0],[0,5,3,1,0],[2,3,1,2,1],[5,0,1,3,1],[2,1,3,1,0],[4,3,2,1,0],[3,2,1,2,1]],[[0,2,2,1,0],[3,0,1,2,1],[2,1,1,2,1],[3,4,2,1,0],[0,3,3,1,0],[4,0,1,3,1],[5,2,1,3,1],[3,5,3,1,0],[1,4,1,2,1]],[[0,2,2,1,0],[2,1,1,3,1],[3,0,2,1,0],[3,1,1,2,1],[0,5,3,1,0],[0,4,2,1,0],[5,0,1,2,1],[5,2,1,3,1],[4,4,1,2,1],[2,4,2,1,0]],[[0,2,2,1,0],[3,1,1,2,1],[2,4,2,1,0],[4,2,1,2,1],[1,5,2,1,0],[2,0,1,2,1],[2,2,1,2,1],[0,4,1,2,1],[5,2,1,2,1],[3,0,2,1,0],[0,1,2,1,0]],[[0,2,2,1,0],[4,3,1,3,1],[3,2,1,3,1],[3,0,1,2,1],[5,3,1,3,1],[2,0,1,2,1],[1,5,3,1,0],[5,1,1,2,1],[4,1,1,2,1],[4,0,2,1,0]],[[0,2,2,1,0],[1,4,3,1,0],[2,5,3,1,0],[1,0,1,2,1],[2,0,2,1,0],[3,1,3,1,0],[0,3,1,2,1],[4,2,1,2,1],[4,0,2,1,0],[5,4,1,2,1],[2,1,1,2,1]],[[0,2,2,1,0],[4,4,2,1,0],[2,1,3,1,0],[3,2,1,3,1],[0,4,1,2,1],[1,4,2,1,0],[0,0,2,1,0],[2,2,1,2,1],[3,5,3,1,0],[5,1,1,2,1],[0,3,2,1,0]],[[0,2,2,1,0],[2,5,2,1,0],[4,1,1,2,1],[0,1,2,1,0],[0,3,1,2,1],[4,0,2,1,0],[4,3,1,2,1],[1,4,3,1,0],[5,1,1,2,1],[3,1,1,3,1],[0,0,2,1,0]],[[0,2,2,1,0],[4,3,2,1,0],[1,3,3,1,0],[2,1,1,2,1],[1,0,3,1,0],[0,3,1,3,1],[2,5,3,1,0],[3,4,3,1,0],[3,1,1,2,1],[5,0,1,2,1]],[[0,2,2,1,0],[1,5,3,1,0],[5,1,1,2,1],[0,3,3,1,0],[0,0,3,1,0],[3,1,2,1,0],[5,3,1,2,1],[4,2,1,2,1],[3,2,1,3,1],[0,4,1,2,1]],[[0,2,2,1,0],[4,4,1,2,1],[4,3,2,1,0],[2,3,2,1,0],[2,1,1,2,1],[1,3,1,2,1],[2,4,2,1,0],[4,1,1,2,1],[2,0,3,1,0]]];

  let status = null;
  let blocks = [];
  let puzzleNumber = 1;
  let moveCount = 0;
  let submitting = false;
  let drag = null;
  let clockOffsetMs = 0;
  let requestNumber = 0;

  function serverNow() {
    return Date.now() + clockOffsetMs;
  }

  function setClock(value) {
    const parsed = Date.parse(value || "");
    if (Number.isFinite(parsed)) clockOffsetMs = parsed - Date.now();
  }

  function remainingSeconds(value) {
    const end = Date.parse(value || "");
    return Number.isFinite(end)
      ? Math.max(0, Math.ceil((end - serverNow()) / 1000))
      : 0;
  }

  function formatDuration(seconds) {
    const safe = Math.max(0, Math.ceil(Number(seconds) || 0));
    return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
  }

  function setProfileMessage(text, type = "") {
    statusText.textContent = text;
    statusText.classList.toggle("success", type === "success");
    statusText.classList.toggle("error", type === "error");
  }

  function renderProfile() {
    const state = status?.state || "loading";
    const boostSeconds = remainingSeconds(status?.boost_until);

    openButton.disabled = false;
    badge.textContent = status?.puzzle
      ? `Уровень ${status.puzzle}/50`
      : "1 раз в сутки";

    if (state === "available") {
      setProfileMessage("Сегодня игра ещё не пройдена. Победи и сразу получи ускорение.");
      openButton.textContent = "🎮 ИГРАТЬ";
      return;
    }

    if (state === "started") {
      setProfileMessage("Игра дня начата. Можно продолжить до победы.");
      openButton.textContent = "▶ ПРОДОЛЖИТЬ";
      return;
    }

    if (state === "completed") {
      if (currentUserIsAdmin) {
        openButton.disabled = false;
        openButton.textContent = "🧪 ПРОВЕРИТЬ СЛЕДУЮЩИЙ УРОВЕНЬ";
        badge.textContent = `Админ · ${status.puzzle}/50`;
        setProfileMessage(
          "Режим проверки: можно проходить уровни без ограничений. Следующим откроется новый уровень.",
          "success"
        );
        return;
      }

      openButton.disabled = true;
      openButton.textContent = "✓ СЕГОДНЯ ПРОЙДЕНО";
      badge.textContent = boostSeconds > 0
        ? `⚡ ${formatDuration(boostSeconds)}`
        : "Завтра новая игра";
      setProfileMessage(
        boostSeconds > 0
          ? `Победа! Турбокисть активна ещё ${formatDuration(boostSeconds)}.`
          : "Сегодняшняя награда уже использована. Новая игра появится после 00:00.",
        "success"
      );
      return;
    }

    openButton.disabled = true;
    openButton.textContent = "НЕДОСТУПНО";
  }

  async function loadStatus() {
    if (!currentUser) return;
    const userId = currentUser.id;
    const ownRequest = ++requestNumber;
    openButton.disabled = true;
    openButton.textContent = "ЗАГРУЗКА…";
    setProfileMessage("Проверяем игру дня…");

    const { data, error } = await supabaseClient.rpc("get_unblock_me_status");

    if (!currentUser || currentUser.id !== userId || ownRequest !== requestNumber) return;

    if (error) {
      console.error("UNBLOCK ME STATUS ERROR:", error);
      status = null;
      setProfileMessage("Мини-игра пока недоступна: требуется установить обновление базы.", "error");
      openButton.disabled = true;
      openButton.textContent = "НЕДОСТУПНО";
      return;
    }

    setClock(data?.server_now);
    status = data || null;
    renderProfile();
  }

  function clonePuzzle(number) {
    const source = PUZZLE_LAYOUTS[number - 1] || PUZZLE_LAYOUTS[0];
    return source.map((item, index) => ({
      id: index === 0 ? "target" : `block-${index}`,
      x: item[0],
      y: item[1],
      width: item[2],
      height: item[3],
      axis: item[4] === 0 ? "horizontal" : "vertical",
      target: index === 0
    }));
  }

  function updateMoves() {
    movesText.textContent = `Ходов: ${moveCount}`;
  }

  function intersects(first, second, x = first.x, y = first.y) {
    return !(
      x + first.width <= second.x ||
      x >= second.x + second.width ||
      y + first.height <= second.y ||
      y >= second.y + second.height
    );
  }

  function canPlace(block, x, y) {
    if (
      x < 0 || y < 0 ||
      x + block.width > 6 ||
      y + block.height > 6
    ) {
      return false;
    }

    return !blocks.some(other =>
      other !== block && intersects(block, other, x, y)
    );
  }

  function moveToward(block, desired) {
    const property = block.axis === "horizontal" ? "x" : "y";
    const start = block[property];
    const direction = Math.sign(desired - start);
    let next = start;

    while (next !== desired) {
      const candidate = next + direction;
      const x = property === "x" ? candidate : block.x;
      const y = property === "y" ? candidate : block.y;
      if (!canPlace(block, x, y)) break;
      next = candidate;
    }

    block[property] = next;
  }

  function positionBlock(element, block) {
    element.style.left = `${block.x * 100 / 6}%`;
    element.style.top = `${block.y * 100 / 6}%`;
    element.style.width = `${block.width * 100 / 6}%`;
    element.style.height = `${block.height * 100 / 6}%`;
  }

  function renderBoard() {
    board.replaceChildren();

    blocks.forEach(block => {
      const element = document.createElement("div");
      element.className =
        `unblock-block ${block.axis}${block.target ? " target" : ""}`;
      element.dataset.blockId = block.id;
      element.setAttribute(
        "aria-label",
        block.target ? "Красный блок — выведи его вправо" : "Подвижный блок"
      );
      positionBlock(element, block);
      board.append(element);
    });
  }

  function resetBoard() {
    blocks = clonePuzzle(puzzleNumber);
    moveCount = 0;
    submitting = false;
    drag = null;
    updateMoves();
    message.className = "unblock-message";
    message.textContent =
      "Перетаскивай горизонтальные блоки влево и вправо, вертикальные — вверх и вниз.";
    resetButton.disabled = false;
    renderBoard();
  }

  function targetIsFree() {
    const target = blocks.find(block => block.target);
    return Boolean(target && target.x + target.width === 6);
  }

  async function finishGame() {
    if (submitting) return;
    submitting = true;
    resetButton.disabled = true;
    message.className = "unblock-message";
    message.textContent = "Проверяем победу и выдаём Турбокисть…";

    const { data, error } = await supabaseClient.rpc(
      "finish_unblock_me",
      { p_moves: moveCount }
    );

    if (error || !data?.success) {
      console.error("UNBLOCK ME FINISH ERROR:", error);
      submitting = false;
      resetButton.disabled = false;
      message.className = "unblock-message error";
      message.textContent = String(error?.message || "").includes("TOO_FAST")
        ? "Слишком быстро для проверки. Подожди несколько секунд и передвинь красный блок ещё раз."
        : "Не удалось сохранить победу. Проверь интернет и попробуй ещё раз.";
      return;
    }

    setClock(data.server_now);
    status = {
      ...(status || {}),
      state: "completed",
      completed_at: data.server_now,
      move_count: data.move_count || moveCount,
      boost_until: data.boost_until,
      server_now: data.server_now
    };
    renderProfile();
    message.className = "unblock-message success";
    message.textContent =
      "Победа! ⚡ Турбокисть уже включена на 10 минут. Можно возвращаться на карту.";
    resetButton.disabled = true;
  }

  function handlePointerDown(event) {
    if (submitting || status?.state === "completed") return;
    const element = event.target.closest(".unblock-block");
    if (!element) return;
    const block = blocks.find(item => item.id === element.dataset.blockId);
    if (!block) return;

    event.preventDefault();
    element.setPointerCapture?.(event.pointerId);
    element.classList.add("dragging");
    drag = {
      pointerId: event.pointerId,
      block,
      element,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: block.x,
      startY: block.y
    };
  }

  function handlePointerMove(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    event.preventDefault();

    const cellSize = board.getBoundingClientRect().width / 6;
    const delta = drag.block.axis === "horizontal"
      ? event.clientX - drag.startClientX
      : event.clientY - drag.startClientY;
    const origin = drag.block.axis === "horizontal" ? drag.startX : drag.startY;
    const desired = Math.round(origin + delta / cellSize);

    moveToward(drag.block, desired);
    positionBlock(drag.element, drag.block);
  }

  function finishPointer(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const changed = drag.block.x !== drag.startX || drag.block.y !== drag.startY;
    drag.element.classList.remove("dragging");
    drag = null;

    if (!changed) return;
    moveCount += 1;
    updateMoves();

    if (targetIsFree()) {
      finishGame();
    }
  }

  async function openGame() {
    if (!currentUser) return;

    const adminReplay =
      status?.state === "completed" &&
      currentUserIsAdmin;

    if (status?.state === "completed" && !adminReplay) return;

    openButton.disabled = true;
    openButton.textContent = "ОТКРЫВАЕМ…";

    const nextPuzzle =
      (Math.max(1, Number(status?.puzzle) || 1) % 50) + 1;

    const { data, error } = adminReplay
      ? await supabaseClient.rpc(
          "admin_restart_unblock_me",
          { p_puzzle: nextPuzzle }
        )
      : await supabaseClient.rpc("start_unblock_me");

    if (error || !data?.success) {
      console.error("UNBLOCK ME START ERROR:", error);
      setProfileMessage(
        adminReplay
          ? "Не удалось включить режим проверки. Выполни дополнительный SQL для администратора."
          : "Не удалось начать игру. Попробуй ещё раз.",
        "error"
      );
      openButton.disabled = false;
      openButton.textContent = "🎮 ИГРАТЬ";
      return;
    }

    setClock(data.server_now);
    status = {
      ...(status || {}),
      ...data
    };

    if (status.state === "completed") {
      renderProfile();
      return;
    }

    puzzleNumber = Math.max(1, Math.min(50, Number(data.puzzle) || 1));
    resetBoard();
    renderProfile();
    dialog.showModal();
  }

  openButton.addEventListener("click", openGame);
  closeButton.addEventListener("click", () => dialog.close());
  resetButton.addEventListener("click", resetBoard);
  dialog.addEventListener("click", event => {
    if (event.target === dialog) dialog.close();
  });
  board.addEventListener("pointerdown", handlePointerDown);
  board.addEventListener("pointermove", handlePointerMove);
  board.addEventListener("pointerup", finishPointer);
  board.addEventListener("pointercancel", finishPointer);

  setInterval(() => {
    if (status?.state === "completed") renderProfile();
  }, 1000);

  return {
    loadStatus,
    reset() {
      requestNumber++;
      status = null;
      blocks = [];
      if (dialog.open) dialog.close();
      openButton.disabled = true;
      openButton.textContent = "ЗАГРУЗКА…";
      setProfileMessage("Проверяем игру дня…");
    }
  };
})();

initializeAuth();
subscribeToPixels();
subscribeToChat();


// ---------- ADMIN PROMO CODES ----------

const adminPromoCodes = (() => {
  const tab = document.getElementById("admin-promos-tab");
  const content = document.getElementById("admin-promos-content");
  const form = document.getElementById("admin-promo-form");
  const codeInput = document.getElementById("admin-promo-code");
  const generateButton = document.getElementById("admin-promo-generate");
  const titleInput = document.getElementById("admin-promo-title");
  const durationInput = document.getElementById("admin-promo-duration");
  const cooldownInput = document.getElementById("admin-promo-cooldown");
  const usesInput = document.getElementById("admin-promo-uses");
  const validDaysInput = document.getElementById("admin-promo-valid-days");
  const submitButton = document.getElementById("admin-promo-submit");
  const message = document.getElementById("admin-promo-message");
  const createdBox = document.getElementById("admin-promo-created");
  const createdCode = document.getElementById("admin-promo-created-code");
  const copyButton = document.getElementById("admin-promo-copy");
  const list = document.getElementById("admin-promo-list");

  if (!tab || !content || !form || !list) {
    return { load() {} };
  }

  function generateCode() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const values = new Uint32Array(12);
    crypto.getRandomValues(values);
    const randomPart = Array.from(
      values,
      value => alphabet[value % alphabet.length]
    ).join("");

    codeInput.value = `PIXEL-${randomPart}`;
  }

  function formatDuration(totalSeconds) {
    const minutes = Math.round(Number(totalSeconds || 0) / 60);
    if (minutes < 60) return `${minutes} мин.`;
    const hours = minutes / 60;
    return Number.isInteger(hours)
      ? `${hours} ч.`
      : `${hours.toFixed(1)} ч.`;
  }

  function formatDate(value) {
    if (!value) return "Без срока";
    return new Intl.DateTimeFormat("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(value));
  }

  function statusInfo(status) {
    const values = {
      active: ["Активен", "active"],
      used: ["Использован", "used"],
      expired: ["Истёк", "expired"],
      disabled: ["Отключён", "disabled"]
    };
    return values[status] || ["Неизвестно", "disabled"];
  }

  function setMessage(text, isError = false) {
    message.textContent = text;
    message.classList.toggle("error", isError);
  }

  function render(codes) {
    list.innerHTML = "";

    if (!Array.isArray(codes) || codes.length === 0) {
      const empty = document.createElement("p");
      empty.className = "admin-promo-empty";
      empty.textContent = "Промокодов пока нет.";
      list.appendChild(empty);
      return;
    }

    for (const promo of codes) {
      const card = document.createElement("article");
      card.className = "admin-promo-item";

      const header = document.createElement("div");
      header.className = "admin-promo-item-header";

      const name = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = promo.title || "Промокод";
      const hint = document.createElement("span");
      hint.textContent = promo.code_hint || "Код скрыт";
      name.append(title, hint);

      const [statusText, statusClass] = statusInfo(promo.status);
      const status = document.createElement("span");
      status.className = `admin-promo-status ${statusClass}`;
      status.textContent = statusText;

      header.append(name, status);

      const details = document.createElement("div");
      details.className = "admin-promo-details";
      details.innerHTML = [
        `<span>⚡ ${Number(promo.cooldown_seconds)} сек.</span>`,
        `<span>⏱ ${formatDuration(promo.duration_seconds)}</span>`,
        `<span>👤 ${Number(promo.redemption_count)} / ${Number(promo.max_redemptions)}</span>`,
        `<span>📅 ${formatDate(promo.expires_at)}</span>`
      ].join("");

      const actions = document.createElement("div");
      actions.className = "admin-promo-actions";

      if (promo.status === "active") {
        const disableButton = document.createElement("button");
        disableButton.type = "button";
        disableButton.dataset.promoId = String(promo.id);
        disableButton.dataset.promoActive = "false";
        disableButton.textContent = "ОТКЛЮЧИТЬ";
        actions.appendChild(disableButton);
      } else if (promo.status === "disabled") {
        const enableButton = document.createElement("button");
        enableButton.type = "button";
        enableButton.dataset.promoId = String(promo.id);
        enableButton.dataset.promoActive = "true";
        enableButton.textContent = "ВКЛЮЧИТЬ";
        actions.appendChild(enableButton);
      }

      card.append(header, details, actions);
      list.appendChild(card);
    }
  }

  async function load() {
    if (!currentUserIsAdmin) return;

    list.innerHTML = '<p class="admin-promo-empty">Загрузка…</p>';

    const { data, error } = await supabaseClient.rpc(
      "admin_get_promo_codes"
    );

    if (error) {
      console.error("ADMIN PROMO LIST ERROR:", error);
      list.innerHTML =
        '<p class="admin-promo-empty error">Не удалось загрузить промокоды.</p>';
      return;
    }

    render(data?.codes || []);
  }

  function open() {
    if (!currentUserIsAdmin) return;

    document.querySelectorAll(
      "#admin-overview-content, #admin-students-content, " +
      "#admin-invites-content, #admin-classes-content, " +
      "#admin-seasons-content, #admin-promos-content"
    ).forEach(section => section.classList.add("hidden"));

    document.querySelectorAll(".admin-tab").forEach(
      item => item.classList.remove("active")
    );

    content.classList.remove("hidden");
    tab.classList.add("active");
    load();
  }

  tab.addEventListener("click", open);

  document.querySelectorAll(".admin-tab").forEach(otherTab => {
    if (otherTab !== tab) {
      otherTab.addEventListener("click", () => {
        content.classList.add("hidden");
        tab.classList.remove("active");
      });
    }
  });

  generateButton?.addEventListener("click", generateCode);

  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (!currentUserIsAdmin || submitButton.disabled) return;

    const durationMinutes = Number(durationInput.value);
    const cooldownSeconds = Number(cooldownInput.value);
    const maxRedemptions = Number(usesInput.value);
    const validDays = Number(validDaysInput.value);

    submitButton.disabled = true;
    submitButton.textContent = "СОЗДАЁМ…";
    createdBox.classList.add("hidden");
    setMessage("");

    const { data, error } = await supabaseClient.rpc(
      "admin_create_promo_code",
      {
        p_code: codeInput.value.trim(),
        p_title: titleInput.value.trim(),
        p_duration_seconds: Math.round(durationMinutes * 60),
        p_cooldown_seconds: cooldownSeconds,
        p_max_redemptions: maxRedemptions,
        p_valid_days: validDays
      }
    );

    submitButton.disabled = false;
    submitButton.textContent = "СОЗДАТЬ ПРОМОКОД";

    if (error) {
      console.error("ADMIN PROMO CREATE ERROR:", error);
      setMessage(
        error.message?.includes("INVALID_PROMO_FORMAT")
          ? "Код: только латинские буквы, цифры и дефис; минимум 6 символов."
          : "Не удалось создать промокод. Проверь настройки.",
        true
      );
      return;
    }

    if (!data?.success) {
      setMessage(
        data?.reason === "CODE_ALREADY_EXISTS"
          ? "Такой промокод уже существует."
          : "Не удалось создать промокод.",
        true
      );
      return;
    }

    createdCode.textContent = data.code;
    createdBox.classList.remove("hidden");
    setMessage("Промокод создан. Скопируй его сейчас — позже будет видна только часть кода.");
    generateCode();
    await load();
  });

  copyButton?.addEventListener("click", async () => {
    const code = createdCode.textContent.trim();
    if (!code) return;

    try {
      await navigator.clipboard.writeText(code);
      copyButton.textContent = "✅ СКОПИРОВАНО";
      setTimeout(() => {
        copyButton.textContent = "📋 КОПИРОВАТЬ";
      }, 1600);
    } catch (error) {
      setMessage("Не удалось скопировать автоматически. Скопируй код вручную.", true);
    }
  });

  list.addEventListener("click", async event => {
    const actionButton = event.target.closest("[data-promo-id]");
    if (!actionButton || actionButton.disabled) return;

    const nextActive = actionButton.dataset.promoActive === "true";
    const question = nextActive
      ? "Снова разрешить активацию этого промокода?"
      : "Отключить новые активации этого промокода? Уже запущенные бонусы продолжат работать.";

    if (!window.confirm(question)) return;

    actionButton.disabled = true;

    const { error } = await supabaseClient.rpc(
      "admin_set_promo_active",
      {
        p_promo_id: Number(actionButton.dataset.promoId),
        p_active: nextActive
      }
    );

    if (error) {
      console.error("ADMIN PROMO TOGGLE ERROR:", error);
      setMessage("Не удалось изменить статус промокода.", true);
    }

    await load();
  });

  if (!codeInput.value) generateCode();
  return { load, open };
})();

// ---------- PROMO CODES ----------

const promoCodes = (() => {
  const form = document.getElementById("promo-code-form");
  const input = document.getElementById("promo-code-input");
  const button = document.getElementById("promo-code-submit");
  const statusElement = document.getElementById("promo-code-status");
  const messageElement = document.getElementById("promo-code-message");

  if (!form || !input || !button || !statusElement || !messageElement) {
    return { load() {} };
  }

  let activeUntil = 0;
  let lastUserId = null;
  let loading = false;

  function formatDuration(totalSeconds) {
    const seconds = Math.max(0, Math.floor(totalSeconds));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const rest = seconds % 60;

    return [
      hours > 0 ? String(hours).padStart(2, "0") : null,
      String(minutes).padStart(2, "0"),
      String(rest).padStart(2, "0")
    ].filter(Boolean).join(":");
  }

  function renderStatus() {
    const remaining = Math.max(0, Math.ceil((activeUntil - Date.now()) / 1000));

    if (remaining > 0) {
      statusElement.classList.add("active");
      statusElement.textContent =
        `⚡ Пиксельный час активен · ${formatDuration(remaining)} · 1 пиксель/сек`;
      input.disabled = true;
      button.disabled = true;
      button.textContent = "БОНУС АКТИВЕН";
      return;
    }

    activeUntil = 0;
    statusElement.classList.remove("active");
    statusElement.textContent = "Введи одноразовый код и получи указанный бонус.";
    input.disabled = false;
    button.disabled = false;
    button.textContent = "АКТИВИРОВАТЬ";
  }

  function showMessage(text, isError = false) {
    messageElement.textContent = text;
    messageElement.classList.toggle("error", isError);
  }

  async function load() {
    if (!currentUser || loading) {
      if (!currentUser) {
        activeUntil = 0;
        showMessage("");
        renderStatus();
      }
      return;
    }

    loading = true;
    const { data, error } = await supabaseClient.rpc("get_my_promo_status");
    loading = false;

    if (error) {
      console.error("PROMO STATUS ERROR:", error);
      showMessage("Промокоды пока недоступны.", true);
      return;
    }

    activeUntil = data?.active && data?.benefit_until
      ? Date.parse(data.benefit_until)
      : 0;
    renderStatus();
  }

  function reasonMessage(reason) {
    const messages = {
      INVALID_CODE: "Такого промокода нет. Проверь символы и попробуй снова.",
      CODE_INACTIVE: "Этот промокод отключён.",
      CODE_EXPIRED: "Срок действия промокода закончился.",
      CODE_ALREADY_USED: "Этот одноразовый промокод уже использован.",
      PROMO_ALREADY_ACTIVE: "У тебя уже действует бонус от промокода.",
      ALREADY_REDEEMED: "Ты уже использовал этот промокод."
    };

    return messages[reason] || "Не удалось активировать промокод.";
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();

    if (!currentUser || button.disabled) return;

    const code = input.value.trim();
    if (code.length < 6) {
      showMessage("Введи промокод полностью.", true);
      return;
    }

    button.disabled = true;
    button.textContent = "ПРОВЕРЯЕМ…";
    showMessage("");

    const { data, error } = await supabaseClient.rpc(
      "redeem_promo_code",
      { p_code: code }
    );

    if (error) {
      console.error("PROMO REDEEM ERROR:", error);
      showMessage("Не удалось проверить промокод. Попробуй ещё раз.", true);
      renderStatus();
      return;
    }

    if (!data?.success) {
      showMessage(reasonMessage(data?.reason), true);
      renderStatus();
      return;
    }

    activeUntil = Date.parse(data.benefit_until);
    input.value = "";
    showMessage("Промокод принят! Пиксельный час начался.", false);

    cooldownRemaining = 0;
    clearInterval(cooldownTimer);
    updateCooldown();
    renderStatus();
  });

  setInterval(() => {
    const userId = currentUser?.id || null;

    if (userId !== lastUserId) {
      lastUserId = userId;
      load();
    }

    renderStatus();
  }, 1000);

  renderStatus();
  return { load };
})();

// ---------- BACKGROUND MUSIC ----------

(() => {
  const audio = document.getElementById("background-music");
  const button = document.getElementById("music-toggle");

  if (!audio || !button) return;

  const enabledStorageKey = "pixelBattleMusicEnabled";
  const positionStorageKey = "pixelBattleMusicPosition:lofi-capy-v1";
  let lastSavedSecond = -1;

  audio.volume = 0.35;

  function isEnabled() {
    return localStorage.getItem(enabledStorageKey) === "true";
  }

  function savePosition() {
    if (!Number.isFinite(audio.currentTime)) return;

    const currentSecond = Math.floor(audio.currentTime);
    if (currentSecond === lastSavedSecond) return;

    lastSavedSecond = currentSecond;
    localStorage.setItem(positionStorageKey, String(audio.currentTime));
  }

  function restorePosition() {
    const savedPosition = Number(localStorage.getItem(positionStorageKey));
    if (!Number.isFinite(savedPosition) || savedPosition < 0) return;

    const restoredPosition = Number.isFinite(audio.duration) && audio.duration > 0
      ? savedPosition % audio.duration
      : savedPosition;

    try {
      audio.currentTime = restoredPosition;
      lastSavedSecond = Math.floor(restoredPosition);
    } catch (error) {
      console.warn("Не удалось восстановить позицию музыки.");
    }
  }

  function updateButton() {
    const playing = !audio.paused;
    button.classList.toggle("is-playing", playing);
    button.setAttribute("aria-pressed", String(playing));
    button.innerHTML = playing
      ? '<span aria-hidden="true">🔊</span><span class="music-toggle-label">Музыка</span>'
      : '<span aria-hidden="true">🔇</span><span class="music-toggle-label">Музыка</span>';
    button.title = playing
      ? "Выключить музыку — Lofi Tunes of Capy"
      : "Включить музыку — Lofi Tunes of Capy";
  }

  async function startMusic() {
    try {
      await audio.play();
      localStorage.setItem(enabledStorageKey, "true");
    } catch (error) {
      console.warn("Браузер ожидает нажатия пользователя для запуска музыки.");
    }
    updateButton();
  }

  button.addEventListener("click", async () => {
    if (audio.paused) {
      await startMusic();
      return;
    }

    savePosition();
    audio.pause();
    localStorage.setItem(enabledStorageKey, "false");
    updateButton();
  });

  audio.addEventListener("loadedmetadata", restorePosition);
  audio.addEventListener("timeupdate", savePosition);
  audio.addEventListener("play", updateButton);
  audio.addEventListener("pause", () => {
    savePosition();
    updateButton();
  });
  window.addEventListener("pagehide", savePosition);

  if (isEnabled()) {
    document.addEventListener("pointerdown", event => {
      if (!button.contains(event.target) && audio.paused) startMusic();
    }, { once: true });
  }

  updateButton();
})();


/* ---------- UNIFIED ADMIN NAVIGATION ---------- */

(() => {
  const tabs = Array.from(
    document.querySelectorAll(".admin-tab[data-admin-target]")
  );
  const panels = Array.from(
    document.querySelectorAll("[data-admin-panel]")
  );

  if (!tabs.length || !panels.length) return;

  function activateAdminPanel(tab) {
    const targetId = tab.dataset.adminTarget;
    const targetPanel = document.getElementById(targetId);

    if (!targetPanel) return;

    panels.forEach(panel => {
      panel.classList.toggle("hidden", panel !== targetPanel);
      panel.setAttribute("aria-hidden", panel === targetPanel ? "false" : "true");
    });

    tabs.forEach(item => {
      const isActive = item === tab;
      item.classList.toggle("active", isActive);
      item.setAttribute("aria-selected", isActive ? "true" : "false");
      item.tabIndex = isActive ? 0 : -1;
    });

    tab.closest(".admin-tab-group")?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest"
    });
  }

  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      activateAdminPanel(tab);
    }, true);

    tab.addEventListener("keydown", event => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;

      event.preventDefault();
      const direction = event.key === "ArrowRight" ? 1 : -1;
      const currentIndex = tabs.indexOf(tab);
      const nextTab = tabs[
        (currentIndex + direction + tabs.length) % tabs.length
      ];

      nextTab.focus();
      nextTab.click();
    });
  });

  const initialTab = tabs.find(tab => tab.classList.contains("active")) || tabs[0];
  activateAdminPanel(initialTab);
})();


/* ---------- USER AGREEMENT ---------- */

(() => {
  const AGREEMENT_VERSION = "1.0";
  const dialog =
    document.getElementById("user-agreement-dialog");
  const checkbox =
    document.getElementById("user-agreement-checkbox");
  const acceptButton =
    document.getElementById("user-agreement-accept");

  if (!dialog || !checkbox || !acceptButton) return;

  function storageKey() {
    const userId = currentUser?.id || "guest";
    return `pixel-battle-agreement:${AGREEMENT_VERSION}:${userId}`;
  }

  window.showUserAgreementIfNeeded = () => {
    if (
      !currentUser ||
      localStorage.getItem(storageKey()) === "accepted"
    ) {
      return;
    }

    checkbox.checked = false;
    acceptButton.disabled = true;

    if (!dialog.open) {
      dialog.showModal();
    }
  };

  checkbox.addEventListener("change", () => {
    acceptButton.disabled = !checkbox.checked;
  });

  acceptButton.addEventListener("click", () => {
    if (!checkbox.checked || !currentUser) return;

    localStorage.setItem(storageKey(), "accepted");
    dialog.close();
  });

  dialog.addEventListener("cancel", event => {
    event.preventDefault();
  });

  dialog.addEventListener("click", event => {
    if (event.target === dialog) {
      event.preventDefault();
    }
  });
})();


/* ---------- MODERATION REPORTS ---------- */
(function moderationReportsModule() {
  const dialog=document.getElementById("moderation-report-dialog");
  const form=document.getElementById("moderation-report-form");
  const reason=document.getElementById("moderation-report-reason");
  const details=document.getElementById("moderation-report-details");
  const targetText=document.getElementById("moderation-report-target");
  const message=document.getElementById("moderation-report-message");
  const submit=document.getElementById("moderation-report-submit");
  let target=null;
  const labels={bullying:"Оскорбление или травля",inappropriate:"Непристойный контент",personal_data:"Чужие личные данные",spam:"Спам или намеренная порча",cheating:"Нечестная игра",other:"Другое нарушение"};
  window.openModerationReportDialog=value=>{
    if(!currentUser||!dialog||!value)return;
    target=value;reason.value="";details.value="";message.textContent="";message.classList.remove("error");
    targetText.textContent=value.type==="chat"?"Сообщение: "+String(value.label||"").slice(0,180):"Пиксель: X "+value.x+", Y "+value.y;
    if(!dialog.open)dialog.showModal();
  };
  document.getElementById("moderation-report-close")?.addEventListener("click",()=>dialog.close());
  dialog?.addEventListener("click",event=>{
    if(event.target!==dialog)return;
    const r=dialog.getBoundingClientRect();
    if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();
  });
  document.getElementById("pixel-report-button")?.addEventListener("click",()=>{
    if(selectedX===null||selectedY===null||!activeSeason)return;
    window.openModerationReportDialog({type:"pixel",seasonId:activeSeason.id,x:selectedX,y:selectedY});
  });
  form?.addEventListener("submit",async event=>{
    event.preventDefault();if(!target||!reason.value)return;
    submit.disabled=true;submit.textContent="ОТПРАВЛЯЕМ…";message.textContent="";
    const chat=target.type==="chat";
    const args=chat?{p_message_id:target.messageId,p_reason:reason.value,p_details:details.value.trim()}:{p_season_id:target.seasonId,p_x:target.x,p_y:target.y,p_reason:reason.value,p_details:details.value.trim()};
    const {data,error}=await supabaseClient.rpc(chat?"create_chat_report":"create_pixel_report",args);
    submit.disabled=false;submit.textContent="ОТПРАВИТЬ ЖАЛОБУ";
    if(error||!data?.success){
      const code=String(data?.error||error?.message||"");
      message.textContent=code.includes("DUPLICATE")?"Вы уже отправляли жалобу на этот объект.":code.includes("LIMIT")?"Слишком много жалоб. Попробуйте позже.":code.includes("OWN")?"Нельзя пожаловаться на собственный контент.":"Не удалось отправить жалобу.";
      message.classList.add("error");return;
    }
    message.textContent="Жалоба отправлена администратору.";
    setTimeout(()=>dialog.close(),900);
  });

  const adminTab=document.getElementById("admin-reports-tab");
  const filter=document.getElementById("admin-reports-status");
  const list=document.getElementById("admin-reports-list");
  const count=document.getElementById("admin-reports-count");
  const statusNames={open:"Ожидает",resolved:"Рассмотрено",dismissed:"Отклонено"};

  function addBox(card,className,text){
    const box=document.createElement("div");box.className=className;box.textContent=text;card.appendChild(box);return box;
  }
  function render(reports){
    list.replaceChildren();count.textContent=reports.length.toLocaleString("ru-RU");
    if(!reports.length){list.innerHTML='<p class="admin-reports-empty">Жалоб с таким статусом нет.</p>';return;}
    reports.forEach(item=>{
      const card=document.createElement("article");card.className="admin-report-card";
      const header=document.createElement("div");header.className="admin-report-header";
      const title=document.createElement("div"),strong=document.createElement("strong"),date=document.createElement("span"),badge=document.createElement("span");
      strong.textContent=item.target_type==="chat"?"💬 Сообщение":"🎨 Пиксель";date.textContent=new Date(item.created_at).toLocaleString("ru-RU");
      badge.className="admin-report-status "+item.status;badge.textContent=statusNames[item.status]||item.status;
      title.append(strong,date);header.append(title,badge);card.appendChild(header);
      addBox(card,"admin-report-meta","Жалоба от: "+item.reporter_nickname+" ("+item.reporter_username+") · Автор: "+(item.target_nickname||"неизвестно")+" ("+(item.target_username||"—")+")");
      const reasonBox=addBox(card,"admin-report-reason",labels[item.reason]||item.reason);
      if(item.details){const p=document.createElement("p");p.textContent=item.details;reasonBox.appendChild(p);}
      addBox(card,"admin-report-evidence",item.target_type==="chat"?"Сообщение: "+(item.content_snapshot||"недоступно"):"Координаты: X "+item.pixel_x+", Y "+item.pixel_y+" · Цвет: "+(item.pixel_color||"—")+" · Класс: "+(item.target_class_name||"—"));
      if(item.status==="open"){
        const actions=document.createElement("div");actions.className="admin-report-actions";
        [["✓ РАССМОТРЕНО","resolved"],["ОТКЛОНИТЬ","dismissed"]].forEach(pair=>{
          const button=document.createElement("button");button.type="button";button.textContent=pair[0];
          button.addEventListener("click",async()=>{
            const note=prompt("Комментарий администратора (необязательно):","");if(note===null)return;
            actions.querySelectorAll("button").forEach(b=>b.disabled=true);
            const {data,error}=await supabaseClient.rpc("admin_review_moderation_report",{p_report_id:item.report_id,p_status:pair[1],p_note:note.trim()});
            if(error||!data?.success){alert("Не удалось сохранить решение.");actions.querySelectorAll("button").forEach(b=>b.disabled=false);return;}
            await load();
          });actions.appendChild(button);
        });card.appendChild(actions);
      }else if(item.admin_note){addBox(card,"admin-report-note","Комментарий администратора: "+item.admin_note);}
      list.appendChild(card);
    });
  }
  async function load(){
    if(!currentUserIsAdmin)return;
    list.innerHTML='<p class="admin-reports-empty">Загрузка…</p>';
    const {data,error}=await supabaseClient.rpc("admin_get_moderation_reports",{p_status:filter.value});
    if(error){list.innerHTML='<p class="admin-reports-empty error">Не удалось загрузить жалобы.</p>';return;}
    render(data?.reports||[]);
  }
  adminTab?.addEventListener("click",load);
  filter?.addEventListener("change",load);
  document.getElementById("admin-reports-refresh")?.addEventListener("click",load);
})();
