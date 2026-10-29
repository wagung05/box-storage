#!/usr/bin/env python3
import os, sys, json, time, hmac, hashlib, secrets, io, re, shutil, mimetypes, zipfile
from urllib.parse import quote
from cryptography.fernet import Fernet, InvalidToken
mimetypes.add_type("application/manifest+json", ".webmanifest")
from pathlib import Path
from datetime import datetime
from flask import Flask, request, jsonify, Response, send_file, abort, make_response, g

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 50 * 1024 * 1024 * 1024

STORAGE_DIR = Path("/mnt/storage")
SYS_DIR = STORAGE_DIR / ".sys"
SYS_DIR.mkdir(parents=True, exist_ok=True)
FEATURES_FILE = SYS_DIR / "features.json"
AUDIT_FILE = SYS_DIR / "audit.log"
VAULT_FILE = SYS_DIR / "vault.json"
ENC_KEY_FILE = SYS_DIR / "enc.key"
VAULT_DIR = STORAGE_DIR / ".vault"
VAULT_INDEX_FILE = VAULT_DIR / ".index"
VAULT_PIN = os.environ.get("VAULT_PIN", "121967")
VAULT_SESSION_TTL = 7200
vault_sessions = {}
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "harnas05")
SECRET = os.environ.get("FLASK_SECRET", secrets.token_hex(32))
app.secret_key = SECRET
TRASH_DIR = STORAGE_DIR / ".trash"
TRASH_IDX = SYS_DIR / "trash.json"
TRASH_RETENTION = 30 * 86400

_features = {"2fa": False, "ocr": True, "backup": True}
if FEATURES_FILE.exists():
    try:
        _features.update(json.loads(FEATURES_FILE.read_text()))
    except Exception:
        pass

def audit(action, detail):
    try:
        with AUDIT_FILE.open("a") as f:
            f.write(json.dumps({"ts": time.time(), "action": action, "detail": detail}) + "\n")
    except Exception:
        pass

def walk_files(base):
    for root, dirs, files in os.walk(base):
        dirs[:] = [d for d in dirs if not d.startswith(".")]
        for f in files:
            if f.startswith("."):
                continue
            yield Path(root) / f

