// Intentionally fail closed: no unreviewed VM runs beside the authenticated app.
// Replace this module only with an audited, restricted Worker adapter. See docs/java-games.md.
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
export async function startRuntime({ jar, signal }) {
  signal.throwIfAborted();
  if (!LOCAL_TEST || !jar) throw new Error('JAR недоступен. Для локальной проверки выбери исходный файл игры на localhost.');
  throw new Error('Запуск пока недоступен: изолированный Java ME-эмулятор ещё не подключён. Совместимость и сохранения не подтверждены.');
}
