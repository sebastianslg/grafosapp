@echo off
cd /d "%~dp0"
where python >nul 2>nul && (python ejecutar_app.py) || (py ejecutar_app.py)
pause
