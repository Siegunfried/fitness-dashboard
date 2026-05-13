/**
 * DietCalendar - 日历渲染引擎 v3.0
 * 
 * 新增显示：
 * - BMI数值
 * - 饮食评分、运动评分、综合评分
 * - 用户评语（手写）或自动评语
 * - 正确的热量缺口计算值
 */
class DietCalendar {
  /**
   * @param {Object} opts
   * @param {HTMLElement} opts.panel       - #calendar-module
   * @param {HTMLElement} opts.tooltip     - #day-tooltip
   * @param {EventBus}    opts.eventBus    - app-wide event bus
   * @param {DataStore}   opts.dataStore   - app-wide data store
   * @param {Object}      opts.dietData    - [backward compat] legacy DietData wrapper
   * @param {Function}    opts.onSelect    - callback(dateStr, record)
   */
  constructor({ panel, tooltip, eventBus, dataStore, dietData, onSelect }) {
    this.panel = panel;
    this.tooltip = tooltip;
    this._bus = eventBus;
    this._store = dataStore;
    this._dietData = dietData; // backward compat
    this.onSelect = onSelect;

    this.year = new Date().getFullYear();
    this.month = new Date().getMonth();
    this._unsubs = [];

    this.els = {
      monthLabel: null,
      grid: null,
      prevBtn: null,
      nextBtn: null,
      syncBtn: null
    };

    this._init();
  }

  /** Access data via DataStore, with legacy fallback */
  _getData() { return this._store?.get() || this._dietData?.get() || null; }
  _getRecord(dateStr) { return this._store?.getRecord(dateStr) || this._dietData?.getRecord(dateStr) || null; }
  _getTargets() { return this._store?.getTargets() || this._dietData?.getTargets() || DataStore.DEFAULTS; }
  _getProfile() { return this._store?.getProfile() || this._dietData?.getProfile() || { name: '', height: 170, tdee: 2000 }; }

  _init() {
    this._cacheElements();
    this._bindEvents();
    this._subscribeData();
    this.render();
    // Announce initial month so charts know where we are
    this._emitMonth();
  }

  _cacheElements() {
    if (!this.panel) return;
    this.els.monthLabel = this.panel.querySelector('#cal-month-label');
    this.els.grid = this.panel.querySelector('#cal-grid');
    this.els.prevBtn = this.panel.querySelector('#cal-prev');
    this.els.nextBtn = this.panel.querySelector('#cal-next');
    this.els.syncBtn = this.panel.querySelector('#cal-sync-btn');
  }

