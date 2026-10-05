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

function enablePlayerCardLink(element, userId) {
  if (!element || !userId) return;
  element.classList.add("player-card-link");
  element.dataset.playerCardUserId = String(userId);
  element.setAttribute("role", "button");
  element.setAttribute("tabindex", "0");
  element.setAttribute("title", "Открыть визитку игрока");
}

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
const PIXEL_COLOR_DATA = Object.freeze([
  { color: "#ffffff", name: "Белый", group: "Основные" },
  { color: "#ef4444", name: "Красный", group: "Основные" },
  { color: "#f97316", name: "Оранжевый", group: "Основные" },
  { color: "#facc15", name: "Жёлтый", group: "Основные" },
  { color: "#22c55e", name: "Зелёный", group: "Основные" },
  { color: "#06b6d4", name: "Бирюзовый", group: "Основные" },
  { color: "#3b82f6", name: "Синий", group: "Основные" },
  { color: "#8b5cf6", name: "Фиолетовый", group: "Основные" },
  { color: "#ec4899", name: "Розовый", group: "Основные" },
  { color: "#111111", name: "Чёрный", group: "Основные" },
  { color: "#92400e", name: "Коричневый", group: "Основные" },
  { color: "#fb923c", name: "Светло-оранжевый", group: "Основные" },
  { color: "#f472b6", name: "Светло-розовый", group: "Основные" },
  { color: "#a78bfa", name: "Сиреневый", group: "Основные" },
  { color: "#38bdf8", name: "Голубой", group: "Основные" },
  { color: "#84cc16", name: "Лаймовый", group: "Основные" },
  { color: "#cbd5e1", name: "Светло-серый", group: "Основные" },
  { color: "#475569", name: "Тёмно-серый", group: "Основные" },
  { color: "#fff1f2", name: "Красный 50", group: "Красные" },
  { color: "#ffe4e6", name: "Красный 100", group: "Красные" },
  { color: "#fecdd3", name: "Красный 200", group: "Красные" },
  { color: "#fda4af", name: "Красный 300", group: "Красные" },
  { color: "#fb7185", name: "Красный 400", group: "Красные" },
  { color: "#e11d48", name: "Малиновый 600", group: "Красные" },
  { color: "#be123c", name: "Малиновый 700", group: "Красные" },
  { color: "#881337", name: "Бордовый", group: "Красные" },
  { color: "#fee2e2", name: "Алый 100", group: "Красные" },
  { color: "#fecaca", name: "Алый 200", group: "Красные" },
  { color: "#fca5a5", name: "Алый 300", group: "Красные" },
  { color: "#f87171", name: "Алый 400", group: "Красные" },
  { color: "#dc2626", name: "Алый 600", group: "Красные" },
  { color: "#b91c1c", name: "Алый 700", group: "Красные" },
  { color: "#7f1d1d", name: "Тёмно-красный", group: "Красные" },
  { color: "#fff7ed", name: "Оранжевый 50", group: "Тёплые" },
  { color: "#ffedd5", name: "Оранжевый 100", group: "Тёплые" },
  { color: "#fed7aa", name: "Оранжевый 200", group: "Тёплые" },
  { color: "#fdba74", name: "Оранжевый 300", group: "Тёплые" },
  { color: "#ea580c", name: "Оранжевый 600", group: "Тёплые" },
  { color: "#c2410c", name: "Оранжевый 700", group: "Тёплые" },
  { color: "#7c2d12", name: "Тёмно-оранжевый", group: "Тёплые" },
  { color: "#fefce8", name: "Жёлтый 50", group: "Тёплые" },
  { color: "#fef9c3", name: "Жёлтый 100", group: "Тёплые" },
  { color: "#fef08a", name: "Жёлтый 200", group: "Тёплые" },
  { color: "#fde047", name: "Жёлтый 300", group: "Тёплые" },
  { color: "#eab308", name: "Жёлтый 500", group: "Тёплые" },
  { color: "#ca8a04", name: "Жёлтый 600", group: "Тёплые" },
  { color: "#854d0e", name: "Тёмно-жёлтый", group: "Тёплые" },
  { color: "#f0fdf4", name: "Зелёный 50", group: "Зелёные" },
  { color: "#dcfce7", name: "Зелёный 100", group: "Зелёные" },
  { color: "#bbf7d0", name: "Зелёный 200", group: "Зелёные" },
  { color: "#86efac", name: "Зелёный 300", group: "Зелёные" },
  { color: "#4ade80", name: "Зелёный 400", group: "Зелёные" },
  { color: "#16a34a", name: "Зелёный 600", group: "Зелёные" },
  { color: "#15803d", name: "Зелёный 700", group: "Зелёные" },
  { color: "#14532d", name: "Тёмно-зелёный", group: "Зелёные" },
  { color: "#ecfccb", name: "Лайм 100", group: "Зелёные" },
  { color: "#d9f99d", name: "Лайм 200", group: "Зелёные" },
  { color: "#bef264", name: "Лайм 300", group: "Зелёные" },
  { color: "#65a30d", name: "Лайм 600", group: "Зелёные" },
  { color: "#3f6212", name: "Тёмный лайм", group: "Зелёные" },
  { color: "#ecfeff", name: "Бирюзовый 50", group: "Холодные" },
  { color: "#cffafe", name: "Бирюзовый 100", group: "Холодные" },
  { color: "#a5f3fc", name: "Бирюзовый 200", group: "Холодные" },
  { color: "#67e8f9", name: "Бирюзовый 300", group: "Холодные" },
  { color: "#22d3ee", name: "Бирюзовый 400", group: "Холодные" },
  { color: "#0891b2", name: "Бирюзовый 600", group: "Холодные" },
  { color: "#155e75", name: "Тёмно-бирюзовый", group: "Холодные" },
  { color: "#f0f9ff", name: "Небесный 50", group: "Холодные" },
  { color: "#e0f2fe", name: "Небесный 100", group: "Холодные" },
  { color: "#bae6fd", name: "Небесный 200", group: "Холодные" },
  { color: "#7dd3fc", name: "Небесный 300", group: "Холодные" },
  { color: "#0ea5e9", name: "Небесный 500", group: "Холодные" },
  { color: "#0284c7", name: "Небесный 600", group: "Холодные" },
  { color: "#075985", name: "Тёмно-голубой", group: "Холодные" },
  { color: "#eff6ff", name: "Синий 50", group: "Холодные" },
  { color: "#dbeafe", name: "Синий 100", group: "Холодные" },
  { color: "#bfdbfe", name: "Синий 200", group: "Холодные" },
  { color: "#93c5fd", name: "Синий 300", group: "Холодные" },
  { color: "#60a5fa", name: "Синий 400", group: "Холодные" },
  { color: "#2563eb", name: "Синий 600", group: "Холодные" },
  { color: "#1d4ed8", name: "Синий 700", group: "Холодные" },
  { color: "#1e3a8a", name: "Тёмно-синий", group: "Холодные" },
  { color: "#f5f3ff", name: "Фиолетовый 50", group: "Фиолетовые" },
  { color: "#ede9fe", name: "Фиолетовый 100", group: "Фиолетовые" },
  { color: "#ddd6fe", name: "Фиолетовый 200", group: "Фиолетовые" },
  { color: "#c4b5fd", name: "Фиолетовый 300", group: "Фиолетовые" },
  { color: "#7c3aed", name: "Фиолетовый 600", group: "Фиолетовые" },
  { color: "#6d28d9", name: "Фиолетовый 700", group: "Фиолетовые" },
  { color: "#4c1d95", name: "Тёмно-фиолетовый", group: "Фиолетовые" },
  { color: "#fdf2f8", name: "Розовый 50", group: "Фиолетовые" },
  { color: "#fce7f3", name: "Розовый 100", group: "Фиолетовые" },
  { color: "#fbcfe8", name: "Розовый 200", group: "Фиолетовые" },
  { color: "#f9a8d4", name: "Розовый 300", group: "Фиолетовые" },
  { color: "#db2777", name: "Розовый 600", group: "Фиолетовые" },
  { color: "#be185d", name: "Розовый 700", group: "Фиолетовые" },
  { color: "#831843", name: "Тёмно-розовый", group: "Фиолетовые" },
  { color: "#fffbeb", name: "Золотой 50", group: "Земляные" },
  { color: "#fef3c7", name: "Золотой 100", group: "Земляные" },
  { color: "#fde68a", name: "Золотой 200", group: "Земляные" },
  { color: "#fbbf24", name: "Золотой 400", group: "Земляные" },
  { color: "#f59e0b", name: "Янтарный 500", group: "Земляные" },
  { color: "#d97706", name: "Янтарный 600", group: "Земляные" },
  { color: "#b45309", name: "Коричневый 600", group: "Земляные" },
  { color: "#78350f", name: "Коричневый 800", group: "Земляные" },
  { color: "#451a03", name: "Тёмно-коричневый", group: "Земляные" },
  { color: "#f8fafc", name: "Холодный белый", group: "Нейтральные" },
  { color: "#f1f5f9", name: "Серый 100", group: "Нейтральные" },
  { color: "#e2e8f0", name: "Серый 200", group: "Нейтральные" },
  { color: "#94a3b8", name: "Серый 400", group: "Нейтральные" },
  { color: "#64748b", name: "Серый 500", group: "Нейтральные" },
  { color: "#334155", name: "Серый 700", group: "Нейтральные" },
  { color: "#1e293b", name: "Серый 800", group: "Нейтральные" },
  { color: "#0f172a", name: "Серый 900", group: "Нейтральные" }
]);

const COLORS =
  PIXEL_COLOR_DATA.map(
    item => item.color
  );

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

// Application features are loaded from /js in index.html.
