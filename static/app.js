const API_BASE = "";
let isAdmin = false, currentPath = "/", currentCategory = "all", currentQuery = "", viewMode = "list";
const VAULT_PATH = "__vault__";
let vaultToken = sessionStorage.getItem("vault_token") || "";
let remoteResults = null, remoteKey = 0, folderThumbs = {};

const $ = id => document.getElementById(id);
const qsa = (sel, el = document) => [...el.querySelectorAll(sel)];

const $entries = $("entries"), $skeleton = $("skeleton"), $emptyState = $("emptyState");
const $searchInput = $("searchInput"), $clearSearch = $("clearSearch");
const $filterBar = $("filterBar"), $breadcrumb = $("breadcrumb"), $backBtn = $("backBtn");
const $drawer = $("drawer"), $drawerOverlay = $("drawerOverlay");
const $uploadBar = $("uploadBar"), $fileInput = $("fileInput"), $fabUpload = $("fabUpload");
const $panelView = $("panelView"), $settingsView = $("settingsView");
const $navPanel = $("navPanel"), $navSettings = $("navSettings");

const CATEGORIES = [
  { key: "all", icon: "fa-layer-group", label: "Semua" },
  { key: "folder", icon: "fa-folder", label: "Folder" },
  { key: "video", icon: "fa-video", label: "Video" },
  { key: "audio", icon: "fa-music", label: "Audio" },
  { key: "image", icon: "fa-image", label: "Gambar" },
  { key: "document", icon: "fa-file-lines", label: "Dokumen" },
  { key: "archive", icon: "fa-file-zipper", label: "Arsip" },
  { key: "apk", icon: "fa-android", label: "APK" }
];
const FILE_ICON = {
  video: "fa-video", audio: "fa-music", image: "fa-image",
  document: "fa-file-lines", archive: "fa-file-zipper", apk: "fa-android", other: "fa-file"
};

// ===== FILE ART (colored SVG per type) =====
const ART_COL = { apk: "#3ddc84", archive: "#ff9800", video: "#ff375f", audio: "#bf5af2", image: "#30d158", pdf: "#e53935", doc: "#1e88e5", xls: "#43a047", ppt: "#fb8c00", txt: "#78909c", code: "#ff8a3d", folder: "var(--accent)", other: "var(--muted)" };
const EXT_COL = { pdf: "pdf", apk: "apk", doc: "doc", docx: "doc", xls: "xls", xlsx: "xls", ppt: "ppt", pptx: "ppt", txt: "txt", md: "txt", log: "txt", zip: "archive", rar: "archive", "7z": "archive", gz: "archive", tar: "archive", js: "code", py: "code", html: "code", css: "code", sh: "code", ts: "code", json: "code" };
function svgTxt(y, label, size, fill) {
  return `<text x="50" y="${y}" text-anchor="middle" font-size="${size}" font-weight="800" font-family="inherit" fill="${fill}" letter-spacing="1">${label}</text>`;
}
function sheetArt(c, lab, col) {
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <path d="M33 12 h22 l12 12 v56 a8 8 0 0 1 -8 8 h-26 a8 8 0 0 1 -8 -8 v-60 a8 8 0 0 1 8 -8 z" fill="${col}"/>
  <path d="M55 12 l12 12 h-8 a4 4 0 0 1 -4 -4 z" fill="#ffffff" opacity=".35"/>
  <rect x="36" y="34" width="28" height="4" rx="2" fill="#ffffff" opacity=".5"/>
  ${lab ? svgTxt(78, lab, 24, "#fff") : ""}</svg>`;
}
function fileArt(cat, ext) {
  const x = (ext || "").toLowerCase().replace(".", "");
  const k = EXT_COL[x] || cat || "other";
  if (k === "folder") return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" class="file-art"><path d="M16 30 a6 6 0 0 1 6 -6 h22 l8 8 h26 a6 6 0 0 1 6 6 v32 a6 6 0 0 1 -6 6 h-56 a6 6 0 0 1 -6 -6 z" fill="var(--accent)" opacity=".9"/><path d="M16 38 h68 v30 a6 6 0 0 1 -6 6 h-56 a6 6 0 0 1 -6 -6 z" fill="var(--accent)" opacity=".55"/></svg>`;
  if (k === "apk") return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" class="file-art"><g fill="#3ddc84"><rect x="41" y="6" width="3.6" height="11" rx="1.8"/><rect x="55.4" y="6" width="3.6" height="11" rx="1.8"/><circle cx="42.8" cy="10" r="3"/><circle cx="57.2" cy="10" r="3"/><path d="M29 25 h42 a11 11 0 0 1 11 11 v19 a26 26 0 0 1 -64 0 v-19 a11 11 0 0 1 11 -11 z"/><circle cx="40" cy="41" r="4.2" fill="#0b3d1f"/><circle cx="60" cy="41" r="4.2" fill="#0b3d1f"/><rect x="40" y="57" width="20" height="3.2" rx="1.6" fill="#0b3d1f"/></g>${svgTxt(92, "APK", 23, "var(--muted)")}</svg>`;
  if (k === "archive") return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" class="file-art"><path d="M16 34 h68 v10 a7 7 0 0 1 -7 7 h-54 a7 7 0 0 1 -7 -7 z" fill="#ff9800"/><rect x="16" y="46" width="68" height="38" rx="5" fill="#fb8c00"/><path d="M16 60 h68" stroke="#fff" stroke-opacity=".4" stroke-width="3"/><rect x="44" y="60" width="12" height="10" rx="2" fill="#fff" opacity=".85"/>${svgTxt(92, (x || "ZIP").toUpperCase().slice(0, 3), 21, "var(--muted)")}</svg>`;
  if (k === "video") return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" class="file-art"><rect x="20" y="16" width="60" height="68" rx="14" fill="#ff375f"/><path d="M43 38 l18 12 -18 12 z" fill="#fff"/></svg>`;
  if (k === "audio") return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" class="file-art"><rect x="20" y="16" width="60" height="68" rx="14" fill="#bf5af2"/><path d="M42 62 V36 l20 -4 v22" fill="none" stroke="#fff" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="38" cy="64" r="5" fill="#fff"/><circle cx="58" cy="60" r="5" fill="#fff"/></svg>`;
  if (k === "image") return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" class="file-art"><rect x="16" y="20" width="68" height="60" rx="12" fill="#30d158"/><circle cx="38" cy="38" r="6" fill="#fff"/><path d="M24 68 l18 -18 14 14 10 -10 16 14" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const col = ART_COL[k] || ART_COL.other;
  const lab = k === "pdf" ? "PDF" : k === "doc" ? "DOC" : k === "xls" ? "XLS" : k === "ppt" ? "PPT" : k === "txt" ? "TXT" : k === "code" ? "</>" : "";
  return sheetArt(k, lab === "</>" ? svgTxt(78, "</>", 22, "#fff") : lab, col);
}
const vidCache = {};
function thumbFallback(el, cat, ext) { if (el && el.parentNode) el.parentNode.innerHTML = fileArt(cat, ext || ""); }
const vobs = new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting) loadVThumb(en.target); }), { rootMargin: "160px" });
function loadVThumb(el) {
  const key = el.dataset.vpath;
  vobs.unobserve(el);
  if (vidCache[key]) { el.innerHTML = vidCache[key]; return; }
  const v = document.createElement("video");
  v.muted = true; v.playsInline = true; v.preload = "metadata"; v.src = "/api/stream?path=" + key;
  let done = false;
  const grab = () => { try { v.currentTime = 0.4; } catch (e) {} };
  v.addEventListener("loadeddata", grab);
  v.addEventListener("seeked", () => {
    if (done) return; done = true;
    try {
      const w = v.videoWidth, h = v.videoHeight;
      const sc = Math.min(1, 400 / Math.max(w, h));
      const c = document.createElement("canvas");
      c.width = Math.max(1, w * sc); c.height = Math.max(1, h * sc);
      c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
      const url = c.toDataURL("image/jpeg", 0.72);
      vidCache[key] = `<img src="${url}" alt="" loading="lazy">`;
      el.innerHTML = vidCache[key];
    } catch (e) { el.innerHTML = fileArt("video", ""); }
    try { v.removeAttribute("src"); v.load(); } catch (e) {}
  });
  v.addEventListener("error", () => { if (!done) { done = true; el.innerHTML = fileArt("video", ""); } });
  setTimeout(grab, 1600);
}
function scheduleVideoThumbs() { document.querySelectorAll(".entry-thumb.vthumb[data-vpath]").forEach(el => { if (!vidCache[el.dataset.vpath]) vobs.observe(el); }); }