  _bindEvents() {
    this.els.prevBtn?.addEventListener('click', () => this.prevMonth());
    this.els.nextBtn?.addEventListener('click', () => this.nextMonth());
    this.els.syncBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this._handleSync();
    });
  }

  _subscribeData() {
    // Listen via EventBus (new) or legacy onChange (backward compat)
    if (this._bus) {
      this._unsubs.push(this._bus.on('data:changed', () => this.render()));
    } else if (this._dietData) {
      this._unsubs.push(this._dietData.onChange(() => this.render()));
    }
  }

  _emitMonth() {
    if (this._bus) {
      this._bus.emit('calendar:monthChanged', { year: this.year, month: this.month });
    }
  }

  destroy() {
    this._unsubs.forEach(fn => fn());
    this._unsubs = [];
  }

  render() {
    this._renderHeader();
    this._renderGrid();
    this._bindDayEvents();
  }

  prevMonth() {
    this.month--;
    if (this.month < 0) { this.month = 11; this.year--; }
    this.render();
    this._updateCharts();
  }

  nextMonth() {
    this.month++;
    if (this.month > 11) { this.month = 0; this.year++; }
    this.render();
    this._updateCharts();
  }

  goTo(year, month) {
    this.year = year;
    this.month = month;
    this.render();
    this._updateCharts();
  }

  _updateCharts() {
    this._emitMonth();
    // Also trigger legacy charts render if present
    if (window.dietCharts) {
      const c = window.dietCharts.container || window.dietCharts._container;
      if (c && c.style.display === 'flex') window.dietCharts.render();
    }
  }

  showTooltip(el, record) {
    if (!record || !this.tooltip) return;

    const profile = this._getProfile();
    const targets = this._getTargets();
    this.tooltip.innerHTML = this._buildTooltipContent(record, profile, targets);
    this.tooltip.style.display = 'block';
    this._positionTooltip(el);
  }

  hideTooltip() {
    if (this.tooltip) this.tooltip.style.display = 'none';
  }

  _renderHeader() {
    const months = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
    if (this.els.monthLabel) {
      this.els.monthLabel.textContent = `${this.year}年${months[this.month]}`;
    }
  }

  _renderGrid() {
    if (!this.els.grid) return;

    const data = this._getData();
    const records = data?.records || {};
    const targets = this._getTargets();
    
    const firstDay = new Date(this.year, this.month, 1);
    const daysInMonth = new Date(this.year, this.month + 1, 0).getDate();
    const startWeekday = (firstDay.getDay() + 6) % 7;
    
    const today = new Date();
    const isCurrentMonth = today.getFullYear() === this.year && today.getMonth() === this.month;
    
    let html = '';
    
    for (let i = 0; i < startWeekday; i++) {
      html += '<div class="cal-day empty"></div>';
    }
    
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${this.year}-${String(this.month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const record = records[dateStr];
      const isToday = isCurrentMonth && d === today.getDate();
      
      let cls = 'cal-day';
      if (isToday) cls += ' today';
      if (record) {
        cls += ' has-record';
        const color = this._getRecordColor(record, targets);
        cls += ` underline-${color}`;
      }
      
      html += `<div class="${cls}" data-date="${dateStr}">${d}</div>`;
    }
    
    this.els.grid.innerHTML = html;
  }

  _bindDayEvents() {
    this.els.grid?.querySelectorAll('.has-record').forEach(el => {
      el.addEventListener('mouseenter', () => {
        this.showTooltip(el, this._getRecord(el.dataset.date));
      });
      el.addEventListener('mouseleave', () => this.hideTooltip());
      el.addEventListener('click', () => {
        const dateStr = el.dataset.date;
        this.onSelect?.(dateStr, this._getRecord(dateStr));
      });
    });
  }

  /**
   * 日历下划线颜色判定
   * - 缺口 < 1100 = 红色（吃太多或运动太少）
   * - 缺口 >= 1100 + 有运动 = 绿色（减脂效果好）
   * - 缺口 >= 1100 + 无运动 = 黄色（缺运动）
   */
  /**
   * 下划线颜色 — 五级渐变，与 Excel 综合评估一致
   *   g1 绿色 >= 90（优秀）  g2 >= 80（良好）  g3 >= 70（达标）
   *   yellow  >= 60（基本达标）  red < 60（未达标）  gray = 无数据
   */
  _getRecordColor(record, targets) {
    const complete = record.calories != null && record.deficit != null;
    if (!complete) return 'gray';

    const s = record.overallScore;
    if (s == null) return 'gray';
    if (s >= 90) return 'g1';
    if (s >= 80) return 'g2';
    if (s >= 70) return 'g3';
    if (s >= 60) return 'yellow';
    return 'red';
  }

  /**
   * Tooltip内容构建
   * 缺口合格条件：>=1100（够大）
   */
  _buildTooltipContent(record, profile, targets) {
    // 使用记录中的每日目标，如果没有则使用全局目标
    const recordTargets = record.targets || this._getTargets();
    
    const calMet = record.calories != null && record.calories >= recordTargets.caloriesMin;
    const proMet = record.protein != null && record.protein >= recordTargets.proteinMin;
    const exMet = record.exerciseCalories != null && record.exerciseCalories >= recordTargets.exerciseMin;
    // 使用每日目标的最小值
    const defMet = record.deficit != null && record.deficit >= recordTargets.deficitMin;
    
    let html = `<div class="tip-header">${record.weekday || ''}</div>`;
    
    // 五级颜色判定（基于达成率）
    const rateCls = (r) => {
      if (r == null) return 'missing';
      if (r >= 90) return 'met';
      if (r >= 80) return 'met';
      if (r >= 70) return 'warn';
      if (r >= 60) return 'warn';
      return 'unmet';
    };

    // 各类达成率
    const calRate = record.calories != null ? Math.max(0, 100 - Math.abs(record.calories - recordTargets.caloriesMin) / recordTargets.caloriesMin * 100) : null;
    const proRate = record.protein != null ? Math.min(record.protein / recordTargets.proteinMin * 100, 150) : null;
    const exRate = record.exerciseCalories != null ? Math.min(record.exerciseCalories / recordTargets.exerciseMin * 100, 150) : null;

    // 核心数据 - 五级颜色
    html += this._buildTipRow('热量', record.calories, `${recordTargets.caloriesMin}`, 'kcal', rateCls(calRate));
    html += this._buildTipRow('蛋白质', record.protein, `${recordTargets.proteinMin}`, 'g', rateCls(proRate));
    if (record.carbs != null) {
      const carbTarget = recordTargets.carbsMin || 170;
      const carbRate = Math.max(0, 100 - Math.abs(record.carbs - carbTarget) / carbTarget * 100);
      html += this._buildTipRow('碳水', record.carbs, `${carbTarget}`, 'g', rateCls(carbRate));
    }
    if (record.fat != null) {
      const fatTarget = recordTargets.fatMin || 75;
      const fatRate = (record.fat >= fatTarget * 0.7 && record.fat <= fatTarget * 1.3) ? 100 : Math.max(0, 100 - Math.abs(record.fat - fatTarget) / fatTarget * 40);
      html += this._buildTipRow('脂肪', record.fat, `${fatTarget}`, 'g', rateCls(fatRate));
    }
    html += this._buildTipRow('运动', record.exerciseCalories, `${recordTargets.exerciseMin}`, 'kcal', rateCls(exRate));
    const defRate = record.deficit != null ? Math.min(Math.abs(record.deficit) / recordTargets.deficitMin * 100, 150) : null;
    html += `<div class="tip-row">
      <span class="tip-label">缺口</span>
      <span class="tip-value">
        <span class="tip-actual ${rateCls(defRate)}">${record.deficit != null ? record.deficit : '—'}</span>
        <span class="tip-sep">/</span>
        <span class="tip-target">>=${recordTargets.deficitMin}</span>
        <span class="tip-unit">kcal</span>
      </span>
    </div>`;
    
    // 体重和BMI
    if (record.weight != null) {
      let weightLine = `<div class="tip-row"><span class="tip-label">体重</span><span class="tip-value">${record.weight} kg</span>`;
      if (record.bmi != null) {
        weightLine += `<span class="tip-bmi">BMI ${record.bmi}</span>`;
      }
      weightLine += '</div>';
      html += weightLine;
    }
    
    // 评分区域 (0-100 分制，与 Excel 一致)
    if (record.dietScore != null || record.exerciseScore != null || record.overallScore != null) {
      html += '<div class="tip-divider"></div>';
      html += '<div class="tip-scores">';
      const scCls = (s) => s >= 90 ? 'great' : (s >= 80 ? 'good' : (s >= 70 ? 'mid' : (s >= 60 ? 'warn' : 'bad')));
      if (record.dietScore != null) {
        html += `<span class="tip-score-item tip-score-${scCls(record.dietScore)}">饮食 ${record.dietScore}</span>`;
      }
      if (record.exerciseScore != null) {
        html += `<span class="tip-score-item tip-score-${scCls(record.exerciseScore)}">运动 ${record.exerciseScore}</span>`;
      }
      if (record.overallScore != null) {
        const osCls = record.overallScore >= 90 ? 'great' : (record.overallScore >= 80 ? 'good' : (record.overallScore >= 70 ? 'mid' : (record.overallScore >= 60 ? 'warn' : 'bad')));
        html += `<span class="tip-score-item tip-score-${osCls}">综合 ${record.overallScore}</span>`;
      }
      if (record.grade) {
        html += `<span class="tip-score-item tip-grade">${record.grade}</span>`;
      }
      html += '</div>';
    }

    // 达成率 (%) — 五级颜色
    if (record.dietRate != null || record.exerciseRate != null) {
      const rateItem = (label, val) => {
        const cls = val >= 90 ? 'met' : (val >= 80 ? 'met' : (val >= 70 ? 'warn' : (val >= 60 ? 'warn' : 'unmet')));
        return `<span class="tip-rate-item tip-actual ${cls}">${label} ${val}%</span>`;
      };
      html += '<div class="tip-rates">';
      if (record.dietRate != null) html += rateItem('热量', record.dietRate);
      if (record.proteinRate != null) html += rateItem('蛋白', record.proteinRate);
      if (record.carbRate != null) html += rateItem('碳水', record.carbRate);
      if (record.fatRate != null) html += rateItem('脂肪', record.fatRate);
      if (record.exerciseRate != null) html += rateItem('运动', record.exerciseRate);
      if (record.compositeRate != null) html += rateItem('综合', record.compositeRate);
      html += '</div>';
    }

    // 评语
    if (record.comment) {
      const commentCls = record.isAutoComment ? 'auto' : 'user';
      html += `<div class="tip-comment tip-comment-${commentCls}">${this._escapeHtml(record.comment)}</div>`;
    }

    return html;
  }

  _buildTipRow(label, actual, target, unit, statusCls) {
    const actualStr = actual != null ? actual : '—';
    const actualCls = actual == null ? 'missing' : (statusCls || 'met');
    return `<div class="tip-row">
      <span class="tip-label">${label}</span>
      <span class="tip-value">
        <span class="tip-actual ${actualCls}">${actualStr}</span>
        <span class="tip-sep">/</span>
        <span class="tip-target">${target}</span>
        <span class="tip-unit">${unit}</span>
      </span>
    </div>`;
  }

  _positionTooltip(el) {
    const rect = el.getBoundingClientRect();
    const tw = this.tooltip.offsetWidth;
    const th = this.tooltip.offsetHeight;
    
    let left = rect.left - tw - 10;
    let top = rect.top + rect.height / 2 - th / 2;
    
    if (left < 10) left = rect.right + 10;
    top = Math.max(10, Math.min(top, window.innerHeight - th - 10));
    
    this.tooltip.style.left = left + 'px';
    this.tooltip.style.top = top + 'px';
  }

  _escapeHtml(text) {
    return text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  async _handleSync() {
    const btn = this.els.syncBtn;
    if (!btn) return;

    btn.disabled = true;
    btn.textContent = '同步中..';

    try {
      // via event bus (preferred) or legacy direct call
      if (this._bus) {
        this._bus.emit('service:sync');
      }
      if (this._dietData?.sync) {
        await this._dietData.sync();
      }
      btn.textContent = '✅ 已同步';
      setTimeout(() => {
        btn.textContent = '↻ 从 Excel 同步';
        btn.disabled = false;
      }, 3000);
    } catch (e) {
      btn.textContent = '同步失败';
      console.warn('[DietCalendar] sync error:', e);
      setTimeout(() => {
        btn.textContent = '↻ 从 Excel 同步';
        btn.disabled = false;
      }, 3000);
    }
  }
}

window.DietCalendar = DietCalendar;
