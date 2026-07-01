@echo off
chcp 65001 >nul
title نظام متابعة الاقتصاد الأخضر

:: الانتقال لمجلد الملف تلقائياً باستخدام المسار القصير لتفادي مشاكل اليونيكود
cd /d "%~dp0"
for %%I in ("%~dp0.") do set "PROJ_SHORT=%%~sI"
cd /d "%PROJ_SHORT%"

echo.
echo  ============================================================
echo    Green Economy Monitoring System
echo    نظام متابعة الاقتصاد الأخضر
echo  ============================================================
echo.

:: ── تحديد مسار Python ────────────────────────────────────────────────────
set PYTHON=
:: أولوية 1: Python المحمول داخل المشروع (portable)
if exist "%PROJ_SHORT%\python\python.exe" set "PYTHON=%PROJ_SHORT%\python\python.exe"
:: أولوية 2: venv الموجود في المشروع
if "%PYTHON%"=="" if exist "%PROJ_SHORT%\..\.venv\Scripts\python.exe" set "PYTHON=%PROJ_SHORT%\..\.venv\Scripts\python.exe"
if "%PYTHON%"=="" if exist "C:\Python313\python.exe"  set PYTHON=C:\Python313\python.exe
if "%PYTHON%"=="" if exist "C:\Python312\python.exe"  set PYTHON=C:\Python312\python.exe
if "%PYTHON%"=="" if exist "C:\Python311\python.exe"  set PYTHON=C:\Python311\python.exe
if "%PYTHON%"=="" if exist "C:\Python310\python.exe"  set PYTHON=C:\Python310\python.exe

if "%PYTHON%"=="" (
    python --version >nul 2>&1
    if not errorlevel 1 set PYTHON=python
)

if "%PYTHON%"=="" (
    echo [ERROR] لم يتم العثور على Python.
    echo         قم بتحميله من: https://www.python.org/downloads/
    echo         أو ضع نسخة Python المحمولة داخل مجلد python\
    pause
    exit /b 1
)

echo [+] Python: %PYTHON%
echo.

:: ── مسار site-packages ────────────────────────────────────────────────────
set "SITE_PKG=%PROJ_SHORT%\python\Lib\site-packages"

:: ── تثبيت المكتبات (أوفلاين من مجلد packages) ────────────────────────────
echo [1/3] فحص المكتبات ...

set "NEED_INSTALL=0"
if not exist "%SITE_PKG%\jinja2" set "NEED_INSTALL=1"
if not exist "%SITE_PKG%\click" set "NEED_INSTALL=1"
if not exist "%SITE_PKG%\markupsafe" set "NEED_INSTALL=1"
if not exist "%SITE_PKG%\itsdangerous" set "NEED_INSTALL=1"
if not exist "%SITE_PKG%\blinker" set "NEED_INSTALL=1"
if not exist "%SITE_PKG%\dotenv" set "NEED_INSTALL=1"
if not exist "%SITE_PKG%\reportlab" set "NEED_INSTALL=1"
if not exist "%SITE_PKG%\openpyxl" set "NEED_INSTALL=1"
if not exist "%SITE_PKG%\pymysql" set "NEED_INSTALL=1"
if not exist "%SITE_PKG%\psycopg2" set "NEED_INSTALL=1"

if "%NEED_INSTALL%"=="0" (
    echo       المكتبات مثبتة بالفعل.
) else (
    echo [2/3] تثبيت المكتبات ...
    if exist "%PROJ_SHORT%\packages" (
        "%PYTHON%" -m pip install --no-index --find-links="%PROJ_SHORT%\packages" --target="%SITE_PKG%" -r "%PROJ_SHORT%\requirements.txt" 2>nul
        if errorlevel 1 (
            echo       [!] التثبيت الأوفلاين لم يكتمل ^(قد يكون ملف wheel ناقص^).
            echo       [!] محاولة التثبيت أونلاين من PyPI ...
            "%PYTHON%" -m pip install --target="%SITE_PKG%" -r "%PROJ_SHORT%\requirements.txt" --upgrade --upgrade-strategy only-if-needed
            if errorlevel 1 (
                echo       [!] التثبيت الأونلاين فشل، جاري محاولة فك ملفات wheels المتاحة يدويا ...
                for %%W in ("%PROJ_SHORT%\packages\*.whl") do (
                    "%PYTHON%" -m pip install --no-index --no-deps --target="%SITE_PKG%" "%%W" 2>nul
                    if errorlevel 1 (
                        "%PYTHON%" -c "import zipfile,sys; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])" "%%W" "%SITE_PKG%" 2>nul
                    )
                )
            )
        )
    ) else (
        "%PYTHON%" -m pip install -r "%PROJ_SHORT%\requirements.txt" --quiet
    )
    echo       تم.
)
echo.

:: ── التحقق من المكتبات الأساسية ───────────────────────────────────────────
echo [3/3] التحقق ...
"%PYTHON%" -c "import flask; import jinja2; import dotenv; import pymysql; import openpyxl; print('       OK')" 2>nul
if errorlevel 1 (
    echo.
    echo  [ERROR] بعض المكتبات لم يتم تثبيتها بشكل صحيح.
    echo         جرب نسخ المشروع الي مسار بدون حروف عربية
    echo         مثال: D:\green-economy-system\
    echo.
    pause
    exit /b 1
)
echo.

:: ── تشغيل التطبيق ─────────────────────────────────────────────────────────
echo  تشغيل التطبيق ...
echo.
echo  ┌─────────────────────────────────────────────┐
echo  │  التطبيق يعمل على: http://localhost:5000    │
echo  │  اضغط Ctrl+C لإيقاف التشغيل                │
echo  └─────────────────────────────────────────────┘
echo.

:: ملاحظة: app.py يفتح المتصفح تلقائيا، لذلك لا نفتحه هنا لتجنب فتح صفحتين.

"%PYTHON%" "%PROJ_SHORT%\app.py"

echo.
echo  تم إيقاف التطبيق.
pause
