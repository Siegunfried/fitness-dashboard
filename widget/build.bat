@echo off
cd /d "%~dp0"
echo === Calendar Widget Build ===

REM Clean
rmdir /s /q dist build 2>nul

REM PyInstaller
python -m PyInstaller --noconsole --onefile ^
  --name "CalendarWidget" ^
  --add-data "app;app" ^
  --hidden-import webview ^
  --hidden-import clr ^
  --hidden-import pythonnet ^
  --hidden-import openpyxl ^
  --hidden-import docx ^
  --hidden-import lxml ^
  --hidden-import json ^
  --hidden-import servers ^
  widget.py

echo.
echo === Build Complete ===
echo Output: dist\CalendarWidget.exe
pause
