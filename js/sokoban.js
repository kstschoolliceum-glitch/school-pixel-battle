/* -------------------------
   ИГРА «ЯЩИКИ» (SOKOBAN)
------------------------- */

const sokobanGame = (() => {
  const profileCard = document.getElementById("sokoban-profile");
  const statusText = document.getElementById("sokoban-profile-status");
  const openButton = document.getElementById("sokoban-open");
  const badge = document.getElementById("sokoban-badge");
  const dialog = document.getElementById("sokoban-dialog");
  const closeButton = document.getElementById("sokoban-close");
  const board = document.getElementById("sokoban-board");
  const movesText = document.getElementById("sokoban-moves");
  const message = document.getElementById("sokoban-message");
  const resetButton = document.getElementById("sokoban-reset");
  const directionButtons = Array.from(document.querySelectorAll("[data-sokoban-direction]"));

  if (
    !profileCard || !statusText || !openButton || !badge || !dialog ||
    !closeButton || !board || !movesText || !message || !resetButton
  ) {
    return { loadStatus() {}, reset() {} };
  }

  let status = null;
  let busy = false;
  let serverOffsetMs = 0;
  let requestNumber = 0;

  function setClock(serverNow) {
    const parsed = Date.parse(serverNow || "");
    serverOffsetMs = Number.isFinite(parsed) ? parsed - Date.now() : 0;
  }

  function remainingSeconds(value) {
    const target = Date.parse(value || "");
    if (!Number.isFinite(target)) return 0;
    return Math.max(0, Math.ceil((target - (Date.now() + serverOffsetMs)) / 1000));
  }

  function formatDuration(totalSeconds) {
    const totalMinutes = Math.max(1, Math.ceil((Number(totalSeconds) || 0) / 60));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return hours > 0
      ? `${hours} ч. ${minutes} мин.`
      : `${minutes} мин.`;
  }

  function setMessage(text, type = "") {
    message.textContent = text;
    message.classList.toggle("success", type === "success");
    message.classList.toggle("error", type === "error");
  }

  function renderProfile() {
    const completed = Number(status?.completed_in_reward) || 0;
    const boostSeconds = remainingSeconds(status?.boost_until);
    const retrySeconds = remainingSeconds(status?.next_available_at);

    statusText.classList.remove("error");

    if (retrySeconds > 0) {
      badge.textContent = `Через ${formatDuration(retrySeconds)}`;
      openButton.disabled = true;
      openButton.textContent = `СНОВА ЧЕРЕЗ ${formatDuration(retrySeconds)}`;
      statusText.classList.add("success");
      statusText.textContent = boostSeconds > 0
        ? `Турбокисть активна ещё ${formatDuration(boostSeconds)}. Новая игра через ${formatDuration(retrySeconds)}.`
        : `Следующая игра станет доступна через ${formatDuration(retrySeconds)}.`;
      return;
    }

    badge.textContent = `${completed} из 3`;
    openButton.disabled = !status || busy;
    openButton.textContent = status ? "📦 ИГРАТЬ" : "ЗАГРУЗКА…";
    statusText.classList.toggle("success", boostSeconds > 0);
    statusText.textContent = boostSeconds > 0
      ? `Турбокисть активна ещё ${formatDuration(boostSeconds)}.`
      : `До следующей Турбокисти: ${3 - completed} ур.`;
  }

  function renderBoard() {
    if (!status?.layout) return;
    const rows = Array.isArray(status.layout) ? status.layout : [];
    const boxes = Array.isArray(status.boxes) ? status.boxes : [];
    const boxKeys = new Set(boxes.map(item => `${item.r}:${item.c}`));
    const fragment = document.createDocumentFragment();
    board.style.gridTemplateColumns = `repeat(${rows[0]?.length || 1}, 1fr)`;
    board.style.gridTemplateRows = `repeat(${rows.length || 1}, 1fr)`;

    rows.forEach((row, r) => {
      Array.from(row).forEach((symbol, col) => {
        const cell = document.createElement("div");
        const target = symbol === "." || symbol === "+" || symbol === "*";
        const hasBox = boxKeys.has(`${r}:${col}`);
        cell.className = "sokoban-cell";
        if (symbol === "#") cell.classList.add("wall");
        if (target) cell.classList.add("target");
        if (hasBox) cell.classList.add("box");
        if (hasBox && target) cell.classList.add("box-on-target");
        if (Number(status.player_row) === r && Number(status.player_col) === col) {
          cell.classList.add("player");
        }
        fragment.appendChild(cell);
      });
    });

    board.replaceChildren(fragment);
    movesText.textContent = `Ходов: ${Number(status.move_count) || 0}`;
  }

  function applyStatus(data) {
    if (!data) return;
    setClock(data.server_now);
    status = data;
    renderProfile();
    renderBoard();
  }

  async function loadStatus() {
    if (!currentUser) return;
    const userId = currentUser.id;
    const ownRequest = ++requestNumber;
    openButton.disabled = true;
    openButton.textContent = "ЗАГРУЗКА…";
    statusText.textContent = "Загружаем прогресс…";

    const { data, error } = await supabaseClient.rpc("get_sokoban_status");
    if (!currentUser || currentUser.id !== userId || ownRequest !== requestNumber) return;

    if (error) {
      console.error("SOKOBAN STATUS ERROR:", error);
      status = null;
      statusText.textContent = "Не удалось загрузить игру. Проверь обновление базы и попробуй снова.";
      statusText.classList.add("error");
      openButton.disabled = false;
      openButton.textContent = "↻ ПОВТОРИТЬ ЗАГРУЗКУ";
      return;
    }

    applyStatus(data);
  }

  async function move(direction) {
    if (!status || busy || remainingSeconds(status.next_available_at) > 0) return;
    busy = true;
    directionButtons.forEach(button => button.disabled = true);

    const { data, error } = await supabaseClient.rpc("move_sokoban", {
      p_direction: direction
    });

    busy = false;
    directionButtons.forEach(button => button.disabled = false);

    if (error) {
      console.error("SOKOBAN MOVE ERROR:", error);
      setMessage("Не удалось сохранить ход. Попробуй ещё раз.", "error");
      return;
    }

    if (!data?.success) {
      if (data?.error === "GAME_COOLDOWN") {
        setClock(data.server_now);
        status.next_available_at = data.next_available_at;
        renderProfile();
        setMessage("Игра пока закрыта — дождись окончания таймера.", "error");
        return;
      }
      if (data?.error !== "BLOCKED") setMessage("Этот ход сейчас недоступен.", "error");
      return;
    }

    applyStatus(data);

    if (data.level_completed) {
      if (data.reward_granted) {
        setMessage("Три уровня пройдены! Турбокисть включена на 15 минут. Новая игра — через 4 часа.", "success");
        setTimeout(() => {
          if (dialog.open) dialog.close();
        }, 1600);
        resetPixelCooldownAfterReward();
      } else {
        setMessage(
          `Уровень пройден! До Турбокисти осталось ${3 - Number(data.completed_in_reward)}.`,
          "success"
        );
      }
    } else {
      setMessage("Поставь все ящики на зелёные клетки.");
    }
  }

  async function resetLevel() {
    if (!currentUser || busy) return;
    busy = true;
    resetButton.disabled = true;
    setMessage("Возвращаем ящики на исходные места…");

    const { data, error } = await supabaseClient.rpc("reset_sokoban_level");
    busy = false;
    resetButton.disabled = false;

    if (error || !data?.success) {
      console.error("SOKOBAN RESET ERROR:", error);
      setMessage("Не удалось начать уровень заново.", "error");
      return;
    }

    applyStatus(data);
    setMessage("Уровень начат заново.");
  }

  openButton.addEventListener("click", async () => {
    if (!status) await loadStatus();
    if (!status || remainingSeconds(status.next_available_at) > 0) return;
    document.getElementById("fifteen-dialog")?.close();
    renderBoard();
    setMessage("Нажимай стрелки. Ящик можно только толкать.");
    if (!dialog.open) dialog.showModal();
  });

  closeButton.addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", event => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (
      event.clientX < bounds.left || event.clientX > bounds.right ||
      event.clientY < bounds.top || event.clientY > bounds.bottom
    ) dialog.close();
  });

  directionButtons.forEach(button => {
    button.addEventListener("click", () => move(button.dataset.sokobanDirection));
  });

  let swipeStart = null;

  board.addEventListener("pointerdown", event => {
    swipeStart = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY
    };
    board.setPointerCapture?.(event.pointerId);
  });

  board.addEventListener("pointerup", event => {
    if (!swipeStart || swipeStart.id !== event.pointerId || busy) {
      swipeStart = null;
      return;
    }

    const dx = event.clientX - swipeStart.x;
    const dy = event.clientY - swipeStart.y;
    swipeStart = null;

    if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return;

    if (Math.abs(dx) > Math.abs(dy)) {
      move(dx > 0 ? "right" : "left");
    } else {
      move(dy > 0 ? "down" : "up");
    }
  });

  board.addEventListener("pointercancel", () => {
    swipeStart = null;
  });

  document.addEventListener("keydown", event => {
    if (!dialog.open || busy) return;
    const directions = {
      ArrowUp: "up",
      ArrowDown: "down",
      ArrowLeft: "left",
      ArrowRight: "right"
    };
    const direction = directions[event.key];
    if (!direction) return;
    event.preventDefault();
    move(direction);
  });

  resetButton.addEventListener("click", resetLevel);

  setInterval(() => {
    if (!document.hidden && status) renderProfile();
  }, 1000);

  function reset() {
    status = null;
    busy = false;
    requestNumber += 1;
    badge.textContent = "0 из 3";
    statusText.textContent = "Загружаем прогресс…";
    statusText.classList.remove("success", "error");
    openButton.disabled = true;
    openButton.textContent = "ЗАГРУЗКА…";
    board.replaceChildren();
    if (dialog.open) dialog.close();
  }

  return { loadStatus, reset };
})();
