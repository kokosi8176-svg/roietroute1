/* ROI ET ROUTE — แผนที่ในหน้านำทางเมื่อโหลดแผนที่ออนไลน์ไม่ได้ (เช่น หน้าตัวอย่างบน claude.ai)
   วาดจากข้อมูลจริงที่ฝังมากับเว็บอยู่แล้ว (MAPDATA: ถนน แหล่งน้ำ แม่น้ำ หมู่บ้าน สถานที่ จาก OpenStreetMap)
   + เขตอำเภอ/ตำบล (roiet-basemap.json © OpenGISData-Thailand, CC BY 4.0)
   วาดเป็นไทล์ทีละแผ่น (ลื่นเหมือนแผนที่ออนไลน์) ชื่อถนน/สถานที่ให้หน้านำทางวาดตั้งตรงบนจอ
   และใช้ถนนชุดเดียวกันคำนวณเส้นทางนำทางในหน้าตัวอย่าง (เว็บจริงใช้ OSRM ตามเดิม)
   ไฟล์นี้ไม่แตะระบบเดิมของเว็บ: ทำงานเฉพาะแผนที่ในหน้านำทาง */
(function () {
  'use strict';
  var W = window, L = W.L;
  if (!L || !L.TileLayer || L.__rrBase) return;
  L.__rrBase = true;
  var R2 = Math.PI / 180;
  function hav(a, b) { var x = Math.sin((b[0] - a[0]) * R2 / 2), y = Math.sin((b[1] - a[1]) * R2 / 2), h = x * x + Math.cos(a[0] * R2) * Math.cos(b[0] * R2) * y * y; return 12742000 * Math.asin(Math.sqrt(h)); }
  function brg(a, b) { var dl = (b[1] - a[1]) * R2; return (Math.atan2(Math.sin(dl) * Math.cos(b[0] * R2), Math.cos(a[0] * R2) * Math.sin(b[0] * R2) - Math.sin(a[0] * R2) * Math.cos(b[0] * R2) * Math.cos(dl)) / R2 + 360) % 360; }
  function dec(e) { var o = [], la = 0, lo = 0; for (var i = 0; i < e.length; i += 2) { la += e[i]; lo += e[i + 1]; o.push([la / 1e5, lo / 1e5]); } return o; }
  // พิกัดแบบเว็บแมป (ซูม 0 = 256 พิกเซล)
  function px(p) { var s = Math.sin(p[0] * R2); return [(p[1] + 180) / 360 * 256, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 256]; }

  /* ---------- ข้อมูล ---------- */
  var MD = null, ROADS = null, BND = null, BP = null, G = null, F = null, LBL = null;
  function md() {
    if (MD) return MD;
    var m = W.MAPDATA; if (!m || !m.roads) return null;
    MD = m;
    ROADS = m.roads.map(function (r) { return { c: Math.min(4, Math.max(0, r[0] | 0)), ow: r[1], ref: (r[2] || '').split(';')[0], name: r[3] || '', pts: dec(r[4]) }; });
    return MD;
  }
  function bounds() {
    return BP || (BP = fetch('roiet-basemap.json').then(function (r) { return r.ok ? r.json() : null; }).then(function (d) { BND = d; F = null; return d; }, function () { return null; }));
  }
  // ดัชนีพื้นที่: แบ่งตารางขนาดเท่าไทล์ซูม 11 เก็บว่าแต่ละช่องมีอะไรบ้าง
  var CELL = 256 / 2048;
  function feats() {
    if (F) return F;
    md();
    F = { list: [], grid: {} };
    var add = function (kind, rings, extra) {
      var minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
      var xy = rings.map(function (r) { var a = new Float64Array(r.length * 2); r.forEach(function (p, i) { var q = px(p); a[i * 2] = q[0]; a[i * 2 + 1] = q[1]; if (q[0] < minx) minx = q[0]; if (q[0] > maxx) maxx = q[0]; if (q[1] < miny) miny = q[1]; if (q[1] > maxy) maxy = q[1]; }); return a; });
      var f = L.extend({ k: kind, xy: xy, id: F.list.length }, extra || {});
      F.list.push(f);
      for (var gx = Math.floor(minx / CELL); gx <= Math.floor(maxx / CELL); gx++) for (var gy = Math.floor(miny / CELL); gy <= Math.floor(maxy / CELL); gy++) (F.grid[gx + ':' + gy] = F.grid[gx + ':' + gy] || []).push(f.id);
    };
    var hash = function (s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };
    if (BND) {
      BND.tam.forEach(function (t) { t.g.forEach(function (poly) { add('tam', poly.map(function (r) { return r.map(function (q) { return [q[1], q[0]]; }); }), { tone: hash(t.n + t.a) % 5 }); }); });
      BND.amp.forEach(function (a) { a.g.forEach(function (poly) { add('amp', poly.map(function (r) { return r.map(function (q) { return [q[1], q[0]]; }); })); }); });
    }
    MD.water.forEach(function (e) { add('water', [dec(e)]); });
    MD.rivers.forEach(function (e) { add('river', [dec(e)]); });
    ROADS.forEach(function (r) { add('road', [r.pts], { c: r.c, det: r.det }); });
    // ชุมชน/หมู่บ้าน และจุดสถานที่ (วาดเป็นวงชุมชนกับจุดสีบนพื้น)
    (MD.places || []).forEach(function (pl) {
      var k = pl[2], ll = [pl[3], pl[4]];
      if (k === 'village' || k === 'hamlet' || k === 'suburb' || k === 'town') add('vil', [[ll]], { r: k === 'hamlet' ? 140 : k === 'village' ? 260 : 600 });
      else if (PCOL[k]) add('poi', [[ll]], { col: PCOL[k] });
    });
    (MD.towns || []).forEach(function (t) { add('vil', [[[t[1], t[2]]]], { r: 1100 }); });
    return F;
  }

  var PCOL = { temple: '#f2b632', school: '#4f8ff7', health: '#ff5d6c', fuel: '#2fbf71', food: '#ff8a3d', shop: '#b06ef5', gov: '#8a9bb5' };
  /* ---------- สี ---------- */
  var DAY = { vil: 'rgba(238,224,196,.95)', vilEdge: 'rgba(205,184,148,.9)', land: '#dde8c6', tones: ['#cfe3b0', '#dbe9c2', '#c8deaa', '#e3edcc', '#d3e5b8'], tam: 'rgba(110,135,80,.35)', amp: 'rgba(85,105,60,.65)', water: '#86c3e6', waterEdge: '#6aaed6', river: '#7dbde3',
    c: [['#c76a12', '#f9a33c'], ['#c99a3c', '#fdd477'], ['#b9bfac', '#ffffff'], ['#c3c8b6', '#ffffff'], ['#c9cdbd', '#fbfbf6']] };
  var NIGHT = { vil: 'rgba(58,72,98,.9)', vilEdge: 'rgba(92,110,140,.55)', land: '#152031', tones: ['#172539', '#1b2b42', '#152234', '#1e2f47', '#19283d'], tam: 'rgba(140,165,205,.16)', amp: 'rgba(160,185,225,.35)', water: '#1f4a75', waterEdge: '#2b5d8e', river: '#2a6197',
    c: [['#0a1220', '#e6953c'], ['#0a1220', '#b98a4c'], ['#0a1220', '#5f6f89'], ['#0a1220', '#4f5d75'], ['#0a1220', '#46536a']] };
  var SAT = { vil: 'rgba(120,110,90,.75)', vilEdge: 'rgba(170,160,130,.5)', land: '#2b3324', tones: ['#2f3a27', '#34402b', '#2a3522', '#38442d', '#303b26'], tam: 'rgba(230,240,200,.18)', amp: 'rgba(240,245,220,.4)', water: '#1d3f55', waterEdge: '#2a5670', river: '#2e6a8a',
    c: [['#2a1a05', '#f2a541'], ['#2a1a05', '#e8c77c'], ['#1a1a14', '#d9d6c7'], ['#1a1a14', '#bfbcae'], ['#1a1a14', '#a9a698']] };
  function palOf(map) { var root = map.getContainer().closest('.rn-root'), cn = root ? root.className : ''; return /theme-day/.test(cn) ? DAY : /theme-sat/.test(cn) ? SAT : NIGHT; }

  /* ---------- ไทล์ ---------- */
  var queue = [], qRun = false;
  function pump() {
    qRun = true;
    var t0 = performance.now();
    while (queue.length && performance.now() - t0 < 7) { var j = queue.shift(); if (j.ok()) { j.draw(); } j.done(); }
    if (queue.length) requestAnimationFrame(pump); else qRun = false;
  }
  var Base = L.GridLayer.extend({
    options: { tileSize: 256, pane: 'rrbase', keepBuffer: 3, updateWhenIdle: false, updateWhenZooming: false, maxZoom: 20, className: 'rr-base' },
    createTile: function (coords, done) {
      var self = this, sz = this.getTileSize(), dpr = 1, cv = document.createElement('canvas');
      cv.width = sz.x * dpr; cv.height = sz.y * dpr;
      queue.push({ ok: function () { return !!self._map; }, draw: function () { drawTile(cv.getContext('2d'), coords, dpr, self.pal); }, done: function () { done(null, cv); } });
      if (!qRun) requestAnimationFrame(pump);
      return cv;
    },
  });
  function path(ctx, a, s, ox, oy, close) {
    ctx.moveTo(a[0] * s - ox, a[1] * s - oy);
    for (var i = 2; i < a.length; i += 2) ctx.lineTo(a[i] * s - ox, a[i + 1] * s - oy);
    if (close) ctx.closePath();
  }
  function drawTile(ctx, co, dpr, P) {
    var f = feats(), z = co.z, s = Math.pow(2, z), ox = co.x * 256, oy = co.y * 256;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = P.land; ctx.fillRect(0, 0, 256, 256);
    var mpp = 156543.03 * Math.cos(15.9 * R2) / s; // เมตรต่อพิกเซลที่ร้อยเอ็ด
    var pad = Math.max(24, 1150 / mpp) / s, x0 = ox / s - pad, y0 = oy / s - pad, x1 = (ox + 256) / s + pad, y1 = (oy + 256) / s + pad, seen = {}, by = { tam: [], amp: [], water: [], river: [], vil: [], poi: [], road: [[], [], [], [], []] };
    for (var gx = Math.floor(x0 / CELL); gx <= Math.floor(x1 / CELL); gx++) for (var gy = Math.floor(y0 / CELL); gy <= Math.floor(y1 / CELL); gy++) {
      var cell = f.grid[gx + ':' + gy]; if (!cell) continue;
      for (var i = 0; i < cell.length; i++) { var id = cell[i]; if (seen[id]) continue; seen[id] = 1; var ft = f.list[id]; if (ft.k === 'road') { if (ft.det && z < 13) continue; by.road[ft.c].push(ft); } else by[ft.k].push(ft); }
    }
    var zf = Math.pow(2, (z - 15) * 0.62);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    by.tam.forEach(function (ft) { ctx.beginPath(); ft.xy.forEach(function (r) { path(ctx, r, s, ox, oy, true); }); ctx.fillStyle = P.tones[ft.tone]; ctx.fill('evenodd'); });
    if (z >= 11) { ctx.setLineDash([3, 5]); ctx.strokeStyle = P.tam; ctx.lineWidth = 1; by.tam.forEach(function (ft) { ctx.beginPath(); ft.xy.forEach(function (r) { path(ctx, r, s, ox, oy, true); }); ctx.stroke(); }); ctx.setLineDash([]); }
    ctx.strokeStyle = P.amp; ctx.lineWidth = 1.8; by.amp.forEach(function (ft) { ctx.beginPath(); ft.xy.forEach(function (r) { path(ctx, r, s, ox, oy, true); }); ctx.stroke(); });
    // วงชุมชน: พื้นที่บ้านเรือนรอบจุดหมู่บ้าน (ขนาดตามประเภท)
    if (z >= 10) by.vil.forEach(function (ft) {
      var x = ft.xy[0][0] * s - ox, y = ft.xy[0][1] * s - oy, rr = ft.r / mpp; if (rr < 1.5) return;
      var g = ctx.createRadialGradient(x, y, rr * 0.2, x, y, rr);
      g.addColorStop(0, P.vil); g.addColorStop(0.7, P.vil); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rr, 0, 7); ctx.fill();
    });
    ctx.fillStyle = P.water; ctx.strokeStyle = P.waterEdge; ctx.lineWidth = 1;
    by.water.forEach(function (ft) { ctx.beginPath(); ft.xy.forEach(function (r) { path(ctx, r, s, ox, oy, true); }); ctx.fill(); ctx.stroke(); });
    ctx.strokeStyle = P.river; ctx.lineWidth = Math.max(1.5, 5 * zf); by.river.forEach(function (ft) { ctx.beginPath(); path(ctx, ft.xy[0], s, ox, oy); ctx.stroke(); });
    var BW = [10, 8.5, 7, 6, 4.5];
    for (var pass = 0; pass < 2; pass++) for (var c = 4; c >= 0; c--) {
      var list = by.road[c]; if (!list.length) continue;
      if (z < 11 && c >= 3) continue;
      var w = Math.max(c <= 1 ? 1.6 : 0.8, BW[c] * zf);
      ctx.strokeStyle = P.c[c][pass]; ctx.lineWidth = pass ? w : w + Math.max(1.2, w * 0.35);
      ctx.beginPath(); list.forEach(function (ft) { path(ctx, ft.xy[0], s, ox, oy); }); ctx.stroke();
      if (pass && c <= 1 && z >= 13) { ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = Math.max(1, w * 0.18); ctx.beginPath(); list.forEach(function (ft) { path(ctx, ft.xy[0], s, ox, oy); }); ctx.stroke(); }
    }
    drawPois(ctx, by, s, ox, oy, z);
  }

  function drawPois(ctx, by, s, ox, oy, z) {
    if (z < 14.5) return;
    by.poi.forEach(function (ft) { var x = ft.xy[0][0] * s - ox, y = ft.xy[0][1] * s - oy; ctx.beginPath(); ctx.arc(x, y, 4.2, 0, 7); ctx.fillStyle = '#fff'; ctx.fill(); ctx.beginPath(); ctx.arc(x, y, 3, 0, 7); ctx.fillStyle = ft.col; ctx.fill(); });
  }
  /* ---------- เปิดใช้เมื่อไทล์ของหน้านำทางโหลดไม่ได้ ---------- */
  function navMap(map) { var c = map && map.getContainer && map.getContainer(); return !!(c && c.closest && c.closest('.rn-root')); }
  L.TileLayer.addInitHook(function () {
    var tl = this, ok = 0, bad = 0;
    tl.on('tileload', function () { ok++; });
    tl.on('tileerror', function () { bad++; if (bad >= 4 && !ok && tl._map && navMap(tl._map)) enable(tl._map); });
    tl.on('add', function () { var m = tl._map; if (m && m.__rrBase) setTimeout(function () { restyle(m); }, 30); });
  });
  function enable(map) {
    if (map.__rrBase || !md()) return;
    if (!map.getPane('rrbase')) map.createPane('rrbase').style.zIndex = 210;
    var layer = new Base(); layer.pal = palOf(map);
    map.__rrBase = { layer: layer }; DMAPS.push(map);
    layer.addTo(map);
    map.getContainer().style.background = layer.pal.land;
    W.RR_BASEMAP = true;
    setTimeout(function () { feats(); labels(); }, 0); // เตรียมข้อมูลไว้ก่อน ไม่ให้สะดุดตอนขับ
    var note = document.getElementById('rn-tilenote'); if (note) note.hidden = true;
    bounds().then(function () { F = null; restyle(map, true); });
    var attr = document.getElementById('rn-attr');
    if (attr) attr.textContent = 'ข้อมูลแผนที่ © ผู้ร่วมพัฒนา OpenStreetMap · เขตอำเภอ/ตำบล © OpenGISData-Thailand (CC BY 4.0)';
  }
  function restyle(map, force) {
    var st = map.__rrBase; if (!st) return;
    var p = palOf(map); if (p === st.layer.pal && !force) { var at = document.getElementById('rn-attr'); if (at) at.textContent = 'ข้อมูลแผนที่ © ผู้ร่วมพัฒนา OpenStreetMap · เขตอำเภอ/ตำบล © OpenGISData-Thailand (CC BY 4.0)'; return; }
    st.layer.pal = p; map.getContainer().style.background = p.land; st.layer.redraw();
    var attr = document.getElementById('rn-attr');
    if (attr) attr.textContent = 'ข้อมูลแผนที่ © ผู้ร่วมพัฒนา OpenStreetMap · เขตอำเภอ/ตำบล © OpenGISData-Thailand (CC BY 4.0)';
  }

  /* ---------- ชื่อถนน/สถานที่ ให้หน้านำทางวาดตั้งตรงบนจอ ---------- */
  var ICON = { temple: '🛕', school: '🏫', health: '🏥', fuel: '⛽', food: '🍜', shop: '🛒', gov: '🏛️', market: '🧺', bank: '🏦', cafe: '☕', police: '👮' };
  function labels() {
    if (LBL) return LBL;
    md();
    var list = [], grid = {}, G2 = 0.01;
    var put = function (o) { o.i = list.length; list.push(o); var k = Math.floor(o.ll[0] / G2) + ':' + Math.floor(o.ll[1] / G2); (grid[k] = grid[k] || []).push(o.i); };
    // ชื่อถนน: วางทุก ~700 ม. ตามแนวถนน
    var byName = {};
    ROADS.forEach(function (r) {
      var key = r.name || r.ref; if (!key || r.pts.length < 2) return;
      var acc = 0, next = 120;
      for (var i = 1; i < r.pts.length; i++) {
        var d = hav(r.pts[i - 1], r.pts[i]); acc += d;
        if (acc >= next) {
          var ll = r.pts[i], near = (byName[key] || []).some(function (q) { return hav(q, ll) < 650; });
          if (!near) { (byName[key] = byName[key] || []).push(ll); put({ t: r.name || r.ref, ll: ll, k: r.name ? 'road' : 'ref', c: r.c, p: r.name ? 60 - r.c * 8 : 52 - r.c * 6, br: brg(r.pts[i - 1], r.pts[i]) }); }
          next = acc + 700;
        }
      }
    });
    (MD.places || []).forEach(function (pl) {
      var k = pl[2], ll = [pl[3], pl[4]];
      if (k === 'road' || !/[\u0E00-\u0E7F]/.test(pl[0] || '')) return; // เอาเฉพาะชื่อภาษาไทย
      if (k === 'village' || k === 'hamlet' || k === 'suburb' || k === 'town') put({ t: pl[0], ll: ll, k: 'vil', p: 40 });
      else if (ICON[k]) put({ t: pl[0], ll: ll, k: 'poi', ic: ICON[k], p: k === 'fuel' || k === 'health' ? 48 : 30 });
    });
    (MD.towns || []).forEach(function (t) { put({ t: t[0], ll: [t[1], t[2]], k: 'town', p: 90 }); });
    LBL = { list: list, grid: grid, G: G2 };
    return LBL;
  }
  // รายการชื่อรอบตำแหน่งที่ขอ (หน้านำทางเรียกทุกครึ่งวินาที)
  W.RR_BASELABELS = function (ll, radiusM, zoom) {
    if (!md()) return [];
    var L2 = labels(), out = [], g = L2.G, r = Math.ceil(radiusM / 1000 / 1.1 / g) + 1, cy = Math.floor(ll[0] / g), cx = Math.floor(ll[1] / g);
    for (var y = cy - r; y <= cy + r; y++) for (var x = cx - r; x <= cx + r; x++) {
      var cell = L2.grid[y + ':' + x]; if (!cell) continue;
      cell.forEach(function (i) {
        var o = L2.list[i];
        if (o.k === 'poi' && zoom < 15.5) return;
        if (o.k === 'vil' && zoom < 13.5) return;
        if ((o.k === 'road' || o.k === 'ref') && o.c >= 3 && zoom < 15) return;
        if (hav(ll, o.ll) <= radiusM) out.push(o);
      });
    }
    out.sort(function (a, b) { return b.p - a.p; });
    return out.slice(0, 160);
  };

  /* ---------- ซอยและถนนในหมู่บ้าน: ดึงจาก OpenStreetMap ตามเส้นทางที่จะขับ เก็บไว้ในเครื่อง ----------
     ข้อมูลที่ฝังมากับเว็บมีเฉพาะถนนหลัก/ถนนในเมือง เมื่อออนไลน์ ระบบจะดึงซอย/ถนนหมู่บ้าน
     รอบเส้นทางและรอบจุดส่ง (ช่องละ ~4.5 กม.) จาก Overpass API แล้วเก็บใน IndexedDB 30 วัน
     ตอนเน็ตหลุด แผนที่สำรองและการหาเส้นทางในเครื่องจึงมีซอยครบขึ้น */
  var DCELL = 0.04, DTTL = 30 * 864e5, DLOADED = {}, DQ = [], DBUSY = false, DMAPS = [], DREDRAW = 0;
  var OVERPASS = W.RR_OVERPASS || 'https://overpass-api.de/api/interpreter';
  var DKIND = { residential: 1, unclassified: 1, living_street: 1, service: 1, track: 1, road: 1 };
  function idb() {
    return idb.p || (idb.p = new Promise(function (ok) {
      try {
        var rq = indexedDB.open('roiet-osm', 1);
        rq.onupgradeneeded = function () { rq.result.createObjectStore('cells'); };
        rq.onsuccess = function () { ok(rq.result); }; rq.onerror = function () { ok(null); };
      } catch (e) { ok(null); }
    }));
  }
  function idbGet(k) { return idb().then(function (db) { return db ? new Promise(function (ok) { try { var r = db.transaction('cells').objectStore('cells').get(k); r.onsuccess = function () { ok(r.result || null); }; r.onerror = function () { ok(null); }; } catch (e) { ok(null); } }) : null; }); }
  function idbPut(k, v) { return idb().then(function (db) { if (db) try { db.transaction('cells', 'readwrite').objectStore('cells').put(v, k); } catch (e) {} }); }
  function ckey(la, lo) { return Math.floor(la / DCELL) + ':' + Math.floor(lo / DCELL); }
  function addCell(k, roads) {
    if (DLOADED[k]) return; DLOADED[k] = roads.length;
    if (!md() || !roads.length) return;
    roads.forEach(function (r) { ROADS.push({ c: 4, ow: r.ow, ref: r.ref || '', name: r.n || '', pts: r.p, lanes: r.l || 0, det: 1 }); });
    F = null; G = null; LBL = null;
    clearTimeout(DREDRAW);
    DREDRAW = setTimeout(function () { DMAPS.forEach(function (m) { if (m.__rrBase && m._loaded) m.__rrBase.layer.redraw(); }); }, 1200);
  }
  function fetchCell(k) {
    var a = k.split(':').map(Number), s = a[0] * DCELL, w = a[1] * DCELL, n = s + DCELL, e = w + DCELL;
    var q = '[out:json][timeout:25];way["highway"~"^(residential|unclassified|living_street|service|track|road)$"]["service"!~"parking_aisle|driveway|drive-through"]["access"!~"private|no"](' + s.toFixed(3) + ',' + w.toFixed(3) + ',' + n.toFixed(3) + ',' + e.toFixed(3) + ');out geom tags;';
    return fetch(OVERPASS, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })
      .then(function (r) { if (!r.ok) throw new Error('overpass ' + r.status); return r.json(); })
      .then(function (j) {
        var roads = (j.elements || []).filter(function (x) { return x.type === 'way' && x.geometry && x.geometry.length > 1 && DKIND[(x.tags || {}).highway]; }).map(function (x) {
          var t = x.tags || {}, ow = t.oneway === 'yes' || t.oneway === '1' ? 1 : t.oneway === '-1' ? -1 : 0;
          return { n: t['name:th'] || t.name || '', ref: t.ref || '', ow: ow, l: +t.lanes || 0, p: x.geometry.map(function (g) { return [Math.round(g.lat * 1e5) / 1e5, Math.round(g.lon * 1e5) / 1e5]; }) };
        });
        idbPut(k, { t: Date.now(), roads: roads });
        addCell(k, roads);
        return roads.length;
      });
  }
  function pumpDetail() {
    if (DBUSY || !DQ.length) return;
    if (navigator.onLine === false) { DQ.length = 0; return; }
    DBUSY = true;
    var k = DQ.shift();
    fetchCell(k).catch(function () { DQ.length = 0; }).then(function () { DBUSY = false; setTimeout(pumpDetail, 1500); }); // ถ้าดึงไม่ได้ (เช่นหน้าตัวอย่างบล็อก) หยุดรอบนี้ ไม่ยิงซ้ำรัวๆ
  }
  // หน้านำทางเรียกเมื่อได้เส้นทางใหม่: โหลดช่องที่เก็บไว้ก่อน แล้วค่อยดึงช่องที่ยังไม่มีจากเน็ต (สูงสุด 40 ช่อง/เส้นทาง)
  W.RR_DETAIL = function (coords, dest) {
    if (!md() || !coords || !coords.length) return;
    var want = {}, order = [];
    var put = function (la, lo) { var k = ckey(la, lo); if (!want[k]) { want[k] = 1; order.push(k); } };
    if (dest) for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) put(dest[0] + dy * DCELL * 0.6, dest[1] + dx * DCELL * 0.6);
    for (var i = 0; i < coords.length; i += Math.max(1, Math.floor(coords.length / 300))) put(coords[i][0], coords[i][1]);
    order.slice(0, 40).forEach(function (k) {
      if (DLOADED[k] != null) return;
      idbGet(k).then(function (v) {
        if (v && Date.now() - v.t < DTTL) addCell(k, v.roads || []);
        else if (DQ.indexOf(k) < 0) { DQ.push(k); pumpDetail(); }
      });
    });
  };
  W.RR_DETAIL_STATS = function () { var n = 0, c = 0; Object.keys(DLOADED).forEach(function (k) { c++; n += DLOADED[k]; }); return { cells: c, roads: n }; };

  /* ---------- หาเส้นทางบนถนนจริงชุดเดียวกัน (สำหรับหน้าตัวอย่าง) ---------- */
  function graph() {
    md();
    var key = new Map(), pts = [], out = [];
    var node = function (p) { var k = Math.round(p[0] * 1e5) * 1e6 + Math.round(p[1] * 1e5), i = key.get(k); if (i === undefined) { i = pts.length; key.set(k, i); pts.push(p); out.push([]); } return i; };
    ROADS.forEach(function (rd, ri) {
      var prev = -1;
      rd.pts.forEach(function (p) {
        var i = node(p);
        if (prev >= 0 && prev !== i) { var w = hav(pts[prev], pts[i]); if (rd.ow >= 0) out[prev].push([i, w, ri]); if (rd.ow <= 0) out[i].push([prev, w, ri]); }
        prev = i;
      });
    });
    var n = pts.length, comp = new Int32Array(n).fill(-1), adjU = pts.map(function () { return []; });
    out.forEach(function (es, u) { es.forEach(function (e) { adjU[u].push(e[0]); adjU[e[0]].push(u); }); });
    var size = [];
    for (var u = 0; u < n; u++) if (comp[u] < 0) { var cc = size.length, stk = [u], cnt = 0; comp[u] = cc; while (stk.length) { var x = stk.pop(); cnt++; adjU[x].forEach(function (y) { if (comp[y] < 0) { comp[y] = cc; stk.push(y); } }); } size.push(cnt); }
    return { pts: pts, out: out, comp: comp, main: size.indexOf(Math.max.apply(0, size)) };
  }
  // จุดบนถนนที่ใกล้ที่สุด (ตั้งฉากกับเส้น)
  function snapEdge(g, p) {
    var best = null, cl = Math.cos(p[0] * R2);
    for (var u = 0; u < g.pts.length; u++) {
      if (g.comp[u] !== g.main) continue;
      var es = g.out[u];
      for (var j = 0; j < es.length; j++) {
        var v = es[j][0], a = g.pts[u], b = g.pts[v];
        var ax = (a[1] - p[1]) * cl, ay = a[0] - p[0], bx = (b[1] - p[1]) * cl, by = b[0] - p[0], dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
        var t = L2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L2)) : 0, x = ax + t * dx, y = ay + t * dy, dd = x * x + y * y;
        if (!best || dd < best.dd) best = { dd: dd, u: u, v: v, ri: es[j][2], at: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] };
      }
    }
    return best;
  }
  function dijkstra(g, src, dst) {
    var n = g.pts.length, dist = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1), pe = new Int32Array(n).fill(-1), h = [];
    var push = function (x) { h.push(x); var i = h.length - 1; while (i) { var q = (i - 1) >> 1; if (h[q][0] <= h[i][0]) break; var t = h[q]; h[q] = h[i]; h[i] = t; i = q; } };
    var pop = function () { var top = h[0], last = h.pop(); if (h.length) { h[0] = last; var i = 0; for (;;) { var l = 2 * i + 1, r = l + 1, m = i; if (l < h.length && h[l][0] < h[m][0]) m = l; if (r < h.length && h[r][0] < h[m][0]) m = r; if (m === i) break; var t = h[m]; h[m] = h[i]; h[i] = t; i = m; } } return top; };
    src.forEach(function (s) { if (s[1] < dist[s[0]]) { dist[s[0]] = s[1]; pe[s[0]] = s[2]; push([s[1], s[0]]); } });
    var goal = {}; dst.forEach(function (d) { goal[d[0]] = d[1]; });
    var bestT = -1, bestD = Infinity;
    while (h.length) {
      var cur = pop(), u = cur[1]; if (cur[0] > dist[u]) continue;
      if (cur[0] >= bestD) break;
      if (goal[u] !== undefined && cur[0] + goal[u] < bestD) { bestD = cur[0] + goal[u]; bestT = u; }
      var es = g.out[u];
      for (var j = 0; j < es.length; j++) { var v = es[j][0], nd = cur[0] + es[j][1]; if (nd < dist[v]) { dist[v] = nd; prev[v] = u; pe[v] = es[j][2]; push([nd, v]); } }
    }
    if (bestT < 0) return null;
    var path = [], roads = [];
    for (var v2 = bestT; v2 !== -1; v2 = prev[v2]) { path.push(v2); roads.push(pe[v2]); }
    return { path: path.reverse(), roads: roads.reverse() };
  }
  function modOf(dd) { var a = Math.abs(dd); if (a < 20) return 'straight'; var side = dd > 0 ? 'right' : 'left'; if (a < 50) return 'slight ' + side; if (a > 155) return 'uturn'; if (a > 125) return 'sharp ' + side; return side; }
  // ตอบกลับรูปแบบเดียวกับ OSRM ให้หน้านำทางใช้ได้ทันที
  W.RR_BASEROUTE = function (A, B) {
    return Promise.resolve().then(function () {
      if (!md()) return null;
      G = G || graph();
      var g = G, sa = snapEdge(g, A), sb = snapEdge(g, B); if (!sa || !sb) return null;
      var hasRev = function (x, y) { return g.out[x].some(function (e) { return e[0] === y; }); };
      var src = [[sa.v, hav(sa.at, g.pts[sa.v]), sa.ri]];
      if (hasRev(sa.v, sa.u)) src.push([sa.u, hav(sa.at, g.pts[sa.u]), sa.ri]);
      var dst = [[sb.u, hav(sb.at, g.pts[sb.u])]];
      if (hasRev(sb.v, sb.u)) dst.push([sb.v, hav(sb.at, g.pts[sb.v])]);
      var res = sa.u === sb.u && sa.v === sb.v ? { path: [], roads: [] } : dijkstra(g, src, dst);
      if (!res) return null;
      var line = [A, sa.at], rds = [sa.ri, sa.ri];
      res.path.forEach(function (i, k) { line.push(g.pts[i]); rds.push(res.roads[k] >= 0 ? res.roads[k] : sa.ri); });
      line.push(sb.at); rds.push(sb.ri); line.push(B); rds.push(sb.ri);
      var P = [line[0]], RI = [rds[0]];
      for (var i = 1; i < line.length; i++) if (hav(P[P.length - 1], line[i]) > 2) { P.push(line[i]); RI.push(rds[i]); }
      if (P.length < 2) { P.push(B); RI.push(sb.ri); }
      var nm = function (ri) { var r = ROADS[ri]; return r ? r.name : ''; }, rf = function (ri) { var r = ROADS[ri]; return r ? r.ref : ''; };
      var same = function (x, y) { return x === y || (nm(x) && nm(x) === nm(y)) || (!nm(x) && !nm(y) && rf(x) && rf(x) === rf(y)); };
      // จุดเลี้ยว: เปลี่ยนถนนแล้วหักเลี้ยว หรือหักเลี้ยวแรงบนถนนเดิม
      var cuts = [0];
      for (var k = 1; k < P.length - 1; k++) {
        var dd = ((brg(P[k], P[k + 1]) - brg(P[k - 1], P[k]) + 540) % 360) - 180, ad = Math.abs(dd);
        if ((!same(RI[k], RI[k + 1]) && ad >= 25) || ad >= 70) { if (hav(P[cuts[cuts.length - 1]], P[k]) > 25 || cuts.length === 1) cuts.push(k); }
      }
      cuts.push(P.length - 1);
      var steps = [], tot = 0;
      for (var q = 0; q < cuts.length - 1; q++) {
        var a = cuts[q], b = cuts[q + 1], dist = 0;
        for (var z = a + 1; z <= b; z++) dist += hav(P[z - 1], P[z]);
        var ri = RI[Math.min(a + 1, RI.length - 1)], cls = ROADS[ri] ? ROADS[ri].c : 3;
        var man = { location: [P[a][1], P[a][0]], bearing_after: Math.round(brg(P[a], P[a + 1])) };
        if (!q) man.type = 'depart'; else { man.type = 'turn'; man.modifier = modOf(((brg(P[a], P[a + 1]) - brg(P[a - 1], P[a]) + 540) % 360) - 180); }
        steps.push({ maneuver: man, intersections: [], name: nm(ri), ref: rf(ri), distance: dist, duration: dist / (cls <= 1 ? 17 : cls === 2 ? 14 : 11), geometry: { coordinates: P.slice(a, b + 1).map(function (p) { return [p[1], p[0]]; }) } });
        tot += dist;
      }
      var n2 = P.length, side = ((brg(P[n2 - 2], B) - brg(P[Math.max(0, n2 - 3)], P[n2 - 2]) + 540) % 360) - 180;
      steps.push({ maneuver: { type: 'arrive', modifier: side > 15 ? 'right' : side < -15 ? 'left' : 'straight', location: [B[1], B[0]] }, name: '', distance: 0, duration: 0 });
      var dur = steps.reduce(function (s, x) { return s + x.duration; }, 0);
      return { code: 'Ok', routes: [{ distance: tot, duration: dur, geometry: { coordinates: P.map(function (p) { return [p[1], p[0]]; }) }, legs: [{ steps: steps }] }] };
    });
  };
})();
