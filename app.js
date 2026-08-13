const SUPABASE_URL =
  "https://rfhrqjowxwxpaqmjoikn.supabase.co";

const SUPABASE_KEY =
  "sb_publishable_SictxwPd578IRmRLeoDzBw_7kEG-Y8-";

const supabaseClient =
  window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
  );

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


function placePixel() {

  if (
    selectedX === null ||
    selectedY === null
  ) {
    return;
  }

  if (cooldownRemaining > 0) {
    return;
  }

  const index =
    selectedY * MAP_WIDTH +
    selectedX;

  const colorIndex =
    getColorIndex(selectedColor);

  pixels[index] = colorIndex;

  pixelCount++;

  pixelCountText.textContent =
    pixelCount.toLocaleString("ru-RU");

  drawMap();

  startCooldown();

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
