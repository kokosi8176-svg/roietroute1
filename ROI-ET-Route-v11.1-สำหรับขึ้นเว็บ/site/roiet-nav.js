/* ROI ET NAVI — นำทางในเว็บแบบเลี้ยวต่อเลี้ยว มีเสียงพูดภาษาไทย + ผู้ช่วยนำทาง "น้องเอ็ด"
   ใช้คู่กับโหมดคนขับของเว็บเดิม: ถึงแล้วกด "ส่งสำเร็จ / ส่งไม่ได้" ในหน้านำทางได้เลย
   ผลบันทึกเข้าโหมดคนขับเดิม (ประวัติ, ตรวจความแม่นยำ, ระบบหลังบ้าน) เหมือนกดเองทุกอย่าง
   - เส้นทางจริงตามถนนจาก OSRM (เปลี่ยนเซิร์ฟเวอร์ได้ด้วย window.RR_OSRM)
   - แผนที่หมุนตามทิศรถ เอียงแบบ 3 มิติ กลางวัน/กลางคืน/ดาวเทียม
   - หลุดเส้นทางแล้วคำนวณใหม่ให้เอง, เตือนความเร็ว, เตือนพัก, เตือนเสี่ยงไม่ทันเวลาร้าน
   - โหมดซ้อมขับ: จำลองการขับตามเส้นทางจริง ใช้ทดลอง/นำเสนอได้โดยไม่ต้องออกรถ */