function esc(t) { const d = document.createElement("div"); d.textContent = t; return d.innerHTML; }
function fmtBytes(b) {
  if (!b || b <= 0) return "0 B";
  const s = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(b) / Math.log(1024)), s.length - 1);
  return (b / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + " " + s[i];
}
function fmtDate(ts) {
  const d = new Date(ts * 1000), n = new Date();
  if (d.toDateString() === n.toDateString()) return "Hari ini " + d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

// ===== AUTH / SESSION =====
async function checkSession() {
  try {
    const r = await fetch(API_BASE + "/api/session");
    const d = await r.json();
    isAdmin = !!d.is_admin;
  } catch (e) { isAdmin = false; }
  applyAuth();
}
function applyAuth() {
  $uploadBar.hidden = !isAdmin;
  $(".drawer-admin-badge") && ($("drawerAdmin").hidden = !isAdmin);
  $("drawerGuest").hidden = isAdmin;
  $("drawerLoggedActions").hidden = !isAdmin;
  $navPanel.hidden = !isAdmin;
  $navSettings.hidden = !isAdmin;
  if (isAdmin) { $("drawerLogout").style.display = ""; }
  render();
}

async function doLogin(password) {
  const $err = $("drawerLoginError"), $btn = $("drawerLoginBtn");
  $err.textContent = ""; $btn.disabled = true;
  try {
    const r = await fetch(API_BASE + "/api/login", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password })
    });
    const d = await r.json();
    if (d.ok) {
      $("drawerPassword").value = "";
      closeDrawer();
      checkSession();
      return true;
    }
    $err.textContent = "Kata sandi salah";
  } catch (e) { $err.textContent = "Gagal terhubung"; }
  $btn.disabled = false;
  return false;
}

async function waitAuth() {
  // after login, reload content
  loadList(currentPath);
}

// ===== DRAWER =====
function openDrawer() { $drawer.classList.add("open"); $drawerOverlay.style.display = "block"; requestAnimationFrame(() => $drawerOverlay.classList.add("show")); }
function closeDrawer() { $drawer.classList.remove("open"); $drawerOverlay.classList.remove("show"); setTimeout(() => { $drawerOverlay.style.display = "none"; }, 220); }

$("menuBtn").addEventListener("click", openDrawer);
$("drawerClose").addEventListener("click", closeDrawer);
$("drawerOverlay").addEventListener("click", closeDrawer);

$("drawerLoginForm").addEventListener("submit", e => { e.preventDefault(); doLogin($("drawerPassword").value); });

// drawer nav actions
qsa("[data-nav]").forEach(btn => {
  btn.addEventListener("click", () => {
    const nav = btn.dataset.nav;
    closeDrawer();
    if (nav === "panel") showTab("panel");
    else if (nav === "settings") showTab("settings");
    else if (nav === "folder") newFolder();
  });
});
$("drawerTheme").addEventListener("click", toggleTheme);
$("drawerLogout").addEventListener("click", () => {
  fetch(API_BASE + "/api/logout", { method: "POST" }).then(() => { isAdmin = false; applyAuth(); closeDrawer(); showTab("files"); });
});

// ===== THEME =====
function applyTheme(isDark) {
  document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
  const bg = isDark ? "#06060a" : "#f2f2f7";
  document.documentElement.style.setProperty("--bg", bg);
  document.documentElement.style.setProperty("color-scheme", isDark ? "dark" : "light");
  document.body.style.background = bg;
  document.body.classList.toggle("dark", isDark);
  document.documentElement.style.colorScheme = isDark ? "dark" : "light";
  const v = document.getElementById("drawerThemeVal");
  if (v) v.textContent = isDark ? "Mode Gelap" : "Mode Terang";
  const h = document.querySelector("#themeBtn .ti");
  if (h) h.className = "fa-solid ti " + (isDark ? "fa-sun" : "fa-moon");
}
function toggleTheme() {
  const isDark = document.documentElement.getAttribute("data-theme") !== "light";
  const next = !isDark;
  localStorage.setItem("sam_theme", next ? "dark" : "light");
  applyTheme(next);
}
function initTheme() {
  const saved = localStorage.getItem("sam_theme");
  applyTheme(saved ? saved === "dark" : true);
}
$("themeBtn").addEventListener("click", toggleTheme);

// ===== NAV / VIEWS =====
function showTab(tab) {
  $("browseView").hidden = tab !== "files";
  $panelView.hidden = tab !== "panel";
  $settingsView.hidden = tab !== "settings";
  qsa(".nav-item").forEach(n => n.classList.toggle("active", n.dataset.tab === tab));
  if (tab === "files") { $entries.style.display = viewMode === "grid" ? "grid" : "block"; $skeleton.hidden = true; }
  else if (tab === "panel") loadPanel();
  else if (tab === "settings") loadSettings();
}
qsa(".nav-item").forEach(n => n.addEventListener("click", () => showTab(n.dataset.tab)));

function setView(mode) {
  viewMode = mode;
  localStorage.setItem("view_mode", mode);
  $("viewGrid").classList.toggle("active", mode === "grid");
  $("viewList").classList.toggle("active", mode === "list");
  $entries.style.display = viewMode === "grid" ? "grid" : "block";
  $entries.classList.toggle("list", viewMode === "list");
}
const savedView = localStorage.getItem("view_mode");
if (savedView === "grid" || savedView === "list") setView(savedView);
$("viewGrid").addEventListener("click", () => setView("grid"));
$("viewList").addEventListener("click", () => setView("list"));

// ===== FILTER BAR =====
function buildFilters() {
  $filterBar.innerHTML = CATEGORIES.map(c =>
    `<button class="filter-chip ${c.key === currentCategory ? "active" : ""}" data-cat="${c.key}">
       <i class="fa-solid ${c.icon}"></i><span>${c.label}</span></button>`
  ).join("");
}
$filterBar.addEventListener("click", e => {
  const chip = e.target.closest(".filter-chip");
  if (!chip) return;
  currentCategory = chip.dataset.cat;
  qsa(".filter-chip", $filterBar).forEach(c => c.classList.toggle("active", c === chip));
  render();
});

// ===== SEARCH =====
let globalSearchResults = null;
$searchInput.addEventListener("input", debounce(async () => {
  currentQuery = $searchInput.value.trim();
  $clearSearch.hidden = !currentQuery;
  if (!currentQuery) {
    globalSearchResults = null;
    render();
    return;
  }
  try {
    const res = await fetch("/api/search?dirs=1&q=" + encodeURIComponent(currentQuery));
    if (res.ok) {
      const data = await res.json();
      globalSearchResults = Array.isArray(data) ? data : [];
    } else {
      globalSearchResults = null;
    }
  } catch (e) {
    globalSearchResults = null;
  }
  render();
}, 220));

$clearSearch.addEventListener("click", () => {
  $searchInput.value = ""; currentQuery = ""; $clearSearch.hidden = true;
  globalSearchResults = null;
  render();
});

