import { createRmsStore } from './rms-store.js';
import { KEYS } from './nokia-controls.js';
export const LOCAL_TEST = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
export const GAME = Object.freeze({
  id: 'high-school-hook-ups-1.0.7-s40-ru', name: 'High School Hook Ups',
  sha256: 'bb484fe879c8bafac92cee6206dad37d5b3468cf598cdc1da6c523b9e15f02f1', maxBytes: 4 * 1024 * 1024
});
export async function hashJar(bytes) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
}
export async function validateLocalJar(file) {
  if (!LOCAL_TEST) throw new Error('Выбор JAR доступен только при локальном тестировании.');
  if (!file || file.size > GAME.maxBytes || !/\.jar$/i.test(file.name)) throw new Error('Выбери предоставленный JAR-файл игры (до 4 МБ).');
  const bytes = await file.arrayBuffer();
  if (await hashJar(bytes) !== GAME.sha256) throw new Error('Этот JAR не соответствует проверяемой версии игры.');
  return bytes;
}
let active = null;
export async function startRuntime({ jar, canvas, game, signal }) {
  signal.throwIfAborted();
  if (active) throw new Error('Другая Java ME-игра уже запускается или работает.');
  if (!(jar instanceof ArrayBuffer) || !jar.byteLength || jar.byteLength > 4 * 1024 * 1024) throw new Error('JAR недоступен. Выбери файл игры или тестовый MIDlet в каталоге.');
  if (game.id === GAME.id && !LOCAL_TEST) throw new Error('Коммерческий JAR доступен только для локальной проверки.');
  // This module is callable only by the catalog. It accepts exact catalog hashes, never frame-supplied identities.
  const { GAMES } = await import('./games.js');
  const allowed = GAMES.find(entry => entry.id === game.id && entry.sha256 === game.sha256);
  if (!allowed || await hashJar(jar) !== allowed.sha256) throw new Error('Контрольная сумма JAR не совпадает с каталогом.');
  signal.throwIfAborted();
  const owner = {};
  if (active) throw new Error('Java ME-игра уже запущена.');
  active = owner;
  const store = createRmsStore(allowed);
  let frame, timeout, stopTimeout, resolveStop, rejectStop, disposed = false, booted = false;
  const channel = [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join('');
  let rejectStart, adapter, saveBusy = false, lastRequest = 0;
  function send(type, extra = {}, transfer = []) { frame?.contentWindow?.postMessage({ protocol:'spb-j2me-v1', channel, type, ...extra }, '*', transfer); }
  function dispose() {
    if (disposed) return;
    disposed = true;
    clearTimeout(timeout); clearTimeout(stopTimeout);
    signal.removeEventListener('abort', abort);
    window.removeEventListener('message', message);
    frame?.remove();
    void store.close();
    if (active === owner) active = null;
  }
  function abort() { const error = signal.reason || new DOMException('Запуск отменён', 'AbortError'); rejectStart?.(error); rejectStop?.(error); dispose(); }
  function failure(error) { rejectStart?.(error); rejectStop?.(error); adapter?.onError?.(error); dispose(); }
  let resolveStart;
  async function message(event) {
    const data = event.data;
    // A sandboxed opaque frame has origin "null". Both WindowProxy and random channel MUST match.
    if (disposed || event.source !== frame?.contentWindow || event.origin !== 'null' || !data || data.protocol !== 'spb-j2me-v1' || data.channel !== channel) return;
    if (data.type === 'boot' && !booted) {
      booted = true;
      send('start', { jar: jar.slice(0), records: owner.records });
    } else if (data.type === 'started') {
      clearTimeout(timeout); frame.hidden = false; resolveStart?.(adapter); resolveStart = null; rejectStart = null;
    } else if (data.type === 'rms-save' && Number.isSafeInteger(data.id) && data.id > lastRequest) {
      if (saveBusy) { send('rms-ack', { id:data.id, ok:false, message:'Запись RMS уже выполняется.' }); return; }
      saveBusy = true; lastRequest = data.id;
      try { await store.save(data.records); send('rms-ack', { id:data.id, ok:true }); }
      catch (error) { send('rms-ack', { id:data.id, ok:false, message:error.message }); }
      finally { saveBusy = false; }
    } else if (data.type === 'focus-controls') canvas.closest?.('dialog')?.querySelector('.jg-panel button')?.focus({ preventScroll:true });
    else if (data.type === 'game-exit') adapter?.onExit?.();
    else if (data.type === 'stopped') { clearTimeout(stopTimeout); resolveStop?.(); dispose(); }
    else if (data.type === 'error') failure(new Error(String(data.message || 'Ошибка Java ME').slice(0, 500)));
  }
  try {
    owner.records = await store.load();
    signal.throwIfAborted();
    frame = document.createElement('iframe');
    frame.title = 'Экран Java ME'; frame.className = 'jg-runtime-frame'; frame.hidden = true;
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.setAttribute('allow', 'autoplay');
    frame.referrerPolicy = 'no-referrer';
    frame.src = new URL(`../../javagames/#${channel}`, import.meta.url).href;
    frame.tabIndex = -1; // Desktop keys remain in the existing host controls.
    const finished = new Promise((resolve, reject) => { resolveStart = resolve; rejectStart = reject; });
    let stopping;
    adapter = {
      frame,
      onError: null, onExit: null,
      key(key, down) { const code = KEYS[key]; if (code !== undefined && typeof down === 'boolean' && !disposed) send('key', { code, down }); },
      pause() { if (!disposed) send('pause'); },
      resume() { if (!disposed) send('resume'); },
      stop() {
        if (disposed) return Promise.resolve();
        if (stopping) return stopping;
        stopping = new Promise((resolve, reject) => {
          resolveStop = resolve; rejectStop = reject;
          stopTimeout = setTimeout(() => { reject(new Error('Не удалось подтвердить остановку и сохранение RMS.')); dispose(); }, 10000);
          send('stop');
        });
        return stopping;
      }
    };
    window.addEventListener('message', message);
    signal.addEventListener('abort', abort, { once:true });
    timeout = setTimeout(() => failure(new Error('Java ME не показала игровой кадр за 90 секунд. Проверь совместимость JAR и журнал браузера.')), 90000);
    canvas.insertAdjacentElement('afterend', frame);
    return await finished;
  } catch (error) { dispose(); throw error; }
}
