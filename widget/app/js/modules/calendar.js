/**
 * CalendarModule - wraps DietCalendar as a pluggable module.
 * v2 - adds detail popup on date click with full macro breakdown.
 */
class CalendarModule extends BaseModule {
  init() {
    const panel = document.getElementById('calendar-module');
    const tooltip = document.getElementById('day-tooltip');
    if (!panel) return;

    this._overlay = document.getElementById('day-detail-overlay');
    this._detailDate = document.getElementById('detail-date');
    this._detailBody = document.getElementById('detail-body');
    this._detailClose = document.getElementById('detail-close');

    this._instance = new DietCalendar({
      panel,
      tooltip,
      eventBus: this._bus,
      dataStore: this._store,
      dietData: window.DietData,
      onSelect: (dateStr, record) => this._showDetail(dateStr, record)
    });

    this._detailClose?.addEventListener('click', () => this._hideDetail());
    this._overlay?.addEventListener('click', (e) => {
      if (e.target === this._overlay) this._hideDetail();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this._hideDetail();
    });
  }

  _showDetail(dateStr, record) {
    if (!this._overlay || !this._detailBody) return;

    this._detailDate.textContent = dateStr;

    if (!record || record.calories == null) {
      this._detailBody.innerHTML = '<div class="detail-empty">📭 当天暂无数据</div>';
    } else {
      this._detailBody.innerHTML = this._buildDetailHTML(dateStr, record);
    }

    this._overlay.classList.remove('hidden');
  }

  _hideDetail() {
    this._overlay?.classList.add('hidden');
  }

