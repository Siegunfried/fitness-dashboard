/**
 * ChartsModule - wraps DietCharts as a pluggable module.
 */
class ChartsModule extends BaseModule {
  init() {
    this._instance = new DietCharts({
      eventBus: this._bus,
      dataStore: this._store,
      dietData: window.DietData
    });
  }

  destroy() {
    this._instance?.destroy();
    this._instance = null;
  }
}

window.ChartsModule = ChartsModule;
