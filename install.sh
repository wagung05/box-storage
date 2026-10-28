#!/usr/bin/env bash
set -euo pipefail

echo "=================================================="
echo "      BOX STORAGE — LINUX VPS AUTO INSTALLER      "
echo "=================================================="

if [[ $EUID -ne 0 ]]; then
   echo "Error: Skrip ini harus dijalankan sebagai root (gunakan: sudo bash install.sh)"
   exit 1
fi

APP_DIR="/opt/box-storage"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "[1/5] Memperbarui paket sistem & dependensi..."
if command -v apt-get &>/dev/null; then
    apt-get update -y
    apt-get install -y python3 python3-pip python3-venv nginx certbot python3-certbot-nginx curl git
elif command -v dnf &>/dev/null; then
    dnf install -y python3 python3-pip nginx git curl
elif command -v yum &>/dev/null; then
    yum install -y python3 python3-pip nginx git curl
fi

echo "[2/5] Menyiapkan direktori $APP_DIR..."
mkdir -p "$APP_DIR"
cp -rf "$SCRIPT_DIR/app.py" "$APP_DIR/"
cp -rf "$SCRIPT_DIR/static" "$APP_DIR/"
cp -rf "$SCRIPT_DIR/requirements.txt" "$APP_DIR/"

# Salin konfigurasi .env
if [[ ! -f "$APP_DIR/.env" ]]; then
    if [[ -f "$SCRIPT_DIR/.env" ]]; then
        cp "$SCRIPT_DIR/.env" "$APP_DIR/.env"
    else
        echo "Menyiapkan file .env default..."
        SECRET_KEY=$(python3 -c "import secrets; print(secrets.token_hex(24))")
        cat <<EOF > "$APP_DIR/.env"
ADMIN_PASSWORD=admin123
FLASK_SECRET=$SECRET_KEY
VAULT_PIN=121967
STORAGE_DIR=$APP_DIR/data
PORT=8080
HOST=0.0.0.0
EOF
        echo "Default admin password: admin123"
    fi
fi
chmod 600 "$APP_DIR/.env"

echo "[3/5] Menginstal dependensi Python..."
python3 -m pip install --break-system-packages -r "$APP_DIR/requirements.txt" || python3 -m pip install -r "$APP_DIR/requirements.txt"

echo "[4/5] Memasang systemd service (box-storage)..."
if [[ -f "$SCRIPT_DIR/systemd/box-storage.service" ]]; then
    cp "$SCRIPT_DIR/systemd/box-storage.service" /etc/systemd/system/
    systemctl daemon-reload
    systemctl enable box-storage
    systemctl restart box-storage
fi

echo "[5/5] Memasang Nginx reverse proxy (opsional)..."
if [[ -d "/etc/nginx/conf.d" && -f "$SCRIPT_DIR/nginx/box-storage.conf" ]]; then
    cp "$SCRIPT_DIR/nginx/box-storage.conf" /etc/nginx/conf.d/
    nginx -t && systemctl reload nginx || echo "Catatan: Nginx perlu disesuaikan dengan nama domain Anda."
fi

echo ""
echo "=================================================="
echo "    INSTALASI SELESAI! STATUS:                    "
echo "=================================================="
systemctl is-active box-storage && echo "  Box Storage: RUNNING (PORT 8080)" || echo "  Periksa: journalctl -u box-storage -e"
echo "  Buka browser: http://IP_SERVER_ANDA:8080"
echo "  Login default: admin123 (ubah di /opt/box-storage/.env)"
echo "=================================================="
