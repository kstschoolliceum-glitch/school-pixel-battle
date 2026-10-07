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

const placeButtonLabel = document.getElementById("place-button-label");
const placeButtonSwatch = document.getElementById("place-button-swatch");

function setPlaceButtonLabel(text) {
  if (placeButtonLabel) placeButtonLabel.textContent = text;
}

function showPixelPlacementFeedback(captured = false) {
  if (!selectionIndicator) return;
  selectionIndicator.classList.remove("pixel-place-success", "pixel-place-capture");
  void selectionIndicator.offsetWidth;
  selectionIndicator.classList.add(captured ? "pixel-place-capture" : "pixel-place-success");
  window.setTimeout(() => selectionIndicator.classList.remove("pixel-place-success", "pixel-place-capture"), 240);
}

function showPlacementError() {
  placeButton.classList.remove("pixel-action-error");
  void placeButton.offsetWidth;
  placeButton.classList.add("pixel-action-error");
  window.setTimeout(() => placeButton.classList.remove("pixel-action-error"), 260);
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
    showPlacementError();
    return;
  }


  if (cooldownRemaining > 0) {
    showPlacementError();
    return;
  }


  placeButton.disabled = true;
  const previousOwner = pixelOwners[selectedIndex];
  const ownClass = document.getElementById("profile-class")?.textContent?.trim();
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
    showPlacementError();

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
    showPlacementError();

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

  if (selectedX === data.x && selectedY === data.y) {
    showPixelPlacementFeedback(Boolean(previousOwner && ownClass && previousOwner !== ownClass));
  }

  startCooldown(Number(data.cooldown) || COOLDOWN_SECONDS);

  scheduleRankingRefresh();
  updateDisplayedProfileAfterPixel();
}

placeButton.addEventListener(
  "click",
  placePixel
);

// Disabled controls do not dispatch click; pointerdown still gives a brief visual hint.
placeButton.addEventListener("pointerdown", () => {
  if (placeButton.disabled && (cooldownRemaining > 0 || selectedX === null || selectedY === null)) {
    showPlacementError();
  }
});


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

    setPlaceButtonLabel(`ПОДОЖДИТЕ ${cooldownRemaining} СЕК.`);

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

    setPlaceButtonLabel("ВЫБЕРИТЕ ПИКСЕЛЬ");

    return;
  }


  /*
   * Можно ставить пиксель.
   */

  placeButton.disabled = false;

  setPlaceButtonLabel("ПОСТАВИТЬ ПИКСЕЛЬ");

}

if (placeButtonSwatch) placeButtonSwatch.style.backgroundColor = selectedColor;
