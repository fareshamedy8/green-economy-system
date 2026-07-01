@echo off
setlocal enableextensions
cd /d "%~dp0"

echo ============================================
echo  Green Economy - Auto Setup
echo ============================================
echo.

if not exist requirements.txt (
    echo [ERROR] requirements.txt was not found in this folder.
    exit /b 1
)

set "PY_CMD="
set "PY_HOME="
where python >nul 2>nul
if %errorlevel%==0 set "PY_CMD=python"

if not defined PY_CMD (
    where py >nul 2>nul
    if %errorlevel%==0 set "PY_CMD=py -3"
)

if not defined PY_CMD (
    echo [WARN] Python is not installed or not in PATH.
    where winget >nul 2>nul
    if %errorlevel%==0 (
        echo [INFO] Trying to install Python 3 with winget...
        winget install -e --id Python.Python.3.13 --accept-package-agreements --accept-source-agreements
        if errorlevel 1 (
            echo [ERROR] Automatic Python installation failed.
            exit /b 1
        )
    ) else (
        echo [ERROR] Python is not installed and winget is not available.
        echo Install Python 3.10+ manually, then run this file again.
        exit /b 1
    )

    set "PY_CMD="
    where python >nul 2>nul
    if %errorlevel%==0 set "PY_CMD=python"
    if not defined PY_CMD (
        where py >nul 2>nul
        if %errorlevel%==0 set "PY_CMD=py -3"
    )

    if not defined PY_CMD (
        echo [ERROR] Python installation finished but the command is still not available in this terminal.
        echo Close this window, open a new terminal, and run the setup again.
        exit /b 1
    )
)

if not exist .venv (
    echo [INFO] Creating virtual environment...
    %PY_CMD% -m venv .venv
    if errorlevel 1 (
        echo [ERROR] Failed to create virtual environment.
        exit /b 1
    )
) else (
    echo [INFO] Virtual environment already exists.
)

set "VENV_PY=.venv\Scripts\python.exe"
if not exist "%VENV_PY%" (
    echo [ERROR] Virtual environment Python was not created correctly.
    exit /b 1
)

echo [INFO] Activating virtual environment...
call .venv\Scripts\activate.bat
if errorlevel 1 (
    echo [ERROR] Failed to activate virtual environment.
    exit /b 1
)

echo [INFO] Upgrading pip...
"%VENV_PY%" -m pip install --upgrade pip

echo [INFO] Installing dependencies from requirements.txt...
"%VENV_PY%" -m pip install -r requirements.txt
if errorlevel 1 (
    if exist packages (
        echo [WARN] Online install failed. Trying offline install from packages folder...
        "%VENV_PY%" -m pip install --no-index --find-links=packages -r requirements.txt
    )
)

if errorlevel 1 (
    echo [ERROR] Dependency installation failed.
    exit /b 1
)

echo.
echo [SUCCESS] Setup completed successfully.
echo You can now run the app using run.bat
echo.
pause
