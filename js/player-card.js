/* -------------------------
   ВИЗИТКА ИГРОКА
------------------------- */

const playerCard = (() => {
  const openButton = document.getElementById("player-card-open-button");
  const dialog = document.getElementById("player-card-dialog");
  const closeButton = document.getElementById("player-card-close");
  const photoButton = document.getElementById("player-card-photo-button");
  const photoInput = document.getElementById("player-card-photo-input");
  const photoImage = document.getElementById("player-card-photo-image");
  const photoFallback = document.getElementById("player-card-photo-fallback");
  const photoDelete = document.getElementById("player-card-photo-delete");
  const photoStatus = document.getElementById("player-card-photo-status");
  const nickname = document.getElementById("player-card-nickname");
  const className = document.getElementById("player-card-class");
  const username = document.getElementById("player-card-username");
  const lastSeen = document.getElementById("player-card-last-seen");
  const weekly = document.getElementById("player-card-weekly");
  const total = document.getElementById("player-card-total");
  const achievementCount = document.getElementById("player-card-achievement-count");
  const achievementList = document.getElementById("player-card-achievement-list");
  const achievementPopup = document.getElementById("player-achievement-popup");
  const achievementPopupClose = document.getElementById("player-achievement-popup-close");
  const achievementPopupIcon = document.getElementById("player-achievement-popup-icon");
  const achievementPopupTitle = document.getElementById("player-achievement-popup-title");
  const achievementPopupDescription = document.getElementById("player-achievement-popup-description");
  const achievementPopupBar = document.getElementById("player-achievement-popup-bar");
  const achievementPopupPercent = document.getElementById("player-achievement-popup-percent");
  const achievementPopupValue = document.getElementById("player-achievement-popup-value");
  const message = document.getElementById("player-card-message");

  // Диалог должен быть вне скрываемых вкладок, иначе showModal()
  // блокирует страницу, но само окно остаётся невидимым.
  if (dialog?.parentElement !== document.body) {
    document.body.appendChild(dialog);
  }

  let requestNumber = 0;
  let photoObjectUrl = "";
  let viewedUserId = "";

  function closePhotoObjectUrl() {
    if (photoObjectUrl) URL.revokeObjectURL(photoObjectUrl);
    photoObjectUrl = "";
  }

  function avatarPath() {
    return currentUser ? `${currentUser.id}/avatar.webp` : "";
  }

  function initials(value) {
    const parts = String(value || "Игрок").trim().split(/\s+/).filter(Boolean);
    return parts.slice(0, 2).map(part => part[0]).join("").toUpperCase() || "?";
  }

  function setPhoto(url = "", isOwn = false) {
    if (!url) closePhotoObjectUrl();
    photoButton.disabled = !isOwn;
    photoButton.classList.toggle("is-readonly", !isOwn);

    if (url) {
      photoImage.src = url;
      photoImage.classList.remove("hidden");
      photoFallback.classList.add("hidden");
      photoDelete.classList.toggle("hidden", !isOwn);
      photoStatus.textContent = isOwn
        ? "Фото хранится в твоём профиле."
        : "Фото профиля игрока.";
    } else {
      photoImage.removeAttribute("src");
      photoImage.classList.add("hidden");
      photoFallback.classList.remove("hidden");
      photoDelete.classList.add("hidden");
      photoStatus.textContent = isOwn
        ? "Нажми на фото, чтобы добавить своё."
        : "Игрок пока не добавил фото.";
    }
  }

  async function loadPhoto(ownerId, isOwn) {
    const { data, error } = await supabaseClient.storage
      .from("profile-photos")
      .download(`${ownerId}/avatar.webp`);

    if (!currentUser || viewedUserId !== ownerId) return;
    if (error || !data) {
      setPhoto("", isOwn);
      return;
    }

    closePhotoObjectUrl();
    photoObjectUrl = URL.createObjectURL(data);
    setPhoto(photoObjectUrl, isOwn);
    photoObjectUrl = photoImage.src.startsWith("blob:")
      ? photoImage.src
      : "";
  }

  const SECRET_ACHIEVEMENT_HINTS = Object.freeze({
    night_artist: "Некоторые художники просыпаются, когда школа спит.",
    before_bell: "Иногда лучший штрих появляется ещё до первого звонка.",
    map_edge: "Карта заканчивается, но художник — нет.",
    map_center: "Самое важное место может быть точно посередине.",
    lucky_seven: "Две семёрки могут принести удачу.",
    unlucky_thirteen: "Это число не всем приносит удачу.",
    four_corners: "Компас укажет сразу четыре направления.",
    repaint_five: "Настоящий художник иногда меняет решение снова и снова.",
    one_pixel_day: "Оставь почти незаметный след — и исчезни.",
    productive_day: "Попробуй успеть всё за один день.",
    wall_friend: "Иногда стена тоже заслуживает внимания.",
    restart_five: "Если не получилось — начни снова. И ещё раз.",
    fast_unblock: "Пробка исчезает быстрее, если видеть путь заранее.",
    long_fifteen: "Даже очень долгий путь может закончиться победой.",
    long_sokoban: "Большой переезд требует очень много шагов.",
    ten_restarts_win: "Упрямство иногда сильнее идеального плана.",
    all_games_day: "Три разных испытания ждут одного героя.",
    return_week: "Иногда нужно надолго уйти, чтобы красиво вернуться."
  });

  function hideAchievementPopup() {
    achievementPopup.classList.add("hidden");
  }

  function showAchievementPopup(item) {
    const current = Math.max(0, Number(item.progress) || 0);
    const target = Math.max(1, Number(item.target) || 1);
    const percent = Math.min(100, Math.round(current / target * 100));
    const remaining = Math.max(0, 100 - percent);
    const secretLocked = Boolean(item.secret && !item.unlocked);
    setAchievementArtwork(achievementPopupIcon, item);
    achievementPopupIcon.dataset.rarity = achievementRarity(item);
    achievementPopupIcon.classList.toggle("is-locked", !item.unlocked);
    achievementPopupTitle.textContent = secretLocked
      ? "Секретное достижение"
      : (item.title || "Достижение");
    achievementPopupDescription.textContent = secretLocked
      ? `Подсказка: ${SECRET_ACHIEVEMENT_HINTS[item.id] || "Продолжай играть и пробуй необычные действия."}`
      : (item.description || "");
    achievementPopupBar.style.width = secretLocked ? "0%" : `${percent}%`;
    achievementPopupPercent.textContent = secretLocked
      ? `${Math.min(current, target).toLocaleString("ru-RU")} / ${target.toLocaleString("ru-RU")}`
      : item.unlocked
        ? "Выполнено на 100%"
        : `Осталось выполнить: ${remaining}%`;
    achievementPopupValue.textContent = secretLocked
      ? ""
      : `Прогресс: ${Math.min(current, target).toLocaleString("ru-RU")} из ${target.toLocaleString("ru-RU")}`;
    achievementPopup.classList.remove("hidden");
  }

  const ACHIEVEMENT_CATEGORY_ORDER = Object.freeze([
    "Карта",
    "Сезоны",
    "Чат",
    "Ежедневные задания",
    "Мини-игры",
    "Команда",
    "Долгосрочные",
    "Секретные"
  ]);

  function achievementCategory(item) {
    if (item.secret) return "Секретные";
    if (item.category) return String(item.category);

    const id = String(item.id || "");
    if (id.startsWith("season") || id.startsWith("seasons")) return "Сезоны";
    if (id.startsWith("chat") || id === "first_message") return "Чат";
    if (id.startsWith("daily")) return "Ежедневные задания";
    if (
      id.startsWith("unblock") ||
      id.startsWith("sokoban") ||
      id.startsWith("fifteen") ||
      id.startsWith("minigame") ||
      id === "all_games"
    ) return "Мини-игры";
    if (id.startsWith("referral")) return "Команда";
    return "Карта";
  }

  function achievementRarity(item) {
    if (item.secret) return "epic";
    const target = Number(item.target) || 0;
    if (item.id === "long_school_legend" || target >= 5000) return "legendary";
    if (item.category === "Долгосрочные" || target >= 100) return "epic";
    if (target >= 20) return "rare";
    if (target >= 5) return "uncommon";
    return "common";
  }

  // Rasterize each complete Unicode emoji once; no canvas is attached to the page.
  const emojiPixels = new Map();
  let emojiSource;
  let emojiSmall;
  let emojiSourceContext;
  let emojiSmallContext;

  function pixelatedEmoji(emoji) {
    if (emojiPixels.has(emoji)) return emojiPixels.get(emoji);
    let result = null;
    try {
      if (!emoji || emoji.length > 64 || !emoji.trim()) throw new Error("Invalid emoji");
      if (!emojiSource) {
        emojiSource = document.createElement("canvas");
        emojiSmall = document.createElement("canvas");
        emojiSource.width = emojiSource.height = 64;
        emojiSmall.width = emojiSmall.height = 24;
        emojiSourceContext = emojiSource.getContext("2d", { willReadFrequently: true });
        emojiSmallContext = emojiSmall.getContext("2d", { willReadFrequently: true });
      }
      if (!emojiSourceContext || !emojiSmallContext) throw new Error("Canvas unavailable");

      const source = emojiSourceContext;
      source.clearRect(0, 0, 64, 64);
      source.textAlign = "center";
      source.textBaseline = "middle";
      const fonts = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
      source.font = `48px ${fonts}`;
      const metrics = source.measureText(emoji);
      const boundsWidth = Math.max(metrics.width,
        (metrics.actualBoundingBoxLeft || 0) + (metrics.actualBoundingBoxRight || 0));
      const boundsHeight = (metrics.actualBoundingBoxAscent || 0) +
        (metrics.actualBoundingBoxDescent || 0);
      if (!Number.isFinite(boundsWidth) || boundsWidth <= 0) throw new Error("Empty glyph");
      const scale = Math.min(1, 56 / Math.max(boundsWidth, boundsHeight, 1));
      source.font = `${Math.max(16, Math.floor(48 * scale))}px ${fonts}`;
      source.fillText(emoji, 32, 32);

      // Crop to rendered alpha bounds so flags and ZWJ emoji retain their proportions.
      const pixels = source.getImageData(0, 0, 64, 64).data;
      let left = 64, top = 64, right = -1, bottom = -1;
      for (let y = 0; y < 64; y++) {
        for (let x = 0; x < 64; x++) {
          if (pixels[(y * 64 + x) * 4 + 3] < 8) continue;
          left = Math.min(left, x);
          top = Math.min(top, y);
          right = Math.max(right, x);
          bottom = Math.max(bottom, y);
        }
      }
      if (right < 0 || left === 0 || top === 0 || right === 63 || bottom === 63) {
        throw new Error("Empty or clipped glyph");
      }
      const width = right - left + 1, height = bottom - top + 1;
      const fit = Math.min(22 / width, 22 / height);
      const outputWidth = Math.max(1, Math.round(width * fit));
      const outputHeight = Math.max(1, Math.round(height * fit));
      const small = emojiSmallContext;
      small.clearRect(0, 0, 24, 24);
      small.imageSmoothingEnabled = true;
      small.drawImage(emojiSource, left, top, width, height,
        Math.floor((24 - outputWidth) / 2), Math.floor((24 - outputHeight) / 2),
        outputWidth, outputHeight);
      if (!small.getImageData(0, 0, 24, 24).data.some((_, i, data) =>
        i % 4 === 3 && data[i] > 0)) throw new Error("Transparent output");
      result = emojiSmall.toDataURL("image/png");
      if (!result.startsWith("data:image/png;base64,")) result = null;
    } catch {
      result = null; // Keep the complete original emoji as visible text.
    }
    if (emojiPixels.size >= 150) emojiPixels.delete(emojiPixels.keys().next().value);
    emojiPixels.set(emoji, result);
    return result;
  }

  function setAchievementArtwork(container, item) {
    const emoji = String(item.secret && !item.unlocked ? "❓" : (item.icon || "🏆"));
    const fallback = document.createElement("span");
    fallback.className = "achievement-art-fallback";
    fallback.textContent = emoji;
    container.replaceChildren(fallback);
    const src = pixelatedEmoji(emoji);
    if (!src) return;
    const image = document.createElement("img");
    image.className = "achievement-art-image";
    image.alt = "";
    image.decoding = "async";
    image.addEventListener("load", () => { fallback.hidden = true; });
    image.addEventListener("error", () => {
      emojiPixels.set(emoji, null);
      image.remove();
      fallback.hidden = false;
    });
    container.append(image);
    image.src = src;
  }

  function createAchievementBadge(item) {
    const badge = document.createElement("button");
    badge.type = "button";
    badge.className = "player-card-achievement-badge";
    badge.classList.toggle("is-unlocked", Boolean(item.unlocked));
    badge.dataset.rarity = achievementRarity(item);
    const secretLocked = Boolean(item.secret && !item.unlocked);
    badge.setAttribute(
      "aria-label",
      secretLocked
        ? "Секретное достижение. Посмотреть подсказку"
        : `${item.title}. Посмотреть прогресс`
    );

    const icon = document.createElement("span");
    icon.className = "player-card-achievement-badge-icon";
    setAchievementArtwork(icon, item);

    const label = document.createElement("span");
    label.className = "player-card-achievement-badge-label";
    label.textContent = secretLocked
      ? "Секретное"
      : (item.title || "Достижение");

    badge.append(icon, label);

    if (!item.unlocked) {
      const lock = document.createElement("small");
      lock.className = "player-card-achievement-lock";
      lock.textContent = "🔒";
      badge.appendChild(lock);
    }

    badge.addEventListener("click", () => showAchievementPopup(item));
    return badge;
  }

  function renderAchievements(items = []) {
    achievementList.replaceChildren();
    const unlocked = items.filter(item => item.unlocked).length;
    achievementCount.textContent = `${unlocked} / ${items.length || 3}`;

    const grouped = new Map();
    items.forEach(item => {
      const category = achievementCategory(item);
      if (!grouped.has(category)) grouped.set(category, []);
      grouped.get(category).push(item);
    });

    const categories = [
      ...ACHIEVEMENT_CATEGORY_ORDER,
      ...[...grouped.keys()].filter(
        category => !ACHIEVEMENT_CATEGORY_ORDER.includes(category)
      )
    ];

    categories.forEach(category => {
      const categoryItems = grouped.get(category);
      if (!categoryItems?.length) return;

      const section = document.createElement("section");
      section.className = "player-card-achievement-category";

      const heading = document.createElement("h4");
      heading.className = "player-card-achievement-category-title";
      heading.textContent = category;

      const grid = document.createElement("div");
      grid.className = "player-card-achievement-category-grid";
      categoryItems.forEach(item => grid.appendChild(createAchievementBadge(item)));

      section.append(heading, grid);
      achievementList.appendChild(section);
    });
  }

  function formatPlayerLastSeen(value, ownerId) {
    if (currentOnlineUserIds.includes(String(ownerId))) {
      return "Был(-а) в сети: сейчас";
    }
    if (!value) return "Был(-а) в сети: нет данных";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Был(-а) в сети: нет данных";

    const now = new Date();
    const sameDay =
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate();
    const time = date.toLocaleTimeString("ru-RU", {
      hour: "2-digit",
      minute: "2-digit"
    });

    if (sameDay) return `Был(-а) в сети: сегодня в ${time}`;

    return `Был(-а) в сети: ${date.toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    })} в ${time}`;
  }

  async function load(ownerId = currentUser?.id) {
    if (!currentUser || !ownerId) return;
    viewedUserId = String(ownerId);
    const isOwn = viewedUserId === currentUser.id;
    const ownRequest = ++requestNumber;
    message.textContent = "";
    hideAchievementPopup();
    username.classList.toggle("hidden", !isOwn);
    photoDelete.classList.add("hidden");
    achievementList.innerHTML = '<p class="player-card-loading">Загрузка достижений…</p>';

    setPhoto("", isOwn);
    loadPhoto(viewedUserId, isOwn).catch(error => {
      console.warn("PLAYER PHOTO LOAD ERROR:", error);
    });

    const { data, error } = await supabaseClient.rpc(
      "get_player_card",
      {
        p_user_id: viewedUserId
      }
    );

    if (
      ownRequest !== requestNumber ||
      !currentUser ||
      viewedUserId !== String(ownerId)
    ) return;

    if (error || !data?.success) {
      console.error("PLAYER CARD ERROR:", error || data);
      message.textContent = "Не удалось загрузить визитку. Администратору нужно выполнить новую SQL-миграцию.";
      achievementList.innerHTML = '<p class="player-card-loading">Достижения пока недоступны.</p>';
      return;
    }

    nickname.textContent = data.nickname || "Игрок";
    className.textContent = `Класс ${data.class_name || "—"}`;
    username.textContent = data.username ? `@${data.username}` : "";
    lastSeen.textContent = formatPlayerLastSeen(data.last_seen_at, viewedUserId);
    photoFallback.textContent = initials(data.nickname);
    weekly.textContent = Number(data.weekly_pixels || 0).toLocaleString("ru-RU");
    total.textContent = Number(data.total_pixels || 0).toLocaleString("ru-RU");
    renderAchievements(Array.isArray(data.achievements) ? data.achievements : []);
    profileCosmetics.applyPlayerCard(viewedUserId, dialog, nickname);
  }

  function openCard(ownerId) {
    if (!currentUser || !ownerId) return;
    const normalizedOwnerId = String(ownerId);

    if (dialog.open && viewedUserId === normalizedOwnerId) {
      return;
    }

    if (typeof dialog.showModal === "function") {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }
    load(normalizedOwnerId);
  }

  const PLAYER_PHOTO_MAX_BYTES = 256 * 1024;

  function canvasToWebp(canvas, quality) {
    return new Promise(resolve => {
      canvas.toBlob(resolve, "image/webp", quality);
    });
  }

  function resizePhoto(file) {
    return new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(file);
      const image = new Image();

      image.onload = async () => {
        URL.revokeObjectURL(objectUrl);

        try {
          const sizes = [480, 400, 320];
          const qualities = [0.82, 0.72, 0.62, 0.52];

          for (const size of sizes) {
            const scale = Math.max(
              size / image.naturalWidth,
              size / image.naturalHeight
            );
            const width = image.naturalWidth * scale;
            const height = image.naturalHeight * scale;
            const canvas = document.createElement("canvas");
            canvas.width = size;
            canvas.height = size;
            const context = canvas.getContext("2d");
            context.drawImage(
              image,
              (size - width) / 2,
              (size - height) / 2,
              width,
              height
            );

            for (const quality of qualities) {
              const blob = await canvasToWebp(canvas, quality);
              if (blob && blob.size <= PLAYER_PHOTO_MAX_BYTES) {
                resolve(blob);
                return;
              }
            }
          }

          reject(new Error("PHOTO_TOO_LARGE"));
        } catch (error) {
          reject(error);
        }
      };

      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("PHOTO_READ_FAILED"));
      };
      image.src = objectUrl;
    });
  }

  async function uploadPhoto(file) {
    if (!currentUser || !file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      message.textContent = "Выбери PNG, JPG или WebP.";
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      message.textContent = "Фото слишком большое. Максимум — 8 МБ.";
      return;
    }

    const ownerId = currentUser.id;
    photoButton.disabled = true;
    message.textContent = "Сохраняем фото…";

    try {
      const blob = await resizePhoto(file);
      const { error } = await supabaseClient.storage
        .from("profile-photos")
        .upload(avatarPath(), blob, {
          contentType: "image/webp",
          cacheControl: "3600",
          upsert: true
        });
      if (error) throw error;
      if (!currentUser || currentUser.id !== ownerId) return;
      viewedUserId = ownerId;
      await loadPhoto(ownerId, true);
      message.textContent = "Фото профиля сохранено.";
    } catch (error) {
      console.error("PLAYER PHOTO UPLOAD ERROR:", error);
      message.textContent = "Не удалось сохранить фото.";
    } finally {
      photoButton.disabled = false;
      photoInput.value = "";
    }
  }

  openButton?.addEventListener("click", () => {
    openCard(currentUser?.id);
  });
  closeButton?.addEventListener("click", () => {
    hideAchievementPopup();
    dialog.close();
  });
  achievementPopupClose?.addEventListener("click", hideAchievementPopup);
  achievementPopup?.addEventListener("click", event => {
    if (event.target === achievementPopup) hideAchievementPopup();
  });
  dialog?.addEventListener("click", event => {
    if (event.target === dialog) dialog.close();
  });
  photoButton?.addEventListener("click", () => {
    if (viewedUserId === currentUser?.id) photoInput.click();
  });
  photoInput?.addEventListener("change", () => uploadPhoto(photoInput.files?.[0]));
  photoDelete?.addEventListener("click", async () => {
    if (
      !currentUser ||
      viewedUserId !== currentUser.id ||
      !confirm("Убрать фото из визитки?")
    ) return;
    photoDelete.disabled = true;
    const { error } = await supabaseClient.storage
      .from("profile-photos")
      .remove([avatarPath()]);
    photoDelete.disabled = false;
    if (error) {
      message.textContent = "Не удалось убрать фото.";
      return;
    }
    setPhoto("", true);
    message.textContent = "Фото удалено.";
  });

  document.addEventListener("click", event => {
    const target = event.target.closest("[data-player-card-user-id]");
    if (!target || target.closest("#player-card-dialog")) return;
    event.preventDefault();
    event.stopPropagation();
    openCard(target.dataset.playerCardUserId);
  });

  document.addEventListener("keydown", event => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const target = event.target.closest("[data-player-card-user-id]");
    if (!target) return;
    event.preventDefault();
    openCard(target.dataset.playerCardUserId);
  });

  return { load, open: openCard };
})();
