'use strict';

// Observe native move/size events without injecting into other applications.
// Reservation begins only after a top-edge drag actually maximizes a window.
function createMaximizeWatcher({ win, isEnabled, onReservation, onError }) {
  const koffi = require('koffi');
  const path = require('path');
  const user32 = koffi.load(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'user32.dll'));
  const callbackType = koffi.proto('void __stdcall MiraMoveEvent(void *hook, uint32_t event, void *hwnd, int32_t object, int32_t child, uint32_t thread, uint32_t time)');
  const setHook = user32.func('void * __stdcall SetWinEventHook(uint32_t first, uint32_t last, void *module, void *callback, uint32_t process, uint32_t thread, uint32_t flags)');
  const unhook = user32.func('int __stdcall UnhookWinEvent(void *hook)');
  const isWindow = user32.func('int __stdcall IsWindow(void *hwnd)');
  const isZoomed = user32.func('int __stdcall IsZoomed(void *hwnd)');
  const isVisible = user32.func('int __stdcall IsWindowVisible(void *hwnd)');
  const isIconic = user32.func('int __stdcall IsIconic(void *hwnd)');
  const getCursor = user32.func('int __stdcall GetCursorPos(void *point)');
  const monitorFromWindow = user32.func('void * __stdcall MonitorFromWindow(void *hwnd, uint32_t flags)');
  const getMonitorInfo = user32.func('int __stdcall GetMonitorInfoW(void *monitor, void *info)');
  const handle = win.getNativeWindowHandle();
  const own = handle.length === 8 ? handle.readBigUInt64LE() : BigInt(handle.readUInt32LE());
  let disposed = false;
  let dragging = null;
  let target = null;
  let pending = null;
  let timer = null;
  let generation = 0;

  function available() {
    return !disposed && isEnabled() && !win.isDestroyed() && win.isVisible() && !win.isMinimized();
  }
  function sameMonitor(hwnd) {
    return monitorFromWindow(hwnd, 2) === monitorFromWindow(own, 2);
  }
  function reset() {
    generation++;
    clearTimeout(pending);
    clearInterval(timer);
    pending = timer = null;
    dragging = target = null;
    onReservation(false);
  }
  function fail(error) { reset(); onError(error); }
  function checkTarget() {
    try {
      if (!available() || !target || !isWindow(target) || !isZoomed(target) ||
          !isVisible(target) || isIconic(target) || !sameMonitor(target)) reset();
    } catch (error) { fail(error); }
  }
  function finishDrag(hwnd) {
    if (!available() || !isWindow(hwnd) || !sameMonitor(hwnd)) return;
    const point = Buffer.alloc(8);
    const info = Buffer.alloc(40);
    info.writeUInt32LE(40);
    if (!getCursor(point) || !getMonitorInfo(monitorFromWindow(own, 2), info)) return;
    const x = point.readInt32LE(0);
    const y = point.readInt32LE(4);
    const top = info.readInt32LE(8);
    // Both the monitor's top edge and a top taskbar's work-area edge qualify.
    const workTop = info.readInt32LE(24);
    if (x < info.readInt32LE(4) || x >= info.readInt32LE(12) ||
        (Math.abs(y - top) > 24 && Math.abs(y - workTop) > 24)) return;
    const ticket = ++generation;
    const deadline = Date.now() + 1000;
    function confirm() {
      pending = null;
      if (ticket !== generation || !available()) return;
      try {
        if (!isWindow(hwnd) || !sameMonitor(hwnd)) return;
        if (isZoomed(hwnd) && !isIconic(hwnd)) {
          target = hwnd;
          onReservation(true);
          clearInterval(timer);
          timer = setInterval(checkTarget, 300);
        } else if (Date.now() < deadline) pending = setTimeout(confirm, 60);
      } catch (error) { fail(error); }
    }
    // Let Windows finish its native snap/maximize operation first.
    pending = setTimeout(confirm, 60);
  }
  const callback = koffi.register((_hook, event, hwnd) => {
    setImmediate(() => {
      if (!available() || !hwnd || hwnd === own) return;
      try {
        if (event === 0x000a) { // EVENT_SYSTEM_MOVESIZESTART
          generation++;
          clearTimeout(pending);
          pending = null;
          if (target === hwnd) reset();
          dragging = hwnd;
        } else if (event === 0x000b && dragging === hwnd) {
          dragging = null;
          finishDrag(hwnd);
        }
      } catch (error) { fail(error); }
    });
  }, koffi.pointer(callbackType));
  const hook = setHook(0x000a, 0x000b, null, callback, 0, 0, 2); // OUTOFCONTEXT | SKIPOWNPROCESS
  if (!hook) {
    koffi.unregister(callback);
    throw new Error('Windows could not observe top-edge window drags.');
  }
  win.on('hide', reset);
  win.on('minimize', reset);
  return {
    reset,
    isDragging: () => dragging !== null,
    dispose() {
      if (disposed) return;
      disposed = true;
      reset();
      unhook(hook);
      koffi.unregister(callback);
      win.removeListener('hide', reset);
      win.removeListener('minimize', reset);
    },
  };
}

module.exports = { createMaximizeWatcher };
