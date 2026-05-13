/**
 * DietCharts - 科学分组折线图引擎 v4.0
 *
 * 5 图表，按同单位/同量纲分组：
 *   1. 热量平衡 (kcal)  — 摄入 + 消耗
 *   2. 宏量营养素 (g)   — 蛋白质 + 碳水 + 脂肪
 *   3. 体重与BMI        — 体重 + BMI
 *   4. 关键达成率 (%)   — 综合 + 饮食 + 蛋白质
 *   5. 综合评分 (0-100) — 饮食 + 运动 + 综合
 */
class DietCharts {
  constructor({ eventBus, dataStore, dietData }) {
    this._bus = eventBus;
    this._store = dataStore;
    this._dietData = dietData;
    this._year = new Date().getFullYear();
    this._month = new Date().getMonth();
    this._unsubs = [];
    this.container = document.getElementById('month-charts');
    this.monthLabel = document.getElementById('cal-month-label');
    this._isMouseOverCharts = false;
    this._hideTimer = null;

    this.canvases = {
      energy:  document.getElementById('chart-energy'),
      macros:  document.getElementById('chart-macros'),
      weight:  document.getElementById('chart-weight'),
      rates:   document.getElementById('chart-rates'),
      scores:  document.getElementById('chart-scores')
    };

    this.ctxs = {};
    this._initCanvases();
    this._bindEvents();
    this._subscribeData();
  }

