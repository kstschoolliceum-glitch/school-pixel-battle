/* JS2ME integration. Runs only inside the opaque iframe, or the native-canvas test harness. */
(function(global) {
  const nativeSetTimeout = global.setTimeout.bind(global);
  const nativeClearTimeout = global.clearTimeout.bind(global);
  global.installJavaMe = function({ records, persist, onFrame, onError, onExit = () => {} }) {
    const machine = global.js2me;
    let paused = false, stopped = false, painting = false;
    let sequence = Promise.resolve();
    let rmsDepth = 0;
    let audioContext;
    const held = new Map(), tasks = new Map();
    let taskId = 0;
    const cache = Object.assign(Object.create(null), records);
    const storage = new Proxy(Object.create(null), {
      get(_, key) {
        if (key === 'getItem') return key => Object.hasOwn(cache, key) ? cache[key] : null;
        if (key === 'setItem') return (key, value) => { cache[key] = String(value); };
        if (key === 'removeItem') return key => { delete cache[key]; };
        return cache[key];
      },
      set(_, key, value) { cache[key] = String(value); return true; },
      ownKeys() { return Object.keys(cache); },
      getOwnPropertyDescriptor(_, key) { if (Object.hasOwn(cache, key)) return { configurable:true, enumerable:true, value:cache[key] }; }
    });
    function schedule(fn, ms, ...args) {
      const id = ++taskId;
      const task = { fn: () => fn(...args), remaining: Math.max(0, Number(ms) || 0) };
      tasks.set(id, task);
      if (!paused && !stopped) arm(id, task);
      return id;
    }
    function arm(id, task) {
      task.at = Date.now();
      task.timer = nativeSetTimeout(() => { tasks.delete(id); if (!stopped) { try { task.fn(); } catch (error) { onError(error); } } }, task.remaining);
    }
    global.setTimeout = schedule;
    global.clearTimeout = id => { const task = tasks.get(id); if (task) { nativeClearTimeout(task.timer); tasks.delete(id); } };
    global.setZeroTimeout = fn => schedule(fn, 0);
    machine.config.width = 240; machine.config.height = 320; machine.config.fullHeight = 320;
    machine.config.workers = false; machine.config.app = true;
    machine.codeCache = { getItem() { return null; } };
    machine.rmsStorage = storage;
    machine.showError = message => onError(new Error(String(message)));
    machine.setFullscreen = () => {};
    function durable(fn) {
      return machine.markUnsafe(function(...args) {
        if (rmsDepth) return fn.apply(this, args);
        const self = this;
        let result, failure;
        const thread = machine.suspendThread(function() {
          if (failure) throw new global.javaRoot.$javax.$microedition.$rms.$RecordStoreException(failure.message);
          return result;
        });
        sequence = sequence.catch(() => {}).then(async () => {
          const before = { ...cache };
          try {
            rmsDepth++;
            try { result = fn.apply(self, args); } finally { rmsDepth--; }
            await persist({ ...cache }); // Resolve only after host transaction.oncomplete.
          } catch (error) {
            for (const key of Object.keys(cache)) delete cache[key];
            Object.assign(cache, before); failure = error;
          }
          if (!stopped) schedule(() => machine.restoreThread(thread), 0);
        });
      });
    }
    function tone(note, duration, volume) {
      if (!global.AudioContext && !global.webkitAudioContext) throw new Error('Web Audio недоступен.');
      audioContext ||= new (global.AudioContext || global.webkitAudioContext)();
      audioContext.resume().catch(error => console.warn('Audio activation:', error.message));
      const oscillator = audioContext.createOscillator(), gain = audioContext.createGain();
      oscillator.frequency.value = 440 * Math.pow(2, (note - 69) / 12);
      gain.gain.value = Math.max(0, Math.min(100, volume)) / 300;
      oscillator.connect(gain); gain.connect(audioContext.destination);
      oscillator.start(); oscillator.stop(audioContext.currentTime + Math.max(1, Math.min(10000, duration)) / 1000);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    }
    machine.loadScript = (name, success, failure) => schedule(() => {
      const load = global.JS2ME_CLASS_SOURCES[name];
      if (!load) { if (failure) failure(); else onError(new Error('Java API не поддерживается: ' + name)); return; }
      try {
        load();
        if (name.endsWith('/rms/RecordStore.js')) {
          const proto = machine.classBucket.prototype;
          for (const method of ['$openRecordStore$Ljava_lang_String_Z$Ljavax_microedition_rms_RecordStore_', '$addRecord$_BII$I', '$setRecord$I_BII$V', '$closeRecordStore$$V', '$deleteRecordStore$Ljava_lang_String_$V']) {
            if (proto[method]) proto[method] = durable(proto[method]);
          }
        }
        if (name.endsWith('/java/lang/System.js')) Object.assign(machine.classBucket.prototype.properties, { 'microedition.configuration':'CLDC-1.1', 'microedition.profiles':'MIDP-2.0', 'microedition.platform':'NokiaS40', 'microedition.locale':'ru-RU' });
        if (name.endsWith('/java/lang/Throwable.js')) machine.classBucket.prototype.$printStackTrace$$V = function() { console.warn(this.className, this.message?.text || '', this.stack || ''); };
        if (name.endsWith('/lcdui/Canvas.js')) machine.classBucket.prototype.$keyRepeated$I$V = function() {};
        if (name.endsWith('/midlet/MIDlet.js')) machine.classBucket.prototype.$notifyDestroyed$$V = onExit;
        if (name.endsWith('/media/Manager.js')) machine.classBucket.prototype.$playTone$III$V = tone;
        success();
      } catch (error) { onError(error); }
    }, 0);
    // Detect actual draw calls, not merely an allocated or visible canvas.
    const createElement = global.document.createElement.bind(global.document);
    global.document.createElement = function(name, ...args) {
      const element = createElement(name, ...args);
      if (name === 'canvas') {
        const getContext = element.getContext.bind(element);
        element.getContext = function(...args) {
          const context = getContext(...args);
          if (context && !context.spbObserved) {
            context.spbObserved = true;
            for (const method of ['fillRect','fillText','drawImage','putImageData','strokeRect']) {
              const original = context[method].bind(context);
              context[method] = function(...args) {
                const value = original(...args);
                if (element.isConnected && !painting) {
                  painting = true;
                  nativeSetTimeout(() => { painting = false; if (!stopped) onFrame(element); }, 0);
                }
                return value;
              };
            }
          }
          return context;
        };
      }
      return element;
    };
    function releaseKeys() {
      for (const [key, timer] of held) { global.clearTimeout(timer); machine.sendKeyReleasedEvent(key); }
      held.clear();
    }
    function repeat(key) {
      if (!held.has(key) || paused || stopped) return;
      const listeners = machine.listeners.keypress;
      // Java Canvas has a separate keyRepeated callback; never convert it to a fresh press.
      for (const listener of listeners) { if (listener.spbCanvas) machine.launchThread(() => listener.spbCanvas.$keyRepeated$I$V(key)); }
      held.set(key, schedule(() => repeat(key), 100));
    }
    return {
      boot(bytes) {
        machine.loadJAR(new Blob([bytes]), () => {
          machine.launchMidlet(1);
        });
      },
      key(code, down) {
        if (stopped || paused) return;
        if (down) {
          if (held.has(code)) return;
          machine.sendKeyPressEvent(code);
          if (code === -6) global.document.getElementById('choice').dispatchEvent(new Event('mousedown'));
          if (code === -7) global.document.getElementById('back').dispatchEvent(new Event('mousedown'));
          held.set(code, schedule(() => repeat(code), 450));
        } else if (held.has(code)) {
          global.clearTimeout(held.get(code)); held.delete(code); machine.sendKeyReleasedEvent(code);
        }
      },
      pause() {
        releaseKeys(); paused = true;
        for (const task of tasks.values()) { nativeClearTimeout(task.timer); task.remaining = Math.max(0, task.remaining - (Date.now() - task.at)); }
        global.document.querySelectorAll?.('audio').forEach(audio => { audio.spbWasPlaying = !audio.paused; audio.pause(); });
        audioContext?.suspend();
      },
      resume() {
        if (!paused || stopped) return; paused = false;
        for (const [id, task] of tasks) arm(id, task);
        global.document.querySelectorAll?.('audio').forEach(audio => { if (audio.spbWasPlaying) audio.play().catch(error => console.warn('Audio activation:', error.message)); });
        audioContext?.resume().catch(error => console.warn('Audio activation:', error.message));
      },
      async flush() { await sequence; await persist({ ...cache }); },
      async stop() {
        releaseKeys(); this.pause(); await this.flush(); stopped = true; machine.kill = true;
        for (const task of tasks.values()) nativeClearTimeout(task.timer); tasks.clear();
        global.document.querySelectorAll?.('audio').forEach(audio => { audio.pause(); audio.removeAttribute('src'); audio.load(); });
        await audioContext?.close();
      }
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
