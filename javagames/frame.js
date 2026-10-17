/* Only this frame runs Java bytecode. It has sandbox="allow-scripts", an opaque origin. */
(() => {
  const channel = location.hash.slice(1);
  const parentOrigin = new URL(location.href).origin;
  if (!/^[a-f0-9]{32}$/.test(channel) || parent === window) return;
  let machine = null, started = false, booting = false, requestId = 0;
  const pending = new Map();
  const send = (type, extra = {}) => parent.postMessage({ protocol: 'spb-j2me-v1', channel, type, ...extra }, parentOrigin);
  function fail(error) { send('error', { message: String(error?.message || error).slice(0, 500) }); }
  function persist(records) {
    return new Promise((resolve, reject) => {
      const id = ++requestId;
      pending.set(id, { resolve, reject });
      send('rms-save', { id, records });
    });
  }
  window.addEventListener('message', async event => {
    const message = event.data;
    if (event.source !== parent || event.origin !== parentOrigin || !message || message.protocol !== 'spb-j2me-v1' || message.channel !== channel) return;
    try {
      if (message.type === 'rms-ack') {
        const promise = pending.get(message.id); if (!promise) return;
        pending.delete(message.id);
        if (message.ok) promise.resolve(); else promise.reject(new Error(message.message || 'Ошибка записи RMS.'));
      } else if (message.type === 'start') {
        if (booting || !(message.jar instanceof ArrayBuffer) || message.jar.byteLength > 4 * 1024 * 1024) return;
        booting = true;
        machine = installJavaMe({ records: message.records, persist, onError: fail, onExit: () => send('game-exit'),
          onFrame() { if (!started) { started = true; send('started'); } }
        });
        machine.boot(message.jar);
      } else if (message.type === 'key' && Number.isInteger(message.code) && [-1,-2,-3,-4,-5,-6,-7,42,35,48,49,50,51,52,53,54,55,56,57].includes(message.code) && typeof message.down === 'boolean') {
        machine?.key(message.code, message.down);
      } else if (message.type === 'pause') machine?.pause();
      else if (message.type === 'resume') machine?.resume();
      else if (message.type === 'stop') { await machine?.stop(); send('stopped'); }
    } catch (error) { fail(error); }
  });
  window.addEventListener('error', event => fail(event.error || event.message));
  window.addEventListener('unhandledrejection', event => fail(event.reason));
  send('boot');
})();
