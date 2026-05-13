"""
Calendar Widget — 一键启动：后端服务器 + 桌面日历小组件
"""
import ctypes, socket, threading, os, time
from pathlib import Path
from http.server import HTTPServer, SimpleHTTPRequestHandler
import webview
import servers

# PyInstaller exe 运行时从临时目录读取，开发时从脚本目录
if getattr(sys, 'frozen', False):
    APP_DIR = Path(sys._MEIPASS) / 'app'
else:
    APP_DIR = Path(__file__).resolve().parent / 'app'
HTTP_PORT = 18534
WIDTH, HEIGHT, RIGHT_MARGIN = 340, 740, 40


def screen_size():
    u = ctypes.windll.user32
    return u.GetSystemMetrics(0), u.GetSystemMetrics(1)


def start_http():
    os.chdir(APP_DIR)
    srv = HTTPServer(('127.0.0.1', HTTP_PORT), SimpleHTTPRequestHandler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()


def create_window():
    sw, sh = screen_size()
    x, y = sw - WIDTH - RIGHT_MARGIN, (sh - HEIGHT) // 2
    url = f'http://127.0.0.1:{HTTP_PORT}/calendar_widget.html'

    webview.create_window(
        title='Calendar Widget',
        url=url,
        width=WIDTH, height=HEIGHT, x=x, y=y,
        frameless=True, easy_drag=False, resizable=False,
        on_top=False, focus=False, shadow=False,
        transparent=True, background_color='#000000'
    )


def main():
    log_path = Path.home() / 'Desktop' / 'widget.log'

    # noconsole exe 中 stdout 不可用，重定向到日志文件
    log_fh = open(log_path, 'w', encoding='utf-8')
    sys.stdout = log_fh
    sys.stderr = log_fh

    try:
        print('[Widget] Starting...')
        print(f'  frozen={getattr(sys, "frozen", False)}')

        print('[Widget] Starting backend servers...')
        ok = servers.start_all()
        print(f'  servers_ok={ok}')

        print('[Widget] Starting HTTP...')
        start_http()
        time.sleep(0.3)

        print('[Widget] Creating window...')
        create_window()
        print('[Widget] Running.')
        webview.start()
    except Exception as e:
        print(f'[ERROR] {e}')
        import traceback
        traceback.print_exc()
    finally:
        log_fh.close()


if __name__ == '__main__':
    main()
