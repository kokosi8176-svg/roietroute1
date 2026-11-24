// ราคาน้ำมันอัตโนมัติทุกปั๊ม
// ดึงจากหลายแหล่ง แหล่งไหนล่มก็ใช้แหล่งอื่น/ราคาล่าสุดที่เก็บไว้ ไม่ทำให้เว็บพัง
//   1) ปตท. (PTT OR) เว็บเซอร์วิสทางการ
//   2) บางจาก  API ราคาน้ำมันของบางจาก (มีราคาพรุ่งนี้ด้วย)
//   3) เว็บรวมราคาทุกปั๊ม (Shell, PT, Caltex, Esso, Susco ฯลฯ) อ่านจากหน้าเว็บ
//   4) แหล่ง JSON เพิ่มเติมที่ตั้งเองได้ (FUEL_FEED_URL)
//   5) ราคาที่แอดมินกรอกเอง (ใช้กับปั๊มที่ไม่มีแหล่งอัตโนมัติ)
import { fuel as fuelStore, getJSON } from './db.mjs';
import { notify, adminIds } from './notify.mjs';

export const BRANDS = {
  ptt: 'ปตท.', bcp: 'บางจาก', shell: 'เชลล์', pt: 'พีที', caltex: 'คาลเท็กซ์', esso: 'เอสโซ่', susco: 'ซัสโก้', irpc: 'ไออาร์พีซี', pure: 'เพียว',
};
export const FUELS = {
  diesel: 'ดีเซล', diesel_b20: 'ดีเซล B20', diesel_premium: 'ดีเซลพรีเมียม', g95: 'แก๊สโซฮอล์ 95', g91: 'แก๊สโซฮอล์ 91',
  e20: 'แก๊สโซฮอล์ E20', e85: 'แก๊สโซฮอล์ E85', benzine: 'เบนซิน', g95_premium: 'แก๊สโซฮอล์ 95 พรีเมียม',
};
// ช่องราคาในเว็บเดิม (FT) ↔ ชนิดน้ำมันมาตรฐาน
export const APP_MAP = { d: 'diesel', g: 'g95', e20: 'e20' };

const BRAND_ALIAS = [
  ['ptt', /ปตท|ptt|พีทีที/i], ['bcp', /บางจาก|bangchak|\bbcp\b/i], ['shell', /เชลล์|shell/i], ['caltex', /คาลเท็กซ์|caltex|chevron/i],
  ['esso', /เอสโซ่|esso/i], ['susco', /ซัสโก้|susco/i], ['irpc', /irpc|ไออาร์พีซี/i], ['pure', /\bpure\b|เพียว/i], ['pt', /(^|[^a-z])pt([^a-z]|$)|พีที(?!ที)|ptg/i],
];
export function brandOf(s) { for (const [k, re] of BRAND_ALIAS) if (re.test(s)) return k; return null; }

// จัดชื่อน้ำมันที่แต่ละปั๊มเรียกไม่เหมือนกันให้เป็นชนิดมาตรฐาน
export function fuelOf(name) {
  const s = String(name || '').replace(/\s+/g, ' ').trim();
  const premium = /v-?power|super ?power|ซูเปอร์ ?พาวเวอร์|ซุปเปอร์|เพาเวอร์|พาวเวอร์|วี-?เพาเวอร์|hi ?premium|ไฮ ?พรีเมียม|พรีเมียม|premium|ultimate|synergy supreme|techron|ไฮพรีเมี่ยม|power ?d|x ?99|\b97\b|\b98\b|\b99\b/i;
  if (/ดีเซล|diesel/i.test(s)) {
    if (/b ?20/i.test(s)) return 'diesel_b20';
    if (premium.test(s)) return 'diesel_premium';
    return 'diesel';
  }
  if (/e ?85/i.test(s)) return 'e85';
  if (/e ?20/i.test(s)) return 'e20';
  if (/(gasohol|แก๊สโซฮอล|แก๊สโซฮอลล์|gsh|โซฮอล).*91|91.*(gasohol|gsh)|^91$/i.test(s) && !premium.test(s)) return 'g91';
  if (/(gasohol|แก๊สโซฮอล|gsh|โซฮอล).*95|95.*(gasohol|gsh)|^95$/i.test(s)) return premium.test(s) ? 'g95_premium' : 'g95';
  if (/เบนซิน|benzine|gasoline/i.test(s)) return premium.test(s) ? 'g95_premium' : 'benzine';
  return null;
}
const price = (v) => { const n = parseFloat(String(v).replace(/[^\d.]/g, '')); return n > 5 && n < 200 ? Math.round(n * 100) / 100 : null; };
function put(out, brand, name, p, tmr) {
  const f = fuelOf(name), v = price(p);
  if (!brand || !f || v == null) return;
  const b = (out[brand] = out[brand] || { prices: {}, tomorrow: {} });
  if (b.prices[f] == null || v < b.prices[f]) b.prices[f] = v; // ชื่อซ้ำ (เช่นดีเซล S กับดีเซล) ใช้ราคาที่ต่ำกว่า = เกรดธรรมดา
  const t = price(tmr); if (t != null && (b.tomorrow[f] == null || t < b.tomorrow[f])) b.tomorrow[f] = t;
}

