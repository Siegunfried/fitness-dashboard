/**
 * Debug panel - shows event log when ?debug=1 is in the URL.
 * Attaches to the bottom-right corner, lists recent EventBus events.
 */
class DebugPanel {
  constructor(eventBus, maxEvents = 50) {
    this._bus = eventBus;
    this._max = maxEvents;
    this._log = [];
    this._el = null;
    this._visible = false;
    this._start();
  }

  _start() {
    if (!location.search.includes('debug=1')) return;
    this._createPanel();
    this._visible = true;

    // Intercept the existing emit to log events
    const orig = this._bus.emit.bind(this._bus);
    this._bus.emit = (event, data) => {
      this._logEvent(event, data);
      orig(event, data);
    };
  }

  _createPanel() {
    this._el = document.createElement('div');
    Object.assign(this._el.style, {
      position: 'fixed', bottom: '10px', right: '10px',
      width: '280px', maxHeight: '200px', overflowY: 'auto',
      background: 'rgba(0,0,0,0.8)', color: '#0f0',
      fontFamily: 'monospace', fontSize: '10px', lineHeight: '1.4',
      padding: '8px', borderRadius: '8px', zIndex: '9999',
      pointerEvents: 'none'
    });
    document.body.appendChild(this._el);
  }

  _logEvent(event, data) {
    if (!this._visible) return;
    const time = new Date().toLocaleTimeString();
    let detail = '';
    if (data && typeof data === 'object') {
      if (data.recordCount != null) detail = ` count=${data.recordCount}`;
      else if (data.state) detail = ` state=${data.state}`;
      else if (data.level) detail = ` level=${data.level}`;
      else if (data.year != null) detail = ` ${data.year}-${data.month + 1}`;
    }
    this._log.push(`[${time}] ${event}${detail}`);
    if (this._log.length > this._max) this._log.shift();
    if (this._el) this._el.textContent = this._log.join('\n');
  }
}

window.DebugPanel = DebugPanel;
