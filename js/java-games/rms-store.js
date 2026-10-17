// One game and one JAR hash per namespace. The iframe never receives IDB access.
export const MAX_RMS_BYTES = 4 * 1024 * 1024;
export function validateSnapshot(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Некорректные данные RMS.');
  const entries = Object.entries(value);
  if (entries.length > 4096) throw new Error('Слишком много записей RMS.');
  let bytes = 0;
  const copy = Object.create(null);
  for (const [key, data] of entries) {
    if (key.length > 512 || typeof data !== 'string' || ['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('Некорректная запись RMS.');
    bytes += (key.length + data.length) * 2;
    if (bytes > MAX_RMS_BYTES) throw new Error('Достигнут лимит сохранений игры (4 МБ).');
    copy[key] = data;
  }
  return copy;
}
export function createRmsStore(game, factory = globalThis.indexedDB) {
  if (!/^[a-z0-9-]{1,96}$/.test(game.id) || !/^[a-f0-9]{64}$/.test(game.sha256)) throw new Error('Некорректный идентификатор игры.');
  const namespace = `${game.id}@${game.sha256}`;
  let database;
  function open() {
    if (database) return database;
    database = new Promise((resolve, reject) => {
      if (!factory) { reject(new Error('Браузер не предоставляет IndexedDB для сохранений.')); return; }
      let blocked = false;
      const request = factory.open('spb-java-me-rms-v1', 1);
      request.onupgradeneeded = () => { request.result.createObjectStore('saves'); };
      request.onerror = () => reject(request.error || new Error('Не удалось открыть RMS.'));
      request.onblocked = () => { blocked = true; reject(new Error('Хранилище RMS занято другой вкладкой.')); };
      request.onsuccess = () => {
        const db = request.result;
        if (blocked) { db.close(); return; }
        db.onversionchange = () => { db.close(); database = null; };
        resolve(db);
      };
    });
    return database;
  }
  async function transact(mode, records) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('saves', mode);
      const store = transaction.objectStore('saves');
      const request = mode === 'readwrite' ? store.put(records, namespace) : store.get(namespace);
      let value;
      request.onsuccess = () => { value = request.result; };
      transaction.oncomplete = () => { try { resolve(mode === 'readonly' ? validateSnapshot(value || {}) : undefined); } catch (error) { reject(error); } };
      transaction.onerror = () => reject(transaction.error || new Error('Ошибка записи RMS.'));
      transaction.onabort = () => reject(transaction.error || new Error('Запись RMS отменена.'));
    });
  }
  return {
    load: () => transact('readonly'),
    save: records => transact('readwrite', validateSnapshot(records)),
    async close() { if (database) { const db = await database.catch(() => null); db?.close(); database = null; } }
  };
}
