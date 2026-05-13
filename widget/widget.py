"""
Calendar Widget — 双击运行，自动搞定一切
"""
import ctypes, socket, threading, os, sys, time, shutil
from pathlib import Path
from http.server import HTTPServer, SimpleHTTPRequestHandler
import webview
import servers

# 路径适配：exe 运行时从临时目录读，开发时从脚本目录读
if getattr(sys, 'frozen', False):
    BUNDLE_DIR = Path(sys._MEIPASS)
else:
    BUNDLE_DIR = Path(__file__).resolve().parent
APP_DIR = BUNDLE_DIR / 'app'
EXAMPLE_DIR = BUNDLE_DIR / 'example-data'
HTTP_PORT = 18534
WIDTH, HEIGHT, RIGHT_MARGIN = 340, 740, 40


def screen_size():
    u = ctypes.windll.user32
    return u.GetSystemMetrics(0), u.GetSystemMetrics(1)


def first_run_setup():
    """首次运行：如果桌面没有数据文件，自动复制示例文件"""
    desktop = Path.home() / 'Desktop'
    files_to_check = [
        ('FitnessDiary.xlsx', '饮食记录表（可编辑）'),
        ('ToDoList.docx', '训练计划（可编辑）'),
    ]
    for filename, desc in files_to_check:
        target = desktop / filename
        if not target.exists():
            source = EXAMPLE_DIR / filename
            if source.exists():
                shutil.copy2(source, target)


def start_http():
    os.chdir(APP_DIR)
    srv = HTTPServer(('127.0.0.1', HTTP_PORT), SimpleHTTPRequestHandler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()


def create_window():
    sw, sh = screen_size()
    x, y = sw - WIDTH - RIGHT_MARGIN, (sh - HEIGHT) // 2
    webview.create_window(
        title='Calendar Widget',
        url=f'http://127.0.0.1:{HTTP_PORT}/calendar_widget.html',
        width=WIDTH, height=HEIGHT, x=x, y=y,
        frameless=True, easy_drag=False, resizable=False,
        on_top=False, focus=False, shadow=False,
        transparent=True, background_color='#000000'
    )


def main():
    # 错误日志（仅记录异常，正常时不产生文件）
    import traceback as _tb
    try:
        first_run_setup()
        servers.start_all()
        start_http()
        time.sleep(0.3)
        create_window()
        webview.start()
    except Exception as e:
        log = Path.home() / 'Desktop' / 'widget_error.log'
        with open(log, 'w', encoding='utf-8') as f:
            f.write(f'ERROR: {e}\n\n')
            _tb.print_exc(file=f)


if __name__ == '__main__':
    main()
