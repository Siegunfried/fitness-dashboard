/**
 * MusicModule - album art, visualizer bars, background color lerp.
 *
 * Uses Lively Wallpaper API (livelyAudioListener, livelyCurrentTrack, etc).
 * Operates independently - no dependency on diet data.
 */
class MusicModule extends BaseModule {
  init() {
    this._els = {
      background: document.getElementById('background'),
      container:   document.getElementById('container'),
      cover:       document.getElementById('cover'),
      coverOld:    document.getElementById('cover-old'),
      title:       document.getElementById('title'),
      artist:      document.getElementById('artist'),
      idle:        document.getElementById('idle'),
      visualizer:  document.getElementById('visualizer')
    };

    this.BAR_COUNT = 32;
    this._hasAudioData = false;
    this._lastAudioTime = 0;
    this._bars = [];
    this._lastLevels = [];
    this._lastTitle = '';
    this._lastArtist = '';

    this._targetBg  = { r: 30, g: 30, b: 40 };
    this._currentBg = { r: 30, g: 30, b: 40 };
    this._lerpRunning = false;

    this._createBars();
    this.kickLerp();
    this._startFallback();
  }

  destroy() {
    // RAF loops self-terminate via _lerpRunning flag and document.hidden check
    this._lerpRunning = false;
  }

  // ── visualizer bars ─────────────────────────────────

  _createBars() {
    const viz = this._els.visualizer;
    if (!viz) return;
    for (let i = 0; i < this.BAR_COUNT; i++) {
      const bar = document.createElement('div');
      bar.className = 'bar';
      bar.style.height = '4px';
      viz.appendChild(bar);
      this._bars.push(bar);
      this._lastLevels.push(4);
    }
  }

  // Called by Lively API
  livelyAudioListener(audioArray) {
    if (!audioArray || audioArray.length === 0) return;
    this._hasAudioData = true;
    this._lastAudioTime = Date.now();

    const maxVal = Math.max(...audioArray);
    const normalized = audioArray.map(v => maxVal > 1 ? v / maxVal : v);
    const step = Math.floor(normalized.length / this.BAR_COUNT);
    const maxH = this._els.visualizer?.clientHeight || 120;

    for (let i = 0; i < this.BAR_COUNT; i++) {
      const idx = Math.min(i * step, normalized.length - 1);
      const target = Math.max(4, normalized[idx] * maxH);
      this._lastLevels[i] = this._lastLevels[i] * 0.7 + target * 0.3;
      this._bars[i].style.height = this._lastLevels[i] + 'px';
    }
    this._els.visualizer?.classList.add('active');
  }

  _startFallback() {
    const loop = () => {
      if (this._hasAudioData && Date.now() - this._lastAudioTime > 3000) {
        this._hasAudioData = false;
        this._els.visualizer?.classList.remove('active');
      }
      if (!this._hasAudioData) {
        const t = Date.now() / 200;
        for (let i = 0; i < this.BAR_COUNT; i++) {
          const target = 8 + Math.sin(t + i * 0.3) * 8;
          this._lastLevels[i] = this._lastLevels[i] * 0.8 + target * 0.2;
          this._bars[i].style.height = Math.max(4, this._lastLevels[i]) + 'px';
        }
      }
      if (!document.hidden) {
        requestAnimationFrame(loop);
      } else {
        document.addEventListener('visibilitychange', function r() {
          document.removeEventListener('visibilitychange', r);
          requestAnimationFrame(loop);
        }, { once: true });
      }
    };
    requestAnimationFrame(loop);
  }

  // ── background color lerp ───────────────────────────

  kickLerp() {
    if (!this._lerpRunning) {
      this._lerpRunning = true;
      requestAnimationFrame(() => this._lerpStep());
    }
  }

  _lerpStep() {
    const speed = 0.03;
    const cur = this._currentBg, tgt = this._targetBg;
    cur.r += (tgt.r - cur.r) * speed;
    cur.g += (tgt.g - cur.g) * speed;
    cur.b += (tgt.b - cur.b) * speed;

    const cr = Math.round(cur.r), cg = Math.round(cur.g), cb = Math.round(cur.b);
    const dr = Math.round(cr * 0.25), dg = Math.round(cg * 0.25), db = Math.round(cb * 0.25);

    this._els.background.style.background =
      `radial-gradient(ellipse at 50% 30%, rgb(${cr},${cg},${cb}) 0%, rgb(${dr},${dg},${db}) 60%, #0d0d0d 100%)`;
    document.documentElement.style.setProperty('--mainColor', `rgb(${cr},${cg},${cb})`);

    const dR = Math.abs(tgt.r - cur.r);
    const dG = Math.abs(tgt.g - cur.g);
    const dB = Math.abs(tgt.b - cur.b);
    if (dR < 0.5 && dG < 0.5 && dB < 0.5) {
      this._lerpRunning = false;
      return;
    }
    requestAnimationFrame(() => this._lerpStep());
  }

  // ── album art ───────────────────────────────────────

