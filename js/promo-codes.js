// ---------- ADMIN PROMO CODES ----------

const adminPromoCodes = (() => {
  const tab = document.getElementById("admin-promos-tab");
  const content = document.getElementById("admin-promos-content");
  const form = document.getElementById("admin-promo-form");
  const codeInput = document.getElementById("admin-promo-code");
  const generateButton = document.getElementById("admin-promo-generate");
  const titleInput = document.getElementById("admin-promo-title");
  const rewardTypeInput = document.getElementById("admin-promo-reward-type");
  const itemTypeInput = document.getElementById("admin-promo-item-type");
  const itemQuantityInput = document.getElementById("admin-promo-item-quantity");
  const itemNames = { bomb: "💣 Бомба", beacon: "📍 Маяк", detector: "🕵️ Детектор" };
  const durationInput = document.getElementById("admin-promo-duration");
  const cooldownInput = document.getElementById("admin-promo-cooldown");
  const usesInput = document.getElementById("admin-promo-uses");
  const validDaysInput = document.getElementById("admin-promo-valid-days");
  const submitButton = document.getElementById("admin-promo-submit");
  const message = document.getElementById("admin-promo-message");
  const createdBox = document.getElementById("admin-promo-created");
  const createdCode = document.getElementById("admin-promo-created-code");
  const copyButton = document.getElementById("admin-promo-copy");
  const list = document.getElementById("admin-promo-list");

  if (!tab || !content || !form || !list) {
    return { load() {} };
  }

  function generateCode() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const values = new Uint32Array(12);
    crypto.getRandomValues(values);
    const randomPart = Array.from(
      values,
      value => alphabet[value % alphabet.length]
    ).join("");

    codeInput.value = `PIXEL-${randomPart}`;
  }

  function formatDuration(totalSeconds) {
    const minutes = Math.round(Number(totalSeconds || 0) / 60);
    if (minutes < 60) return `${minutes} мин.`;
    const hours = minutes / 60;
    return Number.isInteger(hours)
      ? `${hours} ч.`
      : `${hours.toFixed(1)} ч.`;
  }

  function formatDate(value) {
    if (!value) return "Без срока";
    return new Intl.DateTimeFormat("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(value));
  }

  function statusInfo(status) {
    const values = {
      active: ["Активен", "active"],
      used: ["Использован", "used"],
      expired: ["Истёк", "expired"],
      disabled: ["Отключён", "disabled"]
    };
    return values[status] || ["Неизвестно", "disabled"];
  }

  function setMessage(text, isError = false) {
    message.textContent = text;
    message.classList.toggle("error", isError);
  }

  function render(codes) {
    list.innerHTML = "";

    if (!Array.isArray(codes) || codes.length === 0) {
      const empty = document.createElement("p");
      empty.className = "admin-promo-empty";
      empty.textContent = "Промокодов пока нет.";
      list.appendChild(empty);
      return;
    }

    for (const promo of codes) {
      const card = document.createElement("article");
      card.className = "admin-promo-item";

      const header = document.createElement("div");
      header.className = "admin-promo-item-header";

      const name = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = promo.title || "Промокод";
      const hint = document.createElement("span");
      hint.textContent = promo.code_hint || "Код скрыт";
      name.append(title, hint);

      const [statusText, statusClass] = statusInfo(promo.status);
      const status = document.createElement("span");
      status.className = `admin-promo-status ${statusClass}`;
      status.textContent = statusText;

      header.append(name, status);

      const details = document.createElement("div");
      details.className = "admin-promo-details";
      const reward = promo.reward_type === "map_item"
        ? `${itemNames[promo.item_type] || "Предмет"} ×${Number(promo.item_quantity)}`
        : `⚡ ${Number(promo.cooldown_seconds)} сек. · ${formatDuration(promo.duration_seconds)}`;
      [reward, `👤 ${Number(promo.redemption_count)} / ${Number(promo.max_redemptions)}`,
        `📅 ${formatDate(promo.expires_at)}`].forEach(value => {
        const detail = document.createElement("span");
        detail.textContent = value;
        details.appendChild(detail);
      });

      const actions = document.createElement("div");
      actions.className = "admin-promo-actions";

      if (promo.status === "active") {
        const disableButton = document.createElement("button");
        disableButton.type = "button";
        disableButton.dataset.promoId = String(promo.id);
        disableButton.dataset.promoActive = "false";
        disableButton.textContent = "ОТКЛЮЧИТЬ";
        actions.appendChild(disableButton);
      } else if (promo.status === "disabled") {
        const enableButton = document.createElement("button");
        enableButton.type = "button";
        enableButton.dataset.promoId = String(promo.id);
        enableButton.dataset.promoActive = "true";
        enableButton.textContent = "ВКЛЮЧИТЬ";
        actions.appendChild(enableButton);
      }

      card.append(header, details, actions);
      list.appendChild(card);
    }
  }

  async function load() {
    if (!currentUserIsAdmin) return;

    list.innerHTML = '<p class="admin-promo-empty">Загрузка…</p>';

    const { data, error } = await supabaseClient.rpc(
      "admin_get_promo_codes"
    );

    if (error) {
      console.error("ADMIN PROMO LIST ERROR:", error);
      list.innerHTML =
        '<p class="admin-promo-empty error">Не удалось загрузить промокоды.</p>';
      return;
    }

    render(data?.codes || []);
  }

  function open() {
    if (!currentUserIsAdmin) return;

    document.querySelectorAll(
      "#admin-overview-content, #admin-students-content, " +
      "#admin-invites-content, #admin-classes-content, " +
      "#admin-seasons-content, #admin-promos-content"
    ).forEach(section => section.classList.add("hidden"));

    document.querySelectorAll(".admin-tab").forEach(
      item => item.classList.remove("active")
    );

    content.classList.remove("hidden");
    tab.classList.add("active");
    load();
  }

  tab.addEventListener("click", open);

  document.querySelectorAll(".admin-tab").forEach(otherTab => {
    if (otherTab !== tab) {
      otherTab.addEventListener("click", () => {
        content.classList.add("hidden");
        tab.classList.remove("active");
      });
    }
  });

  function syncRewardFields() {
    const isItem = rewardTypeInput.value === "map_item";
    form.querySelectorAll(".admin-promo-item-field").forEach(el => el.classList.toggle("hidden", !isItem));
    form.querySelectorAll(".admin-promo-hour-field").forEach(el => el.classList.toggle("hidden", isItem));
    durationInput.required = !isItem;
    itemQuantityInput.required = isItem;
    if (titleInput.value === "Пиксельный час" || /^Предмет: /.test(titleInput.value)) {
      titleInput.value = isItem ? "Предмет: " + itemNames[itemTypeInput.value] : "Пиксельный час";
    }
  }
  rewardTypeInput.addEventListener("change", syncRewardFields);
  itemTypeInput.addEventListener("change", () => {
    if (rewardTypeInput.value === "map_item" && /^Предмет: /.test(titleInput.value)) {
      titleInput.value = "Предмет: " + itemNames[itemTypeInput.value];
    }
  });
  syncRewardFields();

  generateButton?.addEventListener("click", generateCode);

  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (!currentUserIsAdmin || submitButton.disabled) return;

    const durationMinutes = Number(durationInput.value);
    const cooldownSeconds = Number(cooldownInput.value);
    const maxRedemptions = Number(usesInput.value);
    const validDays = Number(validDaysInput.value);

    const isItem = rewardTypeInput.value === "map_item";
    const itemQuantity = Number(itemQuantityInput.value);
    if (isItem && (!Number.isInteger(itemQuantity) || itemQuantity < 1 || itemQuantity > 100)) {
      setMessage("Укажи целое количество предметов от 1 до 100.", true);
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = "СОЗДАЁМ…";
    createdBox.classList.add("hidden");
    setMessage("");

    const { data, error } = await supabaseClient.rpc(
      isItem ? "admin_create_item_promo_code" : "admin_create_promo_code",
      isItem ? {
        p_code: codeInput.value.trim(),
        p_title: titleInput.value.trim(),
        p_item_type: itemTypeInput.value,
        p_item_quantity: itemQuantity,
        p_max_redemptions: maxRedemptions,
        p_valid_days: validDays
      } : {
        p_code: codeInput.value.trim(),
        p_title: titleInput.value.trim(),
        p_duration_seconds: Math.round(durationMinutes * 60),
        p_cooldown_seconds: cooldownSeconds,
        p_max_redemptions: maxRedemptions,
        p_valid_days: validDays
      }
    );

    submitButton.disabled = false;
    submitButton.textContent = "СОЗДАТЬ ПРОМОКОД";

    if (error) {
      console.error("ADMIN PROMO CREATE ERROR:", error);
      setMessage(
        error.message?.includes("INVALID_PROMO_FORMAT")
          ? "Код: только латинские буквы, цифры и дефис; минимум 6 символов."
          : "Не удалось создать промокод. Проверь настройки.",
        true
      );
      return;
    }

    if (!data?.success) {
      setMessage(
        data?.reason === "CODE_ALREADY_EXISTS"
          ? "Такой промокод уже существует."
          : "Не удалось создать промокод.",
        true
      );
      return;
    }

    createdCode.textContent = data.code;
    createdBox.classList.remove("hidden");
    setMessage("Промокод создан. Скопируй его сейчас — позже будет видна только часть кода.");
    generateCode();
    await load();
  });

  copyButton?.addEventListener("click", async () => {
    const code = createdCode.textContent.trim();
    if (!code) return;

    try {
      await navigator.clipboard.writeText(code);
      copyButton.textContent = "✅ СКОПИРОВАНО";
      setTimeout(() => {
        copyButton.textContent = "📋 КОПИРОВАТЬ";
      }, 1600);
    } catch (error) {
      setMessage("Не удалось скопировать автоматически. Скопируй код вручную.", true);
    }
  });

  list.addEventListener("click", async event => {
    const actionButton = event.target.closest("[data-promo-id]");
    if (!actionButton || actionButton.disabled) return;

    const nextActive = actionButton.dataset.promoActive === "true";
    const question = nextActive
      ? "Снова разрешить активацию этого промокода?"
      : "Отключить новые активации этого промокода? Уже запущенные бонусы продолжат работать.";

    if (!window.confirm(question)) return;

    actionButton.disabled = true;

    const { error } = await supabaseClient.rpc(
      "admin_set_promo_active",
      {
        p_promo_id: Number(actionButton.dataset.promoId),
        p_active: nextActive
      }
    );

    if (error) {
      console.error("ADMIN PROMO TOGGLE ERROR:", error);
      setMessage("Не удалось изменить статус промокода.", true);
    }

    await load();
  });

  if (!codeInput.value) generateCode();
  return { load, open };
})();

