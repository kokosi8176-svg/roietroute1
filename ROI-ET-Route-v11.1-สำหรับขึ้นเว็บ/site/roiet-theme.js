/* =====================================================================
   ROI ET ROUTE — Premium Logistics Dashboard (ธีม v5)
   - แยกแต่ละเมนูเป็นหน้าของตัวเอง (ไม่เลื่อนลง) พร้อมการเปลี่ยนหน้าแบบนุ่มนวล
   - กราฟและเครื่องมือเพิ่มในแต่ละหน้า, ลูกเล่นแผนที่, แอนิเมชันทั่วทั้งเว็บ
   หลักการ: อ่านค่าจากหน้าเว็บเดิมและ window.RP (ข้อมูลที่เว็บเดิมบันทึกไว้) แบบอ่านอย่างเดียว
   ไม่เรียก/ไม่แก้ฟังก์ชันคำนวณ ไม่เขียนข้อมูล ถ้าส่วนไหนหาไม่เจอจะข้ามไปโดยไม่ทำให้เว็บเดิมพัง
   ===================================================================== */
(function () {
  'use strict';
  if (window.__roietTheme) return;
  window.__roietTheme = 2;

  var d = document, W = window;
  var RM = false;
  try { RM = W.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  /* ---------------- เครื่องมือเล็กๆ ---------------- */
  function $(id) { return d.getElementById(id); }
  function qs(s, r) { return (r || d).querySelector(s); }
  function qsa(s, r) { return [].slice.call((r || d).querySelectorAll(s)); }
  function el(tag, cls, html) { var e = d.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function ic(n) { return '<svg class="ic" aria-hidden="true"><use href="#i-' + n + '"/></svg>'; }
  function txt(n) { return n ? (n.textContent || '').replace(/\s+/g, ' ').trim() : ''; }
  function num(s) { var m = String(s == null ? '' : s).replace(/,/g, '').match(/-?\d+(\.\d+)?/); return m ? parseFloat(m[0]) : NaN; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function safe(fn) { try { return fn(); } catch (e) { if (W.console) console.warn('[roiet-theme]', e); } }
  function fmt(v, dg) { if (!isFinite(v)) return '–'; dg = dg || 0; return Number(v).toLocaleString('th-TH', { minimumFractionDigits: dg, maximumFractionDigits: dg }); }
  function short(v) { v = +v || 0; var a = Math.abs(v); return a >= 1e6 ? fmt(v / 1e6, 1) + 'M' : a >= 1e4 ? fmt(v / 1e3, 0) + 'k' : a >= 1e3 ? fmt(v / 1e3, 1) + 'k' : fmt(v, a < 10 && v % 1 ? 1 : 0); }
  function split(s) { var m = String(s || '').match(/^(.*?[\d,.]+)\s*(.*)$/); return m ? [m[1], m[2]] : [String(s || ''), '']; }
  function mins(s) { var h = /(\d+)\s*ชม/.exec(s), m = /(\d+)\s*นาที/.exec(s); return h || m ? (h ? +h[1] * 60 : 0) + (m ? +m[1] : 0) : num(s); }
  function later(fn, ms) { return setTimeout(function () { safe(fn); }, ms || 0); }
  function debounce(fn, ms) { var t = 0; return function () { clearTimeout(t); t = setTimeout(function () { safe(fn); }, ms); }; }
  function decimals(s) { var m = String(s).match(/\.(\d+)/); return m ? m[1].length : 0; }

  /* ---------------- ข้อมูลที่เว็บเดิมบันทึกไว้ (อ่านอย่างเดียว) ---------------- */
  function store(k) {
    try { if (W.RP && typeof W.RP.get === 'function') { var v = W.RP.get(k); if (v != null) return v; } } catch (e) {}
    try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; }
  }
  function hist() { var h = store('roiet.hist'); return Array.isArray(h) ? h.filter(function (x) { return x && /^\d{4}-\d{2}-\d{2}$/.test(x.date); }) : []; }
  function accs() { var a = store('roiet.acc'); return Array.isArray(a) ? a.filter(function (x) { return x && +x.ak > 0 && +x.pk > 0; }) : []; }
  function favs() { var f = store('roiet.fav'); return Array.isArray(f) ? f : []; }
  function dk(t) { return t.getFullYear() + '-' + ('0' + (t.getMonth() + 1)).slice(-2) + '-' + ('0' + t.getDate()).slice(-2); }
  function pd(k) { var p = String(k).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function addD(t, n) { var x = new Date(t.getTime()); x.setDate(x.getDate() + n); return x; }
  function thd(t, o) { try { return t.toLocaleDateString('th-TH', o); } catch (e) { return dk(t); } }
  function sumE(es, k) { return es.reduce(function (s, x) { return s + (+x[k] || 0); }, 0); }
  function allEntries() { return hist().reduce(function (a, day) { return a.concat((day.entries || []).map(function (x) { return { d: day.date, x: x }; })); }, []); }

  // รวมประวัติเป็นช่วงๆ (วัน/สัปดาห์/เดือน) ตามช่วงเวลาที่เลือก
  function buckets(rangeDays) {
    var H = hist(), today = new Date(); today.setHours(0, 0, 0, 0);
    var by = {}; H.forEach(function (x) { by[x.date] = (by[x.date] || []).concat(x.entries || []); });
    var start;
    if (rangeDays) start = addD(today, -(rangeDays - 1));
    else { var ks = Object.keys(by).sort(); start = ks.length ? pd(ks[0]) : addD(today, -6); if (start > today) start = today; }
    var span = Math.round((today - start) / 864e5) + 1, unit = span <= 31 ? 'day' : span <= 210 ? 'week' : 'month', out = [], cur = null;
    for (var i = 0; i < span; i++) {
      var t = addD(start, i), key = unit === 'day' ? dk(t) : unit === 'week' ? 'w' + Math.floor(i / 7) : t.getFullYear() + '-' + t.getMonth();
      if (!cur || cur.key !== key) { cur = { key: key, from: t, to: t, es: [] }; out.push(cur); }
      cur.to = t; cur.es = cur.es.concat(by[dk(t)] || []);
    }
    out.forEach(function (b) {
      b.n = b.es.length; b.km = sumE(b.es, 'km'); b.kmB = sumE(b.es, 'kmBefore'); b.cost = sumE(b.es, 'total'); b.fuel = sumE(b.es, 'fuelCost'); b.save = sumE(b.es, 'saveDay');
      b.ok = b.es.reduce(function (s, x) { return s + (x.run ? +x.run.ok || 0 : 0); }, 0);
      b.lab = unit === 'month' ? thd(b.from, { month: 'short', year: '2-digit' }) : thd(b.from, { day: 'numeric', month: 'short' });
      b.tip = unit === 'day' ? thd(b.from, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : unit === 'week' ? thd(b.from, { day: 'numeric', month: 'short' }) + ' – ' + thd(b.to, { day: 'numeric', month: 'short', year: 'numeric' }) : thd(b.from, { month: 'long', year: 'numeric' });
    });
    return { unit: unit, b: out, es: out.reduce(function (a, b) { return a.concat(b.es); }, []) };
  }

  /* ---------------- กราฟ SVG ขนาดเล็ก (มีแอนิเมชัน) ---------------- */
  var CID = 0;
  function niceMax(v) { if (!(v > 0)) return 1; var p = Math.pow(10, Math.floor(Math.log(v) / Math.LN10)), n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p; }
  function grad(id, c) { return '<linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + c[0] + '"/><stop offset="1" stop-color="' + c[1] + '"/></linearGradient>'; }
  function frameOf(host, h) { var w = Math.max(260, Math.round(host.clientWidth || host.getBoundingClientRect().width || 600)); return { w: w, h: h, l: 48, r: 12, t: 14, b: 30 }; }
  function axes(F, max) {
    var s = '';
    for (var g = 0; g <= 4; g++) { var y = F.t + (F.h - F.t - F.b) * (1 - g / 4); s += '<line class="sk-grid" x1="' + F.l + '" x2="' + (F.w - F.r) + '" y1="' + y.toFixed(1) + '" y2="' + y.toFixed(1) + '"/><text class="sk-ax" x="' + (F.l - 8) + '" y="' + (y + 4).toFixed(1) + '" text-anchor="end">' + short(max * g / 4) + '</text>'; }
    return s;
  }
  function xlabels(F, labels, gw) {
    var step = Math.max(1, Math.ceil(labels.length / Math.max(1, Math.floor((F.w - F.l - F.r) / 52)))), s = '';
    labels.forEach(function (lb, i) { if (i % step === 0) s += '<text class="sk-ax" x="' + (F.l + gw * i + gw / 2).toFixed(1) + '" y="' + (F.h - 9) + '" text-anchor="middle">' + esc(lb) + '</text>'; });
    return s;
  }
  function tipText(title, sets, i, f) { return '<b>' + esc(title) + '</b>' + sets.map(function (st) { return '\n' + esc(st.name) + ': ' + esc(f ? f(st.v[i] || 0) : fmt(st.v[i] || 0)); }).join(''); }
  // กราฟแท่งแบบกลุ่ม: sets = [{name, c:[บน,ล่าง], v:[]}]
  function barChart(host, labels, sets, o) {
    o = o || {}; var F = frameOf(host, o.h || 230), id = 'skc' + (++CID);
    var max = 4 * niceMax(Math.max.apply(0, sets.reduce(function (a, st) { return a.concat(st.v); }, [0])) * 1.08 / 4);
    var n = Math.max(1, labels.length), gw = (F.w - F.l - F.r) / n, ns = sets.length, bw = Math.max(3, Math.min(24, gw * 0.7 / ns)), gap = Math.min(4, bw * 0.3), ih = F.h - F.t - F.b;
    var s = '<svg class="sk-svg" viewBox="0 0 ' + F.w + ' ' + F.h + '" role="img" aria-label="' + esc(o.label || '') + '"><defs>' + sets.map(function (st, j) { return grad(id + j, st.c); }).join('') + '</defs>' + axes(F, max);
    labels.forEach(function (lb, i) {
      var x0 = F.l + gw * i + (gw - (bw * ns + gap * (ns - 1))) / 2;
      sets.forEach(function (st, j) {
        var v = +st.v[i] || 0, bh = ih * v / max; if (bh <= 0) return;
        s += '<rect class="sk-bar" style="--d:' + Math.min(900, i * 28 + j * 70) + 'ms" x="' + (x0 + j * (bw + gap)).toFixed(1) + '" y="' + (F.h - F.b - bh).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + bh.toFixed(1) + '" rx="' + Math.min(5, bw / 2).toFixed(1) + '" fill="url(#' + id + j + ')"/>';
      });
      s += '<rect class="sk-hit" x="' + (F.l + gw * i).toFixed(1) + '" y="' + F.t + '" width="' + gw.toFixed(1) + '" height="' + ih + '" data-tip="' + esc(tipText(o.tips ? o.tips[i] : lb, sets, i, o.fmt)) + '"/>';
    });
    host.innerHTML = s + xlabels(F, labels, gw) + '</svg>' + legend(sets);
  }
  // กราฟเส้น/พื้นที่: sets = [{name, c:'#hex', v:[], area:true}]
  function lineChart(host, labels, sets, o) {
    o = o || {}; var F = frameOf(host, o.h || 230), id = 'skc' + (++CID);
    var max = 4 * niceMax(Math.max.apply(0, sets.reduce(function (a, st) { return a.concat(st.v); }, [0])) * 1.1 / 4);
    var n = Math.max(1, labels.length), gw = (F.w - F.l - F.r) / n, ih = F.h - F.t - F.b, base = F.h - F.b;
    function pts(st) { return st.v.map(function (v, i) { return [F.l + gw * i + gw / 2, base - ih * (+v || 0) / max]; }); }
    function path(p) {
      if (!p.length) return '';
      if (p.length < 3) return 'M' + p.map(function (q) { return q[0].toFixed(1) + ' ' + q[1].toFixed(1); }).join(' L');
      var s = 'M' + p[0][0].toFixed(1) + ' ' + p[0][1].toFixed(1);
      for (var i = 0; i < p.length - 1; i++) {
        var p0 = p[i - 1] || p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] || p2;
        var c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = Math.min(base, p1[1] + (p2[1] - p0[1]) / 6), c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = Math.min(base, p2[1] - (p3[1] - p1[1]) / 6);
        s += ' C' + c1x.toFixed(1) + ' ' + c1y.toFixed(1) + ' ' + c2x.toFixed(1) + ' ' + c2y.toFixed(1) + ' ' + p2[0].toFixed(1) + ' ' + p2[1].toFixed(1);
      }
      return s;
    }
    var s = '<svg class="sk-svg" viewBox="0 0 ' + F.w + ' ' + F.h + '" role="img" aria-label="' + esc(o.label || '') + '"><defs>' + sets.map(function (st, j) { return grad(id + j, [st.c + '55', st.c + '00']); }).join('') + '</defs>' + axes(F, max);
    sets.forEach(function (st, j) {
      var p = pts(st), dd = path(p); if (!dd) return;
      if (st.area) s += '<path class="sk-area" d="' + dd + ' L' + p[p.length - 1][0].toFixed(1) + ' ' + base + ' L' + p[0][0].toFixed(1) + ' ' + base + ' Z" fill="url(#' + id + j + ')"/>';
      s += '<path class="sk-line" d="' + dd + '" stroke="' + st.c + '"' + (st.dash ? ' stroke-dasharray="6 6"' : '') + (st.glow ? ' style="filter:drop-shadow(0 3px 6px ' + st.c + '66)"' : '') + '/>';
      p.forEach(function (q, i) { if (n <= 45 && (+st.v[i] || 0) > 0) s += '<circle class="sk-dot" style="--d:' + Math.min(1200, 500 + i * 30) + 'ms" cx="' + q[0].toFixed(1) + '" cy="' + q[1].toFixed(1) + '" r="3.6" fill="#fff" stroke="' + st.c + '" stroke-width="2.2"/>'; });
    });
    labels.forEach(function (lb, i) { s += '<rect class="sk-hit" x="' + (F.l + gw * i).toFixed(1) + '" y="' + F.t + '" width="' + gw.toFixed(1) + '" height="' + ih + '" data-tip="' + esc(tipText(o.tips ? o.tips[i] : lb, sets, i, o.fmt)) + '"/>'; });
    host.innerHTML = s + xlabels(F, labels, gw) + '</svg>' + legend(sets.map(function (st) { return { name: st.name, c: [st.c, st.c] }; }));
    qsa('.sk-line', host).forEach(function (pth) { if (!pth.getAttribute('stroke-dasharray')) { try { pth.style.setProperty('--len', Math.ceil(pth.getTotalLength())); } catch (e) {} } });
  }
  function legend(sets) { return '<div class="sk-legend">' + sets.map(function (st) { return '<span><i style="background:linear-gradient(180deg,' + st.c[0] + ',' + st.c[1] + ')"></i>' + esc(st.name) + '</span>'; }).join('') + '</div>'; }
  // โดนัท: parts = [{name, v, c}]
  function donutSVG(parts, center, sub) {
    var r = 54, C = 2 * Math.PI * r, tot = parts.reduce(function (s, p) { return s + Math.max(0, p.v); }, 0), off = 0, s = '<svg viewBox="0 0 140 140" role="img"><circle cx="70" cy="70" r="' + r + '" fill="none" stroke="#eef1f5" stroke-width="16"/>';
    if (tot > 0) parts.forEach(function (p, i) { var len = C * Math.max(0, p.v) / tot; if (len <= 0) return; s += '<circle class="sk-arc" style="--d:' + (i * 180) + 'ms" cx="70" cy="70" r="' + r + '" fill="none" stroke="' + p.c + '" stroke-width="16" stroke-linecap="' + (parts.length > 1 ? 'butt' : 'round') + '" stroke-dasharray="' + len.toFixed(2) + ' ' + (C - len).toFixed(2) + '" stroke-dashoffset="' + (-off).toFixed(2) + '"/>'; off += len; });
    return s + '<text x="70" y="68" text-anchor="middle" style="font:600 18px var(--display);fill:#1b2b44">' + esc(center) + '</text><text x="70" y="88" text-anchor="middle" style="font:11px var(--body);fill:#7b8798">' + esc(sub || '') + '</text></svg>';
  }

  /* ---------------- ตัวเลขวิ่ง ---------------- */
  function countTo(node, target, unit) {
    var t = String(target), v = num(t), plain = /^-?[\d,]+(\.\d+)?$/.test(t.trim());
    function paint(x) { node.textContent = x; if (unit) { var sm = d.createElement('small'); sm.textContent = ' ' + unit; node.appendChild(sm); } }
    var from = node.__v, tok = (node.__tok || 0) + 1;
    node.__v = plain ? v : NaN; node.__tok = tok;
    if (RM || !plain || !isFinite(v) || from === v) { paint(t); return; }
    if (!isFinite(from)) from = 0;
    var dg = decimals(t), t0 = null, dur = 900;
    function step(ts) {
      if (tok !== node.__tok) return;
      if (t0 === null) t0 = ts;
      var k = Math.min(1, (ts - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      if (k >= 1) { paint(t); return; }
      paint(fmt(from + (v - from) * e, dg));
      W.requestAnimationFrame(step);
    }
    paint(fmt(from, dg));
    W.requestAnimationFrame(step);
  }

  /* ---------------- หน้าต่างๆ (router) ---------------- */
  var PAGES = {
    dashboard: { s: 'top', t: 'ภาพรวมระบบจัดส่ง', p: 'จัดการเส้นทางให้เป็นเรื่องง่าย ประหยัดเวลาและค่าใช้จ่าย', i: 'home' },
    planner: { s: 'plan', t: 'วางแผนเส้นทางจัดส่ง', p: 'เพิ่มจุดส่ง เลือกรถ และจัดลำดับเส้นทาง', i: 'route' },
    stats: { s: 'more', t: 'สถิติการจัดส่ง', p: 'ภาพรวมประสิทธิภาพและค่าใช้จ่ายในการจัดส่ง', i: 'chart' },
    history: { s: 'hist', t: 'ประวัติการจัดส่งของฉัน', p: 'รายการเส้นทางที่บันทึกไว้ ค้นหาและกรองได้', i: 'cal' },
    account: { s: 'acctsec', t: 'บัญชีและตั้งค่า', p: 'จัดการข้อมูลผู้ใช้และค่าพื้นฐานของระบบ', i: 'user' },
    accuracy: { s: 'acc', t: 'ตรวจสอบความแม่นยำ', p: 'เปรียบเทียบระยะทางที่คำนวณกับผลการเดินทางจริง', i: 'target' },
    about: { s: 'about', t: 'เกี่ยวกับข้อมูล', p: 'แหล่งข้อมูลและหลักการทำงานของ ROI ET ROUTE', i: 'info' }
  };
  var BY_S = {}; Object.keys(PAGES).forEach(function (k) { BY_S[PAGES[k].s] = k; });
  var VIEW = {}, cur = null, mapDirty = false, renderers = {};

  function viewOfHash(h) {
    h = String(h || '').replace(/^#/, '');
    if (PAGES[h]) return h;
    if (BY_S[h]) return BY_S[h];
    var t = h && $(h), v = t && t.closest && t.closest('.sk-view');
    return v ? v.getAttribute('data-v') : null;
  }
  function scrollTop0() { try { W.scrollTo({ top: 0, left: 0, behavior: 'instant' }); } catch (e) { W.scrollTo(0, 0); } }
  function openDetails(t) { for (var n = t; n; n = n.parentElement) { if (n.tagName === 'DETAILS') n.open = true; } }
  function flash(t) { if (!t) return; t.classList.remove('sk-flashbox'); void t.offsetWidth; t.classList.add('sk-flashbox'); later(function () { t.classList.remove('sk-flashbox'); }, 1700); }

  function go(v, o) {
    o = o || {};
    if (!VIEW[v]) v = 'dashboard';
    if (v !== cur) {
      if (cur && VIEW[cur]) VIEW[cur].classList.remove('on');
      var V = VIEW[v];
      qsa(':scope > *', V).forEach(function (c, i) { c.style.setProperty('--i', i); });
      V.classList.add('on');
      cur = v;
      d.documentElement.setAttribute('data-sk-view', v);
      safe(function () { sk6MapPlace(v); sk6Ind(); g7Switch(v); });
      topbar(v);
      menuActive();
      if (!o.noPush) { try { if (location.hash !== '#' + v) history.pushState({ skv: v }, '', '#' + v); } catch (e) { try { location.hash = v; } catch (e2) {} } }
      if (!o.keepScroll) scrollTop0();
      if (v === 'planner') { later(nudgeMap, 30); later(function () { nudgeMap(); if (mapDirty) { mapDirty = false; var fb = $('fitb'); if (fb) fb.click(); } flashRoute(); }, 520); }
      later(function () { renderView(v, true); }, 40);
      later(function () { safe(function () { g7Reveal(v); }); }, 140);
    }
    if (o.target) later(function () { openDetails(o.target); o.target.scrollIntoView({ block: 'center', behavior: RM ? 'auto' : 'smooth' }); if (o.flash !== false) flash(o.target); }, v === cur && !o.fresh ? 30 : 120);
  }
  var ANIM = true;
  function renderView(v, anim) {
    var r = renderers[v]; if (!r) return;
    var host = VIEW[v]; if (!host) return;
    if (!anim) host.classList.add('sk-noanim');
    ANIM = !!anim;
    safe(r);
    ANIM = true;
    if (!anim) later(function () { host.classList.remove('sk-noanim'); }, 50);
  }
  function nudgeMap() { try { W.dispatchEvent(new Event('resize')); } catch (e) {} }

  function topbar(v) {
    var P = PAGES[v], tb = $('sk-topbar'); if (!tb || !P) return;
    tb.querySelector('.sk-tb-ic').innerHTML = ic(P.i);
    tb.querySelector('h2').textContent = P.t;
    tb.querySelector('p').textContent = P.p;
    try { d.title = P.t + ' · ROI ET ROUTE'; } catch (e) {}
  }
  function menuActive() {
    var P = PAGES[cur]; if (!P) return;
    qsa('#menu a[data-s]').forEach(function (a) { var on = a.getAttribute('data-s') === P.s; if (a.classList.contains('on') !== on) a.classList.toggle('on', on); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    moveGlow(); safe(sk6Ind);
  }
  function moveGlow() {
    var g = $('sk-navglow'), m = $('menu'), a = m && m.querySelector('a.on'); if (!g || !a) return;
    var horiz = W.innerWidth <= 700;
    g.style.width = horiz ? a.offsetWidth + 'px' : '';
    g.style.right = horiz ? 'auto' : '';
    g.style.height = a.offsetHeight + 'px';
    g.style.transform = 'translate(' + (horiz ? a.offsetLeft : 0) + 'px,' + a.offsetTop + 'px)';
    g.classList.add('ready');
    if (horiz) { var left = a.offsetLeft - (m.clientWidth - a.offsetWidth) / 2; if (m.scrollTo) m.scrollTo({ left: left, behavior: RM ? 'auto' : 'smooth' }); else m.scrollLeft = left; }
  }

  /* ---------------- สร้างโครงหน้า ---------------- */
  function build() {
    var html = d.documentElement; html.classList.add('sk-on'); html.classList.add('sk6'); html.classList.add('sk7');
    var main = qs('main.wrap') || qs('main'); if (!main) return false;
    var plan = $('plan');

    // พื้นหลัง: ลายขิด + ภาพสถานที่ร้อยเอ็ด (ใช้ภาพเดิมของเว็บ)
    safe(function () {
      if ($('sk-bg')) return;
      var bg = el('div', 'sk-bg'); bg.id = 'sk-bg'; bg.setAttribute('aria-hidden', 'true');
      if (qs('.ph-img')) bg.appendChild(el('div', 'sk-bgphoto', '<i class="ph-img"></i>'));
      d.body.insertBefore(bg, d.body.firstChild); sk6Scene();
      var pr = el('div', 'sk-progress'); pr.id = 'sk-progress'; pr.setAttribute('aria-hidden', 'true'); d.body.appendChild(pr);
      var tip = el('div', 'sk-tip'); tip.id = 'sk-tip'; tip.setAttribute('role', 'tooltip'); d.body.appendChild(tip);
    });

    // Sidebar
    safe(function () {
      var w = qs('.topnav .wrap'), m = $('menu'); if (!w || !m) return;
      var logo = qs('.logo', w);
      if (logo && !qs('.sk-badge', w)) logo.insertAdjacentHTML('afterend', '<span class="sk-badge"><i></i>PREMIUM DASHBOARD</span>');
      if (!qs('.sk-sidefoot', w)) w.appendChild(el('div', 'sk-sidefoot', '<b>LOCAL ROUTE • ROI ET</b><small>วางแผนง่าย เส้นทางแม่นยำ ส่งถึงไว</small>'));
      if (!$('sk-navglow')) { var g = el('div', 'sk-navglow'); g.id = 'sk-navglow'; g.setAttribute('aria-hidden', 'true'); m.insertBefore(g, m.firstChild); }
      qsa('a[data-s]', m).forEach(function (a) { var v = BY_S[a.getAttribute('data-s')]; if (v) a.setAttribute('href', '#' + v); });
      sk6Nav();
    });

    // แถบหัวหน้า
    safe(function () {
      if ($('sk-topbar')) return;
      var tb = el('header', 'sk-topbar');
      tb.id = 'sk-topbar';
      tb.innerHTML = '<div class="sk-tb-ic"></div><div class="sk-tb-t" aria-live="polite"><small>SMART LOGISTICS PLATFORM · ROI ET</small><h2></h2><p></p></div><div class="sk-tb-r"><span class="sk-date">' + ic('cal') + '<span></span></span></div>';
      qs('.sk-date span', tb).textContent = thd(new Date(), { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
      main.insertBefore(tb, main.firstChild);
      var a = $('acct'); if (a) qs('.sk-tb-r', tb).appendChild(a);
    });

    // จัดส่วนต่างๆ เข้าหน้าของตัวเอง
    var views = el('div', 'sk-views'); views.id = 'sk-views';
    Object.keys(PAGES).forEach(function (k) { var v = el('section', 'sk-view'); v.setAttribute('data-v', k); v.setAttribute('aria-label', PAGES[k].t); VIEW[k] = v; views.appendChild(v); });
    var tb = $('sk-topbar');
    if (tb && tb.nextSibling) main.insertBefore(views, tb.nextSibling); else main.appendChild(views);

    var hero = qs('.phero');
    if (hero) VIEW.dashboard.appendChild(hero);
    var MAPID = { plan: 'planner', more: 'stats', hist: 'history', acc: 'accuracy', acctsec: 'account', about: 'about' };
    var last = 'dashboard';
    qsa(':scope > *', main).forEach(function (c) {
      if (c === tb || c === views) return;
      if (c.tagName === 'SCRIPT' || c.tagName === 'STYLE' || c.tagName === 'TEMPLATE') return;
      var v = MAPID[c.id];
      if (v) last = v;
      else if (c.classList.contains('feat') || c.id === 'sk-stats') v = 'dashboard';
      else v = last;
      VIEW[v].appendChild(c);
    });
    return true;
  }

  /* ---------------- Dashboard ---------------- */
  var S = {};
  function buildDashboard() {
    var V = VIEW.dashboard, hero = qs('.phero', V);
    if (!$('sk-stats')) {
      var box = el('section', 'sk-stats'); box.id = 'sk-stats'; box.setAttribute('aria-label', 'สรุปเส้นทางปัจจุบัน');
      [['stops', 'blue', 'pin', 'จุดส่งสินค้า', 'รายการในแผนนี้'], ['km', 'orange', 'route', 'ระยะทางรวม/รอบ', 'ตามเส้นทางที่จัดใหม่'], ['tm', 'violet', 'clock', 'เวลาโดยประมาณ', 'ต่อรอบ รวมเวลาแวะส่ง'], ['save', 'green', 'coins', 'ประหยัดค่าใช้จ่าย', 'เทียบกับเส้นทางก่อนจัด']].forEach(function (x) {
        var c = el('article', 'sk-stat ' + x[1], '<i>' + ic(x[2]) + '</i><div><span>' + x[3] + '</span><strong>–</strong><small class="sub"></small></div>');
        box.appendChild(c); S[x[0]] = { c: c, v: c.querySelector('strong'), s: c.querySelector('.sub'), d: x[4] };
      });
      if (hero && hero.nextSibling) V.insertBefore(box, hero.nextSibling); else V.appendChild(box);
      tilt(box);
    }
    var dash = el('div', 'sk-dash'); dash.id = 'sk-dash';
    dash.innerHTML =
      '<article class="sk-card" id="sk-trend"><div class="sk-ch">' + ic('chart') + '<h3>แนวโน้มการจัดส่ง 14 วันล่าสุด<small>จากประวัติที่บันทึกไว้</small></h3><div class="sk-seg" role="group" aria-label="เลือกตัวเลข"><button type="button" data-m="km" aria-pressed="true">ระยะทาง</button><button type="button" data-m="cost" aria-pressed="false">ค่าใช้จ่าย</button><button type="button" data-m="save" aria-pressed="false">ประหยัด</button></div></div><div class="sk-chart"></div></article>' +
      '<article class="sk-card" id="sk-costmix"><div class="sk-ch">' + ic('coins') + '<h3>ต้นทุนต่อวันของแผนนี้<small>จากผลคำนวณในหน้าวางแผน</small></h3></div><div class="sk-chart"></div></article>' +
      '<article class="sk-card" id="sk-ba"><div class="sk-ch">' + ic('swap') + '<h3>ก่อน vs หลังจัดเส้นทาง<small>เส้นทางปัจจุบัน</small></h3></div><div class="sk-chart"></div><button type="button" class="sk-link" data-go="stats">ดูวิเคราะห์ละเอียดในหน้าสถิติ ' + ic('arrow') + '</button></article>' +
      '<article class="sk-card" id="sk-mydata"><div class="sk-ch">' + ic('box') + '<h3>ข้อมูลของฉัน<small>เก็บในเบราว์เซอร์นี้ / บัญชีของคุณ</small></h3></div><div class="sk-tiles"></div><div class="sk-actions">' +
      '<button type="button" class="sk-act" data-go="planner">' + ic('route') + 'วางแผนเส้นทาง</button>' +
      '<button type="button" class="sk-act" data-open="impbox">' + ic('list') + 'นำเข้า Excel / CSV</button>' +
      '<button type="button" class="sk-act" data-click="drvbtn">' + ic('truck') + 'โหมดคนขับ</button>' +
      '<button type="button" class="sk-act" data-go="history">' + ic('cal') + 'ดูประวัติ</button></div></article>';
    var st = $('sk-stats');
    if (st && st.nextSibling) V.insertBefore(dash, st.nextSibling); else V.appendChild(dash);
    qs('#sk-trend .sk-seg').addEventListener('click', function (e) { var b = e.target.closest('button[data-m]'); if (!b) return; qsa('button', this).forEach(function (x) { x.setAttribute('aria-pressed', x === b); }); trendMetric = b.getAttribute('data-m'); safe(drawTrend); });
    safe(function () { sk6Hero(V); });
    renderers.dashboard = function () { if (ANIM) replayStats(); drawTrend(); drawCostMix(); drawBA(); drawMyData(); };
  }
  var trendMetric = 'km';
  function drawTrend() {
    var host = qs('#sk-trend .sk-chart'); if (!host) return;
    var B = buckets(14);
    if (!B.es.length) { host.innerHTML = emptyBox('chart', 'ยังไม่มีประวัติใน 14 วันล่าสุด', 'จัดเส้นทางแล้วกด "บันทึกลงประวัติวันนี้" กราฟจะขึ้นที่นี่อัตโนมัติ', '<button type="button" class="primary" data-go="planner">' + ic('route') + 'ไปหน้าวางแผน</button>'); return; }
    var L = B.b.map(function (b) { return b.lab; }), T = B.b.map(function (b) { return b.tip; });
    if (trendMetric === 'km') lineChart(host, L, [{ name: 'หลังจัด (กม.)', c: '#ff8a1f', v: B.b.map(function (b) { return b.km; }), area: true, glow: 1 }, { name: 'ก่อนจัด (กม.)', c: '#8796ad', v: B.b.map(function (b) { return b.kmB; }), dash: 1 }], { tips: T, fmt: function (v) { return fmt(v, 1) + ' กม.'; }, label: 'ระยะทางรายวัน' });
    else if (trendMetric === 'cost') barChart(host, L, [{ name: 'ต้นทุนรวม (บาท)', c: ['#4f7fc0', '#1d3a63'], v: B.b.map(function (b) { return b.cost; }) }, { name: 'ค่าน้ำมัน (บาท)', c: ['#ffc06a', '#f58a12'], v: B.b.map(function (b) { return b.fuel; }) }], { tips: T, fmt: function (v) { return fmt(v) + ' บาท'; }, label: 'ค่าใช้จ่ายรายวัน' });
    else lineChart(host, L, [{ name: 'ประหยัดได้ (บาท)', c: '#1f9d4c', v: B.b.map(function (b) { return b.save; }), area: true, glow: 1 }], { tips: T, fmt: function (v) { return fmt(v) + ' บาท'; }, label: 'เงินที่ประหยัดรายวัน' });
  }
  function resRows() {
    var o = {}; qsa('#res .kv').forEach(function (r) { var l = txt(qs('.kl', r)), b = txt(qs('b', r)); if (l) o[l] = b; }); return o;
  }
  function drawCostMix() {
    var host = qs('#sk-costmix .sk-chart'); if (!host) return;
    var R = resRows(), fuelK = Object.keys(R).filter(function (k) { return /^ค่า(น้ำมัน|ไฟ)ต่อวัน/.test(k); })[0], totK = Object.keys(R).filter(function (k) { return /^ต้นทุนรวมต่อวัน/.test(k); })[0];
    var fuel = num(R[fuelK]), tot = num(R[totK]);
    if (!isFinite(fuel) || !isFinite(tot) || tot <= 0) { host.innerHTML = emptyBox('coins', 'ยังไม่มีเส้นทาง', 'เลือกจุดส่งในหน้าวางแผน แล้วจะเห็นสัดส่วนต้นทุนที่นี่', '<button type="button" class="primary" data-go="planner">' + ic('route') + 'เริ่มวางแผน</button>'); return; }
    var other = Math.max(0, tot - fuel), ev = /ไฟ/.test(fuelK || '');
    host.innerHTML = '<div class="sk-donut">' + donutSVG([{ v: fuel, c: '#f58a12' }, { v: other, c: '#1d3a63' }], fmt(tot), 'บาท/วัน') +
      '<div class="sk-dlist"><div><i style="background:#f58a12"></i><span>' + (ev ? 'ค่าไฟ' : 'ค่าน้ำมัน') + '</span><b>' + fmt(fuel) + ' ฿ · ' + fmt(fuel / tot * 100) + '%</b></div>' +
      '<div><i style="background:#1d3a63"></i><span>ค่าแรง ซ่อม ทางด่วน</span><b>' + fmt(other) + ' ฿ · ' + fmt(other / tot * 100) + '%</b></div>' +
      Object.keys(R).filter(function (k) { return /ต่อเดือน|ต่อจุด/.test(k); }).slice(0, 3).map(function (k) { return '<div><i style="background:#e3e8ef"></i><span>' + esc(k.replace(/\s*\(.*\)/, '')) + '</span><b>' + esc(R[k]) + '</b></div>'; }).join('') + '</div></div>';
  }
  function vsPairs() {
    var more = $('more'); if (!more) return [];
    var A = qsa('.vs .cb .vr', more), B = qsa('.vs .ca .vr', more), out = [];
    A.forEach(function (r, i) { var b = B[i]; if (!b) return; out.push({ l: txt(qs('span', r)), a: txt(qs('b', r)), b: txt(qs('b', b)) }); });
    return out;
  }
  function drawBA() {
    var host = qs('#sk-ba .sk-chart'); if (!host) return;
    var P = vsPairs().filter(function (p) { return !/เที่ยว/.test(p.l); }).slice(0, 5);
    if (!P.length) { host.innerHTML = emptyBox('swap', 'ยังไม่มีผลเปรียบเทียบ', 'เลือกจุดส่งอย่างน้อย 2 จุดในหน้าวางแผน', ''); return; }
    host.innerHTML = '<div class="sk-cmprows">' + P.map(function (p, i) {
      var isT = /เวลา/.test(p.l), a = isT ? mins(p.a) : num(p.a), b = isT ? mins(p.b) : num(p.b), mx = Math.max(a, b) || 1, pc = a > 0 ? (a - b) / a * 100 : 0;
      var delta = Math.abs(pc) < 0.05 ? '<span class="sk-delta eq">เท่ากัน</span>' : '<span class="sk-delta' + (pc < 0 ? ' bad' : '') + '">' + (pc > 0 ? '−' : '+') + fmt(Math.abs(pc), 1) + '%</span>';
      return '<div class="sk-cmprow"><span>' + esc(p.l) + '</span><div class="sk-bars2"><i class="b" style="--w:' + (a / mx * 100).toFixed(1) + '%;--d:' + (i * 90) + 'ms"></i><i class="a" style="--w:' + (b / mx * 100).toFixed(1) + '%;--d:' + (i * 90 + 120) + 'ms"></i></div><div><b>' + esc(p.b) + '</b>' + delta + '</div></div>';
    }).join('') + '</div><div class="sk-legend"><span><i style="background:linear-gradient(90deg,#b9c4d4,#8796ad)"></i>ก่อนจัด</span><span><i style="background:linear-gradient(90deg,#ffc06a,#f58a12)"></i>หลังจัด</span></div>';
  }
  function drawMyData() {
    var host = qs('#sk-mydata .sk-tiles'); if (!host) return;
    var H = hist(), E = allEntries(), A = accs(), F = favs();
    host.innerHTML = tile('cal', 'ประวัติที่บันทึก', fmt(H.length), 'วัน · ' + fmt(E.length) + ' เส้นทาง') + tile('star', 'ร้านประจำ', fmt(F.length), 'ร้าน') + tile('target', 'ผลทดสอบความแม่นยำ', fmt(A.length), 'ครั้ง') + tile('fuel', 'ราคาน้ำมันอ้างอิง', txt($('fh-d')) || '–', 'ดีเซล · ' + (txt($('fh-date')) || ''));
  }
  function tile(i, l, v, e) { return '<div class="sk-tile">' + ic(i) + '<small>' + esc(l) + '</small><b>' + esc(v) + '</b><em>' + esc(e) + '</em></div>'; }
  function emptyBox(i, t, p, act) { return '<div class="sk-empty">' + ic(i) + '<b>' + esc(t) + '</b><span>' + esc(p) + '</span>' + (act || '') + '</div>'; }

  // การ์ดตัวเลข: เอียงตามเมาส์ + แสงสะท้อน
  function tilt(root) {
    if (RM || !W.matchMedia || !W.matchMedia('(hover:hover)').matches) return;
    root.addEventListener('pointermove', function (e) {
      var c = e.target.closest('.sk-stat'); if (!c) return;
      var r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      c.style.setProperty('--rx', ((x - 0.5) * 8).toFixed(2) + 'deg'); c.style.setProperty('--ry', ((0.5 - y) * 8).toFixed(2) + 'deg');
      c.style.setProperty('--gx', (x * 100).toFixed(1) + '%'); c.style.setProperty('--gy', (y * 100).toFixed(1) + '%');
    });
    root.addEventListener('pointerout', function (e) { var c = e.target.closest('.sk-stat'); if (c && !c.contains(e.relatedTarget)) { c.style.setProperty('--rx', '0deg'); c.style.setProperty('--ry', '0deg'); } });
  }

  /* ---------------- หน้าวางแผน + ลูกเล่นแผนที่ ---------------- */
  var C = null, LIVE = null, LOADER = null;
  function buildPlanner() {
    var viz = qs('.viz'); if (!viz) return;
    var tabs = qs('.tabs', viz);
    if (tabs && !qs('.sk-vizhead', viz)) {
      var h = el('div', 'sk-vizhead', '<div class="sk-vt">' + ic('map') + '<div><h2>แผนที่เส้นทางจัดส่ง</h2><p>แผนที่ถนนจริง จ.ร้อยเอ็ด · ซูม เลื่อน และกดหมุดเพื่อดูรายละเอียด</p></div></div>');
      viz.insertBefore(h, viz.firstChild); h.appendChild(tabs);
    }
    if (!$('sk-cmp')) {
      C = el('div', 'sk-cmp', '<div><small>ก่อนจัดเส้นทาง</small><strong data-k="a">–</strong><span data-k="an"></span></div><b class="arr" aria-hidden="true">››</b><div class="after"><small>หลังจัดเส้นทาง</small><strong data-k="b">–</strong><span>เส้นทางที่เว็บจัดให้</span></div><div class="save"><small>ระยะทางสั้นลง</small><strong data-k="p">–</strong></div>');
      C.id = 'sk-cmp'; C.hidden = true;
      var panes = qsa('.tabpane', viz), last = panes[panes.length - 1];
      if (last && last.parentNode === viz) viz.insertBefore(C, last.nextSibling); else viz.appendChild(C);
    }
    var mv = $('movl');
    if (mv && !qs('.sk-movx', mv)) {
      mv.insertAdjacentHTML('afterbegin', '<div class="sk-live"><i></i>สรุปแบบเรียลไทม์</div>');
      LIVE = el('div', 'sk-movx', '<div><small>จุดส่ง</small><b data-k="n">–</b></div><div><small>ค่าน้ำมัน/วัน</small><b data-k="f">–</b></div><div><small>ประหยัด/เดือน</small><b data-k="s" class="g">–</b></div>');
      mv.appendChild(LIVE);
    }
    var wrap = qs('.mapwrap');
    if (wrap && !qs('.sk-loader', wrap)) { LOADER = el('div', 'sk-loader', '<span class="sk-spin"></span><span>กำลังจัดเส้นทาง…</span>'); LOADER.setAttribute('role', 'status'); wrap.appendChild(LOADER); }

    // รายละเอียดเมื่อกดหมุด (เติมข้อมูลจากตารางเส้นทางของเว็บเดิม)
    // เติมรายละเอียดก่อน Leaflet วัดขนาดป๊อปอัป เพื่อให้เลื่อนแผนที่ให้เห็นครบ
    safe(function () {
      var P = W.L && W.L.Popup && W.L.Popup.prototype;
      if (!P || P.__skPatched || typeof P._updateContent !== 'function') return;
      var orig = P._updateContent;
      P._updateContent = function () { var r = orig.apply(this, arguments); var self = this; safe(function () { if (self._container) enrichPopup(self._container); }); return r; };
      P.__skPatched = true;
    });
    var mapEl = $('m');
    if (mapEl && W.MutationObserver) {
      new MutationObserver(function (ms) {
        ms.forEach(function (m) {
          [].forEach.call(m.addedNodes, function (n) {
            if (n.nodeType !== 1) return;
            if (n.classList && n.classList.contains('leaflet-popup')) safe(function () { enrichPopup(n); });
            if (n.classList && n.classList.contains('leaflet-marker-icon')) { markerAnim(); decoMarkers(); }
          });
        });
      }).observe(mapEl, { childList: true, subtree: true });
    }
    var lg = $('legs'); if (lg && W.MutationObserver) new MutationObserver(decoMarkers).observe(lg, { childList: true, subtree: true });
    decoMarkers();
    // ลากสลับลำดับจุดส่ง: ไฮไลต์ตำแหน่งที่จะวาง (การสลับเป็นของเว็บเดิม)
    var ch = $('chips');
    if (ch) {
      ch.addEventListener('dragover', function (e) { var c = e.target.closest('.stopchip'); qsa('.stopchip.sk-over', ch).forEach(function (x) { if (x !== c) x.classList.remove('sk-over'); }); if (c && !c.classList.contains('drag')) c.classList.add('sk-over'); });
      ['dragleave', 'drop', 'dragend'].forEach(function (ev) { ch.addEventListener(ev, function (e) { if (ev !== 'dragleave' || !ch.contains(e.relatedTarget)) qsa('.stopchip.sk-over', ch).forEach(function (x) { x.classList.remove('sk-over'); }); }); });
    }
  }
  /* ---------------- แผนที่: ภาพดาวเทียม + มุมมองเอียงแบบมองโลก ----------------
     ใช้แผนที่เดิมของเว็บ (Leaflet) แค่เพิ่มชั้นภาพดาวเทียมไว้ล่างสุดและเอียงมุมมอง
     ตำแหน่งที่คลิกบนแผนที่ถูกแปลงกลับให้ตรงพิกัดจริงเสมอ */
  var MAPCFG = {
    // เปลี่ยนเป็นบริการภาพดาวเทียมอื่นได้ที่นี่ (ต้องเป็นรูปแบบ {z}/{y}/{x} หรือ {z}/{x}/{y})
    satUrl: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    satAttr: 'ภาพดาวเทียม © <a href="https://www.esri.com/" target="_blank" rel="noopener">Esri</a> · Source: Esri, Vantor, Earthstar Geographics, and the GIS User Community',
    satMaxNative: 18
  };
  var MAXB = null;
  var LMAP = null, SAT = null, TM = null, SAFE = { l: 0, t: 0, r: 0, b: 0 }, GEO = '', satErr = 0, satOkOnce = false, refitNext = true;
  var MM = { sat: true, tilt: true, eta: false, satOK: null };
  var IS3D = false;
  try { IS3D = !!(navigator.userAgentData && navigator.userAgentData.brands && navigator.userAgentData.brands.some(function (b) { return /Chromium/.test(b.brand); })); } catch (e) {}
  try { var mm0 = JSON.parse(localStorage.getItem('roiet.theme.map') || 'null'); if (mm0) { MM.sat = mm0.sat !== false; MM.tilt = mm0.tilt !== false; MM.eta = mm0.eta === true; } } catch (e) {}
  function mmSave() { try { localStorage.setItem('roiet.theme.map', JSON.stringify({ sat: MM.sat, tilt: MM.tilt, eta: MM.eta })); } catch (e) {} }

  function persp(px, py, d) { return new DOMMatrix([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, -1 / d, 0, 0, 0, 1]); }
  function buildTM(W, H, a, d, s, po) {
    var px = W / 2, py = H * po, ox = W / 2, oy = H;
    return new DOMMatrix().translate(px, py).multiply(persp(px, py, d)).translate(-px, -py).translate(ox, oy).rotate(a, 0, 0).scale(s, s).translate(-ox, -oy);
  }
  function unprojectM(M, sx, sy) {
    var a11 = M.m11 - sx * M.m14, a12 = M.m21 - sx * M.m24, b1 = sx * M.m44 - M.m41;
    var a21 = M.m12 - sy * M.m14, a22 = M.m22 - sy * M.m24, b2 = sy * M.m44 - M.m42;
    var det = a11 * a22 - a12 * a21; if (Math.abs(det) < 1e-9) return null;
    return [(b1 * a22 - a12 * b2) / det, (a11 * b2 - b1 * a21) / det];
  }
  function projectM(M, x, y) { var p = M.transformPoint(new DOMPoint(x, y, 0, 1)); return [p.x / p.w, p.y / p.w]; }

  function tiltGeom() {
    var m = $('m'), pane = LMAP && LMAP.getPane && LMAP.getPane('mapPane');
    if (!m || !pane) return;
    if (!MM.tilt || !W.DOMMatrix) {
      pane.style.rotate = ''; pane.style.scale = ''; pane.style.transformOrigin = '';
      m.style.perspective = ''; m.style.perspectiveOrigin = ''; m.style.removeProperty('--sk-ys');
      TM = null; SAFE = { l: 0, t: 0, r: 0, b: 0 }; GEO = 'flat'; return;
    }
    var Wd = m.clientWidth, Hd = m.clientHeight; if (!Wd || !Hd) return;
    var a = Wd < 640 ? 42 : 46, d = Math.max(1100, 1.6 * Math.max(Wd, Hd)), po = -0.3, s = 1, M = null;
    for (var k = 0; k < 60; k++) {
      M = buildTM(Wd, Hd, a, d, s, po);
      var ok = [[0, 0], [Wd, 0], [0, Hd], [Wd, Hd]].every(function (c) { var p = unprojectM(M, c[0], c[1]); return p && p[0] >= -1 && p[0] <= Wd + 1 && p[1] >= -1 && p[1] <= Hd + 1; });
      if (ok) break; s += 0.025;
    }
    TM = M;
    m.style.perspective = d + 'px'; m.style.perspectiveOrigin = (Wd / 2) + 'px ' + (Hd * po) + 'px';
    pane.style.transformOrigin = (Wd / 2) + 'px ' + Hd + 'px';
    pane.style.rotate = 'x ' + a + 'deg'; pane.style.scale = s.toFixed(3);
    m.style.setProperty('--sk-ys', (1 / Math.cos(a * Math.PI / 180)).toFixed(3));
    m.style.setProperty('--sk-tilt', a + 'deg');
    var tl = unprojectM(M, 0, 0), tr = unprojectM(M, Wd, 0), bl = unprojectM(M, 0, Hd), br = unprojectM(M, Wd, Hd);
    SAFE = { l: Math.max(0, tl[0], bl[0]), r: Math.max(0, Wd - Math.min(tr[0], br[0])), t: Math.max(0, tl[1], tr[1]), b: Math.max(0, Hd - Math.min(bl[1], br[1])) };
    var g = Wd + 'x' + Hd + '@' + a;
    if (g !== GEO) { GEO = g; if (refitNext) { refitNext = false; later(refit, 60); } }
    later(declutter, 120);
  }
  function refit() { var fb = $('fitb'); if (fb && (cur === 'planner' || cur === 'dashboard')) fb.click(); else refitNext = true; }

  function hookLeaflet() {
    var Lf = W.L; if (!Lf || !Lf.Map || Lf.Map.prototype.__sk) return;
    var MP = Lf.Map.prototype; MP.__sk = true;
    var inv = MP.invalidateSize;
    MP.invalidateSize = function () {
      var r = inv.apply(this, arguments);
      if (!LMAP && this._container && this._container.id === 'm') { LMAP = this; W.ROIET_THEME = { map: this, project: function (x, y) { return TM ? projectM(TM, x, y) : [x, y]; }, unproject: function (x, y) { return TM ? unprojectM(TM, x, y) : [x, y]; } }; safe(onMapReady); }
      if (this === LMAP) safe(tiltGeom);
      return r;
    };
    var m2c = MP.mouseEventToContainerPoint;
    MP.mouseEventToContainerPoint = function (e) {
      var p = m2c.apply(this, arguments);
      if (this === LMAP && MM.tilt && TM) { var q = unprojectM(TM, p.x, p.y); if (q) return Lf.point(q[0], q[1]); }
      return p;
    };
    var fit = MP.fitBounds;
    MP.fitBounds = function (b, o) {
      if (this === LMAP && MM.tilt && TM) {
        o = Lf.extend({}, o || {});
        var base = Lf.point(o.padding || [0, 0]), tl = Lf.point(o.paddingTopLeft || base), br = Lf.point(o.paddingBottomRight || base);
        o.paddingTopLeft = [tl.x + SAFE.l, tl.y + SAFE.t]; o.paddingBottomRight = [br.x + SAFE.r, br.y + SAFE.b]; delete o.padding;
        var bb = Lf.latLngBounds(b), tok = ++fitTok, self = this, done = false;
        var mz = o.maxZoom;
        var fix = function () { if (done || tok !== fitTok) return; done = true; safe(function () { centerOnScreen(bb, mz); }); };
        var r = fit.call(this, b, o);
        self.once('moveend', function () { later(fix, 40); });
        later(fix, 450);
        return r;
      }
      return fit.call(this, b, o);
    };
    // ป๊อปอัปในมุมเอียงจัดการเลื่อนเอง (คิดตามภาพที่เห็นจริง)
    var PP = Lf.Popup && Lf.Popup.prototype;
    if (PP && typeof PP._adjustPan === 'function' && !PP.__skPan) {
      var ap = PP._adjustPan; PP.__skPan = true;
      PP._adjustPan = function () { if (this._map && this._map === LMAP && MM.tilt && TM) return; return ap.apply(this, arguments); };
    }
  }
  var fitTok = 0;
  // หลังจัดให้เห็นทั้งเส้นทาง: เลื่อนให้กึ่งกลางเส้นทางอยู่กลางหน้าต่างตามภาพที่เห็นจริง
  function freeArea() {
    var m = $('m'), W0 = m.clientWidth, H0 = m.clientHeight, top = Math.max(78, Math.round(H0 * 0.18)), mv = $('movl');
    if (mv && !mv.hidden && W0 < 640) top = Math.max(top, mv.offsetTop + mv.offsetHeight + 46);
    return { l: 34, r: W0 - 34, t: top, b: H0 - 34, W: W0, H: H0 };
  }
  function screenBox(bb) {
    var pts = [bb.getNorthWest(), bb.getNorthEast(), bb.getSouthWest(), bb.getSouthEast()].map(function (ll) { var c = LMAP.latLngToContainerPoint(ll); return projectM(TM, c.x, c.y); });
    var xs = pts.map(function (p) { return p[0]; }), ys = pts.map(function (p) { return p[1]; });
    return { x0: Math.min.apply(0, xs), x1: Math.max.apply(0, xs), y0: Math.min.apply(0, ys), y1: Math.max.apply(0, ys) };
  }
  function centerOnScreen(bb, maxZ) {
    if (!LMAP || !TM || !MM.tilt) return;
    var A = freeArea(), aw = A.r - A.l, ah = A.b - A.t, z = LMAP.getZoom(), zmin = LMAP.getMinZoom(), zmax = Math.min(maxZ || 13, LMAP.getMaxZoom());
    for (var k = 0; k < 8; k++) {
      var B = screenBox(bb), bw = B.x1 - B.x0, bh = B.y1 - B.y0;
      if ((bw > aw || bh > ah) && z > zmin) { z = Math.max(zmin, z - 0.25); LMAP.setZoom(z, { animate: false }); continue; }
      if (bw < aw * 0.62 && bh < ah * 0.62 && z + 0.25 <= zmax) { z += 0.25; LMAP.setZoom(z, { animate: false }); var B2 = screenBox(bb); if (B2.x1 - B2.x0 > aw || B2.y1 - B2.y0 > ah) { z -= 0.25; LMAP.setZoom(z, { animate: false }); break; } continue; }
      break;
    }
    var F = screenBox(bb), cx = (F.x0 + F.x1) / 2, cy = (F.y0 + F.y1) / 2, tx = (A.l + A.r) / 2, ty = (A.t + A.b) / 2;
    if (Math.abs(cx - tx) < 3 && Math.abs(cy - ty) < 3) { later(declutter, 80); return; }
    var P1 = unprojectM(TM, cx, cy), P0 = unprojectM(TM, tx, ty); if (!P1 || !P0) return;
    LMAP.panBy([P1[0] - P0[0], P1[1] - P0[1]], { animate: true, duration: .5 });
  }


  function onMapReady() {
    var Lf = W.L;
    setTimeout(function () { safe(customWatch); }, 300);
    // หมุดฟ้า "+" ตอนแตะแผนที่เลือกพิกัด: กด × ที่ป้ายแล้วให้หมุดหายไปด้วย (เดิมปิดแค่ป้าย หมุดยังปักค้าง)
    LMAP.getContainer().addEventListener('click', function (e) {
      var btn = e.target && e.target.closest && e.target.closest('.leaflet-popup-close-button'); if (!btn) return;
      var pp = LMAP._popup, src = pp && pp._source, b = src && src._icon && qs('.pin > b', src._icon);
      if (!b || txt(b) !== '+') return;
      setTimeout(function () { safe(function () { LMAP.removeLayer(src); var cc = $('cc'); if (cc) cc.value = ''; }); }, 0);
    }, true);
    if (!LMAP.getPane('sksat')) LMAP.createPane('sksat').style.zIndex = 250;
    if (LMAP.options.maxBounds) MAXB = Lf.latLngBounds(LMAP.options.maxBounds);
    SAT = Lf.tileLayer(MAPCFG.satUrl, { pane: 'sksat', maxNativeZoom: MAPCFG.satMaxNative, maxZoom: 19, attribution: MAPCFG.satAttr, keepBuffer: 3, className: 'sk-sattile' });
    SAT.on('tileload', function () { if (MM.satOK !== true) { MM.satOK = true; satOkOnce = true; applyMapMode(); } });
    SAT.on('tileerror', function () { satErr++; if (MM.satOK !== true && satErr >= 3) { MM.satOK = false; applyMapMode(); mapToast('โหลดภาพดาวเทียมไม่ได้ในหน้านี้ จึงแสดงแผนที่ถนนแทน (ต้องต่ออินเทอร์เน็ต และเปิดจากเว็บจริงหรือไฟล์ในเครื่อง)'); } });
    var m = $('m');
    if (m && !qs('.sk-earth', m)) m.appendChild(el('div', 'sk-earth', '<i class="dof"></i><i class="hz"></i><i class="vig"></i>'));
    LMAP.on('zoomend moveend', function () { later(declutter, 30); });
    LMAP.on('popupopen', function (e) { e.popup.__skAgain = 0; later(function () { popupFit(e.popup); }, 40); });
    applyMapMode();
  }
  // ป๊อปอัปในมุมเอียง: ตั้งแกนปุ่มปิดให้ตรง และเลื่อนแผนที่ให้เห็นทั้งกล่อง
  function popupFit(pp) {
    var c = pp && pp.getElement && pp.getElement(); if (!c) return;
    var w = qs('.leaflet-popup-content-wrapper', c); if (w) c.style.setProperty('--sk-pcy', (w.offsetHeight + 19) + 'px');
    if (!MM.tilt || !TM || !LMAP) return;
    var mr = $('m').getBoundingClientRect(), r = (w || c).getBoundingClientRect(), pad = 12, dx = 0, dy = 0;
    if (r.top < mr.top + pad) dy = r.top - (mr.top + pad);
    else if (r.bottom > mr.bottom - pad) dy = r.bottom - (mr.bottom - pad);
    if (r.width > mr.width - 2 * pad) dx = (r.left + r.right) / 2 - (mr.left + mr.right) / 2;
    else if (r.left < mr.left + pad) dx = r.left - (mr.left + pad);
    else if (r.right > mr.right - pad) dx = r.right - (mr.right - pad);
    if (r.height > mr.height - 2 * pad) dy = r.top - (mr.top + pad);
    if (!dx && !dy) return;
    var a = LMAP.latLngToContainerPoint(pp.getLatLng()), sa = projectM(TM, a.x, a.y), Q = unprojectM(TM, sa[0] - dx, sa[1] - dy); if (!Q) return;
    LMAP.panBy([a.x - Q[0], a.y - Q[1]], { animate: true, duration: .4 });
    if (!pp.__skAgain) { pp.__skAgain = 1; LMAP.once('moveend', function () { later(function () { popupFit(pp); pp.__skAgain = 0; }, 60); }); }
  }
  var lastSatClass = null;
  function applyMapMode() {
    var m = $('m'); if (!m) return;
    var wantSat = MM.sat && MM.satOK !== false;
    if (LMAP && SAT) {
      if (wantSat && !LMAP.hasLayer(SAT)) SAT.addTo(LMAP);
      if (!wantSat && LMAP.hasLayer(SAT)) LMAP.removeLayer(SAT);
    }
    var satOn = wantSat && MM.satOK === true;
    m.classList.toggle('sk-sat', satOn);
    d.documentElement.classList.toggle('sk-satmode', satOn);
    m.classList.toggle('sk-tilt', MM.tilt);
    m.classList.toggle('sk-3d', MM.tilt && IS3D);
    m.classList.toggle('sk-eta', !!MM.eta);
    // มุมเอียงมองเห็นไกลกว่าเดิม จึงขยายขอบเขตการเลื่อนแผนที่ (มุมปกติใช้ขอบเขตเดิม)
    if (LMAP && MAXB) { var want = MM.tilt ? MAXB.pad(0.6) : MAXB, now = LMAP.options.maxBounds; if (!now || !now.equals(want)) LMAP.setMaxBounds(want); }
    qsa('.sk-mm button').forEach(function (b) {
      var k = b.getAttribute('data-mm'), on = k === 'sat' ? MM.sat && MM.satOK !== false : !!MM[k];
      b.setAttribute('aria-pressed', String(on));
      if (k === 'sat') b.title = MM.satOK === false ? 'โหลดภาพดาวเทียมไม่ได้ · กดเพื่อลองใหม่' : 'ภาพดาวเทียมจริง';
    });
    safe(tiltGeom);
    if (lastSatClass !== null && lastSatClass !== satOn) { var seg = qs('#vseg button[aria-pressed="true"]'); if (seg) seg.click(); }
    lastSatClass = satOn;
    later(declutter, 60);
  }
  var toastT = 0;
  function mapToast(t) {
    var w = qs('.mapwrap'); if (!w) return;
    var n = qs('.sk-maptoast', w); if (!n) { n = el('div', 'sk-maptoast'); n.setAttribute('role', 'status'); w.appendChild(n); }
    n.textContent = t; n.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(function () { n.classList.remove('on'); }, 4200);
  }
  function buildMapMode() {
    // ไอคอนเพิ่ม: ดาวเทียม และ 3D
    var sym = qs('symbol#i-map');
    if (sym && !$('i-sat')) sym.parentNode.insertAdjacentHTML('beforeend',
      '<symbol id="i-sat" viewBox="0 0 24 24"><path d="M13 7l4-4 4 4-4 4z"/><path d="M7 13l-4 4 4 4 4-4z"/><path d="M8.5 15.5l7-7"/><path d="M14 18a4 4 0 0 0 4-4"/><path d="M14 21.5A7.5 7.5 0 0 0 21.5 14"/></symbol>' +
      '<symbol id="i-cube" viewBox="0 0 24 24"><path d="M12 2l9 5v10l-9 5-9-5V7z"/><path d="M3 7l9 5 9-5"/><path d="M12 12v10"/></symbol>');
    var head = qs('.sk-vizhead');
    if (head && !qs('.sk-mm', head)) {
      var g = el('div', 'sk-mm', '<button type="button" data-mm="sat" aria-pressed="true" title="ภาพดาวเทียมจริง">' + ic('sat') + '<span>ดาวเทียม</span></button><button type="button" data-mm="tilt" aria-pressed="true" title="มุมมองเอียงแบบมองโลก">' + ic('cube') + '<span>มุมมอง 3D</span></button>' +
        '<button type="button" data-mm="eta" aria-pressed="false" title="แสดงเวลาถึงของทุกจุดบนแผนที่ (ปกติชี้ที่หมุดเพื่อดู)">' + ic('clock') + '<span>เวลาถึง</span></button>');
      g.setAttribute('role', 'group'); g.setAttribute('aria-label', 'รูปแบบแผนที่');
      var tabs = qs('.tabs', head); head.insertBefore(g, tabs || null);
      g.addEventListener('click', function (e) {
        var b = e.target.closest('button[data-mm]'); if (!b) return;
        var k = b.getAttribute('data-mm');
        if (k === 'sat' && MM.satOK === false) { MM.sat = true; MM.satOK = null; satErr = 0; }
        else MM[k] = !MM[k];
        if (k === 'tilt') { refitNext = true; GEO = ''; }
        mmSave(); applyMapMode();
        if (k === 'tilt') later(refit, 80);
      });
    }
    hookLeaflet();
    nudgeMap();
  }


  /* ---------------- หมุดตั้งบนพื้น + เงา + ป้ายเวลาถึง + ป้ายชื่อหลบกัน ---------------- */
  var decoT = 0;
  function decoMarkers() { clearTimeout(decoT); decoT = setTimeout(function () { safe(doDeco); }, 40); }
  function legInfo() {
    var o = {};
    qsa('#legs tbody tr').forEach(function (r) {
      var td = r.children; if (td.length < 5) return;
      var k = txt(td[0]); if (!/^\d+$/.test(k)) return;
      var arr = td[3], t = arr.firstChild && arr.firstChild.nodeType === 3 ? arr.firstChild.nodeValue.trim() : txt(arr);
      o[k] = { t: t, late: !!(qs('.late', r) || arr.classList.contains('late')), tw: txt(td[4]) };
    });
    return o;
  }
  function depotTimes() {
    var li = qsa('#seq li'), first = li.filter(function (x) { return /ออก/.test(txt(x)); })[0], last = li.filter(function (x) { return /ปลายทาง/.test(txt(x)); }).pop();
    var o = first && /ออก\s*([\d:]+)/.exec(txt(first)), r = last && /([\d]{1,2}:[\d]{2})\s*$/.exec(txt(last));
    return { out: o ? o[1] : '', back: r ? r[1] : '' };
  }
  function callHTML(lab, val) { return '<div class="sk-cb"><small>' + esc(lab) + '</small><b>' + esc(val) + '</b></div>'; }
  function doDeco() {
    var pane = qs('#m .leaflet-marker-pane'); if (!pane) return;
    var info = legInfo(), dt = null;
    qsa('.leaflet-marker-icon', pane).forEach(function (icn) {
      var pin = qs(':scope > .pin', icn); if (!pin || pin.classList.contains('ghost')) return;
      var b = qs(':scope > b', pin), path = qs('path', pin), col = path && path.getAttribute('fill');
      if (col) { pin.style.setProperty('--pc', col); icn.style.setProperty('--pc', col); }
      if (!qs(':scope > .sk-gs', icn)) icn.insertBefore(el('i', 'sk-gs'), icn.firstChild);
      var c = qs(':scope > .sk-call', icn);
      if (b) {
        var k = txt(b);
        // หมุดชั่วคราวตอนคลิกเลือกพิกัด (+) ไม่ต้องมีป้ายเวลา
        if (!/^\d+$/.test(k)) { icn.classList.add('sk-temp'); if (c) c.parentNode.removeChild(c); return; }
        icn.classList.add('sk-stop');
        var L = info[k];
        if (!c) { c = el('div', 'sk-call'); c.setAttribute('aria-hidden', 'true'); icn.appendChild(c); }
        c.className = 'sk-call' + (L && L.late ? ' late' : '');
        c.innerHTML = callHTML('จุดที่ ' + k, L && L.t ? 'ถึง ' + L.t : 'จุดส่ง');
      } else if (qs(':scope > span', pin)) {
        icn.classList.add('sk-depot');
        if (!c) { c = el('div', 'sk-call'); c.setAttribute('aria-hidden', 'true'); icn.appendChild(c); }
        dt = dt || depotTimes();
        c.className = 'sk-call depot';
        c.innerHTML = callHTML('คลังสินค้า', dt.out ? 'ออก ' + dt.out + (dt.back ? ' · กลับ ' + dt.back : '') : 'จุดเริ่มต้น');
      }
    });
    later(declutter, 60);
  }
  function overlap(a, b, p) { return !(a.right + p < b.left || a.left - p > b.right || a.bottom + p < b.top || a.top - p > b.bottom); }
  // ป้ายเวลาที่แสดงอยู่: คลังก่อน แล้วตามลำดับจุด ป้ายที่ทับกันหรือหลุดกรอบจะซ่อน (ชี้ที่หมุดยังดูได้)
  function declutter() {
    var m = $('m'); if (!m) return;
    var mr = m.getBoundingClientRect(); if (!mr.width) return;
    var eta = m.classList.contains('sk-eta'), kept = [];
    var calls = qsa('#m .leaflet-marker-pane .sk-call');
    calls.sort(function (a, b) { var da = a.classList.contains('depot') ? -1 : 0, db = b.classList.contains('depot') ? -1 : 0; if (da !== db) return da - db; var na = +((/\d+/.exec(txt(qs('small', a))) || [0])[0]), nb = +((/\d+/.exec(txt(qs('small', b))) || [0])[0]); return na - nb; });
    calls.forEach(function (c) { c.classList.remove('sk-hidecall'); });
    calls.forEach(function (c) {
      if (!eta && !c.classList.contains('depot')) return;
      var bx = qs('.sk-cb', c); if (!bx) return;
      var r = bx.getBoundingClientRect();
      var off = r.top < mr.top + 4 || r.bottom > mr.bottom - 4 || r.left < mr.left + 2 || r.right > mr.right - 2;
      if (off || kept.some(function (k) { return overlap(r, k, 2); })) c.classList.add('sk-hidecall'); else kept.push(r);
    });
    labelDeclutter(m, mr, kept);
    fbUpright(m, mr);
  }
  // เบราว์เซอร์ที่ไม่ใช้โหมด 3 มิติ (Safari/Firefox): หมุดและป้ายนอนบนพื้นเอียง จึงยืดกลับตามมุมมองตรงตำแหน่งของมันเอง
  // (ใกล้ขอบล่างยืดน้อย ไกลขึ้นไปยืดมากขึ้น) ให้ดูตั้งตรงสัดส่วนปกติ
  function fbUpright(m, mr) {
    if (!TM || !MM.tilt || m.classList.contains('sk-3d')) return;
    qsa('#m .leaflet-marker-pane .leaflet-marker-icon, #m .leaflet-labels-pane .leaflet-marker-icon').forEach(function (icn) {
      var r = icn.getBoundingClientRect(); if (!r.width && !r.height) return;
      var c = unprojectM(TM, (r.left + r.right) / 2 - mr.left, r.bottom - mr.top); if (!c) return;
      var p0 = projectM(TM, c[0], c[1]), px = projectM(TM, c[0] + 1, c[1]), py = projectM(TM, c[0], c[1] + 1);
      var hx = Math.hypot(px[0] - p0[0], px[1] - p0[1]), vy = Math.hypot(py[0] - p0[0], py[1] - p0[1]);
      if (hx > 0 && vy > 0) icn.style.setProperty('--sk-ys', Math.max(1, Math.min(3, hx / vy)).toFixed(3));
    });
  }
  // ป้ายชื่อสถานที่: เมืองหลักและจุดที่เลือกได้ก่อน ที่เหลือแสดงเมื่อไม่ทับกัน/ไม่ทับหมุด และจางลงเมื่ออยู่ไกล (มุมเอียง)
  function labelDeclutter(m, mr, obst) {
    var H = mr.height, tilt = m.classList.contains('sk-tilt');
    // หมุดทุกอัน + ตำแหน่งจุดบนพื้น (ใช้เช็กว่าป้ายไหนเป็นของหมุดตัวเอง)
    var pins = qsa('#m .leaflet-marker-pane .leaflet-marker-icon').map(function (icn) {
      var p = qs(':scope > .pin', icn), g = qs(':scope > .sk-gs', icn); if (!p) return null;
      var gr = g ? g.getBoundingClientRect() : null;
      return { r: p.getBoundingClientRect(), x: gr ? gr.left : NaN, y: gr ? gr.top : NaN };
    }).filter(Boolean);
    var L = qsa('#m .leaflet-labels-pane .leaflet-marker-icon').map(function (icn) {
      var t = qs('.tlab', icn) || qs('.shield', icn); if (!t) return null;
      var r = t.getBoundingClientRect(); if (!r.width) return null;
      var big = t.classList.contains('big'), on = !!(t.style && t.style.transform), sh = t.classList.contains('shield');
      var dot = qs('.tdot', icn), dr = dot ? dot.getBoundingClientRect() : null;
      return { icn: icn, r: r, pr: big ? 0 : on ? 1 : sh ? 3 : 2, y: (r.top + r.bottom) / 2 - mr.top, dx: dr ? (dr.left + dr.right) / 2 : NaN, dy: dr ? (dr.top + dr.bottom) / 2 : NaN };
    }).filter(Boolean);
    L.sort(function (a, b) { return a.pr - b.pr || b.y - a.y; });
    var kept = obst.slice();
    L.forEach(function (o) {
      var fade = tilt ? Math.max(0, Math.min(1, (o.y - H * 0.06) / (H * 0.1))) : 1;
      // ป้ายห้ามบังหมุดของจุดอื่น (หมุดของสถานที่เดียวกันไม่นับ)
      var hide = fade < 0.15 || kept.some(function (k) { return overlap(o.r, k, 3); }) ||
        pins.some(function (p) { var own = Math.abs(p.x - o.dx) < 9 && Math.abs(p.y - o.dy) < 9; return !own && overlap(o.r, p.r, 2); });
      o.icn.classList.toggle('sk-lhide', hide);
      if (tilt) o.icn.style.setProperty('--sk-lo', fade.toFixed(2)); else o.icn.style.removeProperty('--sk-lo');
      if (!hide) kept.push(o.r);
    });
  }
  /* ---------------- จุดส่งที่เพิ่มเอง: ลบออกจากรายการแล้ว ชื่อบนแผนที่และในรายการคลังต้องหายไปด้วย ---------------- */
  // เว็บเดิมลบจุดออกจากรายการจุดส่งแล้ว แต่ยังทิ้งชื่อ+จุดบนแผนที่ไว้ ทำให้ดูเหมือนลบไม่ได้
  var baseNames = null;
  function customSync() {
    var pane = qs('#m .leaflet-labels-pane'); if (!pane) return;
    var labs = qsa('.leaflet-marker-icon', pane).filter(function (i) { return qs('.tlab', i); });
    if (!labs.length) return;
    if (!baseNames) { baseNames = {}; labs.forEach(function (i) { baseNames[txt(qs('.tlab', i))] = 1; }); qsa('#depot option').forEach(function (o) { baseNames[txt(o)] = 1; }); }
    var keep = {}; qsa('#chips .stopchip .nm').forEach(function (e) { keep[txt(e)] = 1; });
    var dp = $('depot'), dsel = dp && dp.selectedIndex >= 0 ? txt(dp.options[dp.selectedIndex]) : ''; if (dsel) keep[dsel] = 1;
    labs.forEach(function (i) { var n = txt(qs('.tlab', i)); i.classList.toggle('sk-gone', !baseNames[n] && !keep[n]); });
    if (dp) qsa('option', dp).forEach(function (o) { var n = txt(o); o.hidden = !baseNames[n] && !keep[n]; });
  }
  function customWatch() {
    customSync();
    var ch = $('chips'), pane = qs('#m .leaflet-labels-pane'), dp = $('depot'), f = debounce(function () { safe(customSync); }, 50);
    if (!W.MutationObserver) return;
    if (ch) new MutationObserver(f).observe(ch, { childList: true, subtree: true });
    if (pane) new MutationObserver(f).observe(pane, { childList: true });
    if (dp) { new MutationObserver(f).observe(dp, { childList: true }); dp.addEventListener('change', f); }
  }
  var mkT = 0;
  function markerAnim() {
    clearTimeout(mkT);
    mkT = setTimeout(function () { qsa('#m .leaflet-marker-pane .leaflet-marker-icon').forEach(function (m, i) { m.style.setProperty('--i', Math.min(i, 24)); }); }, 0);
  }
  function enrichPopup(p) {
    var c = qs('.leaflet-popup-content', p); if (!c || qs('.sk-pop', c)) return;
    var head = txt(qs('b', c)), m = /^(\d+)\.\s*(.+)$/.exec(head), box = el('div', 'sk-pop');
    if (m) {
      var k = m[1], total = qsa('#chips .stopchip').length, row = null;
      qsa('#legs tbody tr').forEach(function (r) { var td = r.children[0]; if (!row && td && txt(td) === k && r.children.length >= 5) row = r; });
      var h = '<span class="hl"><i>ลำดับการส่ง</i><b>' + esc(k) + (total ? ' / ' + total : '') + '</b></span>';
      if (row) {
        var arr = row.children[3], late = qs('.late', row) || (arr && arr.classList.contains('late'));
        var t = arr ? (arr.firstChild && arr.firstChild.nodeType === 3 ? arr.firstChild.nodeValue : txt(arr)) : '';
        h += '<span' + (late ? ' class="bad"' : '') + '><i>ถึงประมาณ</i><b>' + esc(String(t).trim() || '–') + '</b></span>';
        var tw = txt(row.children[4]); if (tw) h += '<span><i>เวลาเปิด–ปิดร้าน</i><b>' + esc(tw) + '</b></span>';
        var wait = qsa('.wait', row).map(txt).join(' · '); if (wait) h += '<span class="' + (late ? 'bad' : '') + '"><i>หมายเหตุ</i><b>' + esc(wait) + '</b></span>';
      }
      box.innerHTML = h;
    } else if (/คลังสินค้า/.test(txt(c))) {
      var li = qsa('#seq li'), first = li.filter(function (x) { return /ออก/.test(txt(x)); })[0], lastLi = li.filter(function (x) { return /ปลายทาง/.test(txt(x)); }).pop();
      var o = first && /ออก\s*([\d:]+)/.exec(txt(first)), r = lastLi && /([\d]{1,2}:[\d]{2})\s*$/.exec(txt(lastLi));
      box.innerHTML = '<span class="hl"><i>ออกจากคลัง</i><b>' + esc(o ? o[1] : '–') + '</b></span><span><i>กลับถึงคลัง</i><b>' + esc(r ? r[1] : '–') + '</b></span><span><i>จุดส่งทั้งหมด</i><b>' + qsa('#chips .stopchip').length + ' จุด</b></span><span><i>ระยะทาง/รอบ</i><b>' + esc(txt($('ov-km')) || '–') + '</b></span>';
    } else return;
    c.appendChild(box);
  }

  var lastSig = null, busyT = 0;
  function calcAnim() {
    var pr = $('sk-progress'); if (pr) { pr.classList.add('on'); }
    if (S.km) qsa('.sk-stat').forEach(function (c) { if (c !== S.stops.c) c.classList.add('busy'); });
    if (LOADER && cur === 'planner') LOADER.classList.add('on');
    clearTimeout(busyT);
    busyT = setTimeout(function () {
      if (pr) pr.classList.remove('on');
      qsa('.sk-stat.busy').forEach(function (c) { c.classList.remove('busy'); });
      if (LOADER) LOADER.classList.remove('on');
      flashRoute();
      safe(update);
    }, RM ? 0 : 650);
  }
  function flashRoute() { var m = $('m'); if (!m || RM) return; m.classList.remove('sk-flash'); void m.offsetWidth; m.classList.add('sk-flash'); later(function () { m.classList.remove('sk-flash'); }, 1100); }

  /* ---------------- ค่าที่อัปเดตตามการคำนวณของเว็บเดิม ---------------- */
  function setV(k, v, u, sub) { var o = S[k]; if (!o) return; o.last = [v, u]; countTo(o.v, v, u); o.s.textContent = sub || o.d; }
  function replayStats() { Object.keys(S).forEach(function (k) { var o = S[k]; if (o.last && /^-?[\d,]+(\.\d+)?$/.test(String(o.last[0]).trim())) { o.v.__v = 0; countTo(o.v, o.last[0], o.last[1]); } }); }
  function update() {
    var nStops = qsa('#chips .stopchip').length;
    var movl = $('movl'), on = movl && !movl.hidden, km = txt($('ov-km')), tm = txt($('ov-tm'));
    var more = $('more'), hero = more && qs('.hero', more), R = resRows();
    var sig = [km, tm, nStops, ($('depot') || {}).value, txt($('order'))].join('|');
    if (lastSig !== null && sig !== lastSig) { lastSig = sig; if (cur !== 'planner') mapDirty = true; calcAnim(); return; }
    lastSig = sig;
    if (!qs('.sk-stat.busy')) {
      setV('stops', String(nStops), 'จุด');
      if (on && km && km !== '-') { var p = split(km); setV('km', p[0], p[1]); } else setV('km', '–', '');
      if (on && tm && tm !== '-') setV('tm', tm, ''); else setV('tm', '–', '');
      if (hero && hero.classList.contains('same')) setV('save', 'สั้นที่สุดแล้ว', '', txt(qs('b', hero)) || 'ไม่ต้องเปลี่ยนเส้นทาง');
      else if (hero) { var hv = split(txt(qs('b', hero))); setV('save', hv[0], hv[1], txt(qs('em', hero))); } else setV('save', '–', '');
    }
    if (LIVE) {
      qs('[data-k="n"]', LIVE).textContent = nStops ? nStops + ' จุด' : '–';
      var fk = Object.keys(R).filter(function (k) { return /^ค่า(น้ำมัน|ไฟ)ต่อวัน/.test(k); })[0];
      qs('[data-k="f"]', LIVE).textContent = fk ? split(R[fk])[0] + ' ฿' : '–';
      qs('[data-k="s"]', LIVE).textContent = hero && !hero.classList.contains('same') ? split(txt(qs('b', hero)))[0] + ' ฿' : hero ? 'สั้นสุดแล้ว' : '–';
    }
    if (C) {
      var a = more && qs('.vs .cb .vr b', more), b = more && qs('.vs .ca .vr b', more);
      if (!a || !b) C.hidden = true;
      else {
        var av = num(txt(a)), bv = num(txt(b)), pa = split(txt(a)), pb = split(txt(b));
        fillVal(qs('[data-k="a"]', C), pa); fillVal(qs('[data-k="b"]', C), pb);
        qs('[data-k="an"]', C).textContent = txt(qs('.vs .cb h4', more)).replace(/^ก่อน\s*·\s*/, '') || 'ลำดับเดิม';
        var pc = av > 0 && isFinite(bv) ? (av - bv) / av * 100 : 0;
        qs('[data-k="p"]', C).textContent = pc > 0.05 ? pc.toFixed(1) + '%' : 'เท่ากัน';
        C.hidden = false;
      }
    }
    if (cur === 'dashboard' || cur === 'stats') liveRender();
    safe(sk6Stats);
  }
  function fillVal(n, p) { n.textContent = p[0]; var s = d.createElement('small'); s.textContent = p[1] ? ' ' + p[1] : ''; n.appendChild(s); }
  var liveRender = debounce(function () {
    if (cur === 'dashboard') { drawCostMix(); drawBA(); }
    if (cur === 'stats') { var none = $('sk-morenone'), more = $('more'); if (none) none.hidden = !!(more && more.children.length); }
  }, 500);

  /* ---------------- หน้าสถิติ ---------------- */
  var statRange = 30;
  function buildStats() {
    var V = VIEW.stats, more = $('more');
    var top = el('div', 'sk-statsview');
    top.style.display = 'contents';
    top.innerHTML =
      '<article class="sk-card" id="sk-range"><div class="sk-ch" style="margin:0">' + ic('cal') + '<h3>ช่วงเวลาที่ต้องการดู<small>สรุปจากประวัติเส้นทางที่บันทึกไว้</small></h3><div class="sk-seg" role="group" aria-label="ช่วงเวลา"><button type="button" data-r="7" aria-pressed="false">7 วัน</button><button type="button" data-r="30" aria-pressed="true">30 วัน</button><button type="button" data-r="90" aria-pressed="false">90 วัน</button><button type="button" data-r="0" aria-pressed="false">ทั้งหมด</button></div></div></article>' +
      '<div class="sk-kpis" id="sk-kpis"></div>' +
      '<div class="sk-grid2"><article class="sk-card" id="sk-st1"><div class="sk-ch">' + ic('route') + '<h3>ระยะทาง ก่อน vs หลังจัด<small>กิโลเมตรรวมในแต่ละช่วง</small></h3></div><div class="sk-chart"></div></article>' +
      '<article class="sk-card" id="sk-st2"><div class="sk-ch">' + ic('coins') + '<h3>ต้นทุน vs เงินที่ประหยัด<small>บาทรวมในแต่ละช่วง</small></h3></div><div class="sk-chart"></div></article></div>' +
      '<h3 class="sk-sechead">' + ic('chart') + 'วิเคราะห์เส้นทางปัจจุบัน</h3>' +
      '<div class="sk-card" id="sk-morenone" hidden>' + emptyBox('route', 'ยังไม่มีเส้นทางปัจจุบัน', 'เลือกจุดส่งในหน้าวางแผน แล้วกลับมาดูการเปรียบเทียบก่อน-หลัง เทียบรถ และค่าน้ำมันที่นี่', '<button type="button" class="primary" data-go="planner">' + ic('route') + 'ไปหน้าวางแผน</button>') + '</div>';
    var frag = d.createDocumentFragment(); while (top.firstChild) frag.appendChild(top.firstChild);
    V.insertBefore(frag, V.firstChild);
    qs('#sk-range .sk-seg').addEventListener('click', function (e) { var b = e.target.closest('button[data-r]'); if (!b) return; qsa('button', this).forEach(function (x) { x.setAttribute('aria-pressed', x === b); }); statRange = +b.getAttribute('data-r'); renderView('stats', true); });
    renderers.stats = function () {
      var B = buckets(statRange || 0), es = B.es, kmB = sumE(es, 'kmBefore'), km = sumE(es, 'km');
      var K = [['เส้นทางที่บันทึก', fmt(es.length), 'เส้นทาง', '#1d3a63'], ['ระยะทางรวม', fmt(km, 1), 'กม.', '#f58a12'], ['ระยะที่ลดได้', fmt(Math.max(0, kmB - km), 1), 'กม.' + (kmB > 0 ? ' · ' + fmt((kmB - km) / kmB * 100, 1) + '%' : ''), '#7767ca'], ['ต้นทุนรวม', fmt(sumE(es, 'total')), 'บาท', '#2b6da9'], ['ประหยัดได้รวม', fmt(sumE(es, 'saveDay')), 'บาท', '#1f9d4c']];
      $('sk-kpis').innerHTML = K.map(function (k, i) { return '<div class="sk-kpi" style="--c:' + k[3] + ';--i:' + i + '"><small>' + k[0] + '</small><b data-v="' + esc(k[1]) + '">' + k[1] + ' <small>' + esc(k[2]) + '</small></b></div>'; }).join('');
      qsa('#sk-kpis b').forEach(function (b) { var v = b.getAttribute('data-v'), u = txt(qs('small', b)); b.__v = ANIM ? 0 : num(v); countTo(b, v, u); });
      var L = B.b.map(function (b) { return b.lab; }), T = B.b.map(function (b) { return b.tip; }), h1 = qs('#sk-st1 .sk-chart'), h2 = qs('#sk-st2 .sk-chart');
      if (!es.length) { var e = emptyBox('chart', 'ยังไม่มีประวัติในช่วงนี้', 'บันทึกเส้นทางลงประวัติ หรือเลือกช่วงเวลาที่ยาวขึ้น', ''); h1.innerHTML = e; h2.innerHTML = e; }
      else {
        barChart(h1, L, [{ name: 'ก่อนจัด', c: ['#c3ccd9', '#8796ad'], v: B.b.map(function (b) { return b.kmB; }) }, { name: 'หลังจัด', c: ['#ffc06a', '#f58a12'], v: B.b.map(function (b) { return b.km; }) }], { tips: T, fmt: function (v) { return fmt(v, 1) + ' กม.'; }, label: 'ระยะทางก่อนและหลังจัด' });
        lineChart(h2, L, [{ name: 'ต้นทุนรวม', c: '#2b6da9', v: B.b.map(function (b) { return b.cost; }), area: true }, { name: 'ประหยัดได้', c: '#1f9d4c', v: B.b.map(function (b) { return b.save; }), area: true, glow: 1 }], { tips: T, fmt: function (v) { return fmt(v) + ' บาท'; }, label: 'ต้นทุนและเงินที่ประหยัด' });
      }
      var none = $('sk-morenone'); if (none) none.hidden = !!(more && more.children.length);
    };
  }

  /* ---------------- หน้าประวัติ: ค้นหา + กรอง ---------------- */
  var HF = { q: '', r: 0, car: '' };
  function buildHistory() {
    var sec = $('hist'), list = $('hlist'); if (!sec || !list) return;
    var bar = el('div', 'sk-hbar');
    bar.innerHTML = '<label class="sk-search">' + ic('search') + '<input type="search" placeholder="ค้นหาชื่อร้าน คลัง หรือรุ่นรถ…" aria-label="ค้นหาประวัติ"></label>' +
      '<div class="sk-seg" role="group" aria-label="ช่วงเวลา"><button type="button" data-r="0" aria-pressed="true">ทั้งหมด</button><button type="button" data-r="7" aria-pressed="false">7 วัน</button><button type="button" data-r="30" aria-pressed="false">30 วัน</button><button type="button" data-r="90" aria-pressed="false">90 วัน</button></div>' +
      '<select aria-label="กรองตามรุ่นรถ"><option value="">ทุกรุ่นรถ</option></select><span class="sk-hcount"></span>';
    var head = qs('.secth', sec);
    sec.insertBefore(bar, head ? head.nextSibling : sec.firstChild);
    var nores = el('div', 'sk-empty sk-nores', ic('search') + '<b>ไม่พบรายการที่ตรงกับตัวกรอง</b><span>ลองเปลี่ยนคำค้นหา ช่วงเวลา หรือรุ่นรถ</span>');
    list.parentNode.insertBefore(nores, list.nextSibling);
    var inp = qs('input', bar), sel = qs('select', bar);
    inp.addEventListener('input', debounce(function () { HF.q = inp.value.trim(); filterHist(); }, 120));
    qs('.sk-seg', bar).addEventListener('click', function (e) { var b = e.target.closest('button[data-r]'); if (!b) return; qsa('button', this).forEach(function (x) { x.setAttribute('aria-pressed', x === b); }); HF.r = +b.getAttribute('data-r'); filterHist(); });
    sel.addEventListener('change', function () { HF.car = sel.value; filterHist(); });
    if (W.MutationObserver) new MutationObserver(debounce(function () { carOptions(sel); filterHist(); }, 60)).observe(list, { childList: true });
    carOptions(sel); filterHist();
    renderers.history = function () { carOptions(sel); filterHist(); };
  }
  function carOptions(sel) {
    var cars = {}; allEntries().forEach(function (e) { if (e.x && e.x.carName) cars[e.x.carName] = 1; });
    var have = qsa('option', sel).map(function (o) { return o.value; }).join('|'), want = [''].concat(Object.keys(cars).sort()).join('|');
    if (have === want) return;
    var v = sel.value; sel.innerHTML = '<option value="">ทุกรุ่นรถ</option>' + Object.keys(cars).sort().map(function (c) { return '<option>' + esc(c) + '</option>'; }).join('');
    sel.value = cars[v] ? v : '';
    HF.car = sel.value;
  }
  function filterHist() {
    var list = $('hlist'); if (!list) return;
    var q = HF.q.toLowerCase(), min = HF.r ? dk(addD(new Date(), -(HF.r - 1))) : '', shown = 0, total = 0, active = !!(q || HF.r || HF.car);
    qsa('.hent mark', list).forEach(function (m) { var t = d.createTextNode(m.textContent); m.parentNode.replaceChild(t, m); });
    qsa('.hb b', list).forEach(function (b) { b.normalize(); });
    qsa('.hday', list).forEach(function (day) {
      var date = day.getAttribute('data-date') || '', inR = !min || date >= min, vis = 0;
      qsa('.hent', day).forEach(function (en) {
        total++;
        var t = txt(qs('.hb', en)).toLowerCase(), ok = inR && (!q || t.indexOf(q) >= 0) && (!HF.car || txt(qs('.hb small', en)).indexOf(HF.car) >= 0);
        en.classList.toggle('sk-hide', !ok); if (ok) { vis++; shown++; if (q) mark(qs('.hb b', en), q); }
      });
      day.classList.toggle('sk-hide', vis === 0);
      if (q && vis && !day.open) day.open = true;
    });
    var cnt = qs('#hist .sk-hcount'); if (cnt) cnt.innerHTML = total ? (active ? 'แสดง <b>' + shown + '</b> จาก ' + total + ' เส้นทาง' : 'ทั้งหมด <b>' + total + '</b> เส้นทาง') : '';
    var nr = qs('#hist .sk-nores'); if (nr) nr.classList.toggle('on', total > 0 && shown === 0);
  }
  function mark(node, q) {
    if (!node) return;
    var tn = [].filter.call(node.childNodes, function (n) { return n.nodeType === 3; });
    tn.forEach(function (t) {
      var s = t.nodeValue, i = s.toLowerCase().indexOf(q); if (i < 0) return;
      var m = d.createElement('mark'); m.textContent = s.substr(i, q.length);
      var after = t.splitText(i); after.nodeValue = after.nodeValue.substr(q.length); node.insertBefore(m, after);
    });
  }

  /* ---------------- หน้าบัญชี ---------------- */
  function buildAccount() {
    var V = VIEW.account, sec = $('acctsec');
    var g = el('div', 'sk-acctgrid');
    g.innerHTML = '<div style="display:grid;gap:18px;align-content:start"><article class="sk-card sk-profile" id="sk-profile"></article><article class="sk-card"><div class="sk-ch">' + ic('box') + '<h3>ข้อมูลของฉัน<small>สรุปข้อมูลที่เว็บเก็บไว้</small></h3></div><div class="sk-tiles" id="sk-acctiles"></div></article></div>' +
      '<article class="sk-card"><div class="sk-ch">' + ic('wrench') + '<h3>ตั้งค่าพื้นฐาน<small>กดเพื่อไปยังตั้งค่าในหน้าวางแผน</small></h3></div><div class="sk-setlist">' +
      setItem('fuel', 'ราคาเชื้อเพลิง', 'ดีเซล แก๊สโซฮอล์ E20 และค่าไฟ ใช้คำนวณทุกเส้นทาง', 'fuel') +
      setItem('clock', 'เวลาออกรถและความเร็ว', 'เวลาออกจากคลัง ความเร็วเฉลี่ย เวลาแวะส่งต่อจุด', 'time') +
      setItem('box', 'น้ำหนักของและความจุรถ', 'แบ่งเป็นหลายเที่ยวเมื่อของเกินความจุ', 'load') +
      setItem('coins', 'ค่าใช้จ่ายอื่น', 'ค่าแรงคนขับ ซ่อมบำรุง ค่าผ่านทาง เงินลงทุน', 'cost') +
      setItem('star', 'ร้านประจำ', 'ร้านที่บันทึกไว้ เพิ่มเป็นจุดส่งได้ทันที', 'fav') +
      setItem('list', 'นำเข้ารายชื่อจาก Excel / CSV', 'เพิ่มจุดส่งทีละหลายร้านจากไฟล์', 'imp') +
      '</div></article>';
    if (sec) V.insertBefore(g, sec); else V.appendChild(g);
    renderers.account = function () {
      var a = $('acct'), img = a && qs('img', a), name = txt(a && qs('b', a)) || 'ผู้ใช้งาน', st = txt(a && qs('small', a)), where = txt($('hwhere'));
      $('sk-profile').innerHTML = '<div class="sk-ava">' + (img ? '<img alt="" src="' + esc(img.getAttribute('src')) + '">' : ic('user')) + '</div><div class="sk-pinfo"><small>MY ACCOUNT</small><b>' + esc(name) + '</b><p>' + esc(st || 'ROI ET Route Planner') + '</p>' + (where ? '<span class="sk-chipx">' + ic('info') + esc(where.length > 70 ? where.slice(0, 68) + '…' : where) + '</span>' : '') + '</div>';
      var H = hist(), E = allEntries(), F = favs(), A = accs(), sv = E.reduce(function (s, e) { return s + (+e.x.saveDay || 0); }, 0);
      $('sk-acctiles').innerHTML = tile('cal', 'ประวัติ', fmt(H.length) + ' วัน', fmt(E.length) + ' เส้นทาง') + tile('coins', 'ประหยัดได้สะสม', fmt(sv), 'บาท (จากประวัติ)') + tile('star', 'ร้านประจำ', fmt(F.length), 'ร้าน') + tile('target', 'ผลทดสอบ', fmt(A.length), 'ครั้ง');
    };
  }
  function setItem(i, t, s, k) { return '<button type="button" class="sk-set" data-set="' + k + '">' + ic(i) + '<span><b>' + esc(t) + '</b><small>' + esc(s) + '</small></span>' + ic('arrow') + '</button>'; }
  function openSetting(k) {
    var t = null;
    if (k === 'fuel') t = $('fuelset');
    else if (k === 'fav') t = $('favbox');
    else if (k === 'imp') t = $('impbox');
    else {
      var key = { time: 'เวลาออกรถ', load: 'น้ำหนัก', cost: 'ค่าใช้จ่ายอื่น' }[k];
      t = qsa('.adv .more details').filter(function (x) { return txt(qs('summary', x)).indexOf(key) >= 0; })[0] || qs('details.adv');
    }
    if (t) { openDetails(t); go('planner', { target: t, fresh: true }); } else go('planner');
  }

  /* ---------------- หน้าความแม่นยำ ---------------- */
  function buildAccuracy() {
    var V = VIEW.accuracy, sec = $('acc');
    var g = el('div', 'sk-grid2');
    g.innerHTML = '<article class="sk-card" id="sk-acc1"><div class="sk-ch">' + ic('chart') + '<h3>ระบบคำนวณ vs วิ่งจริง<small>กิโลเมตรต่อเส้นทาง (ล่าสุด 12 ครั้ง)</small></h3></div><div class="sk-chart"></div></article>' +
      '<article class="sk-card" id="sk-acc2"><div class="sk-ch">' + ic('target') + '<h3>ความแม่นยำโดยรวม<small>ยิ่งคลาดเคลื่อนน้อยยิ่งดี</small></h3></div><div class="sk-chart"></div></article>';
    if (sec) V.insertBefore(g, sec); else V.appendChild(g);
    renderers.accuracy = function () {
      var A = accs(), h1 = qs('#sk-acc1 .sk-chart'), h2 = qs('#sk-acc2 .sk-chart');
      if (!A.length) {
        h1.innerHTML = emptyBox('target', 'ยังไม่มีผลทดสอบ', 'วิ่งตามเส้นทางที่เว็บจัด แล้วกรอกระยะและเวลาจริงในแบบฟอร์มด้านล่าง หรือใช้โหมดคนขับ ระบบจะบันทึกให้เอง', '');
        h2.innerHTML = emptyBox('chart', 'รอผลทดสอบครั้งแรก', 'ทดสอบ 5–10 เส้นทางเพื่อดูความแม่นยำที่เชื่อถือได้', ''); return;
      }
      var L = A.slice(-12), labels = L.map(function (x, i) { return '#' + (A.length - L.length + i + 1); });
      var tips = L.map(function (x) { var e = (x.pk - x.ak) / x.ak * 100; return (x.d ? thd(pd(x.d), { day: 'numeric', month: 'short', year: '2-digit' }) + ' · ' : '') + 'คลาด ' + (e >= 0 ? '+' : '') + fmt(e, 1) + '%' + (x.route ? '\n' + String(x.route).slice(0, 60) + (String(x.route).length > 60 ? '…' : '') : ''); });
      barChart(h1, labels, [{ name: 'ระบบคำนวณ (กม.)', c: ['#ffc06a', '#f58a12'], v: L.map(function (x) { return +x.pk; }) }, { name: 'วิ่งจริง (กม.)', c: ['#4f7fc0', '#1d3a63'], v: L.map(function (x) { return +x.ak; }) }], { tips: tips, fmt: function (v) { return fmt(v, 1) + ' กม.'; }, label: 'ระยะที่คำนวณเทียบวิ่งจริง' });
      var ek = A.map(function (x) { return (x.pk - x.ak) / x.ak * 100; }), mape = ek.reduce(function (s, e) { return s + Math.abs(e); }, 0) / ek.length, bias = ek.reduce(function (s, e) { return s + e; }, 0) / ek.length, sc = Math.max(0, 100 - mape);
      var col = mape <= 10 ? '#1f9d4c' : mape <= 20 ? '#f59a23' : '#e0393e', lv = mape <= 10 ? 'แม่นยำดี' : mape <= 20 ? 'พอใช้' : 'ควรปรับค่า';
      h2.innerHTML = '<div class="sk-gauge">' + donutSVG([{ v: sc, c: col }, { v: 100 - sc, c: 'transparent' }], fmt(mape, 1) + '%', 'คลาดเคลื่อนเฉลี่ย') + '<p>ระดับ: <b style="color:' + col + '">' + lv + '</b><br>ทดสอบแล้ว <b>' + A.length + '</b> เส้นทาง<br>ระบบ' + (bias >= 0 ? 'คิด<b>เกิน</b>' : 'คิด<b>ขาด</b>') + 'เฉลี่ย <b>' + fmt(Math.abs(bias), 1) + '%</b><br><small style="color:#7b8798">คำแนะนำปรับค่าอยู่ในกล่องผลทดสอบด้านล่าง</small></p></div>';
    };
  }

  /* ---------------- หน้าเกี่ยวกับข้อมูล ---------------- */
  function buildAbout() {
    var V = VIEW.about, note = $('about');
    var g = el('div', 'sk-aboutgrid'); g.id = 'sk-aboutgrid';
    if (note) V.insertBefore(g, note); else V.appendChild(g);
    var h = el('h3', 'sk-sechead', ic('info') + 'รายละเอียดฉบับเต็ม');
    if (note) V.insertBefore(h, note);
    renderers.about = function () { aboutCards(g, note); };
  }
  function aboutCards(g, note) {
    var nt = txt(note), osm = txt($('osmdate')) || (/OpenStreetMap \(ดึงเมื่อ ([^)]+)\)/.exec(nt) || [])[1] || '';
    var places = (/([\d,]{4,})\s*สถานที่/.exec(txt($('pcount'))) || [])[1] || (/ราว\s*([\d,]+)\s*แห่ง/.exec(nt) || [])[1] || '';
    var ov = /Overture Maps \(รุ่น\s*([0-9-]+)/.exec(nt), ovd = /\)\s*ดึงเมื่อ\s*([^\s]+\s+[^\s]+\s+\d{4})/.exec(nt), fdate = txt($('fh-date'));
    var cards = [
      ['map', 'แผนที่ถนนจริง', 'ข้อมูลถนนจาก OpenStreetMap ครอบคลุมทางหลวงแผ่นดิน ถนนสายหลัก สายรอง และถนนเชื่อมอำเภอ เคารพถนนทางเดียว', osm ? 'ดึงเมื่อ ' + osm : ''],
      ['search', 'สถานที่สำหรับค้นหา', 'หมู่บ้าน วัด โรงเรียน ปั๊ม ถนน จาก OpenStreetMap และร้านค้า ร้านอาหาร อู่ คลินิก สำนักงาน จาก Overture Maps', places ? 'ประมาณ ' + places + ' แห่ง' : ''],
      ['warehouse', 'ข้อมูลร้านค้าและธุรกิจ', 'Overture Maps Foundation (CDLA-Permissive-2.0) เฉพาะข้อมูลที่ความน่าเชื่อถือ 50% ขึ้นไป ร้านอาจปิดหรือย้ายแล้ว ควรดูตำแหน่งก่อนใช้', ov ? 'รุ่น ' + ov[1] + (ovd ? ' · ดึงเมื่อ ' + ovd[1] : '') : ''],
      ['route', 'วิธีจัดลำดับเส้นทาง', 'ไม่เกิน 15 จุดต่อเที่ยว คำนวณครบทุกลำดับ ได้เส้นทางสั้นที่สุดแน่นอน มากกว่านั้นค้นหาเชิงลึกหลายรอบ รองรับเวลาเปิด-ปิดร้าน จุดส่งก่อน ความจุรถ และหลายคัน', 'ระบบเดิม ไม่เปลี่ยนแปลง'],
      ['gauge', 'การคิดระยะทาง', 'คิดตามถนนจริงจนถึงจุดบนถนนสายหลักที่ใกล้จุดส่งที่สุด แล้วบวกช่วงเข้าจุดส่ง (ระยะเส้นตรง × ตัวคูณ) ยังไม่มีถนนซอยในหมู่บ้าน', 'ปรับตัวคูณได้ในตั้งค่า'],
      ['fuel', 'ราคาเชื้อเพลิงและต้นทุน', 'ราคาเริ่มต้นอ้างอิงปั๊ม แก้เป็นราคาวันนี้ได้ ค่าแรง ทางด่วน ค่าซ่อม เป็นค่าสมมติที่ควรแก้ตามจริง CO₂ เป็นค่าประมาณ', fdate ? 'ราคา ณ ' + fdate : ''],
      ['bolt', 'เส้นทางและค้นหาสด TomTom', 'เมื่อเปิดหน้านี้บน claude.ai และเชื่อมต่อ TomTom Maps จะใช้ระยะจริงทุกซอยและค้นหาสถานที่แบบสด', 'ใช้ได้บน claude.ai'],
      ['cal', 'การเก็บข้อมูล', 'ประวัติ ผลทดสอบ ร้านประจำ และราคาน้ำมัน เก็บในเบราว์เซอร์นี้หรือบัญชีของคุณ ดาวน์โหลดไฟล์สำรองไปเครื่องอื่นได้', 'หน้าบัญชี → สำรองข้อมูล'],
      ['phone', 'ระบบและอุปกรณ์', 'ใช้งานได้ทั้งคอมพิวเตอร์ แท็บเล็ต และมือถือ แผนที่ฝังในหน้าเว็บ ใช้งานได้แม้สัญญาณไม่ดี', 'ธีม Premium Dashboard v2']
    ];
    g.innerHTML = cards.map(function (c) { return '<article class="sk-card sk-about">' + ic(c[0]) + '<div><b>' + esc(c[1]) + '</b><p>' + esc(c[2]) + '</p>' + (c[3] ? '<em>' + esc(c[3]) + '</em>' : '') + '</div></article>'; }).join('');
  }

  /* ---------------- เหตุการณ์ทั่วไป ---------------- */
  function wire() {
    // ลิงก์ในหน้า: เปิดหน้าที่มีเป้าหมายนั้น แทนการเลื่อนลง
    d.addEventListener('click', function (e) {
      var g = e.target.closest('[data-go]');
      if (g) { e.preventDefault(); go(g.getAttribute('data-go')); return; }
      var op = e.target.closest('[data-open]');
      if (op) { var t = $(op.getAttribute('data-open')); if (t) { openDetails(t); go('planner', { target: t, fresh: true }); } return; }
      var ck = e.target.closest('[data-click]');
      if (ck) { var b = $(ck.getAttribute('data-click')); if (b) b.click(); return; }
      var st = e.target.closest('[data-set]');
      if (st) { openSetting(st.getAttribute('data-set')); return; }
      var a = e.target.closest('a[href^="#"]');
      if (!a || e.defaultPrevented || e.button > 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      if (a.closest('.leaflet-container')) return;
      var h = a.getAttribute('href').slice(1); if (!h) return;
      var v = viewOfHash(h); if (!v) return;
      e.preventDefault();
      var tgt = PAGES[h] || BY_S[h] ? null : $(h);
      if (tgt && VIEW[v] && tgt === VIEW[v].firstElementChild) tgt = null;
      go(v, { target: tgt && tgt.id !== 'plan' && tgt.id !== 'top' ? tgt : null, flash: false, fresh: true });
    }, true);
    // ปุ่มของเว็บเดิมที่พาไปดูแผนที่
    d.addEventListener('click', function (e) {
      if (e.target.closest('#hlist [data-ld]') || e.target.closest('#more .vbtn button') || e.target.closest('#favlist [data-fa]')) later(function () { go('planner', { target: $('m'), flash: false, fresh: true }); }, 60);
    });
    W.addEventListener('popstate', function () { var v = viewOfHash(location.hash) || 'dashboard'; go(v, { noPush: true }); });
    W.addEventListener('hashchange', function () { var v = viewOfHash(location.hash); if (v && v !== cur) go(v, { noPush: true }); });

    // ไฮไลต์เมนูตามหน้าที่เปิดอยู่ (สคริปต์เดิมจะเปลี่ยนตามการเลื่อน ซึ่งไม่ใช้แล้ว)
    var menu = $('menu');
    if (menu && W.MutationObserver) new MutationObserver(function () { var P = PAGES[cur], a = P && qs('a[data-s="' + P.s + '"]', menu); if (a && (!a.classList.contains('on') || qsa('a.on', menu).length > 1)) menuActive(); }).observe(menu, { subtree: true, attributes: true, attributeFilter: ['class'] });
    W.addEventListener('resize', debounce(function () { moveGlow(); renderView(cur, false); }, 180));

    // แถบหัวหน้าเป็นกระจกเมื่อเลื่อน
    var tb = $('sk-topbar');
    W.addEventListener('scroll', function () { if (tb) tb.classList.toggle('stuck', (W.pageYOffset || 0) > 8); }, { passive: true });

    // ปุ่ม: ระลอกแสงตอนกด
    if (!RM) d.addEventListener('pointerdown', function (e) {
      var b = e.target.closest('.primary,.navybtn,.drvbtn,.linebtn,.ghost,.sk-act,.sideacts button,.vt button,.sk-seg button,.cta');
      if (!b || b.disabled) return;
      var r = b.getBoundingClientRect(), s = d.createElement('span');
      s.className = 'sk-rip'; s.setAttribute('aria-hidden', 'true');
      s.style.setProperty('--rx', (e.clientX - r.left) + 'px'); s.style.setProperty('--ry', (e.clientY - r.top) + 'px');
      b.insertBefore(s, b.firstChild);
      setTimeout(function () { if (s.parentNode) s.parentNode.removeChild(s); }, 650);
    }, { passive: true });

    // คำอธิบายเมื่อชี้กราฟ
    var tip = $('sk-tip');
    if (tip) {
      d.addEventListener('pointermove', function (e) {
        var t = e.target.closest && e.target.closest('[data-tip]');
        if (!t) { tip.classList.remove('on'); return; }
        tip.innerHTML = t.getAttribute('data-tip');
        var x = e.clientX + 14, y = e.clientY + 14, w = tip.offsetWidth, h = tip.offsetHeight;
        if (x + w > W.innerWidth - 8) x = e.clientX - w - 14;
        if (y + h > W.innerHeight - 8) y = e.clientY - h - 14;
        tip.style.left = x + 'px'; tip.style.top = y + 'px'; tip.classList.add('on');
      }, { passive: true });
      d.addEventListener('pointerleave', function () { tip.classList.remove('on'); });
    }

    // อัปเดตตัวเลขเมื่อเว็บเดิมคำนวณใหม่
    if (W.MutationObserver) {
      var mo = new MutationObserver(debounce(update, 40));
      ['chips', 'more', 'movl', 'res', 'order'].forEach(function (id) { var n = $(id); if (n) mo.observe(n, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['hidden'] }); });
      var redraw = debounce(function () { if (cur && cur !== 'planner' && cur !== 'history') renderView(cur, true); }, 400);
      ['hlist', 'acc-out', 'favlist'].forEach(function (id) { var n = $(id); if (n) new MutationObserver(redraw).observe(n, { childList: true }); });
    }
  }

  /* ================= ธีม v6: หน้าตากระจกนูน 3D ลอยเหนือฉากถนน-รถขนส่ง-วัด ================= */
  var PROV = '98 100|M64.0,98.0 62.6,97.9 62.4,96.4 60.7,97.4 60.3,95.1 59.0,95.7 56.2,94.8 55.4,92.4 55.2,93.7 54.5,92.4 52.9,94.2 52.4,92.6 51.7,93.6 50.4,93.2 50.1,93.9 45.8,95.4 42.9,94.4 41.7,95.1 40.4,94.4 36.6,94.6 31.5,92.4 27.5,93.0 24.9,96.1 21.2,95.2 20.5,94.1 16.0,93.7 12.7,95.8 12.4,94.1 14.3,90.3 14.5,86.4 11.0,86.3 9.7,87.3 9.2,85.9 4.7,84.0 3.9,81.2 2.2,80.4 3.7,79.0 4.6,76.2 2.0,76.1 2.2,74.9 4.4,73.0 3.8,72.1 4.6,72.1 4.4,71.0 6.0,70.7 6.6,72.1 8.6,69.2 12.9,70.9 14.8,69.7 14.8,68.1 13.2,66.2 15.4,65.0 16.6,62.7 16.1,61.8 16.9,56.5 18.1,53.0 20.2,50.9 18.6,46.5 18.3,43.0 19.2,41.0 17.7,37.7 18.1,33.7 20.1,31.4 21.4,25.8 23.5,27.0 24.7,24.8 25.4,24.6 25.1,25.5 27.0,24.8 26.2,26.2 29.4,27.1 30.1,26.3 30.3,27.2 32.1,26.1 30.5,25.2 31.8,24.9 33.8,27.7 34.8,27.6 35.1,26.2 35.9,27.2 37.1,26.2 35.9,25.7 36.1,24.6 36.9,25.5 37.8,24.9 37.9,25.6 38.9,25.0 38.3,24.3 42.1,24.4 42.0,22.2 43.6,20.9 43.8,17.1 41.1,14.9 41.6,13.8 39.0,10.8 41.5,7.9 45.1,6.3 48.8,2.7 51.7,2.9 53.5,2.2 56.7,4.3 57.3,3.7 57.7,5.0 59.1,5.4 60.1,4.6 63.1,5.7 64.5,4.5 67.5,4.6 68.4,5.2 69.0,9.6 70.9,8.6 71.0,7.8 76.9,6.4 77.8,5.1 80.0,4.4 81.4,5.7 84.3,5.2 85.6,6.0 86.4,5.2 88.3,5.2 90.6,2.0 92.8,6.8 92.5,9.6 93.7,13.8 93.1,14.8 95.5,15.3 94.9,18.3 92.1,21.4 90.9,21.8 90.9,22.9 87.4,24.3 85.0,29.4 83.8,30.4 82.8,29.9 81.8,31.1 79.5,31.7 77.1,34.6 75.1,34.2 73.4,37.9 75.0,41.2 73.9,44.1 74.3,45.4 73.2,46.6 70.4,45.6 67.5,46.0 66.1,48.3 66.3,49.1 67.4,48.1 68.2,49.9 67.1,52.5 66.4,52.5 66.4,54.2 66.9,55.6 67.9,55.8 67.1,56.2 68.3,56.3 66.8,56.6 67.6,57.1 66.9,59.0 66.2,58.6 66.6,59.8 65.7,59.8 66.3,61.0 64.8,61.3 65.1,62.9 68.2,62.9 71.9,60.8 71.3,59.1 76.7,62.7 77.0,64.1 76.1,65.3 76.5,66.6 77.3,66.7 76.5,67.7 77.3,68.9 76.3,69.3 76.4,71.0 75.4,71.1 75.6,71.7 77.8,70.3 77.4,71.2 78.3,72.4 80.3,74.8 81.2,74.5 81.0,75.4 79.9,75.2 80.5,77.0 79.8,77.6 81.6,77.7 80.9,78.6 81.2,79.8 83.3,78.9 83.2,79.8 78.9,80.4 75.7,82.6 75.2,84.1 73.7,83.5 74.1,85.3 72.5,85.1 71.5,86.0 71.5,87.5 70.9,87.1 69.9,88.2 70.4,89.6 67.9,90.5 64.7,94.4 64.0,98.0Z';
  var G6 = {
    logo: '<svg viewBox="0 0 120 100" aria-hidden="true"><defs><linearGradient id="g6pin" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffc35a"/><stop offset=".55" stop-color="#ff7a12"/><stop offset="1" stop-color="#d84a00"/></linearGradient><radialGradient id="g6ring" cx=".5" cy=".4" r=".7"><stop offset="0" stop-color="#6b7584"/><stop offset="1" stop-color="#232a35"/></radialGradient><linearGradient id="g6hl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".85"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>' +
      '<ellipse cx="58" cy="76" rx="52" ry="17" fill="#0d1422" opacity=".35"/><ellipse cx="58" cy="72" rx="50" ry="16" fill="url(#g6ring)"/><ellipse cx="58" cy="72" rx="34" ry="9.5" fill="#cfd8e6"/><ellipse cx="58" cy="72" rx="42" ry="12.6" fill="none" stroke="#fff" stroke-width="1.6" stroke-dasharray="6 6" opacity=".9"/>' +
      '<path d="M94 64l16-6-4 7 6 3-8 1-3 6-2-7z" fill="#e8eef8" stroke="#8a97ab" stroke-width=".8"/>' +
      '<path d="M58 70C43 50 34 41 34 27a24 24 0 0 1 48 0c0 14-9 23-24 43z" fill="url(#g6pin)" stroke="#b54000" stroke-width="1.2"/><circle cx="58" cy="27" r="10" fill="#fff"/><path d="M42 18c3-8 12-12 20-10" stroke="url(#g6hl)" stroke-width="5" stroke-linecap="round" fill="none"/></svg>',
    home: '<svg viewBox="0 0 48 48"><defs><linearGradient id="g6h" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5aa8ff"/><stop offset="1" stop-color="#0b4fd3"/></linearGradient></defs><path d="M24 7L5 22.5h5V40h28V22.5h5z" fill="url(#g6h)" stroke="#073a9e" stroke-width="1.2" stroke-linejoin="round"/><path d="M19 40V28h10v12z" fill="#fff"/><path d="M24 7L5 22.5h4L24 10.5 39 22.5h4z" fill="#fff" opacity=".45"/></svg>',
    route: '<svg viewBox="0 0 48 48"><defs><linearGradient id="g6r" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8f7dff"/><stop offset="1" stop-color="#3236d6"/></linearGradient></defs><path d="M11 40c0-7.5 7-8 13-8s13-1.5 13-8.5S30 16 24 16s-9-1.5-9-6" stroke="url(#g6r)" stroke-width="5.4" fill="none" stroke-linecap="round"/><path d="M11 40c0-7.5 7-8 13-8s13-1.5 13-8.5S30 16 24 16s-9-1.5-9-6" stroke="#fff" stroke-width="1.4" stroke-dasharray="2.6 3" fill="none" stroke-linecap="round"/><path d="M15 2.5a6.4 6.4 0 0 1 6.4 6.4c0 4.6-6.4 10.6-6.4 10.6S8.6 13.5 8.6 8.9A6.4 6.4 0 0 1 15 2.5z" fill="url(#g6pin)" stroke="#b54000" stroke-width="1"/><circle cx="15" cy="8.9" r="2.4" fill="#fff"/><circle cx="11" cy="40.5" r="4.6" fill="#1d6fff" stroke="#fff" stroke-width="1.8"/></svg>',
    box: '<svg viewBox="0 0 48 48"><path d="M24 5l17 8v21l-17 9-17-9V13z" fill="#d79a58"/><path d="M24 22l17-9v21l-17 9z" fill="#b36e2e"/><path d="M7 13l17 9v21L7 34z" fill="#e8b273"/><path d="M15 9l17 9v7l-5-2-1 6-5-2V20z" fill="#f6d9a8" opacity=".95"/><path d="M24 22l17-9M24 22L7 13M24 22v21" stroke="#8a4e17" stroke-width="1" fill="none" opacity=".55"/></svg>',
    chart: '<svg viewBox="0 0 48 48"><defs><linearGradient id="g6c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4fb4ff"/><stop offset="1" stop-color="#1450d8"/></linearGradient></defs><rect x="6" y="24" width="8" height="17" rx="2" fill="url(#g6c)"/><rect x="17" y="14" width="8" height="27" rx="2" fill="url(#g6c)"/><rect x="28" y="19" width="8" height="22" rx="2" fill="url(#g6c)"/><rect x="39" y="8" width="5" height="33" rx="2" fill="url(#g6c)" opacity=".75"/><path d="M5 43h40" stroke="#0e3a9a" stroke-width="2.2" stroke-linecap="round"/></svg>',
    gear: '<svg viewBox="0 0 48 48"><defs><linearGradient id="g6g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5aa8ff"/><stop offset="1" stop-color="#0b4fd3"/></linearGradient></defs><path d="M27.6 4l1.3 5.2a15.6 15.6 0 0 1 4.3 2.5l5.1-1.6 3.6 6.2-3.9 3.7a15.7 15.7 0 0 1 0 5l3.9 3.7-3.6 6.2-5.1-1.6a15.6 15.6 0 0 1-4.3 2.5L27.6 44h-7.2l-1.3-5.2a15.6 15.6 0 0 1-4.3-2.5l-5.1 1.6-3.6-6.2 3.9-3.7a15.7 15.7 0 0 1 0-5l-3.9-3.7 3.6-6.2 5.1 1.6a15.6 15.6 0 0 1 4.3-2.5L20.4 4z" fill="url(#g6g)" stroke="#073a9e" stroke-width="1"/><circle cx="24" cy="24" r="7" fill="#fff"/></svg>',
    user: '<svg viewBox="0 0 48 48"><circle cx="24" cy="17" r="8.5" fill="#fff"/><path d="M8 41c1.5-9 8-13.5 16-13.5S38.5 32 40 41z" fill="#fff"/></svg>',
    pinB: '<svg viewBox="0 0 48 60"><defs><linearGradient id="g6pb" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6cc0ff"/><stop offset="1" stop-color="#0b5ae0"/></linearGradient></defs><ellipse cx="24" cy="55" rx="12" ry="3.5" fill="#0b2a66" opacity=".3"/><path d="M24 54C12 38 5 30 5 20a19 19 0 0 1 38 0c0 10-7 18-19 34z" fill="url(#g6pb)" stroke="#063fa8" stroke-width="1"/><circle cx="24" cy="20" r="7.5" fill="#fff"/><path d="M12 12c3-5 8-7 13-6" stroke="#fff" stroke-opacity=".7" stroke-width="3.5" stroke-linecap="round" fill="none"/></svg>',
    pinO: '<svg viewBox="0 0 48 60"><ellipse cx="24" cy="55" rx="12" ry="3.5" fill="#6b2a00" opacity=".3"/><path d="M24 54C12 38 5 30 5 20a19 19 0 0 1 38 0c0 10-7 18-19 34z" fill="url(#g6pin)" stroke="#b54000" stroke-width="1"/><circle cx="24" cy="20" r="7.5" fill="#fff"/><path d="M12 12c3-5 8-7 13-6" stroke="#fff" stroke-opacity=".7" stroke-width="3.5" stroke-linecap="round" fill="none"/></svg>',
    plane: '<svg viewBox="0 0 48 48"><path d="M44 5L4 22l14 5 3 15 7-10 10 7z" fill="#fff"/><path d="M18 27l26-22-21 27" fill="#ffe2c4"/></svg>',
    road: '<svg viewBox="0 0 64 64"><defs><linearGradient id="g6rd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4f9bff"/><stop offset="1" stop-color="#0a3fc4"/></linearGradient></defs><path d="M22 6h20l16 52H6z" fill="url(#g6rd)"/><path d="M32 10v8M32 25v9M32 41v11" stroke="#fff" stroke-width="3.4" stroke-linecap="round"/><path d="M22 6L6 58M42 6l16 52" stroke="#bfe0ff" stroke-width="2"/></svg>',
    fuel: '<svg viewBox="0 0 64 64"><defs><linearGradient id="g6f" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffb04a"/><stop offset="1" stop-color="#e05a00"/></linearGradient></defs><rect x="8" y="8" width="30" height="50" rx="6" fill="url(#g6f)" stroke="#a83f00" stroke-width="1.2"/><rect x="13" y="14" width="20" height="13" rx="2.5" fill="#fff2df"/><path d="M38 22h6a4 4 0 0 1 4 4v18a4 4 0 0 0 8 0V20l-6-7" stroke="#a83f00" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/><rect x="5" y="54" width="36" height="6" rx="2" fill="#a83f00"/></svg>',
    clock: '<svg viewBox="0 0 64 64"><defs><linearGradient id="g6k" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5fe0a8"/><stop offset="1" stop-color="#0d9a63"/></linearGradient></defs><circle cx="32" cy="32" r="26" fill="url(#g6k)" stroke="#087a4c" stroke-width="1.5"/><circle cx="32" cy="32" r="19.5" fill="#f1fff8"/><path d="M32 19v14l9 6" stroke="#0d8a57" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>',
    cal: '<svg viewBox="0 0 48 48"><defs><linearGradient id="g7cal" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffab5e"/><stop offset="1" stop-color="#e2560a"/></linearGradient></defs><rect x="6" y="9" width="36" height="33" rx="6.5" fill="#fff" stroke="#9fb4d6" stroke-width="1.2"/><path d="M6 15.5A6.5 6.5 0 0 1 12.5 9h23A6.5 6.5 0 0 1 42 15.5V20H6z" fill="url(#g7cal)"/><rect x="14" y="4" width="4.2" height="10" rx="2.1" fill="#2a4f8f"/><rect x="29.8" y="4" width="4.2" height="10" rx="2.1" fill="#2a4f8f"/><path d="M15 31l5.5 5L33 24" stroke="#1d6fff" stroke-width="4.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    user7: '<svg viewBox="0 0 48 48"><defs><linearGradient id="g7u" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5aa8ff"/><stop offset="1" stop-color="#0b4fd3"/></linearGradient></defs><circle cx="24" cy="16" r="9.2" fill="url(#g7u)" stroke="#073a9e" stroke-width="1"/><path d="M7 42.5c1.6-9.6 8.4-14.2 17-14.2s15.4 4.6 17 14.2z" fill="url(#g7u)" stroke="#073a9e" stroke-width="1"/><path d="M18.5 11c2-3 5.6-4 8.6-3" stroke="#fff" stroke-opacity=".75" stroke-width="2.6" stroke-linecap="round" fill="none"/></svg>',
    target: '<svg viewBox="0 0 48 48"><defs><linearGradient id="g7t" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff8f5e"/><stop offset="1" stop-color="#d93a12"/></linearGradient></defs><circle cx="22" cy="26" r="18" fill="url(#g7t)" stroke="#a82a08" stroke-width="1"/><circle cx="22" cy="26" r="12.4" fill="#fff"/><circle cx="22" cy="26" r="7.4" fill="url(#g7t)"/><circle cx="22" cy="26" r="2.8" fill="#fff"/><path d="M22 26L39 9" stroke="#1d3f7a" stroke-width="3" stroke-linecap="round"/><path d="M35.5 6.5L42 4.5l-2 6.5-4.6 1z" fill="#1d6fff"/></svg>',
    info: '<svg viewBox="0 0 48 48"><defs><linearGradient id="g7i" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4fd1ff"/><stop offset="1" stop-color="#0a6fd6"/></linearGradient></defs><circle cx="24" cy="24" r="19" fill="url(#g7i)" stroke="#05559e" stroke-width="1"/><circle cx="24" cy="14.6" r="3.3" fill="#fff"/><rect x="20.9" y="20.2" width="6.2" height="16" rx="3.1" fill="#fff"/><path d="M11.5 17c2.8-5.2 7.8-8.4 13.6-8.6" stroke="#fff" stroke-opacity=".55" stroke-width="3" stroke-linecap="round" fill="none"/></svg>',
    full: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    minus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"><path d="M5 12h14"/></svg>',
    layers: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3l10 5-10 5L2 8z"/><path d="M4.2 11.6L12 15.5l7.8-3.9L22 12.7 12 17.7 2 12.7z" opacity=".75"/><path d="M4.2 15.6L12 19.5l7.8-3.9L22 16.7 12 21.7 2 16.7z" opacity=".5"/></svg>',
    caret: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>'
  };
  // เมนูครบ 7 หน้าเหมือน v9 (กดแล้วไปหน้านั้นทันที ไม่มีเมนูซ้อน) + ชื่อย่อสำหรับแถบล่างบนมือถือ
  var NAV7 = { top: ['home', 'หน้าแรก'], plan: ['route', 'วางแผน'], more: ['chart', 'สถิติ'], hist: ['cal', 'ประวัติ'], acctsec: ['user7', 'บัญชี'], acc: ['target', 'แม่นยำ'], about: ['info', 'ข้อมูล'] };
  function sk6Scene() {
    var bg = $('sk-bg'); if (!bg || qs('.sk6-sky', bg)) return;
    bg.innerHTML = '<div class="sk6-sky"><i class="sun"></i><i class="cl c1"></i><i class="cl c2"></i><i class="cl c3"></i><i class="cl c4"></i><i class="cl c5"></i><i class="cl c6"></i><i class="ray"></i></div>' +
      '<div class="sk6-scene"><div class="sk6-scenein"><img src="roiet-scene.webp" alt="" decoding="async"><i class="shine"></i>' +
      '<div class="sk6-prov" id="sk6-prov"><span class="pin">' + G6.pinO + '</span><span class="tx"><b>จังหวัดร้อยเอ็ด</b><small>Roi Et Province</small></span><svg class="map" viewBox="0 0 ' + PROV.split('|')[0] + '"><path d="' + PROV.split('|')[1] + '"/></svg></div></div></div>';
  }
  function sk6Nav() {
    var w = qs('.topnav .wrap'), m = $('menu'); if (!w || !m || m.__sk6) return;
    m.__sk6 = true;
    var logo = qs('.logo', w);
    if (logo) logo.innerHTML = '<span class="sk6-logo">' + G6.logo + '</span><span class="sk6-brand"><b><em>ROI ET</em> <i>ROUTE</i></b><small>ระบบวางแผนเส้นทางส่งของ จังหวัดร้อยเอ็ด</small></span>';
    var glow = $('sk-navglow'); if (glow) glow.parentNode.removeChild(glow);
    var bar = el('div', 'sk6-bar'), ind = el('i', 'sk6-ind'); ind.setAttribute('aria-hidden', 'true'); bar.appendChild(ind);
    qsa('a[data-s]', m).forEach(function (a) {
      var s = a.getAttribute('data-s'), n = NAV7[s] || ['info', ''], label = txt(a);
      a.innerHTML = '<i class="ico">' + (G6[n[0]] || '') + '</i><span class="lb">' + esc(label) + '</span><span class="sh" aria-hidden="true">' + esc(n[1] || label) + '</span>';
      a.setAttribute('aria-label', label); a.classList.add('sk6-main');
      var it = el('div', 'sk6-it'); it.appendChild(a); bar.appendChild(it);
    });
    m.innerHTML = ''; m.appendChild(bar);
  }
  function sk6Ind() {
    var bar = qs('.sk6-bar'), ind = bar && qs('.sk6-ind', bar); if (!ind) return;
    var P = PAGES[cur], on = null;
    qsa('.sk6-it', bar).forEach(function (it) { var hit = !!qs('[data-s="' + (P && P.s) + '"]', it); it.classList.toggle('on', hit); if (hit) on = it; });
    if (!on) { ind.style.opacity = 0; return; }
    var a = qs('.ico', on) || on;
    ind.style.opacity = 1;
    ind.style.transform = 'translate(' + (on.offsetLeft + a.offsetLeft + a.offsetWidth / 2) + 'px,0)';
  }

  /* ---------- หน้าหลัก: แผงตั้งค่าเส้นทาง + แผนที่ลอย + การ์ดสรุป ตามภาพ ---------- */
  var H6 = null;
  function sk6Hero(V) {
    if ($('sk6-hero')) return;
    H6 = el('section', 'sk6-hero'); H6.id = 'sk6-hero'; H6.setAttribute('aria-label', 'ภาพรวมเส้นทาง');
    H6.innerHTML =
      '<article class="sk6-glass sk6-setup sk6-tilt"><header><i class="b">' + G6.pinB + '</i><h2>ตั้งค่าเส้นทาง</h2></header>' +
      '<div class="row"><i class="o">' + G6.pinO + '</i><h3>จุดส่งสินค้า</h3><span class="cnt" id="sk6-cnt">0 จุด</span></div>' +
      '<div class="sk6-select" id="sk6-sel"><button type="button" class="sk6-selbtn" aria-haspopup="listbox" aria-expanded="false"><i class="w">' + G6.pinB + '</i><span>เลือกจุดส่งสินค้า...</span><i class="car">' + G6.caret + '</i></button><div class="sk6-opts" role="listbox"></div></div>' +
      '<button type="button" class="sk6-cta" data-go="planner"><i class="pl">' + G6.plane + '</i><span>เริ่มวางแผนเส้นทาง</span><i class="ar">' + G6.arrow + '</i><b class="spark" aria-hidden="true"></b></button>' +
      '<div class="sk6-mini"><button type="button" data-open="impbox">นำเข้า Excel / CSV</button><button type="button" data-click="drvbtn">โหมดคนขับ</button></div></article>' +
      '<div class="sk6-mapcard" id="sk6-mapcard"><div class="sk6-slab"><div class="sk6-mapslot" id="sk6-mapslot"></div><i class="edge"></i><i class="gloss"></i>' +
      '<button type="button" class="sk6-mapcover" data-go="planner" aria-label="เปิดแผนที่เต็มหน้าวางแผน"></button>' +
      '<div class="sk6-mapctl"><button type="button" data-mc="full" aria-label="เปิดแผนที่ในหน้าวางแผน">' + G6.full + '</button><button type="button" data-mc="in" aria-label="ซูมเข้า">' + G6.plus + '</button><button type="button" data-mc="out" aria-label="ซูมออก">' + G6.minus + '</button><button type="button" data-mc="layer" aria-label="สลับภาพดาวเทียม/แผนที่ถนน">' + G6.layers + '</button></div>' +
      '<div class="sk6-empty" id="sk6-mapempty"><b>ยังไม่มีเส้นทาง</b><span>เลือกจุดส่งแล้วกด "เริ่มวางแผนเส้นทาง"</span></div></div><i class="sk6-cloud"></i></div>' +
      '<div class="sk6-statcol">' +
      '<article class="sk6-glass sk6-st blue sk6-tilt"><i class="ic">' + G6.road + '</i><div><span>ระยะทางรวม</span><strong data-k="km">–</strong><small data-u="km">กิโลเมตร</small></div></article>' +
      '<article class="sk6-glass sk6-st orange sk6-tilt"><i class="ic">' + G6.fuel + '</i><div><span>ค่าน้ำมันโดยประมาณ</span><strong data-k="fuel">–</strong><small data-u="fuel">บาท</small></div></article>' +
      '<article class="sk6-glass sk6-st green sk6-tilt"><i class="ic">' + G6.clock + '</i><div><span>เวลาโดยประมาณ</span><strong data-k="tm">–</strong><small data-u="tm"></small></div></article></div>';
    V.insertBefore(H6, V.firstChild);
    // ส่วนเดิมของหน้าแรก (ภาพสถานที่ ราคาน้ำมัน ตัวเลขสรุป กราฟ) อยู่ถัดลงมาเป็นการ์ดกระจก
    var below = el('div', 'sk6-below'); below.id = 'sk6-below';
    // เรียงตามหน้าแรกของ v9: ภาพสถานที่ → ตัวเลขสรุป → กราฟ → ฟีเจอร์เด่น
    var hero = qs('.phero', V), st = $('sk-stats'), dash = $('sk-dash'), feat = qs(':scope > .feat', V);
    [hero, st, dash, feat].forEach(function (n) { if (n) below.appendChild(n); });
    V.appendChild(below);
    // เลือกจุดส่ง
    var sel = $('sk6-sel');
    qs('.sk6-selbtn', sel).addEventListener('click', function (e) { e.stopPropagation(); sk6Opts(); var o = sel.classList.toggle('open'); this.setAttribute('aria-expanded', o); });
    d.addEventListener('click', function (e) { if (!e.target.closest('#sk6-sel')) { sel.classList.remove('open'); qs('.sk6-selbtn', sel).setAttribute('aria-expanded', 'false'); } });
    qs('.sk6-opts', sel).addEventListener('click', function (e) {
      var o = e.target.closest('[data-i]'); if (!o) return;
      sel.classList.remove('open');
      var i = +o.getAttribute('data-i');
      if (i < 0) { go('planner', { target: $('sq') || $('plan'), fresh: true }); later(function () { var q = $('sq'); if (q) q.focus(); }, 400); return; }
      var chip = qsa('#chips .stopchip')[i];
      qs('.sk6-selbtn span', sel).textContent = txt(o);
      go('planner', { target: chip || $('chips'), fresh: true });
    });
    // ปุ่มแผนที่
    qs('.sk6-mapctl', H6).addEventListener('click', function (e) {
      var b = e.target.closest('[data-mc]'); if (!b) return; e.stopPropagation();
      var k = b.getAttribute('data-mc');
      if (k === 'full') go('planner');
      else if (k === 'in' && LMAP) LMAP.zoomIn();
      else if (k === 'out' && LMAP) LMAP.zoomOut();
      else if (k === 'layer') { var t = qs('.sk-mm [data-mm="sat"]'); if (t) t.click(); }
      b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
    });
    sk6Tilt(H6);
  }
  function sk6Opts() {
    var box = qs('#sk6-sel .sk6-opts'); if (!box) return;
    var chips = qsa('#chips .stopchip');
    box.innerHTML = (chips.length ? chips.map(function (c, i) {
      var n = txt(qs('.nm, b, span', c)) || txt(c);
      return '<button type="button" role="option" data-i="' + i + '"><b>' + (i + 1) + '</b>' + esc(n.replace(/^\d+\s*/, '').slice(0, 40)) + '</button>';
    }).join('') : '<p>ยังไม่มีจุดส่งในแผนนี้</p>') + '<button type="button" class="add" data-i="-1">+ เพิ่มจุดส่งใหม่</button>';
  }
  // แผนที่ตัวเดียวกันย้ายไปมาระหว่างหน้าหลัก (การ์ดลอย) กับหน้าวางแผน (ใช้งานเต็ม)
  function sk6MapPlace(v) {
    var wrap = qs('.mapwrap'), slot = $('sk6-mapslot'), home = $('t-map'); if (!wrap || !slot || !home) return;
    var want = v === 'dashboard' ? slot : home;
    if (wrap.parentNode === want) return;
    if (want === home) home.insertBefore(wrap, qs('.key', home) || home.firstChild); else slot.appendChild(wrap);
    d.documentElement.classList.toggle('sk6-maphome', v === 'dashboard');
    refitNext = true; GEO = '';
    later(nudgeMap, 20); later(function () { nudgeMap(); var fb = $('fitb'); if (fb) fb.click(); }, 380);
  }
  function sk6Stats() {
    if (!H6) return;
    var n = qsa('#chips .stopchip').length, cnt = $('sk6-cnt'); if (cnt) cnt.textContent = n + ' จุด';
    var R = resRows(), fk = Object.keys(R).filter(function (k) { return /^ค่า(น้ำมัน|ไฟ)ต่อวัน/.test(k); })[0];
    var km = S.km && S.km.last, tm = S.tm && S.tm.last;
    var put = function (k, v, u) {
      var s = qs('[data-k="' + k + '"]', H6), us = qs('[data-u="' + k + '"]', H6); if (!s) return;
      if (s.__last === v + '|' + u) return; s.__last = v + '|' + u;
      if (/^-?[\d,]+(\.\d+)?$/.test(String(v))) { s.__v = 0; countTo(s, v, ''); } else s.textContent = v;
      if (us) us.textContent = u;
      var card = s.closest('.sk6-st'); if (card && v !== '–') { card.classList.remove('bump'); void card.offsetWidth; card.classList.add('bump'); }
    };
    if (km && km[0] !== '–') { var kv = num(km[0]); put('km', isFinite(kv) ? kv.toFixed(2) : km[0], /กม/.test(km[1] || '') || !km[1] ? 'กิโลเมตร' : km[1]); } else put('km', '–', 'กิโลเมตร');
    if (fk) { var fv = num(R[fk]); put('fuel', isFinite(fv) ? fv.toFixed(2) : split(R[fk])[0], /ไฟ/.test(fk) ? 'บาท (ค่าไฟ/วัน)' : 'บาท'); } else put('fuel', '–', 'บาท');
    if (tm && tm[0] !== '–') put('tm', tm[0], ''); else put('tm', '–', '');
    var me = $('sk6-mapempty'); if (me) me.hidden = n > 1 || !!(km && km[0] !== '–');
  }
  // การ์ดเอียงตามเมาส์ + แสงสะท้อนวิ่งตามนิ้ว
  function sk6Tilt(root) {
    if (RM || !W.matchMedia || !W.matchMedia('(hover:hover)').matches) return;
    root.addEventListener('pointermove', function (e) {
      var c = e.target.closest('.sk6-tilt, .sk6-mapcard'); if (!c) return;
      var r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      c.style.setProperty('--px', (x - 0.5).toFixed(3)); c.style.setProperty('--py', (y - 0.5).toFixed(3));
      c.style.setProperty('--gx', (x * 100).toFixed(1) + '%'); c.style.setProperty('--gy', (y * 100).toFixed(1) + '%');
      c.classList.add('hov');
    });
    root.addEventListener('pointerout', function (e) { var c = e.target.closest('.sk6-tilt, .sk6-mapcard'); if (c && !c.contains(e.relatedTarget)) { c.style.setProperty('--px', 0); c.style.setProperty('--py', 0); c.classList.remove('hov'); } });
  }
  function sk6Wire() {
    // ฉากหลังขยับตามเมาส์เล็กน้อย (พารัลแลกซ์) และตามการเลื่อนหน้า
    var bg = $('sk-bg');
    if (bg && !RM) {
      var tx = 0, ty = 0, raf = 0;
      W.addEventListener('pointermove', function (e) {
        tx = e.clientX / W.innerWidth - 0.5; ty = e.clientY / W.innerHeight - 0.5;
        if (!raf) raf = requestAnimationFrame(function () { raf = 0; bg.style.setProperty('--mx', tx.toFixed(3)); bg.style.setProperty('--my', ty.toFixed(3)); });
      }, { passive: true });
      W.addEventListener('scroll', function () { bg.style.setProperty('--sy', Math.min(1, (W.pageYOffset || 0) / 900).toFixed(3)); }, { passive: true });
    }
    // กดปุ่ม: ยุบลงแล้วเด้ง + วงแสง + ประกายไฟที่ปุ่มหลัก
    if (!RM) d.addEventListener('pointerdown', function (e) {
      var b = e.target.closest('button, .btn, a.cta, .sk6-main, .stopchip'); if (!b || b.disabled || b.closest('.leaflet-container')) return;
      // ปุ่มแบบคีย์แคป 3D ยุบลงด้วย :active อยู่แล้ว ส่วนอื่นเด้งแบบเดิม
      if (!b.matches(G7KEY)) { b.classList.remove('sk6-press'); void b.offsetWidth; b.classList.add('sk6-press'); setTimeout(function () { b.classList.remove('sk6-press'); }, 520); }
      var ring = el('i', 'sk6-ring'); ring.setAttribute('aria-hidden', 'true');
      ring.style.left = e.clientX + 'px'; ring.style.top = e.clientY + 'px'; d.body.appendChild(ring);
      setTimeout(function () { if (ring.parentNode) ring.parentNode.removeChild(ring); }, 700);
      if (b.classList.contains('sk6-cta') || b.classList.contains('cta') || b.classList.contains('primary')) sk6Burst(e.clientX, e.clientY);
    }, { passive: true });
    W.addEventListener('resize', debounce(sk6Ind, 120));
    if (d.fonts && d.fonts.ready) d.fonts.ready.then(sk6Ind);
    safe(g7Spot); safe(g7Light);
  }
  /* ================= v11: หน้าอื่นเป็น 3D แบบไม่เอียง + ลูกเล่น (หน้าแรกเท่านั้นที่เอียง) ================= */
  var G7KEY = '.primary, .navybtn, .linebtn, .ghost, .sk-act, .drvbtn, a.cta, .sk-seg button, .vt button, .sk6-mini button, .sk6-mapctl button';
  var G7SPOT = '.sk-card:not(.sk-profile), .panel, .hist, .fbox, .capbox, #more section, .hday, .hsum';
  var G7REV = '.sk-card, .hist, .fbox, .capbox, #more section, .sk-kpi, .sk-sechead, #hlist > *, #about > *';
  // แสงสะท้อน + ขอบเรืองแสงวิ่งตามเมาส์บนการ์ด (การ์ดไม่เอียง)
  function g7Spot() {
    if (RM || !W.matchMedia || !W.matchMedia('(hover:hover)').matches) return;
    var last = null, raf = 0, ex = 0, ey = 0, tg = null;
    d.addEventListener('pointermove', function (e) {
      ex = e.clientX; ey = e.clientY; tg = e.target;
      if (raf) return;
      raf = requestAnimationFrame(function () {
        raf = 0;
        var c = tg && tg.closest ? tg.closest(G7SPOT) : null;
        if (c && c.closest('#sk6-hero')) c = null;
        if (last && last !== c) last.classList.remove('g7-hot');
        last = c; if (!c) return;
        var r = c.getBoundingClientRect(); if (!r.width) return;
        c.style.setProperty('--gx', ((ex - r.left) / r.width * 100).toFixed(1) + '%');
        c.style.setProperty('--gy', ((ey - r.top) / r.height * 100).toFixed(1) + '%');
        c.classList.add('g7-hot');
      });
    }, { passive: true });
    d.addEventListener('pointerleave', function () { if (last) last.classList.remove('g7-hot'); last = null; });
  }
  // แสงนวลตามเมาส์บนฉากหลัง
  function g7Light() {
    if (RM || !W.matchMedia || !W.matchMedia('(hover:hover)').matches || $('g7-light')) return;
    var L = el('div', 'g7-light'); L.id = 'g7-light'; L.setAttribute('aria-hidden', 'true'); d.body.appendChild(L);
    var raf = 0, x = 0, y = 0;
    W.addEventListener('pointermove', function (e) {
      x = e.clientX; y = e.clientY; if (raf) return;
      raf = requestAnimationFrame(function () { raf = 0; L.style.transform = 'translate3d(' + (x - 300) + 'px,' + (y - 300) + 'px,0)'; L.classList.add('on'); });
    }, { passive: true });
  }
  // การ์ดที่อยู่ล่างจอค่อยๆ ลอยขึ้นมาเมื่อเลื่อนถึง
  var G7RV = null;
  function g7Reveal(v) {
    if (RM || !W.IntersectionObserver || v === 'dashboard') return;
    if (!G7RV) G7RV = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        var t = e.target; G7RV.unobserve(t); t.classList.add('g7-in');
        setTimeout(function () { t.classList.remove('g7-rv', 'g7-in'); }, 950);
      });
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0.04 });
    var V = VIEW[v]; if (!V) return;
    var H = W.innerHeight || 800;
    qsa(G7REV, V).forEach(function (c) {
      if (c.__g7rv || c.closest('.g7-rv')) return;
      var r = c.getBoundingClientRect();
      if (!r.height || r.top < H * 0.95) return;
      c.__g7rv = 1; c.classList.add('g7-rv'); G7RV.observe(c);
    });
  }
  // เปลี่ยนหน้า: แสงกวาดผ่านจอ + ไอคอนหัวหน้าพลิก
  var G7FIRST = true;
  function g7Switch(v) {
    if (G7FIRST) { G7FIRST = false; return; }
    if (RM) return;
    var sw = $('g7-sweep');
    if (!sw) { sw = el('i', 'g7-sweep'); sw.id = 'g7-sweep'; sw.setAttribute('aria-hidden', 'true'); d.body.appendChild(sw); }
    sw.classList.remove('go'); void sw.offsetWidth; sw.classList.add('go');
    var ti = qs('.sk-tb-ic'); if (ti) { ti.classList.remove('g7-flip'); void ti.offsetWidth; ti.classList.add('g7-flip'); }
    var tb = $('sk-topbar'); if (tb) { tb.classList.remove('g7-shine'); void tb.offsetWidth; tb.classList.add('g7-shine'); clearTimeout(tb.__g7t); tb.__g7t = setTimeout(function () { tb.classList.remove('g7-shine'); }, 1600); }
  }
  function sk6Burst(x, y) {
    for (var i = 0; i < 14; i++) {
      var s = el('i', 'sk6-spark'); s.setAttribute('aria-hidden', 'true');
      var a = Math.PI * 2 * i / 14 + Math.random() * 0.4, r = 40 + Math.random() * 46;
      s.style.left = x + 'px'; s.style.top = y + 'px';
      s.style.setProperty('--dx', (Math.cos(a) * r).toFixed(1) + 'px'); s.style.setProperty('--dy', (Math.sin(a) * r).toFixed(1) + 'px');
      s.style.background = ['#ffd27a', '#ff8a1f', '#7fd0ff', '#ffffff'][i % 4];
      d.body.appendChild(s);
      setTimeout(function (n) { return function () { if (n.parentNode) n.parentNode.removeChild(n); }; }(s), 800);
    }
  }

  /* ---------------- เริ่มทำงาน ---------------- */
  function init() {
    if (!build()) { reveal(); return; }
    safe(buildDashboard);
    safe(buildPlanner);
    safe(buildMapMode);
    safe(buildStats);
    safe(buildHistory);
    safe(buildAccount);
    safe(buildAccuracy);
    safe(buildAbout);
    safe(wire);
    safe(sk6Wire);
    safe(update);
    go(viewOfHash(location.hash) || 'dashboard', { noPush: true });
    try { history.replaceState({ skv: cur }, '', '#' + cur); } catch (e) {}
    W.addEventListener('load', function () { safe(update); moveGlow(); if (cur === 'planner') nudgeMap(); });
    if (d.fonts && d.fonts.ready) d.fonts.ready.then(function () { moveGlow(); renderView(cur, false); });
    later(moveGlow, 300);
    // รอให้หน้าแรกเรนเดอร์เนื้อหาครบ (renderView ที่ 40ms, g7Reveal ที่ 140ms) แล้วค่อยแสดง จะไม่เห็นโครงเก่า/ครึ่งๆ กลางๆ
    later(reveal, 220);
  }
  function reveal() {
    var h = d.documentElement; if (h.classList.contains('sk-ready')) return;
    var show = function () { h.classList.add('sk-ready'); };
    if (W.requestAnimationFrame) W.requestAnimationFrame(function () { W.requestAnimationFrame(show); }); else show();
    setTimeout(show, 600); // กัน rAF ถูกหยุดในแท็บเบื้องหลัง
  }

  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', init);
  else init();
})();