def file_info(p):
    rel = str(p.relative_to(STORAGE_DIR))
    stat = p.stat()
    ext = p.suffix.lower()
    is_vid = ext in (".mp4", ".mkv", ".avi", ".mov", ".webm")
    is_aud = ext in (".mp3", ".wav", ".flac", ".aac", ".ogg", ".m4a")
    is_img = ext in (".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".bmp")
    is_doc = ext in (".pdf", ".doc", ".docx", ".txt", ".md", ".xls", ".xlsx", ".ppt", ".pptx", ".csv")
    is_arch = ext in (".zip", ".rar", ".7z", ".tar", ".gz", ".bz2")
    is_apk = ext in (".apk", ".xapk")
    if p.name.startswith("."):
        cat = "other"
    elif is_vid:
        cat = "video"
    elif is_aud:
        cat = "audio"
    elif is_img:
        cat = "image"
    elif is_doc:
        cat = "document"
    elif is_arch:
        cat = "archive"
    elif is_apk:
        cat = "apk"
    else:
        cat = "other"
    return {
        "name": p.name,
        "path": "/" + rel,
        "size": stat.st_size,
        "mtime": stat.st_mtime,
        "ext": ext,
        "category": cat,
        "is_dir": False,
        "is_video": is_vid,
    }

def walk_dirs(base):
    for root, dirs, files in os.walk(base):
        dirs[:] = [d for d in dirs if not d.startswith(".")]
        for d in dirs:
            dp = Path(root) / d
            rel = str(dp.relative_to(STORAGE_DIR))
            yield {
                "name": dp.name,
                "path": "/" + rel,
                "size": 0,
                "mtime": dp.stat().st_mtime,
                "ext": "",
                "category": "folder",
                "is_dir": True,
                "is_video": False,
            }

def admin_required(f):
    from functools import wraps
    @wraps(f)
    def wrapper(*args, **kwargs):
        if not request.cookies.get("session"):
            return jsonify({"error": "unauthorized"}), 401
        return f(*args, **kwargs)
    wrapper.__name__ = f.__name__
    return wrapper

@app.route("/")
def index():
    return send_file("/opt/storage/static/shell.html")

@app.route("/d")
def download_page():
    return send_file("/opt/storage/static/download.html")

@app.route("/api/login", methods=["POST"])
def login():
    data = request.get_json(force=True)
    pw = data.get("password", "")
    if hmac.compare_digest(pw, ADMIN_PASSWORD):
        token = secrets.token_hex(32)
        resp = jsonify({"ok": True})
        resp.set_cookie("session", token, httponly=True, secure=True, samesite="strict", max_age=86400*7)
        audit("login", "success")
        return resp
    audit("login", "failed")
    return jsonify({"ok": False, "error": "invalid"}), 401

@app.route("/api/logout", methods=["POST"])
def logout():
    resp = jsonify({"ok": True})
    resp.set_cookie("session", "", expires=0)
    return resp

@app.route("/api/session")
def session_status():
    return jsonify({"is_admin": bool(request.cookies.get("session"))})

@app.route("/api/folder-thumb")
def folder_thumb():
    path = request.args.get("path", "/")
    target = (STORAGE_DIR / path.lstrip("/")).resolve()
    if not target.exists() or not target.is_dir():
        abort(404)
    try:
        from PIL import Image
        IMG = (".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp")
        def hidden(p):
            return any(part.startswith(".") for part in p.relative_to(target).parts)
        for img in sorted([p for p in target.rglob("*")
                           if p.is_file() and p.suffix.lower() in IMG and not hidden(p)],
                          key=lambda p: str(p)):
            try:
                im = Image.open(str(img))
                im.thumbnail((440, 440))
                buf = io.BytesIO()
                im.convert("RGB").save(buf, "JPEG", quality=82)
                buf.seek(0)
                return send_file(buf, mimetype="image/jpeg")
            except Exception:
                continue
    except Exception:
        pass
    abort(404)

@app.route("/api/list")
def list_dir():
    path = request.args.get("path", "/")
    rel = path.lstrip("/")
    if rel == "__vault__":
        if not _vault_auth():
            return jsonify({"error": "unauthorized"}), 401
        idx = _vault_index()
        items = [{
            "name": n, "path": "__vault__/" + n, "is_dir": False,
            "size": e.get("size", 0), "mtime": e.get("mtime", 0), "vault": True,
        } for n, e in idx.items()]
        items.sort(key=lambda x: x["name"].lower())
        return jsonify(items)
    target = (STORAGE_DIR / rel).resolve()
    if not str(target).startswith(str(STORAGE_DIR.resolve())):
        return jsonify({"error": "invalid path"}), 400
    if not target.exists() or not target.is_dir():
        return jsonify({"error": "not found"}), 404
    items = []
    for d in walk_dirs(target):
        items.append(d)
    for f in walk_files(target):
        if f.is_file():
            items.append(file_info(f))
    if _vault_auth():
        items.append({"name": "Vault", "path": "__vault__", "is_dir": True, "category": "vault", "vault": True})
    items.sort(key=lambda x: (not x.get("is_dir", False), x["name"].lower()))
    return jsonify(items)

@app.route("/api/mkdir", methods=["POST"])
@admin_required
def make_dir():
    data = request.get_json(force=True)
    path = data.get("path", "/")
    name = data.get("name", "").strip()
    if not name or "/" in name or name == "." or name == "..":
        return jsonify({"error": "invalid name"}), 400
    target = (STORAGE_DIR / path.lstrip("/") / name).resolve()
    if not str(target).startswith(str(STORAGE_DIR.resolve())):
        return jsonify({"error": "invalid path"}), 400
    target.mkdir(parents=True, exist_ok=True)
    audit("mkdir", str(target.relative_to(STORAGE_DIR)))
    return jsonify({"ok": True, "path": "/" + str(target.relative_to(STORAGE_DIR))})

@app.route("/api/rename", methods=["POST"])
@admin_required
def rename():
    data = request.get_json(force=True)
    src = (STORAGE_DIR / data.get("path", "").lstrip("/")).resolve()
    dst_name = data.get("name", "").strip()
    if not src.exists() or not dst_name:
        return jsonify({"error": "invalid"}), 400
    dst = src.parent / dst_name
    if not str(dst).startswith(str(STORAGE_DIR.resolve())):
        return jsonify({"error": "invalid"}), 400
    src.rename(dst)
    audit("rename", f"{src} -> {dst}")
    return jsonify({"ok": True})

@app.route("/api/move", methods=["POST"])
@admin_required
def move():
    data = request.get_json(force=True)
    src = (STORAGE_DIR / data.get("path", "").lstrip("/")).resolve()
    dst_dir = (STORAGE_DIR / data.get("to", "/").lstrip("/")).resolve()
    if not src.exists() or not dst_dir.exists():
        return jsonify({"error": "not found"}), 404
    dst = dst_dir / src.name
    if not str(dst).startswith(str(STORAGE_DIR.resolve())):
        return jsonify({"error": "invalid"}), 400
    shutil.move(str(src), str(dst))
    audit("move", f"{src} -> {dst}")
    return jsonify({"ok": True})

def _trash_load():
    if not TRASH_IDX.exists():
        return {}
    try:
        return json.loads(TRASH_IDX.read_text())
    except Exception:
        return {}

def _trash_save(idx):
    TRASH_DIR.mkdir(parents=True, exist_ok=True)
    TRASH_IDX.write_text(json.dumps(idx))

def _trash_purge(idx):
    cutoff = time.time() - TRASH_RETENTION
    for i in [i for i, e in idx.items() if e.get("deleted", 0) < cutoff]:
        shutil.rmtree(str(TRASH_DIR / i), ignore_errors=True)
        idx.pop(i, None)
    return idx

def _trash_size(idx):
    return sum(e.get("size", 0) for e in idx.values())

def _unique_path(dst):
    if not dst.exists():
        return dst
    base, ext = os.path.splitext(dst.name)
    i = 1
    while (dst.parent / f"{base} ({i}){ext}").exists():
        i += 1
    return dst.parent / f"{base} ({i}){ext}"

@app.route("/api/delete", methods=["POST"])
@admin_required
def delete():
    data = request.get_json(force=True)
    path = data.get("path", "")
    permanent = data.get("permanent") is True or data.get("permanent") == 1
    target = (STORAGE_DIR / path.lstrip("/")).resolve()
    if not str(target).startswith(str(STORAGE_DIR.resolve())):
        return jsonify({"error": "invalid"}), 400
    if not target.exists():
        return jsonify({"error": "not found"}), 404
    is_dir = target.is_dir()
    if permanent:
        if is_dir:
            shutil.rmtree(str(target))
        else:
            target.unlink()
        audit("permanent_delete", path)
        return jsonify({"ok": True})
    tid = secrets.token_hex(8)
    dest = TRASH_DIR / tid
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(target), str(dest))
    size = sum(f.stat().st_size for f in dest.rglob("*") if f.is_file()) if is_dir else dest.stat().st_size
    idx = _trash_load()
    idx[tid] = {"name": target.name, "orig": "/" + path.lstrip("/"), "size": size,
                "deleted": time.time(), "isdir": is_dir}
    _trash_save(_trash_purge(idx))
    audit("trash", path)
    return jsonify({"ok": True, "trashed": True})

@app.route("/api/trash", methods=["GET"])
@admin_required
def trash_list():
    idx = _trash_load()
    idx = _trash_purge(idx)
    _trash_save(idx)
    items = [{"id": i, "name": e["name"], "orig": e["orig"], "size": e.get("size", 0),
              "deleted": e.get("deleted", 0), "is_dir": e.get("isdir", False)} for i, e in idx.items()]
    items.sort(key=lambda x: x["deleted"], reverse=True)
    return jsonify(items)

@app.route("/api/trash/restore", methods=["POST"])
@admin_required
def trash_restore():
    data = request.get_json(force=True)
    idx = _trash_load()
    e = idx.get(data.get("id", ""))
    if not e:
        return jsonify({"error": "not found"}), 404
    src = TRASH_DIR / data["id"]
    if not src.exists():
        idx.pop(data["id"], None); _trash_save(idx)
        return jsonify({"error": "not found"}), 404
    dst_dir = STORAGE_DIR / e["orig"].lstrip("/")
    dst_dir.parent.mkdir(parents=True, exist_ok=True)
    dst = _unique_path(dst_dir)
    shutil.move(str(src), str(dst))
    idx.pop(data["id"], None)
    _trash_save(idx)
    audit("trash_restore", e["orig"])
    return jsonify({"ok": True, "path": "/" + str(dst.relative_to(STORAGE_DIR))})