(function () {
  'use strict';
  var W = window, d = document;
  if (W.__RRNAV) return; W.__RRNAV = 1;
  var OSRM = W.RR_OSRM || 'https://router.project-osrm.org';
  var TILES = {
    day: { url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', sub: 'abcd', attr: '© OpenStreetMap © CARTO' },
    night: { url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', sub: 'abcd', attr: '© OpenStreetMap © CARTO' },
    sat: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', sub: '', attr: 'ภาพดาวเทียม © Esri' },
  };
  var TILT = 52, PERSP = 760, FAILR = ['ร้านปิด', 'ไม่มีคนรับ', 'หาร้านไม่เจอ', 'ลูกค้ายกเลิก', 'ของไม่ครบ', 'อื่นๆ'];

  /* ---------- ตัวช่วย ---------- */
  function $(i) { return d.getElementById(i); }
  function qs(s, r) { return (r || d).querySelector(s); }
  function qsa(s, r) { return Array.prototype.slice.call((r || d).querySelectorAll(s)); }
  function el(t, c, h) { var e = d.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function safe(fn) { try { return fn(); } catch (e) { if (W.console) console.warn('[roiet-nav]', e); } }
  function ls(k, v) { try { if (v === undefined) { var t = localStorage.getItem(k); return t ? JSON.parse(t) : null; } localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } }
  var R2D = 180 / Math.PI, D2R = Math.PI / 180;
  function hav(a, b) { var la1 = a[0] * D2R, la2 = b[0] * D2R, dl = (b[0] - a[0]) * D2R, dn = (b[1] - a[1]) * D2R, x = Math.sin(dl / 2) * Math.sin(dl / 2) + Math.cos(la1) * Math.cos(la2) * Math.sin(dn / 2) * Math.sin(dn / 2); return 6371000 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)); }
  function bearing(a, b) { var la1 = a[0] * D2R, la2 = b[0] * D2R, dn = (b[1] - a[1]) * D2R; return (Math.atan2(Math.sin(dn) * Math.cos(la2), Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dn)) * R2D + 360) % 360; }
  function lerpAng(a, b, t) { var dd = ((b - a + 540) % 360) - 180; return (a + dd * t + 360) % 360; }
  function m2t(x) { x = Math.round(x); x = ((x % 1440) + 1440) % 1440; return ('0' + Math.floor(x / 60)).slice(-2) + ':' + ('0' + (x % 60)).slice(-2); }
  function nowMin() { var t = new Date(); return t.getHours() * 60 + t.getMinutes() + t.getSeconds() / 60; }
  function distTxt(m) { return m >= 1000 ? (m / 1000).toFixed(m >= 10000 ? 0 : 1) + ' กม.' : (m >= 100 ? Math.round(m / 50) * 50 : Math.max(10, Math.round(m / 10) * 10)) + ' ม.'; }
  function durTxt(min) { min = Math.max(0, Math.round(min)); return min >= 60 ? Math.floor(min / 60) + ' ชม. ' + (min % 60) + ' นาที' : min + ' นาที'; }
  var DIRS = ['เหนือ', 'ตะวันออกเฉียงเหนือ', 'ตะวันออก', 'ตะวันออกเฉียงใต้', 'ใต้', 'ตะวันตกเฉียงใต้', 'ตะวันตก', 'ตะวันตกเฉียงเหนือ'];
  function dirTh(b) { return 'ทิศ' + DIRS[Math.round(b / 45) % 8]; }

  /* ---------- อ่าน/สั่งงานโหมดคนขับของเว็บเดิม ---------- */
  function run() { return W.RP && W.RP.get ? W.RP.get('roiet.run') : ls('roiet.run'); }
  function act(a, r) {
    var drv = $('drv'); if (!drv) return;
    var b = el('i'); b.dataset.a = a; if (r) b.dataset.r = r; b.hidden = true;
    drv.appendChild(b); b.click(); if (b.parentNode) b.parentNode.removeChild(b);
  }
  function stops(R) { return (R && R.items || []).filter(function (x) { return x.k === 'stop'; }); }

  /* ---------- เสียงพูด: เสียงธรรมชาติจากระบบหลังบ้าน (ถ้าตั้งค่า) หรือเสียงในเครื่อง · แยกชาย/หญิง ---------- */
  var API = (W.RR_API || '') + '/api';
  var pref = ls('rr.navpref') || {};
  var V = { on: pref.voice !== false, g: pref.g || 'f', rate: +pref.rate || 0, cloud: null, vf: null, vm: null, list: [], q: [], audio: null, last: '', lastAt: 0, ac: null, busy: false };
  function P1() { return V.g === 'm' ? 'ครับ' : 'ค่ะ'; }
  function NA() { return V.g === 'm' ? 'นะครับ' : 'นะคะ'; }
  function persona() { return V.g === 'm' ? 'พี่เอ็ด' : 'น้องเอ็ด'; }
  // ตรวจว่าระบบหลังบ้านมีเสียงธรรมชาติไหม (Azure Neural ภาษาไทย)
  function cloudCheck() {
    if (V.cloud !== null) return;
    V.cloud = false;
    fetch(API + '/tts/info').then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { V.cloud = !!(j && j.provider); V.prov = j && j.provider; voiceNote(); }, function () { V.cloud = false; });
  }
  // หน้าตัวอย่างบน claude.ai: ใช้เสียงของ Claude ได้ (เว็บจริงไม่มีส่วนนี้ จะข้ามไปเอง)
  safe(function () {
    if (W.claude && W.claude.use) W.claude.use('tts').then(function (t) { V.ctts = t || null; voiceNote(); }, function () {});
  });
  function pickVoice() {
    if (!W.speechSynthesis) return;
    var vs = (speechSynthesis.getVoices() || []).filter(function (v) { return /^th/i.test(v.lang); });
    // เสียงแบบ Natural/Online/Neural ฟังลื่นกว่า ให้มาก่อน
    vs.sort(function (a, b) { var s = function (v) { return /natural|online|neural|premium|enhanced/i.test(v.name) ? 0 : v.localService ? 2 : 1; }; return s(a) - s(b); });
    V.list = vs;
    V.vm = vs.filter(function (v) { return /niwat|male|ชาย|\bman\b|pattara|chanin/i.test(v.name) && !/female/i.test(v.name); })[0] || null;
    V.vf = vs.filter(function (v) { return /premwadee|achara|kanya|narisa|female|หญิง|google/i.test(v.name); })[0] || vs.filter(function (v) { return v !== V.vm; })[0] || null;
    voiceNote();
  }
  if (W.speechSynthesis) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
  function engineText() {
    if (V.cloud) return V.prov === 'google' ? 'เสียงธรรมชาติ (Google Chirp 3 HD) · ' + (V.g === 'm' ? 'เสียงผู้ชาย' : 'เสียงผู้หญิง') : 'เสียงธรรมชาติ (Azure Neural) · ' + (V.g === 'm' ? 'นิวัฒน์' : 'เปรมวดี');
    if (V.ctts) return 'เสียงของ Claude (เฉพาะหน้าตัวอย่างนี้) · เว็บจริงจะใช้ Google/Azure ถ้าตั้งค่าไว้';
    if (!W.speechSynthesis || !V.list.length) return 'เครื่องนี้ไม่มีเสียงภาษาไทย ใช้เสียงเตือน + ข้อความบนจอแทน';
    var v = V.g === 'm' ? V.vm : V.vf;
    if (V.g === 'm' && !V.vm) return 'เครื่องนี้ไม่มีเสียงผู้ชายภาษาไทย ใช้เสียงที่มีปรับให้ทุ้มลงแทน';
    return 'เสียงในเครื่อง · ' + (v ? v.name : 'ภาษาไทย');
  }
  // วิธีได้เสียงธรรมชาติฟรีตามเครื่องที่ใช้ (ไม่ต้องมีคีย์)
  function voiceTips() {
    if (V.cloud) return [];
    var ua = navigator.userAgent, edge = /Edg\//.test(ua), android = /Android/i.test(ua), ios = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    var v = V.g === 'm' ? V.vm : V.vf, natural = v && /natural|online|neural/i.test(v.name), out = [];
    if (V.ctts) out.push('หน้าตัวอย่างนี้ใช้เสียงของ Claude · บนเว็บจริงจะใช้วิธีด้านล่าง');
    if (natural) out.push('เครื่องนี้มีเสียงธรรมชาติอยู่แล้ว ใช้ได้ฟรีเลย');
    else if (ios) out.push('iPhone/iPad ใช้ได้เฉพาะเสียงไทยที่มากับเครื่อง (เสียง Siri ใช้ในเว็บไม่ได้) ถ้าอยากได้เสียงธรรมชาติ ให้แอดมินใส่คีย์ตามข้อด้านล่าง');
    else if (android) out.push('Android: เปิดตั้งค่ามือถือ ค้นหาคำว่า "อ่านออกเสียง" หรือ "Text-to-speech" เลือกบริการของ Google แล้วดาวน์โหลดเสียงภาษาไทย จากนั้นกลับมากด "ลองฟังเสียง" (ชื่อเมนูต่างกันตามยี่ห้อ)');
    else if (!edge) out.push('คอมพิวเตอร์: เปิดเว็บนี้ด้วย Microsoft Edge จะได้เสียงธรรมชาติ เปรมวดี (หญิง) และนิวัฒน์ (ชาย) ฟรี ไม่ต้องตั้งคีย์');
    else out.push('Edge: ถ้ายังไม่ขึ้นเสียง Natural ให้ต่อเน็ตแล้วเปิดหน้านี้ใหม่ (เสียง Natural ของ Edge ต้องใช้เน็ต)');
    out.push('ทุกเครื่อง: แอดมินใส่คีย์ Google หรือ Azure ได้ที่หน้าแอดมิน > ตั้งค่าเสียง (ฟรีในโควตา) แล้วทุกคนจะได้เสียงธรรมชาติเหมือนกัน');
    return out;
  }
  function voiceNote() {
    var e = $('rn-vnote'); if (e) e.textContent = engineText();
    var t = $('rn-vtip'); if (t) { var tips = voiceTips(); t.hidden = !tips.length; t.innerHTML = tips.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join(''); }
  }
  function chime() {
    try {
      V.ac = V.ac || new (W.AudioContext || W.webkitAudioContext)();
      [660, 990].forEach(function (f, i) {
        var o = V.ac.createOscillator(), g = V.ac.createGain(), t = V.ac.currentTime + i * 0.11;
        o.type = 'sine'; o.frequency.value = f; o.connect(g); g.connect(V.ac.destination);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
        o.start(t); o.stop(t + 0.24);
      });
    } catch (e) {}
  }
  // ข้อความที่จะพูด: ตัดช่องว่างระหว่างคำไทย (เครื่องอ่านจะได้ไม่เว้นจังหวะแปลกๆ) และใช้ "·" เป็นจุดหายใจ
  function spoken(t) { return t.replace(/\s*·\s*/g, ', ').replace(/([฀-๿])\s+(?=[฀-๿])/g, '$1').replace(/\s+/g, ' ').trim(); }
  function shown(t) { return t.replace(/\s*·\s*/g, ' '); }
  function ttsUrl(t) { return API + '/tts?g=' + V.g + '&r=' + V.rate + '&t=' + encodeURIComponent(t); }
  function prefetch(t) { if (V.cloud && V.on) safe(function () { fetch(ttsUrl(spoken(t))).catch(function () {}); }); }
  // prio: 2 = คำสั่งเลี้ยว (ตัดเสียงเก่าทิ้ง + เสียงเตือนสั้นๆ ก่อน)
  function say(text, prio, quiet) {
    if (!text) return;
    if (!quiet) bubble(shown(text));
    if (!V.on) return;
    var sp = spoken(text);
    if (sp === V.last && Date.now() - V.lastAt < 4000) return;
    V.last = sp; V.lastAt = Date.now();
    if (prio >= 2) { V.q = []; stopAudio(); }
    V.q.push({ t: sp, p: prio || 1 });
    if (!V.busy) next();
  }
  function stopAudio() {
    if (V.audio) { try { V.audio.pause(); } catch (e) {} V.audio = null; }
    if (W.speechSynthesis) speechSynthesis.cancel();
    if (V.ctts) { V.cur = null; safe(function () { var r = V.ctts.stop(); if (r && r.catch) r.catch(function () {}); }); }
    V.busy = false;
  }
  function next() {
    var it = V.q.shift(); if (!it) { V.busy = false; return; }
    V.busy = true;
    if (it.p >= 2) chime();
    var delay = it.p >= 2 ? 330 : 0;
    setTimeout(function () { if (V.cloud) playCloud(it); else if (V.ctts) playClaude(it); else local(it); }, delay);
  }
  function playCloud(it) {
    var a = new Audio(ttsUrl(it.t)); V.audio = a;
    a.onended = function () { if (V.audio === a) { V.audio = null; next(); } };
    a.onerror = function () { if (V.audio === a) { V.audio = null; local(it); } };
    var p = a.play(); if (p && p.catch) p.catch(function () { if (V.audio === a) { V.audio = null; local(it); } });
  }
  function playClaude(it) {
    var my = V.cur = {};
    V.ctts.speak(it.t, { voice: V.g === 'm' ? 'rounded' : 'airy', rate: 1 + V.rate / 100, language: 'th' }).then(function () { if (V.cur === my) next(); }, function (e) {
      if (V.cur !== my) return;
      if (e && e.code === 'not_granted') V.ctts = null;
      local(it);
    });
  }
  function local(it) {
    if (!W.speechSynthesis || !V.list.length) { if (it.p >= 2) chime(); V.busy = false; setTimeout(next, 200); return; }
    var u = new SpeechSynthesisUtterance(it.t), v = V.g === 'm' ? (V.vm || V.vf) : V.vf;
    u.lang = 'th-TH'; if (v) u.voice = v;
    u.rate = 0.96 + V.rate / 100; u.pitch = V.g === 'm' && !V.vm ? 0.72 : 1;
    // บางเครื่องไม่ส่ง onend กลับมา กันคิวค้างด้วยตัวจับเวลา
    var done = false, fin = function () { if (done) return; done = true; clearTimeout(wd); next(); };
    var wd = setTimeout(fin, 2500 + it.t.length * 110);
    u.onend = u.onerror = fin;
    speechSynthesis.speak(u);
  }
  var bubT = 0;
  function bubble(t) {
    var b = $('rn-bub'); if (!b) return;
    qs('span', b).textContent = t; b.classList.add('on'); b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
    clearTimeout(bubT); bubT = setTimeout(function () { b.classList.remove('on'); }, 6500);
  }

  /* ---------- ประโยคพูดแบบคนไทยคุยกัน ---------- */
  var NUM = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า', 'สิบ', 'สิบเอ็ด'];
  // ระยะแบบพูด: 300 เมตร / กิโลนึง / กิโลครึ่ง / 3 กิโลครึ่ง / 12 กิโล
  function dSay(m) {
    if (m < 1000) return (m >= 100 ? Math.round(m / 50) * 50 : Math.max(10, Math.round(m / 10) * 10)) + ' เมตร';
    var k = m / 1000;
    if (k >= 10) return Math.round(k) + ' กิโล';
    var h = Math.round(k * 2) / 2, n = Math.floor(h), half = h - n >= 0.5;
    if (n === 1) return half ? 'กิโลครึ่ง' : 'กิโลนึง';
    return n + ' กิโล' + (half ? 'ครึ่ง' : '');
  }
  // เวลาแบบพูด: เก้าโมงสี่สิบ / บ่ายสองครึ่ง / สี่ทุ่ม / ตีหนึ่ง
  function tSay(min) {
    min = ((Math.round(min / 5) * 5) % 1440 + 1440) % 1440;
    var h = Math.floor(min / 60), m = min % 60, w;
    if (h === 0) w = 'เที่ยงคืน'; else if (h < 6) w = 'ตี' + NUM[h]; else if (h < 12) w = (h === 6 ? 'หก' : NUM[h]) + 'โมง' + (h < 9 ? 'เช้า' : '');
    else if (h === 12) w = 'เที่ยง'; else if (h === 13) w = 'บ่ายโมง'; else if (h < 16) w = 'บ่าย' + NUM[h - 12]; else if (h < 19) w = NUM[h - 12] + 'โมงเย็น'; else w = NUM[h - 18] + 'ทุ่ม';
    if (!m) return w;
    if (h > 0 && h < 6 || h === 0 || h === 12) return w + (m === 30 ? 'ครึ่ง' : ' ' + m + ' นาที');
    return w.replace(/(เช้า|เย็น)$/, '') + (m === 30 ? 'ครึ่ง' : ' ' + m + (m < 10 ? ' นาที' : ''));
  }
  var TURN = { left: 'เลี้ยวซ้าย', right: 'เลี้ยวขวา', 'slight left': 'เบี่ยงซ้าย', 'slight right': 'เบี่ยงขวา', 'sharp left': 'เลี้ยวซ้ายหักศอก', 'sharp right': 'เลี้ยวขวาหักศอก', uturn: 'กลับรถ', straight: 'ตรงไป' };
  function roadSay(s) {
    var n = s.name || '', r = (s.ref || '').split(';')[0];
    if (n) return n;
    return r ? (/^\d/.test(r) ? 'ทางหลวงหมายเลข ' + r : r) : '';
  }
  function turnSay(s) {
    var m = s.maneuver || {}, mod = m.modifier || 'straight', t = m.type;
    if (/roundabout|rotary/.test(t)) return 'เข้าวงเวียน · ออกทางที่' + (m.exit ? NUM[m.exit] || m.exit : 'ป้ายบอก');
    if (t === 'fork') return /left/.test(mod) ? 'ชิดซ้ายที่ทางแยก' : /right/.test(mod) ? 'ชิดขวาที่ทางแยก' : 'ตรงไปที่ทางแยก';
    if (t === 'on ramp') return 'ขึ้นทางลาด' + (/left/.test(mod) ? 'ด้านซ้าย' : /right/.test(mod) ? 'ด้านขวา' : '');
    if (t === 'off ramp') return 'ลงทางลาด' + (/left/.test(mod) ? 'ด้านซ้าย' : /right/.test(mod) ? 'ด้านขวา' : '');
    if (t === 'merge') return 'รวมเข้าเลน' + (/left/.test(mod) ? 'ซ้าย' : /right/.test(mod) ? 'ขวา' : '');
    if (t === 'end of road') return 'สุดทางแล้ว' + (TURN[mod] || 'เลี้ยว');
    return TURN[mod] || 'ตรงไป';
  }
  var PH = {
    hello: function (n, km) { return 'สวัสดี' + P1() + ' · ' + persona() + 'เอง · วันนี้เรามีส่งของ ' + n + ' จุด · ระยะทางประมาณ ' + km + ' กิโล · ขับปลอดภัย' + NA(); },
    leg: function (it, dist, eta) {
      var where = it.k === 'stop' ? 'ไปจุดที่ ' + it.no + ' · ' + it.n + 'กัน' + P1() : it.k === 'end' ? 'กลับคลังกัน' + P1() : 'กลับไปขึ้นของที่คลังกัน' + P1();
      return where + ' · อีก ' + dSay(dist) + ' · น่าจะถึงราว' + tSay(eta);
    },
    depart: function (s, s2, d2) {
      var rd = roadSay(s), dirs = ['ทิศเหนือ', 'ตะวันออกเฉียงเหนือ', 'ทิศตะวันออก', 'ตะวันออกเฉียงใต้', 'ทิศใต้', 'ตะวันตกเฉียงใต้', 'ทิศตะวันตก', 'ตะวันตกเฉียงเหนือ'];
      var t = 'ออกรถไปทาง' + dirs[Math.round(((s.maneuver && s.maneuver.bearing_after) || 0) / 45) % 8] + (rd ? ' · ตาม' + rd : '') + P1();
      if (s2 && s2.maneuver.type !== 'arrive') t += ' · อีก ' + dSay(d2) + ' · ' + turnSay(s2);
      return t;
    },
    far: function (s, dist, ln) { return 'อีก ' + dSay(dist) + ' · ' + (ln ? ln.say + ' · ' : '') + turnSay(s) + P1(); },
    mid: function (s, dist, then, ln) { var rd = roadSay(s); return 'อีก ' + dSay(dist) + ' · ' + (ln && ln.kind === 'lanes' ? ln.say + ' · ' : '') + turnSay(s) + (rd ? ' · เข้า' + rd : '') + (then ? ' · แล้ว' + turnSay(then) + 'ต่อ' : ''); },
    now: function (s, then) { return turnSay(s) + (then ? ' · แล้ว' + turnSay(then) + 'ต่อเลย' + P1() : 'ตรงนี้เลย' + P1()); },
    near: function (it, dist, side) { return 'อีก ' + dSay(dist) + ' · ถึง' + (it.k === 'stop' ? it.n : 'คลัง') + 'แล้ว' + P1() + (side ? ' · อยู่ทาง' + side + 'มือ' : ''); },
    arrive: function (it) { return it.k === 'stop' ? 'ถึง' + it.n + 'แล้ว' + P1() + ' · ส่งของเสร็จ กดส่งสำเร็จได้เลย' : 'ถึงคลังแล้ว' + P1(); },
    reroute: function () { return 'ไม่เป็นไร' + P1() + ' · ขอหาเส้นทางใหม่ให้' + NA(); },
    rerouted: function (dist) { return 'ได้เส้นทางใหม่แล้ว' + P1() + ' · อีก ' + dSay(dist) + ' ถึงจุดหมาย'; },
    ok: function (left) { var w = ['เยี่ยมเลย', 'เก่งมาก', 'เรียบร้อย', 'สุดยอด'][Math.floor(Math.random() * 4)] + P1(); return w + (left ? ' · เหลืออีก ' + left + ' จุด' : ' · ส่งครบแล้ว · กลับคลังกัน' + P1()); },
    fail: function (r, left) { return 'รับทราบ' + P1() + ' · บันทึกว่า' + r + ' · แจ้งผู้วางแผนให้แล้ว' + (left ? ' · ไปจุดต่อไปกัน' + P1() : ''); },
    speed: function () { return 'ขับเร็วไปนิดนึง' + NA() + ' · ชะลอหน่อย' + P1(); },
    rest: function () { return 'ขับมาสองชั่วโมงแล้ว · แวะพักยืดเส้นสักหน่อย' + NA(); },
    late: function (it) { return 'ระวังนิดนึง' + NA() + ' · ' + (/^ร้าน/.test(it.n) ? '' : 'ร้าน') + it.n + 'ปิด' + tSay(it.cl) + ' · อาจไปไม่ทัน · โทรบอกร้านไว้ก่อนดีกว่า' + P1(); },
    finish: function (ok, n) { return 'เสร็จงานวันนี้แล้ว' + P1() + ' · ส่งได้ ' + ok + ' จาก ' + n + ' จุด · เหนื่อยหน่อย' + NA() + ' · พักผ่อนเยอะๆ'; },
    on: function () { return 'เปิดเสียงแล้ว' + P1(); },
    cont: function () { return 'โอเค' + P1() + ' · นำทางต่อ'; },
    test: function () { return 'สวัสดี' + P1() + ' · ' + persona() + 'เอง · อีก 200 เมตร · เลี้ยวซ้าย' + P1(); },
  };

  /* ---------- คำสั่งเลี้ยวภาษาไทย ---------- */
  var MOD = { left: 'เลี้ยวซ้าย', right: 'เลี้ยวขวา', 'slight left': 'เบี่ยงซ้าย', 'slight right': 'เบี่ยงขวา', 'sharp left': 'เลี้ยวซ้ายหักศอก', 'sharp right': 'เลี้ยวขวาหักศอก', uturn: 'กลับรถ', straight: 'ตรงไป' };
  function road(s) { var n = s.name || '', r = s.ref || ''; if (r && /^\d/.test(r)) r = 'ทางหลวง ' + r.split(';')[0]; return n && r && n.indexOf(r) < 0 ? n + ' (' + r + ')' : n || r; }
  // ข้อมูลเลน: OSRM ส่งมาเมื่อถนนนั้นมีข้อมูลเลนใน OpenStreetMap (เรียงจากซ้ายไปขวา)
  // ไม่มีข้อมูลเลน → บอกให้ "ชิดซ้าย/ชิดขวาไว้" ตามทิศที่จะเลี้ยว (ไทยขับชิดซ้าย)
  function laneInfo(ln, s) {
    var m = s.maneuver || {}, mod = m.modifier || 'straight', t = m.type;
    if (t === 'depart' || t === 'arrive') return null;
    if (ln) {
      var n = ln.length, v = []; ln.forEach(function (l, i) { if (l.valid) v.push(i); });
      if (!v.length || v.length === n) return null;
      var cnt = v.length === 1 ? '' : (v.length === 2 ? 'สอง' : v.length === 3 ? 'สาม' : v.length) + ' ';
      var txt = v[0] === 0 ? (v.length === 1 ? 'เลนซ้ายสุด' : cnt + 'เลนซ้าย') : v[v.length - 1] === n - 1 ? (v.length === 1 ? 'เลนขวาสุด' : cnt + 'เลนขวา') : 'เลนกลาง';
      return { kind: 'lanes', say: 'ใช้' + txt, short: txt, side: v[0] === 0 ? 'L' : v[v.length - 1] === n - 1 ? 'R' : 'C' };
    }
    if (/roundabout|rotary/.test(t)) return null;
    if (mod === 'uturn') return { kind: 'hint', say: 'ชิดขวาไว้ เตรียมกลับรถ', short: 'ชิดขวา เตรียมกลับรถ', side: 'R' };
    if (/right/.test(mod) && t !== 'fork' && !/ramp/.test(t)) return { kind: 'hint', say: 'ชิดขวาไว้', short: 'ชิดขวาไว้', side: 'R' };
    if (/left/.test(mod) && t !== 'fork' && !/ramp/.test(t)) return { kind: 'hint', say: 'ชิดซ้ายไว้', short: 'ชิดซ้ายไว้', side: 'L' };
    return null;
  }
  var LIND = { left: 'left', 'slight left': 'bleft', 'sharp left': 'sleft', right: 'right', 'slight right': 'bright', 'sharp right': 'sright', uturn: 'uturn', straight: 'straight', none: 'straight' };
  function laneHtml(st) {
    if (st.lanes) return st.lanes.map(function (l) {
      var ind = (l.indications || ['none']), k = LIND[ind[0]] || 'straight';
      if (l.valid) { var mod = (st.s.maneuver || {}).modifier; for (var i = 0; i < ind.length; i++) if (ind[i] === mod || (mod === 'straight' && ind[i] === 'none')) { k = LIND[ind[i]] || k; break; } }
      return '<span class="rn-ln' + (l.valid ? ' on' : '') + '">' + arrow(k) + '</span>';
    }).join('');
    var L = st.lane; if (!L) return '';
    return '<span class="rn-lhint ' + L.side + '">' + arrow(L.side === 'R' ? (st.ic === 'uturn' ? 'uturn' : 'bright') : 'bleft') + esc(L.short) + '</span>';
  }
  function instr(s, next) {
    var m = s.maneuver || {}, mod = m.modifier || 'straight', rd = road(s), t = m.type;
    var turn = MOD[mod] || 'ตรงไป', onto = rd ? ' เข้า' + rd : '';
    if (t === 'depart') return 'ออกเดินทาง มุ่งหน้า' + dirTh(m.bearing_after || 0) + (rd ? ' ตาม' + rd : '');
    if (t === 'arrive') return 'ถึงจุดหมาย' + (mod === 'left' ? ' อยู่ทางซ้าย' : mod === 'right' ? ' อยู่ทางขวา' : '');
    if (t === 'roundabout' || t === 'rotary' || t === 'exit roundabout' || t === 'roundabout turn') return 'เข้าวงเวียน' + (m.exit ? ' ออกทางออกที่ ' + m.exit : '') + onto;
    if (t === 'fork') return (/left/.test(mod) ? 'ทางแยก ชิดซ้าย' : /right/.test(mod) ? 'ทางแยก ชิดขวา' : 'ทางแยก ตรงไป') + onto;
    if (t === 'merge') return 'รวมเข้าทาง' + (/left/.test(mod) ? 'ซ้าย' : /right/.test(mod) ? 'ขวา' : '') + onto;
    if (t === 'on ramp') return 'ขึ้นทางลาด' + (/left/.test(mod) ? 'ทางซ้าย' : /right/.test(mod) ? 'ทางขวา' : '') + onto;
    if (t === 'off ramp') return 'ออกทางลาด' + (/left/.test(mod) ? 'ทางซ้าย' : /right/.test(mod) ? 'ทางขวา' : '') + onto;
    if (t === 'end of road') return 'สุดทาง ' + turn + onto;
    if (t === 'new name' || t === 'continue' || mod === 'straight') return (mod === 'straight' || t === 'new name' ? 'ตรงไป' : turn) + (rd ? 'ตาม' + rd : '');
    return turn + onto;
  }
  function icon(s) {
    var m = s.maneuver || {}, mod = m.modifier || 'straight', t = m.type;
    if (t === 'arrive') return 'arrive';
    if (/roundabout|rotary/.test(t)) return 'round';
    if (mod === 'uturn') return 'uturn';
    if (/sharp left/.test(mod)) return 'sleft'; if (/sharp right/.test(mod)) return 'sright';
    if (/slight left/.test(mod)) return 'bleft'; if (/slight right/.test(mod)) return 'bright';
    if (/left/.test(mod)) return 'left'; if (/right/.test(mod)) return 'right';
    return 'straight';
  }
  var ARW = {
    straight: '<path d="M32 54V14"/><path d="M20 26 32 12l12 14"/>',
    left: '<path d="M40 54V32a8 8 0 0 0-8-8H14"/><path d="m24 13-12 11 12 11"/>',
    right: '<path d="M24 54V32a8 8 0 0 1 8-8h18"/><path d="m40 13 12 11-12 11"/>',
    bleft: '<path d="M38 54V34L22 18"/><path d="M20 30V16h14"/>',
    bright: '<path d="M26 54V34l16-16"/><path d="M44 30V16H30"/>',
    sleft: '<path d="M42 54V22L20 44"/><path d="M18 30v16h16"/>',
    sright: '<path d="M22 54V22l22 22"/><path d="M46 30v16H30"/>',
    uturn: '<path d="M40 54V26a12 12 0 0 0-24 0v8"/><path d="m8 26 8 10 8-10"/>',
    round: '<circle cx="32" cy="28" r="10"/><path d="M32 54V38M40 21l10-9M50 22V12H40"/>',
    arrive: '<path d="M32 56s16-15 16-28a16 16 0 0 0-32 0c0 13 16 28 16 28z"/><circle cx="32" cy="28" r="5"/>',
  };
  function arrow(k, c) { return '<svg class="rn-arw ' + (c || '') + '" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ARW[k] || ARW.straight) + '</svg>'; }
  var IC = {
    x: '<path d="M18 6 6 18M6 6l12 12"/>', vol: '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>', mute: '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="m22 9-6 6M16 9l6 6"/>',
    loc: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="8"/>', map: '<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3z"/><path d="M9 3v15M15 6v15"/>',
    moon: '<path d="M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10z"/>', sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    sat: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>', play: '<path d="M7 4v16l13-8z"/>', pause: '<path d="M7 4h4v16H7zM14 4h4v16h-4z"/>',
    check: '<path d="M20 6 9 17l-5-5"/>', gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>', flag: '<path d="M4 22V4h12l-1.5 4L16 12H4"/>', skip: '<path d="m5 4 10 8-10 8zM19 5v14"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  };
  function ic(n) { return '<svg class="rn-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (IC[n] || '') + '</svg>'; }

  /* ---------- สถานะการนำทาง ---------- */
  var N = null; // งานนำทางที่เปิดอยู่
  function fresh() {
    return {
      root: null, map: null, wrap: null, tiles: null, line: null, done: null, S: 0, anchor: [0, 0],
      pos: null, shown: null, head: 0, showHead: 0, speed: 0, acc: null, watch: null, sim: false, simMul: 4, simAt: 0, simD: 0,
      target: null, idx: -1, route: null, steps: [], cum: [], along: 0, offN: 0, lastRoute: 0, routing: false,
      warned: {}, arrived: false, overview: false, follow: true, theme: pref.theme || (nowMin() >= 18 * 60 || nowMin() < 6 * 60 ? 'night' : 'day'),
      startAt: Date.now(), drivenM: 0, overSince: 0, lastSpeedWarn: 0, lastBreak: Date.now(), raf: 0, poll: 0, wake: null, fixAt: 0, zoom: 16,
    };
  }

  function open(opts) {
    opts = opts || {};
    var R = run();
    if (!W.L) { alert('ยังโหลดแผนที่ไม่เสร็จ ลองใหม่อีกครั้ง'); return; }
    if (!R || !R.items) { var b = $('drvbtn'); if (b) b.click(); R = run(); if (!R) return; }
    if (N) close(true);
    N = fresh(); N.sim = !!opts.sim;
    build();
    if (R.state === 'ready') act('start');
    cloudCheck(); unlockAudio();
    say(PH.hello(stops(R).length, Math.round(R.pkm || 0)), 1);
    wakeOn();
    if (N.sim) simStart(); else gpsStart();
    N.poll = setInterval(function () { safe(syncRun); }, 1000);
    syncRun();
    loop();
  }
  function close(silent) {
    if (!N) return;
    cancelAnimationFrame(N.raf); clearInterval(N.poll);
    if (N.watch != null && navigator.geolocation) navigator.geolocation.clearWatch(N.watch);
    if (N.wake) safe(function () { N.wake.release(); });
    V.q = []; stopAudio();
    if (N.map) N.map.remove();
    if (N.root) N.root.remove();
    d.documentElement.classList.remove('rn-open');
    N = null;
    if (!silent) { var dv = $('drvpill'); if (dv && !dv.hidden) {} }
  }
  var SILENT = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
  function unlockAudio() {
    safe(function () { var a = new Audio(SILENT); var p = a.play(); if (p && p.catch) p.catch(function () {}); });
    safe(function () { V.ac = V.ac || new (W.AudioContext || W.webkitAudioContext)(); if (V.ac.resume) V.ac.resume(); });
  }
  function wakeOn() { try { if (navigator.wakeLock) navigator.wakeLock.request('screen').then(function (l) { if (N) N.wake = l; }, function () {}); } catch (e) {} }

  /* ---------- หน้าจอ ---------- */
  function build() {
    var r = el('div', 'rn-root theme-' + N.theme); r.id = 'rn-root'; r.setAttribute('role', 'application'); r.setAttribute('aria-label', 'นำทาง ROI ET NAVI');
    r.innerHTML =
      '<div class="rn-sky"></div><div class="rn-stage"><div class="rn-wrap" id="rn-wrap"><div class="rn-map" id="rn-map"></div></div><div class="rn-fog"></div><div class="rn-lbls" id="rn-lbls"></div><div class="rn-pins" id="rn-pins"></div>' +
      '<div class="rn-car" id="rn-car"><i class="rn-halo"></i><svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 4 40 42 24 34 8 42z"/></svg></div></div>' +
      '<header class="rn-top"><div class="rn-man" id="rn-man" data-c="steps" role="button" aria-label="ดูเส้นทางทีละจุดเลี้ยว"><div class="rn-ring"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="45"/><circle class="p" cx="50" cy="50" r="45" id="rn-ringp"/></svg><div id="rn-arw"></div></div>' +
      '<div class="rn-mtx"><b id="rn-dist">–</b><span id="rn-ins">กำลังหาตำแหน่ง…</span><small id="rn-road"></small></div></div>' +
      '<div class="rn-then" id="rn-then" hidden></div><div class="rn-lanes" id="rn-lanes" hidden></div></header>' +
      '<div class="rn-side"><button type="button" data-c="voice" aria-label="เปิด/ปิดเสียง"></button><button type="button" data-c="theme" aria-label="สลับกลางวัน/กลางคืน/ดาวเทียม">' + ic('moon') + '</button>' +
      '<button type="button" data-c="over" aria-label="ดูภาพรวมเส้นทาง">' + ic('map') + '</button><button type="button" data-c="settings" aria-label="ตั้งค่าเสียงผู้ช่วย">' + ic('gear') + '</button><button type="button" data-c="center" aria-label="กลับมาที่รถ" hidden>' + ic('loc') + '</button></div>' +
      '<div class="rn-speed" id="rn-speed"><b>0</b><small>กม./ชม.</small><i class="rn-limit" id="rn-limit" hidden></i></div>' +
      '<div class="rn-bub" id="rn-bub" aria-live="polite"><i class="rn-av" aria-hidden="true"><svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="18"/><circle class="e" cx="14" cy="17" r="2.4"/><circle class="e" cx="26" cy="17" r="2.4"/><path class="m" d="M13 25q7 6 14 0"/></svg></i><span></span></div>' +
      '<section class="rn-sheet"><div class="rn-dest"><div class="rn-dn"><small id="rn-dk">จุดหมาย</small><b id="rn-dname">–</b><em id="rn-dtw"></em></div>' +
      '<div class="rn-eta"><b id="rn-eta">--:--</b><small id="rn-rem">–</small></div></div>' +
      '<div class="rn-rail" id="rn-rail"></div>' +
      '<div class="rn-acts"><button type="button" class="rn-b ok" data-c="here">' + ic('flag') + 'ถึงแล้ว</button><button type="button" class="rn-b" data-c="sim">' + ic('play') + '<span>ซ้อมขับ</span></button><button type="button" class="rn-b x" data-c="exit">' + ic('x') + 'ออก</button></div></section>' +
      '<div class="rn-arrive" id="rn-arrive" hidden></div><div class="rn-arrive" id="rn-gpsbox" hidden></div><div class="rn-arrive" id="rn-set" hidden></div><div class="rn-gpschip" id="rn-gps" hidden></div><div class="rn-tilenote" id="rn-tilenote" hidden><b>แผนที่จริงโหลดไม่ได้ในหน้านี้</b>หน้าตัวอย่างบน claude.ai บล็อกการโหลดแผนที่จากภายนอก เส้นทาง เสียง และการนำทางยังทำงานปกติ · เปิดบนเว็บจริงจะเห็นถนนและชื่อถนนครบ</div><div class="rn-attr" id="rn-attr"></div>';
    d.body.appendChild(r); N.root = r;
    d.documentElement.classList.add('rn-open');
    N.map = W.L.map($('rn-map'), { zoomControl: false, attributionControl: false, keyboard: false, inertia: false, zoomSnap: 0.25, fadeAnimation: false, preferCanvas: true, dragging: true, touchZoom: true, scrollWheelZoom: true, minZoom: 12.5 });
    N.map.createPane('rnroute').style.zIndex = 450;
    setTiles();
    var ren = W.L.canvas({ pane: 'rnroute', padding: 0.5 });
    N.done = W.L.polyline([], { renderer: ren, color: '#7d8796', weight: 9, opacity: 0.55, lineCap: 'round', interactive: false }).addTo(N.map);
    N.case = W.L.polyline([], { renderer: ren, color: '#5a2300', weight: 15, opacity: 0.55, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(N.map);
    N.line = W.L.polyline([], { renderer: ren, color: '#ff8a1f', weight: 10, opacity: 1, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(N.map);
    N.map.on('dragstart zoomstart', function (e) { if (e && e.originalEvent || N.map._rnUser) followOff(); });
    N.map.getContainer().addEventListener('pointerdown', function () { N.map._rnUser = 1; setTimeout(function () { if (N && N.map) N.map._rnUser = 0; }, 400); });
    r.addEventListener('click', onClick);
    W.addEventListener('resize', layout);
    layout(); voiceBtn(); simBtn();
    N.map.setView([16.05, 103.65], 16);
  }
  function setTiles() {
    var key = N.theme === 'sat' ? 'sat' : N.theme, T = TILES[key];
    if (N.tiles) N.map.removeLayer(N.tiles);
    N.tiles = W.L.tileLayer(T.url, { subdomains: T.sub || 'abc', maxZoom: 19, maxNativeZoom: key === 'sat' ? 18 : 19, keepBuffer: 4, crossOrigin: true, detectRetina: false }).addTo(N.map);
    N.tileOk = 0; N.tileBad = 0;
    N.tiles.on('tileload', function () { N.tileOk++; var tn = $('rn-tilenote'); if (tn) tn.hidden = true; });
    N.tiles.on('tileerror', function () { N.tileBad++; if (N.tileBad >= 6 && !N.tileOk && !W.RR_BASEMAP) { var tn = $('rn-tilenote'); if (tn) tn.hidden = false; } });
    $('rn-attr').textContent = T.attr + ' · เส้นทาง © OSRM, OpenStreetMap';
    N.root.className = 'rn-root theme-' + N.theme + (N.sim ? ' sim' : '');
    var tb = qs('[data-c=theme]', N.root); if (tb) tb.innerHTML = ic(N.theme === 'night' ? 'sat' : N.theme === 'sat' ? 'sun' : 'moon');
  }
  function layout() {
    if (!N) return;
    var w = W.innerWidth, h = W.innerHeight, S = Math.ceil(Math.hypot(w, h) * 1.9);
    N.S = S; N.anchor = [w / 2, h * (w < 700 ? 0.64 : 0.62)];
    var wr = $('rn-wrap');
    wr.style.width = wr.style.height = S + 'px';
    wr.style.left = (N.anchor[0] - S / 2) + 'px'; wr.style.top = (N.anchor[1] - S / 2) + 'px';
    var c = $('rn-car'); c.style.left = N.anchor[0] + 'px'; c.style.top = N.anchor[1] + 'px';
    N.map.invalidateSize(false);
  }
  // เมทริกซ์เดียวกับ CSS ของแผนที่ ใช้คำนวณตำแหน่งบนจอของหมุด
  function matrix() {
    var S = N.S, tilt = N.overview ? 0 : TILT, rot = N.overview ? 0 : N.showHead;
    var M = new DOMMatrix().translate(N.anchor[0], N.anchor[1]);
    var P = new DOMMatrix([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, -1 / PERSP, 0, 0, 0, 1]);
    M = M.multiply(P).rotate(tilt, 0, 0).rotate(0, 0, -rot).translate(-S / 2, -S / 2);
    return M;
  }
  function project(ll) {
    var p = N.map.latLngToContainerPoint(ll), q = matrix().transformPoint(new DOMPoint(p.x, p.y, 0, 1));
    var S = N.S, out = !N.overview && (p.x < -S * 0.02 || p.y < -S * 0.02 || p.x > S * 1.02 || p.y > S * 1.02);
    return { x: q.x / q.w, y: q.y / q.w, s: 1 / q.w, behind: q.w <= 0.05 || out };
  }

  /* ---------- ข้อมูลงาน ---------- */
  function syncRun() {
    if (!N) return;
    var R = run();
    if (!R || !R.items) { close(); return; }
    var it = R.items[R.cur];
    if (R.state === 'finish' || !it) { finishCard(R); return; }
    if (N.idx !== R.cur || !N.target) {
      N.idx = R.cur; N.target = it; N.arrived = false; N.warned = {}; N.route = null; hideArrive();
      legIntro(R, it);
      route(true);
    }
    rail(R);
  }
  function destName(it) { return it.k === 'stop' ? it.n : it.k === 'dep' ? 'กลับคลังขึ้นของ · ' + it.n : 'กลับคลัง · ' + it.n; }
  function legIntro(R, it) {
    var st = stops(R), no = it.k === 'stop' ? it.no : null;
    $('rn-dk').textContent = it.k === 'stop' ? 'จุดที่ ' + no + ' / ' + st.length : it.k === 'end' ? 'ปลายทาง' : 'กลับคลัง';
    $('rn-dname').textContent = destName(it);
    var tw = [];
    if (it.tw) tw.push('เวลาร้าน ' + it.tw);
    if (it.w) tw.push(it.w + ' กก.');
    if (it.pri) tw.push('งานด่วน');
    $('rn-dtw').textContent = tw.join(' · ');
  }
  function rail(R) {
    var box = $('rn-rail'); if (!box) return;
    var st = R.items.filter(function (x) { return x.k !== 'dep'; }), cur = R.items[R.cur];
    var sig = JSON.stringify([R.cur, st.map(function (x) { return x.st; })]);
    if (box._sig === sig) return; box._sig = sig;
    var doneN = stops(R).filter(function (x) { return x.st !== 'todo'; }).length;
    box.innerHTML = '<div class="rn-track"><i style="width:' + (stops(R).length ? doneN / stops(R).length * 100 : 0) + '%"></i></div>' + st.map(function (x) {
      var c = x === cur ? 'cur' : x.st === 'ok' ? 'ok' : x.st === 'fail' ? 'fail' : '';
      return '<span class="rn-bead ' + c + (x.k === 'end' ? ' home' : '') + '" title="' + esc(x.n) + '">' + (x.k === 'end' ? '⌂' : x.st === 'ok' ? '✓' : x.st === 'fail' ? '✗' : x.no) + '</span>';
    }).join('');
  }

  /* ---------- เส้นทาง (OSRM) ---------- */
  function route(first) {
    if (!N || N.routing || !N.target) return;
    var from = N.pos || null;
    if (!from) { setTimeout(function () { route(first); }, 800); return; }
    N.routing = true; N.lastRoute = Date.now();
    var to = [N.target.la, N.target.lo];
    var url = OSRM + '/route/v1/driving/' + from[1].toFixed(6) + ',' + from[0].toFixed(6) + ';' + to[1].toFixed(6) + ',' + to[0].toFixed(6) +
      '?overview=full&geometries=geojson&steps=true&annotations=maxspeed&continue_straight=true' + (N.head ? '&bearings=' + Math.round(N.head) + ',60;' : '');
    var ac = W.AbortController ? new AbortController() : null, tm = setTimeout(function () { if (ac) ac.abort(); }, 12000);
    fetch(url, ac ? { signal: ac.signal } : {}).then(function (r) { return r.json(); }).then(function (j) {
      if (!j || j.code !== 'Ok' || !j.routes || !j.routes[0]) throw new Error('no route');
      setRoute(j.routes[0], first);
    }).catch(function (err) {
      if (W.console && err && err.message !== 'no route' && err.name !== 'AbortError' && err.name !== 'TypeError') console.warn('[roiet-nav] route', err);
      // ชั้นสำรอง: 1) GraphHopper ผ่านระบบหลังบ้าน (ถ้าตั้งคีย์)  2) ถนนจริงที่ฝังในเว็บ คำนวณในเครื่อง  3) เส้นตรง
      var ok = function (j) { if (!j || j.code !== 'Ok' || !j.routes || !j.routes[0]) throw new Error('no route'); return j; };
      var local = function () {
        if (!W.RR_BASEROUTE) throw new Error('no local');
        return W.RR_BASEROUTE(from, to).then(ok).then(function (j) { if (N) { setRoute(j.routes[0], first); if (!N.offWarned) { N.offWarned = 1; bubble('เซิร์ฟเวอร์เส้นทางไม่ตอบ ใช้แผนที่ในเครื่องหาเส้นทางแทน'); } } });
      };
      var backup = function () {
        if (N.ghOff) return Promise.reject(new Error('no backup'));
        var q = API + '/route?from=' + from[0].toFixed(6) + ',' + from[1].toFixed(6) + '&to=' + to[0].toFixed(6) + ',' + to[1].toFixed(6) + (N.head ? '&h=' + Math.round(N.head) : '');
        return fetch(q).then(function (r) { if (r.status === 501 || r.status === 404) N.ghOff = true; return r.json(); }).then(ok).then(function (j) { if (N) setRoute(j.routes[0], first); });
      };
      return backup().catch(local).catch(straight);
    }).then(function () { clearTimeout(tm); if (N) N.routing = false; });
    function straight() {
      if (!N) return;
      // ใช้ไม่ได้จริงๆ → นำทางแบบเส้นตรง (ยังบอกทิศและระยะได้)
      var b = bearing(from, to), dist = hav(from, to);
      setRoute({ distance: dist, duration: dist / 11, geometry: { coordinates: [[from[1], from[0]], [to[1], to[0]]] }, legs: [{ steps: [
        { maneuver: { type: 'depart', bearing_after: b, location: [from[1], from[0]] }, name: '', distance: dist, duration: dist / 11, geometry: { coordinates: [[from[1], from[0]], [to[1], to[0]]] } },
        { maneuver: { type: 'arrive', location: [to[1], to[0]] }, name: '', distance: 0, duration: 0 }] }], _fallback: true }, first);
      if (!N.fbWarned) { N.fbWarned = 1; bubble('ตอนนี้ดึงเส้นทางตามถนนไม่ได้ จะบอกทิศทางและระยะเส้นตรงไปก่อน' + P1()); }
    }
  }
  function setRoute(rt, first) {
    if (!N) return;
    var pts = rt.geometry.coordinates.map(function (c) { return [c[1], c[0]]; });
    var cum = [0]; for (var i = 1; i < pts.length; i++) cum.push(cum[i - 1] + hav(pts[i - 1], pts[i]));
    var steps = [], acc = 0;
    (rt.legs[0].steps || []).forEach(function (s) {
      var loc = s.maneuver.location ? [s.maneuver.location[1], s.maneuver.location[0]] : pts[0];
      var x0 = s.intersections && s.intersections[0], ln = x0 && x0.lanes && x0.lanes.length > 1 ? x0.lanes : null;
      steps.push({ s: s, at: acc, loc: loc, ins: instr(s), ic: icon(s), road: road(s), lanes: ln, lane: laneInfo(ln, s) });
      acc += s.distance || 0;
    });
    // ปรับตำแหน่งจุดเลี้ยวให้ตรงกับระยะบนเส้น
    steps.forEach(function (st) { st.at = Math.min(cum[cum.length - 1], nearestAlong(pts, cum, st.loc)); });
    var ann = rt.legs[0].annotation, mx = ann && ann.maxspeed ? ann.maxspeed.map(function (v) { return v && v.speed ? (v.unit === 'mph' ? Math.round(v.speed * 1.609) : v.speed) : 0; }) : null;
    N.route = { pts: pts, cum: cum, total: cum[cum.length - 1], dur: rt.duration, fb: !!rt._fallback, max: mx };
    // ดึงซอย/ถนนหมู่บ้านตามเส้นทางนี้มาเก็บไว้ในเครื่อง (ใช้ตอนเน็ตหลุด)
    if (W.RR_DETAIL && N.target) safe(function () { W.RR_DETAIL(pts, [N.target.la, N.target.lo]); });
    N.steps = steps; N.along = 0; N.offN = 0; N.warned = { late: N.warned && N.warned.late };
    N.line.setLatLngs(pts); N.case.setLatLngs(pts); N.done.setLatLngs([]);
    var R = run(), it = N.target, eta = nowMin() + legMinutes(N.route.total, rt.duration);
    if (first) {
      say(PH.leg(it, N.route.total, eta), 1);
      lateCheck(eta, true);
      if (steps[1]) setTimeout(function () { if (N && N.steps === steps && !N.finished && !N.arrived) say(PH.depart(steps[0].s, steps[1].s, steps[1].at), 1); }, 600);
    } else say(PH.rerouted(N.route.total), 1);
  }
  function legMinutes(m, osrmSec) {
    var R = run(), spd = (R && R.spd) || 40, mine = m / 1000 / spd * 60;
    return Math.max(mine, (osrmSec || 0) / 60);
  }
  function nearestAlong(pts, cum, p) {
    var best = 1e18, at = 0, cosl = Math.cos(p[0] * D2R);
    for (var i = 1; i < pts.length; i++) {
      var a = pts[i - 1], b = pts[i], ax = (a[1] - p[1]) * cosl, ay = a[0] - p[0], bx = (b[1] - p[1]) * cosl, by = b[0] - p[0];
      var dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L2)) : 0;
      var x = ax + t * dx, y = ay + t * dy, dd = x * x + y * y;
      if (dd < best) { best = dd; at = cum[i - 1] + t * (cum[i] - cum[i - 1]); }
    }
    return at;
  }
  function snap(p) {
    var r = N.route, best = 1e18, out = null, cosl = Math.cos(p[0] * D2R);
    var from = 0, to = r.pts.length;
    // ค้นแถวๆ ตำแหน่งเดิมก่อน (เร็วและไม่กระโดดข้ามเส้นที่วนกลับ)
    for (var i = Math.max(1, from); i < to; i++) {
      if (r.cum[i] < N.along - 300 || r.cum[i - 1] > N.along + 3000) continue;
      var a = r.pts[i - 1], b = r.pts[i], ax = (a[1] - p[1]) * cosl, ay = a[0] - p[0], bx = (b[1] - p[1]) * cosl, by = b[0] - p[0];
      var dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L2)) : 0;
      var x = ax + t * dx, y = ay + t * dy, dd = x * x + y * y;
      if (dd < best) { best = dd; out = { at: r.cum[i - 1] + t * (r.cum[i] - r.cum[i - 1]), off: Math.sqrt(dd) * 111320, seg: i, ll: [p[0] + y, p[1] + x / cosl], brg: bearing(a, b) }; }
    }
    return out;
  }
  function pointAt(at) {
    var r = N.route, i = 1; while (i < r.cum.length - 1 && r.cum[i] < at) i++;
    var a = r.pts[i - 1], b = r.pts[i], seg = r.cum[i] - r.cum[i - 1] || 1, t = Math.max(0, Math.min(1, (at - r.cum[i - 1]) / seg));
    return { ll: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], brg: bearing(a, b), i: i };
  }

  /* ---------- ตำแหน่ง: GPS จริง / ซ้อมขับ ---------- */
  // ตำแหน่ง: เช็กให้ชัดว่าทำไมใช้ไม่ได้ แล้วบอกวิธีแก้ทีละขั้น
  function gpsStart() {
    if (!N) return;
    gpsHide();
    if (!W.isSecureContext) { gpsFail('https'); return; }
    var pp = d.permissionsPolicy || d.featurePolicy;
    if (pp && pp.allowsFeature && !pp.allowsFeature('geolocation')) { gpsFail('frame'); return; }
    if (!navigator.geolocation) { gpsFail('none'); return; }
    gpsChip('wait');
    var go = function () {
      if (!N || N.sim) return;
      // ขอตำแหน่งคร่าวๆ ก่อน (เร็ว) แล้วค่อยติดตามแบบละเอียด
      navigator.geolocation.getCurrentPosition(onPos, function () {}, { enableHighAccuracy: false, maximumAge: 60000, timeout: 8000 });
      if (N.watch != null) navigator.geolocation.clearWatch(N.watch);
      N.watch = navigator.geolocation.watchPosition(onPos, onErr, { enableHighAccuracy: true, maximumAge: 1000, timeout: 25000 });
    };
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'geolocation' }).then(function (st) {
        if (st.state === 'denied') gpsFail('denied'); else go();
        st.onchange = function () { if (N && !N.sim && st.state === 'granted') { gpsHide(); go(); } };
      }, go);
    } else go();
  }
  function onPos(p) {
    if (!N || N.sim) return;
    var c = p.coords;
    gpsHide(); gpsChip(c.accuracy);
    fix([c.latitude, c.longitude], c.speed != null && c.speed >= 0 ? c.speed : null, c.heading != null && !isNaN(c.heading) ? c.heading : null, c.accuracy);
  }
  function onErr(e) {
    if (!N || N.sim) return;
    if (e && e.code === 1) gpsFail('denied');
    else if (!N.pos) gpsFail(e && e.code === 3 ? 'timeout' : 'nosignal');
    else gpsChip('lost');
  }
  function gpsChip(a) {
    var c = $('rn-gps'); if (!c) return;
    c.hidden = !!(N && N.sim);
    if (a === 'wait') { c.className = 'rn-gpschip wait'; c.textContent = 'กำลังหาสัญญาณ GPS…'; }
    else if (a === 'lost') { c.className = 'rn-gpschip bad'; c.textContent = 'สัญญาณ GPS ขาดหาย'; }
    else { c.className = 'rn-gpschip ' + (a > 50 ? 'warn' : 'ok'); c.textContent = 'GPS ±' + Math.round(a) + ' ม.'; }
  }
  var GPSMSG = {
    frame: ['หน้านี้ใช้ตำแหน่งไม่ได้', 'หน้าตัวอย่างบน claude.ai ถูกจำกัดไม่ให้เว็บใช้ตำแหน่ง (GPS) จึงนำทางจริงในหน้านี้ไม่ได้', ['เปิดเว็บจริงที่ roiet-route.netlify.app หลังติดตั้งไฟล์ชุดนี้ จะใช้ GPS ได้ปกติ', 'ระหว่างนี้กด "ซ้อมขับ" เพื่อลองนำทางตามเส้นทางจริงได้เลย']],
    https: ['ต้องเปิดผ่าน https', 'เบราว์เซอร์ให้ใช้ตำแหน่งเฉพาะเว็บที่เป็น https', ['เปิดผ่านลิงก์ https://roiet-route.netlify.app', 'ถ้าเปิดไฟล์ในเครื่อง ให้กด "ซ้อมขับ" แทน']],
    denied: ['ยังไม่ได้อนุญาตให้ใช้ตำแหน่ง', 'เบราว์เซอร์บล็อกตำแหน่งของเว็บนี้ไว้ แก้ได้ตามนี้', ['Android (Chrome): แตะไอคอนหน้าลิงก์ด้านบน > สิทธิ์ > ตำแหน่ง > อนุญาต แล้วกด "ลองอีกครั้ง"', 'iPhone: การตั้งค่า > ความเป็นส่วนตัว > บริการหาตำแหน่ง > เปิด แล้วเลือก Safari (หรือ Chrome) > "ขณะใช้แอป" และเปิด "ตำแหน่งที่แม่นยำ"', 'คอมพิวเตอร์: คลิกไอคอนหน้าลิงก์ > ตำแหน่ง > อนุญาต']],
    timeout: ['หาตำแหน่งไม่ทัน', 'ยังจับสัญญาณ GPS ไม่ได้', ['เปิด GPS/บริการหาตำแหน่งของเครื่อง', 'ออกไปที่โล่ง ห่างอาคารหรือหลังคา แล้วกด "ลองอีกครั้ง"']],
    nosignal: ['หาตำแหน่งไม่ได้', 'เครื่องยังไม่ส่งตำแหน่งมาให้', ['เปิด GPS/บริการหาตำแหน่งของเครื่อง', 'ปิดโหมดประหยัดพลังงานที่จำกัดตำแหน่ง แล้วกด "ลองอีกครั้ง"']],
    none: ['เครื่องนี้ไม่มี GPS', 'เบราว์เซอร์นี้ไม่รองรับการหาตำแหน่ง', ['ลองเปิดด้วย Chrome หรือ Safari บนมือถือ']],
  };
  function gpsFail(kind) {
    if (!N || N.sim) return;
    var m = GPSMSG[kind] || GPSMSG.nosignal, box = $('rn-gpsbox');
    gpsChip('lost');
    $('rn-ins').textContent = m[0]; $('rn-dist').textContent = 'GPS';
    box.hidden = false;
    box.innerHTML = '<div class="rn-card rn-cgps"><div class="rn-ahead"><span class="rn-gpsic">' + ic('loc') + '</span><div><small>ตำแหน่ง (GPS)</small><b>' + esc(m[0]) + '</b><em>' + esc(m[1]) + '</em></div></div>' +
      '<ol class="rn-steps">' + m[2].map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ol>' +
      '<div class="rn-ab">' + (kind === 'frame' || kind === 'https' || kind === 'none' ? '' : '<button type="button" class="rn-big ok" data-c="gpsretry">' + ic('loc') + 'ลองอีกครั้ง</button>') + '<button type="button" class="rn-big alt" data-c="sim">' + ic('play') + 'ซ้อมขับแทน</button></div></div>';
  }
  function gpsHide() { var b = $('rn-gpsbox'); if (b) { b.hidden = true; b.innerHTML = ''; } }
  function fix(p, spd, hdg, acc) {
    if (!N) return;
    var prev = N.pos, now = Date.now();
    if (prev) {
      var dm = hav(prev, p), dt = (now - N.fixAt) / 1000;
      if (spd == null && dt > 0) spd = dm / dt;
      if (dm > 3) { N.head = hdg != null && spd > 1.5 ? hdg : bearing(prev, p); N.drivenM += dm < 2000 ? dm : 0; }
    }
    N.pos = p; N.fixAt = now; N.acc = acc; N.speed = spd || 0;
    if (!N.shown) { N.shown = p.slice(); N.showHead = N.head; }
    progress();
  }
  function simStart() {
    N.sim = true; N.simAt = performance.now(); simBtn(); setTiles();
    if (!N.pos) {
      var R = run(), prevIt = R.items[R.cur - 1], start = prevIt ? [prevIt.la, prevIt.lo] : null;
      if (!start) { var dp = R.items.filter(function (x) { return x.k !== 'stop'; })[0]; start = dp ? [dp.la, dp.lo] : [N.target ? N.target.la + 0.03 : 16.05, N.target ? N.target.lo - 0.03 : 103.65]; }
      fix(start, 0, null, 5);
    }
    bubble('โหมดซ้อมขับ: รถจะวิ่งตามเส้นทางจริงให้ดูเอง แตะ ×' + N.simMul + ' เพื่อเปลี่ยนความเร็ว');
  }
  function simStep(ms) {
    if (!N.route || N.arrived) return;
    var v = 14 * N.simMul, rem = N.route.total - N.simD; // ~50 กม./ชม. × ตัวคูณ
    var near = N.steps.filter(function (s) { return s.at > N.simD; })[0];
    if (near && near.at - N.simD < 60 && near.ic !== 'straight') v = Math.min(v, 7 * N.simMul); // ชะลอตอนเลี้ยว
    N.simD = Math.min(N.route.total, N.simD + v * ms / 1000);
    var q = pointAt(N.simD);
    N.head = q.brg;
    N.pos = q.ll; N.speed = v / N.simMul; N.fixAt = Date.now();
    N.drivenM += v * ms / 1000;
    if (!N.shown) { N.shown = q.ll.slice(); N.showHead = q.brg; }
    if (rem < 1) N.speed = 0;
    progress();
  }

  /* ---------- ความคืบหน้า + เสียงเตือน ---------- */
  function progress() {
    if (!N || !N.route || !N.pos) return;
    var sn = snap(N.pos);
    if (!sn) return;
    if (sn.off > Math.max(45, (N.acc || 0) * 1.2) && !N.route.fb) {
      N.offN++;
      if (N.offN >= 3 && Date.now() - N.lastRoute > 8000) { say(PH.reroute(), 2); N.offN = 0; route(false); return; }
    } else { N.offN = 0; N.along = N.sim ? N.simD : sn.at; }
    if (N.route.fb) N.along = N.route.total - hav(N.pos, [N.target.la, N.target.lo]);
    var rem = Math.max(0, N.route.total - N.along);
    // ขั้นถัดไป
    var k = 0; while (k < N.steps.length - 1 && N.steps[k + 1].at <= N.along + 5) k++;
    var nx = N.steps[k + 1] || N.steps[N.steps.length - 1], dist = Math.max(0, nx.at - N.along), then = N.steps[k + 2];
    hud(nx, dist, then, rem);
    voice(k + 1, nx, dist, then);
    // ถึงจุดหมาย
    var dTarget = hav(N.pos, [N.target.la, N.target.lo]);
    if (!N.arrived && (dTarget < 40 || (rem < 25 && dTarget < 120))) arrive();
    // เตือนความเร็ว / พักรถ
    var kmh = N.speed * 3.6, lim = limitAt(N.along), over = lim ? kmh > lim + 7 : kmh > 92;
    var le = $('rn-limit'); if (le._v !== lim) { le._v = lim; le.hidden = !lim; le.textContent = lim || ''; }
    if (!N.sim && over) { if (!N.overSince) N.overSince = Date.now(); if (Date.now() - N.overSince > 8000 && Date.now() - N.lastSpeedWarn > 120000) { N.lastSpeedWarn = Date.now(); say(PH.speed(), 1); } } else N.overSince = 0;
    if (!N.sim && Date.now() - N.lastBreak > 2 * 3600e3 && kmh < 5) { N.lastBreak = Date.now(); say(PH.rest(), 1); }
    // ทุก 2 นาทีเช็กว่าจะทันเวลาร้านไหม
    if (!N.lateAt || Date.now() - N.lateAt > 120000) { N.lateAt = Date.now(); lateCheck(nowMin() + legMinutes(rem, rem / Math.max(N.speed, 9)), false); }
    var sp = $('rn-speed'); qs('b', sp).textContent = Math.round(kmh); sp.classList.toggle('fast', over);
    if (N.done && N.route) { var q = pointAt(N.along); N.done.setLatLngs(N.route.pts.slice(0, q.i).concat([q.ll])); }
  }
  function limitAt(d) {
    var r = N.route; if (!r || !r.max) return 0;
    var lo = 0, hi = r.cum.length - 1;
    while (hi - lo > 1) { var m = (lo + hi) >> 1; if (r.cum[m] <= d) lo = m; else hi = m; }
    return r.max[lo] || 0;
  }
  function lateCheck(eta, first) {
    var it = N.target; if (!it || it.k !== 'stop') return;
    var tag = $('rn-dtw');
    if (it.cl != null && eta > it.cl - 5) {
      tag.classList.add('late');
      if (!N.warned.late) { N.warned.late = 1; say(PH.late(it), 1); }
    } else tag.classList.remove('late');
  }
  function hud(nx, dist, then, rem) {
    var arrive = nx.ic === 'arrive';
    $('rn-arw').innerHTML = arrow(nx.ic, dist < 60 ? 'now' : '');
    $('rn-dist').textContent = arrive && dist < 30 ? 'ถึงแล้ว' : distTxt(dist);
    $('rn-ins').textContent = arrive ? 'ถึง ' + destName(N.target) : nx.ins;
    var side = arrive ? (nx.s.maneuver.modifier === 'left' ? 'ซ้าย' : nx.s.maneuver.modifier === 'right' ? 'ขวา' : '') : '';
    $('rn-road').textContent = arrive ? [side && dist < 800 ? 'จุดส่งอยู่ทาง' + side + 'มือ' : '', N.target.tw ? 'เวลาร้าน ' + N.target.tw : ''].filter(Boolean).join(' · ') : '';
    var lb = $('rn-lanes'), lh = !arrive && dist < (nx.lanes ? 1500 : 700) ? laneHtml(nx) : '';
    lb.hidden = !lh; if (lb._h !== lh) { lb._h = lh; lb.innerHTML = lh; }
    var seg = Math.max(200, nx.at - (N.steps[N.steps.indexOf(nx) - 1] || { at: 0 }).at), pr = Math.max(0, Math.min(1, 1 - dist / seg));
    var ring = $('rn-ringp'); ring.style.strokeDashoffset = (283 * (1 - pr)).toFixed(1);
    $('rn-man').classList.toggle('soon', dist < 120 && !arrive);
    var th = $('rn-then');
    if (then && dist < 1500 && then.at - nx.at < 600) { th.hidden = false; th.innerHTML = 'จากนั้น ' + arrow(then.ic, 'mini') + esc(then.ins.replace(/^ถึงจุดหมาย.*/, 'ถึงจุดหมาย')); }
    else th.hidden = true;
    var mins = legMinutes(rem, rem / Math.max(N.speed || 0, 9)), R = run();
    $('rn-eta').textContent = m2t(nowMin() + mins);
    $('rn-rem').textContent = distTxt(rem) + ' · ' + durTxt(mins);
  }
  function voice(k, nx, dist, then) {
    var w = N.warned, spd = Math.max(N.speed, 8), key = 's' + k + '_';
    if (nx.ic === 'arrive') {
      if (dist < 400 && dist > 60 && !w[key + 'a']) { w[key + 'a'] = 1; say(PH.near(N.target, dist, nx.s.maneuver.modifier === 'left' ? 'ซ้าย' : nx.s.maneuver.modifier === 'right' ? 'ขวา' : ''), 2); }
      return;
    }
    var far = Math.max(600, spd * 35), mid = Math.max(220, spd * 14), now = Math.max(40, spd * 4);
    if (nx.ic === 'straight') return; // ตรงไปตามถนนเดิม ไม่ต้องพูดให้รำคาญ
    var chain = then && then.ic !== 'arrive' && then.at - nx.at < 120 ? then.s : null;
    if (!w[key + 'p']) { w[key + 'p'] = 1; prefetch(PH.now(nx.s, chain)); }
    if (dist <= now) { if (!w[key + 'n']) { w[key + 'n'] = w[key + 'm'] = w[key + 'f'] = 1; say(PH.now(nx.s, chain), 2); } }
    else if (dist <= mid) { if (!w[key + 'm']) { w[key + 'm'] = w[key + 'f'] = 1; say(PH.mid(nx.s, dist, chain, nx.lane), 2); } }
    else if (dist <= far && dist > mid + 150) { if (!w[key + 'f']) { w[key + 'f'] = 1; say(PH.far(nx.s, dist, nx.lane), 1); } }
  }

  /* ---------- ถึงจุดหมาย ---------- */
  function arrive() {
    N.arrived = true;
    var it = N.target, R = run(), left = stops(R).filter(function (x) { return x.st === 'todo'; }).length;
    say(PH.arrive(it), 2);
    var a = $('rn-arrive'); a.hidden = false;
    if (it.k === 'stop') {
      a.innerHTML = '<div class="rn-card"><div class="rn-ahead">' + arrow('arrive') + '<div><small>ถึงจุดที่ ' + it.no + '</small><b>' + esc(it.n) + '</b>' + (it.tw ? '<em>เวลาร้าน ' + esc(it.tw) + '</em>' : '') + '</div></div>' +
        '<div class="rn-ab"><button type="button" class="rn-big ok" data-c="ok">' + ic('check') + 'ส่งสำเร็จ</button><button type="button" class="rn-big bad" data-c="failui">✗ ส่งไม่ได้</button></div>' +
        '<div class="rn-why" hidden>' + FAILR.map(function (r) { return '<button type="button" data-c="fail" data-r="' + r + '">' + r + '</button>'; }).join('') + '</div>' +
        '<button type="button" class="rn-link" data-c="notyet">ยังไม่ถึง นำทางต่อ</button><p class="rn-left">' + (left > 1 ? 'เหลืออีก ' + (left - 1) + ' จุดหลังจากนี้' : 'จุดสุดท้ายแล้ว!') + '</p></div>';
    } else {
      a.innerHTML = '<div class="rn-card"><div class="rn-ahead">' + arrow('arrive') + '<div><small>' + (it.k === 'end' ? 'ปลายทาง' : 'กลับคลัง') + '</small><b>' + esc(it.n) + '</b></div></div>' +
        '<div class="rn-ab"><button type="button" class="rn-big ok" data-c="' + (it.k === 'end' ? 'end' : 'dep') + '">' + ic('check') + (it.k === 'end' ? 'ถึงคลัง จบงาน' : 'ขึ้นของเสร็จ ออกเที่ยวถัดไป') + '</button></div>' +
        '<button type="button" class="rn-link" data-c="notyet">ยังไม่ถึง นำทางต่อ</button></div>';
    }
  }
  function hideArrive() { var a = $('rn-arrive'); if (a) { a.hidden = true; a.innerHTML = ''; } }
  function done(kind, reason) {
    var R0 = run(), it = R0.items[R0.cur];
    act(kind, reason);
    var R = run(), left = stops(R).filter(function (x) { return x.st === 'todo'; }).length;
    if (kind === 'ok') { confetti(); say(PH.ok(left), 2); }
    if (kind === 'fail') say(PH.fail(reason, left), 2);
    N.idx = -1; N.target = null; N.simD = 0; hideArrive();
    setTimeout(function () { safe(syncRun); }, 900);
  }
  function finishCard(R) {
    if (!N || N.finished) return; N.finished = true;
    var st = stops(R), ok = st.filter(function (x) { return x.st === 'ok'; }).length, bad = st.length - ok, min = R.t1 && R.t0 ? Math.round((R.t1 - R.t0) / 60000) : null;
    var a = $('rn-arrive'); a.hidden = false;
    a.innerHTML = '<div class="rn-card fin"><div class="rn-trophy">🏁</div><b>จบงานวันนี้แล้ว!</b><div class="rn-stats"><span><b>' + ok + '/' + st.length + '</b>ส่งสำเร็จ</span><span><b>' + (N.drivenM / 1000).toFixed(1) + '</b>กม. ที่นำทาง</span><span><b>' + (min != null ? durTxt(min) : '–') + '</b>เวลาทั้งหมด</span></div>' +
      (bad ? '<p class="rn-left">ส่งไม่ได้ ' + bad + ' จุด ระบบแจ้งผู้วางแผนแล้ว</p>' : '<p class="rn-left">ส่งครบทุกจุด ยอดเยี่ยม!</p>') +
      '<button type="button" class="rn-big ok" data-c="exitdrv">บันทึกผลในหน้าคนขับ</button></div>';
    confetti();
    say(PH.finish(ok, st.length), 2);
  }
  function confetti() {
    if (!N || W.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var box = el('div', 'rn-conf'); N.root.appendChild(box);
    for (var i = 0; i < 36; i++) { var p = el('i'); p.style.left = (Math.random() * 100) + '%'; p.style.background = ['#ff8a1f', '#ffd166', '#27b879', '#4cc3ff', '#ff5d8f'][i % 5]; p.style.animationDelay = (Math.random() * 0.4) + 's'; p.style.setProperty('--x', (Math.random() * 160 - 80) + 'px'); box.appendChild(p); }
    setTimeout(function () { box.remove(); }, 2600);
  }

  // ปุ่มแจ้งถนนผิด/ไม่มีในแผนที่: เปิดหน้าแจ้งของ OpenStreetMap ตรงตำแหน่งรถ (ใครก็แจ้งได้ ไม่ต้องสมัคร)
  function osmReport() {
    var p = N.pos || N.shown; if (!p) return '';
    var u = 'https://www.openstreetmap.org/note/new#map=18/' + p[0].toFixed(5) + '/' + p[1].toFixed(5);
    var st = W.RR_DETAIL_STATS ? W.RR_DETAIL_STATS() : null;
    return '<div class="rn-osm"><a href="' + u + '" target="_blank" rel="noopener">' + ic('map') + 'แจ้งถนนผิด / ซอยไม่มีในแผนที่</a>' +
      '<small>เปิด OpenStreetMap ตรงจุดที่รถอยู่ ปักหมุดแล้วพิมพ์ว่าผิดอะไร อาสาสมัครจะแก้ แล้วแผนที่กับเส้นทางในเว็บนี้จะถูกต้องขึ้นเอง' + (st && st.roads ? ' · ตอนนี้เก็บซอยในเครื่องแล้ว ' + st.roads.toLocaleString() + ' เส้น' : '') + '</small></div>';
  }
  function stepList() {
    var b = $('rn-set'); if (!N.steps) return;
    var up = N.steps.filter(function (x) { return x.at > N.along + 5; });
    b.hidden = false;
    b.innerHTML = '<div class="rn-card rn-cset"><div class="rn-ahead"><span class="rn-gpsic">' + ic('map') + '</span><div><small>ไป ' + esc(destName(N.target)) + '</small><b>เส้นทางทีละจุดเลี้ยว</b><em>' + up.length + ' จุด · ' + distTxt(N.route.total - N.along) + '</em></div></div><ol class="rn-slist">' +
      up.map(function (x) { var d = x.at - N.along; return '<li>' + arrow(x.ic) + '<div><b>' + esc(x.ic === 'arrive' ? 'ถึง ' + destName(N.target) : x.ins) + '</b><small>' + distTxt(d) + (x.lane ? ' · ' + esc(x.lane.short) : '') + '</small></div></li>'; }).join('') +
      '</ol>' + osmReport() + '<div class="rn-ab"><button type="button" class="rn-big ok" data-c="setclose">กลับไปนำทาง</button></div></div>';
  }
  function settings() {
    var b = $('rn-set'); b.hidden = false;
    var opt = function (c, v, cur, label, sub) { return '<button type="button" class="rn-opt' + (String(cur) === String(v) ? ' on' : '') + '" data-c="' + c + '" data-v="' + v + '"><b>' + label + '</b>' + (sub ? '<small>' + sub + '</small>' : '') + '</button>'; };
    b.innerHTML = '<div class="rn-card rn-cset"><div class="rn-ahead"><i class="rn-av big" aria-hidden="true"><svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="18"/><circle class="e" cx="14" cy="17" r="2.4"/><circle class="e" cx="26" cy="17" r="2.4"/><path class="m" d="M13 25q7 6 14 0"/></svg></i><div><small>ผู้ช่วยนำทาง</small><b>เสียงที่ใช้บอกทาง</b></div></div>' +
      '<p class="rn-lab">เสียงผู้ช่วย</p><div class="rn-opts">' + opt('g', 'f', V.g, 'ผู้หญิง', 'น้องเอ็ด · ลงท้าย "ค่ะ"') + opt('g', 'm', V.g, 'ผู้ชาย', 'พี่เอ็ด · ลงท้าย "ครับ"') + '</div>' +
      '<p class="rn-lab">ความเร็วในการพูด</p><div class="rn-opts three">' + opt('rate', -12, V.rate, 'ช้า') + opt('rate', 0, V.rate, 'ปกติ') + opt('rate', 12, V.rate, 'เร็ว') + '</div>' +
      '<p class="rn-vnote" id="rn-vnote"></p><ul class="rn-vtip" id="rn-vtip" hidden></ul>' +
      '<div class="rn-ab"><button type="button" class="rn-big alt" data-c="vtest">' + ic('vol') + 'ลองฟังเสียง</button><button type="button" class="rn-big ok" data-c="setclose">เสร็จแล้ว</button></div></div>';
    voiceNote();
  }

  /* ---------- ปุ่ม ---------- */
  function voiceBtn() { var b = qs('[data-c=voice]', N.root); if (b) { b.innerHTML = ic(V.on ? 'vol' : 'mute'); b.classList.toggle('off', !V.on); } }
  function simBtn() { var b = qs('[data-c=sim]', N.root); if (b) { b.innerHTML = ic(N.sim ? 'pause' : 'play') + '<span>' + (N.sim ? 'ซ้อมขับ ×' + N.simMul : 'ซ้อมขับ') + '</span>'; b.classList.toggle('on', N.sim); } }
  function followOff() { if (!N || N.overview) return; N.follow = false; qs('[data-c=center]', N.root).hidden = false; }
  function onClick(e) {
    var b = e.target.closest('[data-c]'); if (!b || !N) return;
    var c = b.dataset.c;
    if (c === 'exit') { close(); return; }
    if (c === 'exitdrv') { close(); var p = $('drvpill'); if (p && !p.hidden) p.click(); else { var db = $('drvbtn'); if (db) db.click(); } return; }
    if (c === 'voice') { V.on = !V.on; pref.voice = V.on; ls('rr.navpref', pref); voiceBtn(); if (!V.on) { V.q = []; stopAudio(); } else say(PH.on(), 1); return; }
    if (c === 'theme') { N.theme = N.theme === 'day' ? 'night' : N.theme === 'night' ? 'sat' : 'day'; pref.theme = N.theme; ls('rr.navpref', pref); setTiles(); return; }
    if (c === 'over') { N.overview = !N.overview; N.map.setMinZoom(N.overview ? 6 : 12.5); b.classList.toggle('on', N.overview); N.root.classList.toggle('over', N.overview); if (N.overview && N.route) { N.map.fitBounds(N.line.getBounds(), { padding: [N.S * 0.36, N.S * 0.36] }); } else { N.follow = true; } return; }
    if (c === 'center') { N.follow = true; b.hidden = true; return; }
    if (c === 'sim') {
      if (!N.sim) { gpsHide(); var gc = $('rn-gps'); if (gc) gc.hidden = true; simStart(); }
      else { N.simMul = N.simMul === 1 ? 4 : N.simMul === 4 ? 12 : N.simMul === 12 ? 30 : N.simMul === 30 ? 0 : 1; if (N.simMul === 0) { N.sim = false; N.simMul = 4; simBtn(); setTiles(); gpsStart(); bubble('ปิดซ้อมขับ กลับมาใช้ GPS จริง'); return; } simBtn(); }
      return;
    }
    if (c === 'here') { if (!N.target) return; if (!N.arrived) arrive(); return; }
    if (c === 'gpsretry') { gpsStart(); return; }
    if (c === 'steps') { stepList(); return; }
    if (c === 'settings') { settings(); return; }
    if (c === 'setclose') { var st0 = $('rn-set'); st0.hidden = true; st0.innerHTML = ''; return; }
    if (c === 'g') { V.g = b.dataset.v; pref.g = V.g; ls('rr.navpref', pref); V.q = []; stopAudio(); settings(); say(PH.test(), 1); return; }
    if (c === 'rate') { V.rate = +b.dataset.v; pref.rate = V.rate; ls('rr.navpref', pref); settings(); say(PH.test(), 1); return; }
    if (c === 'vtest') { V.on = true; pref.voice = true; ls('rr.navpref', pref); voiceBtn(); say(PH.test(), 1); return; }
    if (c === 'notyet') { hideArrive(); N.arrived = false; N.warned = {}; say(PH.cont(), 1); return; }
    if (c === 'ok') { done('ok'); return; }
    if (c === 'failui') { var w = qs('.rn-why', N.root); w.hidden = !w.hidden; return; }
    if (c === 'fail') { done('fail', b.dataset.r); return; }
    if (c === 'dep' || c === 'end') { done(c); return; }
  }

  /* ---------- วาดทุกเฟรม ---------- */
  var lastT = 0;
  function loop(t) {
    if (!N) return;
    N.raf = requestAnimationFrame(loop);
    t = t || performance.now();
    var ms = Math.min(250, lastT ? t - lastT : 16); lastT = t;
    if (N.sim) safe(function () { simStep(ms); });
    if (!N.pos) return;
    // เลื่อนนุ่มๆ ไปหาตำแหน่งล่าสุด
    var k = N.sim ? 1 : Math.min(1, ms / 450);
    N.shown[0] += (N.pos[0] - N.shown[0]) * k; N.shown[1] += (N.pos[1] - N.shown[1]) * k;
    N.showHead = lerpAng(N.showHead, N.head, Math.min(1, ms / (N.sim ? 260 : 600)));
    // ซูมตามความเร็ว และซูมเข้าเมื่อใกล้จุดเลี้ยว
    var kmh = N.speed * 3.6, want = kmh > 75 ? 15.25 : kmh > 45 ? 15.75 : 16.5;
    var nxt = N.steps && N.steps.filter(function (s) { return s.at > N.along; })[0];
    if (nxt && nxt.at - N.along < 220) want = Math.max(want, 16.75);
    var map = N.map, wr = $('rn-wrap');
    if (N.overview) { wr.style.transform = 'none'; } else {
      if (N.follow) {
        if (Math.abs(map.getZoom() - want) > 0.4 && !N._zt) { N._zt = 1; map.setView(N.shown, want, { animate: false }); setTimeout(function () { if (N) N._zt = 0; }, 1500); }
        else {
          var c = map.getSize().divideBy(2), p = map.latLngToContainerPoint(N.shown);
          var dx = p.x - c.x, dy = p.y - c.y;
          if (Math.abs(dx) > 0.2 || Math.abs(dy) > 0.2) {
            // เลื่อนแผนที่แบบเบาๆ ทุกเฟรม แล้วค่อยให้ไทล์/เส้นทางอัปเดตเป็นระยะ (ประหยัดแบต)
            if (map._rawPanBy) { map._rawPanBy(W.L.point(dx, dy)); map.fire('move'); if (t - (N._me || 0) > 450) { N._me = t; map.fire('moveend'); } }
            else map.panBy([dx, dy], { animate: false });
          }
        }
      }
      wr.style.transform = 'perspective(' + PERSP + 'px) rotateX(' + TILT + 'deg) rotateZ(' + (-N.showHead).toFixed(2) + 'deg)';
    }
    var car = $('rn-car');
    if (N.overview || !N.follow) {
      var q = project(N.shown); car.hidden = q.behind; car.style.left = q.x + 'px'; car.style.top = q.y + 'px';
      car.style.transform = 'translate(-50%,-50%) rotate(' + (N.overview ? N.showHead : 0) + 'deg)';
    } else { car.hidden = false; car.style.left = N.anchor[0] + 'px'; car.style.top = N.anchor[1] + 'px'; car.style.transform = 'translate(-50%,-50%)'; }
    pins();
    if (W.RR_BASEMAP && W.RR_BASELABELS) safe(function () { baseLabels(t); });
  }
  // ชื่อถนน/หมู่บ้าน/สถานที่ ของแผนที่สำรอง: วาดตั้งตรงบนจอ ไม่ทับกัน (แบบแอปนำทาง)
  var LB = { at: 0, cand: [], pool: [] };
  function baseLabels(t) {
    var box = $('rn-lbls'); if (!box) return;
    var z = N.map.getZoom();
    if (t - LB.at > 500) {
      LB.at = t; LB.cand = W.RR_BASELABELS(N.shown, N.overview ? 9000 : 2600, z);
      // พื้นที่ห้ามวางชื่อ: แถบบน แผงล่าง ฟองคำพูด มาตรความเร็ว ปุ่มด้านข้าง (อ่านขนาดครั้งเดียวต่อรอบ ไม่ให้หน้าเว็บคำนวณซ้ำทุกเฟรม)
      LB.ex = ['.rn-top', '.rn-sheet', '#rn-bub', '#rn-speed', '.rn-side', '#rn-lanes'].map(function (q) { var e = qs(q, N.root); if (!e || e.hidden || !e.offsetParent) return null; var r = e.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; }).filter(Boolean);
    }
    var S = N.S, M = matrix(), vw = W.innerWidth, vh = W.innerHeight, used = (LB.ex || []).slice(), shown = 0, max = vw < 700 ? 16 : 28, pois = 0;
    var car = N.overview ? null : [N.anchor[0] - 46, N.anchor[1] - 60, N.anchor[0] + 46, N.anchor[1] + 34]; if (car) used.push(car);
    var hd = N.overview ? 0 : N.showHead;
    for (var i = 0; i < LB.cand.length && shown < max; i++) {
      var o = LB.cand[i], p = N.map.latLngToContainerPoint(o.ll);
      if (!N.overview && (p.x < 0 || p.y < 0 || p.x > S || p.y > S)) continue;
      var q = M.transformPoint(new DOMPoint(p.x, p.y, 0, 1)); if (q.w <= 0.05) continue;
      var x = q.x / q.w, y = q.y / q.w, sc = 1 / q.w;
      if (y < vh * 0.2 || y > vh - 40 || sc < 0.5) continue;
      var w = (o.t.length * 6.4 + (o.ic ? 24 : 0) + 16) * Math.min(1.1, sc), h = 22 * Math.min(1.1, sc), r = [x - w / 2, y - h / 2, x + w / 2, y + h / 2];
      if (r[0] < 4 || r[2] > vw - 4) continue; // ไม่วางชื่อที่ล้นขอบจอ
      if (o.k === 'poi' && pois >= (vw < 700 ? 4 : 7)) continue;
      if (used.some(function (u) { return r[0] < u[2] + 6 && r[2] > u[0] - 6 && r[1] < u[3] + 4 && r[3] > u[1] - 4; })) continue;
      used.push(r); if (o.k === 'poi') pois++;
      var e = LB.pool[shown] || (LB.pool[shown] = box.appendChild(el('div', 'rn-lbl')));
      if (e._o !== o) { e._o = o; e.className = 'rn-lbl ' + o.k + (o.c != null ? ' c' + o.c : ''); e.innerHTML = (o.ic ? '<i>' + o.ic + '</i>' : '') + '<span>' + esc(o.t) + '</span>'; }
      var ang = 0;
      if (o.br != null && (o.k === 'road')) { ang = ((o.br - hd - 90) % 360 + 540) % 360 - 180; if (ang > 90) ang -= 180; if (ang < -90) ang += 180; if (Math.abs(ang) > 60) ang = 0; ang *= 0.6; }
      e.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0) translate(-50%,-50%) rotate(' + ang.toFixed(1) + 'deg) scale(' + Math.min(1.1, Math.max(0.7, sc)).toFixed(2) + ')';
      e.hidden = false; shown++;
    }
    for (var k = shown; k < LB.pool.length; k++) if (!LB.pool[k].hidden) LB.pool[k].hidden = true;
  }
  // หมุดจุดหมายและจุดเลี้ยวถัดไป วาดตั้งตรงบนจอ (ไม่เอียงตามพื้น)
  function pins() {
    var box = $('rn-pins'); if (!box || !N.target) return;
    var R = run(), list = [{ ll: [N.target.la, N.target.lo], c: 'dest', t: N.target.k === 'stop' ? N.target.no : '⌂' }];
    if (R && R.items) R.items.forEach(function (x, i) { if (i > R.cur && x.k === 'stop' && x.st === 'todo') list.push({ ll: [x.la, x.lo], c: 'next', t: x.no }); });
    var nx = N.steps && N.steps.filter(function (s) { return s.at > N.along + 5; })[0];
    if (nx && nx.ic !== 'arrive' && !N.overview) list.push({ ll: nx.loc, c: 'turn', t: '' });
    while (box.children.length < list.length) box.appendChild(el('div', 'rn-pin'));
    var vw = W.innerWidth, vh = W.innerHeight;
    Array.prototype.forEach.call(box.children, function (e, i) {
      var o = list[i]; if (!o) { e.hidden = true; return; }
      var q = project(o.ll);
      if (q.behind || q.y < -40 || q.y > vh + 60 || q.x < -60 || q.x > vw + 60) { e.hidden = true; return; }
      e.hidden = false; e.className = 'rn-pin ' + o.c;
      var s = Math.max(0.45, Math.min(1.25, q.s * (N.overview ? 1 : 1.1)));
      e.style.transform = 'translate(' + q.x.toFixed(1) + 'px,' + q.y.toFixed(1) + 'px) scale(' + s.toFixed(3) + ')';
      if (e._t !== o.t) { e._t = o.t; e.innerHTML = o.c === 'turn' ? '<i></i>' : '<b>' + esc(o.t) + '</b><i></i>'; }
    });
  }

  /* ---------- ปุ่มเข้าหน้านำทางในโหมดคนขับเดิม ---------- */
  function inject() {
    var drv = $('drv'); if (!drv) return;
    var R = run(); if (!R) return;
    var nav = qs('.dnav', drv);
    if (nav && !qs('.rn-go', drv)) {
      var b = el('button', 'btn dbig rn-go', '<span class="rn-go-ic">' + arrow('straight') + '</span><span><b>นำทางในเว็บ</b><small>มีเสียงบอกทาง · ROI ET NAVI</small></span>');
      b.type = 'button'; b.onclick = function () { open(); };
      nav.parentNode.insertBefore(b, nav);
      nav.classList.add('rn-gmap'); nav.lastChild && (nav.lastChild.textContent = 'เปิดใน Google Maps');
    }
    var st = qs('[data-a=start]', drv);
    if (st && !qs('.rn-go2', drv)) {
      var b2 = el('button', 'btn dbig rn-go rn-go2', '<span class="rn-go-ic">' + arrow('straight') + '</span><span><b>เริ่มออกรถ + นำทางในเว็บ</b><small>มีเสียงบอกทางทุกแยก</small></span>');
      b2.type = 'button'; b2.onclick = function () { open(); };
      st.parentNode.insertBefore(b2, st);
    }
  }
  function boot() {
    var drv = $('drv');
    if (drv && W.MutationObserver) new MutationObserver(function () { safe(inject); }).observe(drv, { childList: true, subtree: false });
    safe(inject);
    // ปุ่มลัดเมื่อหน้านำทางปิดอยู่ระหว่างวิ่งงาน
    W.RRNav = { open: open, close: close, sim: function () { open({ sim: true }); } };
  }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', boot); else boot();
})();
