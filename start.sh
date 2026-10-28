#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo "========================================"
echo "    📦 Box Storage (macOS / Linux)     "
echo "========================================"

# Cek Python 3
if ! command -v python3 &>/dev/null; then
    echo "Error: Python 3 belum terinstal. Silakan instal Python 3 terlebih dahulu."
    exit 1
fi

# Setup Virtual Environment jika belum ada
if [ ! -d "venv" ]; then
    echo "Membuat virtual environment (venv)..."
    python3 -m venv venv
    ./venv/bin/pip install --upgrade pip
    ./venv/bin/pip install -r requirements.txt
fi

# Salin .env awal jika belum ada
if [ ! -f ".env" ]; then
    echo "Membuat file konfigurasi awal .env..."
    cp .env.example .env
fi

echo "Menjalankan Box Storage..."
./venv/bin/python3 app.py
