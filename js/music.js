// Manifest generated from assets/music; this is the existing background audio element.
(() => {
  const audio = document.getElementById('background-music');
  const button = document.getElementById('music-toggle');
  const preference = document.getElementById('profile-music-enabled');
  const refresh = document.getElementById('admin-music-refresh');
  const list = document.getElementById('admin-music-tracks');
  const count = document.getElementById('admin-music-count');
  const message = document.getElementById('admin-music-message');
  if (!audio) return;
  const key = 'pixelBattleMusicEnabled';
  const enabled = () => localStorage.getItem(key) !== 'false';
  let tracks = [], index = 0, failures = 0, started = false, selectedFile = null, settingsChannel = null, settingsPoll = null;
  audio.volume = 0.35;
  function update() {
    if (preference) preference.checked = enabled();
    if (button) {
      button.classList.toggle('is-playing', !audio.paused);
      button.setAttribute('aria-pressed', String(enabled()));
      button.innerHTML = enabled()
        ? '<span aria-hidden="true">🔊</span><span class="music-toggle-label">Музыка</span>'
        : '<span aria-hidden="true">🔇</span><span class="music-toggle-label">Музыка</span>';
      button.title = enabled() ? 'Выключить музыку' : 'Включить музыку';
    }
  }
  function selectTrack() {
    if (!tracks.length) return;
    const selectedIndex = selectedFile ? tracks.findIndex(track => track.file === selectedFile) : -1;
    if (selectedIndex >= 0) index = selectedIndex;
    audio.src = tracks[index].file;
    audio.load();
  }

  async function loadSelectedTrack() {
    if (typeof supabaseClient === 'undefined') return;
    const { data, error } = await supabaseClient
      .from('game_settings')
      .select('value')
      .eq('key', 'music_track')
      .maybeSingle();
    if (error) throw error;
    selectedFile = data?.value || null;
  }

  function applySelectedTrack(file) {
    if (!file || file === selectedFile || !tracks.some(track => track.file === file)) return;
    selectedFile = file;
    index = Math.max(0, tracks.findIndex(track => track.file === file));
    selectTrack();
    failures = 0;
    if (enabled()) {
      started = true;
      play();
    }
    renderAdminTracks();
  }

  function startSettingsSync() {
    if (typeof supabaseClient === 'undefined') return;
    if (!settingsChannel) {
      settingsChannel = supabaseClient
        .channel('music-settings')
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'game_settings',
          filter: 'key=eq.music_track'
        }, payload => applySelectedTrack(payload.new?.value))
        .subscribe();
    }
    if (!settingsPoll) {
      settingsPoll = setInterval(async () => {
        if (typeof currentUser === 'undefined' || !currentUser) return;
        const previous = selectedFile;
        await loadSelectedTrack().catch(() => {});
        if (selectedFile && selectedFile !== previous) {
          const changed = selectedFile;
          selectedFile = previous;
          applySelectedTrack(changed);
        }
      }, 10000);
    }
  }

  function stopSettingsSync() {
    if (settingsPoll) clearInterval(settingsPoll);
    settingsPoll = null;
    if (settingsChannel && typeof supabaseClient !== 'undefined') {
      supabaseClient.removeChannel(settingsChannel);
    }
    settingsChannel = null;
  }

  async function chooseTrack(file) {
    if (typeof currentUserIsAdmin === 'undefined' || !currentUserIsAdmin) return;
    const { error } = await supabaseClient.rpc('set_music_track', { p_file: file });
    if (error) throw error;
    const previous = selectedFile;
    selectedFile = previous;
    applySelectedTrack(file);
  }

  function renderAdminTracks() {
    if (!list) return;
    list.replaceChildren();
    tracks.forEach((track, trackIndex) => {
      const label = document.createElement('label');
      label.className = 'admin-music-track';
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'admin-music-track';
      radio.value = track.file;
      radio.checked = selectedFile ? track.file === selectedFile : trackIndex === 0;
      radio.addEventListener('change', async () => {
        if (!radio.checked) return;
        try {
          await chooseTrack(track.file);
          if (message) message.textContent = `Активная композиция: ${track.title}`;
        } catch (error) {
          console.error('MUSIC SELECT ERROR:', error);
          if (message) message.textContent = 'Не удалось сохранить выбор. Проверьте, применена ли миграция музыки в Supabase.';
          await loadSelectedTrack().catch(() => {});
          renderAdminTracks();
        }
      });
      const title = document.createElement('span');
      title.textContent = track.title;
      label.append(radio, title);
      list.append(label);
    });
  }
  function play() {
    if (!enabled() || typeof currentUser === 'undefined' || !currentUser || !tracks.length
      || !document.getElementById('auth-screen')?.classList.contains('hidden')) return;
    if (!audio.src) selectTrack();
    const attempt = audio.play();
    if (attempt) attempt.catch(() => { started = false; /* Retry on a later gesture. */ });
  }
  function next() {
    if (!tracks.length) return;
    if (failures >= tracks.length) {
      audio.pause();
      if (message) message.textContent = 'Не удалось воспроизвести композиции в этом браузере.';
      return;
    }
    index = (index + 1) % tracks.length;
    selectTrack();
    play();
  }
  async function loadManifest() {
    const response = await fetch(`assets/music-playlist.json?refresh=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('Playlist unavailable');
    const manifest = await response.json();
    if (manifest.version !== 1 || !Array.isArray(manifest.tracks)) throw new Error('Invalid playlist');
    const safe = manifest.tracks.filter(track =>
      typeof track.file === 'string' && /^assets\/music\/[\w%().!~*'-]+\.(mp3|ogg|m4a)$/i.test(track.file)
      && typeof track.title === 'string');
    const previous = tracks[index]?.file;
    tracks = safe;
    const sameIndex = tracks.findIndex(track => track.file === previous);
    index = sameIndex < 0 ? 0 : sameIndex;
    failures = 0;
    if (tracks.length && (!audio.src || sameIndex < 0)) selectTrack();
    if (count) count.textContent = `${tracks.length} композиции`;
    renderAdminTracks();
    return tracks;
  }
  audio.addEventListener('ended', () => { failures = 0; next(); });
  audio.addEventListener('error', () => { failures++; next(); });
  audio.addEventListener('play', update);
  audio.addEventListener('pause', update);
  function setEnabled(value) {
    localStorage.setItem(key, String(value));
    if (value) { started = true; play(); }
    else audio.pause();
    update();
  }
  button?.addEventListener('click', () => setEnabled(!enabled()));
  preference?.addEventListener('change', () => setEnabled(preference.checked));
  function firstGesture(event) {
    if (typeof currentUser === 'undefined' || !currentUser || !enabled() || !tracks.length
      || !document.getElementById('auth-screen')?.classList.contains('hidden') || button?.contains(event.target)) return;
    started = true;
    play();
  }
  document.addEventListener('pointerdown', firstGesture);
  document.addEventListener('keydown', firstGesture);
  refresh?.addEventListener('click', async () => {
    if (typeof currentUserIsAdmin === 'undefined' || !currentUserIsAdmin) return;
    refresh.disabled = true;
    try {
      await loadManifest();
      message.textContent = 'Опубликованный плейлист проверен. Новые файлы доступны после commit и deploy.';
    } catch {
      message.textContent = 'Не удалось загрузить опубликованный плейлист.';
    } finally { refresh.disabled = false; }
  });
  window.musicPlayer = {
    stopForLogout() {
      audio.pause();
      started = false;
      stopSettingsSync();
    }
  };
  Promise.all([loadManifest(), loadSelectedTrack().catch(() => {})]).then(() => {
    if (selectedFile && tracks.some(track => track.file === selectedFile)) selectTrack();
    renderAdminTracks();
    startSettingsSync();
  }).catch(() => { if (count) count.textContent = 'Плейлист недоступен'; });
  update();
})();
