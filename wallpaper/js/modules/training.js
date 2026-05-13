/**
 * TrainingModule - TodoList 训练计划模块
 * 从服务器 :17533/training 拉取当天任务，完成状态存 localStorage。
 */
class TrainingModule extends BaseModule {
  init() {
    this._list = document.getElementById('todo-list');
    this._input = document.getElementById('todo-input');
    this._addBtn = document.getElementById('todo-add-btn');
    this._syncBtn = document.getElementById('todo-sync-btn');
    this._progressBar = document.getElementById('todo-progress-bar');
    this._countEl = document.getElementById('todo-count');
    this._pctEl = document.getElementById('todo-pct');
    this._headerEl = document.querySelector('#training-module .module-header span:first-child');

    if (!this._list) return;

    this.STORAGE_KEY = 'mw_todolist';
    this.SERVER_URL = 'http://127.0.0.1:17533/training';
    this.FALLBACK = [
      { id: 'f1', text: '力量训练（推/拉/腿）' },
      { id: 'f2', text: '有氧运动 30 分钟' },
      { id: 'f3', text: '核心训练 15 分钟' },
    ];

    this._tasks = [];
    this._done = {};
    this._todayLabel = '';

    this._bindEvents();
    this._load();
  }

  get today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  _bindEvents() {
    this._addBtn?.addEventListener('click', () => this._addTask());
    this._syncBtn?.addEventListener('click', () => this._handleSync());
    this._input?.addEventListener('keydown', e => { if (e.key === 'Enter') this._addTask(); });
    this._list?.addEventListener('click', e => {
      const c = e.target.closest('.todo-check'), d = e.target.closest('.todo-del');
      if (c) this._toggle(c.dataset.id);
      if (d) this._delete(d.dataset.id);
    });
  }

  async _load() {
    const local = this._readLocal();
    const today = this.today;
    if (local.date !== today) { local.done = {}; local.date = today; }

    const remote = await this._fetchRemote();
    if (remote) {
      this._todayLabel = remote.label || '';
      const remoteTasks = (remote.tasks || []).map((text, i) => ({ id: 'r'+i, text, _fromServer: true }));
      const remoteIds = new Set(remoteTasks.map(t => t.id));
      const localOnly = (local.tasks || []).filter(t => t._user && !remoteIds.has(t.id));
      this._tasks = [...remoteTasks, ...localOnly];
    } else if (local.tasks?.length) {
      this._tasks = local.tasks;
    } else {
      this._tasks = this.FALLBACK.map(t => ({...t}));
      local.done = {};
    }
    this._done = local.done || {};
    this._persist();
    this._render();
  }

  async _fetchRemote() {
    try {
      const r = await fetch(`${this.SERVER_URL}?_=${Date.now()}`);
      const j = await r.json();
      if (j.success && j.data?.tasks) return j.data;
    } catch(e){}
    return null;
  }

  _readLocal() { try { return JSON.parse(localStorage.getItem(this.STORAGE_KEY))||{}; } catch(e) { return {}; } }
  _persist() { try { localStorage.setItem(this.STORAGE_KEY, JSON.stringify({ date: this.today, tasks: this._tasks, done: this._done })); } catch(e){} }

  _render() {
    if (!this._list) return;
    if (this._headerEl) this._headerEl.textContent = 'TodoList' + (this._todayLabel ? ' · '+this._todayLabel : '');

    const total = this._tasks.length;
    const doneCount = this._tasks.filter(t => this._done[t.id]).length;
    const pct = total > 0 ? Math.round(doneCount/total*100) : 0;

    this._list.innerHTML = this._tasks.map(t => `
      <div class="todo-item">
        <button class="todo-check ${this._done[t.id]?'done':''}" data-id="${t.id}"></button>
        <span class="todo-text ${this._done[t.id]?'done':''}">${this._esc(t.text)}</span>
        <button class="todo-del" data-id="${t.id}">&times;</button>
      </div>`).join('');

    if (this._progressBar) this._progressBar.style.width = pct+'%';
    if (this._countEl) this._countEl.textContent = `${doneCount}/${total} 完成`;
    if (this._pctEl) this._pctEl.textContent = pct+'%';
  }

  _addTask() {
    const text = this._input?.value.trim(); if (!text) return;
    this._tasks.push({ id: 'u'+Date.now(), text, _user: true });
    this._input.value = ''; this._input.focus();
    this._persist(); this._render();
  }

  _toggle(id) { this._done[id] = !this._done[id]; this._persist(); this._render(); }
  _delete(id) { this._tasks = this._tasks.filter(t => t.id !== id); delete this._done[id]; this._persist(); this._render(); }

  async _handleSync() {
    const btn = this._syncBtn; if (!btn) return;
    btn.disabled = true; btn.textContent = '更新中..';
    try {
      await this._load();
      btn.textContent = 'OK'; setTimeout(() => { btn.textContent = '↻ 更新'; btn.disabled = false; }, 2000);
    } catch(e) {
      btn.textContent = '失败'; setTimeout(() => { btn.textContent = '↻ 更新'; btn.disabled = false; }, 2000);
    }
  }

  _esc(t) { return String(t).replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  destroy() { this._list = null; this._tasks = []; this._done = {}; }
}
window.TrainingModule = TrainingModule;
