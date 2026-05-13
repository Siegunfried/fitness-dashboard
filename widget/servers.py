"""
后台服务器启动器 — 自动适配开发环境和 PyInstaller exe。
"""
import sys, threading, socket, os, time
from pathlib import Path


def _app_dir():
    """获取 app 目录：exe 运行时从 _MEIPASS，开发时从脚本目录"""
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
        print('[Widget] 饮食服务器 :17532 已启动')

    if not check(17533):
        import training_sync_server as training
        threading.Thread(
            target=lambda: training.HTTPServer(('127.0.0.1', 17533), training.H).serve_forever(),
            daemon=True
        ).start()
        print('[Widget] 训练服务器 :17533 已启动')

    for _ in range(10):
        if check(17532) and check(17533):
            return True
        time.sleep(0.5)
    return False
