// ---------- INTERFACE POP SOUND ----------

(() => {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;

  let audioContext = null;
  let lastPlayedAt = 0;

  function playPop() {
    const nowMs = performance.now();
    if (nowMs - lastPlayedAt < 35) return;
    lastPlayedAt = nowMs;

    try {
      audioContext ||= new AudioContextClass();

      if (audioContext.state === "suspended") {
        audioContext.resume();
      }

      const startedAt = audioContext.currentTime;
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(520, startedAt);
      oscillator.frequency.exponentialRampToValueAtTime(230, startedAt + 0.055);

      gain.gain.setValueAtTime(0.0001, startedAt);
      gain.gain.exponentialRampToValueAtTime(0.07, startedAt + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, startedAt + 0.07);

      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start(startedAt);
      oscillator.stop(startedAt + 0.075);
    } catch (error) {
      console.warn("INTERFACE SOUND ERROR:", error);
    }
  }

  document.addEventListener("pointerdown", event => {
    const target = event.target.closest?.(
      "button, [role='button'], .color, #pixel-canvas, .unblock-block, .sokoban-board"
    );

    if (!target || target.disabled || target.getAttribute("aria-disabled") === "true") {
      return;
    }

    playPop();
  }, { passive: true });
})();
