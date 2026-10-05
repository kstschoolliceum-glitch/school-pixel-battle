const dailyTasks = (() => {
  const button = document.getElementById("daily-tasks-button");
  const dialog = document.getElementById("daily-tasks-dialog");
  const closeButton = document.getElementById("daily-tasks-close");
  const dialogContent = document.getElementById("daily-tasks-dialog-content");
  const profileHost = document.getElementById("daily-tasks-profile");
  const careerHost = document.getElementById("player-career-profile");
  const piEarnHost = document.getElementById("pi-earn-tasks");
  const todayDailyStatus = document.getElementById("today-daily-status");
  const todayEarnStatus = document.getElementById("today-earn-status");

  let status = null;
  let profile = null;
  let profileOwner = null;
  let loading = false;
  let requestNumber = 0;
  let clockOffsetMs = 0;
  let message = "";
  let messageIsError = false;
  let messageAction = "";
  let piTaskStatus = null;

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

  function renderPiCoinTasks(host) {
    const section = document.createElement("section");
    section.className = "pi-pixel-tasks";
    const heading = document.createElement("div");
    heading.className = "pi-pixel-tasks-heading";
    heading.innerHTML = "<strong>🪙 Пиксельный заработок</strong><span>Обновляется ежедневно</span>";
    const intro = document.createElement("p");
    intro.textContent = "Ставь пиксели в течение дня и забирай piCoin за каждый достигнутый этап.";
    section.append(heading, intro);

    if (!piTaskStatus) {
      const pending = document.createElement("p");
      pending.textContent = "Загружаем этапы…";
      section.append(pending);
      host.append(section);
      return;
    }

    const count = Number(piTaskStatus.pixel_count || 0);
    (piTaskStatus.stages || []).forEach(stage => {
      const target = Number(stage.target);
      const reward = Number(stage.reward);
      const claimed = Boolean(stage.claimed);
      const ready = count >= target;
      const card = document.createElement("article");
      card.className = "pi-pixel-task" + (claimed ? " claimed" : ready ? " ready" : "");
      const text = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = Math.min(count, target).toLocaleString("ru-RU") + " / " + target.toLocaleString("ru-RU") + " пикселей";
      const rewardText = document.createElement("span");
      rewardText.textContent = "Награда: " + reward + " piCoin";
      const progress = document.createElement("progress");
      progress.max = target;
      progress.value = Math.min(count, target);
      text.append(title, rewardText, progress);
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.piStage = String(stage.stage);
      button.disabled = !ready || claimed;
      button.textContent = claimed ? "ПОЛУЧЕНО ✓" : ready ? "ЗАБРАТЬ " + reward + " 🪙" : "В ПРОЦЕССЕ";
      card.append(text, button);
      section.append(card);
    });
    host.append(section);
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
      if (messageAction === "shop") {
        const shopButton = document.createElement("button");
        shopButton.type = "button";
        shopButton.dataset.dailyAction = "shop";
        shopButton.className = "daily-message-action";
        shopButton.textContent = "МАГАЗИН";
        feedback.append(shopButton);
      }
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
    if (todayDailyStatus) todayDailyStatus.textContent = completedCount() + "/3";
    if (todayEarnStatus) {
      const available = (piTaskStatus?.stages || []).filter(stage => Number(piTaskStatus?.pixel_count || 0) >= Number(stage.target) && !stage.claimed).length;
      todayEarnStatus.textContent = available ? "Доступно наград: " + available : "Открыть";
    }
    if (dialogContent) renderTaskList(dialogContent, true);
    if (profileHost) renderTaskList(profileHost, true);
    if (piEarnHost) {
      piEarnHost.replaceChildren();
      renderPiCoinTasks(piEarnHost);
    }
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
    messageAction = "";
    render();

    const [{ data, error }, { data: piData, error: piError }] = await Promise.all([
      supabaseClient.rpc("get_daily_tasks"),
      supabaseClient.rpc("get_daily_pi_coin_tasks")
    ]);

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

    if (piError) {
      console.error("PI PIXEL TASKS ERROR:", piError);
      piTaskStatus = null;
    } else {
      piTaskStatus = piData?.status || null;
    }
    setStatus(data.status);
  }

  function applyStatus(nextStatus) {
    if (!currentUser || !nextStatus) return;
    message = "";
    messageIsError = false;
    messageAction = "";
    setStatus(nextStatus);
  }

  async function claimReward() {
    message = "";
    messageAction = "";
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

  async function claimPiReward(stage) {
    messageAction = "";
    const { data, error } = await supabaseClient.rpc("claim_daily_pi_coin_stage", { p_stage: stage });
    if (error || !data?.success) {
      message = data?.error === "TARGET_NOT_REACHED" ? "Сначала выполни нужное количество установок." : "Не удалось получить piCoin.";
      messageIsError = true;
      render();
      return;
    }
    piTaskStatus = data.status;
    document.getElementById("pi-balance").textContent = Number(data.balance || 0).toLocaleString("ru-RU");
    document.getElementById("pi-shop-balance").textContent = Number(data.balance || 0).toLocaleString("ru-RU");
    message = "+" + data.reward + " 🪙 · Баланс: " + Number(data.balance || 0).toLocaleString("ru-RU") + " piCoin";
    messageIsError = false;
    messageAction = "shop";
    await piCoin.load();
    render();
  }

  async function handleAction(event) {
    const piButton = event.target.closest("[data-pi-stage]");
    if (piButton && !piButton.disabled) {
      piButton.disabled = true;
      await claimPiReward(Number(piButton.dataset.piStage));
      return;
    }
    const actionButton = event.target.closest("[data-daily-action]");
    if (!actionButton || actionButton.disabled) return;
    actionButton.disabled = true;
    if (actionButton.dataset.dailyAction === "claim") await claimReward();
    if (actionButton.dataset.dailyAction === "activate") await activateBoost();
    if (actionButton.dataset.dailyAction === "shop") await piCoin.open();
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
    piTaskStatus = null;
    profile = null;
    profileOwner = null;
    message = "";
    messageAction = "";
    if (dialog?.open) dialog.close();
    render();
  }

  document.getElementById("today-daily-button")?.addEventListener("click", () => button?.click());
  document.getElementById("today-earn-button")?.addEventListener("click", () => document.getElementById("tasks-earn-tab")?.click());
  document.getElementById("today-games-button")?.addEventListener("click", () => document.getElementById("tasks-games-tab")?.click());
  document.getElementById("today-map-button")?.addEventListener("click", () => {
    document.getElementById("mobile-map-button")?.click();
    document.querySelector(".map-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

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
  piEarnHost?.addEventListener("click", handleAction);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && currentUser) load();
  });
  setInterval(() => {
    if (effectiveRewardState() === "active" || effectiveRewardState() === "claimed") render();
  }, 1000);

  render();
  function recordPiPixel() {
    if (!piTaskStatus) return;
    piTaskStatus = { ...piTaskStatus, pixel_count: Number(piTaskStatus.pixel_count || 0) + 1 };
    render();
  }

  return { load, applyStatus, setProfile, reset, recordPiPixel };
})();

// Feature modules are loaded from /js in index.html.
