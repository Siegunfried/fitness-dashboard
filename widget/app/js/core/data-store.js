/**
 * DataStore - single source of truth for all diet data.
 *
 * States: 'init' -> 'loading' -> 'ready' | 'error'
 * Emits events via EventBus:
 *   'data:changed'  - data was replaced (set/sync)
 *   'data:state'    - { state, error? } state transition
 */
class DataStore {
  constructor(eventBus) {
    this._bus = eventBus;
    this._data = null;
    this._state = 'init';
    this._error = null;
  }

  get state() { return this._state; }
  get error() { return this._error; }
  get isReady() { return this._state === 'ready'; }

  /** Full data tree */
  get() { return this._data; }

  /** Single record by date string */
  getRecord(dateStr) {
    return this._data?.records?.[dateStr] || null;
  }

  /** Active targets (global defaults merged with any daily overrides) */
  getTargets() {
    return this._data?.profile?.targets || DataStore.DEFAULTS;
  }

  getProfile() {
    return this._data?.profile || { name: '', height: 170, tdee: 2000 };
  }

  /** Replace entire dataset (called after HTTP fetch) */
  set(data) {
    this._data = data;
    this._transition('ready');
    this._bus.emit('data:changed', data);
  }

  /** Mark loading started */
  startLoading() {
    if (this._state === 'init') this._transition('loading');
  }

  /** Mark error */
  setError(err) {
    this._error = err;
    this._transition('error');
  }

  _transition(state) {
    const prev = this._state;
    this._state = state;
    if (prev !== state) {
      this._bus.emit('data:state', { state, error: this._error, prev });
    }
  }
}

DataStore.DEFAULTS = {
  caloriesMin: 1860, caloriesMax: 2070,
  proteinMin: 165, proteinMax: 170,
  carbsMin: 150, carbsMax: 190,
  fatMin: 70, fatMax: 80,
  exerciseMin: 200, exerciseMax: 600,
  deficitMin: 1100, deficitMax: 1600
};

window.DataStore = DataStore;
