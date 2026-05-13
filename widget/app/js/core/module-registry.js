/**
 * ModuleRegistry - manages pluggable feature modules.
 *
 * Each module must implement:
 *   init()     - register events, create DOM, bootstrap
 *   destroy()  - cleanup events, remove DOM
 *
 * Modules receive { eventBus, dataStore } from the app shell.
 */
class ModuleRegistry {
  constructor({ eventBus, dataStore } = {}) {
    this._bus = eventBus;
    this._store = dataStore;
    this._modules = [];
  }

  /** Register a module class and optionally auto-init */
  register(ModuleClass, options = {}) {
    const instance = new ModuleClass({
      eventBus: this._bus,
      dataStore: this._store,
      ...options
    });
    this._modules.push(instance);
    return instance;
  }

  /** Call init() on all registered modules */
  initAll() {
    this._modules.forEach(m => {
      try {
        if (typeof m.init === 'function') m.init();
      } catch (e) {
        console.warn('[Registry] init failed:', m.constructor.name, e);
      }
    });
    console.log(`[Registry] ${this._modules.length} modules active`);
  }

  /** Call destroy() on all modules (reverse order) */
  destroyAll() {
    [...this._modules].reverse().forEach(m => {
      try {
        if (typeof m.destroy === 'function') m.destroy();
      } catch (e) {
        console.warn('[Registry] destroy failed:', m.constructor.name, e);
      }
    });
    this._modules = [];
  }
}

/**
 * Base class for modules - extend this to get auto-wired eventBus/dataStore.
 */
class BaseModule {
  constructor({ eventBus, dataStore } = {}) {
    this._bus = eventBus;
    this._store = dataStore;
  }
  init() {}    // override: bootstrap
  destroy() {} // override: cleanup
}

window.ModuleRegistry = ModuleRegistry;
window.BaseModule = BaseModule;
