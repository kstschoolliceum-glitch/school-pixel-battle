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
  window.mapItems?.drawMarkers(ctx);
  updateSelectionIndicator();
}

let mapDrawFrame = 0;

function scheduleMapDraw() {
  if (mapDrawFrame) return;

  mapDrawFrame = requestAnimationFrame(() => {
    mapDrawFrame = 0;
    drawMap();
  });
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
  window.mapItems?.updateMarkers();
}