// ===== EXPLORER NAV =====
function readURLPath() {
  try { const p = decodeURIComponent(new URLSearchParams(location.search).get("p") || "").replace(/^\/+/, ""); return p ? "/" + p : "/"; }
  catch (e) { return "/"; }
}
function parentDir(p) {
  p = p || "/";
  if (p === "/") return null;
  const i = p.lastIndexOf("/");
  return i <= 0 ? "/" : p.slice(0, i);
}
function renderCrumbs() {
  const segs = (currentPath === "/" ? "" : currentPath).split("/").filter(Boolean);
  $backBtn.hidden = currentPath === "/";
  const home = `<button class="crumb-seg" data-crumb="/">/</button>`;
  if (!segs.length) { $breadcrumb.innerHTML = `<span class="crumb-seg crumb-cur">/</span>`; return; }
  let acc = "";
  $breadcrumb.innerHTML = home + segs.map(s => {
    acc += "/" + s;
    const label = s === VAULT_PATH ? "Vault" : s;
    const cur = acc === currentPath || s === currentPath;
    return `<span class="crumb-spr">›</span>` + (cur
      ? `<span class="crumb-seg crumb-cur" title="${esc(acc)}">${esc(label)}</span>`
      : `<button class="crumb-seg" data-crumb="${esc(acc)}" title="${esc(acc)}">${esc(label)}</button>`);
  }).join("");
  $breadcrumb.querySelectorAll("[data-crumb]").forEach(b => b.addEventListener("click", () => goDir(b.dataset.crumb)));
}
function goDir(path) {
  path = (path && path !== ".") ? path : "/";
  if (path === "/" + VAULT_PATH) path = VAULT_PATH;
  history.pushState({ path }, "", path === VAULT_PATH ? "/?p=" + encodeURIComponent(VAULT_PATH) : "/?p=" + encodeURIComponent(path.slice(1)));
  if (currentPath !== path) loadList(path);
  else renderCrumbs();
}
window.addEventListener("popstate", () => {
  const p = (history.state && history.state.path) || readURLPath();
  if (p !== currentPath) loadList(p); else renderCrumbs();
});
$backBtn.addEventListener("click", () => { const up = parentDir(currentPath); if (up !== null) goDir(up); });
document.addEventListener("keydown", e => {
  if (!e.altKey || e.key !== "ArrowLeft") return;
  const up = parentDir(currentPath);
  if (up !== null) { e.preventDefault(); goDir(up); }
});

// ===== LIST =====
async function loadList(path) {
  if (path === "/" + VAULT_PATH) path = VAULT_PATH;
  currentPath = path || "/";
  renderCrumbs();
  renderSkeleton();
  showTab("files");
  try {
    const isV = currentPath === VAULT_PATH;
    const opt = vaultToken ? { headers: vaultHdr() } : {};
    const r = await fetch(API_BASE + "/api/list?path=" + encodeURIComponent(currentPath), opt);
    if (r.status === 401) { if (isV) vaultLock(); else doLoginPrompt(); return; }
    remoteResults = await r.json();
    remoteKey = Date.now();
    prefetchThumbs(remoteResults);
    render();
  } catch (e) { remoteResults = []; render(); }
}

function filteredEntries() {
  if (currentQuery && globalSearchResults !== null) {
    let items = [...globalSearchResults];
    if (currentCategory !== "all") {
      items = items.filter(it => currentCategory === "folder" ? it.is_dir : it.category === currentCategory);
    }
    return items.sort((a, b) => (a.is_dir !== b.is_dir ? b.is_dir - a.is_dir : a.name.localeCompare(b.name, "id")));
  }
  if (!remoteResults) return [];
  let items = [...remoteResults];
  if (currentQuery) {
    const q = currentQuery.toLowerCase();
    items = items.filter(it => it.name.toLowerCase().includes(q));
  }
  if (currentCategory !== "all") {
    items = items.filter(it =>
      currentCategory === "folder" ? it.is_dir : it.category === currentCategory
    );
  }
  return items.sort((a, b) => {
    if (a.is_dir !== b.is_dir) return b.is_dir - a.is_dir;
    return a.name.localeCompare(b.name, "id");
  });
}

function renderSkeleton() {
  $entries.style.display = "none";
  $emptyState.hidden = true;
  $skeleton.hidden = false;
  $skeleton.innerHTML = Array.from({ length: 8 }, () => '<div class="skel"></div>').join("");
}

function render() {
  if (!remoteResults) return;
  const items = filteredEntries(), frag = document.createDocumentFragment();
  $entries.innerHTML = "";
  $skeleton.hidden = true;
  if (!items.length) {
    $entries.style.display = "none";
    $emptyState.hidden = false;
    $emptyState.querySelector(".empty-title").textContent =
      currentQuery ? "Tidak ada hasil" : (remoteResults.length ? "Filter kosong" : "Belum ada berkas");
    return;
  }
  $emptyState.hidden = true;
  $entries.style.display = viewMode === "grid" ? "grid" : "block";
  $entries.classList.toggle("list", viewMode === "list");

  for (const item of items) {
    const el = document.createElement("div");
    el.className = "entry" + (item.is_dir ? " is-dir" : "");
    const name = esc(item.name), meta = (item.is_dir ? "Folder" : fmtBytes(item.size)) + " · " + fmtDate(item.mtime);

    const inv = inVault();
    const fileExt = inv ? (item.ext || item.name.split(".").pop().toLowerCase()) : item.ext;
    const cat = inv ? vaultCat(fileExt) : item.category;

    let thumb;
    if (inv) {
      thumb = `<div class="entry-thumb">${fileArt(cat, fileExt)}</div>`;
    } else if (item.vault) {
      thumb = `<div class="entry-thumb vfold">${fileArt("folder", "")}<i class="fa-solid fa-lock vfold-lock"></i></div>`;
    } else if (item.is_dir) {
      const tk = folderThumbs[item.path];
      thumb = tk === 404 || tk === undefined
        ? `<div class="entry-thumb">${fileArt("folder", "")}</div>`
        : `<div class="entry-thumb"><img src="${tk}" alt="" loading="lazy" onerror="thumbFallback(this,'folder','')"></div>`;
    } else if (item.category === "image" && /\.(jpe?g|png|webp|gif|bmp)$/i.test(item.ext)) {
      thumb = `<div class="entry-thumb"><img src="/thumb?path=${encodeURIComponent(item.path)}" alt="" loading="lazy" onerror="thumbFallback(this,'image','')"></div>`;
    } else if (item.category === "video" && /\.(mp4|webm|mov|m4v|mkv)$/i.test(item.ext)) {
      thumb = `<div class="entry-thumb vthumb" data-vpath="${encodeURIComponent(item.path)}">${fileArt("video", "")}</div>`;
    } else {
      thumb = `<div class="entry-thumb">${fileArt(cat, item.ext)}</div>`;
    }

    let actions;
    if (inv) {
      actions = `<div class="entry-actions"><button class="entry-act" data-act="dl" title="Unduh"><i class="fa-solid fa-arrow-down-to-line"></i></button>${isAdmin ? '<button class="entry-act danger" data-act="del" title="Hapus"><i class="fa-solid fa-trash"></i></button>' : ""}</div>`;
    } else if (item.vault) {
      actions = "";
    } else if (item.is_dir) {
      actions = `<div class="entry-actions"><button class="entry-act" data-act="zip" title="Unduh ZIP"><i class="fa-solid fa-file-zipper"></i></button>${isAdmin ? '<button class="entry-act danger" data-act="del" title="Hapus"><i class="fa-solid fa-trash"></i></button>' : ""}</div>`;
    } else {
      actions = `<div class="entry-actions"><button class="entry-act" data-act="share" title="Bagikan"><i class="fa-solid fa-share-nodes"></i></button>${isAdmin ? '<button class="entry-act danger" data-act="del" title="Hapus"><i class="fa-solid fa-trash"></i></button>' : ""}</div>`;
    }

    const chk = selMode && !item.vault
      ? `<div class="entry-check${sel.has(item.path) ? " on" : ""}"><i class="fa-solid fa-check"></i></div>`
      : "";
    el.innerHTML = `${chk}${thumb}<div class="entry-body"><div class="entry-name">${name}</div><div class="entry-meta">${meta}</div></div>${actions}`;

    el.addEventListener("click", e => {
      const act = e.target.closest("[data-act]");
      if (act) { e.stopPropagation(); handleAct(item, act.dataset.act); return; }
      if (selMode && !item.vault) { toggleSel(item); return; }
      if (item.is_dir) goDir(item.path);
      else if (inv) vaultPreview(item.name);
      else if ((item.ext || "").toLowerCase() === ".zip" || item.name.toLowerCase().endsWith(".zip")) openZip(item);
      else if (PREVIEW_EXTS.has((item.ext || "").replace(/^\./, "").toLowerCase())) openPreview(item);
      else window.location.href = "/d?path=" + encodeURIComponent(item.path);
    });
    frag.appendChild(el);
  }
  $entries.appendChild(frag);
  scheduleVideoThumbs();
}

