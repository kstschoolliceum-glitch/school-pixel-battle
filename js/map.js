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


/* -------------------------
   ПОЛЬЗОВАТЕЛЬСКИЙ ТРАФАРЕТ
------------------------- */

let pixelOwnerRequestNumber = 0;

async function loadAdminPixelOwner(
  x,
  y,
  owner,
  requestNumber
) {
  if (
    !currentUserIsAdmin ||
    !activeSeason?.id
  ) {
    return;
  }

  const { data, error } =
    await supabaseClient.rpc(
      "admin_get_pixel_owner",
      {
        p_season_id: activeSeason.id,
        p_x: x,
        p_y: y
      }
    );

  if (
    error ||
    requestNumber !== pixelOwnerRequestNumber ||
    selectedX !== x ||
    selectedY !== y
  ) {
    if (error) {
      console.warn(
        "ADMIN PIXEL OWNER ERROR:",
        error
      );
    }
    return;
  }

  if (data?.success && data.nickname) {
    pixelOwner.textContent =
      `🏫 ${owner} · 👤 ${data.nickname}`;
    pixelOwner.title =
      data.username
        ? `${data.nickname} (${data.username})`
        : data.nickname;
  }
}

function setPixelInformation(x = null, y = null, owner = "") {
  const reportButton =
    document.getElementById("pixel-report-button");
  const requestNumber =
    ++pixelOwnerRequestNumber;

  pixelOwner.title = "";

  if (x === null || y === null) {
    coordinatePosition.textContent = "Выберите пиксель";
    pixelOwner.textContent = "";
    reportButton?.classList.add("hidden");
    return;
  }

  coordinatePosition.textContent = `X: ${x}  Y: ${y}`;
  const mapItem = window.mapItems?.describeCell(x, y);
  pixelOwner.textContent = mapItem?.type === "bomb"
    ? "💥 След пиксельной бомбы · подрывник неизвестен"
    : mapItem?.type === "beacon"
      ? `📍 ${mapItem.label} · ${mapItem.class_name || "Без класса"}`
      : owner ? `🏫 ${owner}` : "Свободная клетка";
  reportButton?.classList.toggle("hidden", !owner);

  if (currentUserIsAdmin && (owner || mapItem?.type === "bomb")) {
    loadAdminPixelOwner(
      x,
      y,
      owner || "💥 Бомба",
      requestNumber
    );
  }
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

const PALETTE_GROUP_ORDER = [
  "Основные",
  "Красные",
  "Тёплые",
  "Зелёные",
  "Холодные",
  "Фиолетовые",
  "Земляные",
  "Нейтральные"
];

const PALETTE_COLOR_GROUPS =
  PALETTE_GROUP_ORDER.map(
    title => ({
      title,
      colors:
        PIXEL_COLOR_DATA
          .filter(
            item =>
              item.group === title
          )
          .map(
            item => [
              item.color,
              item.name
            ]
          )
    })
  );

const PALETTE_RECENT_KEY =
  "pixelBattleRecentColors";

const paletteColorNames =
  new Map(
    PALETTE_COLOR_GROUPS.flatMap(
      group => group.colors
    )
  );

const colorButtons =
  Array.from(
    document.querySelectorAll(
      ".color[data-color]"
    )
  );

const colorPaletteOpen =
  document.getElementById(
    "color-palette-open"
  );

const colorPaletteDialog =
  document.getElementById(
    "color-palette-dialog"
  );

const colorPaletteClose =
  document.getElementById(
    "color-palette-close"
  );

const colorPaletteGroups =
  document.getElementById(
    "color-palette-groups"
  );

const colorPaletteTabs =
  document.getElementById(
    "color-palette-tabs"
  );

const colorPaletteRecentSection =
  document.getElementById(
    "color-palette-recent-section"
  );

const colorPaletteRecent =
  document.getElementById(
    "color-palette-recent"
  );

const colorPaletteSelectedSwatch =
  document.getElementById(
    "color-palette-selected-swatch"
  );

const colorPaletteSelectedName =
  document.getElementById(
    "color-palette-selected-name"
  );

const colorPaletteSelectedCode =
  document.getElementById(
    "color-palette-selected-code"
  );

const colorPaletteButtonSwatch =
  document.getElementById(
    "color-palette-button-swatch"
  );

function loadRecentPaletteColors() {
  try {
    const stored =
      JSON.parse(
        localStorage.getItem(
          PALETTE_RECENT_KEY
        ) || "[]"
      );

    return Array.isArray(stored)
      ? stored.filter(
          color =>
            COLORS.includes(color)
        ).slice(0, 6)
      : [];
  } catch {
    return [];
  }
}

let recentPaletteColors =
  loadRecentPaletteColors();

function saveRecentPaletteColor(color) {
  recentPaletteColors = [
    color,
    ...recentPaletteColors.filter(
      item => item !== color
    )
  ].slice(0, 6);

  try {
    localStorage.setItem(
      PALETTE_RECENT_KEY,
      JSON.stringify(
        recentPaletteColors
      )
    );
  } catch {
    // Палитра продолжит работать без localStorage.
  }
}

function createPaletteOption(
  color,
  name,
  compact = false
) {
  const button =
    document.createElement("button");

  button.type = "button";
  button.className =
    "color-palette-option";

  if (compact) {
    button.classList.add(
      "is-compact"
    );
  }

  button.dataset.color = color;
  button.title = name;
  button.setAttribute(
    "aria-label",
    `Выбрать цвет: ${name}`
  );

  const swatch =
    document.createElement("i");

  swatch.style.backgroundColor =
    color;

  const label =
    document.createElement("span");

  label.textContent = name;

  button.append(
    swatch,
    label
  );

  button.addEventListener(
    "click",
    () => {
      selectPaletteColor(
        color,
        {
          remember: true,
          closeDialog: true
        }
      );
    }
  );

  return button;
}

function renderRecentPaletteColors() {
  colorPaletteRecent?.replaceChildren();

  colorPaletteRecentSection?.classList.toggle(
    "hidden",
    recentPaletteColors.length === 0
  );

  for (
    const color
    of recentPaletteColors
  ) {
    colorPaletteRecent?.appendChild(
      createPaletteOption(
        color,
        paletteColorNames.get(color) ||
          color.toUpperCase(),
        true
      )
    );
  }
}

function updatePaletteSelection() {
  const name =
    paletteColorNames.get(
      selectedColor
    ) || selectedColor.toUpperCase();

  let quickColorSelected = false;

  colorButtons.forEach(button => {
    const active =
      button.dataset.color ===
      selectedColor;

    button.classList.toggle(
      "active",
      active
    );

    button.setAttribute(
      "aria-pressed",
      active ? "true" : "false"
    );

    if (active) {
      quickColorSelected = true;
    }
  });

  colorPaletteOpen?.classList.toggle(
    "active",
    !quickColorSelected
  );

  if (colorPaletteSelectedSwatch) {
    colorPaletteSelectedSwatch
      .style.backgroundColor =
        selectedColor;
  }

  if (colorPaletteButtonSwatch) {
    colorPaletteButtonSwatch
      .style.backgroundColor =
        selectedColor;
  }

  if (colorPaletteSelectedName) {
    colorPaletteSelectedName.textContent =
      name;
  }

  if (colorPaletteSelectedCode) {
    colorPaletteSelectedCode.textContent =
      selectedColor.toUpperCase();
  }

  colorPaletteOpen?.setAttribute(
    "aria-label",
    `Открыть палитру. Выбран цвет: ${name}`
  );

  document
    .querySelectorAll(
      ".color-palette-option"
    )
    .forEach(button => {
      const active =
        button.dataset.color ===
        selectedColor;

      button.classList.toggle(
        "active",
        active
      );

      button.setAttribute(
        "aria-pressed",
        active ? "true" : "false"
      );
    });
}

function selectPaletteColor(
  color,
  {
    remember = true,
    closeDialog = false
  } = {}
) {
  if (!COLORS.includes(color)) {
    return;
  }

  selectedColor = color;

  if (remember) {
    saveRecentPaletteColor(color);
    renderRecentPaletteColors();
  }

  updatePaletteSelection();

  if (
    closeDialog &&
    colorPaletteDialog?.open
  ) {
    colorPaletteDialog.close();
  }
}

let activePaletteGroup =
  "Основные";

function activatePaletteGroup(
  groupTitle
) {
  if (
    !PALETTE_GROUP_ORDER.includes(
      groupTitle
    )
  ) {
    groupTitle = "Основные";
  }

  activePaletteGroup =
    groupTitle;

  document
    .querySelectorAll(
      "[data-palette-group]"
    )
    .forEach(section => {
      section.hidden =
        section.dataset.paletteGroup !==
        activePaletteGroup;
    });

  document
    .querySelectorAll(
      "[data-palette-tab]"
    )
    .forEach(button => {
      const active =
        button.dataset.paletteTab ===
        activePaletteGroup;

      button.classList.toggle(
        "active",
        active
      );

      button.setAttribute(
        "aria-selected",
        active ? "true" : "false"
      );
    });
}

for (
  const group
  of PALETTE_COLOR_GROUPS
) {
  const tab =
    document.createElement("button");

  tab.type = "button";
  tab.className =
    "color-palette-tab";
  tab.dataset.paletteTab =
    group.title;
  tab.setAttribute(
    "role",
    "tab"
  );
  tab.textContent =
    group.title;

  tab.addEventListener(
    "click",
    () => {
      activatePaletteGroup(
        group.title
      );
    }
  );

  colorPaletteTabs?.appendChild(
    tab
  );

  const section =
    document.createElement("section");

  section.className =
    "color-palette-group";
  section.dataset.paletteGroup =
    group.title;
  section.hidden =
    group.title !==
    activePaletteGroup;

  const title =
    document.createElement("h3");

  title.textContent =
    group.title;

  const grid =
    document.createElement("div");

  grid.className =
    "color-palette-grid";

  for (
    const [color, name]
    of group.colors
  ) {
    grid.appendChild(
      createPaletteOption(
        color,
        name
      )
    );
  }

  section.append(
    title,
    grid
  );

  colorPaletteGroups?.appendChild(
    section
  );
}

colorButtons.forEach(button => {
  const color =
    button.dataset.color;

  const name =
    paletteColorNames.get(color) ||
    color.toUpperCase();

  button.type = "button";
  button.title = name;
  button.setAttribute(
    "aria-label",
    `Выбрать цвет: ${name}`
  );

  button.addEventListener(
    "click",
    () => {
      selectPaletteColor(
        color
      );
    }
  );
});

colorPaletteOpen?.addEventListener(
  "click",
  () => {
    renderRecentPaletteColors();
    updatePaletteSelection();

    const selectedData =
      PIXEL_COLOR_DATA.find(
        item =>
          item.color ===
          selectedColor
      );

    activatePaletteGroup(
      selectedData?.group ||
      activePaletteGroup
    );

    if (!colorPaletteDialog.open) {
      colorPaletteDialog.showModal();
    }
  }
);

colorPaletteClose?.addEventListener(
  "click",
  () => {
    colorPaletteDialog?.close();
  }
);

colorPaletteDialog?.addEventListener(
  "click",
  event => {
    if (
      event.target ===
      colorPaletteDialog
    ) {
      colorPaletteDialog.close();
    }
  }
);

renderRecentPaletteColors();
activatePaletteGroup(
  activePaletteGroup
);
updatePaletteSelection();


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


function showPixelUnchangedMessage() {
  cooldownText.textContent =
    "Этот цвет уже установлен";

  updatePlaceButton();

  window.setTimeout(() => {
    if (cooldownRemaining <= 0) {
      updateCooldown();
    }
  }, 1600);
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


  const selectedIndex =
    selectedY * MAP_WIDTH +
    selectedX;

  if (
    COLORS[pixels[selectedIndex]] ===
    selectedColor
  ) {
    showPixelUnchangedMessage();
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

    const errorCode =
      String(error.code || error.message || "SERVER_ERROR")
        .replace(/[^A-Za-z0-9_-]/g, "")
        .slice(0, 40) || "SERVER_ERROR";

    const errorMessage =
      String(error.message || "")
        .replace(/[\r\n]+/g, " ")
        .slice(0, 180);

    alert(
      `Не удалось поставить пиксель. Код: ${errorCode}` +
      (errorMessage ? `\n${errorMessage}` : "")
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
      data.reason === "PIXEL_UNCHANGED"
    ) {
      if (data.daily_tasks) {
        dailyTasks.applyStatus(data.daily_tasks);
      }

      showPixelUnchangedMessage();
      return;
    }

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
  dailyTasks.recordPiPixel();

  pixelCount++;

  pixelCountText.textContent =
    pixelCount.toLocaleString(
      "ru-RU"
    );


  drawMap();

  startCooldown(Number(data.cooldown) || COOLDOWN_SECONDS);

  scheduleRankingRefresh();
  updateDisplayedProfileAfterPixel();
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


function resetPixelCooldownAfterReward() {
  cooldownRemaining = 0;
  clearInterval(cooldownTimer);
  cooldownTimer = null;
  updateCooldown();
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