  _initCanvases() {
    Object.entries(this.canvases).forEach(([key, canvas]) => {
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const w = rect.width > 0 ? rect.width : (parseInt(canvas.getAttribute('width')) || 256);
      const h = rect.height > 0 ? rect.height : (parseInt(canvas.getAttribute('height')) || 100);
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        const ctx = canvas.getContext('2d');
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);
        this.ctxs[key] = ctx;
      }
    });
  }

  _bindEvents() {
    if (!this.monthLabel || !this.container) return;

    this.monthLabel.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.container.style.display === 'flex') { this._hide(); }
      else { this._show(); }
    });

    this.monthLabel.addEventListener('mouseenter', () => this._show());

    this.monthLabel.addEventListener('mouseleave', () => {
      this._hideTimer = setTimeout(() => {
        if (!this._isMouseOverCharts) this._hide();
      }, 200);
    });

    this.container.addEventListener('mouseenter', () => {
      this._isMouseOverCharts = true;
      clearTimeout(this._hideTimer);
    });

    this.container.addEventListener('mouseleave', () => {
      this._isMouseOverCharts = false;
      this._hide();
    });

    document.addEventListener('click', (e) => {
      if (this.container.style.display === 'flex' &&
          !this.container.contains(e.target) &&
          e.target !== this.monthLabel) {
        this._hide();
      }
    });
  }

  _subscribeData() {
    const doRender = () => {
      if (this.container.style.display === 'flex') this.render();
    };
    if (this._bus) {
      this._unsubs.push(this._bus.on('data:changed', doRender));
      this._unsubs.push(this._bus.on('calendar:monthChanged', ({ year, month }) => {
        this._year = year;
        this._month = month;
        doRender();
      }));
    }
    if (this._dietData) {
      this._unsubs.push(this._dietData.onChange(doRender));
    }
  }

  _show() {
    if (!this.container) return;
    this.container.style.display = 'flex';
    this.container.classList.add('visible');
    if (this.monthLabel) this.monthLabel.classList.add('active');
    requestAnimationFrame(() => {
      this._initCanvases();
      this.render();
    });
  }

  _hide() {
    if (!this.container) return;
    this.container.style.display = 'none';
    this.container.classList.remove('visible');
    if (this.monthLabel) this.monthLabel.classList.remove('active');
  }

  _getMonthData() {
    const data = this._store?.get() || this._dietData?.get();
    if (!data?.records) return [];

    let year = this._year;
    let month = this._month;
    if (!year && !month && window.dietCalendar) {
      year = window.dietCalendar.year;
      month = window.dietCalendar.month;
    }
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const points = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const rec = data.records[dateStr];
      if (rec && (rec.calories != null || rec.deficit != null || rec.weight != null)) {
        points.push({
          day: d,
          calories: rec.calories,
          protein: rec.protein,
          carbs: rec.carbs,
          fat: rec.fat,
          exerciseCalories: rec.exerciseCalories,
          deficit: rec.deficit,
          dietScore: rec.dietScore,
          exerciseScore: rec.exerciseScore,
          overallScore: rec.overallScore,
          compositeRate: rec.compositeRate,
          dietRate: rec.dietRate,
          proteinRate: rec.proteinRate,
          carbRate: rec.carbRate,
          fatRate: rec.fatRate,
          exerciseRate: rec.exerciseRate,
          weight: rec.weight,
          bmi: rec.bmi
        });
      }
    }
    return points;
  }

  render() {
    const points = this._getMonthData();
    if (points.length === 0) return;

    this._renderEnergy(points);
    this._renderMacros(points);
    this._renderWeight(points);
    this._renderRates(points);
    this._renderScores(points);
  }

  // ── Chart 1: 热量平衡 (kcal) ──
  _renderEnergy(points) {
    const ctx = this.ctxs.energy;
    const canvas = this.canvases.energy;
    if (!ctx || !canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr, h = canvas.height / dpr;
    ctx.clearRect(0, 0, w, h);

    const p = { top: 8, right: 8, bottom: 20, left: 36 };
    const cw = w - p.left - p.right, ch = h - p.top - p.bottom;

    const allVals = points.flatMap(pt => [pt.calories, pt.exerciseCalories].filter(v => v != null));
    if (allVals.length === 0) return;
    const maxVal = Math.max(...allVals, 500) * 1.1;

    this._drawGrid(ctx, p, cw, ch, maxVal, points.length, 0);
    this._drawLine(ctx, points, p, cw, ch, maxVal, 'calories', '#ff9500', 2, 0);
    this._drawLine(ctx, points, p, cw, ch, maxVal, 'exerciseCalories', '#34c759', 2, 0);
  }

  // ── Chart 2: 宏量营养素 (g) — 蛋白质 + 碳水 + 脂肪，同单位可比 ──
  _renderMacros(points) {
    const ctx = this.ctxs.macros;
    const canvas = this.canvases.macros;
    if (!ctx || !canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr, h = canvas.height / dpr;
    ctx.clearRect(0, 0, w, h);

    const p = { top: 8, right: 8, bottom: 20, left: 32 };
    const cw = w - p.left - p.right, ch = h - p.top - p.bottom;

    const allVals = points.flatMap(pt => [pt.protein, pt.carbs, pt.fat].filter(v => v != null));
    if (allVals.length === 0) return;
    const maxVal = Math.max(...allVals, 200) * 1.15;

    this._drawGrid(ctx, p, cw, ch, maxVal, points.length, 0);
    this._drawLine(ctx, points, p, cw, ch, maxVal, 'protein', '#34c759', 2.5, 0);  // 蛋白=绿色(优先)
    this._drawLine(ctx, points, p, cw, ch, maxVal, 'carbs',   '#ff9500', 2, 0);
    this._drawLine(ctx, points, p, cw, ch, maxVal, 'fat',     '#ff6b35', 1.5, 0);   // 脂肪线更细
  }

  // ── Chart 3: 体重与BMI ──
  _renderWeight(points) {
    const ctx = this.ctxs.weight;
    const canvas = this.canvases.weight;
    if (!ctx || !canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr, h = canvas.height / dpr;
    ctx.clearRect(0, 0, w, h);

    const p = { top: 8, right: 8, bottom: 20, left: 28 };
    const cw = w - p.left - p.right, ch = h - p.top - p.bottom;

    const weights = points.map(pt => pt.weight).filter(v => v != null);
    const bmis    = points.map(pt => pt.bmi).filter(v => v != null);

    const allVals = [...weights, ...bmis];
    if (allVals.length === 0) return;
    const maxVal = Math.max(...allVals, 100) * 1.08;
    const minVal = Math.min(...allVals, 15) * 0.95;

    this._drawGrid(ctx, p, cw, ch, maxVal, points.length, minVal);
    this._drawLine(ctx, points, p, cw, ch, maxVal, 'weight', '#007aff', 2, minVal);
    this._drawLine(ctx, points, p, cw, ch, maxVal, 'bmi',    '#ff3b30', 1.5, minVal);
  }

  // ── Chart 4: 关键达成率 (%) ──
  _renderRates(points) {
    const ctx = this.ctxs.rates;
    const canvas = this.canvases.rates;
    if (!ctx || !canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr, h = canvas.height / dpr;
    ctx.clearRect(0, 0, w, h);

    const p = { top: 8, right: 8, bottom: 20, left: 28 };
    const cw = w - p.left - p.right, ch = h - p.top - p.bottom;

    // Draw 100% reference line
    const y100 = p.top + ch - ((100 - 0) / 150) * ch; // scale 0-150%
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(p.left, y100);
    ctx.lineTo(p.left + cw, y100);
    ctx.stroke();
    ctx.setLineDash([]);

    // Y-axis label for 100%
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.font = '8px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('100', p.left - 4, y100 + 3);

    this._drawGrid(ctx, p, cw, ch, 150, points.length, 0);
    this._drawLine(ctx, points, p, cw, ch, 150, 'compositeRate', '#bf5af2', 2.5, 0);
    this._drawLine(ctx, points, p, cw, ch, 150, 'dietRate',      '#ff9500', 2, 0);
    this._drawLine(ctx, points, p, cw, ch, 150, 'proteinRate',   '#34c759', 2, 0);
  }

  // ── Chart 5: 综合评分 (0-100) ──
  _renderScores(points) {
    const ctx = this.ctxs.scores;
    const canvas = this.canvases.scores;
    if (!ctx || !canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr, h = canvas.height / dpr;
    ctx.clearRect(0, 0, w, h);

    const p = { top: 8, right: 8, bottom: 20, left: 28 };
    const cw = w - p.left - p.right, ch = h - p.top - p.bottom;

    this._drawGrid(ctx, p, cw, ch, 100, points.length, 0);
    this._drawLine(ctx, points, p, cw, ch, 100, 'dietScore',      '#ff9500', 2, 0);
    this._drawLine(ctx, points, p, cw, ch, 100, 'exerciseScore',  '#34c759', 2, 0);
    this._drawLine(ctx, points, p, cw, ch, 100, 'overallScore',   '#bf5af2', 2.5, 0);
  }

  // ── Shared drawing helpers ──

  _drawGrid(ctx, p, cw, ch, maxVal, pointCount, minVal) {
    const range = maxVal - minVal || 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 0.5;

    for (let i = 0; i <= 4; i++) {
      const y = p.top + (ch / 4) * i;
      ctx.beginPath();
      ctx.moveTo(p.left, y);
      ctx.lineTo(p.left + cw, y);
      ctx.stroke();

      const val = Math.round(maxVal - (range / 4) * i);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.font = '9px -apple-system, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(val), p.left - 4, y);
    }

    if (pointCount > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.font = '9px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const first = window.dietCalendar ? new Date(window.dietCalendar.year, window.dietCalendar.month, 1) : new Date();
      const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
      ctx.fillText(`${first.getMonth() + 1}/1`, p.left, p.top + ch + 4);
      ctx.fillText(`${last.getMonth() + 1}/${last.getDate()}`, p.left + cw, p.top + ch + 4);
    }
  }

  _drawLine(ctx, points, p, cw, ch, maxVal, field, color, lineWidth, minVal) {
    const range = maxVal - minVal || 1;
    const validPoints = points.filter(pt => pt[field] != null);
    if (validPoints.length < 2) return;

    const daysInMonth = new Date(
      window.dietCalendar?.year || 2026,
      (window.dietCalendar?.month || 0) + 1, 0
    ).getDate();

    // Line
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    validPoints.forEach((pt, i) => {
      const x = p.left + ((pt.day - 1) / (daysInMonth - 1)) * cw;
      const y = p.top + ch - ((pt[field] - minVal) / range) * ch;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Dots
    ctx.fillStyle = color;
    validPoints.forEach(pt => {
      const x = p.left + ((pt.day - 1) / (daysInMonth - 1)) * cw;
      const y = p.top + ch - ((pt[field] - minVal) / range) * ch;
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.beginPath();
      ctx.arc(x, y, 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = color;
    });

    // Area fill
    ctx.beginPath();
    validPoints.forEach((pt, i) => {
      const x = p.left + ((pt.day - 1) / (daysInMonth - 1)) * cw;
      const y = p.top + ch - ((pt[field] - minVal) / range) * ch;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    const lastX = p.left + ((validPoints[validPoints.length - 1].day - 1) / (daysInMonth - 1)) * cw;
    const firstX = p.left + ((validPoints[0].day - 1) / (daysInMonth - 1)) * cw;
    ctx.lineTo(lastX, p.top + ch);
    ctx.lineTo(firstX, p.top + ch);
    ctx.closePath();

    const rgb = this._hexToRgb(color);
    ctx.fillStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},0.08)`;
    ctx.fill();
  }

  _hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16)
    } : { r: 255, g: 255, b: 255 };
  }

  destroy() {
    this._unsubs.forEach(fn => fn());
    this._unsubs = [];
  }
}

window.DietCharts = DietCharts;