async function get(url, opt = {}) {
  const ac = new AbortController(), timer = setTimeout(() => ac.abort(), opt.timeout || 9000);
  try {
    const r = await fetch(url, { ...opt, signal: ac.signal, headers: { 'user-agent': 'Mozilla/5.0 (RoiEtRoute fuel bot)', accept: '*/*', ...(opt.headers || {}) } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.text();
  } finally { clearTimeout(timer); }
}
const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

/* ---------- แหล่งที่ 1: ปตท. ---------- */
export function parsePttor(xml) {
  const t = unesc(xml), out = {};
  const re = /<FUEL>([\s\S]*?)<\/FUEL>/gi; let m;
  while ((m = re.exec(t))) {
    const prod = (/<PRODUCT>([\s\S]*?)<\/PRODUCT>/i.exec(m[1]) || [])[1], pr = (/<PRICE>([\s\S]*?)<\/PRICE>/i.exec(m[1]) || [])[1];
    if (prod) put(out, 'ptt', prod, pr);
  }
  return out;
}
async function srcPttor() {
  const envl = (ns) => `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><CurrentOilPrice xmlns="${ns}"><Language>th</Language></CurrentOilPrice></soap:Body></soap:Envelope>`;
  const url = process.env.PTTOR_URL || 'https://orapiweb.pttor.com/oilservice/OilPrice.asmx';
  let last;
  for (const ns of ['http://www.pttor.com', 'http://www.pttplc.com/ptt_webservice/']) {
    try {
      const x = await get(url, { method: 'POST', body: envl(ns), headers: { 'content-type': 'text/xml; charset=utf-8', SOAPAction: ns.replace(/\/$/, '') + '/CurrentOilPrice' } });
      const o = parsePttor(x); if (o.ptt && Object.keys(o.ptt.prices).length) return o;
      last = new Error('ไม่พบราคาในข้อมูลที่ได้');
    } catch (e) { last = e; }
  }
  throw last;
}

/* ---------- แหล่งที่ 2: บางจาก ---------- */
export function parseBangchak(txt) {
  let j = JSON.parse(txt); if (Array.isArray(j)) j = j[0] || {};
  let list = j.OilList || j.oilList || j.data || [];
  if (typeof list === 'string') list = JSON.parse(list);
  const out = {};
  list.forEach((x) => put(out, 'bcp', x.OilName || x.oilName || x.name, x.PriceToday ?? x.priceToday ?? x.price, x.PriceTomorrow ?? x.priceTomorrow));
  return out;
}
async function srcBangchak() {
  return parseBangchak(await get(process.env.BANGCHAK_URL || 'https://oil-price.bangchak.co.th/ApiOilPrice2/th', { headers: { accept: 'application/json' } }));
}

/* ---------- แหล่งที่ 3: เว็บรวมราคาทุกปั๊ม (อ่านจากข้อความในหน้าเว็บ) ---------- */
export function parseTextPage(html) {
  const text = unesc(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<(br|\/p|\/li|\/tr|\/h\d|\/div|\/td|\/th|\/span|\/em|\/strong)[^>]*>/gi, '\n')
    .replace(/<img[^>]*alt="([^"]*)"[^>]*>/gi, '\n$1\n')
    .replace(/<[^>]+class="[^"]*\b(ptt|bcp|bangchak|shell|esso|caltex|pt|irpc|susco|pure)\b[^"]*"[^>]*>/gi, '\n[[$1]]\n')
    .replace(/<[^>]+>/g, ' '));
  const lines = text.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const out = {}; let brand = null, pending = null;
  for (const l of lines) {
    const tag = /^\[\[(\w+)\]\]$/.exec(l);
    if (tag) { brand = brandOf(tag[1]) || (tag[1] === 'bangchak' ? 'bcp' : brand); pending = null; continue; }
    const pr = /(\d{2,3}\.\d{1,2})/.exec(l), f = fuelOf(l);
    if (!f && !pr && l.length < 40 && brandOf(l)) { brand = brandOf(l); pending = null; continue; }
    if (f && pr) { put(out, brand, l.replace(pr[1], ''), pr[1]); pending = null; }
    else if (f) pending = l;
    else if (pr && pending && /^[\d.\s฿บาท/ลิตร-]+$/.test(l)) { put(out, brand, pending, pr[1]); pending = null; }
  }
  return out;
}
async function srcAllBrands() {
  const url = process.env.FUEL_PAGE_URL || 'https://gasprice.kapook.com/gasprice.php';
  return parseTextPage(await get(url));
}

