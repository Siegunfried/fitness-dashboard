/**
 * EventBus - lightweight pub/sub
 * Modules communicate only through events, no direct references.
 */
class EventBus {
  constructor() {
    this._listeners = new Map();
  }

  on(event, fn) {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event).add(fn);
    return () => this.off(event, fn);
  }

  off(event, fn) {
    this._listeners.get(event)?.delete(fn);
  }

  emit(event, data) {
    this._listeners.get(event)?.forEach(fn => {
      try { fn(data); } catch (e) { console.warn('[EventBus]', event, e); }
    });
  }

  /** Emit after a tick, letting the current call stack finish */
  emitAsync(event, data) {
    setTimeout(() => this.emit(event, data), 0);
  }
}

window.EventBus = EventBus;
