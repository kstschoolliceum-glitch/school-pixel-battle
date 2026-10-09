// One lightweight player for music and local admin previews; no audio in Supabase.
const musicPlayer = (() => {
  const toggle = document.getElementById("music-enabled");
  const volume = document.getElementById("music-volume");
  const themeLabel = document.getElementById("music-current-theme");
  const trackLabel = document.getElementById("music-current-track");
  const status = document.getElementById("music-status");
  const adminTab = document.getElementById("admin-music-tab");
  const adminList = document.getElementById("admin-music-list");
  const adminStatus = document.getElementById("admin-music-status");
  const adminTheme = document.getElementById("admin-music-theme");
  const adminApply = document.getElementById("admin-music-apply");
  if (!toggle || !volume) return { stop() {} };

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
  let enabled = read(enabledKey) !== "false";
  let level = Number.isFinite(savedVolume) && savedVolume >= 0 && savedVolume <= 100
    && read(volumeKey) !== null ? savedVolume : 25;
  let catalog = null, catalogPromise = null, userId = null, epoch = 0;
  let theme = "default", selected = null, index = 0, activeIndex = 0, playingPreview = false;
  let unlock = false, gesturePending = false;
  function armGesture() {
    document.addEventListener("pointerdown", onFirstGesture, { passive: true });
    document.addEventListener("keydown", onFirstGesture);
  }
  function disarmGesture() {
    document.removeEventListener("pointerdown", onFirstGesture);
    document.removeEventListener("keydown", onFirstGesture);
  }
  function onFirstGesture(event) {
    if (!enabled || !userId || gesturePending || event.repeat) return;
    gesturePending = true;
    play(true).finally(() => { gesturePending = false; });
  }
  const audio = new Audio();
  audio.preload = "none";
  audio.loop = true;
  audio.volume = level / 100;
  // Decode only the selected track. AudioBufferSourceNode loops at sample boundaries;
  // HTMLAudioElement remains the fallback when Web Audio is unavailable.
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  let context = null, gain = null, source = null, buffer = null, bufferUrl = null;
  let loading = null, abort = null, generation = 0;
  toggle.checked = enabled;
  volume.value = String(level);

  const playlist = id => catalog?.themes?.[id] || [];
  const title = id => titles[id] || id || "—";
  const currentTrack = () => playlist(playingPreview ? selected : theme)[index];
  function updateUI(message = "") {
    themeLabel.textContent = title(theme);
    trackLabel.textContent = playingPreview ? "Предпрослушивание: " + (currentTrack()?.title || "—") :
      (playlist(theme)[activeIndex]?.title || "—");
    status.textContent = message;
    if (adminList && !adminList.classList.contains("hidden")) renderAdmin();
  }
  function unload() {
    generation++;
    abort?.abort(); abort = null; loading = null;
    if (source) { source.stop(); source.disconnect(); source = null; }
    buffer = null; bufferUrl = null;
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
    if (AudioContextClass) {
      const attempt = generation;
      try {
        if (!context) {
          context = new AudioContextClass();
          gain = context.createGain(); gain.connect(context.destination);
        }
        gain.gain.value = level / 100;
        await context.resume();
        if (attempt !== generation) return;
        if (source) return;
        const url = tracks[index].src;
        if (bufferUrl !== url || !buffer) {
          if (!loading) {
            const request = generation;
            abort = new AbortController();
            loading = fetch(url, { signal: abort.signal })
              .then(response => { if (!response.ok) throw Error("MUSIC_FETCH"); return response.arrayBuffer(); })
              .then(bytes => context.decodeAudioData(bytes))
              .then(decoded => {
                if (request === generation) { buffer = decoded; bufferUrl = url; }
              });
          }
          await loading;
          if (!buffer || bufferUrl !== url || !enabled && !playingPreview) return;
          loading = null; abort = null;
        }
        if (source || attempt !== generation) return;
        source = context.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        source.connect(gain);
        audio.pause();
        source.start();
        updateUI();
        disarmGesture();
        return true;
      } catch (error) {
        if (attempt !== generation || error?.name === "AbortError") return;
        if (error?.name === "NotAllowedError") { unlock = false; return; }
        console.warn("MUSIC DECODE:", error);
        // A failed decode can still play through the existing native player.
        if (source) { source.stop(); source.disconnect(); source = null; }
        loading = null; abort = null; buffer = null; bufferUrl = null;
      }
    }
    if (!audio.getAttribute("src")) audio.src = tracks[index].src;
    audio.volume = level / 100;
    try { await audio.play(); updateUI(); disarmGesture(); return true; }
    catch (error) {
      if (error?.name === "NotAllowedError") unlock = false;
      updateUI("Нажми «Включить» для воспроизведения.");
    }
  }
  audio.addEventListener("error", () => {
    if (audio.getAttribute("src")) {
      unload();
      updateUI("Не удалось загрузить выбранную композицию.");
    }
  });
  function changeSelection(id, track) {
    if (!Object.prototype.hasOwnProperty.call(titles, id) ||
        !Number.isInteger(track) || track < 0 || track >= playlist(id).length ||
        (id === theme && track === activeIndex)) return;
    playingPreview = false; selected = null;
    theme = id; activeIndex = track; index = track;
    unload(); updateUI();
    if (enabled) play();
  }
  function stopPreview() {
    if (!playingPreview) return;
    playingPreview = false; selected = null; index = activeIndex;
    unload(); updateUI();
    if (enabled) play();
  }
  async function preview(id, track) {
    if (!currentUserIsAdmin || !Object.prototype.hasOwnProperty.call(titles, id) ||
        !Number.isInteger(track) || !playlist(id)[track]) return;
    if (playingPreview && selected === id && index === track) { stopPreview(); return; }
    unload(); selected = id; playingPreview = true; index = track;
    updateUI(); await play(true);
  }
  async function start(session) {
    const id = session?.user?.id;
    if (!id) { stop(); return; }
    if (userId === id) return;
    stop(); userId = id; if (enabled) armGesture(); const request = ++epoch;
    const [config, result] = await Promise.all([
      loadCatalog(), supabaseClient.from("game_music_settings").select("theme_id,track_index").eq("id", true).single()
    ]);
    if (request !== epoch || userId !== id) return;
    if (result.error) { console.warn("MUSIC THEME:", result.error); updateUI("Музыкальная тема пока недоступна."); return; }
    if (config) changeSelection(result.data?.theme_id, result.data?.track_index);
    const channel = supabaseClient.channel("game-music-settings")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "game_music_settings" },
        payload => changeSelection(payload.new?.theme_id, payload.new?.track_index))
      .subscribe();
    if (request !== epoch) supabaseClient.removeChannel(channel);
    else liveChannel = channel;
    updateUI();
  }
  let liveChannel = null;
  function stop() {
    epoch++;
    if (liveChannel) supabaseClient.removeChannel(liveChannel);
    liveChannel = null; userId = null; playingPreview = false; selected = null; unlock = false;
    unload(); disarmGesture(); updateUI();
  }
  function renderAdmin() {
    if (!adminList || !catalog || !adminTheme) return;
    const id = adminTheme.value;
    const tracks = playlist(id);
    adminList.replaceChildren();
    tracks.forEach((track, trackIndex) => {
      const row = document.createElement("div");
      row.className = "music-admin-row";
      const label = document.createElement("label");
      const radio = document.createElement("input");
      radio.type = "radio"; radio.name = "admin-music-track";
      radio.value = String(trackIndex);
      radio.checked = Number(adminList.dataset.selectedTrack) === trackIndex;
      radio.addEventListener("change", () => {
        adminList.dataset.selectedTrack = String(trackIndex);
        adminApply.disabled = false;
      });
      const text = document.createElement("span");
      text.textContent = track.title + (id === theme && trackIndex === activeIndex ? " · активна" : "");
      label.append(radio, text);
      const previewButton = document.createElement("button");
      previewButton.type = "button";
      previewButton.textContent = playingPreview && selected === id && index === trackIndex ? "Остановить" : "Слушать";
      previewButton.addEventListener("click", () => preview(id, trackIndex));
      row.append(label, previewButton);
      adminList.append(row);
    });
    adminApply.disabled = !tracks.length;
  }
  adminTheme?.addEventListener("change", () => {
    stopPreview();
    adminList.dataset.selectedTrack = adminTheme.value === theme ? String(activeIndex) : "0";
    renderAdmin();
  });
  adminApply?.addEventListener("click", async () => {
    if (!currentUserIsAdmin) return;
    const id = adminTheme.value, track = Number(adminList.dataset.selectedTrack);
    if (!Object.prototype.hasOwnProperty.call(titles, id) ||
        !Number.isInteger(track) || !playlist(id)[track]) return;
    adminApply.disabled = true;
    adminStatus.textContent = "Сохраняем…";
    const { data, error } = await supabaseClient.rpc(
      "admin_set_music_selection", { p_theme_id: id, p_track_index: track }
    );
    if (error || data?.theme_id !== id || data?.track_index !== track) {
      adminStatus.textContent = "Не удалось изменить композицию.";
      adminApply.disabled = false; return;
    }
    stopPreview();
    changeSelection(id, track);
    adminStatus.textContent = "Композиция сохранена для всех.";
    renderAdmin();
  });
  toggle.addEventListener("change", () => {
    enabled = toggle.checked; save(enabledKey, String(enabled));
    if (!enabled) { disarmGesture(); if (!playingPreview) unload(); updateUI(); }
    else { armGesture(); if (!playingPreview) { index = activeIndex; play(true); } updateUI(); }
  });
  volume.addEventListener("input", () => {
    level = Math.max(0, Math.min(100, Number(volume.value) || 0));
    audio.volume = level / 100; save(volumeKey, String(level));
    if (gain) gain.gain.value = level / 100;
  });
  adminTab?.addEventListener("click", async () => {
    if (!currentUserIsAdmin) return;
    const loaded = await loadCatalog();
    if (!loaded) return;
    adminTheme.replaceChildren();
    for (const id of Object.keys(titles)) {
      const option = document.createElement("option");
      option.value = id; option.textContent = title(id) + " · " + playlist(id).length + " композиций";
      adminTheme.append(option);
    }
    adminTheme.value = theme;
    adminList.dataset.selectedTrack = String(activeIndex);
    adminList.classList.remove("hidden");
    renderAdmin();
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && enabled && unlock && userId && context?.state === "suspended") play();
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