/* ---------- แหล่งที่ 4: JSON ที่ตั้งเอง (รองรับรูปแบบ stations/brand/fuel/price) ---------- */
export function parseFeed(txt) {
  const j = JSON.parse(txt), out = {};
  const st = (j.response && j.response.stations) || j.stations || j.brands || j;
  Object.keys(st || {}).forEach((bk) => {
    const brand = brandOf(bk) || (BRANDS[bk] ? bk : null); if (!brand) return;
    const v = st[bk], items = Array.isArray(v) ? v : Object.keys(v || {}).map((k) => (typeof v[k] === 'object' ? { name: v[k].name || k, price: v[k].price } : { name: k, price: v[k] }));
    items.forEach((x) => put(out, brand, x.name || x.fuel || x.type, x.price));
  });
  return out;
}
async function srcFeed() {
  if (!process.env.FUEL_FEED_URL) return null;
  return parseFeed(await get(process.env.FUEL_FEED_URL, { headers: { accept: 'application/json' } }));
}

export const SOURCES = { pttor: srcPttor, bangchak: srcBangchak, allbrands: srcAllBrands, feed: srcFeed };
export const SOURCE_TH = { pttor: 'ปตท. (ทางการ)', bangchak: 'บางจาก (ทางการ)', allbrands: 'เว็บรวมราคาทุกปั๊ม', feed: 'แหล่ง JSON เพิ่มเติม', manual: 'แอดมินกรอกเอง' };
// ลำดับความน่าเชื่อถือ: แหล่งทางการของปั๊มนั้นชนะแหล่งรวม
const PRIORITY = { pttor: 4, bangchak: 4, feed: 2, allbrands: 1 };

const bkkDate = (t = Date.now()) => new Date(t + 7 * 3600e3).toISOString().slice(0, 10);

