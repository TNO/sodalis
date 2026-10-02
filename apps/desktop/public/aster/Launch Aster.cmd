@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel% equ 0 (
  py -3 "%~dp0start.py" %*
) else (
  where python >nul 2>nul
  if errorlevel 1 (
    echo Python 3 was not found. Open Aster.html directly, or install Python 3 to use the localhost launcher.
  ) else (
    python "%~dp0start.py" %*
  )
)
pause
