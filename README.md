# 📦 Box Storage

> **Self-hosted Private Cloud Storage** dengan antarmuka Apple-grade Liquid Glass, pemutar media bawaan, brankas enkripsi Fernet at-rest, ZIP archive inspector, tautan bagikan cerdas, dan pencarian cepat.
>
> 🚀 **Mendukung Linux VPS, macOS, dan Windows.**

---

## ✨ Fitur Unggulan

- 💎 **Liquid Glass UI**: Tampilan dark mode modern ala macOS / iOS, responsif dan ringan diakses dari iPhone, Android, tablet, maupun desktop.
- 🗄️ **Pengelola Berkas Penuh**: Unggah (dukung berkas besar hingga 50GB), unduh, buat folder, ganti nama, pindahkan, dan hapus berkas.
- 🗑️ **Recycle Bin (Sampah)**: Berkas yang dihapus masuk ke tempat sampah dengan fitur pulihkan berkas atau kosongkan permanen (auto-purge 30 hari).
- ☑️ **Multi-Select Batch**: Pilih banyak berkas sekaligus untuk diunduh sebagai satu arsip ZIP, dipindahkan, atau dihapus massal.
- 👁️ **Pratinjau Langsung**: Lihat dokumen teks, PDF, kode sumber, markdown, gambar, dan streaming video/audio langsung di peramban tanpa perlu mengunduh.
- 📦 **ZIP Inspector**: Buka berkas `.zip` untuk melihat daftar isinya, mengunduh per-item, atau mempratinjau berkas di dalam ZIP tanpa mengekstrak seluruh arsip.
- 🔗 **Tautan Bagikan Cerdas**: Buat tautan berbagi dengan opsi kata sandi, batas kedaluwarsa waktu, batas unduhan, dan **custom link slug** (`/s/nama-pilihan-kamu`). Dilengkapi halaman perantara dengan hitung mundur 3 detik dan QR Code mandiri.
- 🔒 **Brankas Rahasia (Vault)**: Folder tersembunyi yang dilindungi PIN 6-digit dengan enkripsi Fernet 128-bit AES di sisi server (at-rest encryption).
- 🔍 **Pencarian Cepat**: Pencarian berkas realtime global di seluruh direktori dengan debounce.
- 🤖 **Bot Telegram Mandiri**: Generator skrip Python otomatis untuk mengunggah dan meminta berkas langsung melalui obrolan Telegram.

---

## 💻 Panduan Instalasi Cepat

### 1. 🐧 Linux VPS (Ubuntu / Debian / AlmaLinux / CentOS)

Untuk memasang di server VPS publik (otomatis memasang Python, Nginx, Systemd service):

```bash
# 1. Unduh repositori
git clone https://github.com/wagung05/box-storage.git /opt/box-storage
cd /opt/box-storage

# 2. Jalankan installer otomatis (wajib sebagai root/sudo)
sudo bash install.sh
```

Aplikasi akan langsung berjalan sebagai systemd service di `http://IP_SERVER:8080`.  
Password login default: `admin123` (bisa diubah di `/opt/box-storage/.env`).

---

### 2. 🍏 macOS

Jalankan di MacBook / iMac Anda:

```bash
# 1. Clone repositori
git clone https://github.com/wagung05/box-storage.git
cd box-storage

# 2. Jalankan start script
bash start.sh
```

Buka peramban di `http://localhost:8080`.

---

### 3. 🪟 Windows (10 / 11)

1. Pastikan **Python 3** sudah terinstal (unduh dari [python.org](https://www.python.org/downloads/)).  
   *⚠️ Pastikan centang opsi **"Add python.exe to PATH"** saat instalasi Python!*
2. Unduh atau clone repositori ini:
   ```cmd
   git clone https://github.com/wagung05/box-storage.git
   cd box-storage
   ```
3. Klik ganda berkas **`start.bat`** (atau jalankan `start.bat` di Command Prompt / PowerShell).
4. Buka peramban di `http://localhost:8080`.

---

## ⚙️ Konfigurasi (`.env`)

Salin berkas `.env.example` menjadi `.env` untuk menyesuaikan setelan:

```ini
# Password admin untuk login web
ADMIN_PASSWORD=admin123

# Secret key sesi (acak)
FLASK_SECRET=your_super_secret_hex_key

# PIN 6-digit untuk Brankas Rahasia (Vault)
VAULT_PIN=121967

# Folder penyimpanan berkas
# Linux: /opt/box-storage/data atau /mnt/storage
# macOS: /Users/username/BoxStorage
# Windows: C:\BoxStorage\data
STORAGE_DIR=data

# Port dan Host aplikasi
PORT=8080
HOST=0.0.0.0
```

---

## 🌐 Menghubungkan Domain & SSL (Nginx Reverse Proxy)

Jika menggunakan VPS dan memiliki nama domain sendiri:

1. Salin konfigurasi Nginx:
   ```bash
   sudo cp nginx/box-storage.conf /etc/nginx/conf.d/
   ```
2. Ganti `your-domain.com` di `/etc/nginx/conf.d/box-storage.conf` dengan nama domain Anda.
3. Pasang sertifikat SSL gratis via Certbot:
   ```bash
   sudo certbot --nginx -d your-domain.com
   ```

---

## 📁 Struktur Direktori

```text
box-storage/
├── app.py                      # Backend API Flask lengkap
├── requirements.txt            # Dependensi Python
├── install.sh                  # 1-Click installer untuk Linux VPS
├── start.sh                    # Skrip peluncur untuk macOS / Linux
├── start.bat                   # Skrip peluncur untuk Windows
├── .env.example                # Contoh berkas konfigurasi
├── systemd/
│   └── box-storage.service     # Template service systemd Linux
├── nginx/
│   └── box-storage.conf        # Konfigurasi reverse proxy Nginx
└── static/
    ├── shell.html              # Antarmuka SPA utama
    ├── app.css                 # Gaya Apple-grade Liquid Glass
    ├── app.js                  # Frontend logic & service worker
    ├── download.html           # Halaman unduh mandiri
    ├── telegram.html           # Generator skrip bot Telegram
    └── sw.js                   # Service worker cache
```

---

## 📜 Lisensi

Proyek ini dirilis di bawah lisensi terbuka [MIT](LICENSE). Bebas digunakan, dimodifikasi, dan disebarluaskan untuk kebutuhan pribadi maupun komersial.
