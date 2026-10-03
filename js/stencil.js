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
