/**
 * StatusManager - tracks connection health and data freshness.
 *
 * Listens to: service:connected, service:disconnected, data:changed, data:state
 * Emits:       status:changed  { level: 'online'|'offline'|'error',
 *                                 recordCount, lastUpdate, uptime }
 */
class StatusManager {
  constructor({ eventBus, dataStore }) {
    this._bus = eventBus;
    this._store = dataStore;
    this._level = 'offline';
    this._lastUpdate = null;
    this._recordCount = 0;
    this._unsubs = [];

    this._wire();
  }

  get status() {
    return { level: this._level, recordCount: this._recordCount, lastUpdate: this._lastUpdate };
  }

  _wire() {
    this._unsubs.push(this._bus.on('service:connected', () => this._setLevel('online')));
    this._unsubs.push(this._bus.on('service:disconnected', () => this._setLevel('offline')));
    this._unsubs.push(this._bus.on('data:state', ({ state }) => {
      if (state === 'error') this._setLevel('error');
    }));
    this._unsubs.push(this._bus.on('service:dataLoaded', ({ recordCount }) => {
      this._recordCount = recordCount;
      this._lastUpdate = Date.now();
      this._emit();
    }));
  }

  _setLevel(level) {
    if (this._level !== level) {
      this._level = level;
      this._emit();
    }
  }

  _emit() {
    this._bus.emit('status:changed', {
      level: this._level,
      recordCount: this._recordCount,
      lastUpdate: this._lastUpdate
    });
  }

  destroy() {
    this._unsubs.forEach(fn => fn());
    this._unsubs = [];
  }
}

window.StatusManager = StatusManager;
