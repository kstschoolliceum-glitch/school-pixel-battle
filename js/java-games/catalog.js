import { createControls } from './nokia-controls.js';
import { createTutorial } from './tutorial.js';
import { readMode, writeMode, readBindings, writeBindings, readSetting, writeSetting, TUTORIAL_KEY } from './settings.js';
import { GAME, LOCAL_TEST, validateLocalJar, startRuntime } from './runtime.js';
import { GAMES } from './games.js';

let dialog;
let cssLoading;
let session;
let fileBytes = null; // Memory only. Never uploaded, cached or persisted.
function styles() {
  if (cssLoading) return cssLoading;
  cssLoading = new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet'; link.href = 'css/java-games.css?v=2';
    link.onload = resolve;
    link.onerror = () => { link.remove(); cssLoading = null; reject(new Error('Java games CSS unavailable')); };
    document.head.append(link);
  });
  return cssLoading;
}
function cleanup() {
  if (!session) return;
  const previous = session;
  session = null;
  previous.abort.abort();
  previous.controls?.destroy();
  previous.tutorial?.destroy();
  // Abort removes the iframe; normal game exits await stop() before reaching here.
}
function close() {
  cleanup(); fileBytes = null;
  for (const child of dialog.querySelectorAll('dialog[open]')) child.close();
  dialog.close();
  document.getElementById('java-games-open')?.focus();
}
function catalog() {
  cleanup();
  dialog.classList.remove('jg-playing');
  dialog.innerHTML = `<h2 id="jg-title">🎮 Игры</h2><div id="jg-cards"></div>
    <div id="jg-local"></div><p id="jg-file-status" role="status"></p>
    <div class="jg-catalog-footer"><button id="jg-catalog-close" type="button">Закрыть</button></div>`;
  for (const game of GAMES) {
    const card = document.createElement('article'); card.className = 'jg-card';
    const cover = document.createElement('span'); cover.className = 'jg-cover'; cover.textContent = '🎮'; cover.setAttribute('aria-hidden', 'true');
    const body = document.createElement('div');
    const title = document.createElement('h3'); title.textContent = game.name;
    const type = document.createElement('p'); type.textContent = game.type;
    const description = document.createElement('p'); description.textContent = game.description;
    const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Играть'; button.dataset.game = game.id;
    button.disabled = game.localOnly && (!LOCAL_TEST || !fileBytes);
    button.addEventListener('click', () => play(game));
    body.append(title, type, description, button); card.append(cover, body); dialog.querySelector('#jg-cards').append(card);
  }
  if (LOCAL_TEST) {
    const label = document.createElement('label');
    label.className = 'jg-file-label';
    label.textContent = 'Исходный JAR для локального теста (остаётся на устройстве)';
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.jar';
    label.append(input);
    dialog.querySelector('#jg-local').append(label);
    let selection = 0;
    input.addEventListener('change', async () => {
      const generation = ++selection;
      const file = input.files[0];
      fileBytes = null;
      dialog.querySelector(`[data-game="${GAME.id}"]`).disabled = true;
      const status = dialog.querySelector('#jg-file-status');
      status.textContent = 'Проверяем файл…';
      try {
        const bytes = await validateLocalJar(file);
        if (generation !== selection || !input.isConnected || !dialog.open) return;
        fileBytes = bytes;
        dialog.querySelector(`[data-game="${GAME.id}"]`).disabled = false;
        status.textContent = 'Версия JAR подтверждена по SHA-256. Совместимость этой игры пока не подтверждена.';
      } catch (error) {
        if (generation === selection && input.isConnected && dialog.open) status.textContent = error.message;
      }
    });
  }
  dialog.querySelector('#jg-catalog-close').addEventListener('click', close);
}
function play(game) {
  cleanup();
  const state = { abort: new AbortController(), runtime: null, controls: null, tutorial: null, starting: false };
  session = state;
  dialog.classList.add('jg-playing');
  dialog.innerHTML = `<h2 id="jg-title">${game.name}</h2>
    <div class="jg-stage"><canvas width="240" height="320" aria-label="Экран Java ME 240 на 320" hidden></canvas>
      <div class="jg-screen-content"></div></div>
    <div class="jg-panel"><div class="jg-keys"></div>
      <div class="jg-tools"><button type="button" data-action="help">❓ Как управлять</button>
      <button type="button" data-action="mode"></button><button type="button" data-action="bindings">L/R: клавиши</button>
      <button type="button" class="jg-exit" data-action="exit">✕ Выход</button></div></div>`;
  const content = dialog.querySelector('.jg-screen-content');
  const exit = dialog.querySelector('[data-action="exit"]');
  const modeButton = dialog.querySelector('[data-action="mode"]');
  const helpButton = dialog.querySelector('[data-action="help"]');
  let mode = readMode();
  const bindings = readBindings();
  const confirmDialog = document.createElement('dialog');
  confirmDialog.className = 'jg-dialog jg-confirm';
  confirmDialog.setAttribute('aria-labelledby', 'jg-exit-title');
  confirmDialog.innerHTML = '<h2 id="jg-exit-title">Выйти из игры?</h2><p>Штатные сохранения игры не удаляются. Их наличие пока не проверено.</p><div><button type="button" data-confirm="no">Продолжить</button><button type="button" data-confirm="yes" class="jg-exit">Выйти</button></div>';
  dialog.append(confirmDialog);
  const settings = document.createElement('dialog');
  settings.className = 'jg-dialog jg-bindings';
  settings.setAttribute('aria-labelledby', 'jg-bindings-title');
  settings.innerHTML = '<h2 id="jg-bindings-title">Клавиши L и R</h2><p>На ПК: стрелки, Enter — OK, Escape — выход, цифры, * и #.</p><form><label>L <select name="L" aria-label="Клавиша L"></select></label><label>R <select name="R" aria-label="Клавиша R"></select></label><p role="status"></p><button type="submit">Сохранить</button><button type="button" data-dismiss>Отмена</button></form>';
  for (const side of ['L', 'R']) {
    const select = settings.querySelector(`[name="${side}"]`);
    for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') select.add(new Option(letter, `Key${letter}`));
    select.value = bindings[side];
  }
  dialog.append(settings);
  function resume() { state.runtime?.resume(); }
  function askExit() {
    if (session !== state || confirmDialog.open || settings.open) return;
    state.controls.releaseAll(); state.runtime?.pause();
    confirmDialog.showModal();
    confirmDialog.querySelector('[data-confirm="no"]').focus();
  }
  state.askExit = askExit;
  confirmDialog.querySelector('[data-confirm="no"]').onclick = () => { confirmDialog.close(); if (!state.tutorial) resume(); };
  confirmDialog.querySelector('[data-confirm="yes"]').onclick = async () => {
    const button = confirmDialog.querySelector('[data-confirm="yes"]'); button.disabled = true;
    try {
      if (state.runtime) await state.runtime.stop();
      confirmDialog.close(); catalog();
    } catch (error) {
      confirmDialog.querySelector('p').textContent = error.message;
    } finally { button.disabled = false; }
  };
  confirmDialog.addEventListener('cancel', event => { event.preventDefault(); confirmDialog.close(); if (!state.tutorial) resume(); });
  settings.querySelector('[data-dismiss]').onclick = () => { settings.close(); if (!state.tutorial) resume(); };
  settings.addEventListener('cancel', () => { if (!state.tutorial) resume(); });
  settings.querySelector('form').onsubmit = event => {
    event.preventDefault();
    const L = settings.querySelector('[name="L"]').value;
    const R = settings.querySelector('[name="R"]').value;
    const message = settings.querySelector('[role="status"]');
    if (L === R) { message.textContent = 'Выбери разные клавиши.'; return; }
    Object.assign(bindings, { L, R });
    message.textContent = writeBindings(bindings) ? '' : 'Не удалось сохранить настройки в браузере.';
    if (!message.textContent) { settings.close(); if (!state.tutorial) resume(); }
  };
  state.controls = createControls(dialog.querySelector('.jg-keys'), {
    bindings,
    isActive: () => session === state && dialog.open && !confirmDialog.open && !settings.open,
    onExit: askExit,
    onKey: (key, down) => { if (state.tutorial) state.tutorial.key(key, down); else state.runtime?.key(key, down); }
  });
  function updateMode() {
    state.controls.setMode(state.tutorial ? 'full' : mode);
    modeButton.textContent = mode === 'full' ? 'Компактно' : 'Все кнопки';
    modeButton.disabled = Boolean(state.tutorial);
  }
  async function start() {
    if (state.starting || state.runtime || state.abort.signal.aborted) return;
    state.starting = true;
    helpButton.disabled = true;
    content.replaceChildren();
    const status = document.createElement('p'); status.setAttribute('role', 'status');
    status.textContent = 'Запускаем игру…'; content.append(status);
    try {
      let jar = fileBytes;
      if (game.jarUrl) {
        const download = new AbortController();
        const abortDownload = () => download.abort(state.abort.signal.reason);
        state.abort.signal.addEventListener('abort', abortDownload, { once:true });
        const timeout = setTimeout(() => download.abort(new Error('Не удалось загрузить JAR за 20 секунд. Повтори запуск.')), 20000);
        try {
          const response = await fetch(game.jarUrl, { signal:download.signal });
          if (!response.ok) throw new Error('Не удалось загрузить тестовый JAR.');
          jar = await response.arrayBuffer();
        } finally {
          clearTimeout(timeout); state.abort.signal.removeEventListener('abort', abortDownload);
        }
      }
      const runtime = await startRuntime({ jar, canvas: dialog.querySelector('canvas'), game, signal: state.abort.signal });
      if (state.abort.signal.aborted) { runtime.stop(); return; }
      state.runtime = runtime;
      content.replaceChildren();
      runtime.onExit = async () => { try { await runtime.stop(); catalog(); } catch (error) { runtime.onError(error); } };
      runtime.onError = error => {
        state.runtime = null;
        content.replaceChildren(); const message = document.createElement('p'); message.textContent = error.message;
        const back = document.createElement('button'); back.type = 'button'; back.textContent = 'К каталогу'; back.onclick = catalog;
        content.append(message, back);
      };
    } catch (error) {
      if (state.abort.signal.aborted) return;
      status.textContent = error.message;
      const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = 'Повторить запуск';
      retry.onclick = start;
      const back = document.createElement('button'); back.type = 'button'; back.textContent = 'К каталогу'; back.onclick = catalog;
      content.append(retry, back);
    } finally { state.starting = false; helpButton.disabled = false; }
  }
  function tutorial() {
    if (state.tutorial || state.starting) return;
    state.controls.releaseAll(); state.runtime?.pause();
    if (state.runtime) state.runtime.frame.hidden = true;
    content.replaceChildren();
    state.tutorial = createTutorial(content, {
      controls: state.controls, exitButton: exit, resume: Boolean(state.runtime),
      onDone: () => {
        state.controls.releaseAll();
        const saved = writeSetting(TUTORIAL_KEY, 'done');
        state.tutorial.destroy(); state.tutorial = null;
        updateMode();
        if (state.runtime) { content.replaceChildren(); state.runtime.frame.hidden = false; resume(); }
        else void start();
        if (!saved) {
          const warning = document.createElement('p'); warning.textContent = 'Браузер не сохранил прохождение обучения. При следующем входе оно появится снова.';
          content.append(warning);
        }
      }
    });
    updateMode();
  }
  helpButton.onclick = tutorial;
  modeButton.onclick = () => { state.controls.releaseAll(); mode = mode === 'full' ? 'compact' : 'full'; writeMode(mode); updateMode(); };
  exit.onclick = askExit;
  dialog.querySelector('[data-action="bindings"]').onclick = () => {
    for (const side of ['L', 'R']) settings.querySelector(`[name="${side}"]`).value = bindings[side];
    state.controls.releaseAll(); state.runtime?.pause(); settings.showModal();
  };
  updateMode();
  if (readSetting(TUTORIAL_KEY) === 'done') void start(); else tutorial();
}
export async function openGames() {
  await styles();
  if (!dialog) {
    dialog = document.createElement('dialog');
    dialog.id = 'java-games-dialog'; dialog.className = 'jg-dialog';
    dialog.setAttribute('aria-labelledby', 'jg-title');
    dialog.addEventListener('cancel', event => { event.preventDefault(); if (session) session.askExit(); else dialog.querySelector('#jg-catalog-close')?.focus(); });
    dialog.addEventListener('close', () => { cleanup(); fileBytes = null; });
    document.body.append(dialog);
  }
  if (dialog.open) return;
  catalog(); dialog.showModal();
}
