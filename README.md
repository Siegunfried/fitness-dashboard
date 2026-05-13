# Fitness Dashboard

A desktop fitness tracking dashboard with real-time scoring, calendar view, and training todo list. Built as a **Lively Wallpaper** plugin + standalone **pywebview** desktop widget.

![License](https://img.shields.io/badge/license-MIT-green)
![Python](https://img.shields.io/badge/python-3.10%2B-blue)
![Platform](https://img.shields.io/badge/platform-Windows%2010%2F11-lightgrey)

## Features

- **Diet Calendar** — Monthly calendar with daily nutrition scores, macro breakdown, and weight tracking
- **Scoring Engine** — Sports-nutrition-based scoring (Bell Curve with tolerance bands, asymmetric penalties)
- **Training TodoList** — Weekly training plan synced from a Word document, parsed by indentation
- **Glass-morphism UI** — Modern frosted glass design with 5-level color coding
- **Two Modes** — Lively Wallpaper plugin **or** standalone desktop widget (pywebview)

## Architecture

```
You fill Excel/Word → Python servers read them → Wallpaper & Widget display
```

```
FitnessDiary.xlsx (your data)  ──→  diet_sync_server.py  :17532
ToDoList.docx    (your plan)   ──→  training_sync_server.py :17533
                                         │
                    ┌────────────────────┤
                    ▼                    ▼
           Lively Wallpaper       Desktop Widget
           (full music + viz)    (calendar + todo only)
```

## Quick Start

### Prerequisites
- Windows 10/11
- Python 3.10+
- [Lively Wallpaper](https://www.rocksdanister.com/lively/) (optional, for wallpaper mode)

### 1. Install dependencies
```bash
pip install openpyxl python-docx pywebview
```

### 2. Prepare your data files
Copy `example-data/FitnessDiary.xlsx` and `example-data/ToDoList.docx` to your desktop. Fill in your own data following the docs.

### 3. Start servers + widget
```bash
# Option A: Standalone widget (servers auto-start)
python widget/widget.py

# Option B: Wallpaper mode
python server/start_server.pyw          # start backend
# Then drag wallpaper/index.html into Lively Wallpaper
```

### 4. Build standalone exe (optional)
```bash
cd widget
build.bat
# Output: dist/CalendarWidget.exe (double-click to run, no Python needed)
```

## Project Structure

```
├── wallpaper/          # Lively Wallpaper plugin (HTML/CSS/JS)
│   ├── index.html      # Main entry
│   ├── js/             # Frontend modules (calendar, charts, music, todo)
│   └── data/           # Bundled fallback data
├── widget/             # Standalone desktop widget
│   ├── widget.py       # Launcher (pywebview + auto server start)
│   ├── servers.py      # Embedded server launcher
│   └── build.bat       # PyInstaller build script
├── server/             # Python backend servers
│   ├── diet_sync_server.py      # Excel → Diet API (:17532)
│   └── training_sync_server.py  # Word → Training API (:17533)
├── docs/               # Documentation (Chinese)
└── example-data/       # Example Excel + Word (fake data)
```

## Scoring System

Six achievement rates drive the scoring, each with scientifically-motivated directionality:

| Metric | Type | Tolerance | Rationale |
|--------|------|-----------|-----------|
| Calories | Bell Curve (symmetric) | ±10% | Under-eating = metabolic damage; over-eating = fat gain |
| Protein | Linear (one-way) | cap 150% | No upper harm at practical intake |
| Carbs | Bell Curve (mild) | ±20% | Performance fuel; overage caught by calorie total |
| Fat | Range-based | 70-130% | Hormone floor; excess = calorie density |
| Exercise | Linear (one-way) | cap 150% | More is better; overtraining caught by deficit |
| Deficit | Bell Curve | ±20% | Goldilocks zone; too much = muscle loss |

See `docs/` for full specification.

## Tech Stack

- **Frontend**: Vanilla JS, Canvas API, CSS backdrop-filter
- **Backend**: Python stdlib `http.server`, openpyxl, python-docx
- **Widget**: pywebview (Edge WebView2)
- **Wallpaper**: Lively Wallpaper (Chromium embed)
- **Packaging**: PyInstaller

## License

MIT — use it, fork it, learn from it. Built by a first-year CS student as a personal project.