// ---------- PROMO CODES ----------

const promoCodes = (() => {
  const form = document.getElementById("promo-code-form");
  const input = document.getElementById("promo-code-input");
  const button = document.getElementById("promo-code-submit");
  const statusElement = document.getElementById("promo-code-status");
  const messageElement = document.getElementById("promo-code-message");

  if (!form || !input || !button || !statusElement || !messageElement) {
    return { load() {} };
  }

  let activeUntil = 0;
  let lastUserId = null;
  let loading = false;

  function formatDuration(totalSeconds) {
    const seconds = Math.max(0, Math.floor(totalSeconds));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const rest = seconds % 60;

    return [
      hours > 0 ? String(hours).padStart(2, "0") : null,
      String(minutes).padStart(2, "0"),
      String(rest).padStart(2, "0")
    ].filter(Boolean).join(":");
  }

  function renderStatus() {
    const remaining = Math.max(0, Math.ceil((activeUntil - Date.now()) / 1000));

    if (remaining > 0) {
      statusElement.classList.add("active");
      statusElement.textContent =
        `⚡ Пиксельный час активен · ${formatDuration(remaining)} · 1 пиксель/сек`;
      input.disabled = false;
      button.disabled = false;
      button.textContent = "АКТИВИРОВАТЬ ДРУГОЙ КОД";
      return;
    }

    activeUntil = 0;
    statusElement.classList.remove("active");
    statusElement.textContent = "Введи одноразовый код и получи указанный бонус.";
    input.disabled = false;
    button.disabled = false;
    button.textContent = "АКТИВИРОВАТЬ";
  }

  function showMessage(text, isError = false) {
    messageElement.textContent = text;
    messageElement.classList.toggle("error", isError);
  }

  async function load() {
    if (!currentUser || loading) {
      if (!currentUser) {
        activeUntil = 0;
        showMessage("");
        renderStatus();
      }
      return;
    }

    loading = true;
    const { data, error } = await supabaseClient.rpc("get_my_promo_status");
    loading = false;

    if (error) {
      console.error("PROMO STATUS ERROR:", error);
      showMessage("Промокоды пока недоступны.", true);
      return;
    }

    activeUntil = data?.active && data?.benefit_until
      ? Date.parse(data.benefit_until)
      : 0;
    renderStatus();
  }

  function reasonMessage(reason) {
    const messages = {
      INVALID_CODE: "Такого промокода нет. Проверь символы и попробуй снова.",
      CODE_INACTIVE: "Этот промокод отключён.",
      CODE_EXPIRED: "Срок действия промокода закончился.",
      CODE_ALREADY_USED: "Этот одноразовый промокод уже использован.",
      PROMO_ALREADY_ACTIVE: "У тебя уже действует бонус от промокода.",
      ALREADY_REDEEMED: "Ты уже использовал этот промокод.",
      INVENTORY_LIMIT: "Недостаточно места в инвентаре для всей награды (максимум 100 предметов каждого типа)."
    };

    return messages[reason] || "Не удалось активировать промокод.";
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();

    if (!currentUser || button.disabled) return;

    const code = input.value.trim();
    if (code.length < 6) {
      showMessage("Введи промокод полностью.", true);
      return;
    }

    button.disabled = true;
    button.textContent = "ПРОВЕРЯЕМ…";
    showMessage("");

    const { data, error } = await supabaseClient.rpc(
      "redeem_promo_code",
      { p_code: code }
    );

    if (error) {
      console.error("PROMO REDEEM ERROR:", error);
      showMessage("Не удалось проверить промокод. Попробуй ещё раз.", true);
      renderStatus();
      return;
    }

    if (!data?.success) {
      showMessage(reasonMessage(data?.reason), true);
      renderStatus();
      return;
    }

    if (data.reward_type === "map_item") {
      const names = { bomb: "💣 Бомба", beacon: "📍 Маяк", detector: "🕵️ Детектор" };
      input.value = "";
      showMessage(`🎉 Промокод активирован! Получено: ${names[data.item_type]} ×${data.item_quantity}`);
      await mapItems.load();
      renderStatus();
      return;
    }

    activeUntil = Date.parse(data.benefit_until);
    input.value = "";
    showMessage("Промокод принят! Пиксельный час начался.", false);

    cooldownRemaining = 0;
    clearInterval(cooldownTimer);
    updateCooldown();
    renderStatus();
  });

  setInterval(() => {
    const userId = currentUser?.id || null;

    if (userId !== lastUserId) {
      lastUserId = userId;
      load();
    }

    renderStatus();
  }, 1000);

  renderStatus();
  return { load };
})();
