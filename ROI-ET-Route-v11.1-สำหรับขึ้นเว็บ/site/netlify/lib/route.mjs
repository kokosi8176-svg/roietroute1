// เส้นทางสำรองผ่านระบบหลังบ้าน: GraphHopper (ใช้เมื่อเซิร์ฟเวอร์ OSRM ฟรีล่มหรือโดนจำกัด)
// ตั้งค่าใน Netlify: GRAPHHOPPER_KEY (สมัครฟรีที่ graphhopper.com) · เก็บคีย์ไว้หลังบ้าน ไม่โผล่ในหน้าเว็บ
// ตอบกลับรูปแบบเดียวกับ OSRM หน้านำทางใช้ได้ทันที
import { fail } from './http.mjs';

// กันคนยิงถี่จนโควตาฟรีหมด: ไม่เกิน 40 ครั้ง/นาที ต่อเครื่อง (นับในหน่วยประมวลผลนี้)
const HITS = new Map();
export function guard(req) {
  const ip = req.headers.get('x-nf-client-connection-ip') || req.headers.get('x-forwarded-for') || 'x', now = Date.now();
  const h = (HITS.get(ip) || []).filter((t) => now - t < 60000); h.push(now); HITS.set(ip, h);
  if (HITS.size > 5000) HITS.clear();
  if (h.length > 40) fail(429, 'ขอเส้นทางถี่เกินไป รอสักครู่');
}
export const info = () => ({ provider: process.env.GRAPHHOPPER_KEY ? 'graphhopper' : null });

const SIGN = { '-98': ['turn', 'uturn'], '-8': ['turn', 'uturn'], 8: ['turn', 'uturn'], '-7': ['fork', 'slight left'], 7: ['fork', 'slight right'], '-3': ['turn', 'sharp left'], '-2': ['turn', 'left'], '-1': ['turn', 'slight left'], 0: ['continue', 'straight'], 1: ['turn', 'slight right'], 2: ['turn', 'right'], 3: ['turn', 'sharp right'], 6: ['roundabout', 'straight'] };
const R = Math.PI / 180;
const brg = (a, b) => { const dl = (b[0] - a[0]) * R; return (Math.atan2(Math.sin(dl) * Math.cos(b[1] * R), Math.cos(a[1] * R) * Math.sin(b[1] * R) - Math.sin(a[1] * R) * Math.cos(b[1] * R) * Math.cos(dl)) / R + 360) % 360; };

export function toOsrm(gh) {
  const p = gh && gh.paths && gh.paths[0];
  if (!p || !p.points || !p.points.coordinates) return null;
  const C = p.points.coordinates.map((c) => [c[0], c[1]]); // [lon, lat]
  const steps = (p.instructions || []).map((ins, i) => {
    const [a, b] = ins.interval || [0, 0], at = C[Math.min(a, C.length - 1)], nx = C[Math.min(a + 1, C.length - 1)];
    const man = { location: at, bearing_after: Math.round(brg(at, nx)) };
    if (i === 0) man.type = 'depart';
    else if (ins.sign === 4 || ins.sign === 5) { man.type = 'arrive'; man.modifier = 'straight'; }
    else { const s = SIGN[ins.sign] || ['turn', 'straight']; man.type = s[0]; man.modifier = s[1]; if (ins.sign === 6 && ins.exit_number) man.exit = ins.exit_number; }
    return { maneuver: man, intersections: [], name: ins.street_name || '', ref: ins.street_ref || '', distance: ins.distance || 0, duration: (ins.time || 0) / 1000, geometry: { coordinates: C.slice(a, b + 1) } };
  });
  if (!steps.length || steps[steps.length - 1].maneuver.type !== 'arrive') steps.push({ maneuver: { type: 'arrive', location: C[C.length - 1] }, name: '', distance: 0, duration: 0 });
  return { code: 'Ok', routes: [{ distance: p.distance, duration: p.time / 1000, geometry: { coordinates: C }, legs: [{ steps }] }] };
}

const ll = (s) => { const m = String(s || '').split(',').map(Number); if (m.length !== 2 || !m.every(isFinite) || Math.abs(m[0]) > 90 || Math.abs(m[1]) > 180) fail(400, 'พิกัดไม่ถูกต้อง'); return m; };
export async function route(q) {
  if (!process.env.GRAPHHOPPER_KEY) fail(501, 'ยังไม่ได้ตั้งค่าเส้นทางสำรอง (GRAPHHOPPER_KEY)');
  const a = ll(q.get('from')), b = ll(q.get('to')), h = q.get('h');
  const u = new URL('https://graphhopper.com/api/1/route');
  u.searchParams.append('point', a.join(',')); u.searchParams.append('point', b.join(','));
  u.searchParams.set('profile', 'car'); u.searchParams.set('locale', 'th'); u.searchParams.set('points_encoded', 'false'); u.searchParams.set('instructions', 'true');
  if (h != null && isFinite(+h)) { u.searchParams.append('heading', String(Math.round(+h) % 360)); u.searchParams.append('heading', 'NaN'); u.searchParams.set('pass_through', 'false'); }
  u.searchParams.set('key', process.env.GRAPHHOPPER_KEY);
  const ac = new AbortController(), tm = setTimeout(() => ac.abort(), 9000);
  try {
    let res = await fetch(u, { signal: ac.signal });
    if (!res.ok && h != null) { u.searchParams.delete('heading'); u.searchParams.delete('pass_through'); res = await fetch(u, { signal: ac.signal }); } // บางโปรไฟล์ไม่รับทิศทาง
    if (!res.ok) fail(502, 'หาเส้นทางสำรองไม่สำเร็จ (GraphHopper ' + res.status + ')');
    const out = toOsrm(await res.json());
    if (!out) fail(502, 'GraphHopper ไม่ส่งเส้นทางกลับมา');
    return out;
  } finally { clearTimeout(tm); }
}