@app.route("/api/trash/delete", methods=["POST"])
@admin_required
def trash_delete():
    data = request.get_json(force=True)
    idx = _trash_load()
    if data.get("id") not in idx:
        return jsonify({"error": "not found"}), 404
    shutil.rmtree(str(TRASH_DIR / data["id"]), ignore_errors=True)
    e = idx.pop(data["id"], None)
    _trash_save(idx)
    audit("trash_permanent", e["name"] if e else "")
    return jsonify({"ok": True})

@app.route("/api/trash/empty", methods=["POST"])
@admin_required
def trash_empty():
    idx = _trash_load()
    for i in list(idx.keys()):
        shutil.rmtree(str(TRASH_DIR / i), ignore_errors=True)
    _trash_save({})
    audit("trash_empty", "")
    return jsonify({"ok": True})

@app.route("/api/upload", methods=["POST"])
@admin_required
def upload():
    path = request.form.get("path", "/")
    target_dir = (STORAGE_DIR / path.lstrip("/")).resolve()
    if not str(target_dir).startswith(str(STORAGE_DIR.resolve())):
        return jsonify({"error": "invalid"}), 400
    target_dir.mkdir(parents=True, exist_ok=True)
    f = request.files.get("file")
    if not f:
        return jsonify({"error": "no file"}), 400
    safe = os.path.basename(f.filename)
    conflict_action = request.form.get("conflict", "").strip().lower()
    # conflict: 'check' | 'replace' | 'keep_both' | 'skip'
    dst = target_dir / safe
    if dst.exists():
        if conflict_action == "check":
            stat = dst.stat()
            return jsonify({
                "conflict": True,
                "name": safe,
                "existing_size": stat.st_size,
                "existing_mtime": stat.st_mtime
            })
        elif conflict_action == "skip":
            return jsonify({"ok": True, "skipped": True, "path": "/" + str(dst.relative_to(STORAGE_DIR))})
        elif conflict_action == "keep_both":
            base, ext = os.path.splitext(safe)
            c = 1
            while True:
                candidate = f"{base} ({c}){ext}"
                dst = target_dir / candidate
                if not dst.exists():
                    safe = candidate
                    break
                c += 1
        # if 'replace' or default: overwrite dst
    f.save(str(dst))
    audit("upload", f"{path}/{safe}")
    return jsonify({"ok": True, "path": "/" + str(dst.relative_to(STORAGE_DIR)), "name": safe})

def _safe(rel):
    target = (STORAGE_DIR / rel.lstrip("/")).resolve()
    if not target.is_relative_to(STORAGE_DIR) or not target.is_file():
        abort(404)
    return target

def _serve(target, inline):
    range_header = request.headers.get("Range")
    file_size = target.stat().st_size
    mime = mimetypes.guess_type(str(target))[0] or "application/octet-stream"
    if range_header:
        m = re.match(r"bytes=(\d+)-(\d*)", range_header)
        if m:
            start = int(m.group(1))
            end = int(m.group(2)) if m.group(2) else file_size - 1
            length = end - start + 1
            with target.open("rb") as f:
                f.seek(start)
                data = f.read(length)
            resp = Response(data, 206, mimetype=mime)
            resp.headers["Content-Range"] = f"bytes {start}-{end}/{file_size}"
            resp.headers["Accept-Ranges"] = "bytes"
            resp.headers["Content-Length"] = str(length)
            return resp
    return send_file(str(target), as_attachment=(not inline), mimetype=mime)

@app.route("/api/file")
def file_meta():
    target = _safe(request.args.get("path", ""))
    info = file_info(target)
    info["url"] = "/api/stream?path=" + info["path"]
    info["download"] = "/api/download?path=" + info["path"]
    return jsonify(info)

@app.route("/api/stream")
def stream():
    return _serve(_safe(request.args.get("path", "")), inline=True)

@app.route("/api/download")
def download():
    return _serve(_safe(request.args.get("path", "")), inline=False)

_TEXT_EXTS = {".txt", ".md", ".markdown", ".log", ".json", ".csv", ".xml", ".yml", ".yaml",
                ".py", ".js", ".ts", ".html", ".htm", ".css", ".sh", ".bat", ".ini", ".cfg", ".conf",
                ".sql", ".c", ".cpp", ".h", ".java", ".go", ".rs", ".rb", ".php", ".kts", ".tsv"}

def _read_text(p):
    raw = p.read_bytes()
    for enc in ("utf-8", "utf-16", "cp1252", "latin-1"):
        try:
            return raw.decode(enc)
        except Exception:
            continue
    return raw.decode("utf-8", errors="replace")

def _docx_text(p):
    import html as _h
    try:
        with zipfile.ZipFile(str(p)) as z:
            xml = z.read("word/document.xml").decode("utf-8", errors="ignore")
    except Exception:
        return ""
    return _h.unescape("".join(re.findall(r"<w:t[^>]*>(.*?)</w:t>", xml, re.S)))

def _xlsx_text(p):
    try:
        import html as _h
        with zipfile.ZipFile(str(p)) as z:
            shared = z.read("xl/sharedStrings.xml").decode("utf-8", errors="ignore")
            return _h.unescape("\n".join(re.findall(r"<t[^>]*>(.*?)</t>", shared, re.S)))
    except Exception:
        return ""

@app.route("/api/preview")
@admin_required
def preview():
    target = _safe(request.args.get("path", ""))
    ext = target.suffix.lower()
    if ext == ".pdf":
        return send_file(str(target), mimetype="application/pdf")
    if ext in _TEXT_EXTS:
        return Response(_read_text(target), mimetype="text/plain; charset=utf-8")
    if ext == ".docx":
        t = _docx_text(target) or "(Tidak bisa membaca isi dokumen)"
        return Response(t, mimetype="text/plain; charset=utf-8")
    if ext in (".xlsx", ".xlsm", ".xlsb"):
        t = _xlsx_text(target) or "(Tidak bisa membaca isi spreadsheet)"
        return Response(t, mimetype="text/plain; charset=utf-8")
    return jsonify({"error": "no preview for " + ext}), 415

