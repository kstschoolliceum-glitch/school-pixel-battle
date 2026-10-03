// ---------- BACKGROUND MUSIC ----------

(() => {
  const audio = document.getElementById("background-music");
  const button = document.getElementById("music-toggle");

  if (!audio || !button) return;

  const enabledStorageKey = "pixelBattleMusicEnabled";
  const positionStorageKey = "pixelBattleMusicPosition:lofi-capy-v1";
  let lastSavedSecond = -1;

  audio.volume = 0.35;

  function isEnabled() {
    return localStorage.getItem(enabledStorageKey) === "true";
  }

  function savePosition() {
    if (!Number.isFinite(audio.currentTime)) return;

    const currentSecond = Math.floor(audio.currentTime);
    if (currentSecond === lastSavedSecond) return;

    lastSavedSecond = currentSecond;
    localStorage.setItem(positionStorageKey, String(audio.currentTime));
  }

  function restorePosition() {
    const savedPosition = Number(localStorage.getItem(positionStorageKey));
    if (!Number.isFinite(savedPosition) || savedPosition < 0) return;

    const restoredPosition = Number.isFinite(audio.duration) && audio.duration > 0
      ? savedPosition % audio.duration
      : savedPosition;

    try {
      audio.currentTime = restoredPosition;
      lastSavedSecond = Math.floor(restoredPosition);
    } catch (error) {
      console.warn("Не удалось восстановить позицию музыки.");
    }
  }

  function updateButton() {
    const playing = !audio.paused;
    button.classList.toggle("is-playing", playing);
    button.setAttribute("aria-pressed", String(playing));
    button.innerHTML = playing
      ? '<span aria-hidden="true">🔊</span><span class="music-toggle-label">Музыка</span>'
      : '<span aria-hidden="true">🔇</span><span class="music-toggle-label">Музыка</span>';
    button.title = playing
      ? "Выключить музыку — Lofi Tunes of Capy"
      : "Включить музыку — Lofi Tunes of Capy";
  }

  async function startMusic() {
    try {
      await audio.play();
      localStorage.setItem(enabledStorageKey, "true");
    } catch (error) {
      console.warn("Браузер ожидает нажатия пользователя для запуска музыки.");
    }
    updateButton();
  }

  button.addEventListener("click", async () => {
    if (audio.paused) {
      await startMusic();
      return;
    }

    savePosition();
    audio.pause();
    localStorage.setItem(enabledStorageKey, "false");
    updateButton();
  });

  audio.addEventListener("loadedmetadata", restorePosition);
  audio.addEventListener("timeupdate", savePosition);
  audio.addEventListener("play", updateButton);
  audio.addEventListener("pause", () => {
    savePosition();
    updateButton();
  });
  window.addEventListener("pagehide", savePosition);

  if (isEnabled()) {
    document.addEventListener("pointerdown", event => {
      if (!button.contains(event.target) && audio.paused) startMusic();
    }, { once: true });
  }

  updateButton();
})();