  _buildDetailHTML(dateStr, record) {
    const t = record.targets || this._store?.getTargets() || {};
    const fmt = (v) => v != null ? v : '—';

    // 五级颜色判定（基于服务端达成率，已编码方向性惩罚）
    const rateCls = (r) => {
      if (r == null) return '';
      if (r >= 90) return 'great';
      if (r >= 80) return 'good';
      if (r >= 70) return 'mid';
      if (r >= 60) return 'warn';
      return 'bad';
    };
    const scoreCls = (s) => {
      if (s >= 90) return 'detail-score-great';
      if (s >= 80) return 'detail-score-good';
      if (s >= 70) return 'detail-score-mid';
      if (s >= 60) return 'detail-score-warn';
      return 'detail-score-bad';
    };
    const gradeCls = (g) => {
      if (!g) return '';
      const c = g.charAt(0).toUpperCase();
      return `detail-grade-${c}`;
    };

    // ── Macros section（使用服务端达成率，超量自动降级）──
    const macros = [
      { label: '热量',   actual: record.calories,  target: t.caloriesMin || 1860, unit: 'kcal', rate: record.dietRate },
      { label: '蛋白质', actual: record.protein,   target: t.proteinMin || 170,  unit: 'g',    rate: record.proteinRate },
      { label: '碳水',   actual: record.carbs,     target: t.carbsMin || 170,    unit: 'g',    rate: record.carbRate },
      { label: '脂肪',   actual: record.fat,       target: t.fatMin || 75,      unit: 'g',    rate: record.fatRate },
    ];

    let macroRows = '';
    for (const m of macros) {
      const hasVal = m.actual != null;
      // 宽度 = 实际/目标（无量纲，展示"吃了多少"）
      const barPct = hasVal ? Math.min(Math.round((m.actual || 0) / m.target * 100), 150) : 0;
      // 颜色 = 服务端达成率（已编码方向性惩罚，展示"吃得好不好"）
      const cls = hasVal ? rateCls(m.rate) : '';
      macroRows += `
        <div class="detail-row">
          <span class="detail-label">${m.label}</span>
          <span>
            <span class="detail-value ${cls}">${fmt(m.actual)}</span>
            <span class="detail-target">/ ${m.target} ${m.unit}</span>
          </span>
        </div>
        <div class="detail-bar-wrap">
          <div class="detail-bar-fill ${cls}" style="width:${Math.min(barPct, 100)}%"></div>
        </div>`;
    }

    // ── Exercise section ──
    let exerciseHtml = '';
    if (record.exercise !== '-' && record.exercise !== '无') {
      const exCls = rateCls(record.exerciseRate);
      exerciseHtml = `
        <div class="detail-section">
          <div class="detail-section-title">🏃 运动</div>
          <div class="detail-row"><span class="detail-label">类型</span><span class="detail-value">${this._esc(record.exercise || '—')}</span></div>
          <div class="detail-row"><span class="detail-label">时长</span><span class="detail-value">${fmt(record.duration)} 分钟</span></div>
          <div class="detail-row"><span class="detail-label">消耗</span><span class="detail-value ${exCls}">${fmt(record.exerciseCalories)} kcal</span></div>
        </div>`;
    }

    // ── Body section ──
    let bodyHtml = '';
    if (record.weight != null) {
      const defCls = rateCls(record.deficitRate);
      bodyHtml = `
        <div class="detail-section">
          <div class="detail-section-title">⚖️ 体重</div>
          <div class="detail-row"><span class="detail-label">体重</span><span class="detail-value">${record.weight} kg</span></div>
          <div class="detail-row"><span class="detail-label">BMI</span><span class="detail-value">${fmt(record.bmi)}</span></div>
          <div class="detail-row"><span class="detail-label">热量缺口</span><span class="detail-value ${defCls}">${fmt(record.deficit)} kcal</span></div>
        </div>`;
    }

    // ── Scores section ──
    let scoresHtml = '';
    if (record.dietScore != null || record.overallScore != null) {
      scoresHtml = `<div class="detail-section">
        <div class="detail-section-title">📊 评分</div>
        <div class="detail-row"><span class="detail-label">饮食评分</span><span class="detail-value ${scoreCls(record.dietScore || 0)}">${fmt(record.dietScore)}</span></div>
        <div class="detail-row"><span class="detail-label">运动评分</span><span class="detail-value ${scoreCls(record.exerciseScore || 0)}">${fmt(record.exerciseScore)}</span></div>
        <div class="detail-row"><span class="detail-label">综合评分</span><span class="detail-value ${scoreCls(record.overallScore || 0)}">${fmt(record.overallScore)}</span></div>
        <div class="detail-row"><span class="detail-label">等级</span><span class="detail-value ${gradeCls(record.grade)}">${record.grade || '—'}</span></div>
      </div>`;
    }

    // ── Rates section ──
    let ratesHtml = '';
    const rateColors = {
      dietRate: '#ff9500', proteinRate: '#34c759', carbRate: '#ff9500',
      fatRate: '#ff6b35', exerciseRate: '#34c759', compositeRate: '#bf5af2'
    };
    const rateItems = [];
    if (record.dietRate != null) rateItems.push({ v: record.dietRate, label: '热量', rateCls: scoreCls(record.dietRate), color: rateColors.dietRate });
    if (record.proteinRate != null) rateItems.push({ v: record.proteinRate, label: '蛋白', rateCls: scoreCls(record.proteinRate), color: rateColors.proteinRate });
    if (record.carbRate != null) rateItems.push({ v: record.carbRate, label: '碳水', rateCls: scoreCls(record.carbRate), color: rateColors.carbRate });
    if (record.fatRate != null) rateItems.push({ v: record.fatRate, label: '脂肪', rateCls: scoreCls(record.fatRate), color: rateColors.fatRate });
    if (record.exerciseRate != null) rateItems.push({ v: record.exerciseRate, label: '运动', rateCls: scoreCls(record.exerciseRate), color: rateColors.exerciseRate });
    if (record.compositeRate != null) rateItems.push({ v: record.compositeRate, label: '综合', rateCls: scoreCls(record.compositeRate), color: rateColors.compositeRate });
    if (rateItems.length > 0) {
      const rateHtml = rateItems.map(r =>
        `<span style="color:${r.color};margin-right:8px">●</span><span class="${r.rateCls}">${r.label} ${r.v}%</span>`
      ).join(' <span style="color:rgba(255,255,255,0.15)">·</span> ');
      ratesHtml = `<div class="detail-section">
        <div class="detail-section-title">📈 达成率</div>
        <div class="detail-row" style="flex-wrap:wrap;gap:2px 0"><span class="detail-label"></span><span style="font-size:11px;line-height:1.8">${rateHtml}</span></div>
      </div>`;
    }

    // ── Comment ──
    let commentHtml = '';
    if (record.comment) {
      const cls = record.isAutoComment ? 'auto' : '';
      commentHtml = `<div class="detail-comment ${cls}">${this._esc(record.comment)}</div>`;
    }

    return `
      <div class="detail-section">
        <div class="detail-section-title">🍽 饮食记录</div>
        <div style="font-size:11px;color:rgba(255,255,255,0.65);line-height:1.6">
          ${this._esc(record.diet || '—')}
        </div>
      </div>
      <div class="detail-section">
        <div class="detail-section-title">🔥 宏量营养素</div>
        ${macroRows}
      </div>
      ${exerciseHtml}
      ${bodyHtml}
      ${scoresHtml}
      ${ratesHtml}
      ${commentHtml}`;
  }

  _esc(text) {
    return String(text).replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  destroy() {
    this._instance?.destroy();
    this._instance = null;
  }
}

window.CalendarModule = CalendarModule;
