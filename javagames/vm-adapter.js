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
    let displayable = null, commandMenu = null;
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
      deleteProperty(_, key) { delete cache[key]; return true; },
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
    function unlockAudio() {
      if (global.AudioContext || global.webkitAudioContext) {
        audioContext ||= new (global.AudioContext || global.webkitAudioContext)();
        audioContext.resume().catch(error => console.warn('Audio activation:', error.message));
      }
      global.document.querySelectorAll?.('audio').forEach(audio => { if (audio.spbWanted) audio.play().catch(error => console.warn('Audio activation:', error.message)); });
    }
    function tone(note, duration, volume) {
      unlockAudio();
      if (!audioContext) throw new Error('Web Audio недоступен.');
      const oscillator = audioContext.createOscillator(), gain = audioContext.createGain();
      oscillator.frequency.value = 440 * Math.pow(2, (note - 69) / 12);
      gain.gain.value = Math.max(0, Math.min(100, volume)) / 300;
      oscillator.connect(gain); gain.connect(audioContext.destination);
      oscillator.start(); oscillator.stop(audioContext.currentTime + Math.max(1, Math.min(10000, duration)) / 1000);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    }
    function invokeCommand(command, target = displayable) {
      if (command && target?.commandListener) machine.launchThread(() => target.commandListener.$commandAction$Ljavax_microedition_lcdui_Command_Ljavax_microedition_lcdui_Displayable_$V(command, target));
    }
    function selectItem(target) {
      const index = Math.max(0, target.selectedItem || 0);
      target.selectedItem = index;
      target.items?.forEach((item, i) => item.element.classList.toggle('spb-selected', i === index));
    }
    function closeCommands() { commandMenu?.element.remove(); commandMenu = null; }
    function uiKey(code) {
      if (commandMenu) {
        if (code === -7) closeCommands();
        else if (code === -1 || code === -2) {
          commandMenu.index = (commandMenu.index + (code === -1 ? -1 : 1) + commandMenu.commands.length) % commandMenu.commands.length;
          Array.from(commandMenu.element.children).forEach((node, i) => node.classList.toggle('spb-selected', i === commandMenu.index));
        } else if (code === -5 || code === -6) {
          const command = commandMenu.commands[commandMenu.index]; closeCommands(); invokeCommand(command);
        }
        return true;
      }
      if (!displayable) return false;
      const choices = code === -6 ? displayable.choiceCommands : code === -7 ? displayable.backCommands : null;
      if (choices?.length) {
        if (choices.length === 1) invokeCommand(choices[0]);
        else {
          const element = global.document.createElement('div'); element.className = 'spb-command-menu';
          choices.forEach((command, i) => {
            const item = global.document.createElement('div'); item.textContent = command.label.text;
            item.className = i === 0 ? 'spb-selected' : ''; element.appendChild(item);
          });
          global.document.getElementById('screen').appendChild(element);
          commandMenu = { element, commands:choices, index:0 };
        }
        return true;
      }
      if (!displayable.keyPressListener && displayable.items) {
        if (code === -1 || code === -2) {
          if (displayable.items.length) displayable.selectedItem = ((displayable.selectedItem || 0) + (code === -1 ? -1 : 1) + displayable.items.length) % displayable.items.length;
          selectItem(displayable);
        } else if (code === -5) invokeCommand(displayable.command || displayable.choiceCommands?.[0]);
        return true;
      }
      if (!displayable.keyPressListener && code === -5) { invokeCommand(displayable.choiceCommands?.[0]); return true; }
      return false;
    }
    machine.loadScript = (name, success, failure) => schedule(() => {
      const load = global.JS2ME_CLASS_SOURCES[name];
      if (!load) { if (failure) failure(); else onError(new Error('Java API не поддерживается: ' + name)); return; }
      try {
        load();
        if (name.endsWith('/lcdui/Image.js')) {
          const proto = machine.classBucket.prototype;
          proto.require = [...(proto.require || []), 'javaRoot.$java.$lang.$IllegalArgumentException'];
          proto.$getRGB$_IIIIIII$V = function(target, offset, scanlength, x, y, width, height) {
            if (!target) throw new global.javaRoot.$java.$lang.$NullPointerException();
            if (width < 0 || height < 0 || x < 0 || y < 0 || x + width > this.element.width || y + height > this.element.height) throw new global.javaRoot.$java.$lang.$IllegalArgumentException();
            if (!width || !height) return;
            const last = offset + (height - 1) * scanlength;
            if (Math.min(offset,last) < 0 || Math.max(offset,last) + width > target.length) throw new global.javaRoot.$java.$lang.$ArrayIndexOutOfBoundsException();
            const rgba = this.element.getContext('2d').getImageData(x,y,width,height).data;
            for (let row=0; row<height; row++) for (let col=0; col<width; col++) {
              const i = (row * width + col) * 4;
              target[offset + row * scanlength + col] = (rgba[i+3] << 24) | (rgba[i] << 16) | (rgba[i+1] << 8) | rgba[i+2];
            }
          };
        }
        if (name.endsWith('/lcdui/Graphics.js')) {
          machine.classBucket.prototype.$drawRGB$_IIIIIIIZ$V = function(data, offset, scanlength, x, y, width, height, alpha) {
            if (!data) throw new global.javaRoot.$java.$lang.$NullPointerException();
            if (width <= 0 || height <= 0) return;
            const last = offset + (height - 1) * scanlength;
            if (Math.min(offset,last) < 0 || Math.max(offset,last) + width > data.length) throw new global.javaRoot.$java.$lang.$ArrayIndexOutOfBoundsException();
            const tile = global.document.createElement('canvas'); tile.width = width; tile.height = height;
            const context = tile.getContext('2d'), pixels = context.createImageData(width,height);
            for (let row=0; row<height; row++) for (let col=0; col<width; col++) {
              const value = data[offset + row * scanlength + col], i = (row * width + col) * 4;
              pixels.data[i] = (value >>> 16) & 255; pixels.data[i+1] = (value >>> 8) & 255;
              pixels.data[i+2] = value & 255; pixels.data[i+3] = alpha ? value >>> 24 : 255;
            }
            context.putImageData(pixels,0,0); this.context.drawImage(tile,x,y);
          };
        }
        if (name.endsWith('/lcdui/Display.js')) {
          const proto = machine.classBucket.prototype;
          const original = proto.$setCurrent$Ljavax_microedition_lcdui_Displayable_$V;
          proto.$setCurrent$Ljavax_microedition_lcdui_Displayable_$V = function(next) {
            closeCommands(); displayable = next;
            original.call(this, next);
            schedule(() => {
              if (next !== displayable || !next?.element?.isConnected) return;
              selectItem(next);
              // A real LCDUI List/Alert is rendered by DOM, rather than Canvas.paint().
              if (!next.keyPressListener) onFrame(next.element);
            }, 2);
          };
        }
        if (name.endsWith('/lcdui/List.js')) {
          const proto = machine.classBucket.prototype;
          const append = proto.$append$Ljava_lang_String_Ljavax_microedition_lcdui_Image_$I;
          proto.$append$Ljava_lang_String_Ljavax_microedition_lcdui_Image_$I = function(...args) { append.apply(this,args); selectItem(this); return this.items.length - 1; };
          const clear = proto.$deleteAll$$V;
          proto.$deleteAll$$V = function() { clear.call(this); this.items = []; this.selectedItem = 0; };
          const select = proto.$setSelectedIndex$IZ$V;
          proto.$setSelectedIndex$IZ$V = function(...args) { select.apply(this,args); selectItem(this); };
        }
        if (name.endsWith('/lcdui/Alert.js')) {
          const proto = machine.classBucket.prototype;
          const init = proto._init$Ljava_lang_String_$V;
          proto._init$Ljava_lang_String_$V = function(title) { this.element = global.document.createElement('div'); init.call(this,title); };
          proto.$setString$Ljava_lang_String_$V = function(text) { this.text = text; this.element.textContent = text?.text || ''; };
        }
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
        if (name.endsWith('/media/PlayerImpl.js')) {
          const proto = machine.classBucket.prototype;
          proto.$start$$V = function() {
            if (this.state === this.$CLOSEDI) throw new global.javaRoot.$java.$lang.$IllegalStateException();
            this.state = this.$STARTEDI; this.repeated = 0; this.element.spbWanted = true;
            this.element.play().catch(error => console.warn('Audio activation:', error.message));
          };
          for (const name of ['$stop$$V', '$close$$V', '$deallocate$$V']) {
            const previous = proto[name];
            proto[name] = function() { this.element.spbWanted = false; this.element.pause(); return previous.apply(this, arguments); };
          }
        }
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
      unlockAudio,
      boot(bytes) {
        machine.loadJAR(new Blob([bytes]), () => {
          machine.launchMidlet(1);
        });
      },
      key(code, down) {
        if (stopped || paused) return;
        if (down) {
          if (held.has(code)) return;
          if (uiKey(code)) return;
          machine.sendKeyPressEvent(code);
          if (code === -6) global.document.getElementById('choice').dispatchEvent(new Event('mousedown'));
          if (code === -7) global.document.getElementById('back').dispatchEvent(new Event('mousedown'));
          held.set(code, schedule(() => repeat(code), 450));
        } else if (held.has(code)) {
          global.clearTimeout(held.get(code)); held.delete(code); machine.sendKeyReleasedEvent(code);
        }
      },
      pause() {
        if (paused || stopped) return;
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