// ===== FOLDER THUMBS =====
function prefetchThumbs(items) {
  items.filter(x => x.is_dir && !x.vault).forEach(dir => {
    if (folderThumbs[dir.path] !== undefined) return;
    const url = "/api/folder-thumb?path=" + encodeURIComponent(dir.path);
    folderThumbs[dir.path] = url; // optimistic; correct on success
    fetch(url).then(r => {
      if (!r.ok) { folderThumbs[dir.path] = 404; render(); return; }
      folderThumbs[dir.path] = url + (url.includes("?") ? "&" : "?") + "t=" + Date.now() + "&p=" + dir.path;
      render();
    }).catch(() => { folderThumbs[dir.path] = 404; render(); });
  });
}

// ===== ADMIN ACTIONS =====
async function newFolder() {
  if (inVault()) { alert("Folder tidak bisa dibuat di dalam Vault."); return; }
  const name = prompt("Nama folder:");
  if (!name) return;
  const r = await fetch(API_BASE + "/api/mkdir", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: currentPath, name })
  });
  if (r.status === 401) { doLoginPrompt(); return; }
  loadList(currentPath);
}

const $uploadZone = $("uploadZone");
$fabUpload.addEventListener("click", () => $fileInput.click());
$fileInput.addEventListener("change", () => { if ($fileInput.files[0]) uploadFile($fileInput.files[0]); $fileInput.value = ""; });
$uploadZone.addEventListener("click", () => $fileInput.click());
$uploadZone.addEventListener("dragover", e => { e.preventDefault(); $uploadZone.classList.add("drag"); });
$uploadZone.addEventListener("dragleave", () => $uploadZone.classList.remove("drag"));
$uploadZone.addEventListener("drop", e => {
  e.preventDefault(); $uploadZone.classList.remove("drag");
  if (e.dataTransfer.files[0]) uploadFile(e.dataTransfer.files[0]);
});

let upXhr = null;
function uploadFile(file) {
  if (inVault()) {
    const fd = new FormData(); fd.append("file", file);
    return vaultGet("upload", { method: "POST", body: fd }).then(r => { if (r.ok) loadList(currentPath); });
  }
  const fd = new FormData();
  fd.append("file", file); fd.append("path", currentPath);
  upStart(file.name);
  upXhr = new XMLHttpRequest();
  upXhr.open("POST", API_BASE + "/api/upload");
  upXhr.upload.onprogress = e => { if (e.lengthComputable) upSet(e.loaded, e.total, file.size); };
  upXhr.onload = () => { const st = upXhr.status; upEnd(); upXhr = null; if (st === 401) doLoginPrompt(); loadList(currentPath); };
  upXhr.onerror = () => { upEnd(); upXhr = null; alert("Upload gagal."); };
  upXhr.send(fd);
}

function confirmDelete(item) {
  if (!confirm(`Hapus ${item.is_dir ? "folder" : "file"} "${item.name}"?`)) return;
  fetch(API_BASE + "/api/delete", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: item.path })
  }).then(r => { if (r.status === 401) { doLoginPrompt(); return; } if (r.ok) loadList(currentPath); });
}

function doLoginPrompt() { openDrawer(); }

