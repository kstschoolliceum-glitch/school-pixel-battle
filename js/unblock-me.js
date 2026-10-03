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

  const PUZZLE_LAYOUTS = [[[0,2,2,1,0],[2,1,1,3,1],[1,0,1,2,1],[0,4,3,1,0],[3,1,1,2,1],[5,3,1,2,1],[2,0,2,1,0],[3,5,3,1,0],[4,0,1,2,1]],[[0,2,2,1,0],[2,0,1,2,1],[3,4,2,1,0],[3,2,1,2,1],[1,3,1,2,1],[2,2,1,2,1],[0,5,3,1,0],[4,1,1,3,1],[5,3,1,2,1],[3,0,3,1,0],[0,0,1,2,1]],[[0,2,2,1,0],[0,0,3,1,0],[3,1,1,2,1],[1,4,2,1,0],[5,3,1,3,1],[2,1,1,2,1],[3,3,1,2,1],[4,1,1,3,1],[2,5,3,1,0],[1,3,2,1,0],[0,4,1,2,1]],[[0,2,2,1,0],[4,5,2,1,0],[3,3,1,2,1],[0,4,3,1,0],[1,0,2,1,0],[5,0,1,2,1],[2,2,1,2,1],[3,1,1,2,1],[5,2,1,2,1],[0,0,1,2,1]],[[0,2,2,1,0],[2,1,1,3,1],[1,0,1,2,1],[1,4,3,1,0],[3,1,1,2,1],[5,3,1,2,1],[2,0,2,1,0],[3,5,3,1,0],[4,0,1,2,1]],[[0,2,2,1,0],[1,5,2,1,0],[3,3,1,2,1],[0,4,3,1,0],[1,0,2,1,0],[5,4,1,2,1],[2,1,1,2,1],[3,0,1,2,1],[5,0,1,2,1],[0,0,1,2,1]],[[0,2,2,1,0],[2,0,1,2,1],[3,4,2,1,0],[3,2,1,2,1],[1,3,1,2,1],[2,2,1,2,1],[0,5,3,1,0],[4,1,1,3,1],[5,3,1,2,1],[3,0,3,1,0],[0,3,1,2,1]],[[0,2,2,1,0],[0,0,3,1,0],[3,1,1,2,1],[1,4,2,1,0],[5,2,1,3,1],[2,1,1,2,1],[3,3,1,2,1],[4,0,1,3,1],[2,5,3,1,0],[1,3,2,1,0],[0,4,1,2,1]],[[0,2,2,1,0],[2,5,2,1,0],[3,3,1,2,1],[0,4,3,1,0],[1,0,2,1,0],[5,4,1,2,1],[2,1,1,2,1],[3,1,1,2,1],[5,0,1,2,1],[0,0,1,2,1]],[[0,2,2,1,0],[0,5,2,1,0],[3,3,1,2,1],[0,4,3,1,0],[1,0,2,1,0],[5,4,1,2,1],[2,1,1,2,1],[3,1,1,2,1],[5,0,1,2,1],[0,0,1,2,1]],[[0,2,2,1,0],[2,4,2,1,0],[2,0,1,2,1],[0,3,2,1,0],[1,4,1,2,1],[4,0,1,3,1],[3,0,1,3,1],[2,5,2,1,0],[5,2,1,3,1]],[[0,2,2,1,0],[0,0,3,1,0],[3,1,1,2,1],[1,4,2,1,0],[5,2,1,3,1],[2,1,1,2,1],[3,3,1,2,1],[4,1,1,3,1],[2,5,3,1,0],[1,3,2,1,0],[0,4,1,2,1]],[[0,2,2,1,0],[0,0,3,1,0],[3,1,1,2,1],[1,4,2,1,0],[5,0,1,3,1],[2,1,1,2,1],[3,3,1,2,1],[4,1,1,3,1],[2,5,3,1,0],[1,3,2,1,0],[0,4,1,2,1]],[[0,2,2,1,0],[0,0,3,1,0],[3,1,1,2,1],[1,4,2,1,0],[5,1,1,3,1],[2,1,1,2,1],[3,3,1,2,1],[4,0,1,3,1],[2,5,3,1,0],[1,3,2,1,0],[0,4,1,2,1]],[[0,2,2,1,0],[1,5,2,1,0],[3,3,1,2,1],[0,4,3,1,0],[1,0,2,1,0],[5,4,1,2,1],[2,1,1,2,1],[3,0,1,2,1],[5,2,1,2,1],[0,0,1,2,1]],[[0,2,2,1,0],[0,0,3,1,0],[3,0,1,2,1],[1,4,2,1,0],[5,3,1,3,1],[2,1,1,2,1],[3,3,1,2,1],[4,0,1,3,1],[2,5,3,1,0],[1,3,2,1,0],[0,4,1,2,1]],[[0,2,2,1,0],[2,5,2,1,0],[3,3,1,2,1],[0,4,3,1,0],[1,0,2,1,0],[5,4,1,2,1],[2,1,1,2,1],[3,1,1,2,1],[5,2,1,2,1],[0,0,1,2,1]],[[0,2,2,1,0],[2,4,2,1,0],[2,0,1,2,1],[0,3,2,1,0],[1,4,1,2,1],[4,0,1,3,1],[3,1,1,3,1],[3,5,2,1,0],[5,3,1,3,1]],[[0,2,2,1,0],[0,0,3,1,0],[3,1,1,2,1],[1,4,2,1,0],[5,2,1,3,1],[2,1,1,2,1],[3,3,1,2,1],[4,0,1,3,1],[2,5,3,1,0],[0,3,2,1,0],[0,4,1,2,1]],[[0,2,2,1,0],[0,0,3,1,0],[3,1,1,2,1],[1,4,2,1,0],[5,2,1,3,1],[2,1,1,2,1],[3,3,1,2,1],[4,1,1,3,1],[2,5,3,1,0],[0,3,2,1,0],[0,4,1,2,1]],[[0,2,2,1,0],[2,4,2,1,0],[2,0,1,2,1],[0,3,2,1,0],[1,4,1,2,1],[4,0,1,3,1],[3,1,1,3,1],[3,5,2,1,0],[5,2,1,3,1]],[[0,2,2,1,0],[0,5,2,1,0],[3,3,1,2,1],[0,4,3,1,0],[1,0,2,1,0],[5,4,1,2,1],[2,1,1,2,1],[3,1,1,2,1],[5,1,1,2,1],[0,0,1,2,1]],[[0,2,2,1,0],[0,5,2,1,0],[3,3,1,2,1],[0,4,3,1,0],[1,0,2,1,0],[5,4,1,2,1],[2,1,1,2,1],[3,1,1,2,1],[5,2,1,2,1],[0,0,1,2,1]],[[0,2,2,1,0],[2,5,2,1,0],[3,3,1,2,1],[0,4,3,1,0],[1,0,2,1,0],[5,4,1,2,1],[2,2,1,2,1],[3,1,1,2,1],[5,2,1,2,1],[0,0,1,2,1]],[[0,2,2,1,0],[1,5,2,1,0],[3,3,1,2,1],[0,4,3,1,0],[1,0,2,1,0],[5,4,1,2,1],[2,1,1,2,1],[3,1,1,2,1],[5,2,1,2,1],[0,0,1,2,1]],[[0,2,2,1,0],[0,0,3,1,0],[3,0,1,2,1],[1,4,2,1,0],[5,2,1,3,1],[2,1,1,2,1],[3,3,1,2,1],[4,0,1,3,1],[2,5,3,1,0],[1,3,2,1,0],[0,4,1,2,1]],[[0,2,2,1,0],[0,5,2,1,0],[3,3,1,2,1],[0,4,3,1,0],[3,0,2,1,0],[5,4,1,2,1],[2,1,1,2,1],[3,1,1,2,1],[5,0,1,2,1],[0,0,1,2,1]],[[0,2,2,1,0],[0,0,3,1,0],[3,0,1,2,1],[1,4,2,1,0],[5,3,1,3,1],[2,1,1,2,1],[3,2,1,2,1],[4,0,1,3,1],[1,5,3,1,0],[0,3,2,1,0],[0,4,1,2,1]],[[0,2,2,1,0],[0,0,3,1,0],[3,0,1,2,1],[1,4,2,1,0],[5,3,1,3,1],[2,1,1,2,1],[3,2,1,2,1],[4,2,1,3,1],[2,5,3,1,0],[1,3,2,1,0],[0,4,1,2,1]],[[0,2,2,1,0],[0,5,2,1,0],[3,4,1,2,1],[0,4,3,1,0],[3,0,2,1,0],[5,4,1,2,1],[2,1,1,2,1],[3,1,1,2,1],[5,0,1,2,1],[0,0,1,2,1]],[[0,2,2,1,0],[2,4,2,1,0],[2,0,1,2,1],[0,3,2,1,0],[1,4,1,2,1],[4,0,1,3,1],[3,1,1,3,1],[3,5,2,1,0],[5,1,1,3,1]],[[0,2,2,1,0],[0,5,2,1,0],[3,4,1,2,1],[0,4,3,1,0],[1,0,2,1,0],[5,4,1,2,1],[2,1,1,2,1],[3,1,1,2,1],[5,1,1,2,1],[0,0,1,2,1]],[[0,2,2,1,0],[3,5,2,1,0],[3,3,1,2,1],[0,4,3,1,0],[3,0,2,1,0],[5,4,1,2,1],[2,1,1,2,1],[3,1,1,2,1],[5,0,1,2,1],[0,0,1,2,1]],[[0,2,2,1,0],[2,4,2,1,0],[2,1,1,2,1],[0,3,2,1,0],[1,4,1,2,1],[4,0,1,3,1],[3,1,1,3,1],[3,5,2,1,0],[5,2,1,3,1]],[[0,2,2,1,0],[3,4,2,1,0],[2,1,1,2,1],[1,3,2,1,0],[1,4,1,2,1],[4,0,1,3,1],[3,1,1,3,1],[3,5,2,1,0],[5,3,1,3,1]],[[0,2,2,1,0],[2,4,2,1,0],[2,0,1,2,1],[0,3,2,1,0],[1,4,1,2,1],[4,1,1,3,1],[3,1,1,3,1],[3,5,2,1,0],[5,1,1,3,1]],[[0,2,2,1,0],[0,0,3,1,0],[3,0,1,2,1],[1,4,2,1,0],[5,1,1,3,1],[2,1,1,2,1],[3,3,1,2,1],[4,0,1,3,1],[2,5,3,1,0],[0,3,2,1,0],[0,4,1,2,1]],[[0,2,2,1,0],[0,0,3,1,0],[3,0,1,2,1],[1,4,2,1,0],[5,2,1,3,1],[2,1,1,2,1],[3,3,1,2,1],[4,0,1,3,1],[2,5,3,1,0],[0,3,2,1,0],[0,4,1,2,1]],[[0,2,2,1,0],[3,4,2,1,0],[2,1,1,2,1],[1,3,2,1,0],[1,4,1,2,1],[4,1,1,3,1],[3,0,1,3,1],[3,5,2,1,0],[5,3,1,3,1]],[[0,2,2,1,0],[2,4,2,1,0],[2,0,1,2,1],[1,3,2,1,0],[1,4,1,2,1],[4,1,1,3,1],[3,1,1,3,1],[3,5,2,1,0],[5,1,1,3,1]],[[0,2,2,1,0],[2,5,2,1,0],[3,3,1,2,1],[0,4,3,1,0],[4,0,2,1,0],[5,4,1,2,1],[2,2,1,2,1],[3,1,1,2,1],[5,2,1,2,1],[0,0,1,2,1]],[[0,2,2,1,0],[3,4,2,1,0],[2,4,1,2,1],[1,3,2,1,0],[1,4,1,2,1],[4,0,1,3,1],[3,1,1,3,1],[3,5,2,1,0],[5,3,1,3,1]],[[0,2,2,1,0],[2,4,2,1,0],[2,1,1,2,1],[0,3,2,1,0],[1,4,1,2,1],[4,0,1,3,1],[3,1,1,3,1],[3,5,2,1,0],[5,1,1,3,1]],[[0,2,2,1,0],[3,4,2,1,0],[2,1,1,2,1],[1,3,2,1,0],[1,4,1,2,1],[4,0,1,3,1],[3,1,1,3,1],[3,5,2,1,0],[5,2,1,3,1]],[[0,2,2,1,0],[3,4,2,1,0],[2,4,1,2,1],[1,3,2,1,0],[1,4,1,2,1],[4,0,1,3,1],[3,1,1,3,1],[3,5,2,1,0],[5,1,1,3,1]],[[0,2,2,1,0],[2,4,2,1,0],[2,0,1,2,1],[0,3,2,1,0],[1,4,1,2,1],[4,1,1,3,1],[3,1,1,3,1],[3,5,2,1,0],[5,2,1,3,1]],[[0,2,2,1,0],[3,4,2,1,0],[2,1,1,2,1],[0,3,2,1,0],[1,4,1,2,1],[4,0,1,3,1],[3,1,1,3,1],[3,5,2,1,0],[5,1,1,3,1]],[[0,2,2,1,0],[3,4,2,1,0],[2,1,1,2,1],[1,3,2,1,0],[1,4,1,2,1],[4,1,1,3,1],[3,1,1,3,1],[3,5,2,1,0],[5,3,1,3,1]],[[0,2,2,1,0],[0,0,3,1,0],[3,0,1,2,1],[3,4,2,1,0],[5,2,1,3,1],[2,3,1,2,1],[3,2,1,2,1],[4,0,1,3,1],[2,5,3,1,0],[0,3,2,1,0],[0,4,1,2,1]],[[0,2,2,1,0],[0,0,3,1,0],[3,0,1,2,1],[4,4,2,1,0],[5,1,1,3,1],[2,1,1,2,1],[3,3,1,2,1],[4,0,1,3,1],[2,5,3,1,0],[0,3,2,1,0],[0,4,1,2,1]]];

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
    const totalMinutes = Math.max(1, Math.ceil((Number(seconds) || 0) / 60));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return hours > 0
      ? `${hours} ч. ${minutes} мин.`
      : `${minutes} мин.`;
  }

  function setProfileMessage(text, type = "") {
    statusText.textContent = text;
    statusText.classList.toggle("success", type === "success");
    statusText.classList.toggle("error", type === "error");
  }

  function renderProfile() {
    const state = status?.state || "loading";
    const boostSeconds = remainingSeconds(status?.boost_until);
    const retrySeconds = remainingSeconds(status?.next_available_at);

    openButton.disabled = false;
    badge.textContent = "Каждые 3 часа";

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
        openButton.textContent = "🧪 ПРОВЕРИТЬ СЛЕДУЮЩУЮ ИГРУ";
        badge.textContent = "Режим проверки";
        setProfileMessage(
          "Режим проверки: можно проходить игру без ограничений. Следующей откроется новая головоломка.",
          "success"
        );
        return;
      }

      if (retrySeconds <= 0) {
        openButton.disabled = false;
        openButton.textContent = "🎮 ИГРАТЬ СНОВА";
        badge.textContent = "Новая игра доступна";
        setProfileMessage("Прошло 3 часа — можно снова получить Турбокисть.");
        return;
      }

      openButton.disabled = true;
      openButton.textContent = `СНОВА ЧЕРЕЗ ${formatDuration(retrySeconds)}`;
      badge.textContent = boostSeconds > 0
        ? `⚡ ${formatDuration(boostSeconds)}`
        : `Через ${formatDuration(retrySeconds)}`;
      setProfileMessage(
        boostSeconds > 0
          ? `Победа! Турбокисть активна ещё ${formatDuration(boostSeconds)}. Следующая игра через ${formatDuration(retrySeconds)}.`
          : `Следующая игра станет доступна через ${formatDuration(retrySeconds)}.`,
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
      next_available_at: data.next_available_at,
      server_now: data.server_now
    };
    renderProfile();
    resetPixelCooldownAfterReward();
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

    if (
      status?.state === "completed" &&
      !adminReplay &&
      remainingSeconds(status?.next_available_at) > 0
    ) return;

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
    if (!document.hidden && status?.state === "completed") renderProfile();
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