@app.route("/api/zip-multi", methods=["POST"])
@admin_required
def zip_multi():
    data = request.get_json(force=True)
    paths = data.get("paths", [])
    if not paths:
        return jsonify({"error": "no paths"}), 400
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_STORED) as zf:
        for rel in paths:
            t = (STORAGE_DIR / rel.lstrip("/")).resolve()
            if not str(t).startswith(str(STORAGE_DIR.resolve())) or not t.exists():
                continue
            if t.is_dir():
                _zip_add_dir(zf, t)
            else:
                zf.write(str(t), t.name)
    buf.seek(0)
    return send_file(buf, mimetype="application/zip", as_attachment=True, download_name="selection.zip")

def _zip_add_dir(zf, base):
    zf.writestr(base.name + "/", "")
    for p in sorted(base.rglob("*")):
        if any(part.startswith(".") for part in p.relative_to(base).parts):
            continue
        arc = os.path.join(base.name, p.relative_to(base))
        if p.is_dir():
            zf.writestr(arc + "/", "")
        else:
            zf.write(str(p), arc)

@app.route("/api/analytics")
def analytics():
    cat_bytes = {}
    cat_count = {}
    total_bytes = 0
    for p in walk_files(STORAGE_DIR):
        try:
            info = file_info(p)
        except Exception:
            continue
        total_bytes += info["size"]
        cat = info["category"]
        cat_bytes[cat] = cat_bytes.get(cat, 0) + info["size"]
        cat_count[cat] = cat_count.get(cat, 0) + 1
    top = []
    for d in sorted([x for x in STORAGE_DIR.iterdir() if x.is_dir() and not x.name.startswith(".")]):
        try:
            sz = sum(f.stat().st_size for f in d.rglob("*") if f.is_file())
        except Exception:
            sz = 0
        top.append({"name": d.name, "size": sz})
    top.sort(key=lambda x: x["size"], reverse=True)
    try:
        du = shutil.disk_usage(STORAGE_DIR)
    except Exception:
        du = None
    return jsonify({
        "categories": [{"key": k, "bytes": v, "count": cat_count.get(k, 0)} for k, v in sorted(cat_bytes.items(), key=lambda x: x[1], reverse=True)],
        "top_folders": top[:8],
        "total_bytes": total_bytes,
        "storage": {"total": du.total, "used": du.used, "free": du.free} if du else None,
        "trash_bytes": _trash_size(_trash_load()),
        "trash_count": len(_trash_load()),
    })

@app.route("/t")
def telegram_page():
    return send_file("/opt/storage/static/telegram.html")

@app.route("/api/zip", methods=["POST"])
def zip_folder():
    data = request.get_json(force=True)
    target = (STORAGE_DIR / data.get("path", "").lstrip("/")).resolve()
    if not target.is_relative_to(STORAGE_DIR) or not target.is_dir():
        abort(404)
    buf = io.BytesIO()
    base = target.name
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_STORED) as zf:
        for p in sorted(target.rglob("*")):
            if any(part.startswith(".") for part in p.relative_to(target).parts):
                continue
            arc = os.path.join(base, p.relative_to(target))
            if p.is_dir():
                zf.writestr(arc + "/", "")
            else:
                zf.write(p, arc)
    buf.seek(0)
    return send_file(buf, mimetype="application/zip", as_attachment=True, download_name=base + ".zip")

def _load_shares():
    shares_file = SYS_DIR / "shares.json"
    if not shares_file.exists():
        return {}
    try:
        return json.loads(shares_file.read_text())
    except Exception:
        return {}

def _save_shares(shares):
    (SYS_DIR / "shares.json").write_text(json.dumps(shares))

@app.route("/api/share", methods=["POST"])
def share():
    data = request.get_json(force=True)
    path = data.get("path", "")
    token = secrets.token_urlsafe(16)
    slug = str(data.get("slug") or "").strip().lower()
    shares = _load_shares()
    if slug:
        slug = re.sub(r"[^a-z0-9-]", "", slug)
        if len(slug) < 3:
            return jsonify({"ok": False, "error": "Custom slug minimal 3 karakter (huruf, angka, strip)"}), 400
        existing = shares.get(slug)
        if existing and existing.get("path") != path:
            return jsonify({"ok": False, "error": f"Custom slug '{slug}' sudah digunakan file lain. Silakan pilih nama slug lain!"}), 409
        token = slug
    entry = {"path": path, "created": time.time(), "uses": 0}
    pw = str(data.get("password") or "").strip()
    if pw:
        entry["password"] = pw
    exp = data.get("expires")
    if exp:
        try:
            hours = float(exp)
            if hours > 0:
                entry["expires_at"] = time.time() + hours * 3600
        except Exception:
            pass
    lim = data.get("limit")
    if lim:
        try:
            n = int(lim)
            if n > 0:
                entry["limit"] = n
        except Exception:
            pass
    shares[token] = entry
    _save_shares(shares)
    audit("share_create", token)
    return jsonify({"ok": True, "token": token, "secure": bool(entry.get("password") or entry.get("expires_at") or entry.get("limit"))})

@app.route("/qr")
def qr():
    text = request.args.get("text", "")
    import qrcode
    from qrcode.image.svg import SvgPathImage
    qr = qrcode.QRCode(border=1, box_size=10, error_correction=qrcode.constants.ERROR_CORRECT_M)
    qr.add_data(text); qr.make(fit=True)
    import io
    buf = io.BytesIO(); qr.make_image(image_factory=SvgPathImage).save(buf)
    return Response(buf.getvalue(), mimetype="image/svg+xml", headers={"Cache-Control": "no-store"})

_GATE_CSS = '''
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",Roboto,sans-serif;min-height:100vh;display:grid;place-items:center;background:#06060a;color:#f2f2f7;padding:24px}
.card{max-width:400px;width:100%;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:22px;padding:32px;backdrop-filter:blur(18px)}
.ico{width:52px;height:52px;border-radius:50%;display:grid;place-items:center;background:linear-gradient(135deg,#0a84ff,#5e5ce6);font-size:22px;margin-bottom:18px}
h1{font-size:20px;font-weight:700;margin-bottom:6px}
p.desc{color:rgba(255,255,255,.6);font-size:14px;line-height:1.5;margin-bottom:22px}
form{display:flex;flex-direction:column;gap:12px}
input{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:13px 14px;color:#fff;font-size:15px;outline:none}
input:focus{border-color:#0a84ff}
button{background:#0a84ff;border:none;border-radius:12px;padding:13px;color:#fff;font-size:15px;font-weight:600;cursor:pointer}
button:hover{background:#0b76e6}
.lock{margin-bottom:18px;color:rgba(255,255,255,.55);font-size:13px;display:flex;align-items:center;gap:6px}
'''