// ===== PANEL =====
async function loadPanel() {
  if (!isAdmin) return;
  try {
    const r = await fetch(API_BASE + "/api/panel");
    if (r.status === 401) { openDrawer(); return; }
    const d = await r.json();
    const st = d.storage || {};
    const used = st.used || 0, total = st.total || 1;
    const pct = (used / total * 100).toFixed(1);
    const cats = d.categories || {};
    const icons = { video: "fa-video", audio: "fa-music", image: "fa-image", document: "fa-file-lines", archive: "fa-file-zipper", apk: "fa-android", folder: "fa-folder", other: "fa-file" };
    $panelView.innerHTML = `
      <div class="panel-container">
        <div class="panel-card">
          <div class="panel-card-header"><div class="panel-card-icon"><i class="fa-solid fa-hard-drive"></i></div>
            <div class="panel-card-info"><div class="panel-card-title">Kapasitas</div><div class="panel-card-value">${fmtBytes(used)} <span style="font-size:14px;color:var(--muted)">/ ${fmtBytes(total)}</span></div></div>
          </div>
          <div class="progress-bar"><div class="progress-fill" style="width:${pct}%" id="storageBar"></div></div>
          <div style="margin-top:6px;font-size:12px;color:var(--muted)">${pct}% terpakai</div>
        </div>
        <div class="panel-card">
          <div class="panel-card-header"><div class="panel-card-icon"><i class="fa-solid fa-file"></i></div>
            <div class="panel-card-info"><div class="panel-card-title">Berkas</div><div class="panel-card-value">${(d.files || 0).toLocaleString()} berkas</div></div>
          </div>
          <div class="cat-grid">${Object.entries(cats).map(([k, v]) => `<span class="cat-chip"><i class="fa-solid ${icons[k] || "fa-file"}</i>${k}: ${v}</span>`).join("")}</div>
                  </div>
                  <div class="panel-card">
                    <div class="panel-card-header"><div class="panel-card-icon"><i class="fa-solid fa-chart-column"></i></div>
                      <div class="panel-card-info"><div class="panel-card-title">Analitik</div><div class="panel-card-value" style="font-size:13px">pemakaian per tipe & folder terbesar</div></div>
                    </div>
                    <div id="analyticsBody"><div style="color:var(--muted);font-size:13px">Memuat…</div></div>
                  </div>
                  <div class="panel-card">
                    <div class="panel-card-header"><div class="panel-card-icon"><i class="fa-solid fa-clock-rotate-left"></i></div>
            <div class="panel-card-info"><div class="panel-card-title">Audit</div><div class="panel-card-value">${(d.audit || []).length} aksi</div></div>
          </div>
          <div class="audit-list">${(d.audit || []).slice(0, 20).map(a => {
            const dt = new Date((a.ts || 0) * 1000).toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
            return `<div class="audit-row"><span class="audit-time">${dt}</span><span class="audit-action">${esc(a.detail || a.action)}</span></div>`;
          }).join("") || '<div style="color:var(--muted);font-size:13px">Belum ada aktivitas</div>'}
          </div>
        </div>
        <div class="panel-card">
          <div class="panel-card-header"><div class="panel-card-icon"><i class="fa-solid fa-sliders"></i></div>
            <div class="panel-card-info"><div class="panel-card-title">Fitur</div></div>
          </div>
          <div class="feature-list">${[{ k: "2fa", i: "fa-shield-halved", l: "2FA" }, { k: "backup", i: "fa-cloud-arrow-up", l: "Auto backup" }, { k: "ocr", i: "fa-eye", l: "OCR" }].map(f => `
            <div class="feature-item"><div class="feature-label"><i class="fa-solid ${f.i}"></i>${f.l}</div>
            <button class="toggle ${d.features?.[f.k] ? "on" : ""}" data-k="${f.k}"><span class="toggle-knob"></span></button></div>`).join("")}
          </div>
        </div>
      </div>`;
    qsa(".toggle", $panelView).forEach(b => b.addEventListener("click", async () => {
      const k = b.dataset.k;
      fetch(API_BASE + "/api/panel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [k]: !b.classList.contains("on") }) })
        .then(() => loadPanel());
    }));
    renderAnalytics();
  } catch (e) { $panelView.innerHTML = '<p style="color:var(--muted);padding:20px">Gagal memuat panel</p>'; }
}

// ===== SETTINGS =====
async function loadSettings() {
  if (!isAdmin) return;
  try {
    const r = await fetch(API_BASE + "/api/panel");
    const d = await r.json();
    const f = d.features || {};
    $settingsView.innerHTML = `
      <div class="settings-container">
        <div class="panel-card">
          <div class="panel-card-header"><div class="panel-card-icon"><i class="fa-solid fa-gear"></i></div>
            <div class="panel-card-info"><div class="panel-card-title">Setelan</div><div class="panel-card-value" style="font-size:16px">Preferensi Storage</div></div>
          </div>
          <div class="feature-list">
            ${[{ k: "backup", i: "fa-cloud-arrow-up", l: "Auto backup otomatis" }, { k: "ocr", i: "fa-eye", l: "OCR extraksi teks" }, { k: "2fa", i: "fa-shield-halved", l: "Dua faktor" }].map(x => `
              <div class="feature-item"><div class="setting-label"><i class="fa-solid ${x.i}"></i>${x.l}</div>
              <button class="toggle ${f[x.k] ? "on" : ""}" data-k="${x.k}"><span class="toggle-knob"></span></button></div>`).join("")}
          </div>
          <button class="logout-btn" id="settingsLogout"><i class="fa-solid fa-arrow-right-from-bracket"></i> Keluar dari admin</button>
        </div>
        <div class="panel-card">
          <div class="panel-card-header"><div class="panel-card-icon"><i class="fa-solid fa-robot"></i></div>
            <div class="panel-card-info"><div class="panel-card-title">Telegram Bot</div><div class="panel-card-value" style="font-size:13px">Kirim / minta file lewat chat</div></div>
          </div>
          <p style="font-size:13px;color:var(--muted);line-height:1.5;margin:0 0 12px">Panduan instalasi manual + generator script bot (token bot &amp; password cuma di browser kamu).</p>
          <button class="bot-link-btn" id="settingsBot"><i class="fa-solid fa-wand-magic-sparkles"></i> Buka panduan instalasi bot</button>
        </div>
      </div>`;
    qsa(".toggle", $settingsView).forEach(b => b.addEventListener("click", async () => {
      const k = b.dataset.k;
      fetch(API_BASE + "/api/panel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [k]: !b.classList.contains("on") }) })
        .then(() => loadSettings());
    }));
    $("settingsLogout").addEventListener("click", () => {
      fetch(API_BASE + "/api/logout", { method: "POST" }).then(() => { isAdmin = false; applyAuth(); showTab("files"); });
    });
    $("settingsBot").addEventListener("click", () => { window.open("/t", "_blank"); });
  } catch (e) { $settingsView.innerHTML = '<p style="color:var(--muted);padding:20px">Gagal memuat setelan</p>'; }
}

// ===== INIT =====
buildFilters();
initTheme();
let bootPath = readURLPath();
if (bootPath === "/" + VAULT_PATH) bootPath = VAULT_PATH;
history.replaceState({ path: bootPath }, "", bootPath === "/" ? "/" : (bootPath === VAULT_PATH ? "/?p=" + encodeURIComponent(VAULT_PATH) : "/?p=" + encodeURIComponent(bootPath.slice(1))));
checkSession().then(() => loadList(bootPath));

// ===== SWITCH VIEW RENDERING ON ENTRIES SHOWN =====
$("browseView").hidden = false;

// PWA install hint (Chrome/Edge)
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  window.__deferredInstall = e;
});

// register service worker
if ("serviceWorker" in navigator && location.protocol === "https:") {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/static/sw.js").catch(() => {});
  });
}

// ===== ACTIONS (zip / share / delete) =====
function handleAct(item, act) {
  if (act === "del") { if (inVault()) vaultDelete(item.name); else confirmDelete(item); return; }
  if (act === "dl") { if (inVault()) vaultDownload(item.name); else location.assign("/api/download?path=" + encodeURIComponent(item.path)); return; }
  if (act === "zip") { zipFolder(item); return; }
  if (act === "share") { openShare(item); }
}

async function zipFolder(item) {
  try {
    const r = await fetch("/api/zip", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: item.path }) });
    if (!r.ok) return;
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = (item.name || "folder") + ".zip";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  } catch (e) {}
}

// ===== SHARE SHEET =====
const $shareSheet = $("shareSheet"), $shareOv = $("shareOverlay"), $shareName = $("shareName"), $shareLink = $("shareLink"), $shareQR = $("shareQR"), $shareQRWrap = $("shareQRWrap"), $shareCopy = $("shareCopy");
const $shareSlug = $("shareSlug"), $sharePw = $("sharePw"), $shareExp = $("shareExp"), $shareLimit = $("shareLimit"), $shareCreate = $("shareCreate"), $shareTip = $("shareTip");
let shareItem = null;
function openShare(item) {
  shareItem = item;
  $shareName.textContent = item.name;
  $shareLink.value = ""; $shareQRWrap.hidden = true; $shareCopy.innerHTML = '<i class="fa-solid fa-copy"></i>';
  if ($shareSlug) $shareSlug.value = "";
  $sharePw.value = ""; $shareExp.value = "0"; $shareLimit.value = "";
  $shareTip.innerHTML = '<i class="fa-solid fa-circle-info"></i> Atur opsi (opsional) lalu tekan "Buat tautan".';
  $shareSheet.hidden = false; $shareOv.hidden = false;
}
$shareCreate.addEventListener("click", () => {
  if (!shareItem) return;
  const payload = { path: shareItem.path };
  if ($shareSlug) {
    const s = $shareSlug.value.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (s) payload.slug = s;
  }
  const pw = $sharePw.value.trim(); if (pw) payload.password = pw;
  const exp = +$shareExp.value; if (exp > 0) payload.expires = exp;
  const lim = $shareLimit.value.trim(); if (lim) payload.limit = +lim;
  const btn = $shareCreate; btn.disabled = true;
  $shareTip.innerHTML = '<i class="fa-solid fa-circle-info"></i> Membuat tautan…';
  fetch("/api/share", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
    .then(r => r.json())
    .then(d => {
      if (!d.ok && d.error) {
        $shareTip.innerHTML = '<i class="fa-solid fa-triangle-exclamation" style="color:#ff453a"></i> ' + esc(d.error);
        btn.disabled = false;
        return;
      }
      const link = location.origin + "/s/" + d.token;
      $shareLink.value = link;
      $shareQR.src = "/qr?text=" + encodeURIComponent(link);
      $shareQRWrap.hidden = false;
      const notes = [];
      if (pw) notes.push("<b>kata sandi</b>");
      if (exp > 0) notes.push("<b>berlaku " + exp + " jam</b>");
      if (lim) notes.push("<b>max " + lim + " unduhan</b>");
      $shareTip.innerHTML = '<i class="fa-solid fa-circle-check" style="color:#30d158"></i> Tautan dibuat' + (notes.length ? " (kunci: " + notes.join(", ") + ")" : " — siapa pun bisa unduh.") + ".";
      btn.disabled = false;
    })
    .catch(() => { $shareTip.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> Gagal membuat tautan.'; btn.disabled = false; });
});
function closeShare() { $shareSheet.hidden = true; $shareOv.hidden = true; }
$shareOv.addEventListener("click", closeShare);
$("shareClose").addEventListener("click", closeShare);
$shareCopy.addEventListener("click", () => {
  const v = $shareLink.value;
  if (!v.startsWith("http")) return;
  const done = () => { $shareCopy.innerHTML = '<i class="fa-solid fa-check"></i>'; setTimeout(() => $shareCopy.innerHTML = '<i class="fa-solid fa-copy"></i>', 1300); };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(v).then(done).catch(() => {});
  else { $shareLink.select(); document.execCommand("copy"); done(); }
});

// ===== COMMAND PALETTE =====
const $palette = $("palette"), $palOv = $("paletteOverlay"), $palInput = $("paletteInput"), $palResults = $("paletteResults"), $palEmpty = $("paletteEmpty");
let palItems = [], palIdx = 0;
function openPalette() {
  $palette.hidden = false; $palOv.hidden = false;
  $palResults.innerHTML = ""; $palEmpty.hidden = false; $palEmpty.textContent = "Ketik untuk mencari di seluruh storage…";
  palItems = []; palIdx = 0; $palInput.value = "";
  setTimeout(() => $palInput.focus(), 30);
}
function closePalette() { $palette.hidden = true; $palOv.hidden = true; }
$palOv.addEventListener("click", closePalette);
document.addEventListener("keydown", e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); $palette.hidden ? openPalette() : closePalette(); return; }
  if ($palette.hidden) return;
  if (e.key === "Escape") { e.preventDefault(); closePalette(); }
  else if (e.key === "ArrowDown") { e.preventDefault(); movePal(1); }
  else if (e.key === "ArrowUp") { e.preventDefault(); movePal(-1); }
  else if (e.key === "Enter") { e.preventDefault(); activatePal(); }
});
$palInput.addEventListener("input", debounce(async () => {
  const q = $palInput.value.trim();
  if (!q) { $palResults.innerHTML = ""; $palEmpty.hidden = false; $palEmpty.textContent = "Ketik untuk mencari di seluruh storage…"; palItems = []; return; }
  $palEmpty.hidden = true;
  try {
    const d = await (await fetch("/api/search?dirs=1&q=" + encodeURIComponent(q))).json();
    palItems = Array.isArray(d) ? d : [];
    renderPal();
  } catch (e) { $palEmpty.hidden = false; $palEmpty.textContent = "Gagal mencari."; }
}, 180));
function renderPal() {
  if (!palItems.length) { $palResults.innerHTML = ""; $palEmpty.hidden = false; $palEmpty.textContent = "Tidak ada hasil untuk itu."; return; }
  $palEmpty.hidden = true;
  $palResults.innerHTML = palItems.map((it, i) => {
    const ic = it.is_dir ? "fa-folder" : (FILE_ICON[it.category] || "fa-file");
    const act = it.is_dir
      ? `<i class="fa-solid fa-file-zipper" data-pl="zip" title="Unduh ZIP"></i>`
      : `<i class="fa-solid fa-arrow-down-to-line" data-pl="dl" title="Unduh"></i><i class="fa-solid fa-share-nodes" data-pl="share" title="Bagikan"></i>`;
    return `<div class="pal-item" data-i="${i}"><i class="fa-solid ${ic}"></i><div class="pal-txt"><div class="pal-name">${esc(it.name)}</div><div class="pal-path">${esc(it.path)}</div></div><div class="pal-act">${act}</div></div>`;
  }).join("");
  $palResults.querySelectorAll(".pal-item").forEach(el => {
    el.addEventListener("mousedown", e => {
      const i = +el.dataset.i, a = e.target.closest("[data-pl]")?.dataset.pl;
      if (a) { e.stopPropagation(); palQuick(palItems[i], a); }
      else { e.preventDefault(); palGo(palItems[i]); }
    });
  });
  palIdx = 0; setPalActive(palIdx);
}
function movePal(d) {
  const n = $palResults.querySelectorAll(".pal-item");
  if (!n.length) return;
  palIdx = (palIdx + d + n.length) % n.length;
  setPalActive(palIdx);
}
function setPalActive(i) { $palResults.querySelectorAll(".pal-item").forEach((el, j) => el.classList.toggle("active", j === i)); }
function palGo(it) { closePalette(); if (it.is_dir) goDir(it.path); else location.href = "/d?path=" + encodeURIComponent(it.path); }
function palQuick(it, a) {
  if (a === "zip") { if (it.is_dir) zipFolder(it); else location.assign("/api/download?path=" + encodeURIComponent(it.path)); return; }
  if (a === "dl") { location.assign("/api/download?path=" + encodeURIComponent(it.path)); return; }
  if (a === "share") { openShare(it); }
}
function activatePal() {
  const n = $palResults.querySelectorAll(".pal-item");
  if (n.length && palItems[palIdx]) palGo(palItems[palIdx]);
}
// ===== HIDDEN VAULT (folder model) =====
const $pinSheet = $("pinSheet"), $pinOv = $("pinOverlay"), $pinInput = $("pinInput"), $pinErr = $("pinError"), $pinGo = $("pinGo"), $pinCancel = $("pinCancel");
const $vaultPrev = $("vaultPrev"), $vaultPrevOv = $("vaultPrevOverlay"), $vaultPrevBox = $("vaultPrevBox"), $vaultPrevName = $("vaultPrevName");
let vaultPrevName = "";
function vaultHdr() { return vaultToken ? { "Authorization": "Bearer " + vaultToken } : {}; }
async function vaultGet(path, opts) {
  const headers = (opts && opts.headers) ? Object.assign(vaultHdr(), opts.headers) : vaultHdr();
  const r = await fetch("/api/vault/" + path, Object.assign({ headers }, opts || {}));
  return r;
}
function vaultCat(ext) {
  const x = (ext || "").toLowerCase().replace(/^\./, "");
  const m = { mp4: "video", mkv: "video", webm: "video", mov: "video", m4v: "video", avi: "video",
    jpg: "image", jpeg: "image", png: "image", gif: "image", webp: "image", bmp: "image", svg: "image",
    mp3: "audio", m4a: "audio", wav: "audio", flac: "audio", aac: "audio", ogg: "audio" };
  return m[x] || "other";
}
function inVault() { return currentPath === VAULT_PATH; }
function setVaultState() { $("drawerVaultState").textContent = vaultToken ? "Terbuka" : "Terkunci"; }
function openPin() { $pinOv.hidden = false; $pinSheet.hidden = false; $pinInput.value = ""; $pinErr.textContent = ""; setTimeout(() => $pinInput.focus(), 40); }
function closePin() { $pinOv.hidden = true; $pinSheet.hidden = true; }
async function doUnlock() {
  const pin = $pinInput.value.trim();
  if (!pin) { $pinErr.textContent = "Masukkan PIN."; return; }
  $pinGo.disabled = true;
  try {
    const r = await fetch("/api/vault/unlock", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin }) });
    const d = await r.json();
    if (!r.ok || !d.ok) { $pinErr.textContent = "PIN salah."; $pinGo.disabled = false; return; }
    vaultToken = d.token; sessionStorage.setItem("vault_token", d.token);
    closePin(); setVaultState(); loadList(currentPath);
  } catch (e) { $pinErr.textContent = "Gagal membuka."; }
  $pinGo.disabled = false;
}
async function vaultLock() {
  try { if (vaultToken) await vaultGet("lock", { method: "POST" }); } catch (e) {}
  vaultToken = ""; sessionStorage.removeItem("vault_token");
  closeVaultPrev(); setVaultState();
  if (inVault()) { history.replaceState({ path: "/" }, "", "/"); currentPath = "/"; renderCrumbs(); }
  loadList(currentPath);
}
function vaultDownload(name) { window.open("/api/vault/file?dl=1&name=" + encodeURIComponent(name), "_blank"); }
async function vaultPreview(name) {
  const r = await vaultGet("file?name=" + encodeURIComponent(name));
  if (!r.ok) return;
  const blob = await r.blob();
  const url = URL.createObjectURL(blob);
  const ext = name.split(".").pop().toLowerCase(), cat = vaultCat(ext);
  $vaultPrevName.textContent = name; vaultPrevName = name;
  if (cat === "image") $vaultPrevBox.innerHTML = `<img src="${url}" alt="">`;
  else if (cat === "video") $vaultPrevBox.innerHTML = `<video src="${url}" controls playsinline autoplay></video>`;
  else if (cat === "audio") $vaultPrevBox.innerHTML = `<audio src="${url}" controls autoplay></audio>`;
  else $vaultPrevBox.innerHTML = `<div class="vault-prev-icon">${fileArt("other", ext)}</div><p>Pratinjau tidak tersedia. Unduh untuk melihat.</p>`;
  $vaultPrevOv.hidden = false; $vaultPrev.hidden = false;
}
function closeVaultPrev() { $vaultPrevOv.hidden = true; $vaultPrev.hidden = true; }
async function vaultDelete(name) {
  if (!confirm('Hapus "' + name + '" dari Vault? (tidak bisa dikembalikan)')) return;
  const r = await vaultGet("delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
  if (r.ok || r.status === 404) { closeVaultPrev(); loadList(currentPath); }
}
$pinGo.addEventListener("click", doUnlock);
$pinCancel.addEventListener("click", closePin);
$pinOv.addEventListener("click", closePin);
$pinInput.addEventListener("keydown", e => { if (e.key === "Enter") doUnlock(); });
$("drawerVault").addEventListener("click", () => { closeDrawer(); vaultToken ? vaultLock() : openPin(); });
$("vaultPrevClose").addEventListener("click", closeVaultPrev);
$vaultPrevOv.addEventListener("click", closeVaultPrev);
$("vaultPrevDl").addEventListener("click", () => vaultDownload(vaultPrevName));
$("vaultPrevDel").addEventListener("click", () => vaultDelete(vaultPrevName));
let brandTaps = 0, brandTimer = null;
function onBrandTap() {
  brandTaps++;
  clearTimeout(brandTimer);
  brandTimer = setTimeout(() => brandTaps = 0, 900);
  if (brandTaps >= 5) {
    brandTaps = 0;
    if (vaultToken) { vaultLock(); } else { openPin(); }
  }
}
const brandEl = document.querySelector(".drawer-brand");
if (brandEl) brandEl.addEventListener("click", onBrandTap);
async function initVault() {
  if (!vaultToken) { setVaultState(); return; }
  const r = await vaultGet("list");
  if (r.status === 401) { vaultToken = ""; sessionStorage.removeItem("vault_token"); }
  setVaultState();
}
initVault();

// ===== PREVIEW EXTS =====
const PREVIEW_EXTS = new Set(["pdf", "txt", "md", "markdown", "log", "json", "csv", "xml", "yml", "yaml", "py", "js", "ts", "html", "htm", "css", "sh", "bat", "ini", "cfg", "conf", "sql", "c", "cpp", "h", "java", "go", "rs", "rb", "php", "docx", "xlsx", "xlsm", "tsv"]);

// ===== MULTI-SELECT =====
let selMode = false, sel = new Set();
function setSelMode(on) { selMode = on; if (!on) sel.clear(); updateSelUI(); render(); }
function updateSelUI() { $("selBar").hidden = !selMode; $("selMode").classList.toggle("active", selMode); $("selInfo").textContent = sel.size + " dipilih"; }
function toggleSel(item) { if (sel.has(item.path)) sel.delete(item.path); else sel.add(item.path); updateSelUI(); render(); }
$("selMode").addEventListener("click", () => { if (inVault()) return; setSelMode(!selMode); });
$("recycleBtn").addEventListener("click", () => openTrash());
$("selCancel").addEventListener("click", () => setSelMode(false));
$("selZip").addEventListener("click", async () => {
  if (!sel.size) return;
  try {
    const r = await fetch("/api/zip-multi", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paths: [...sel] }) });
    if (!r.ok) { alert("Gagal membuat ZIP."); return; }
    const blob = await r.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "selection-" + new Date().toISOString().slice(0, 10) + ".zip";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  } catch (e) { alert("Gagal membuat ZIP."); }
});
$("selMove").addEventListener("click", async () => {
  if (!sel.size) return;
  const dst = prompt("Pindah ke folder (path, contoh: /Video):");
  if (!dst) return;
  const to = "/" + dst.replace(/^\/+|\/+$/g, "");
  if (!confirm("Pindahkan " + sel.size + " item ke " + to + "?")) return;
  for (const p of sel) {
    await fetch("/api/move", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ from: p, to }) });
  }
  setSelMode(false); loadList(currentPath);
});
$("selDel").addEventListener("click", async () => {
  if (!sel.size) return;
  if (!confirm("Pindahkan " + sel.size + " item ke Sampah?")) return;
  for (const p of sel) {
    await fetch("/api/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: p }) });
  }
  setSelMode(false); loadList(currentPath);
});

// ===== UPLOAD PROGRESS BAR =====
const $upBar = $("upBar"), $upName = $("upName"), $upPct = $("upPct"), $upFill = $("upFill");
function upStart(name) { $upName.textContent = name; $upPct.textContent = "0%"; $upFill.style.width = "0%"; $upBar.hidden = false; }
function upSet(loaded, total) { const p = total > 0 ? Math.round(loaded / total * 100) : 0; $upPct.textContent = p + "%"; $upFill.style.width = p + "%"; }
function upEnd() { $upBar.hidden = true; }
$("upCancel").addEventListener("click", () => { if (upXhr) upXhr.abort(); upEnd(); });

// ===== TRASH =====
const $trashSheet = $("trashSheet"), $trashOv = $("trashOverlay"), $trashList = $("trashList"), $trashEmpty = $("trashEmpty"), $trashEmptyState = $("trashEmptyState");
let lastTrashCount = 0;
function openTrash() { $trashOv.hidden = false; $trashSheet.hidden = false; loadTrash(); }
function closeTrash() { $trashOv.hidden = true; $trashSheet.hidden = true; }
async function loadTrash() {
  try {
    const r = await fetch("/api/trash");
    if (r.status === 401) { doLoginPrompt(); closeTrash(); return; }
    const items = await r.json();
    lastTrashCount = items.length;
    $("trashCount").textContent = lastTrashCount;
    if (!items.length) { $trashList.innerHTML = ""; $trashEmptyState.hidden = false; return; }
    $trashEmptyState.hidden = true;
    $trashList.innerHTML = items.map(t => `
      <div class="trash-row">
        <div class="trash-ic"><i class="fa-solid ${t.is_dir ? "fa-folder" : "fa-file"}"></i></div>
        <div class="trash-txt"><div class="trash-name">${esc(t.name)}</div><div class="trash-meta">${esc(t.orig || "")} · ${fmtBytes(t.size)} · ${fmtDate(t.deleted)}</div></div>
        <div class="trash-acts">
          <button class="entry-act" data-tr="restore" data-id="${t.id}" title="Pulihkan"><i class="fa-solid fa-rotate-left"></i></button>
          <button class="entry-act danger" data-tr="del" data-id="${t.id}" title="Hapus permanen"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>`).join("");
    $trashList.querySelectorAll(".entry-act").forEach(b => b.addEventListener("click", async () => {
      const id = b.dataset.id, act = b.dataset.tr;
      if (act === "restore") {
        await fetch("/api/trash/restore", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
        loadTrash(); loadList(currentPath);
      } else {
        if (!confirm("Hapus permanen item ini? Tidak bisa dikembalikan.")) return;
        await fetch("/api/trash/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
        loadTrash();
      }
    }));
  } catch (e) { $trashList.innerHTML = '<div style="color:var(--muted);padding:16px">Gagal memuat sampah.</div>'; }
}
$("drawerTrash").addEventListener("click", () => { closeDrawer(); openTrash(); });
$trashOv.addEventListener("click", closeTrash);
$("trashClose").addEventListener("click", closeTrash);
$trashEmpty.addEventListener("click", async () => {
  if (!lastTrashCount) return;
  if (!confirm("Kosongkan semua sampah? " + lastTrashCount + " item dihapus permanen.")) return;
  await fetch("/api/trash/empty", { method: "POST", headers: { "Content-Type": "application/json" } });
  loadTrash();
});

// ===== INLINE PREVIEW =====
const $previewSheet = $("previewSheet"), $previewOv = $("previewOverlay"), $previewBox = $("previewBox"), $previewName = $("previewName");
let previewPath = "";
async function openPreview(item) {
  const ext = (item.ext || "").replace(/^\./, "").toLowerCase();
  previewPath = item.path;
  $previewName.textContent = item.name;
  $previewBox.innerHTML = '<div class="preview-loading"><i class="fa-solid fa-spinner fa-spin"></i> Memuat…</div>';
  $previewOv.hidden = false; $previewSheet.hidden = false;
  if (ext === "pdf") {
    $previewBox.innerHTML = `<iframe src="/api/preview?path=${encodeURIComponent(item.path)}" class="pdf-frame"></iframe>`;
    return;
  }
  try {
    const r = await fetch("/api/preview?path=" + encodeURIComponent(item.path));
    if (r.status === 415) { $previewBox.innerHTML = '<div class="preview-bad">Tipe ini tidak bisa dipratinjau langsung.</div>'; return; }
    if (r.status === 401) { $previewBox.innerHTML = '<div class="preview-bad">Butuh login admin.</div>'; return; }
    const txt = await r.text();
    $previewBox.innerHTML = `<pre class="preview-txt">${esc(txt)}</pre>`;
  } catch (e) { $previewBox.innerHTML = '<div class="preview-bad">Gagal memuat pratinjau.</div>'; }
}
function closePreview() { $previewOv.hidden = true; $previewSheet.hidden = true; $previewBox.innerHTML = ""; }
$previewOv.addEventListener("click", closePreview);
$("previewClose").addEventListener("click", closePreview);
$("previewDl").addEventListener("click", () => { if (previewPath) location.assign("/api/download?path=" + encodeURIComponent(previewPath)); });

// ===== ANALYTICS =====
const _ANL_ICONS = { video: "fa-video", audio: "fa-music", image: "fa-image", document: "fa-file-lines", archive: "fa-file-zipper", apk: "fa-android", other: "fa-file" };
async function renderAnalytics() {
  const el = $("analyticsBody");
  if (!el) return;
  try {
    const d = await (await fetch("/api/analytics")).json();
    const cats = d.categories || [], top = d.top_folders || [], st = d.storage || {};
    const maxCat = Math.max(1, ...cats.map(c => c.bytes));
    const catBars = cats.length ? cats.map(c => `
      <div class="anl-row">
        <div class="anl-label"><i class="fa-solid ${_ANL_ICONS[c.key] || "fa-file"}"></i>${c.key} <span class="anl-sub">${c.count}</span></div>
        <div class="anl-bar"><div class="anl-fill" style="width:${(c.bytes / maxCat * 100).toFixed(1)}%"></div></div>
        <div class="anl-val">${fmtBytes(c.bytes)}</div>
      </div>`).join("") : '<div style="color:var(--muted);font-size:13px">Belum ada data.</div>';
    const maxDir = Math.max(1, ...top.map(t => t.size));
    const dirRows = top.length ? top.map(t => `
      <div class="anl-row">
        <div class="anl-label"><i class="fa-solid fa-folder"></i>${esc(t.name)}</div>
        <div class="anl-bar"><div class="anl-fill dir" style="width:${(t.size / maxDir * 100).toFixed(1)}%"></div></div>
        <div class="anl-val">${fmtBytes(t.size)}</div>
      </div>`).join("") : '<div style="color:var(--muted);font-size:13px">Tidak ada folder.</div>';
    const free = st.free ? `<div style="padding:6px 2px;font-size:12px;color:var(--muted)">Sisa ${fmtBytes(st.free)} · Sampah ${d.trash_count} item (${fmtBytes(d.trash_bytes)})</div>` : "";
    el.innerHTML = `<div class="anl-sec"><div class="anl-title">Per tipe</div>${catBars}${free}</div><div class="anl-sec"><div class="anl-title">Folder terbesar</div>${dirRows}</div>`;
  } catch (e) { el.innerHTML = '<div style="color:var(--muted);font-size:13px">Gagal memuat analitik.</div>'; }
}

// ===== TRASH COUNT ON BOOT =====
fetch("/api/trash").then(r => r.json()).then(items => { $("trashCount").textContent = items.length; }).catch(() => {});

// ===== ZIP INSPECTOR =====
const $zipSheet = $("zipSheet"), $zipOv = $("zipOverlay"), $zipName = $("zipName"), $zipList = $("zipList"), $zipClose = $("zipClose");
let currentZipItem = null;

async function openZip(item) {
  currentZipItem = item;
  $zipName.textContent = item.name;
  $zipList.innerHTML = '<div style="text-align:center;padding:24px;color:var(--muted)"><i class="fa-solid fa-spinner fa-spin"></i> Membaca isi berkas ZIP…</div>';
  $zipSheet.hidden = false; $zipOv.hidden = false;
  try {
    const r = await fetch("/api/zip-list?path=" + encodeURIComponent(item.path));
    if (!r.ok) throw new Error("Gagal membaca berkas ZIP");
    const list = await r.json();
    if (!Array.isArray(list) || !list.length) {
      $zipList.innerHTML = '<div style="text-align:center;padding:24px;color:var(--muted)">Berkas ZIP kosong.</div>';
      return;
    }
    renderZipList(list);
  } catch (e) {
    $zipList.innerHTML = `<div style="text-align:center;padding:24px;color:#ff453a"><i class="fa-solid fa-triangle-exclamation"></i> ${esc(e.message)}</div>`;
  }
}

function renderZipList(list) {
  $zipList.innerHTML = list.map((ent, idx) => {
    if (ent.is_dir) {
      return `<div class="zip-row"><div class="zip-info"><div class="zip-fname"><i class="fa-solid fa-folder" style="color:var(--accent);margin-right:6px"></i>${esc(ent.name)}/</div><div class="zip-fmeta">Folder</div></div></div>`;
    }
    const ext = (ent.name.split(".").pop() || "").toLowerCase();
    const canPrev = PREVIEW_EXTS.has(ext) || ["jpg","jpeg","png","webp","gif","svg"].includes(ext);
    const sizeStr = fmtBytes(ent.size);
    return `<div class="zip-row" data-idx="${idx}">
      <div class="zip-info">
        <div class="zip-fname"><i class="fa-solid fa-file" style="margin-right:6px;opacity:.6"></i>${esc(ent.name)}</div>
        <div class="zip-fmeta">${sizeStr} · ${esc(ent.path)}</div>
      </div>
      <div class="zip-acts">
        ${canPrev ? `<button class="zip-btn" data-zact="prev" data-path="${esc(ent.path)}" title="Pratinjau"><i class="fa-solid fa-eye"></i></button>` : ""}
        <a class="zip-btn" href="/api/zip-item?path=${encodeURIComponent(currentZipItem.path)}&item=${encodeURIComponent(ent.path)}" download title="Unduh"><i class="fa-solid fa-arrow-down-to-line"></i></a>
      </div>
    </div>`;
  }).join("");

  $zipList.querySelectorAll('[data-zact="prev"]').forEach(btn => {
    btn.addEventListener("click", () => {
      const itemPath = btn.dataset.path;
      openZipPreview(currentZipItem.path, itemPath);
    });
  });
}

async function openZipPreview(zipPath, itemPath) {
  const name = itemPath.split("/").pop();
  $previewName.textContent = name;
  $previewDl.onclick = () => location.assign(`/api/zip-item?path=${encodeURIComponent(zipPath)}&item=${encodeURIComponent(itemPath)}`);
  $previewBox.innerHTML = '<div style="display:grid;place-items:center;height:240px;color:var(--muted)"><i class="fa-solid fa-spinner fa-spin fa-2x"></i></div>';
  $previewSheet.hidden = false; $previewOv.hidden = false;
  
  const ext = (name.split(".").pop() || "").toLowerCase();
  const rawUrl = `/api/zip-item?path=${encodeURIComponent(zipPath)}&item=${encodeURIComponent(itemPath)}&preview=1`;

  if (["jpg","jpeg","png","webp","gif","svg"].includes(ext)) {
    $previewBox.innerHTML = `<img src="${rawUrl}" class="preview-img" alt="${esc(name)}">`;
  } else if (ext === "pdf") {
    $previewBox.innerHTML = `<iframe src="${rawUrl}" class="preview-pdf" title="${esc(name)}"></iframe>`;
  } else {
    try {
      const res = await fetch(rawUrl);
      const text = await res.text();
      $previewBox.innerHTML = `<pre class="preview-txt">${esc(text)}</pre>`;
    } catch (e) {
      $previewBox.innerHTML = `<div class="preview-bad"><i class="fa-solid fa-triangle-exclamation"></i> Gagal memuat pratinjau</div>`;
    }
  }
}

function closeZip() { $zipSheet.hidden = true; $zipOv.hidden = true; }
if ($zipOv) $zipOv.addEventListener("click", closeZip);
if ($zipClose) $zipClose.addEventListener("click", closeZip);
