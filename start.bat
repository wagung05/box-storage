@echo off
setlocal enabledelayedexpansion

echo ========================================
echo     Box Storage for Windows
echo ========================================
echo.

:: Cek Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Error: Python 3 belum terinstal atau belum masuk PATH!
    echo Silakan unduh Python di: https://www.python.org/downloads/
    echo Pastikan centang "Add Python to PATH" saat instalasi.
    pause
    exit /b 1
)

:: Buat virtual environment jika belum ada
if not exist "venv" (
    echo [1/3] Membuat virtual environment venv...
    python -m venv venv
    call venv\Scripts\activate.bat
    echo [2/3] Menginstal dependensi...
    pip install -r requirements.txt
) else (
    call venv\Scripts\activate.bat
)

:: Siapkan file .env jika belum ada
if not exist ".env" (
    echo [3/3] Menyiapkan .env awal...
    copy .env.example .env >nul
)

echo.
echo Menjalankan Box Storage...
echo Buka browser dan akses: http://localhost:8080
echo.
python app.py

pause
