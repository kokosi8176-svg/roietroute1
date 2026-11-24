/* ROI ET Route — ติดตั้งเป็นแอปบนมือถือ/คอม (PWA)
   - ใส่ manifest/ไอคอนให้เอง (ถ้าใน index.html ยังไม่มี)
   - ลงทะเบียน sw.js ให้เปิดได้ตอนเน็ตหลุด
   - ปุ่ม "ติดตั้งแอป" (Android/คอม) และคำแนะนำสำหรับ iPhone
   - แถบแจ้งเตือนเมื่อเน็ตหลุด/กลับมา
   ไม่แตะระบบเดิมของเว็บ */
(function () {
  'use strict';
  var W = window, d = document;
  if (W.__rrPwa) return; W.__rrPwa = true;
  var standalone = (W.matchMedia && W.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  function head(tag, attrs) {
    var sel = tag + Object.keys(attrs).filter(function (k) { return k === 'rel' || k === 'name'; }).map(function (k) { return '[' + k + '="' + attrs[k] + '"]'; }).join('');
    if (d.head.querySelector(sel)) return;
    var e = d.createElement(tag); Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); }); d.head.appendChild(e);
  }
  head('link', { rel: 'manifest', href: 'manifest.webmanifest' });
  head('meta', { name: 'theme-color', content: '#ff8a1f' });
  head('link', { rel: 'apple-touch-icon', href: 'apple-touch-icon.png' });
  head('meta', { name: 'apple-mobile-web-app-capable', content: 'yes' });
  head('meta', { name: 'mobile-web-app-capable', content: 'yes' });
  head('meta', { name: 'apple-mobile-web-app-title', content: 'ROI ET Route' });
  head('meta', { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' });

  // ใช้ได้เฉพาะเว็บจริงที่เป็น https (หน้าตัวอย่างบน claude.ai และไฟล์ในเครื่องจะข้ามไปเอง)
  var canSW = 'serviceWorker' in navigator && W.isSecureContext && location.protocol !== 'file:' && W.top === W.self;
  if (canSW) W.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });

  /* ---------- สไตล์ ---------- */
  var css = d.createElement('style');
  css.textContent = '.rr-pwa{position:fixed;z-index:5000;left:50%;transform:translateX(-50%);bottom:calc(14px + env(safe-area-inset-bottom));display:flex;align-items:center;gap:10px;max-width:calc(100vw - 24px);padding:8px 8px 8px 14px;border-radius:16px;background:#132036;color:#fff;font:500 14px/1.35 Kanit,Sarabun,sans-serif;box-shadow:0 14px 34px rgba(5,10,20,.35);animation:rr-pwa-in .35s cubic-bezier(.2,1.2,.4,1)}' +
    '@keyframes rr-pwa-in{from{transform:translate(-50%,30px);opacity:0}}' +
    '.rr-pwa img{width:34px;height:34px;border-radius:9px}.rr-pwa b{display:block;font-weight:600}.rr-pwa small{opacity:.75}' +
    '.rr-pwa button{border:0;border-radius:11px;padding:9px 14px;font:600 14px Kanit,sans-serif;cursor:pointer}.rr-pwa .go{background:linear-gradient(135deg,#ffb84a,#ff7a12);color:#1b1206}.rr-pwa .no{background:transparent;color:#c9d5e8;padding:9px 8px}' +
    '.rr-net{position:fixed;z-index:5001;left:50%;top:calc(8px + env(safe-area-inset-top));transform:translateX(-50%);padding:6px 14px;border-radius:99px;font:600 13px Kanit,sans-serif;color:#fff;box-shadow:0 8px 20px rgba(0,0,0,.3);transition:opacity .4s}' +
    '.rr-net.off{background:#c62828}.rr-net.on{background:#1f9d5a}';
  d.head.appendChild(css);

  function bar(html, onGo) {
    var b = d.createElement('div'); b.className = 'rr-pwa'; b.setAttribute('role', 'dialog'); b.setAttribute('aria-label', 'ติดตั้งแอป');
    b.innerHTML = '<img src="roiet-icon-192.png" alt="">' + html;
    b.addEventListener('click', function (e) {
      var t = e.target.closest('button'); if (!t) return;
      if (t.classList.contains('go') && onGo) onGo();
      b.remove(); if (t.classList.contains('no')) ls('rr.pwa.skip', String(Date.now()));
    });
    d.body.appendChild(b);
    return b;
  }
  var skipped = +ls('rr.pwa.skip') || 0, quiet = Date.now() - skipped < 7 * 864e5;

  /* ---------- Android / คอม: ปุ่มติดตั้ง ---------- */
  var deferred = null;
  W.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault(); deferred = e;
    if (quiet || standalone) return;
    setTimeout(function () {
      if (!deferred || d.querySelector('.rr-pwa') || d.querySelector('.rn-root')) return; // ไม่เด้งกลางหน้านำทาง
      bar('<div><b>ติดตั้ง ROI ET Route เป็นแอป</b><small>เปิดเต็มจอ ไอคอนบนหน้าจอโฮม ใช้ได้ตอนเน็ตหลุด</small></div><button class="go" type="button">ติดตั้ง</button><button class="no" type="button" aria-label="ไว้ทีหลัง">✕</button>',
        function () { deferred.prompt(); deferred.userChoice.finally(function () { deferred = null; }); });
    }, 4000);
  });
  W.addEventListener('appinstalled', function () { deferred = null; var b = d.querySelector('.rr-pwa'); if (b) b.remove(); });
  // ให้ส่วนอื่นเรียกติดตั้งเองได้ เช่นปุ่มในเมนู
  W.RR_INSTALL = function () {
    if (deferred) { deferred.prompt(); return true; }
    iosHint(true); return false;
  };

  /* ---------- iPhone/iPad (Safari ไม่มีปุ่มติดตั้งอัตโนมัติ) ---------- */
  function iosHint(force) {
    var ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (!ios || standalone || (!force && quiet) || d.querySelector('.rr-pwa')) return;
    bar('<div><b>ติดตั้งเป็นแอปบน iPhone</b><small>แตะปุ่มแชร์ <span aria-hidden="true">⬆︎</span> ด้านล่าง แล้วเลือก "เพิ่มไปยังหน้าจอโฮม"</small></div><button class="no" type="button" aria-label="ปิด">✕</button>');
  }
  if (canSW) setTimeout(function () { if (!d.querySelector('.rn-root')) iosHint(false); }, 6000);

  /* ---------- เน็ตหลุด / กลับมา ---------- */
  var nt = 0;
  function net(on) {
    var e = d.querySelector('.rr-net') || d.body.appendChild(Object.assign(d.createElement('div'), { className: 'rr-net' }));
    e.className = 'rr-net ' + (on ? 'on' : 'off'); e.style.opacity = 1;
    e.textContent = on ? 'กลับมาออนไลน์แล้ว' : 'เน็ตหลุด · ยังนำทางต่อได้ด้วยแผนที่ในเครื่อง';
    clearTimeout(nt); if (on) nt = setTimeout(function () { e.style.opacity = 0; setTimeout(function () { e.remove(); }, 500); }, 2500);
  }
  W.addEventListener('offline', function () { net(false); });
  W.addEventListener('online', function () { net(true); });
})();