def _gate_html(token, title, desc, form=False, note=None, error=None):
    err_html = f'<div style="color:#ff453a;font-size:13px;margin-bottom:12px;display:flex;align-items:center;gap:6px"><i class="fa-solid fa-triangle-exclamation"></i> {error}</div>' if error else ''
    form_html = f'''<form method="post" action="/s/{token}">
      {err_html}
      <input type="password" name="pw" placeholder="Masukkan kata sandi tautan" autofocus required autocomplete="current-password">
      <button type="submit">Buka Berkas</button>
    </form>''' if form else ""
    lock_html = '<div class="lock"><i class="fa-solid fa-shield-halved"></i> Tautan dilindungi kata sandi</div>' if form else ''
    note_html = f'<p class="desc" style="margin-top:14px">{note}</p>' if note else ""
    return f"""<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#06060a">
<title>{title} — Storage</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
<style>
{_GATE_CSS}
</style>
</head>
<body>
<div class="card">
  <div class="ico"><i class="fa-solid fa-lock"></i></div>
  <h1>{title}</h1>
  <p class="desc">{desc}</p>
  {lock_html}
  {form_html}
  {note_html}
</div>
</body>
</html>"""


def _share_preview_html(token, target, pw=""):
    import html
    name = html.escape(target.name)
    size = target.stat().st_size
    def _fmt(n):
        for u in ['B','KB','MB','GB']:
            if n < 1024: return f"{n:.1f} {u}" if n >= 10 and u!='B' else f"{int(n)} {u}"
            n /= 1024
        return f"{n:.1f} TB"
    size_str = _fmt(size)
    ext = target.suffix.lower()
    pw_arg = f"&pw={quote(pw)}" if pw else ""
    raw_url = f"/s/{token}?raw=1{pw_arg}"
    dl_url = f"/s/{token}?dl=1{pw_arg}"
    
    prev_html = ""
    if ext in (".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"):
        prev_html = f'''<div class="prev-media"><img src="{raw_url}" alt="{name}"></div>'''
    elif ext in (".mp4", ".webm", ".mov"):
        prev_html = f'''<div class="prev-media"><video controls playsinline src="{raw_url}"></video></div>'''
    elif ext in (".mp3", ".wav", ".ogg", ".m4a", ".flac"):
        prev_html = f'''<div class="prev-media" style="padding:24px"><audio controls src="{raw_url}" style="width:100%"></audio></div>'''
    elif ext == ".pdf":
        prev_html = f'''<div class="prev-media"><iframe src="{raw_url}" style="width:100%;height:380px;border:none"></iframe></div>'''
    elif ext in _TEXT_EXTS:
        try:
            txt = _read_text(target)[:4000]
            txt_esc = html.escape(txt)
            prev_html = f'''<div class="prev-txt"><pre>{txt_esc}</pre></div>'''
        except Exception:
            prev_html = '''<div class="no-prev"><i class="fa-solid fa-file-lines"></i></div>'''
    else:
        prev_html = '''<div class="no-prev"><i class="fa-solid fa-file"></i></div>'''
        
    return f'''<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#06060a">
<title>{name} — Unduh</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
<style>
*{{box-sizing:border-box;margin:0;padding:0}}
body{{font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","SF Pro Text","Segoe UI",Roboto,sans-serif;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#06060a;color:#f5f5f7;padding:20px;-webkit-font-smoothing:antialiased}}
.card{{width:100%;max-width:520px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:24px;box-shadow:0 24px 70px rgba(0,0,0,.6);backdrop-filter:blur(30px);-webkit-backdrop-filter:blur(30px);overflow:hidden}}
.head{{padding:24px;display:flex;align-items:center;gap:16px;border-bottom:1px solid rgba(255,255,255,.08)}}
.icon{{width:48px;height:48px;border-radius:14px;background:rgba(10,132,255,.15);border:1px solid rgba(10,132,255,.3);display:grid;place-items:center;color:#0a84ff;font-size:22px;flex-shrink:0}}
.info{{min-width:0;flex:1}}
.title{{font-size:16px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;letter-spacing:-.01em}}
.meta{{font-size:13px;color:rgba(235,235,245,.55);margin-top:4px}}
.body{{padding:16px;background:rgba(0,0,0,.3)}}
.prev-media{{display:grid;place-items:center;background:rgba(0,0,0,.4);border-radius:14px;overflow:hidden}}
.prev-media img{{max-width:100%;max-height:360px;object-fit:contain}}
.prev-media video{{max-width:100%;max-height:360px;border-radius:12px}}
.prev-txt{{max-height:300px;overflow:auto;padding:14px;background:rgba(0,0,0,.4);border-radius:12px;font-family:ui-monospace,"SF Mono",Menlo,monospace;font-size:12px;line-height:1.6;color:rgba(255,255,255,.85)}}
.prev-txt pre{{white-space:pre-wrap;word-break:break-word}}
.no-prev{{padding:40px 20px;text-align:center;color:rgba(255,255,255,.2);font-size:48px}}
.foot{{padding:20px 24px;display:flex;align-items:center;justify-content:space-between;gap:14px;border-top:1px solid rgba(255,255,255,.08);flex-wrap:wrap}}
.countdown-box{{display:flex;align-items:center;gap:8px;font-size:13px;color:rgba(235,235,245,.65)}}
.btn{{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:12px 24px;border-radius:14px;background:#0a84ff;color:#fff;text-decoration:none;font-size:15px;font-weight:600;border:none;cursor:pointer;transition:transform .15s,filter .2s;flex:1;min-width:160px;box-shadow:0 8px 20px -6px rgba(10,132,255,.6)}}
.btn:hover{{filter:brightness(1.1)}}
.btn.disabled{{opacity:.6;cursor:not-allowed;background:rgba(255,255,255,.1);box-shadow:none}}
.cancel-btn{{background:none;border:none;color:rgba(235,235,245,.5);font-size:13px;cursor:pointer;padding:6px 10px;border-radius:8px}}
.cancel-btn:hover{{color:#fff}}
</style>
</head>
<body>
<div class="card">
  <div class="head">
    <div class="icon"><i class="fa-solid fa-file-arrow-down"></i></div>
    <div class="info">
      <div class="title" title="{name}">{name}</div>
      <div class="meta">{size_str}</div>
    </div>
  </div>
  <div class="body">
    {prev_html}
  </div>
  <div class="foot">
    <div class="countdown-box" id="countBox">
      <span id="countText"><i class="fa-solid fa-clock"></i> Tombol unduh aktif dalam <b id="secNum" style="color:#0a84ff">3</b>s</span>
    </div>
    <a href="javascript:void(0)" class="btn disabled" id="dlBtn" aria-disabled="true">
      <i class="fa-solid fa-download"></i> <span id="btnText">Tunggu 3s</span>
    </a>
  </div>
</div>

<script>
(function(){{
  let count = 3;
  const dlUrl = "{dl_url}";
  const btn = document.getElementById("dlBtn");
  const secNum = document.getElementById("secNum");
  const countBox = document.getElementById("countBox");
  const btnText = document.getElementById("btnText");

  btn.addEventListener("click", (e) => {{
    if (btn.classList.contains("disabled")) {{
      e.preventDefault();
      return false;
    }}
  }});

  const interval = setInterval(() => {{
    count--;
    if (count > 0) {{
      secNum.textContent = count;
      btnText.textContent = "Tunggu " + count + "s";
    }} else {{
      clearInterval(interval);
      btn.classList.remove("disabled");
      btn.removeAttribute("aria-disabled");
      btn.href = dlUrl;
      btnText.textContent = "Unduh Berkas";
      countBox.innerHTML = '<span style="color:#30d158"><i class="fa-solid fa-circle-check"></i> Siap diunduh</span>';
    }}
  }}, 1000);
}})();
</script>
</body>
</html>'''

