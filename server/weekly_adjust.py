#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
每周饮食目标自动调整脚本 v1.0
================================
功能：根据最近7天体重变化，自动调整下周碳水/蛋白质/脂肪目标
用法：python weekly_adjust.py [--dry-run] [--weeks 1]
      --dry-run  预览调整方案，不写入Excel
      --weeks N  生成接下来N周的计划（默认1周）
"""

import sys
import os
import json
import argparse
from pathlib import Path
from datetime import datetime, timedelta
from collections import OrderedDict

XLSX_PATH = Path.home() / 'Desktop' / 'FitnessDiary.xlsx'

# ── 默认起始参数 ──
DEFAULT_WEIGHT = 70.0       # kg
DEFAULT_PROTEIN = 120        # g/天
DEFAULT_CARBS = 200          # g/天
DEFAULT_FAT = 75             # g/天
DEFAULT_EXERCISE_DAY = 600   # kcal (训练日运动消耗目标)
DEFAULT_EXERCISE_LIGHT = 400 # kcal (轻运动日)
DEFAULT_EXERCISE_REST = 200  # kcal (休息日)
DEFAULT_DEFICIT = -800       # kcal


def parse_number(value):
    """安全解析数值"""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return round(value, 1)
    try:
        return round(float(str(value).strip().replace('~', '').replace(',', '')), 1)
    except:
        return None


def get_week_range(monday_date):
    """返回周一到周日的日期列表"""
    return [(monday_date + timedelta(days=i)).strftime('%Y-%m-%d') for i in range(7)]


def load_weight_history():
    """从Excel读取体重历史，返回 {日期: (体重, 摄入热量, 蛋白质), ...}"""
    import openpyxl
    if not XLSX_PATH.exists():
        print(f'[ERROR] Excel not found: {XLSX_PATH}')
        return {}

    wb = openpyxl.load_workbook(XLSX_PATH, data_only=True)
    ws = wb['每日记录']

    history = OrderedDict()
    for row_idx in range(3, 100):
        date_val = ws.cell(row=row_idx, column=1).value
        if not date_val or not str(date_val).startswith('20'):
            continue
        date_str = str(date_val)
        weight = parse_number(ws.cell(row=row_idx, column=12).value)  # L=体重
        calories = parse_number(ws.cell(row=row_idx, column=4).value)  # D=热量
        protein = parse_number(ws.cell(row=row_idx, column=5).value)  # E=蛋白质
        carbs = parse_number(ws.cell(row=row_idx, column=6).value)    # F=碳水
        fat = parse_number(ws.cell(row=row_idx, column=7).value)      # G=脂肪
        exercise_cal = parse_number(ws.cell(row=row_idx, column=10).value)  # J=消耗
        deficit = parse_number(ws.cell(row=row_idx, column=11).value) # K=缺口

        if weight is not None or calories is not None:
            history[date_str] = {
                'weight': weight,
                'calories': calories,
                'protein': protein,
                'carbs': carbs,
                'fat': fat,
                'exercise_cal': exercise_cal,
                'deficit': deficit
            }

    wb.close()
    return history


def get_latest_targets():
    """从 目标记录 读取最近一天的目标值"""
    import openpyxl
    if not XLSX_PATH.exists():
        return {}

    wb = openpyxl.load_workbook(XLSX_PATH, data_only=True)
    ws = wb['目标记录']

    latest = {}
    for row_idx in range(2, ws.max_row + 1):
        date_val = ws.cell(row=row_idx, column=1).value
        if not date_val or not str(date_val).startswith('20'):
            continue

        cal = parse_number(ws.cell(row=row_idx, column=3).value)
        protein = parse_number(ws.cell(row=row_idx, column=4).value)
        carbs = parse_number(ws.cell(row=row_idx, column=5).value)
        fat = parse_number(ws.cell(row=row_idx, column=6).value)
        exercise = parse_number(ws.cell(row=row_idx, column=7).value)
        deficit = parse_number(ws.cell(row=row_idx, column=8).value)

        if cal is not None or protein is not None:
            latest[str(date_val)] = {
                'calories': cal,
                'protein': protein,
                'carbs': carbs,
                'fat': fat,
                'exercise': exercise,
                'deficit': deficit
            }

    wb.close()
    return latest


def analyze_weight_trend(history, days=7):
    """分析最近N天体重趋势"""
    dates = list(history.keys())
    if len(dates) < 3:
        return None

    # 取最近有体重数据的记录
    weight_records = []
    for d in reversed(dates):
        w = history[d].get('weight')
        if w is not None:
            weight_records.append((d, w))
        if len(weight_records) >= days:
            break

    if len(weight_records) < 3:
        return None

    weight_records.reverse()  # 按时间正序

    # 最近7天平均 vs 更早
    recent = weight_records[-min(7, len(weight_records)):]
    older = weight_records[:-min(7, len(weight_records))]

    avg_recent = sum(w for _, w in recent) / len(recent)
    avg_older = sum(w for _, w in older) / len(older) if older else avg_recent

    weekly_change = avg_recent - avg_older if older else None
    first_to_last = weight_records[-1][1] - weight_records[0][1]

    return {
        'avg_recent_7d': round(avg_recent, 1),
        'avg_older': round(avg_older, 1) if older else None,
        'weekly_change': round(weekly_change, 1) if weekly_change is not None else None,
        'first_to_last': round(first_to_last, 1),
        'latest_weight': weight_records[-1][1],
        'num_records': len(weight_records),
        'dates': [d for d, _ in weight_records],
    }


def compute_adjustment(trend):
    """根据体重趋势计算调整方案（用户决策树）"""
    if trend is None:
        return {'action': 'insufficient_data', 'carbs_adjust': 0, 'reason': '数据不足（至少需要3天体重记录）'}

    change = trend['weekly_change']
    if change is None:
        change = trend['first_to_last']

    # ── 决策树 ──
    if change < -1.0:
        return {
            'action': 'maintain_or_increase',
            'carbs_adjust': 15,
            'reason': f'体重下降过快({change}kg)，减重太快可能流失肌肉，建议维持或微增碳水保护代谢'
        }
    elif -1.0 <= change <= -0.5:
        return {
            'action': 'ideal',
            'carbs_adjust': 0,
            'reason': f'体重下降理想({change}kg)，在0.5-1.0kg/周区间，继续执行当前方案'
        }
    elif -0.5 < change <= -0.3:
        return {
            'action': 'slight_reduce',
            'carbs_adjust': -12,
            'reason': f'体重温和下降({change}kg)，略低于目标区间，微降碳水温和发展'
        }
    elif -0.3 < change <= 0:
        return {
            'action': 'reduce',
            'carbs_adjust': -20,
            'reason': f'体重下降过慢({change}kg)，需要加大碳水削减力度'
        }
    else:  # change > 0
        return {
            'action': 'check_and_reduce',
            'carbs_adjust': -25,
            'reason': f'体重上升({change}kg)，先确认非水分波动（高钠/便秘），再执行碳水削减'
        }


def generate_week_plan(start_date, base_carbs, base_protein, base_fat, exercise_schedule):
    """
    生成一周7天的每日目标
    exercise_schedule: 长度7的列表，每项为 'train'/'light'/'rest'
    """
    days = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
    plan = []

    for i, day_type in enumerate(exercise_schedule):
        date = start_date + timedelta(days=i)
        date_str = date.strftime('%Y-%m-%d')

        if day_type == 'train':
            carbs = base_carbs + 20     # 篮球日 +20g
            protein = base_protein
            fat = base_fat - 5          # 训练日微降脂肪
            calories = protein * 4 + carbs * 4 + fat * 9
            exercise_target = DEFAULT_EXERCISE_DAY
        elif day_type == 'light':
            carbs = base_carbs - 10     # 轻运动日 -10g
            protein = base_protein
            fat = base_fat
            calories = protein * 4 + carbs * 4 + fat * 9
            exercise_target = DEFAULT_EXERCISE_LIGHT
        else:  # rest
            carbs = base_carbs - 20     # 休息日 -20g
            protein = base_protein - 5  # 休息日微降蛋白质
            fat = base_fat + 5          # 休息日微增脂肪
            calories = protein * 4 + carbs * 4 + fat * 9
            exercise_target = DEFAULT_EXERCISE_REST

        plan.append({
            'date': date_str,
            'weekday': days[i],
            'type': {'train': '篮球日', 'light': '轻运动', 'rest': '休息日'}[day_type],
            'calories': round(calories),
            'protein': round(protein),
            'carbs': round(carbs),
            'fat': round(fat),
            'exercise': exercise_target,
            'deficit': DEFAULT_DEFICIT
        })

    return plan


def write_weekly_targets(plan):
    """将周计划写入 目标记录 sheet"""
    import openpyxl
    wb = openpyxl.load_workbook(XLSX_PATH)
    ws = wb['目标记录']

    # 查找现有日期行或创建新行
    plan_dates = {p['date'] for p in plan}
    existing_dates = {}

    for row_idx in range(2, ws.max_row + 1):
        date_val = ws.cell(row=row_idx, column=1).value
        if date_val and str(date_val) in plan_dates:
            existing_dates[str(date_val)] = row_idx

    # 写入目标值
    for item in plan:
        if item['date'] in existing_dates:
            r = existing_dates[item['date']]
            # 确保B列为星期公式
            ws.cell(row=r, column=2).value = f'=TEXT(A{r},"AAAA")'
        else:
            # 找到最后一行并追加
            last_row = ws.max_row
            for check_r in range(ws.max_row, 1, -1):
                if ws.cell(row=check_r, column=1).value:
                    last_row = check_r + 1
                    break
            r = last_row
            ws.cell(row=r, column=1).value = item['date']
            ws.cell(row=r, column=2).value = f'=TEXT(A{r},"AAAA")'

        ws.cell(row=r, column=3).value = item['calories']    # C: 热量目标
        ws.cell(row=r, column=4).value = item['protein']     # D: 蛋白质目标
        ws.cell(row=r, column=5).value = item['carbs']        # E: 碳水目标
        ws.cell(row=r, column=6).value = item['fat']          # F: 脂肪目标
        ws.cell(row=r, column=7).value = item['exercise']     # G: 运动消耗目标
        ws.cell(row=r, column=8).value = item['deficit']      # H: 缺口目标

    wb.save(XLSX_PATH)
    wb.close()
    return True


def print_plan_summary(trend, adjustment, plan, dry_run=False):
    """打印调整方案摘要"""
    print()
    print('=' * 60)
    print('   每周饮食目标调整报告')
    print('=' * 60)

    if trend:
        print(f'\n📊 体重趋势分析：')
        print(f'   最近记录数: {trend["num_records"]} 天')
        print(f'   记录日期: {trend["dates"][0]} ~ {trend["dates"][-1]}')
        print(f'   7日均重: {trend["avg_recent_7d"]} kg')
        if trend['avg_older']:
            print(f'   前期均重: {trend["avg_older"]} kg')
        print(f'   周变化: {trend["weekly_change"]} kg')
        print(f'   最新体重: {trend["latest_weight"]} kg')

    print(f'\n🔧 调整决策：')
    print(f'   动作: {adjustment["action"]}')
    print(f'   碳水调整: {adjustment["carbs_adjust"]:+d}g')
    print(f'   原因: {adjustment["reason"]}')

    print(f'\n📅 下周计划 {"(预览)" if dry_run else "(已写入Excel)"}：')
    print(f'   {"日期":>12}  {"类型":<6}  {"热量":>6}  {"蛋白质":>6}  {"碳水":>5}  {"脂肪":>4}  {"运动":>5}')
    print(f'   {"─"*12}  {"─"*6}  {"─"*6}  {"─"*6}  {"─"*5}  {"─"*4}  {"─"*5}')

    total_cal = total_pro = total_carbs = total_fat = 0
    for item in plan:
        print(f'   {item["date"]}  {item["type"]:<6}  {item["calories"]:>5}kcal  {item["protein"]:>5}g   {item["carbs"]:>4}g   {item["fat"]:>3}g   {item["exercise"]:>4}kcal')
        total_cal += item['calories']
        total_pro += item['protein']
        total_carbs += item['carbs']
        total_fat += item['fat']

    n = len(plan)
    print(f'   {"─"*12}  {"─"*6}  {"─"*6}  {"─"*6}  {"─"*5}  {"─"*4}  {"─"*5}')
    print(f'   {"平均":>12}  {"":<6}  {total_cal//n:>5}kcal  {total_pro/n:>5.0f}g   {total_carbs/n:>4.0f}g   {total_fat/n:>3.0f}g')
    print()
    print(f'💡 每日睡前检查清单：')
    print(f'   □ 3餐+1加餐  □ 蛋白质≥{plan[0]["protein"]}g  □ 碳水~{plan[0]["carbs"]}g')
    print(f'   □ 脂肪~{plan[0]["fat"]}g  □ 饮水≥2L  □ 已记录')
    print('=' * 60)


def main():
    parser = argparse.ArgumentParser(description='每周饮食目标自动调整')
    parser.add_argument('--dry-run', action='store_true', help='预览模式，不写入Excel')
    parser.add_argument('--base-carbs', type=float, default=None, help='基础碳水目标(g)')
    parser.add_argument('--base-protein', type=float, default=None, help='基础蛋白质目标(g)')
    parser.add_argument('--base-fat', type=float, default=None, help='基础脂肪目标(g)')
    parser.add_argument('--schedule', type=str, default='train,train,rest,train,light,train,rest',
                        help='训练安排(逗号分隔7天): train/light/rest')
    parser.add_argument('--start-date', type=str, default=None,
                        help='起始周一日期 (YYYY-MM-DD)，默认下周一')
    args = parser.parse_args()

    # ── Step 1: 读取历史数据 ──
    print('[1/5] 读取体重历史...')
    history = load_weight_history()
    if not history:
        print('[ERROR] 无历史数据')
        return 1
    print(f'      已读取 {len(history)} 条记录')

    # ── Step 2: 读取当前目标 ──
    print('[2/5] 读取当前目标值...')
    latest_targets = get_latest_targets()
    if latest_targets:
        last_date = max(latest_targets.keys())
        lt = latest_targets[last_date]
        base_carbs = args.base_carbs or lt.get('carbs') or DEFAULT_CARBS
        base_protein = args.base_protein or lt.get('protein') or DEFAULT_PROTEIN
        base_fat = args.base_fat or lt.get('fat') or DEFAULT_FAT
        print(f'      最新目标({last_date}): 碳水{base_carbs}g, 蛋白质{base_protein}g, 脂肪{base_fat}g')
    else:
        base_carbs = args.base_carbs or DEFAULT_CARBS
        base_protein = args.base_protein or DEFAULT_PROTEIN
        base_fat = args.base_fat or DEFAULT_FAT
        print(f'      使用默认目标: 碳水{base_carbs}g, 蛋白质{base_protein}g, 脂肪{base_fat}g')

    # ── Step 3: 分析趋势 ──
    print('[3/5] 分析体重趋势...')
    trend = analyze_weight_trend(history, days=7)
    if trend is None:
        print('[WARN] 体重数据不足，使用默认调整')
    else:
        print(f'      7日均重: {trend["avg_recent_7d"]}kg, 周变化: {trend["weekly_change"]}kg')

    # ── Step 4: 计算调整 ──
    print('[4/5] 计算调整方案...')
    adjustment = compute_adjustment(trend)
    new_carbs = base_carbs + adjustment['carbs_adjust']
    new_carbs = max(120, min(250, new_carbs))  # 安全范围 120-250g
    print(f'      碳水: {base_carbs}g → {new_carbs}g ({adjustment["carbs_adjust"]:+d}g)')
    print(f'      蛋白质: {base_protein}g (不变)')
    print(f'      脂肪: {base_fat}g (微调)')

    # ── Step 5: 生成周计划 ──
    print('[5/5] 生成下周计划...')

    schedule_types = args.schedule.split(',')
    if len(schedule_types) != 7:
        print('[ERROR] --schedule 必须是7个逗号分隔的值')
        return 1
    for t in schedule_types:
        if t not in ('train', 'light', 'rest'):
            print(f'[ERROR] 无效的训练类型: {t}，可选 train/light/rest')
            return 1

    if args.start_date:
        start_date = datetime.strptime(args.start_date, '%Y-%m-%d')
    else:
        today = datetime.now()
        days_until_monday = (7 - today.weekday()) % 7
        if days_until_monday == 0:
            days_until_monday = 7  # 如果今天是周一，取下周一
        start_date = today + timedelta(days=days_until_monday)

    plan = generate_week_plan(start_date, new_carbs, base_protein, base_fat, schedule_types)

    # ── 输出 ──
    print_plan_summary(trend, adjustment, plan, dry_run=args.dry_run)

    if args.dry_run:
        print('\n[DRY-RUN] 未写入Excel。去掉 --dry-run 参数以执行写入。')
        return 0

    # ── 写入Excel ──
    confirm = input('\n确认写入Excel？(y/N): ').strip().lower()
    if confirm != 'y':
        print('已取消。')
        return 0

    print('写入中...')
    write_weekly_targets(plan)
    print('✅ 下周目标已写入 FitnessDiary.xlsx → 目标记录 sheet')


if __name__ == '__main__':
    main()
