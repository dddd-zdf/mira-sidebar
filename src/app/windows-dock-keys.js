'use strict';

// Override the Windows-owned chords only while Mira is foreground.
function createDockKeys({ win, dock, onError }) {
  const koffi = require('koffi');
  const path = require('path');
  const user32 = koffi.load(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'user32.dll'));
  const proc = koffi.proto('intptr_t __stdcall MiraDockKeyProc(int code, uintptr_t message, void *data)');
  const install = user32.func('void * __stdcall SetWindowsHookExW(int type, void *callback, void *module, uint32_t thread)');
  const remove = user32.func('int __stdcall UnhookWindowsHookEx(void *hook)');
  const next = user32.func('intptr_t __stdcall CallNextHookEx(void *hook, int code, uintptr_t message, void *data)');
  const foreground = user32.func('void * __stdcall GetForegroundWindow()');
  const keyState = user32.func('int16_t __stdcall GetAsyncKeyState(int key)');
  const keyEvent = user32.func('void __stdcall keybd_event(uint8_t key, uint8_t scan, uint32_t flags, uintptr_t extra)');
  const handle = win.getNativeWindowHandle();
  const own = handle.length === 8 ? handle.readBigUInt64LE() : BigInt(handle.readUInt32LE());
  let disposed = false;
  const swallowed = new Set();
  const held = key => (keyState(key) & 0x8000) !== 0;
  const callback = koffi.register((code, message, data) => {
    if (code < 0 || disposed) return next(null, code, message, data);
    try {
      const key = koffi.decode(data, 'uint32_t');
      if (key !== 0x25 && key !== 0x27) return next(null, code, message, data);
      const kind = Number(message);
      const up = kind === 0x101 || kind === 0x105;
      if (up && swallowed.delete(key)) return 1;
      if (!up && swallowed.has(key)) return 1;
      if (up || (kind !== 0x100 && kind !== 0x104) || foreground() !== own ||
          !(held(0x5b) || held(0x5c)) || held(0x10) || held(0x11) || held(0x12)) {
        return next(null, code, message, data);
      }
      swallowed.add(key);
      // Mask the lone Win press so releasing it does not open Start.
      // VK_NONAME produces no text and changes no held modifier.
      keyEvent(0xfc, 0, 0, 0);
      keyEvent(0xfc, 0, 2, 0);
      setImmediate(() => {
        if (disposed || win.isDestroyed() || foreground() !== own) return;
        try { dock(key === 0x25 ? 'left' : 'right'); }
        catch (error) { onError(error); }
      });
      return 1;
    } catch (error) {
      setImmediate(() => { if (!disposed) onError(error); });
      return next(null, code, message, data);
    }
  }, koffi.pointer(proc));
  const hook = install(13, callback, null, 0); // WH_KEYBOARD_LL; no injected DLL.
  if (!hook) {
    koffi.unregister(callback);
    throw new Error('Could not enable Win+Left/Right docking.');
  }
  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      remove(hook);
      koffi.unregister(callback);
      swallowed.clear();
    },
  };
}

module.exports = { createDockKeys };
