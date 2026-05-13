/**
 * Shell - application entry point.
 *
 * Creates infrastructure, registers modules, boots everything.
 * Lively API functions are bridged to the Music module via window globals
 * (Lively expects them at the window level).
 */
class Shell {
  constructor() {
    this._registry = null;
  }

  start() {
    // 1. Infrastructure
    const eventBus = new EventBus();
    const dataStore = new DataStore(eventBus);
    const dataService = new DataService({ eventBus, dataStore });
    const statusManager = new StatusManager({ eventBus, dataStore });

    // Expose globals for backward compat and Lively API bridges
    window._eventBus = eventBus;
    window._dataStore = dataStore;
    window._dataService = dataService;

    // 2. Debug panel (active when ?debug=1)
    window._debug = new DebugPanel(eventBus);

    // 3. Module registry
    this._registry = new ModuleRegistry({ eventBus, dataStore });

    // 4. Register modules
    const music = this._registry.register(MusicModule);
    this._registry.register(StatusBarModule);
    this._registry.register(CalendarModule);
    this._registry.register(ChartsModule);
    this._registry.register(TrainingModule);

    // 5. Bridge Lively API → Music module
    window.livelyAudioListener = (arr) => music.livelyAudioListener(arr);
    window.livelyCurrentTrack = (data) => music.livelyCurrentTrack(data);
    window.livelyWallpaperPlaybackChanged = (data) => music.livelyWallpaperPlaybackChanged(data);

    // 6. Init all modules (creates DOM, binds events)
    this._registry.initAll();

    // 7. Fetch data (non-blocking, auto-retries)
    dataService.load();

    console.log('[Shell] App started with ' + this._registry._modules.length + ' modules');
  }
}

window.Shell = Shell;
