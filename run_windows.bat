@echo off
setlocal
cd /d "%~dp0"
where ffmpeg >nul 2>&1
if errorlevel 1 (
  echo FFmpeg is required on PATH. Install FFmpeg first.
  pause
  exit /b 1
)
where py >nul 2>&1
if not errorlevel 1 (
  set "PY=py -3"
) else (
  set "PY=python"
)
if not exist .venv ( %PY% -m venv .venv )
call .venv\Scripts\activate.bat
python -m pip install -r requirements.txt
if errorlevel 1 goto :failed
python -m playwright install chromium
if errorlevel 1 goto :failed
python fetch_osmd.py
if errorlevel 1 goto :failed
start "" http://127.0.0.1:8765
python -m uvicorn app:app --host 127.0.0.1 --port 8765
exit /b %ERRORLEVEL%
:failed
echo Setup failed. Check the terminal errors.
pause
exit /b 1