  showTrack(title, artist, thumbnail) {
    const els = this._els;
    const changed = title !== this._lastTitle || artist !== this._lastArtist;
    if (changed) {
      els.title?.classList.add('changing');
      els.artist?.classList.add('changing');
      setTimeout(() => {
        if (els.title) els.title.textContent = title || '';
        if (els.artist) els.artist.textContent = artist || '';
        els.title?.classList.remove('changing');
        els.artist?.classList.remove('changing');
      }, 300);
      this._lastTitle = title;
      this._lastArtist = artist;
    }

    if (thumbnail) {
      const src = thumbnail.startsWith('data:image/') ? thumbnail : 'data:image/png;base64,' + thumbnail;
      if (els.cover?.classList.contains('loaded') && els.coverOld) {
        els.coverOld.src = els.cover.src;
        els.coverOld.style.opacity = '1';
      }
      els.cover?.classList.remove('loaded');
      if (els.cover) {
        els.cover.src = src;
        els.cover.onload = () => {
          els.cover.classList.add('loaded');
          setTimeout(() => { if (els.coverOld) els.coverOld.style.opacity = '0'; }, 400);
          this._extractColor(els.cover);
        };
      }
    } else {
      if (els.cover) { els.cover.src = ''; els.cover.classList.add('loaded'); }
      if (els.coverOld) els.coverOld.style.opacity = '0';
    }

    els.container?.classList.add('visible');
    els.idle?.classList.add('hidden');
  }

  hideTrack() {
    this._els.container?.classList.remove('visible');
    this._els.idle?.classList.add('hidden');
    this._targetBg = { r: 30, g: 30, b: 40 };
    this.kickLerp();
  }

  _extractColor(img) {
    const size = 50;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = size; canvas.height = size;
    try {
      ctx.drawImage(img, 0, 0, size, size);
      const data = ctx.getImageData(0, 0, size, size).data;

      // 色彩量化：16级色桶 + 中心加权，取主导色簇
      const buckets = new Map();
      const cx = size / 2, cy = size / 2;
      const maxDist = Math.sqrt(cx * cx + cy * cy);

      for (let py = 0; py < size; py++) {
        for (let px = 0; px < size; px++) {
          const idx = (py * size + px) * 4;
          const r = data[idx], g = data[idx + 1], b = data[idx + 2];

          const maxC = Math.max(r, g, b), minC = Math.min(r, g, b);
          const l = (maxC + minC) / 2;
          if (l < 25 || l > 230) continue;

          const sat = maxC === 0 ? 0 : (maxC - minC) / maxC;
          if (sat < 0.1) continue;

          // 封面主体通常居中，边缘权重递减
          const dist = Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
          const weight = 1 - (dist / maxDist) * 0.6;

          const key = `${Math.round(r / 16)},${Math.round(g / 16)},${Math.round(b / 16)}`;
          const existing = buckets.get(key);
          if (existing) {
            existing.r += r * weight;
            existing.g += g * weight;
            existing.b += b * weight;
            existing.count += weight;
          } else {
            buckets.set(key, { r: r * weight, g: g * weight, b: b * weight, count: weight });
          }
        }
      }

      if (buckets.size === 0) {
        let sr = 0, sg = 0, sb = 0, n = 0;
        for (let i = 0; i < data.length; i += 4) {
          const l = (Math.max(data[i], data[i+1], data[i+2]) + Math.min(data[i], data[i+1], data[i+2])) / 2;
          if (l < 25 || l > 230) continue;
          sr += data[i]; sg += data[i+1]; sb += data[i+2]; n++;
        }
        if (n > 0) {
          this._targetBg = this._adjustColor(Math.round(sr / n), Math.round(sg / n), Math.round(sb / n));
        }
      } else {
        let best = null;
        for (const b of buckets.values()) {
          if (!best || b.count > best.count) best = b;
        }
        this._targetBg = this._adjustColor(
          Math.round(best.r / best.count),
          Math.round(best.g / best.count),
          Math.round(best.b / best.count)
        );
      }
      this.kickLerp();
    } catch (e) {
      console.warn('[Music] extractColor failed:', e.message || e);
    }
  }

  _adjustColor(r, g, b) {
    const maxC = Math.max(r, g, b);
    if (maxC < 120) {
      const boost = 120 / maxC;
      r = Math.round(r * boost);
      g = Math.round(g * boost);
      b = Math.round(b * boost);
    }
    const avg = (r + g + b) / 3;
    r = Math.min(255, Math.round(r + (r - avg) * 0.1));
    g = Math.min(255, Math.round(g + (g - avg) * 0.1));
    b = Math.min(255, Math.round(b + (b - avg) * 0.1));
    return { r, g, b };
  }

  // ── Lively API bridges ──────────────────────────────

  livelyCurrentTrack(data) {
    try {
      const obj = JSON.parse(data);
      if (obj && obj.Title) this.showTrack(obj.Title, obj.Artist, obj.Thumbnail);
      else this.hideTrack();
    } catch(e) {
      console.warn('[Music] parse error:', e.message || e);
    }
  }

  livelyWallpaperPlaybackChanged(data) {
    try {
      const obj = JSON.parse(data);
      if (obj && obj.IsPaused === false) this._els.visualizer?.classList.add('active');
      else this._els.visualizer?.classList.remove('active');
    } catch(e) {
      console.warn('[Music] playback error:', e.message || e);
    }
  }
}

window.MusicModule = MusicModule;
