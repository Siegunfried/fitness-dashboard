/**
 * DietData - backward-compat wrapper v3.0
 *
 * Delegates to DataStore when available; keeps a local fallback otherwise.
 * Existing callers (DietCalendar, DietCharts) continue to work unchanged.
 * New code should use DataStore + EventBus directly.
 */
const DietData = (function() {
  let _fallback = null;
  const _listeners = new Set();
  const _readyCallbacks = [];

  function _resolve() {
    return window._dataStore || null;
  }

  function _notifyChange() {
    _listeners.forEach(fn => {
      try { fn(); } catch (e) { console.warn('[DietData] listener error:', e); }
    });
  }

  function _checkReady() {
    const store = _resolve();
    if (store && store.isReady) {
      _readyCallbacks.forEach(cb => { try { cb(store.get()); } catch (e) {} });
      _readyCallbacks.length = 0;
    }
  }

  // Listen for data:changed on EventBus to forward to legacy listeners
  if (window._eventBus) {
    window._eventBus.on('data:changed', () => _notifyChange());
  }

  return {
    ready(callback) {
      if (typeof callback !== 'function') return;
      const store = _resolve();
      if (store && store.isReady) callback(store.get());
      else _readyCallbacks.push(callback);
    },

    get() {
      const store = _resolve();
      return store?.get() || _fallback;
    },

    getRecord(dateStr) {
      const store = _resolve();
      if (store) return store.getRecord(dateStr);
      return _fallback?.records?.[dateStr] || null;
    },

    getTargets() {
      const store = _resolve();
      if (store) return store.getTargets();
      return _fallback?.profile?.targets || DataStore?.DEFAULTS || {
        caloriesMin: 1860, caloriesMax: 2070,
        proteinMin: 165, proteinMax: 170,
        carbsMin: 150, carbsMax: 190,
        fatMin: 70, fatMax: 80,
        exerciseMin: 200, exerciseMax: 600,
        deficitMin: 1100, deficitMax: 1600
      };
    },

    getProfile() {
      const store = _resolve();
      if (store) return store.getProfile();
      return _fallback?.profile || { name: '', height: 175, tdee: 2200 };
    },

    set(data) {
      const store = _resolve();
      if (store) { store.set(data); return; }
      _fallback = data;
      _checkReady();
      _notifyChange();
    },

    async sync() {
      if (window._dataService) {
        await window._dataService.sync();
        const store = _resolve();
        return { success: true, data: store?.get() || _fallback };
      }
      throw new Error('DataService not available');
    },

    onChange(listener) {
      if (typeof listener !== 'function') return () => {};
      _listeners.add(listener);
      return () => _listeners.delete(listener);
    }
  };
})();
