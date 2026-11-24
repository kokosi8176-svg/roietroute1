/* ROI ET ROUTE — เชื่อมหน้าเว็บกับระบบหลังบ้าน (Netlify Functions)
   - บัญชีผู้ใช้: สมัคร / เข้าสู่ระบบ / เปลี่ยนรหัส / ออกจากระบบ
   - เก็บประวัติ ร้านประจำ ผลตรวจความแม่นยำบนคลาวด์ ใช้ได้หลายเครื่อง (รวมข้อมูลให้เอง ไม่ทับกัน)
   - งานจัดส่ง: กด "โหมดคนขับ" แล้วงานขึ้นระบบอัตโนมัติ ติดตามสถานะทุกจุด มอบหมายคนขับได้
   - แจ้งเตือน: รายการส่งใหม่ / จัดส่งไม่สำเร็จ / เส้นทางเปลี่ยน (กระดิ่งบนเว็บ + แจ้งเตือนบนเครื่อง)
   - ราคาน้ำมันอัตโนมัติทุกปั๊ม + ตารางเทียบราคา
   ไม่แก้โค้ดเดิมของเว็บ: อ่าน/เขียนผ่าน window.RP ที่เว็บเปิดไว้ และช่องกรอกราคาเดิม */
(function () {
  'use strict';
  var W = window, d = document;
  if (W.__RRB) return; W.__RRB = 1;
  var API = (W.RR_API || '') + '/api';
  var SYNC_KEYS = ['roiet.hist', 'roiet.fav', 'roiet.acc'];
  var ROLE_TH = { admin: 'ผู้ดูแลระบบ', staff: 'ผู้วางแผน', driver: 'คนขับ' };
  var BRAND_ORDER = ['ptt', 'bcp', 'shell', 'pt', 'caltex', 'esso', 'susco', 'irpc', 'pure'];
  var FUEL_ORDER = ['diesel', 'diesel_b20', 'g95', 'g91', 'e20', 'e85', 'benzine', 'diesel_premium', 'g95_premium'];

  /* ---------- ตัวช่วย ---------- */
  function $(i) { return d.getElementById(i); }
  function qs(s, r) { return (r || d).querySelector(s); }
  function qsa(s, r) { return Array.prototype.slice.call((r || d).querySelectorAll(s)); }
  function el(t, c, h) { var e = d.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function safe(fn) { try { return fn(); } catch (e) { if (W.console) console.warn('[roiet-backend]', e); } }
  function ls(k, v) { try { if (v === undefined) { var t = localStorage.getItem(k); return t ? JSON.parse(t) : null; } if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } }
  function debounce(fn, ms) { var t = 0; return function () { clearTimeout(t); t = setTimeout(function () { safe(fn); }, ms); }; }
  function ago(t) {
    var s = Math.round((Date.now() - t) / 1000);
    if (s < 60) return 'เมื่อสักครู่'; if (s < 3600) return Math.floor(s / 60) + ' นาทีที่แล้ว'; if (s < 86400) return Math.floor(s / 3600) + ' ชม. ที่แล้ว';
    return new Date(t).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }) + ' ' + hhmm(t);
  }
  function hhmm(t) { var x = new Date(t); return ('0' + x.getHours()).slice(-2) + ':' + ('0' + x.getMinutes()).slice(-2); }
  function money(v) { return v == null ? '–' : Number(v).toFixed(2); }
  var IC = {
    bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    cloud: '<path d="M17.5 19a4.5 4.5 0 1 0-1.4-8.8A6 6 0 0 0 4.5 12 3.5 3.5 0 0 0 5 19z"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    truck: '<path d="M10 17h4V5H2v12h3"/><path d="M14 9h4l4 4v4h-2"/><circle cx="7.5" cy="17.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
    fuel: '<path d="M3 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18"/><path d="M3 22h12M7 7h4"/><path d="M15 12h2a2 2 0 0 1 2 2v3a2 2 0 0 0 4 0V9l-3-3"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/>',
    key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>',
    out: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
    check: '<path d="M20 6 9 17l-5-5"/>', alert: '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0"/>',
    route: '<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>', refresh: '<path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5"/>',
  };
  function ic(n, c) { return '<svg class="rr-ic' + (c ? ' ' + c : '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (IC[n] || '') + '</svg>'; }

  /* ---------- เรียก API ---------- */
  var S = { token: ls('rr.token'), user: ls('rr.user'), online: null };
  function api(method, path, body) {
    var h = { 'content-type': 'application/json' };
    if (S.token) h.authorization = 'Bearer ' + S.token;
    return fetch(API + path, { method: method, headers: h, body: body ? JSON.stringify(body) : undefined }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.status === 401 && S.token && path.indexOf('/auth/login') < 0) { setSession(null); toast('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่'); }
        if (!r.ok) { var e = new Error(j.error || ('เกิดข้อผิดพลาด (' + r.status + ')')); e.status = r.status; e.data = j; throw e; }
        return j;
      });
    }, function () { var e = new Error('เชื่อมต่อระบบหลังบ้านไม่ได้ ตรวจอินเทอร์เน็ตแล้วลองใหม่'); e.status = 0; throw e; });
  }
  W.RRAPI = api;

  function setSession(r) {
    if (r) { S.token = r.token || S.token; S.user = r.user; ls('rr.token', S.token); ls('rr.user', S.user); }
    else { S.token = null; S.user = null; ls('rr.token', null); ls('rr.user', null); }
    d.documentElement.classList.toggle('rr-in', !!S.user);
    renderAcct(); notifStart();
    if (S.user) { syncAll(); runWatch(true); }
  }

  /* ---------- กล่องข้อความ (modal) ---------- */
  var openModal = null;
  function modal(title, html, opt) {
    opt = opt || {};
    closeModal();
    var bg = el('div', 'rr-modal-bg'), m = el('div', 'rr-modal' + (opt.wide ? ' wide' : ''));
    m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); m.setAttribute('aria-label', title);
    m.innerHTML = '<header><h3>' + (opt.icon ? ic(opt.icon) : '') + esc(title) + '</h3><button type="button" class="rr-x" aria-label="ปิด">' + ic('x') + '</button></header><div class="rr-body">' + html + '</div>';
    bg.appendChild(m); d.body.appendChild(bg);
    var last = d.activeElement;
    function close() { if (!bg.parentNode) return; bg.parentNode.removeChild(bg); d.removeEventListener('keydown', key); openModal = null; if (last && last.focus) safe(function () { last.focus(); }); if (opt.onClose) opt.onClose(); }
    function key(e) { if (e.key === 'Escape') close(); }
    qs('.rr-x', m).onclick = close;
    bg.addEventListener('mousedown', function (e) { if (e.target === bg) close(); });
    d.addEventListener('keydown', key);
    requestAnimationFrame(function () { bg.classList.add('on'); var f = qs('.rr-form input, .rr-form select', m) || qs('.rr-x', m); if (f) f.focus(); });
    openModal = { el: m, close: close };
    return openModal;
  }
  function closeModal() { if (openModal) openModal.close(); }
  var toastT = 0;
  function toast(t, kind) {
    var e = $('rr-toast'); if (!e) { e = el('div', 'rr-toast'); e.id = 'rr-toast'; e.setAttribute('role', 'status'); d.body.appendChild(e); }
    e.className = 'rr-toast on ' + (kind || ''); e.textContent = t;
    clearTimeout(toastT); toastT = setTimeout(function () { e.classList.remove('on'); }, 3800);
  }
  function busy(btn, on) { if (!btn) return; btn.disabled = on; btn.classList.toggle('rr-busy', on); }
  function formErr(f, msg) { var p = qs('.rr-err', f); if (p) { p.textContent = msg || ''; p.hidden = !msg; } }

  /* ---------- ปุ่มบัญชี + กระดิ่ง บนแถบหัว ---------- */
  var bar;
  function mountBar() {
    if ($('rr-bar')) return;
    bar = el('div', 'rr-bar'); bar.id = 'rr-bar';
    bar.innerHTML = '<button type="button" class="rr-bell" id="rr-bell" aria-label="การแจ้งเตือน" hidden>' + ic('bell') + '<b id="rr-badge" hidden>0</b></button>' +
      '<button type="button" class="rr-acct" id="rr-acct"></button>';
    var tb = qs('#sk-topbar .sk-tb-r');
    if (tb) tb.appendChild(bar); else { bar.classList.add('float'); d.body.appendChild(bar); }
    $('rr-acct').onclick = function (e) { e.stopPropagation(); if (S.user) acctMenu(); else authModal('login'); };
    $('rr-bell').onclick = function (e) { e.stopPropagation(); notifPanel(); };
    renderAcct();
  }
  function renderAcct() {
    var b = $('rr-acct'); if (!b) return;
    var bell = $('rr-bell'); if (bell) bell.hidden = !S.user;
    if (S.user) b.innerHTML = ic('cloud') + '<span><b>' + esc(S.user.name) + '</b><small>' + esc(ROLE_TH[S.user.role] || '') + ' · ' + (SY.state === 'err' ? 'ซิงก์ไม่ได้' : SY.state === 'run' ? 'กำลังซิงก์…' : 'ข้อมูลบนคลาวด์') + '</small></span>';
    else b.innerHTML = ic('user') + '<span><b>เข้าสู่ระบบ</b><small>' + (S.online === false ? 'ระบบหลังบ้านยังไม่พร้อม' : 'เก็บข้อมูลบนคลาวด์ · แจ้งเตือน') + '</small></span>';
    b.classList.toggle('in', !!S.user);
  }

  function authModal(tab) {
    var html = '<div class="rr-tabs" role="tablist"><button type="button" data-t="login">เข้าสู่ระบบ</button><button type="button" data-t="register">สมัครใช้งาน</button></div>' +
      '<form class="rr-form" novalidate>' +
      '<label class="rr-only-reg">ชื่อที่แสดง<input name="name" autocomplete="name" maxlength="60" placeholder="เช่น สมชาย ใจดี"></label>' +
      '<label>อีเมล<input name="email" type="email" autocomplete="email" required placeholder="you@example.com"></label>' +
      '<label>รหัสผ่าน<input name="password" type="password" autocomplete="current-password" required minlength="8" placeholder="อย่างน้อย 8 ตัวอักษร"></label>' +
      '<label class="rr-only-reg">ฉันเป็น<select name="role"><option value="staff">ผู้วางแผนเส้นทาง</option><option value="driver">คนขับรถส่งของ</option></select></label>' +
      '<p class="rr-err" hidden></p><button type="submit" class="rr-btn primary"></button>' +
      '<p class="rr-note">ข้อมูลในเครื่องนี้ (ประวัติ ร้านประจำ ผลตรวจความแม่นยำ) จะรวมขึ้นบัญชีให้อัตโนมัติ ไม่หาย</p></form>';
    var m = modal('บัญชี ROI ET Route', html, { icon: 'cloud' }), f = qs('form', m.el);
    function set(t) {
      tab = t;
      qsa('.rr-tabs button', m.el).forEach(function (b) { b.setAttribute('aria-selected', b.dataset.t === t); });
      qsa('.rr-only-reg', m.el).forEach(function (x) { x.hidden = t !== 'register'; });
      f.password.autocomplete = t === 'register' ? 'new-password' : 'current-password';
      qs('button[type=submit]', f).textContent = t === 'register' ? 'สมัครและเข้าสู่ระบบ' : 'เข้าสู่ระบบ';
      formErr(f, '');
    }
    qsa('.rr-tabs button', m.el).forEach(function (b) { b.onclick = function () { set(b.dataset.t); }; });
    set(tab || 'login');
    f.onsubmit = function (e) {
      e.preventDefault();
      var btn = qs('button[type=submit]', f), b = { email: f.email.value.trim(), password: f.password.value };
      if (!b.email || !b.password) { formErr(f, 'กรอกอีเมลและรหัสผ่าน'); return; }
      if (tab === 'register') { b.name = f.name.value.trim(); b.role = f.role.value; }
      busy(btn, true);
      api('POST', '/auth/' + tab, b).then(function (r) {
        closeModal(); setSession(r);
        toast((tab === 'register' ? 'สมัครเรียบร้อย ' : 'ยินดีต้อนรับ ') + r.user.name + (r.user.role === 'admin' ? ' (ผู้ดูแลระบบ)' : ''), 'ok');
      }, function (er) { formErr(f, er.message); }).then(function () { busy(btn, false); });
    };
  }

  var menuEl = null;
  function closeMenu() { if (menuEl) { menuEl.remove(); menuEl = null; d.removeEventListener('click', closeMenu); } }
  function popMenu(anchor, html) {
    closeMenu();
    menuEl = el('div', 'rr-pop', html); d.body.appendChild(menuEl);
    var r = anchor.getBoundingClientRect(), w = menuEl.offsetWidth;
    menuEl.style.top = (r.bottom + 8 + W.pageYOffset) + 'px';
    menuEl.style.left = Math.max(8, Math.min(W.innerWidth - w - 8, r.right - w)) + 'px';
    menuEl.addEventListener('click', function (e) { e.stopPropagation(); });
    setTimeout(function () { d.addEventListener('click', closeMenu); }, 0);
    return menuEl;
  }
  function acctMenu() {
    var u = S.user, m = popMenu($('rr-acct'),
      '<div class="rr-me">' + ic('user') + '<div><b>' + esc(u.name) + '</b><small>' + esc(u.email) + '</small><span class="rr-role ' + u.role + '">' + esc(ROLE_TH[u.role]) + '</span></div></div>' +
      '<p class="rr-sync">' + syncText() + '</p>' +
      '<button type="button" data-a="jobs">' + ic('truck') + 'งานจัดส่ง' + (u.role === 'driver' ? 'ของฉัน' : '') + '</button>' +
      (u.role === 'admin' ? '<a href="admin.html" class="rr-menu-a">' + ic('shield') + 'หน้าผู้ดูแลระบบ</a>' : '') +
      '<button type="button" data-a="sync">' + ic('refresh') + 'ซิงก์ข้อมูลตอนนี้</button>' +
      '<button type="button" data-a="pw">' + ic('key') + 'เปลี่ยนรหัสผ่าน</button>' +
      '<button type="button" data-a="out">' + ic('out') + 'ออกจากระบบ</button>');
    qsa('button[data-a]', m).forEach(function (b) {
      b.onclick = function () {
        var a = b.dataset.a; closeMenu();
        if (a === 'out') { setSession(null); toast('ออกจากระบบแล้ว ข้อมูลในเครื่องนี้ยังอยู่ครบ'); }
        else if (a === 'pw') pwModal();
        else if (a === 'jobs') jobsModal();
        else if (a === 'sync') syncAll(true);
      };
    });
  }
  function pwModal() {
    var m = modal('เปลี่ยนรหัสผ่าน', '<form class="rr-form"><label>รหัสผ่านเดิม<input name="o" type="password" autocomplete="current-password" required></label><label>รหัสผ่านใหม่<input name="n" type="password" autocomplete="new-password" minlength="8" required placeholder="อย่างน้อย 8 ตัวอักษร"></label><p class="rr-err" hidden></p><button class="rr-btn primary" type="submit">บันทึก</button><p class="rr-note">เปลี่ยนแล้วเครื่องอื่นที่เข้าระบบค้างไว้จะต้องเข้าระบบใหม่</p></form>', { icon: 'key' });
    var f = qs('form', m.el);
    f.onsubmit = function (e) {
      e.preventDefault(); var btn = qs('button[type=submit]', f); busy(btn, true);
      api('POST', '/auth/password', { oldPassword: f.o.value, newPassword: f.n.value }).then(function (r) { setSession(r); closeModal(); toast('เปลี่ยนรหัสผ่านแล้ว', 'ok'); }, function (er) { formErr(f, er.message); }).then(function () { busy(btn, false); });
    };
  }

  /* ---------- เก็บข้อมูลบนคลาวด์ (รวมข้อมูลหลายเครื่องแบบไม่ทับกัน) ---------- */
  var SY = { state: 'idle', at: ls('rr.syncAt'), internal: false, dirty: {} };
  function rp() { return W.RP && W.RP.get ? W.RP : null; }
  function getLocal(k) { var r = rp(); return r ? r.get(k) : ls(k); }
  function setLocal(k, v) { SY.internal = true; try { var r = rp(); if (r) r.set(k, v); else ls(k, v); } finally { SY.internal = false; } }
  function meta(k, v) { var all = ls('rr.meta') || {}; if (v === undefined) return all[k] || { rev: 0, base: null }; all[k] = v; ls('rr.meta', all); }
  function syncText() {
    if (SY.state === 'run') return '☁️ กำลังซิงก์ข้อมูล…';
    if (SY.state === 'err') return '⚠️ ซิงก์ไม่สำเร็จ: ' + esc(SY.err || '') + ' (จะลองใหม่เอง)';
    return '☁️ ' + (SY.at ? 'ซิงก์ล่าสุด ' + ago(SY.at) : 'ยังไม่เคยซิงก์') + ' · ประวัติ ร้านประจำ ผลตรวจความแม่นยำ';
  }
  // รวมรายการ 3 ทาง: ของที่เครื่องไหนลบไปแล้วจะไม่ถูกเอากลับมา
  function idOf(k, x) { return k === 'roiet.fav' && x && x.n ? 'n:' + x.n : JSON.stringify(x); }
  function merge3(k, base, mine, theirs) {
    if (!Array.isArray(mine) || !Array.isArray(theirs)) return mine != null ? mine : theirs;
    if (k === 'roiet.hist') return mergeHist(base, mine, theirs);
    var B = {}, M = {}, out = [], seen = {};
    (Array.isArray(base) ? base : []).forEach(function (x) { B[idOf(k, x)] = 1; });
    mine.forEach(function (x) { M[idOf(k, x)] = 1; });
    var T = {}; theirs.forEach(function (x) { T[idOf(k, x)] = 1; });
    mine.forEach(function (x) { var i = idOf(k, x); if ((T[i] || !B[i]) && !seen[i]) { seen[i] = 1; out.push(x); } });
    theirs.forEach(function (x) { var i = idOf(k, x); if (!M[i] && !B[i] && !seen[i]) { seen[i] = 1; out.push(x); } });
    return out;
  }
  function flat(days) { var o = []; (Array.isArray(days) ? days : []).forEach(function (dd) { (dd.entries || []).forEach(function (e) { o.push({ date: dd.date, e: e }); }); }); return o; }
  function mergeHist(base, mine, theirs) {
    var key = function (x) { return x.date + '§' + JSON.stringify(x.e); };
    var B = {}, M = {}, T = {}, out = [], seen = {};
    flat(base).forEach(function (x) { B[key(x)] = 1; }); flat(mine).forEach(function (x) { M[key(x)] = 1; }); flat(theirs).forEach(function (x) { T[key(x)] = 1; });
    flat(mine).forEach(function (x) { var i = key(x); if ((T[i] || !B[i]) && !seen[i]) { seen[i] = 1; out.push(x); } });
    flat(theirs).forEach(function (x) { var i = key(x); if (!M[i] && !B[i] && !seen[i]) { seen[i] = 1; out.push(x); } });
    var by = {}, extra = {};
    mine.concat(theirs).forEach(function (dd) { if (dd && dd.date) { extra[dd.date] = extra[dd.date] || {}; Object.keys(dd).forEach(function (p) { if (p !== 'entries') extra[dd.date][p] = dd[p]; }); } });
    out.forEach(function (x) { (by[x.date] = by[x.date] || []).push(x.e); });
    return Object.keys(by).sort().reverse().map(function (dt) { var o = extra[dt] || { date: dt }; o = JSON.parse(JSON.stringify(o)); o.date = dt; o.entries = by[dt]; return o; });
  }
  var same = function (a, b) { return JSON.stringify(a) === JSON.stringify(b); };
  function push(k, tries) {
    tries = tries || 0;
    var v = getLocal(k), m = meta(k);
    return api('PUT', '/sync/' + encodeURIComponent(k), { value: v, base: m.rev || 0 }).then(function (r) {
      meta(k, { rev: r.saved.rev, base: v });
    }, function (e) {
      if (e.status === 409 && e.data && e.data.current && tries < 3) {
        var cur = e.data.current, merged = merge3(k, m.base, getLocal(k), cur.value);
        if (!same(merged, getLocal(k))) setLocal(k, merged);
        meta(k, { rev: cur.rev, base: cur.value });
        return push(k, tries + 1);
      }
      throw e;
    });
  }
  var syncing = null;
  function syncAll(manual) {
    if (!S.user || syncing) return syncing;
    SY.state = 'run'; renderAcct();
    var changed = 0;
    syncing = api('GET', '/sync').then(function (r) {
      var data = r.data || {};
      return SYNC_KEYS.reduce(function (p, k) {
        return p.then(function () {
          var srv = data[k], loc = getLocal(k), m = meta(k);
          if (!srv) return loc != null && (Array.isArray(loc) ? loc.length : true) ? push(k) : null;
          if (srv.rev === m.rev) return same(loc, m.base) ? null : push(k);
          var merged = merge3(k, m.base, loc, srv.value);
          if (!same(merged, loc)) { setLocal(k, merged); changed++; }
          meta(k, { rev: srv.rev, base: srv.value });
          return same(merged, srv.value) ? meta(k, { rev: srv.rev, base: merged }) : push(k);
        });
      }, Promise.resolve());
    }).then(function () {
      SY.state = 'ok'; SY.at = Date.now(); ls('rr.syncAt', SY.at); SY.dirty = {};
      if (manual) toast(changed ? 'ซิงก์แล้ว ได้ข้อมูลจากเครื่องอื่นมาเพิ่ม' : 'ซิงก์แล้ว ข้อมูลตรงกันทุกเครื่อง', 'ok');
      else if (changed) toast('ดึงข้อมูลจากบัญชีของคุณมารวมในเครื่องนี้แล้ว', 'ok');
    }, function (e) { SY.state = 'err'; SY.err = e.message; if (manual) toast(e.message, 'bad'); })
      .then(function () { syncing = null; renderAcct(); });
    return syncing;
  }
  var pushSoon = debounce(function () {
    if (!S.user) return;
    var ks = Object.keys(SY.dirty); SY.dirty = {};
    ks.reduce(function (p, k) { return p.then(function () { return push(k); }); }, Promise.resolve())
      .then(function () { SY.state = 'ok'; SY.at = Date.now(); ls('rr.syncAt', SY.at); }, function (e) { SY.state = 'err'; SY.err = e.message; ks.forEach(function (k) { SY.dirty[k] = 1; }); })
      .then(renderAcct);
  }, 1500);

  // ดักการเขียนข้อมูลของเว็บเดิม (ไม่แก้โค้ดเดิม)
  safe(function () {
    var P = Storage.prototype, oSet = P.setItem, oDel = P.removeItem;
    function hit(st, k) {
      if (st !== W.localStorage || SY.internal) return;
      if (SYNC_KEYS.indexOf(k) >= 0) { SY.dirty[k] = 1; pushSoon(); }
      if (k === 'roiet.run') runChanged();
    }
    P.setItem = function (k, v) { var r = oSet.apply(this, arguments); safe(function () { hit(this, k); }.bind(this)); return r; };
    P.removeItem = function (k) { var r = oDel.apply(this, arguments); safe(function () { hit(this, k); }.bind(this)); return r; };
  });

  /* ---------- งานจัดส่ง ---------- */
  var runChanged = debounce(function () { runWatch(false); }, 700);
  function runWatch(first) {
    if (!S.user) return;
    var run = getLocal('roiet.run');
    if (!run || !run.id || !Array.isArray(run.items)) return;
    var last = ls('rr.lastRun') || {}, sig = JSON.stringify([run.id, run.state, run.items.map(function (x) { return [x.n, x.st, x.r || '']; })]);
    if (last.sig === sig) return;
    var replaces = last.id && last.id !== run.id && last.state !== 'finish' && !last.saved ? last.id : null;
    var date = new Date(run.t0 || Date.now()).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
    var body = { run: JSON.parse(JSON.stringify(run)), replaces: replaces };
    body.run.title = 'ส่งของ ' + date + ' · ' + (run.depot || '') + (run.nveh > 1 ? ' · คันที่ ' + ((run.v || 0) + 1) : '');
    delete body.run.log;
    api('POST', '/jobs/sync', body).then(function (r) {
      ls('rr.lastRun', { id: run.id, state: run.state, saved: !!run.saved, sig: sig });
      if (!first && r.events && r.events.indexOf('job_new') >= 0) toast('ส่งงานขึ้นระบบแล้ว ผู้เกี่ยวข้องได้รับแจ้งเตือน', 'ok');
      if (r.events && r.events.length) notifPoll();
    }, function (e) { if (e.status) toast('ส่งสถานะงานขึ้นระบบไม่สำเร็จ: ' + e.message, 'bad'); });
  }
  var STATE_TH = { ready: 'รอออกรถ', run: 'กำลังส่ง', finish: 'จบงานแล้ว', replaced: 'ถูกแทนด้วยแผนใหม่', cancel: 'ยกเลิก' };
  function progress(j) { var s = j.stats || { n: 0, ok: 0, fail: 0 }; return '<span class="rr-prog"><i style="width:' + (s.n ? s.ok / s.n * 100 : 0) + '%"></i><i class="f" style="width:' + (s.n ? s.fail / s.n * 100 : 0) + '%"></i></span><small>สำเร็จ ' + s.ok + '/' + s.n + (s.fail ? ' · ไม่สำเร็จ ' + s.fail : '') + '</small>'; }
  function jobsModal() {
    var m = modal('งานจัดส่ง', '<p class="rr-note">งานขึ้นระบบเองเมื่อกด "โหมดคนขับ" ในหน้าวางแผนเส้นทาง ทุกครั้งที่กดส่งสำเร็จ/ไม่สำเร็จ สถานะจะอัปเดตที่นี่และแจ้งผู้เกี่ยวข้อง</p><div class="rr-list" id="rr-jobs"><p class="rr-load">กำลังโหลด…</p></div>', { icon: 'truck', wide: true });
    api('GET', '/jobs').then(function (r) {
      var box = qs('#rr-jobs', m.el);
      if (!r.jobs.length) { box.innerHTML = '<p class="rr-empty">ยังไม่มีงาน ลองจัดเส้นทางแล้วกด "โหมดคนขับ"</p>'; return; }
      box.innerHTML = r.jobs.map(function (j) {
        return '<button type="button" class="rr-job" data-id="' + esc(j.id) + '"><span class="rr-st ' + j.state + '">' + esc(STATE_TH[j.state] || j.state) + '</span><b>' + esc(j.title) + '</b>' +
          '<span class="rr-meta">' + esc(j.car || '') + (j.pkm != null ? ' · ' + j.pkm.toFixed(1) + ' กม.' : '') + ' · ' + (j.driverName ? 'คนขับ ' + esc(j.driverName) : 'ยังไม่มอบหมายคนขับ') + ' · ' + ago(j.updated) + '</span>' + progress(j) + '</button>';
      }).join('');
      qsa('.rr-job', box).forEach(function (b) { b.onclick = function () { jobModal(b.dataset.id); }; });
    }, function (e) { qs('#rr-jobs', m.el).innerHTML = '<p class="rr-err">' + esc(e.message) + '</p>'; });
  }
  function jobModal(id) {
    var m = modal('รายละเอียดงาน', '<p class="rr-load">กำลังโหลด…</p>', { icon: 'route', wide: true });
    api('GET', '/jobs/' + encodeURIComponent(id)).then(function (r) {
      var j = r.job, u = S.user, canAssign = u.role === 'admin' || j.owner === u.id;
      var rows = j.items.filter(function (x) { return x.k === 'stop'; }).map(function (x) {
        return '<tr class="' + x.st + '"><td>' + x.no + '</td><td>' + esc(x.n) + (x.r ? '<small>เหตุผล: ' + esc(x.r) + '</small>' : '') + '</td><td>' + esc(x.etaTxt || '') + '</td><td>' +
          (x.st === 'ok' ? '<span class="rr-st finish">' + ic('check') + 'สำเร็จ' + (x.t ? ' ' + hhmm(x.t) : '') + '</span>' : x.st === 'fail' ? '<span class="rr-st fail">' + ic('alert') + 'ไม่สำเร็จ</span>' : '<span class="rr-st ready">รอส่ง</span>') +
          '</td><td><a target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=' + x.la + ',' + x.lo + '">นำทาง</a></td></tr>';
      }).join('');
      m.el.querySelector('.rr-body').innerHTML =
        '<div class="rr-jhead"><div><b>' + esc(j.title) + '</b><small>' + esc(STATE_TH[j.state] || j.state) + ' · สร้างโดย ' + esc(j.ownerName || '') + ' · ' + esc(j.car || '') + (j.pkm != null ? ' · ' + j.pkm.toFixed(1) + ' กม.' : '') + '</small></div>' + progress(j) + '</div>' +
        (canAssign ? '<form class="rr-inline" id="rr-assign"><label>มอบหมายให้คนขับ (อีเมล)<input name="e" type="email" placeholder="driver@example.com" value=""></label><button class="rr-btn" type="submit">มอบหมาย</button><span class="rr-meta">' + (j.driverName ? 'ตอนนี้: ' + esc(j.driverName) : 'ยังไม่มอบหมาย') + '</span></form>' : '') +
        '<div class="rr-tw"><table class="rr-t"><thead><tr><th>#</th><th>จุดส่ง</th><th>ถึงประมาณ</th><th>สถานะ</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
        (j.raw && ['ready', 'run'].indexOf(j.state) >= 0 ? '<div class="rr-row"><button type="button" class="rr-btn primary" id="rr-take">' + ic('truck') + 'เปิดงานนี้ในโหมดคนขับบนเครื่องนี้</button><span class="rr-meta">ใช้ตอนคนขับเปิดเว็บจากมือถือตัวเอง</span></div>' : '') +
        '<details class="rr-hist"><summary>ประวัติการเปลี่ยนแปลง</summary>' + (j.history || []).slice().reverse().map(function (h) { return '<p>' + ago(h.at) + ' · ' + esc(h.by || '') + ' · ' + esc(TYPE_TH[h.type] || h.type) + '</p>'; }).join('') + '</details>';
      var fa = $('rr-assign');
      if (fa) fa.onsubmit = function (e) {
        e.preventDefault(); var btn = qs('button', fa); busy(btn, true);
        api('PATCH', '/jobs/' + encodeURIComponent(j.id), { driverEmail: fa.e.value.trim() }).then(function (rr) { toast(rr.job.driverName ? 'มอบหมายให้ ' + rr.job.driverName + ' แล้ว คนขับได้รับแจ้งเตือน' : 'ยกเลิกการมอบหมายแล้ว', 'ok'); jobModal(j.id); }, function (er) { toast(er.message, 'bad'); }).then(function () { busy(btn, false); });
      };
      var tk = $('rr-take');
      if (tk) tk.onclick = function () {
        var run = JSON.parse(JSON.stringify(j.raw));
        run.id = j.id; run.items = j.items.map(function (x) { var y = {}; Object.keys(x).forEach(function (k) { if (k !== 'etaTxt') y[k] = x[k]; }); return y; });
        run.cur = Math.max(0, run.items.findIndex(function (x) { return x.st === 'todo'; }));
        run.state = j.state; run.log = []; run.saved = 0;
        ls('rr.lastRun', { id: j.id, state: j.state, sig: '' });
        setLocal('roiet.run', run); closeModal();
        toast('โหลดงานเข้าโหมดคนขับแล้ว แตะแถบ "กำลังส่งของ" ในหน้าวางแผนเพื่อเริ่ม', 'ok');
        if (W.location.hash !== '#planner' && qs('#sk-views')) W.location.hash = '#planner';
      };
    }, function (e) { m.el.querySelector('.rr-body').innerHTML = '<p class="rr-err">' + esc(e.message) + '</p>'; });
  }

  /* ---------- แจ้งเตือน ---------- */
  var TYPE_TH = { job_new: 'มีรายการส่งใหม่', stop_fail: 'จัดส่งไม่สำเร็จ', stop_ok: 'ส่งสำเร็จ', route_change: 'เส้นทางเปลี่ยน', job_done: 'จบงาน', fuel_change: 'ราคาน้ำมันเปลี่ยน' };
  var TYPE_IC = { job_new: 'truck', stop_fail: 'alert', stop_ok: 'check', route_change: 'route', job_done: 'check', fuel_change: 'fuel' };
  var NT = { timer: 0, items: [], unread: 0, seen: ls('rr.nseen') || 0 };
  function notifStart() {
    clearTimeout(NT.timer);
    if (!S.user) { NT.items = []; NT.unread = 0; badge(); return; }
    notifPoll();
  }
  function notifPoll() {
    clearTimeout(NT.timer);
    if (!S.user) return;
    api('GET', '/notifications?limit=30').then(function (r) {
      NT.items = r.items || []; NT.unread = r.unread || 0; badge();
      var fresh = NT.items.filter(function (x) { return !x.read && x.at > NT.seen; });
      if (fresh.length) {
        NT.seen = Math.max.apply(0, fresh.map(function (x) { return x.at; })); ls('rr.nseen', NT.seen);
        fresh.slice(0, 3).reverse().forEach(function (x) { osNotify(x); });
        if ($('rr-npanel')) renderNotif();
      }
    }, function () {}).then(function () {
      NT.timer = setTimeout(notifPoll, d.hidden ? 60000 : 20000);
    });
  }
  d.addEventListener('visibilitychange', function () { if (!d.hidden && S.user) notifPoll(); });
  function badge() {
    var b = $('rr-badge'); if (!b) return;
    b.hidden = !NT.unread; b.textContent = NT.unread > 99 ? '99+' : NT.unread;
    $('rr-bell').classList.toggle('ring', NT.unread > 0);
  }
  function osNotify(x) {
    if (x.type === 'stop_ok') return;
    var first = NT.firstLoad === undefined; if (first) { NT.firstLoad = 1; if (Date.now() - x.at > 120000) return; }
    if (W.Notification && Notification.permission === 'granted' && d.hidden) safe(function () { new Notification(x.title, { body: x.body, tag: x.id, icon: 'favicon.ico' }); });
    else if (!d.hidden && Date.now() - x.at < 120000) toast(x.title + (x.body ? ' — ' + x.body : ''), x.level === 'danger' ? 'bad' : '');
  }
  function notifPanel() {
    if ($('rr-npanel')) { closeMenu(); return; }
    var m = popMenu($('rr-bell'), '<div class="rr-npanel" id="rr-npanel"><header><b>การแจ้งเตือน</b><button type="button" data-a="all">อ่านทั้งหมด</button></header><div class="rr-nlist"></div>' +
      (W.Notification && Notification.permission === 'default' ? '<button type="button" class="rr-nperm" data-a="perm">' + ic('bell') + 'เปิดแจ้งเตือนบนเครื่องนี้ (เด้งแม้ไม่ได้เปิดหน้าเว็บอยู่)</button>' : '') + '</div>');
    m.classList.add('wide');
    renderNotif();
    qs('[data-a=all]', m).onclick = function () { api('POST', '/notifications/read', { all: true }).then(function () { NT.items.forEach(function (x) { x.read = true; }); NT.unread = 0; badge(); renderNotif(); }); };
    var pb = qs('[data-a=perm]', m); if (pb) pb.onclick = function () { Notification.requestPermission().then(function (p) { pb.remove(); toast(p === 'granted' ? 'เปิดแจ้งเตือนบนเครื่องแล้ว' : 'ยังไม่ได้อนุญาตแจ้งเตือน'); }); };
    notifPoll();
  }
  function renderNotif() {
    var box = qs('#rr-npanel .rr-nlist'); if (!box) return;
    if (!NT.items.length) { box.innerHTML = '<p class="rr-empty">ยังไม่มีการแจ้งเตือน</p>'; return; }
    box.innerHTML = NT.items.map(function (x) {
      return '<button type="button" class="rr-n ' + x.level + (x.read ? '' : ' new') + '" data-j="' + esc(x.jobId || '') + '" data-id="' + esc(x.id) + '">' + ic(TYPE_IC[x.type] || 'bell') +
        '<span><b>' + esc(x.title) + '</b><small>' + esc(x.body) + '</small><em>' + ago(x.at) + '</em></span></button>';
    }).join('');
    qsa('.rr-n', box).forEach(function (b) {
      b.onclick = function () {
        if (b.classList.contains('new')) { api('POST', '/notifications/read', { ids: [b.dataset.id] }).then(function () { NT.unread = Math.max(0, NT.unread - 1); badge(); }); b.classList.remove('new'); }
        if (b.dataset.j) { closeMenu(); jobModal(b.dataset.j); }
      };
    });
  }

  /* ---------- ราคาน้ำมันอัตโนมัติ ---------- */
  var FU = { data: null, pref: ls('rr.fuelpref') || { auto: true, brand: 'ptt' }, applying: false, timer: 0 };
  function fuelLoad(force) {
    d.documentElement.classList.toggle('rr-on', S.online !== false);
    clearTimeout(FU.timer);
    return fetch(API + '/fuel' + (force ? '?t=' + Date.now() : '')).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then(function (j) {
      S.online = true; d.documentElement.classList.add('rr-on'); FU.data = j; fuelApply(); fuelUI(); renderAcct();
    }, function () { S.online = false; d.documentElement.classList.remove('rr-on'); renderAcct(); fuelUI(); })
      .then(function () { FU.timer = setTimeout(fuelLoad, 30 * 60000); });
  }
  d.addEventListener('visibilitychange', function () { if (!d.hidden && FU.data && Date.now() - (FU.data.checkedAt || 0) > 30 * 60000) fuelLoad(); });
  function pick(f) {
    var D = FU.data; if (!D) return null;
    if (FU.pref.brand !== 'cheapest') { var b = D.brands[FU.pref.brand]; if (b && b.prices[f] != null) return { brand: FU.pref.brand, price: b.prices[f] }; }
    return D.cheapest[f] || null;
  }
  function fuelApply() {
    if (!FU.pref.auto || !FU.data) return;
    var map = FU.data.appMap || { d: 'diesel', g: 'g95', e20: 'e20' }, any = false;
    FU.applying = true;
    try {
      Object.keys(map).forEach(function (k) {
        var inp = $('fp-' + k), p = pick(map[k]);
        if (!inp || !p) return;
        if (Math.abs((+inp.value || 0) - p.price) < 0.001) return;
        inp.value = p.price; inp.dispatchEvent(new Event('input', { bubbles: true })); any = true;
      });
      var dt = $('fp-date');
      if (dt && FU.data.date && (any || dt.value !== FU.data.date)) { dt.value = FU.data.date; dt.dispatchEvent(new Event('change', { bubbles: true })); }
    } finally { FU.applying = false; }
  }
  // ผู้ใช้พิมพ์ราคาเองในช่องเดิม → หยุดอัปเดตอัตโนมัติ (กดกลับมาใช้อัตโนมัติได้)
  ['d', 'g', 'e20'].forEach(function (k) {
    var inp = $('fp-' + k); if (!inp) return;
    inp.addEventListener('input', function (e) { if (FU.applying || !e.isTrusted || !FU.pref.auto) return; FU.pref.auto = false; ls('rr.fuelpref', FU.pref); fuelUI(); });
  });
  var rs = $('fp-reset'); if (rs) rs.addEventListener('click', function () { setTimeout(fuelApply, 50); });
  function brandName(b) { return (FU.data && FU.data.names.brands[b]) || b; }
  function fuelUI() {
    // บนหน้าแรก: ลิงก์เทียบทุกปั๊ม + สถานะอัปเดตอัตโนมัติ
    var fe = $('fh-edit');
    if (fe && !$('rr-fcmp')) {
      var a = el('a', 'rr-fcmp'); a.id = 'rr-fcmp'; a.href = '#'; a.textContent = 'เทียบทุกปั๊ม';
      a.onclick = function (e) { e.preventDefault(); fuelModal(); };
      fe.parentNode.insertBefore(d.createTextNode(' · '), fe.nextSibling); fe.parentNode.insertBefore(a, fe.nextSibling.nextSibling);
    }
    var live = $('rr-flive');
    if (!live && fe) { live = el('span', 'rr-flive'); live.id = 'rr-flive'; var em = fe.closest('em') || fe.parentNode; em.parentNode.insertBefore(live, em.nextSibling); }
    if (live) {
      var D = FU.data;
      if (!D) live.innerHTML = S.online === false ? '' : '<i></i>กำลังโหลดราคาวันนี้…';
      else live.innerHTML = '<i class="' + (FU.pref.auto && !D.stale ? 'on' : '') + '"></i>' + (FU.pref.auto ? 'ราคาอัตโนมัติ · ' + esc(FU.pref.brand === 'cheapest' ? 'ปั๊มที่ถูกที่สุด' : brandName(FU.pref.brand)) : 'ใช้ราคาที่แก้เอง') + (D.updatedAt ? ' · อัปเดต ' + ago(D.updatedAt) : '');
      live.hidden = S.online === false;
    }
    // ในหน้าวางแผน > ราคาเชื้อเพลิง
    var fs = $('fuelset'), box = $('rr-fset');
    if (fs && !box) {
      box = el('div', 'rr-fset'); box.id = 'rr-fset';
      var set = qs('.set', fs); if (set) fs.insertBefore(box, set); else fs.appendChild(box);
    }
    if (box) {
      if (S.online === false || !FU.data) { box.hidden = S.online === false; box.innerHTML = '<p class="rr-note">กำลังโหลดราคาน้ำมันวันนี้…</p>'; return; }
      box.hidden = false;
      var opts = '<option value="cheapest">ปั๊มที่ถูกที่สุดในวันนั้น</option>' + BRAND_ORDER.filter(function (b) { return FU.data.brands[b]; }).map(function (b) { return '<option value="' + b + '">' + esc(brandName(b)) + '</option>'; }).join('');
      box.innerHTML = '<label class="rr-sw"><input type="checkbox" id="rr-fauto"' + (FU.pref.auto ? ' checked' : '') + '><span></span>อัปเดตราคาอัตโนมัติ</label>' +
        '<label class="rr-fb">ใช้ราคาของ <select id="rr-fbrand">' + opts + '</select></label>' +
        '<button type="button" class="rr-btn sm" id="rr-fopen">' + ic('fuel') + 'เทียบราคาทุกปั๊ม</button>' +
        '<p class="rr-note">' + (FU.data.updatedAt ? 'ราคาล่าสุด ' + new Date(FU.data.updatedAt).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + ' น.' : 'ยังไม่มีข้อมูลราคา') + (FU.data.stale ? ' · ⚠️ แหล่งข้อมูลยังไม่อัปเดต ใช้ราคาล่าสุดที่มี' : '') + (FU.pref.auto ? '' : ' · ตอนนี้ใช้ราคาที่แก้เอง') + '</p>';
      $('rr-fbrand').value = FU.pref.brand;
      $('rr-fauto').onchange = function () { FU.pref.auto = this.checked; ls('rr.fuelpref', FU.pref); fuelApply(); fuelUI(); };
      $('rr-fbrand').onchange = function () { FU.pref.brand = this.value; FU.pref.auto = true; ls('rr.fuelpref', FU.pref); fuelApply(); fuelUI(); };
      $('rr-fopen').onclick = fuelModal;
    }
  }
  function fuelModal() {
    var D = FU.data;
    if (!D) { toast(S.online === false ? 'ยังเชื่อมระบบหลังบ้านไม่ได้' : 'กำลังโหลดราคา…'); return; }
    var brands = BRAND_ORDER.filter(function (b) { return D.brands[b]; });
    var fuels = FUEL_ORDER.filter(function (f) { return brands.some(function (b) { return D.brands[b].prices[f] != null; }); });
    var head = '<tr><th>ชนิดน้ำมัน</th>' + brands.map(function (b) { return '<th><button type="button" class="rr-usebrand' + (FU.pref.auto && FU.pref.brand === b ? ' on' : '') + '" data-b="' + b + '" title="ใช้ราคาปั๊มนี้คำนวณค่าน้ำมัน">' + esc(brandName(b)) + (D.brands[b].stale ? ' <small>(ราคาเก่า)</small>' : '') + '</button></th>'; }).join('') + '</tr>';
    var body = fuels.map(function (f) {
      var ch = D.cheapest[f];
      return '<tr><th>' + esc(D.names.fuels[f]) + '</th>' + brands.map(function (b) {
        var B = D.brands[b], v = B.prices[f], t = B.tomorrow && B.tomorrow[f];
        if (v == null) return '<td class="na">–</td>';
        var best = ch && ch.brand === b, arrow = t != null && t !== v ? '<small class="' + (t > v ? 'up' : 'dn') + '">พรุ่งนี้ ' + money(t) + (t > v ? ' ▲' : ' ▼') + '</small>' : '';
        return '<td class="' + (best ? 'best' : '') + '">' + money(v) + (B.src && B.src[f] === 'manual' ? '<sup title="แอดมินกรอก">*</sup>' : '') + arrow + '</td>';
      }).join('') + '</tr>';
    }).join('');
    var src = Object.keys(D.sources || {}).filter(function (k) { return D.sources[k].ok !== null; }).map(function (k) { var s = D.sources[k]; return '<span class="rr-src ' + (s.ok ? 'ok' : s.ok === false ? 'bad' : '') + '">' + esc(D.names.sources[k] || k) + ': ' + (s.ok ? 'ปกติ' : s.ok === false ? 'ดึงไม่ได้' : esc(s.note || '-')) + '</span>'; }).join('');
    var m = modal('ราคาน้ำมันวันนี้ ทุกปั๊ม', '<p class="rr-note">ช่องสีเขียว = ถูกที่สุดของชนิดนั้น · กดชื่อปั๊มเพื่อใช้ราคาปั๊มนั้นคำนวณค่าน้ำมัน · ราคากรุงเทพฯ ต่างจังหวัดอาจต่างกันเล็กน้อยตามค่าขนส่ง</p>' +
      '<div class="rr-tw"><table class="rr-t rr-fuel">' + head + body + '</table></div>' +
      '<div class="rr-row"><button type="button" class="rr-btn" id="rr-fcheap">' + ic('check') + 'ใช้ปั๊มที่ถูกที่สุด</button><span class="rr-meta">อัปเดต ' + (D.updatedAt ? ago(D.updatedAt) : '-') + ' · ระบบดึงราคาใหม่ทุกชั่วโมง</span></div><p class="rr-srcs">' + src + '</p>', { icon: 'fuel', wide: true });
    function use(b) { FU.pref = { auto: true, brand: b }; ls('rr.fuelpref', FU.pref); fuelApply(); fuelUI(); closeModal(); toast('คำนวณค่าน้ำมันด้วยราคา' + (b === 'cheapest' ? 'ปั๊มที่ถูกที่สุด' : brandName(b)) + 'แล้ว', 'ok'); }
    qsa('.rr-usebrand', m.el).forEach(function (b) { b.onclick = function () { use(b.dataset.b); }; });
    $('rr-fcheap').onclick = function () { use('cheapest'); };
  }

  /* ---------- เริ่มทำงาน ---------- */
  function start() {
    mountBar();
    d.documentElement.classList.toggle('rr-in', !!S.user);
    fuelUI(); fuelLoad();
    if (S.user) {
      api('GET', '/auth/me').then(function (r) { S.user = r.user; ls('rr.user', r.user); renderAcct(); syncAll(); runWatch(true); notifStart(); }, function () {});
    }
  }
  // รอธีมสร้างแถบหัวก่อน (ถ้ามี)
  function ready() { if (qs('#sk-topbar') || Date.now() - t0 > 2500) safe(start); else setTimeout(ready, 120); }
  var t0 = Date.now();
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', ready); else ready();
})();
