#!/usr/bin/env python3
"""Training Sync Server — 解析 ToDoList.docx 缩进结构，端口 17533"""
import sys, json, io, logging, traceback
from pathlib import Path
from datetime import datetime
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse

try: sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
except: pass  # noconsole exe
PORT = 17533
DOCX_PATH = Path.home() / 'Desktop' / 'ToDoList.docx'
SCRIPT_DIR = Path(__file__).resolve().parent
LOG_PATH = SCRIPT_DIR / 'training_server.log'

_logger = logging.getLogger('training')
_logger.setLevel(logging.DEBUG)
fh = logging.FileHandler(LOG_PATH, encoding='utf-8'); fh.setLevel(logging.DEBUG)
fh.setFormatter(logging.Formatter('%(asctime)s [%(levelname)s] %(message)s'))
_logger.addHandler(fh)
ch = logging.StreamHandler(sys.stdout); ch.setLevel(logging.INFO)
ch.setFormatter(logging.Formatter('[%(levelname)s] %(message)s'))
_logger.addHandler(ch)

def parse_docx():
    from docx import Document
    if not DOCX_PATH.exists(): return {'today':'','label':'','tasks':[]}
    doc = Document(DOCX_PATH)
    weekdays = ['周一','周二','周三','周四','周五','周六','周日']
    today = weekdays[datetime.now().weekday()]
    week, cur = {}, None
    for p in doc.paragraphs:
        t = p.text.strip()
        if not t or t.startswith('─') or t.startswith('数据源') or t.startswith('训练计划') or t == 'TodoList':
            continue
        indent = (p.paragraph_format.left_indent or 0) / 914400
        matched = next((w for w in weekdays if t.startswith(w)), None)
        if indent < 0.2 and matched:
            cur = matched
            week[cur] = {'label': t.split('—',1)[-1].strip() if '—' in t else '', 'tasks': []}
        elif indent >= 0.2 and cur and cur in week:
            week[cur]['tasks'].append(t)
    e = week.get(today, {})
    return {'title':'TodoList','today':today,'label':e.get('label',''),'tasks':e.get('tasks',[])}

class H(BaseHTTPRequestHandler):
    def log_message(self,f,*a): _logger.debug(f%a)
    def _j(self,d,s=200):
        b = json.dumps(d,ensure_ascii=False).encode('utf-8')
        self.send_response(s)
        self.send_header('Content-Type','application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin','*')
        self.send_header('Cache-Control','no-cache')
        self.send_header('Content-Length',len(b)); self.end_headers(); self.wfile.write(b)
    def do_GET(self):
        p = urlparse(self.path).path
        if p == '/training':
            try: self._j({'success':True,'data':parse_docx()})
            except Exception as e: _logger.error(f'/training: {e}'); self._j({'success':False,'error':str(e)},500)
        elif p == '/health': self._j({'status':'ok','docx':str(DOCX_PATH),'docx_exists':DOCX_PATH.exists()})
        else: self._j({'error':'Not found'},404)

if __name__ == '__main__':
    _logger.info(f'Training server on http://127.0.0.1:{PORT}')
    HTTPServer(('127.0.0.1', PORT), H).serve_forever()
