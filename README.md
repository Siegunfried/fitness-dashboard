# Fitness Dashboard

> Three-in-one desktop fitness companion: diet calendar, training todo list, and music wallpaper.
> **Primary: Lively Wallpaper plugin. Backup: standalone exe widget.**

![License](https://img.shields.io/badge/license-MIT-green)
![Python](https://img.shields.io/badge/python-3.10%2B-blue)
![Platform](https://img.shields.io/badge/platform-Windows%2010%2F11-lightgrey)

## Screenshots

| Desktop Overview | Daily Detail Card |
|:---:|:---:|
| ![Widget](screenshots/outlook.png) | ![Card](screenshots/dailycard.png) |

---

## Three Core Features

### 1. 减脂日历 — Diet Calendar & Scoring Engine

A monthly calendar that turns your Excel food diary into a real-time fitness dashboard.

**Calendar Heatmap**
- Each day shows a colored underline based on overall score (green → yellow → red)
- Click any date to open a full detail card with macro breakdown, progress bars, and 5-level color coding
- Hover for a compact tooltip showing calories, protein, carbs, fat, exercise, deficit, scores, and rates
- Month label click toggles a 5-chart panel: energy balance, macros, weight/BMI, compliance rates, composite scores

**Sports-Nutrition Scoring Engine**
- 6 achievement rates computed server-side in real-time: calories, protein, carbs, fat, exercise, deficit
- Each metric has scientifically-designed directionality (Bell Curve, one-way linear, range-based)
- Composite score (0-100) weighted by nutritional importance: calories 30%, protein 20%, carbs 10%, fat 10%, exercise 15%, deficit 15%
- S/A/B/C/D five-level grading based on composite rate
- Daily targets pulled from your Excel — training day, rest day, and game day all get different goals

**Data Flow**
```
FitnessDiary.xlsx (you fill 12 columns) → diet_sync_server.py → API → calendar renders
```
The server auto-detects Excel changes via mtime. Click "Sync" in the UI to force reload. Scores update instantly. Zero formulas in Excel — everything is computed server-side.

### 2. TodoList — Training Plan & Daily Checklist

A weekly training checklist synced live from a Word document.

**How It Works**
- Edit `ToDoList.docx` using Tab/Space indentation — weekdays as headers, tasks as sub-items
- The training server parses the Word doc's paragraph indentation to extract the weekly plan
- The widget displays **today's tasks** automatically based on the current day of the week
- Check off completed items — progress bar tracks completion rate in real-time
- Completion state persists locally (localStorage), auto-resets at midnight

**Word Document Format (Server Parsing Rules)**
```
周一 — Upper Body Push        ← indent 0, starts with weekday
    Warm-up 10min             ← indent 1, task for today
    Bench Press 4x8-10        ← indent 1, task for today
    Stretch 10min             ← indent 1, task for today
周二 — Upper Body Pull        ← indent 0, next day
    ...
```
Add a task: Enter at end of line → Tab → type. Add a day: Enter → Shift+Tab → type `周X — Label`. Click "Update" in the widget to refresh.

**Features**
- Auto-detects today's day-of-week, shows the right plan
- Progress bar + completion counter (N/M done)
- Add/delete custom tasks (persisted locally)
- Fallback to cached data when server is unavailable

### 3. MusicWallpaper — Now-Playing Display & Visualizer

A dynamic music wallpaper that shows what's playing on your desktop.

**Now-Playing Display**
- Album cover art with smooth crossfade transitions between tracks
- Track title + artist with animated text transitions
- Idle placeholder when no music is playing (frosted glass card with pulsing border)

**Audio Visualizer**
- Dynamic bar visualizer synced to music playback
- Bars animate in real-time based on frequency data
- Color theme matches the scoring engine's green accent (#1db954)
- Auto-fades when music pauses, brightens when playing

**Lively Wallpaper Integration**
- Bridges Lively's audio API via `window.livelyAudioListener` and `livelyCurrentTrack`
- Playback state detection (playing/paused/stopped) via `livelyWallpaperPlaybackChanged`
- Seamless integration with any media player that Lively supports

> **Note:** MusicWallpaper requires Lively Wallpaper. It is not available in the standalone widget mode.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Data Sources                       │
│  FitnessDiary.xlsx          ToDoList.docx            │
│  (12 columns, you fill)     (indented week plan)     │
└──────────┬──────────────────────┬───────────────────┘
           │                      │
           ▼                      ▼
    diet_sync_server.py    training_sync_server.py
        :17532                  :17533
           │                      │
           └──────────┬───────────┘
                      │
        ┌─────────────┴─────────────┐
        ▼                           ▼
  Lively Wallpaper            Desktop Widget
  ┌─────────────────┐        ┌──────────────┐
  │ • Diet Calendar  │        │ • Calendar   │
  │ • TodoList       │        │ • TodoList   │
  │ • 5 Charts       │        └──────────────┘
  │ • Music Player   │         (pywebview exe)
  │ • Visualizer     │
  └─────────────────┘
   ★ PRIMARY                  Backup
```

---

## Quick Start

### Prerequisites
- Windows 10/11
- Python 3.10+
- [Lively Wallpaper](https://www.rocksdanister.com/lively/) (free)

### Install
```bash
pip install openpyxl python-docx
```

### Wallpaper Mode (Recommended — All 3 Features)

1. Copy `example-data/FitnessDiary.xlsx` and `example-data/ToDoList.docx` to your desktop
2. Start backend servers:
   ```bash
   python server/start_server.pyw
   ```
3. Open Lively Wallpaper → drag `wallpaper/index.html` in → set as wallpaper

You now have calendar + todo + charts + music visualizer all on your desktop, with perfect transparency.

### Widget Mode (Backup — Calendar + Todo Only)

```bash
pip install pywebview
python widget/widget.py
```

Or build a standalone exe: `cd widget && build.bat` → `dist/CalendarWidget.exe`

First run auto-copies example data files if they don't exist on your desktop.

> The standalone widget may show thin white window borders on some Windows versions (platform limitation). Wallpaper mode has perfect transparency.

---

## Scoring System

| Metric | Type | Tolerance | Direction |
|--------|------|-----------|-----------|
| Calories | Bell Curve (symmetric) | ±10% | Penalized for both under and over |
| Protein | Linear (one-way) | cap 150% | More is fine, less is bad |
| Carbs | Bell Curve (mild) | ±20% | Over penalty ×50 (calorie total is primary guard) |
| Fat | Range-based | 70-130% | Below 70% triggers hormone concern; over 130% mild penalty |
| Exercise | Linear (one-way) | cap 150% | More is better; overtraining caught by deficit metric |
| Deficit | Bell Curve | ±20% | Too little = no progress; too much = muscle loss risk |

**Composite Score**: 30% cal + 20% pro + 10% carb + 10% fat + 15% exercise + 15% deficit
**Grade**: ≥90 S · ≥80 A · ≥70 B · ≥60 C · <60 D

Full specification in `docs/` — Excel layout, AI fill-in guide, exercise science methodology.

---

## Project Structure

```
├── wallpaper/          # ★ PRIMARY — Lively Wallpaper plugin (all 3 features)
│   ├── index.html      # Main entry
│   ├── js/             # Calendar, charts, music, todo, core (EventBus, ModuleRegistry)
│   └── data/           # Fallback data
├── server/             # Python backends (shared)
│   ├── diet_sync_server.py         # Excel → Diet API (:17532)
│   ├── training_sync_server.py     # Word → Training API (:17533)
│   └── start_server.pyw            # Silent launcher (starts both)
├── widget/             # Backup — standalone exe (calendar + todo only)
├── docs/               # Full documentation (Chinese)
│   ├── 减脂填表规范.md              # AI-oriented Excel fill-in guide
│   └── 运动计划规范.md              # Exercise science + training spec
└── example-data/       # Example files (fake data, for first-run setup)
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Wallpaper Engine | Lively Wallpaper (Chromium embed) |
| Frontend | Vanilla JS, Canvas API, CSS backdrop-filter |
| Backend | Python stdlib `http.server`, openpyxl, python-docx |
| Widget | pywebview (Edge WebView2) — backup only |
| Packaging | PyInstaller (single exe, 36MB) |

## License

MIT — use it, fork it, learn from it. Built by a first-year CS student.