@app.route("/api/zip-list")
@admin_required
def zip_list():
    rel = request.args.get("path", "")
    target = _safe(rel)
    if not target.exists() or not target.is_file() or target.suffix.lower() != ".zip":
        return jsonify({"error": "Bukan file zip valid"}), 400
    entries = []
    try:
        with zipfile.ZipFile(str(target), "r") as zf:
            for info in zf.infolist():
                entries.append({
                    "name": Path(info.filename).name or info.filename.rstrip("/"),
                    "path": info.filename,
                    "is_dir": info.is_dir(),
                    "size": info.file_size,
                    "compressed_size": info.compress_size,
                    "mtime": time.mktime(datetime(*info.date_time).timetuple()) if info.date_time else 0
                })
    except Exception as e:
        return jsonify({"error": f"Gagal membaca zip: {e}"}), 500
    return jsonify(entries)

@app.route("/api/zip-item")
@admin_required
def zip_item():
    rel = request.args.get("path", "")
    item_path = request.args.get("item", "")
    is_preview = request.args.get("preview") == "1"
    target = _safe(rel)
    if not target.exists() or not target.is_file() or target.suffix.lower() != ".zip":
        abort(400)
    try:
        with zipfile.ZipFile(str(target), "r") as zf:
            data = zf.read(item_path)
    except Exception:
        abort(404)
    item_name = Path(item_path).name
    mime, _ = mimetypes.guess_type(item_name)
    mime = mime or "application/octet-stream"
    buf = io.BytesIO(data)
    if is_preview:
        return send_file(buf, mimetype=mime)
    return send_file(buf, mimetype=mime, as_attachment=True, download_name=item_name)

@app.route("/s/<token>", methods=["GET", "POST"])
def serve_share(token):
    shares = _load_shares()
    entry = shares.get(token)
    if not entry:
        abort(404)
    now = time.time()
    if entry.get("expires_at") and now > entry["expires_at"]:
        return _gate_html(token, "Tautan kedaluwarsa", "Masa berlaku tautan ini sudah habis.", note="File di sisi server tidak dihapus; buat tautan baru dari aplikasi.")
    if entry.get("limit") and entry.get("uses", 0) >= entry["limit"]:
        return _gate_html(token, "Batas unduhan tercapai", f"Tautan ini hanya boleh diunduh {entry['limit']} kali dan sudah tercapai.", note="Buat tautan baru dari aplikasi untuk lanjut.")
    target = (STORAGE_DIR / entry["path"].lstrip("/")).resolve()
    if not target.exists():
        abort(404)
    pw = entry.get("password")
    sent = request.form.get("pw") or request.args.get("pw") or ""
    if pw:
        if not sent:
            return _gate_html(token, "Tautan Dilindungi", "Tautan ini diamankan kata sandi. Masukkan kata sandi untuk melihat atau mengunduh berkas.", form=True), 200
        if not hmac.compare_digest(pw, sent):
            return _gate_html(token, "Tautan Dilindungi", "Tautan ini diamankan kata sandi. Masukkan kata sandi untuk melihat atau mengunduh berkas.", form=True, error="Kata sandi salah. Silakan coba lagi."), 403

    if request.args.get("dl") == "1":
        entry["uses"] = entry.get("uses", 0) + 1
        shares[token] = entry
        _save_shares(shares)
        audit("share_download", token)
        return send_file(str(target), as_attachment=True, download_name=target.name)

    if request.args.get("raw") == "1":
        mime, _ = mimetypes.guess_type(target.name)
        return send_file(str(target), mimetype=mime or "application/octet-stream")

    return _share_preview_html(token, target, pw=sent)

@app.route("/api/stats")
def stats():
    cats = {}
    total = 0
    for p in walk_files(STORAGE_DIR):
        if p.name.startswith("."):
            continue
        total += 1
        try:
            info = file_info(p)
            cats[info["category"]] = cats.get(info["category"], 0) + 1
        except Exception:
            pass
    return jsonify({"files": total, "categories": cats})

