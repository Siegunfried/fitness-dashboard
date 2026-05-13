/**
 * StatusBar module - renders the connection status dot in the calendar header.
 *
 * Listens to: status:changed
 */
class StatusBarModule extends BaseModule {
  init() {
    this._dot = document.getElementById('status-dot');
    this._unsub = this._bus.on('status:changed', ({ level }) => {
      if (this._dot) {
        this._dot.className = level;
        this._dot.title = { online: '已连接', offline: '离线模式', error: '服务器错误' }[level] || '';
      }
    });

    // Listen for record count updates
    this._unsub2 = this._bus.on('service:dataLoaded', ({ recordCount }) => {
      const btn = document.getElementById('cal-sync-btn');
      if (btn) {
        btn.textContent = `✅ ${recordCount} 条`;
        setTimeout(() => { btn.textContent = '↻ 从 Excel 同步'; }, 5000);
      }
    });
  }

  destroy() {
    this._unsub?.();
    this._unsub2?.();
  }
}

window.StatusBarModule = StatusBarModule;
