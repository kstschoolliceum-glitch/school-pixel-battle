/* -------------------------
   ИГРА «ПЯТНАШКИ»
------------------------- */

const fifteenGame = (() => {
  const profileCard = document.getElementById("fifteen-profile");
  const statusText = document.getElementById("fifteen-profile-status");
  const openButton = document.getElementById("fifteen-open");
  const badge = document.getElementById("fifteen-badge");
  const dialog = document.getElementById("fifteen-dialog");
  const closeButton = document.getElementById("fifteen-close");
  const board = document.getElementById("fifteen-board");
  const movesText = document.getElementById("fifteen-moves");
  const message = document.getElementById("fifteen-message");
  const resetButton = document.getElementById("fifteen-reset");

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
    const retrySeconds = remainingSeconds(status?.next_available_at);
    const boostSeconds = remainingSeconds(status?.boost_until);
    const level = Number(status?.level) || 1;

    statusText.classList.remove("error");
    badge.textContent = `Уровень ${level}`;

    if (retrySeconds > 0) {
      openButton.disabled = true;
      openButton.textContent = `СНОВА ЧЕРЕЗ ${formatDuration(retrySeconds)}`;
      statusText.classList.add("success");
      statusText.textContent = boostSeconds > 0
        ? `Турбокисть активна ещё ${formatDuration(boostSeconds)}. Новая игра через ${formatDuration(retrySeconds)}.`
        : `Следующая игра станет доступна через ${formatDuration(retrySeconds)}.`;
      return;
    }

    openButton.disabled = !status || busy;
    openButton.textContent = status ? "🧩 ИГРАТЬ" : "ЗАГРУЗКА…";
    statusText.classList.toggle("success", boostSeconds > 0);
    statusText.textContent = boostSeconds > 0
      ? `Турбокисть активна ещё ${formatDuration(boostSeconds)}.`
      : `Продолжи уровень ${level}. Прогресс сохраняется.`;
  }

  function renderBoard() {
    const tiles = Array.isArray(status?.board) ? status.board : [];
    const fragment = document.createDocumentFragment();

    tiles.forEach((value, index) => {
      const tile = document.createElement("button");
      tile.type = "button";
      tile.className = "fifteen-tile";
      tile.dataset.tileIndex = String(index);

      if (Number(value) === 0) {
        tile.classList.add("empty");
        tile.disabled = true;
        tile.setAttribute("aria-label", "Пустая клетка");
      } else {
        tile.textContent = String(value);
        tile.setAttribute("aria-label", `Плитка ${value}`);
        tile.disabled = busy;
      }

      fragment.appendChild(tile);
    });

    board.replaceChildren(fragment);
    movesText.textContent = `Ходов: ${Number(status?.move_count) || 0}`;
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
    statusText.textContent = "Загружаем головоломку…";

    const { data, error } = await supabaseClient.rpc("get_fifteen_status");
    if (!currentUser || currentUser.id !== userId || ownRequest !== requestNumber) return;

    if (error) {
      console.error("FIFTEEN STATUS ERROR:", error);
      status = null;
      statusText.textContent = "Игра станет доступна после установки обновления базы.";
      statusText.classList.add("error");
      openButton.disabled = true;
      openButton.textContent = "НЕДОСТУПНО";
      return;
    }

    applyStatus(data);
  }

  async function move(tileIndex) {
    if (!status || busy || remainingSeconds(status.next_available_at) > 0) return;
    busy = true;
    renderBoard();

    const { data, error } = await supabaseClient.rpc("move_fifteen", {
      p_tile_index: Number(tileIndex)
    });

    busy = false;

    if (error) {
      console.error("FIFTEEN MOVE ERROR:", error);
      renderBoard();
      setMessage("Не удалось сохранить ход. Попробуй ещё раз.", "error");
      return;
    }

    if (!data?.success) {
      renderBoard();
      if (data?.error === "GAME_COOLDOWN") {
        setClock(data.server_now);
        status.next_available_at = data.next_available_at;
        renderProfile();
        setMessage("Игра пока закрыта — дождись окончания таймера.", "error");
      } else if (data?.error !== "BLOCKED") {
        setMessage("Этот ход недоступен.", "error");
      }
      return;
    }

    applyStatus(data);

    if (data.level_completed) {
      setMessage("Головоломка собрана! Турбокисть включена на 20 минут.", "success");
      resetPixelCooldownAfterReward();
      setTimeout(() => {
        if (dialog.open) dialog.close();
      }, 1600);
    } else {
      setMessage("Собери последовательность от 1 до 15.");
    }
  }

  async function resetLevel() {
    if (!currentUser || busy || remainingSeconds(status?.next_available_at) > 0) return;
    busy = true;
    resetButton.disabled = true;
    setMessage("Перемешиваем уровень заново…");

    const { data, error } = await supabaseClient.rpc("reset_fifteen_level");
    busy = false;
    resetButton.disabled = false;

    if (error || !data?.success) {
      console.error("FIFTEEN RESET ERROR:", error);
      setMessage("Не удалось начать уровень заново.", "error");
      return;
    }

    applyStatus(data);
    setMessage("Уровень начат заново.");
  }

  board.addEventListener("click", event => {
    const tile = event.target.closest("[data-tile-index]");
    if (!tile || tile.disabled) return;
    move(tile.dataset.tileIndex);
  });

  openButton.addEventListener("click", async () => {
    if (!status) await loadStatus();
    if (!status || remainingSeconds(status.next_available_at) > 0) return;
    document.getElementById("sokoban-dialog")?.close();
    document.getElementById("unblock-me-dialog")?.close();
    renderBoard();
    setMessage("Нажимай на плитку рядом с пустой клеткой.");
    if (!dialog.open) dialog.showModal();
  });

  closeButton.addEventListener("click", () => dialog.close());
  resetButton.addEventListener("click", resetLevel);

  dialog.addEventListener("click", event => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (
      event.clientX < bounds.left || event.clientX > bounds.right ||
      event.clientY < bounds.top || event.clientY > bounds.bottom
    ) dialog.close();
  });

  document.addEventListener("keydown", event => {
    if (!dialog.open || busy || !status?.board) return;
    const blank = status.board.findIndex(value => Number(value) === 0);
    const row = Math.floor(blank / 4);
    const col = blank % 4;
    const targets = {
      ArrowUp: row < 3 ? blank + 4 : -1,
      ArrowDown: row > 0 ? blank - 4 : -1,
      ArrowLeft: col < 3 ? blank + 1 : -1,
      ArrowRight: col > 0 ? blank - 1 : -1
    };
    const target = targets[event.key];
    if (target === undefined || target < 0) return;
    event.preventDefault();
    move(target);
  });

  setInterval(() => {
    if (!document.hidden && status) renderProfile();
  }, 1000);

  function reset() {
    status = null;
    busy = false;
    requestNumber += 1;
    badge.textContent = "Уровень 1";
    statusText.textContent = "Загружаем головоломку…";
    statusText.classList.remove("success", "error");
    openButton.disabled = true;
    openButton.textContent = "ЗАГРУЗКА…";
    board.replaceChildren();
    if (dialog.open) dialog.close();
  }

  return { loadStatus, reset };
})();
