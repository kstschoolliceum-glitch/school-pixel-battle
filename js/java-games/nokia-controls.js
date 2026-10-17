export const KEYS = Object.freeze({ up: -1, down: -2, left: -3, right: -4, ok: -5, L: -6, R: -7,
  '0': 48, '1': 49, '2': 50, '3': 51, '4': 52, '5': 53, '6': 54, '7': 55, '8': 56, '9': 57, '*': 42, '#': 35 });
const navigation = [['L', 'L'], ['up', '↑'], ['R', 'R'], ['left', '←'], ['ok', 'OK'], ['right', '→'], [null, ''], ['down', '↓']];
export function createControls(host, { onKey, onExit, bindings, isActive }) {
  const abort = new AbortController();
  const options = { signal: abort.signal };
  const held = new Map();
  const buttons = new Map();
  function press(source, key) {
    if (held.has(source)) return;
    const alreadyDown = [...held.values()].includes(key);
    held.set(source, key);
    buttons.get(key)?.classList.add('jg-held');
    if (!alreadyDown) onKey(key, true);
  }
  function release(source) {
    const key = held.get(source);
    if (!key) return;
    held.delete(source);
    if (![...held.values()].includes(key)) {
      buttons.get(key)?.classList.remove('jg-held');
      onKey(key, false);
    }
  }
  function releaseAll() { for (const source of [...held.keys()]) release(source); }
  function group(name, entries) {
    const div = document.createElement('div');
    div.className = `jg-${name}`;
    div.setAttribute('role', 'group');
    div.setAttribute('aria-label', name === 'navigation' ? 'Навигация Nokia' : 'Цифры Nokia');
    for (const [key, label] of entries) {
      if (!key) { div.append(document.createElement('span')); continue; }
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.dataset.key = key;
      button.setAttribute('aria-label', ({ up: 'Вверх', down: 'Вниз', left: 'Влево', right: 'Вправо', L: 'Левая функциональная', R: 'Правая функциональная' })[key] || label);
      buttons.set(key, button);
      button.addEventListener('pointerdown', event => {
        if (!isActive() || (event.pointerType === 'mouse' && event.button !== 0)) return;
        event.preventDefault();
        button.setPointerCapture(event.pointerId);
        press(`p${event.pointerId}`, key);
      }, options);
      for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
        button.addEventListener(type, event => release(`p${event.pointerId}`), options);
      }
      // Screen readers and keyboard activation do not emit pointer events.
      button.addEventListener('click', event => {
        if (event.detail === 0 && isActive()) { const source = `a${key}`; press(source, key); release(source); }
      }, options);
      div.append(button);
    }
    host.append(div);
    return div;
  }
  group('navigation', navigation);
  const digits = group('digits', [...'123456789*0#'].map(key => [key, key]));
  function keyFor(event) {
    if (/^[0-9*#]$/.test(event.key)) return event.key;
    if (/^Numpad[0-9]$/.test(event.code)) return event.code.slice(-1);
    if (event.code === 'NumpadMultiply') return '*';
    const map = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'ok', NumpadEnter: 'ok', [bindings.L]: 'L', [bindings.R]: 'R' };
    return map[event.code];
  }
  window.addEventListener('keydown', event => {
    if (!isActive() || event.ctrlKey || event.metaKey || event.altKey || event.target.matches('input,select,textarea')) return;
    if (event.code === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); if (!event.repeat) onExit(); return; }
    // Let Enter activate focused UI actions such as the tutorial's Next button.
    if (event.code === 'Enter' && event.target.closest('.jg-screen-content, .jg-tools')) return;
    const key = keyFor(event);
    if (!key) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    press(`k${event.code}`, key);
  }, { ...options, capture: true });
  window.addEventListener('keyup', event => {
    if (!held.has(`k${event.code}`)) return;
    event.preventDefault(); event.stopImmediatePropagation(); release(`k${event.code}`);
  }, { ...options, capture: true });
  window.addEventListener('blur', releaseAll, options);
  document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAll(); }, options);
  host.addEventListener('contextmenu', event => event.preventDefault(), options);
  return {
    releaseAll,
    setMode(mode) { releaseAll(); digits.hidden = mode === 'compact'; },
    highlight(keys) { for (const [key, button] of buttons) button.classList.toggle('jg-highlight', keys.includes(key)); },
    destroy() { releaseAll(); abort.abort(); host.replaceChildren(); }
  };
}