@app.route("/api/panel", methods=["GET", "POST"])
@admin_required
def panel():
    if request.method == "POST":
        data = request.get_json(force=True)
        for k, v in data.items():
            _features[k] = bool(v)
        try:
            FEATURES_FILE.write_text(json.dumps(_features))
        except Exception:
            pass
        return jsonify({"ok": True})
    try:
        _features.update(json.loads(FEATURES_FILE.read_text()))
    except Exception:
        pass
    try:
        audit = [json.loads(l) for l in AUDIT_FILE.read_text(errors="ignore").splitlines()[-50:] if l.strip()]
    except Exception:
        audit = []
    try:
        vault_count = len(json.loads(VAULT_FILE.read_text()))
    except Exception:
        vault_count = 0
    try:
        du = shutil.disk_usage(STORAGE_DIR)
        storage = {"total": du.total, "used": du.used, "free": du.free}
    except Exception:
        storage = {"total": 0, "used": 0, "free": 0}
    file_count = 0
    cat_counts = {}
    try:
        for p in walk_files(STORAGE_DIR):
            if p.name.startswith("."):
                continue
            file_count += 1
            try:
                info = file_info(p)
                cat_counts[info["category"]] = cat_counts.get(info["category"], 0) + 1
            except Exception:
                pass
    except Exception:
        pass
    return jsonify({
        "features": _features,
        "audit": audit,
        "vault_count": vault_count,
        "storage": storage,
        "files": file_count,
        "categories": cat_counts,
    })

@app.route("/api/vault", methods=["GET", "POST", "DELETE"])
@admin_required
def vault():
    if request.method == "POST":
        data = request.get_json(force=True)
        key = data.get("key", "").strip()
        val = data.get("value", "")
        if not key:
            return jsonify({"error": "key required"}), 400
        vault = {}
        if VAULT_FILE.exists():
            try:
                vault = json.loads(VAULT_FILE.read_text())
            except Exception:
                pass
        vault[key] = {"value": val, "updated": time.time()}
        VAULT_FILE.write_text(json.dumps(vault))
        audit("vault_set", key)
        return jsonify({"ok": True})
    if request.method == "DELETE":
        data = request.get_json(force=True)
        key = data.get("key", "")
        vault = {}
        if VAULT_FILE.exists():
            try:
                vault = json.loads(VAULT_FILE.read_text())
            except Exception:
                pass
        vault.pop(key, None)
        VAULT_FILE.write_text(json.dumps(vault))
        return jsonify({"ok": True})
    vault = {}
    if VAULT_FILE.exists():
        try:
            vault = json.loads(VAULT_FILE.read_text())
        except Exception:
            pass
    return jsonify(vault)

@app.route("/api/search")
def search():
    q = request.args.get("q", "").strip().lower()
    dirs = request.args.get("dirs") == "1"
    if not q:
        return jsonify([])
    results = []
    for p in walk_files(STORAGE_DIR):
        if p.name.startswith("."):
            continue
        if q in p.name.lower():
            results.append(file_info(p))
    if dirs:
        for d in sorted(STORAGE_DIR.rglob("*")):
            if not d.is_dir() or d is STORAGE_DIR:
                continue
            rel = d.relative_to(STORAGE_DIR)
            if any(part.startswith(".") for part in rel.parts):
                continue
            if q in d.name.lower():
                results.append({"path": "/" + rel.as_posix(), "name": d.name, "is_dir": True, "category": "folder", "ext": "", "mtime": d.stat().st_mtime, "size": 0})
    return jsonify(results[:200])

@app.route("/thumb")
def thumb():
    path = request.args.get("path", "")
    target = (STORAGE_DIR / path.lstrip("/")).resolve()
    if not target.exists() or not target.is_file():
        abort(404)
    try:
        from PIL import Image
        img = Image.open(str(target))
        img.thumbnail((480, 480))
        buf = io.BytesIO()
        fmt = "WEBP" if target.suffix.lower() in (".webp",) else "JPEG"
        img.save(buf, fmt, quality=82)
        buf.seek(0)
        return send_file(buf, mimetype=f"image/{fmt.lower()}")
    except Exception:
        abort(404)

@app.route("/api/ocr", methods=["POST"])
@admin_required
def ocr():
    data = request.get_json(force=True)
    path = data.get("path", "")
    target = (STORAGE_DIR / path.lstrip("/")).resolve()
    if not target.exists():
        return jsonify({"error": "not found"}), 404
    try:
        from PIL import Image
        import pytesseract
        img = Image.open(str(target))
        text = pytesseract.image_to_string(img)
        return jsonify({"text": text})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/tus", methods=["HEAD", "PATCH", "OPTIONS"])
def tus_upload():
    path = request.args.get("path", "/")
    target_dir = (STORAGE_DIR / path.lstrip("/")).resolve()
    if not str(target_dir).startswith(str(STORAGE_DIR.resolve())):
        return jsonify({"error": "invalid"}), 400
    target_dir.mkdir(parents=True, exist_ok=True)
    upload_id = request.headers.get("Upload-Id") or secrets.token_hex(16)
    offset = int(request.headers.get("Upload-Offset", 0))
    metadata = request.headers.get("Upload-Metadata", "")
    upload_dir = SYS_DIR / "tus" / upload_id
    upload_dir.mkdir(parents=True, exist_ok=True)
    if request.method == "OPTIONS":
        resp = Response("", 204)
        resp.headers["Tus-Resumable"] = "1.0.0"
        resp.headers["Tus-Version"] = "1.0.0"
        resp.headers["Tus-Extension"] = "creation,termination"
        resp.headers["Tus-Max-Size"] = str(app.config["MAX_CONTENT_LENGTH"])
        return resp
    if request.method == "HEAD":
        size = 0
        fpath = upload_dir / "file"
        if fpath.exists():
            size = fpath.stat().st_size
        resp = Response("", 200)
        resp.headers["Tus-Resumable"] = "1.0.0"
        resp.headers["Upload-Offset"] = str(size)
        return resp
    if request.method == "PATCH":
        chunk = request.data
        fpath = upload_dir / "file"
        with open(str(fpath), "ab") as f:
            f.write(chunk)
        new_offset = fpath.stat().st_size
        name_match = re.search(r'filename="?([^"]+)"?', metadata)
        if name_match:
            (upload_dir / "meta").write_text(name_match.group(1))
        resp = Response("", 204)
        resp.headers["Tus-Resumable"] = "1.0.0"
        resp.headers["Upload-Offset"] = str(new_offset)
        return resp

