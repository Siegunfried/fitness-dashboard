# Sync Server Launcher - starts diet + training servers
import subprocess, sys, os, socket

HOST = '127.0.0.1'; SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SERVERS = [('diet_sync_server.py', 17532), ('training_sync_server.py', 17533)]

def is_running(port):
    try:
        s = socket.socket(); s.settimeout(0.3); s.connect((HOST, port)); s.close()
        return True
    except: return False

pythonw = sys.executable
if not pythonw.endswith('pythonw.exe'): pythonw = pythonw.replace('python.exe', 'pythonw.exe')

for script, port in SERVERS:
    if not is_running(port):
        subprocess.Popen([pythonw, os.path.join(SCRIPT_DIR, script)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
