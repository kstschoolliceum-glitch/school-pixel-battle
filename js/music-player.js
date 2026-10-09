// One lightweight player for music and local admin previews; no audio in Supabase.
const musicPlayer = (() => {
  const button = document.getElementById("music-open");
  const dialog = document.getElementById("music-dialog");
  const toggle = document.getElementById("music-enabled");
  const volume = document.getElementById("music-volume");
  const themeLabel = document.getElementById("music-current-theme");
  const trackLabel = document.getElementById("music-current-track");
  const status = document.getElementById("music-status");
  const adminTab = document.getElementById("admin-music-tab");
  const adminList = document.getElementById("admin-music-list");
  const adminStatus = document.getElementById("admin-music-status");
  if (!button || !dialog || !toggle || !volume) return { stop() {} };

  const titles = {
    default: "Классическая", alternative: "Альтернативная",
    new_year: "Новый год", halloween: "Хэллоуин",
    february_23: "23 февраля", summer: "Летняя", music: "Музыкальная",
    space: "Космос", wedding: "Свадебная", carnival: "Карнавал"
  };
  const enabledKey = "pixelBattleMusicEnabled";
  const volumeKey = "pixelBattleMusicVolume";
  function read(key) { try { return localStorage.getItem(key); } catch { return null; } }
  function save(key, value) { try { localStorage.setItem(key, value); } catch {} }
  const savedVolume = Number(read(volumeKey));
  let enabled = read(enabledKey) === "true";
  let level = Number.isFinite(savedVolume) && savedVolume >= 0 && savedVolume <= 100
    && read(volumeKey) !== null ? savedVolume : 30;
  let catalog = null, catalogPromise = null, userId = null, epoch = 0;
  let theme = "default", selected = null, index = 0, playingPreview = false;
  let unlock = false, attempted = 0;
  const audio = new Audio();
  audio.preload = "none";
  audio.volume = level / 100;
  toggle.checked = enabled;
  volume.value = String(level);

  const playlist = id => catalog?.themes?.[id] || [];
  const title = id => titles[id] || id || "—";
  const currentTrack = () => playlist(playingPreview ? selected : theme)[index];
  function updateUI(message = "") {
    button.textContent = enabled ? "♫" : "♪";
    button.setAttribute("aria-label", enabled ? "Настройки музыки: включена" : "Настройки музыки: выключена");
    button.setAttribute("aria-pressed", String(enabled));
    themeLabel.textContent = title(theme);
    trackLabel.textContent = playingPreview ? "Предпрослушивание: " + (currentTrack()?.title || "—") :
      (enabled ? (currentTrack()?.title || "—") : "Музыка выключена");
    status.textContent = message;
    if (adminList && !adminList.classList.contains("hidden")) renderAdmin();
  }
  function unload() {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  }
  async function loadCatalog() {
    if (catalogPromise) return catalogPromise;
    catalogPromise = fetch("assets/music-playlists.json")
      .then(response => { if (!response.ok) throw Error("PLAYLIST_FETCH"); return response.json(); })
      .then(data => {
        if (!data?.themes || typeof data.themes !== "object") throw Error("PLAYLIST_INVALID");
        const themes = {};
        for (const id of Object.keys(titles)) {
          const tracks = data.themes[id];
          themes[id] = Array.isArray(tracks) ? tracks.filter(track =>
            typeof track?.title === "string" && typeof track?.src === "string" &&
            track.src.startsWith("assets/music/" + id + "/") &&
            /^assets\/music\/[a-z0-9_]+\/[a-zA-Z0-9._-]+\.webm$/.test(track.src)
          ) : [];
        }
        catalog = { themes };
        updateUI();
        return catalog;
      }).catch(error => { catalogPromise = null; console.warn("MUSIC PLAYLIST:", error); updateUI("Плейлист недоступен."); return null; });
    return catalogPromise;
  }
  async function play(fromGesture = false) {
    if (!userId || (!enabled && !playingPreview)) return;
    if (fromGesture) unlock = true;
    if (!unlock) return;
    const tracks = playlist(playingPreview ? selected : theme);
    if (!tracks.length) { updateUI("В этой теме нет композиций."); return; }
    if (!audio.getAttribute("src")) audio.src = tracks[index].src;
    audio.volume = level / 100;
    try { await audio.play(); attempted = 0; updateUI(); }
    catch (error) {
      if (error?.name === "NotAllowedError") unlock = false;
      updateUI("Нажми «Включить» для воспроизведения.");
    }
  }
  function nextTrack(failed = false) {
    const tracks = playlist(playingPreview ? selected : theme);
    if (!tracks.length) return;
    attempted = failed ? attempted + 1 : 0;
    if (attempted >= tracks.length) {
      unload(); attempted = 0; updateUI("Не удалось загрузить композиции этой темы."); return;
    }
    index = (index + 1) % tracks.length;
    unload();
    if (playingPreview || enabled) play();
  }
  audio.addEventListener("ended", () => nextTrack());
  audio.addEventListener("error", () => {
    if (audio.getAttribute("src")) nextTrack(true);
  });
  function changeTheme(id) {
    if (!Object.prototype.hasOwnProperty.call(titles, id) || id === theme) return;
    playingPreview = false; selected = null; theme = id; index = 0; attempted = 0;
    unload(); updateUI();
    if (enabled) play();
  }
  function stopPreview() {
    if (!playingPreview) return;
    playingPreview = false; selected = null; index = 0; attempted = 0;
    unload(); updateUI();
    if (enabled) play();
  }
  async function preview(id) {
    if (!Object.prototype.hasOwnProperty.call(titles, id) || !playlist(id).length) return;
    if (playingPreview && selected === id) { stopPreview(); return; }
    unload(); selected = id; playingPreview = true; index = 0; attempted = 0;
    updateUI(); await play(true);
  }
  async function start(session) {
    const id = session?.user?.id;
    if (!id) { stop(); return; }
    if (userId === id) return;
    stop(); userId = id; const request = ++epoch;
    const [config, result] = await Promise.all([
      loadCatalog(), supabaseClient.from("game_music_settings").select("theme_id").eq("id", true).single()
    ]);
    if (request !== epoch || userId !== id) return;
    if (result.error) { console.warn("MUSIC THEME:", result.error); updateUI("Музыкальная тема пока недоступна."); return; }
    if (config) changeTheme(result.data?.theme_id);
    const channel = supabaseClient.channel("game-music-settings")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "game_music_settings" },
        payload => changeTheme(payload.new?.theme_id))
      .subscribe();
    if (request !== epoch) supabaseClient.removeChannel(channel);
    else liveChannel = channel;
    updateUI();
  }
  let liveChannel = null;
  function stop() {
    epoch++;
    if (liveChannel) supabaseClient.removeChannel(liveChannel);
    liveChannel = null; userId = null; playingPreview = false; selected = null;
    unload(); updateUI();
  }
  function renderAdmin() {
    if (!adminList || !catalog) return;
    adminList.replaceChildren();
    for (const id of Object.keys(titles)) {
      const row = document.createElement("div");
      row.className = "music-admin-row";
      const label = document.createElement("span");
      label.textContent = title(id) + " · " + playlist(id).length + " треков" + (theme === id ? " · активна" : "");
      const previewButton = document.createElement("button");
      previewButton.type = "button";
      previewButton.textContent = playingPreview && selected === id ? "Остановить" : "Слушать";
      previewButton.addEventListener("click", () => preview(id));
      const activate = document.createElement("button");
      activate.type = "button";
      activate.textContent = "Сделать активной";
      activate.disabled = theme === id || !playlist(id).length;
      activate.addEventListener("click", async () => {
        if (!currentUserIsAdmin) return;
        activate.disabled = true;
        adminStatus.textContent = "Сохраняем…";
        const { data, error } = await supabaseClient.rpc("admin_set_music_theme", { p_theme_id: id });
        if (error || data !== id) {
          adminStatus.textContent = "Не удалось изменить тему.";
          activate.disabled = false; return;
        }
        changeTheme(id);
        adminStatus.textContent = "Тема сохранена.";
      });
      row.append(label, previewButton, activate);
      adminList.append(row);
    }
  }

  button.addEventListener("click", () => { if (!dialog.open) dialog.showModal(); updateUI(); });
  document.getElementById("music-close")?.addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", event => {
    if (event.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (event.clientX < r.left || event.clientX > r.right ||
        event.clientY < r.top || event.clientY > r.bottom) dialog.close();
  });
  toggle.addEventListener("change", () => {
    enabled = toggle.checked; save(enabledKey, String(enabled));
    if (!enabled) { if (!playingPreview) unload(); updateUI(); }
    else { if (!playingPreview) { index = 0; play(true); } updateUI(); }
  });
  volume.addEventListener("input", () => {
    level = Math.max(0, Math.min(100, Number(volume.value) || 0));
    audio.volume = level / 100; save(volumeKey, String(level));
  });
  adminTab?.addEventListener("click", async () => {
    if (!currentUserIsAdmin) return;
    await loadCatalog();
    adminList.classList.remove("hidden");
    renderAdmin();
  });
  document.addEventListener("pointerdown", () => {
    if (enabled && !unlock && userId) play(true);
  }, { passive: true });
  document.addEventListener("keydown", event => {
    if (enabled && !unlock && userId && !event.repeat) play(true);
  });
  supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT") stop();
    else if ((event === "INITIAL_SESSION" || event === "SIGNED_IN") && session) {
      setTimeout(() => start(session), 0);
    }
  });
  updateUI();
  return { stop };
})();