@app.route("/api/tus", methods=["POST"])
def tus_create():
    path = request.form.get("path", "/")
    target_dir = (STORAGE_DIR / path.lstrip("/")).resolve()
    if not str(target_dir).startswith(str(STORAGE_DIR.resolve())):
        return jsonify({"error": "invalid"}), 400
    target_dir.mkdir(parents=True, exist_ok=True)
    upload_id = secrets.token_hex(16)
    upload_dir = SYS_DIR / "tus" / upload_id
    upload_dir.mkdir(parents=True, exist_ok=True)
    metadata = request.headers.get("Upload-Metadata", "")
    name_match = re.search(r'filename="?([^"]+)"?', metadata)
    if name_match:
        (upload_dir / "meta").write_text(name_match.group(1))
    resp = Response("", 201)
    resp.headers["Location"] = f"/api/tus?upload_id={upload_id}&path={path}"
    resp.headers["Tus-Resumable"] = "1.0.0"
    return resp

# ===== HIDDEN VAULT (PIN + encrypt-at-rest) =====
def _vault_key():
    if not ENC_KEY_FILE.exists():
        ENC_KEY_FILE.write_bytes(Fernet.generate_key())
    return ENC_KEY_FILE.read_bytes()

def _vault_fernet():
    return Fernet(_vault_key())

def _vault_index():
    if not VAULT_INDEX_FILE.exists():
        return {}
    try:
        return json.loads(_vault_fernet().decrypt(VAULT_INDEX_FILE.read_bytes()).decode())
    except Exception:
        return {}

def _vault_save_index(idx):
    VAULT_DIR.mkdir(parents=True, exist_ok=True)
    VAULT_INDEX_FILE.write_bytes(_vault_fernet().encrypt(json.dumps(idx).encode()))

def _vault_auth():
    tok = request.headers.get("Authorization", "")
    tok = tok[7:] if tok.startswith("Bearer ") else ""
    exp = vault_sessions.get(tok, 0)
    if exp < time.time():
        vault_sessions.pop(tok, None)
        return None
    return tok

@app.route("/api/vault/unlock", methods=["POST"])
def vault_unlock():
    data = request.get_json(force=True)
    pin = str(data.get("pin", "")).strip()
    if hmac.compare_digest(pin, VAULT_PIN):
        tok = secrets.token_urlsafe(24)
        vault_sessions[tok] = time.time() + VAULT_SESSION_TTL
        audit("vault_unlock", "ok")
        return jsonify({"ok": True, "token": tok, "ttl": VAULT_SESSION_TTL})
    time.sleep(0.6)
    return jsonify({"ok": False, "error": "PIN salah"}), 401

@app.route("/api/vault/lock", methods=["POST"])
def vault_lock():
    tok = session_bearer()
    if tok:
        vault_sessions.pop(tok, None)
    return jsonify({"ok": True})

def session_bearer():
    t = request.headers.get("Authorization", "")
    return t[7:] if t.startswith("Bearer ") else ""

@app.route("/api/vault/list")
def vault_list():
    if not _vault_auth():
        return jsonify({"error": "unauthorized"}), 401
    idx = _vault_index()
    out = [{"name": n, "size": e.get("size", 0), "mtime": e.get("mtime", 0)} for n, e in idx.items()]
    out.sort(key=lambda x: x["name"].lower())
    return jsonify(out)

@app.route("/api/vault/file")
def vault_file():
    if not _vault_auth():
        return jsonify({"error": "unauthorized"}), 401
    name = os.path.basename(request.args.get("name", ""))
    idx = _vault_index()
    ent = idx.get(name)
    if not ent:
        abort(404)
    try:
        raw = _vault_fernet().decrypt((VAULT_DIR / ent["f"]).read_bytes())
    except Exception:
        abort(404)
    mime = mimetypes.guess_type(name)[0] or "application/octet-stream"
    rng = request.headers.get("Range")
    dl = request.args.get("dl") == "1"
    if rng and not dl:
        m = re.match(r"bytes=(\d+)-(\d*)", rng)
        if m:
            start = int(m.group(1)); end = int(m.group(2)) if m.group(2) else len(raw) - 1
            part = raw[start:end + 1]
            resp = Response(part, 206, mimetype=mime)
            resp.headers["Content-Range"] = f"bytes {start}-{end}/{len(raw)}"
            resp.headers["Accept-Ranges"] = "bytes"
            resp.headers["Content-Length"] = str(len(part))
            return resp
    resp = Response(raw, mimetype=mime)
    if dl:
        resp.headers["Content-Disposition"] = f"attachment; filename*=UTF-8''{quote(name)}"
    resp.headers["Content-Length"] = str(len(raw))
    return resp

@app.route("/api/vault/upload", methods=["POST"])
def vault_upload():
    if not _vault_auth():
        return jsonify({"error": "unauthorized"}), 401
    f = request.files.get("file")
    if not f or not f.filename:
        return jsonify({"error": "no file"}), 400
    name = os.path.basename(f.filename)
    data = f.read()
    idx = _vault_index()
    if name in idx:
        try:
            (VAULT_DIR / idx[name]["f"]).unlink()
        except Exception:
            pass
    fname = f"vlt_{secrets.token_hex(6)}.vlt"
    VAULT_DIR.mkdir(parents=True, exist_ok=True)
    (VAULT_DIR / fname).write_bytes(_vault_fernet().encrypt(data))
    idx[name] = {"f": fname, "size": len(data), "mtime": time.time()}
    _vault_save_index(idx)
    audit("vault_upload", name)
    return jsonify({"ok": True, "name": name, "size": len(data)})

@app.route("/api/vault/delete", methods=["POST"])
def vault_delete():
    if not _vault_auth():
        return jsonify({"error": "unauthorized"}), 401
    data = request.get_json(force=True)
    name = os.path.basename(data.get("name", ""))
    idx = _vault_index()
    ent = idx.pop(name, None)
    if not ent:
        abort(404)
    try:
        (VAULT_DIR / ent["f"]).unlink(missing_ok=True)
    except Exception:
        pass
    _vault_save_index(idx)
    audit("vault_delete", name)
    return jsonify({"ok": True})

if __name__ == "__main__":
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    SYS_DIR.mkdir(parents=True, exist_ok=True)
    app.run(host="127.0.0.1", port=8080, threaded=True)
