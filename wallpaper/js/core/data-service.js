/**
 * DataService - HTTP client for the Python sync server.
 *
 * Features:
 *   - Configurable timeout (default 5s)
 *   - Exponential backoff retry (3s, 9s, 27s, 81s, 243s, max 5)
 *   - Health polling every 60s
 *
 * Emits via EventBus:
 *   'service:connected'   - first successful connection
 *   'service:disconnected' - connection lost
 *   'service:error'        - { message, attempt }
 */
class DataService {
  constructor({ eventBus, dataStore, baseUrl = 'http://127.0.0.1:17532', timeout = 5000, maxRetries = 5 }) {
    this._bus = eventBus;
    this._store = dataStore;
    this._base = baseUrl;
    this._timeout = timeout;
    this._maxRetries = maxRetries;
    this._retryAttempt = 0;
    this._retryTimer = null;
    this._healthTimer = null;
    this._connected = false;
    this._destroyed = false;

    // Listen for manual sync requests from UI
    this._unsubSync = this._bus.on('service:sync', () => this.sync());
  }

  /** Initial load (called once on startup, schedules retries on failure) */
  async load() {
    if (this._destroyed) return;
    this._store.startLoading();
    await this._fetch('/data');
  }

  /** Force-reload from server */
  async sync() {
    if (this._destroyed) return;
    await this._fetch('/sync');
  }

  /** Start periodic health checks */
  startHealthPoll(intervalMs = 60000) {
    this._stopHealthPoll();
    this._healthTimer = setInterval(() => this._checkHealth(), intervalMs);
  }

  /** Stop all timers */
  destroy() {
    this._destroyed = true;
    this._stopRetry();
    this._stopHealthPoll();
    this._unsubSync?.();
  }

  // --- private ---

  async _fetch(endpoint) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this._timeout);

    try {
      const res = await fetch(`${this._base}${endpoint}?_=${Date.now()}`, {
        signal: ctrl.signal
      });
      clearTimeout(timer);

      const json = await res.json();
      if (!json.success) {
        throw new Error(json.error || 'Server returned failure');
      }

      this._store.set(json.data);
      this._retryAttempt = 0;
      if (!this._connected) {
        this._connected = true;
        this._bus.emit('service:connected', {});
      }
      this._bus.emit('service:dataLoaded', {
        recordCount: Object.keys(json.data?.records || {}).length
      });
    } catch (e) {
      clearTimeout(timer);
      if (this._connected) {
        this._connected = false;
        this._bus.emit('service:disconnected', {});
      }
      this._bus.emit('service:error', { message: e.message || String(e), attempt: this._retryAttempt + 1 });
      this._scheduleRetry(endpoint);
    }
  }

  _scheduleRetry(endpoint) {
    if (this._retryAttempt >= this._maxRetries) {
      console.warn('[DataService] Max retries reached');
      this._store.setError('Server unreachable after max retries');
      return;
    }
    this._retryAttempt++;
    const delay = Math.min(3000 * Math.pow(3, this._retryAttempt - 1), 300000);
    this._stopRetry();
    this._retryTimer = setTimeout(() => this._fetch(endpoint), delay);
  }

  _stopRetry() {
    if (this._retryTimer) { clearTimeout(this._retryTimer); this._retryTimer = null; }
  }

  _stopHealthPoll() {
    if (this._healthTimer) { clearInterval(this._healthTimer); this._healthTimer = null; }
  }

  async _checkHealth() {
    try {
      const res = await fetch(`${this._base}/health?_=${Date.now()}`);
      const json = await res.json();
      if (json.status === 'ok' && !this._connected) {
        this._connected = true;
        this._bus.emit('service:connected', json);
      }
    } catch (e) {
      // Health check failed, but don't spam
    }
  }
}

window.DataService = DataService;
