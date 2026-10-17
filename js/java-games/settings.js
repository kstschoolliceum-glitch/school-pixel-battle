export const TUTORIAL_KEY = 'spb.java-games.tutorial.v1';
const MODE_KEY = 'spb.java-games.controls.v1';
const BINDINGS_KEY = 'spb.java-games.bindings.v1';
export function readSetting(key, fallback = null) {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
export function writeSetting(key, value) {
  try { localStorage.setItem(key, value); return true; } catch { return false; }
}
export function readMode() { return readSetting(MODE_KEY) === 'compact' ? 'compact' : 'full'; }
export function writeMode(mode) { return writeSetting(MODE_KEY, mode); }
export function readBindings() {
  try {
    const value = JSON.parse(readSetting(BINDINGS_KEY, '{}'));
    if (/^Key[A-Z]$/.test(value.L) && /^Key[A-Z]$/.test(value.R) && value.L !== value.R) return value;
  } catch { /* Storage may be unavailable or contain an older format. */ }
  return { L: 'KeyQ', R: 'KeyE' };
}
export function writeBindings(bindings) { return writeSetting(BINDINGS_KEY, JSON.stringify(bindings)); }
