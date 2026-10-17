import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Small event/element doubles for testing the input boundary, not game emulation.
class Element extends EventTarget {
  children = []; hidden = false; dataset = {};
  classes = new Set();
  classList = { add: key => this.classes.add(key), remove: key => this.classes.delete(key),
    toggle: (key, force) => force ? this.classes.add(key) : this.classes.delete(key) };
  append(child) { this.children.push(child); }
  replaceChildren() { this.children = []; }
  setAttribute() {}
  setPointerCapture() {}
  focus() {}
  remove() { this.removed = true; }
  set innerHTML(value) { this.children = [...value.matchAll(/<(small|h2|p|strong|button)\b/g)].map(() => new Element()); }
  matches() { return false; }
  closest() { return null; }
}
function event(type, fields = {}) {
  const e = new Event(type, { cancelable: true });
  Object.assign(e, fields); return e;
}
globalThis.window = new Element();
globalThis.document = new Element();
document.createElement = () => new Element();
globalThis.location = { hostname: 'localhost' };
const storage = new Map();
globalThis.localStorage = { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v) };
const { createControls, KEYS } = await import('../js/java-games/nokia-controls.js');
const settings = await import('../js/java-games/settings.js');
const runtime = await import('../js/java-games/runtime.js');
const host = new Element();
let log = [];
let exitCount = 0;
let active = true;
const bindings = { L: 'KeyQ', R: 'KeyE' };
let controls = createControls(host, { onKey: (...v) => log.push(v), onExit: () => exitCount++, bindings, isActive: () => active });
const button = key => host.children.flatMap(g => g.children).find(b => b.dataset?.key === key);

