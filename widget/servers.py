"""
后台服务器启动器 — 自动适配开发环境和 PyInstaller exe。
(无 print，兼容 noconsole exe)
"""
import sys, threading, socket, time
from pathlib import Path


def _app_dir():
    if getattr(sys, 'frozen', False):
        return Path(sys._MEIPASS) / 'app'
    return Path(__file__).resolve().parent / 'app'


def check(port):
    try:
        s = socket.socket(); s.settimeout(0.3)
        s.connect(('127.0.0.1', port)); s.close()
        return True
    except:
        return False


def start_all():
    app = _app_dir()
    sys.path.insert(0, str(app))

    if not check(17532):
        import diet_sync_server as diet
        threading.Thread(
            target=lambda: diet.HTTPServer(('127.0.0.1', 17532), diet.SyncHandler).serve_forever(),
            daemon=True
        ).start()

    if not check(17533):
        import training_sync_server as training
        threading.Thread(
            target=lambda: training.HTTPServer(('127.0.0.1', 17533), training.H).serve_forever(),
            daemon=True
        ).start()

    for _ in range(10):
        if check(17532) and check(17533):
            return True
        time.sleep(0.5)
    return False
