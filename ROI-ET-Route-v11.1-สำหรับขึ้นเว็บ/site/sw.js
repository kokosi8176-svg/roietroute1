/* ROI ET Route — ตัวช่วยให้เว็บเปิดได้แม้เน็ตหลุด (service worker)
   เก็บไฟล์ของเว็บไว้ในเครื่อง: เปิดแอปได้ทันที แผนที่สำรองถนนจริงใช้งานได้ตอนออฟไลน์
   ไม่เก็บข้อมูลบัญชี/งาน (/api) และไม่เก็บรูปแผนที่ออนไลน์ (ตามเงื่อนไขผู้ให้บริการแผนที่) */
var VERSION = 'roiet-v11-2';
var SHELL = ['./', 'index.html', 'roiet-theme.css', 'roiet-theme.js', 'roiet-scene.webp', 'roiet-backend.css', 'roiet-backend.js', 'roiet-nav.css', 'roiet-nav.js',
  'roiet-basemap.js', 'roiet-basemap.json', 'roiet-pwa.js', 'manifest.webmanifest', 'roiet-icon-192.png', 'roiet-icon-512.png'];
// ไลบรารีจาก CDN ที่หน้าเว็บใช้ (เก็บไว้ด้วยเมื่อโหลดสำเร็จ)
var CDN = /^https:\/\/(cdnjs\.cloudflare\.com|unpkg\.com|cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com)\//;

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) {
    // เก็บทีละไฟล์ ไฟล์ไหนไม่มี (เช่นไม่ได้ใส่แผนที่สำรอง) ก็ข้ามไป
    return Promise.all(SHELL.map(function (u) { return c.add(u).catch(function () {}); }));
  }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== VERSION && k.indexOf('roiet-') === 0; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;
  if (url.origin === location.origin && url.pathname.indexOf('/api/') === 0) return; // ข้อมูลจริงต้องสดเสมอ
  var same = url.origin === location.origin;
  if (!same && !CDN.test(req.url)) return; // แผนที่ออนไลน์/เส้นทาง/อื่นๆ ปล่อยผ่านตามปกติ
  if (req.mode === 'navigate') {
    // หน้าเว็บ: เอาของใหม่จากเน็ตก่อน หลุดค่อยใช้ของที่เก็บไว้
    e.respondWith(fetch(req).then(function (r) { var cp = r.clone(); caches.open(VERSION).then(function (c) { c.put('index.html', cp); }); return r; })
      .catch(function () { return caches.match('index.html').then(function (r) { return r || caches.match('./'); }); }));
    return;
  }
  // ไฟล์ของเว็บเอง (ธีม/สคริปต์/สไตล์): เอาของใหม่จากเน็ตก่อน หลุดค่อยใช้ที่เก็บไว้
  // (เดิมใช้ของเก่าทันทีแล้วค่อยอัปเดต ทำให้รีเฟรชหลังอัปเดตเว็บแล้วยังเห็นหน้าเก่าอีกรอบ)
  if (same) {
    e.respondWith(fetch(req).then(function (r) { if (r && r.ok) { var cp = r.clone(); caches.open(VERSION).then(function (c) { c.put(req, cp); }); } return r; })
      .catch(function () { return caches.match(req); }));
    return;
  }
  // ไฟล์จาก CDN: ใช้ของในเครื่องทันที แล้วอัปเดตเบื้องหลัง
  e.respondWith(caches.match(req).then(function (hit) {
    var net = fetch(req).then(function (r) { if (r && (r.ok || r.type === 'opaque')) { var cp = r.clone(); caches.open(VERSION).then(function (c) { c.put(req, cp); }); } return r; }).catch(function () { return hit; });
    return hit || net;
  }));
});