test('all Nokia keys and key codes are available', () => {
  assert.equal(Object.keys(KEYS).length, 19);
  for (const key of Object.keys(KEYS)) assert.ok(button(key), key);
  assert.equal(KEYS.ok, -5); assert.equal(KEYS['*'], 42); assert.equal(KEYS['#'], 35);
});
test('pointer holds, multiple pointers on one key and cancellation release exactly once', () => {
  log = [];
  button('right').dispatchEvent(event('pointerdown', { pointerId: 1 }));
  button('right').dispatchEvent(event('pointerdown', { pointerId: 2 }));
  button('ok').dispatchEvent(event('pointerdown', { pointerId: 3 }));
  assert.deepEqual(log, [['right', true], ['ok', true]]);
  button('right').dispatchEvent(event('pointerup', { pointerId: 1 }));
  assert.equal(log.length, 2);
  button('right').dispatchEvent(event('pointercancel', { pointerId: 2 }));
  button('ok').dispatchEvent(event('lostpointercapture', { pointerId: 3 }));
  assert.deepEqual(log.slice(2), [['right', false], ['ok', false]]);
});
test('keyboard arrows, Enter, symbols, digits, numpad, L/R and Escape', () => {
  for (const [code, key, expected] of [['ArrowUp', 'ArrowUp', 'up'], ['ArrowDown', 'ArrowDown', 'down'], ['ArrowLeft', 'ArrowLeft', 'left'], ['ArrowRight', 'ArrowRight', 'right'], ['Enter', 'Enter', 'ok'], ['KeyQ', 'q', 'L'], ['KeyE', 'e', 'R'], ['Digit3', '#', '#'], ['NumpadMultiply', '*', '*'], ...[...'0123456789'].map(n => [`Digit${n}`, n, n]), ['Numpad2', '2', '2']]) {
    log = [];
    const down = event('keydown', { code, key }); window.dispatchEvent(down);
    window.dispatchEvent(event('keydown', { code, key, repeat: true }));
    window.dispatchEvent(event('keyup', { code, key }));
    assert.deepEqual(log, [[expected, true], [expected, false]]);
    assert.ok(down.defaultPrevented);
  }
  window.dispatchEvent(event('keydown', { code: 'Escape' })); assert.equal(exitCount, 1);
});
test('blur, hidden document, mode switching, remapping and inactive modal do not leave held keys', () => {
  log = [];
  window.dispatchEvent(event('keydown', { code: 'KeyQ' })); window.dispatchEvent(event('blur'));
  window.dispatchEvent(event('keydown', { code: 'KeyQ' })); document.hidden = true; document.dispatchEvent(event('visibilitychange')); document.hidden = false;
  button('1').dispatchEvent(event('pointerdown', { pointerId: 1 })); controls.setMode('compact');
  assert.deepEqual(log, [['L', true], ['L', false], ['L', true], ['L', false], ['1', true], ['1', false]]);
  assert.ok(host.children[1].hidden);
  controls.setMode('full'); assert.equal(host.children[1].hidden, false);
  bindings.L = 'KeyZ'; log = [];
  window.dispatchEvent(event('keydown', { code: 'KeyZ' })); window.dispatchEvent(event('keyup', { code: 'KeyZ' }));
  assert.deepEqual(log, [['L', true], ['L', false]]);
  active = false; log = []; window.dispatchEvent(event('keydown', { code: 'ArrowUp' }));
  assert.equal(log.length, 0); active = true;
});
test('destroy removes input listeners and releases remaining keys', () => {
  log = []; window.dispatchEvent(event('keydown', { code: 'ArrowUp' })); controls.destroy();
  window.dispatchEvent(event('keydown', { code: 'ArrowUp' }));
  assert.deepEqual(log, [['up', true], ['up', false]]); assert.equal(host.children.length, 0);
});
test('versioned preferences tolerate corrupt and denied storage', () => {
  assert.equal(settings.readMode(), 'full'); settings.writeMode('compact'); assert.equal(settings.readMode(), 'compact');
  settings.writeBindings({ L: 'KeyZ', R: 'KeyX' }); assert.deepEqual(settings.readBindings(), { L: 'KeyZ', R: 'KeyX' });
  localStorage.setItem('spb.java-games.bindings.v1', 'null'); assert.deepEqual(settings.readBindings(), { L: 'KeyQ', R: 'KeyE' });
  const original = globalThis.localStorage;
  globalThis.localStorage = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  assert.equal(settings.readMode(), 'full'); assert.equal(settings.writeSetting(settings.TUTORIAL_KEY, 'done'), false);
  globalThis.localStorage = original;
});
test('runtime fails explicitly instead of reporting fake gameplay or progress', async () => {
  const signal = new AbortController().signal;
  await assert.rejects(runtime.startRuntime({ signal }), /JAR недоступен/);
  await assert.rejects(runtime.startRuntime({ signal, jar: new ArrayBuffer(1) }), /эмулятор ещё не подключён/);
  const abort = new AbortController(); abort.abort();
  await assert.rejects(runtime.startRuntime({ signal: abort.signal }), /aborted/i);
  const file = new Blob(['invalid']); file.name = 'test.jar';
  await assert.rejects(runtime.validateLocalJar(file), /не соответствует/);
});
test('entrypoint stays lazy and game navigation is immediately after player card', async () => {
  const entry = await readFile(new URL('../js/java-games-entry.js', import.meta.url), 'utf8');
  assert.match(entry, /addEventListener\('click'[\s\S]+import\(/);
  const html = await readFile(new URL('../html/game-section.html', import.meta.url), 'utf8');
  assert.match(html, /🪪 Визитка\s*<\/button>\s*<button id="java-games-open"/);
});


test('tutorial gates interactive steps and only starts after the final button', async () => {
  const { createTutorial } = await import('../js/java-games/tutorial.js');
  const host = new Element();
  let highlighted = [];
  let completed = 0;
  const tutorial = createTutorial(host, {
    controls: { highlight(keys) { highlighted = keys; } }, exitButton: new Element(),
    onDone() { completed++; }, resume: false
  });
  const section = host.children[0];
  const title = section.children[1];
  const next = section.children[4];
  const click = () => next.dispatchEvent(event('click'));
  click(); assert.equal(title.textContent, 'Управляй персонажем');
  click(); assert.equal(title.textContent, 'Управляй персонажем');
  tutorial.key('left', true); assert.ok(next.disabled);
  tutorial.key('right', false); assert.ok(next.disabled);
  tutorial.key('right', true); assert.equal(next.disabled, false);
  click(); assert.equal(title.textContent, 'Общайся и выбирай');
  tutorial.key('ok', true); click();
  assert.equal(title.textContent, 'Не забывай про цифры!');
  tutorial.key('*', true); assert.ok(next.disabled);
  tutorial.key('0', true); click();
  assert.deepEqual(highlighted, ['L', 'R']); click();
  assert.equal(title.textContent, 'Как выйти из игры?'); click();
  assert.equal(next.textContent, '🎮 Начать игру'); assert.equal(completed, 0);
  click(); assert.equal(completed, 1);
  tutorial.destroy(); assert.deepEqual(highlighted, []); assert.ok(section.removed);
});
