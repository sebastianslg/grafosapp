@echo off
rem Doble clic para abrir la aplicacion. No hace falta instalar nada: usa el Python incluido en python-embed\.
setlocal
cd /d "%~dp0"
if exist "python-embed\pythonw.exe" (
    start "" "python-embed\pythonw.exe" "ejecutar_app.py"
    exit /b 0
)
where pyw >nul 2>nul
if not errorlevel 1 (
    start "" pyw -3 "ejecutar_app.py"
    exit /b 0
)
where pythonw >nul 2>nul
if not errorlevel 1 (
    start "" pythonw "ejecutar_app.py"
    exit /b 0
)
powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show('No se encontro Python en este equipo y falta la carpeta python-embed.' + [Environment]::NewLine + 'Vuelva a descargar la aplicacion completa (App_Parcial_Grafos.zip).', 'Parcial de Grafos')" >nul 2>nul
exit /b 1
