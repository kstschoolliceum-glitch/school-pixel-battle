// Capability gate, NOT a Java ME engine. No no-op runtime object is returned.
// Verified source/build blockers: docs/java-me-runtime-audit.md.
// Do not attach upstream CheerpJ/PluotSorbet to the authenticated page without isolation.
export const LOCAL_TEST = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
export const GAME = Object.freeze({
  id: 'high-school-hook-ups-1.0.7-s40-ru',
  name: 'High School Hook Ups',
  sha256: 'bb484fe879c8bafac92cee6206dad37d5b3468cf598cdc1da6c523b9e15f02f1',
  maxBytes: 4 * 1024 * 1024
});
export async function validateLocalJar(file) {
  if (!LOCAL_TEST) throw new Error('Выбор JAR доступен только при локальном тестировании.');
  if (!file || file.size > GAME.maxBytes || !/\.jar$/i.test(file.name)) throw new Error('Выбери предоставленный JAR-файл игры (до 4 МБ).');
  const bytes = await file.arrayBuffer();
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
  if (hash !== GAME.sha256) throw new Error('Этот JAR не соответствует проверяемой версии игры.');
  return bytes;
}
export class JavaMeUnavailableError extends Error {
  constructor() {
    super('Запуск пока недоступен: изолированный Java ME-эмулятор ещё не подключён. FreeJ2ME-Web требует изоляции загрузчика и CheerpJ; PluotSorbet требует переноса DOM и медиамоста. Совместимость и сохранения не подтверждены.');
    this.name = 'JavaMeUnavailableError';
    this.code = 'JAVA_ME_ISOLATION_REQUIRED';
  }
}
export async function startRuntime({ jar, canvas, game, signal }) {
  signal.throwIfAborted();
  if (!LOCAL_TEST || !jar) throw new Error('JAR недоступен. Для локальной проверки выбери исходный файл игры на localhost.');
  throw new JavaMeUnavailableError();
}
