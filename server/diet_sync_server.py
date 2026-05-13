#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Fitness Sync Server v8.0
- Auto-detects Excel changes via mtime
- Supports carbs & fats tracking (columns F/G)
- Structured file logging with rotation (7 days)
- Enhanced health endpoint
- Error-resilient data loading
"""
import sys
import json
import io
import os
import time
import logging
import traceback
from pathlib import Path
from datetime import datetime, timedelta
from logging.handlers import RotatingFileHandler
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

PORT = 17532
XLSX_PATH = Path.home() / 'Desktop' / 'FitnessDiary.xlsx'
SCRIPT_DIR = Path(__file__).resolve().parent
LOG_PATH = SCRIPT_DIR / 'server.log'

# --- Logging Setup ---
_logger = logging.getLogger('diet-sync')
_logger.setLevel(logging.DEBUG)

file_handler = RotatingFileHandler(
    str(LOG_PATH), maxBytes=256 * 1024, backupCount=7, encoding='utf-8'
)
file_handler.setLevel(logging.DEBUG)
file_handler.setFormatter(logging.Formatter(
    '%(asctime)s [%(levelname)s] %(message)s', datefmt='%Y-%m-%d %H:%M:%S'
))
_logger.addHandler(file_handler)

console_handler = logging.StreamHandler(sys.stdout)
console_handler.setLevel(logging.INFO)
console_handler.setFormatter(logging.Formatter('[%(levelname)s] %(message)s'))
_logger.addHandler(console_handler)

# --- State ---
_cached_data = None
_last_excel_mtime = 0.0
_last_load_time = 0.0
_last_error = None


def _parse_number(value):
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return round(value, 1)
    try:
        s = str(value).strip().replace('~', '').replace(',', '')
        return round(float(s), 1)
    except Exception:
        return None


def _evaluate_grade(composite_rate):
    """v9.0 统一等级：基于综合达成率 S/A/B/C/D"""
    if composite_rate is None:
        return '—'
    if composite_rate >= 90: return '优秀(S)'
    if composite_rate >= 80: return '良好(A)'
    if composite_rate >= 70: return '达标(B)'
    if composite_rate >= 60: return '基本达标(C)'
    return '未达标(D)'


def _compute_tdee(records, default=2200):
    """Estimate TDEE from recent weight history. Falls back to default."""
    weights = []
    for rec in records.values():
        w = rec.get('weight')
        if w is not None:
            weights.append(w)
    if len(weights) < 3:
        return default
    recent = weights[-7:] if len(weights) >= 7 else weights
    avg_weight = sum(recent) / len(recent)
    return round(avg_weight * 16.1, 1)


def _get_excel_mtime():
    try:
        if XLSX_PATH.exists():
            return os.path.getmtime(str(XLSX_PATH))
    except Exception:
        pass
    return 0.0


def load_excel_data():
    import openpyxl

    if not XLSX_PATH.exists():
        raise FileNotFoundError(f'Excel not found: {XLSX_PATH}')

    wb = openpyxl.load_workbook(XLSX_PATH, data_only=True)
    ws = wb['每日记录']

    height = 175.0
    tdee = 2200.0
    try:
        profile_ws = wb['个人档案']
        h = profile_ws['B5'].value
        if h is not None:
            height = float(h)
        td = profile_ws['B10'].value
        if td is not None:
            tdee = float(td)
    except Exception:
        _logger.debug('个人档案 sheet not found or height/TDEE missing, using default')

    targets = {
        'caloriesMin': 1860, 'caloriesMax': 2070,
        'proteinMin': 165, 'proteinMax': 170,
        'carbsMin': 150, 'carbsMax': 190,
        'fatMin': 70, 'fatMax': 80,
        'exerciseMin': 200, 'exerciseMax': 600,
        'deficitMin': 1100, 'deficitMax': 1600
    }

    daily_targets = {}
    try:
        targets_ws = wb['目标记录']
        for row_idx in range(2, targets_ws.max_row + 1):
            date_cell = targets_ws.cell(row=row_idx, column=1).value
            if not date_cell or not str(date_cell).startswith('20'):
                continue

            date_str = str(date_cell)
            cal_min = _parse_number(targets_ws.cell(row=row_idx, column=2).value)
            pro_min = _parse_number(targets_ws.cell(row=row_idx, column=3).value)
            carb_min = _parse_number(targets_ws.cell(row=row_idx, column=4).value)
            fat_min = _parse_number(targets_ws.cell(row=row_idx, column=5).value)
            ex_min = _parse_number(targets_ws.cell(row=row_idx, column=6).value)
            def_target = _parse_number(targets_ws.cell(row=row_idx, column=7).value)

            if cal_min is None and pro_min is None and ex_min is None and def_target is None:
                continue

            deficit_min = abs(def_target) if def_target is not None else 1100

            daily_targets[date_str] = {
                'caloriesMin': cal_min,
                'caloriesMax': cal_min,
                'proteinMin': pro_min,
                'proteinMax': pro_min,
                'carbsMin': carb_min,
                'carbsMax': carb_min,
                'fatMin': fat_min,
                'fatMax': fat_min,
                'exerciseMin': ex_min,
                'exerciseMax': ex_min,
                'deficitMin': deficit_min,
                'deficitMax': deficit_min
            }
    except Exception:
        _logger.warning('目标记录 sheet read failed, using defaults')

    records = {}

    for row_idx in range(3, 100):
        row = [ws.cell(row=row_idx, column=c).value for c in range(1, 26)]

        date_val = row[0]
        if not date_val or not str(date_val).startswith('20'):
            continue

        date_str = str(date_val)
        weekday = row[1] or ''
        diet_text = row[2] or ''
        calories = _parse_number(row[3])
        protein = _parse_number(row[4])
        carbs = _parse_number(row[5])
        fat = _parse_number(row[6])
        exercise_text = row[7] or ''
        duration = _parse_number(row[8])
        exercise_cal = _parse_number(row[9])
        weight = _parse_number(row[10])
        comment = str(row[11]) if row[11] else ''

        if calories is None and weight is None:
            continue

        day_targets = daily_targets.get(date_str, targets)

        # 服务端计算（不在 Excel 中存储）
        deficit = None
        bmi = None
        diet_score = None
        exercise_score = None
        overall_score = None

        if calories is not None:
            deficit = round(tdee - calories + (exercise_cal or 0), 1)

        if weight is not None and height > 0:
            bmi = round(weight / ((height / 100) ** 2), 1)

        if calories is not None:
            # ── v9.0 统一评分体系 — 每日目标驱动，服务端与Excel逻辑完全一致 ──
            cal_t = day_targets.get('caloriesMin') or 1860
            pro_t = day_targets.get('proteinMin') or 170
            carb_t = day_targets.get('carbsMin') or 170
            fat_t = day_targets.get('fatMin') or 75
            ex_t  = day_targets.get('exerciseMin') or 500
            def_t = day_targets.get('deficitMin') or 1100

            # ── 达成率 ──

            # S: 热量达成率 — 对称 Bell Curve ±10% 宽容区间
            # 营养学依据：严重少吃(代谢损伤)和严重多吃(脂肪堆积)同等有害，惩罚对称
            cal_delta = abs(calories - cal_t)
            if cal_delta <= cal_t * 0.10:
                diet_rate = 100
            else:
                diet_rate = round(max(0, 100 - (cal_delta - cal_t * 0.10) / (cal_t * 0.30) * 100))

            # T: 蛋白质达成率 — 单向（不低于目标），cap 150%
            protein_rate = round(min((protein or 0) / pro_t * 100, 150))

            # X: 碳水达成率 — Bell Curve ±20% 宽容区间
            # 超标惩罚乘数从 70 降至 50：碳水超标主要靠热量总控兜底，不必判死刑
            if carbs is not None:
                carb_delta = abs(carbs - carb_t)
                if carb_delta <= carb_t * 0.20:
                    carb_rate = 100
                elif carbs < carb_t:
                    carb_rate = round(max(0, carbs / (carb_t * 0.80) * 100))
                else:
                    carb_rate = round(max(0, 100 - (carbs - carb_t * 1.20) / (carb_t * 0.40) * 50))
            else:
                carb_rate = None

            # Y: 脂肪达成率 — 范围制 70%-130% = 100%
            if fat is not None:
                if fat_t * 0.70 <= fat <= fat_t * 1.30:
                    fat_rate = 100
                elif fat < fat_t * 0.70:
                    fat_rate = round(max(0, fat / (fat_t * 0.70) * 100))
                else:
                    fat_rate = round(max(0, 100 - (fat - fat_t * 1.30) / (fat_t * 0.30) * 40))
            else:
                fat_rate = None

            # U: 运动达成率 — 单向线性，cap 150%
            ex_actual = exercise_cal or 0
            exercise_rate = 0 if ex_actual == 0 else min(round(ex_actual / ex_t * 100), 150)

            # V: 缺口达成率 — Bell Curve ±20% 宽容区间
            def_delta = abs((deficit or 0) - def_t)
            if def_delta <= def_t * 0.20:
                deficit_rate = 100
            elif (deficit or 0) < def_t:
                deficit_rate = round(max(0, (deficit or 0) / (def_t * 0.80) * 100))
            else:
                deficit_rate = round(max(0, 100 - ((deficit or 0) - def_t * 1.20) / (def_t * 0.40) * 80))

            # W: 综合达成率
            c = diet_rate if diet_rate else 0
            p = protein_rate if protein_rate else 0
            x = carb_rate if carb_rate else 0
            y = fat_rate if fat_rate else 0
            u = exercise_rate if exercise_rate else 0
            v = deficit_rate if deficit_rate else 0
            composite_rate = round(c * 0.30 + p * 0.20 + x * 0.10 + y * 0.10 + u * 0.15 + v * 0.15)

            # N: 饮食评分 (0-100) — 热量50% + 蛋白质30% + 碳水10% + 脂肪10%
            sc = min(c, 100)
            sp = min(p if p else 0, 100)
            sx = min(x if x else 0, 100)
            sy = min(y if y else 0, 100)
            diet_score = round(sc * 0.50 + sp * 0.30 + sx * 0.10 + sy * 0.10)

            # O: 运动评分 (0-100) — 达成率60% + 强度40%
            dur = duration or 0
            if ex_actual == 0:
                exercise_score = 0
            elif dur > 0:
                intensity = min(ex_actual / dur / 10, 1.0) * 100  # 10kcal/min = 满分强度
                exercise_score = round(min(u, 100) * 0.60 + intensity * 0.40)
            else:
                exercise_score = round(min(u, 100) * 0.60)

            # P: 综合评分 (0-100) — 有运动时饮食55%+运动45%，无运动时=饮食评分
            if ex_actual > 0:
                overall_score = round(diet_score * 0.55 + exercise_score * 0.45)
            else:
                overall_score = round(diet_score)

            # R: 综合评估 — S/A/B/C/D 五级，基于综合达成率
            grade = _evaluate_grade(composite_rate)

            # 自动评语
            is_auto_comment = False
            if not comment or '缺口' in comment or comment == '正常':
                parts = []
                if deficit is not None:
                    parts.append(f'缺口{deficit}kcal' + (f'(目标{def_t})' if abs(deficit - def_t) > def_t * 0.3 else '(达标)'))
                if ex_actual == 0:
                    parts.append('无运动')
                elif exercise_rate >= 80:
                    parts.append('运动达标')
                else:
                    parts.append('运动不足')
                comment = '，'.join(parts) if parts else '正常'
                is_auto_comment = True
        else:
            diet_rate = protein_rate = carb_rate = fat_rate = None
            exercise_rate = deficit_rate = composite_rate = None
            diet_score = exercise_score = overall_score = None
            grade = None
            is_auto_comment = False

        records[date_str] = {
            'weekday': weekday,
            'diet': diet_text,
            'calories': calories,
            'protein': protein,
            'carbs': carbs,
            'fat': fat,
            'exercise': exercise_text,
            'duration': duration,
            'exerciseCalories': exercise_cal,
            'deficit': deficit,
            'weight': weight,
            'bmi': bmi,
            'dietScore': diet_score,
            'exerciseScore': exercise_score,
            'overallScore': overall_score,
            'grade': grade,
            'compositeRate': composite_rate,
            'dietRate': diet_rate,
            'proteinRate': protein_rate,
            'carbRate': carb_rate,
            'fatRate': fat_rate,
            'exerciseRate': exercise_rate,
            'deficitRate': deficit_rate,
            'comment': comment,
            'isAutoComment': is_auto_comment,
            'targets': day_targets
        }

    wb.close()

    return {
        'profile': {
            'name': ''  # set your name in Excel 个人档案,
            'height': height,
            'tdee': tdee,
            'targets': targets
        },
        'records': records
    }


def get_data(force_reload=False):
    global _cached_data, _last_excel_mtime, _last_load_time, _last_error

    current_mtime = _get_excel_mtime()
    if current_mtime > 0 and current_mtime != _last_excel_mtime:
        force_reload = True
        _logger.info(f'Excel modified (mtime={current_mtime}), auto-reloading')

    if force_reload or _cached_data is None:
        try:
            _cached_data = load_excel_data()
            _last_excel_mtime = _get_excel_mtime()
            _last_load_time = time.time()
            _last_error = None
            count = len(_cached_data.get('records', {}))
            _logger.info(f'Data loaded: {count} records, tdee={_cached_data["profile"]["tdee"]}')
        except Exception as e:
            _last_error = str(e)
            _logger.error(f'Load failed: {e}\n{traceback.format_exc()}')
            if _cached_data is None:
                raise

    return _cached_data


class SyncHandler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        _logger.debug(fmt % args)

    def _json_response(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', len(body))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = urlparse(self.path).path

        if path == '/data':
            try:
                data = get_data(force_reload=False)
                self._json_response({'success': True, 'data': data})
            except Exception as e:
                _logger.error(f'/data error: {e}')
                self._json_response({'success': False, 'error': str(e)}, 500)

        elif path == '/sync':
            try:
                data = get_data(force_reload=True)
                count = len(data.get('records', {}))
                _logger.info(f'Sync requested, {count} records returned')
                self._json_response({'success': True, 'data': data, 'synced': True})
            except Exception as e:
                _logger.error(f'/sync error: {e}')
                self._json_response({'success': False, 'error': str(e)}, 500)

        elif path == '/health':
            self._json_response({
                'status': 'ok',
                'version': '8.0',
                'excel': str(XLSX_PATH),
                'excel_exists': XLSX_PATH.exists(),
                'excel_mtime': _last_excel_mtime,
                'last_load_time': _last_load_time,
                'record_count': len(_cached_data.get('records', {})) if _cached_data else 0,
                'cached': _cached_data is not None,
                'last_error': _last_error,
                'uptime': time.time() - _last_load_time if _last_load_time > 0 else 0
            })

        else:
            self._json_response({'error': 'Not found'}, 404)


if __name__ == '__main__':
    _logger.info(f'Server v8.0 starting on http://127.0.0.1:{PORT}')
    _logger.info(f'Excel path: {XLSX_PATH}')
    server = HTTPServer(('127.0.0.1', PORT), SyncHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        _logger.info('Server stopped by user')
        print('\nServer stopped.')