export async function refresh({ sources = SOURCES } = {}) {
  const s = fuelStore();
  const prev = (await getJSON(s, 'latest')) || { brands: {}, sources: {} };
  const status = {}, merged = {}, rank = {};
  await Promise.all(Object.keys(sources).map(async (k) => {
    const t0 = Date.now();
    try {
      const o = await sources[k]();
      if (o == null) { status[k] = { ok: null, note: 'ยังไม่ได้ตั้งค่า' }; return; }
      let n = 0;
      Object.keys(o).forEach((b) => {
        const P = o[b].prices || {}, T = o[b].tomorrow || {};
        Object.keys(P).forEach((f) => {
          n++;
          const key = b + '|' + f;
          if ((rank[key] || 0) > (PRIORITY[k] || 0)) return;
          rank[key] = PRIORITY[k] || 0;
          merged[b] = merged[b] || { prices: {}, tomorrow: {}, src: {} };
          merged[b].prices[f] = P[f]; merged[b].src[f] = k;
          if (T[f] != null) merged[b].tomorrow[f] = T[f];
        });
      });
      status[k] = { ok: n > 0, count: n, ms: Date.now() - t0, at: Date.now(), error: n ? '' : 'อ่านข้อมูลได้แต่ไม่พบราคา (รูปแบบหน้าเว็บอาจเปลี่ยน)' };
    } catch (e) {
      status[k] = { ok: false, ms: Date.now() - t0, at: Date.now(), error: String((e && e.message) || e).slice(0, 160) };
    }
  }));
  // ปั๊มที่รอบนี้ดึงไม่ได้ ใช้ราคาล่าสุดที่เก็บไว้ (ทำเครื่องหมายว่าเก่า)
  Object.keys(prev.brands || {}).forEach((b) => {
    if (merged[b] || !prev.brands[b] || prev.brands[b].manual) return;
    merged[b] = { ...prev.brands[b], stale: true };
  });
  const got = Object.keys(merged).length > 0;
  const latest = {
    updatedAt: got ? Date.now() : prev.updatedAt || null, checkedAt: Date.now(), date: bkkDate(),
    brands: got ? merged : prev.brands || {}, sources: status,
  };
  await s.setJSON('latest', latest);
  if (got) await s.setJSON('h/' + latest.date, { date: latest.date, brands: Object.fromEntries(Object.entries(merged).map(([b, v]) => [b, v.prices])) });

  // แจ้งแอดมินเมื่อราคาดีเซล/95 ของ ปตท. หรือบางจากเปลี่ยน
  const ch = [];
  ['ptt', 'bcp'].forEach((b) => ['diesel', 'g95'].forEach((f) => {
    const a = prev.brands && prev.brands[b] && prev.brands[b].prices[f], c = merged[b] && merged[b].prices[f];
    if (a && c && a !== c) ch.push(BRANDS[b] + ' ' + FUELS[f] + ' ' + a.toFixed(2) + ' → ' + c.toFixed(2) + (c > a ? ' ▲' : ' ▼'));
  }));
  if (ch.length) await notify(await adminIds(), { type: 'fuel_change', title: 'ราคาน้ำมันเปลี่ยน', body: ch.join(' · ') }).catch(() => {});
  return latest;
}

// ข้อมูลสำหรับหน้าเว็บ: รวมราคาที่แอดมินกรอกเอง + หาปั๊มที่ถูกที่สุดของแต่ละชนิด
export async function view() {
  const s = fuelStore();
  const latest = (await getJSON(s, 'latest')) || { brands: {}, sources: {}, updatedAt: null };
  const manual = (await getJSON(s, 'manual')) || { brands: {} };
  const brands = JSON.parse(JSON.stringify(latest.brands || {}));
  Object.keys(manual.brands || {}).forEach((b) => {
    const m = manual.brands[b];
    brands[b] = brands[b] || { prices: {}, tomorrow: {}, src: {} };
    Object.keys(m.prices || {}).forEach((f) => {
      if (brands[b].prices[f] == null || brands[b].stale || m.force) { brands[b].prices[f] = m.prices[f]; brands[b].src[f] = 'manual'; }
    });
    brands[b].manualAt = m.at;
  });
  const cheapest = {};
  Object.keys(FUELS).forEach((f) => {
    let best = null;
    Object.keys(brands).forEach((b) => { const v = brands[b].prices[f]; if (v != null && (!best || v < best.price)) best = { brand: b, price: v }; });
    if (best) cheapest[f] = best;
  });
  const age = latest.updatedAt ? Date.now() - latest.updatedAt : Infinity;
  return {
    updatedAt: latest.updatedAt, checkedAt: latest.checkedAt || null, date: latest.date || null, stale: age > 6 * 3600e3,
    brands, cheapest, sources: latest.sources || {}, names: { brands: BRANDS, fuels: FUELS, sources: SOURCE_TH }, appMap: APP_MAP,
  };
}

export async function setManual(u, b) {
  const s = fuelStore();
  const cur = (await getJSON(s, 'manual')) || { brands: {} };
  const brand = BRANDS[b.brand] ? b.brand : null;
  if (!brand) throw Object.assign(new Error('ไม่รู้จักปั๊มนี้'), { status: 400 });
  const prices = {};
  Object.keys(b.prices || {}).forEach((f) => { const v = price(b.prices[f]); if (FUELS[f] && v != null) prices[f] = v; });
  if (!Object.keys(prices).length) delete cur.brands[brand];
  else cur.brands[brand] = { prices, at: Date.now(), by: u.name, force: !!b.force };
  await s.setJSON('manual', cur);
  return view();
}

export async function history(days = 30) {
  const s = fuelStore(), out = [];
  for (let i = Math.min(days, 120) - 1; i >= 0; i--) {
    const d = bkkDate(Date.now() - i * 864e5);
    const h = await getJSON(s, 'h/' + d);
    if (h) out.push(h);
  }
  return out;
}
