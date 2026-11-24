// ROI ET Route — ระบบหลังบ้าน (ทุกเส้นทางอยู่ใต้ /api/)
import { json, preflight, body, fail, HttpError, str } from '../lib/http.mjs';
import * as A from '../lib/auth.mjs';
import * as N from '../lib/notify.mjs';
import * as J from '../lib/jobs.mjs';
import * as F from '../lib/fuel.mjs';
import * as S from '../lib/sync.mjs';
import * as T from '../lib/tts.mjs';
import * as RT from '../lib/route.mjs';
import * as Cfg from '../lib/settings.mjs';
import { users, jobs, update, listKeys } from '../lib/db.mjs';

const routes = [];
const on = (method, path, fn) => {
  const keys = [];
  const re = new RegExp('^' + path.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
  routes.push({ method, re, keys, fn });
};

/* ---------- ทั่วไป ---------- */
on('GET', '/api/health', async () => ({ ok: true, time: Date.now(), secret: !!process.env.RR_SECRET, version: '1.0.0' }));

/* ---------- บัญชี ---------- */
on('POST', '/api/auth/register', async (req) => {
  const u = await A.register(await body(req));
  return { token: A.sign(u), user: A.publicUser(u) };
});
on('POST', '/api/auth/login', async (req) => {
  const u = await A.login(await body(req));
  return { token: A.sign(u), user: A.publicUser(u) };
});
on('GET', '/api/auth/me', async (req) => ({ user: A.publicUser(await A.auth(req)) }));
on('PATCH', '/api/auth/me', async (req) => {
  const u = await A.auth(req), b = await body(req);
  const nu = await update(users(), 'u/' + u.id, (x) => ({ ...x, name: str(b.name, 60) || x.name }));
  return { user: A.publicUser(nu) };
});
on('POST', '/api/auth/password', async (req) => {
  const u = await A.auth(req), nu = await A.changePassword(u, await body(req));
  return { token: A.sign(nu), user: A.publicUser(nu) };
});
on('POST', '/api/auth/logout-all', async (req) => {
  const u = await A.auth(req);
  await update(users(), 'u/' + u.id, (x) => ({ ...x, tokenV: (x.tokenV || 0) + 1 }));
  return { ok: true };
});

/* ---------- เก็บข้อมูลบนคลาวด์ ---------- */
on('GET', '/api/sync', async (req) => ({ data: await S.getAll(await A.auth(req)) }));
on('PUT', '/api/sync/:key', async (req, p) => ({ saved: await S.put(await A.auth(req), decodeURIComponent(p.key), await body(req)) }));

/* ---------- งานจัดส่ง ---------- */
on('POST', '/api/jobs/sync', async (req) => {
  const r = await J.syncRun(await A.auth(req), await body(req));
  return { job: J.summary(r.job), events: r.events };
});
on('GET', '/api/jobs', async (req) => {
  const q = Object.fromEntries(new URL(req.url).searchParams);
  return { jobs: await J.listJobs(await A.auth(req), q) };
});
on('GET', '/api/jobs/:id', async (req, p) => ({ job: await J.getJob(await A.auth(req), p.id) }));
on('PATCH', '/api/jobs/:id/stops/:no', async (req, p) => {
  const r = await J.setStop(await A.auth(req), p.id, p.no, await body(req));
  return { job: J.summary(r.job), events: r.events };
});
on('PATCH', '/api/jobs/:id', async (req, p) => ({ job: await J.assign(await A.auth(req), p.id, await body(req)) }));
on('DELETE', '/api/jobs/:id', async (req, p) => ({ job: await J.cancel(await A.auth(req), p.id) }));

/* ---------- แจ้งเตือน ---------- */
on('GET', '/api/notifications', async (req) => {
  const u = await A.auth(req), q = new URL(req.url).searchParams;
  return await N.list(u.id, { since: +q.get('since') || 0, limit: Math.min(+q.get('limit') || 30, 100) });
});
on('POST', '/api/notifications/read', async (req) => {
  const u = await A.auth(req); await N.markRead(u.id, await body(req)); return { ok: true };
});

/* ---------- ราคาน้ำมัน ---------- */
on('GET', '/api/fuel', async (req, p, ctx) => {
  const v = await F.view();
  // ถ้าตัวตั้งเวลายังไม่ได้ทำงาน (หรือข้อมูลเก่าเกิน 2 ชม.) ให้ดึงใหม่เบื้องหลัง
  if (!v.checkedAt || Date.now() - v.checkedAt > 2 * 3600e3) {
    const job = F.refresh().catch(() => {});
    if (!v.updatedAt) { await job; return F.view(); } // ยังไม่มีข้อมูลเลย รอดึงครั้งแรก
    if (ctx && ctx.waitUntil) ctx.waitUntil(job);
  }
  return v;
}, { public: true });
on('GET', '/api/fuel/history', async (req) => ({ days: await F.history(+new URL(req.url).searchParams.get('days') || 30) }));
on('POST', '/api/fuel/refresh', async (req) => { await A.auth(req, { roles: ['admin'] }); await F.refresh(); return F.view(); });
on('PUT', '/api/fuel/manual', async (req) => { const u = await A.auth(req, { roles: ['admin'] }); return F.setManual(u, await body(req)); });

/* ---------- เสียงนำทาง ---------- */
on('GET', '/api/tts/info', async () => T.info());
on('GET', '/api/tts', async (req) => {
  const q = new URL(req.url).searchParams;
  const r = await T.speak(q.get('t'), q.get('g'), q.get('r'));
  return new Response(r.audio, { status: 200, headers: { 'content-type': 'audio/mpeg', 'cache-control': 'public, max-age=2592000, immutable', 'access-control-allow-origin': '*', 'x-cache': r.cached ? 'hit' : 'miss' } });
});

/* ---------- เส้นทางสำรอง (GraphHopper ผ่านหลังบ้าน) ---------- */
on('GET', '/api/route/info', async () => RT.info(), { public: true });
on('GET', '/api/route', async (req) => { RT.guard(req); return RT.route(new URL(req.url).searchParams); }, { public: true });

/* ---------- แอดมิน ---------- */
on('GET', '/api/admin/users', async (req) => {
  await A.auth(req, { roles: ['admin'] });
  return { users: (await A.listUsers()).map(A.publicUser).sort((a, b) => a.created - b.created) };
});
on('POST', '/api/admin/users', async (req) => {
  await A.auth(req, { roles: ['admin'] });
  const b = await body(req);
  const u = await A.register({ ...b, _byAdmin: true });
  return { user: A.publicUser(u) };
});
on('PATCH', '/api/admin/users/:id', async (req, p) => {
  const me = await A.auth(req, { roles: ['admin'] }), b = await body(req);
  if (p.id === me.id && (b.role && b.role !== 'admin' || b.disabled)) fail(400, 'ลดสิทธิ์หรือระงับบัญชีตัวเองไม่ได้');
  let pw = null;
  if (b.resetPassword) { pw = Math.random().toString(36).slice(2, 6) + '-' + Math.random().toString(36).slice(2, 8); }
  const nu = await update(users(), 'u/' + p.id, (x) => {
    if (!x) fail(404, 'ไม่พบผู้ใช้');
    const y = { ...x };
    if (b.role) { if (!A.ROLES.includes(b.role)) fail(400, 'สิทธิ์ไม่ถูกต้อง'); y.role = b.role; }
    if (typeof b.disabled === 'boolean') { y.disabled = b.disabled; y.tokenV = (y.tokenV || 0) + 1; }
    if (b.name) y.name = str(b.name, 60);
    if (pw) { const h = A.hashPassword(pw); y.salt = h.salt; y.hash = h.hash; y.tokenV = (y.tokenV || 0) + 1; }
    return y;
  });
  return { user: A.publicUser(nu), tempPassword: pw };
});
on('GET', '/api/admin/stats', async (req) => {
  await A.auth(req, { roles: ['admin'] });
  const us = await A.listUsers();
  const js = await J.listJobs({ role: 'admin', id: '' }, { limit: 300 });
  const by = (arr, f) => arr.reduce((o, x) => { o[f(x)] = (o[f(x)] || 0) + 1; return o; }, {});
  const day = 864e5, now = Date.now();
  const stopN = js.reduce((s, j) => s + ((j.stats && j.stats.n) || 0), 0), ok = js.reduce((s, j) => s + ((j.stats && j.stats.ok) || 0), 0), bad = js.reduce((s, j) => s + ((j.stats && j.stats.fail) || 0), 0);
  return {
    users: { total: us.length, byRole: by(us, (u) => u.role), active7d: us.filter((u) => u.lastLogin && now - u.lastLogin < 7 * day).length },
    jobs: { total: js.length, byState: by(js, (j) => j.state), last7d: js.filter((j) => now - j.created < 7 * day).length, stops: stopN, ok, fail: bad, km: Math.round(js.reduce((s, j) => s + (j.pkm || 0), 0) * 10) / 10 },
    fuel: (await F.view()).sources,
    channels: { telegram: !!(process.env.TG_BOT_TOKEN && process.env.TG_CHAT_ID), discord: !!process.env.DISCORD_WEBHOOK_URL, line: !!(process.env.LINE_CHANNEL_TOKEN && process.env.LINE_TO) },
    signup: process.env.ALLOW_SIGNUP !== 'false',
  };
});
/* ---------- แอดมิน: ตั้งค่า + ตรวจความพร้อม ---------- */
on('GET', '/api/admin/settings', async (req) => {
  await A.auth(req, { roles: ['admin'] });
  const k = await T.keys(), inf = await T.info();
  return { tts: { provider: inf.provider, voices: inf.voices, pref: k.pref || '', google: { set: !!k.google, from: k.googleFrom, tail: Cfg.tail(k.google) }, azure: { set: !!k.azure, from: k.azureFrom, tail: Cfg.tail(k.azure), region: k.region } } };
});
on('PUT', '/api/admin/settings', async (req) => {
  await A.auth(req, { roles: ['admin'] });
  await Cfg.set(await body(req));
  return { ok: true, tts: await T.info() };
});
on('POST', '/api/admin/tts-test', async (req) => {
  await A.auth(req, { roles: ['admin'] });
  const b = await body(req), g = b.g === 'm' ? 'm' : 'f';
  const r = await T.speak(g === 'm' ? 'สวัสดีครับ ทดสอบเสียงนำทาง อีกสองร้อยเมตร เลี้ยวซ้ายครับ' : 'สวัสดีค่ะ ทดสอบเสียงนำทาง อีกสองร้อยเมตร เลี้ยวซ้ายค่ะ', g, 0);
  return { ok: true, provider: (await T.info()).provider, bytes: r.audio.byteLength, cached: r.cached };
});
on('GET', '/api/admin/health', async (req) => {
  await A.auth(req, { roles: ['admin'] });
  const e = process.env, sec = e.RR_SECRET || '', adm = A.adminEmails ? A.adminEmails() : (e.ADMIN_EMAILS || '').split(',').filter(Boolean);
  const inf = await T.info(), ch = !!(e.TG_BOT_TOKEN && e.TG_CHAT_ID) || !!e.DISCORD_WEBHOOK_URL || !!(e.LINE_CHANNEL_TOKEN && e.LINE_TO);
  const fu = (await F.view()).sources || {}, fuOk = Object.values(fu).some((x) => x && x.ok);
  const C = (id, level, ok, title, fix) => ({ id, level, ok, title, fix: ok ? '' : fix });
  return { checks: [
    C('secret', 'must', sec.length >= 32 && !/^(demo|test|changeme|secret)/i.test(sec), 'รหัสลับระบบ (RR_SECRET) ยาวพอและไม่ใช่ค่าตัวอย่าง', 'สร้างรหัสสุ่ม 64 ตัวอักษร (คู่มือข้อ 3) ใส่ใน Netlify แล้ว deploy ใหม่'),
    C('admins', 'should', adm.length > 0, 'กำหนดอีเมลผู้ดูแลระบบ (ADMIN_EMAILS)', 'ใส่อีเมลแอดมินคั่นด้วย , ใน Netlify กันคนอื่นได้สิทธิ์แอดมิน'),
    C('signup', 'should', e.ALLOW_SIGNUP === 'false', 'ปิดการสมัครเอง (ALLOW_SIGNUP=false)', 'ตอนนี้ใครเปิดเว็บก็สมัครได้ ถ้าใช้ในทีมเท่านั้นให้ตั้ง ALLOW_SIGNUP=false แล้วสร้างบัญชีให้ในเมนูผู้ใช้งาน'),
    C('tts', 'nice', !!inf.provider, 'เสียงนำทางแบบธรรมชาติ', 'ใส่คีย์ Google หรือ Azure ในหัวข้อ "เสียงนำทาง" ด้านล่าง (ฟรีในโควตา)'),
    C('route', 'nice', !!RT.info().provider, 'เส้นทางสำรองเมื่อเซิร์ฟเวอร์ OSRM ฟรีล่ม (GraphHopper)', 'ไม่บังคับ: สมัครคีย์ฟรีที่ graphhopper.com ใส่ GRAPHHOPPER_KEY ใน Netlify (ถ้าไม่ตั้ง ระบบยังใช้แผนที่ในเครื่องหาเส้นทางแทนได้)'),
    C('notify', 'nice', ch, 'ส่งแจ้งเตือนออกนอกเว็บ (Telegram/Discord/LINE)', 'ไม่บังคับ: ตั้งตามคู่มือหัวข้อการแจ้งเตือน ถ้าอยากให้เด้งในมือถือ'),
    C('fuel', 'nice', fuOk, 'ดึงราคาน้ำมันอัตโนมัติได้', 'เมนูราคาน้ำมัน > ดึงราคาตอนนี้ ถ้ายังไม่ได้ให้กรอกเอง'),
  ] };
});
on('POST', '/api/admin/notify-test', async (req) => {
  const u = await A.auth(req, { roles: ['admin'] });
  await N.notify([u.id], { type: 'job_new', title: 'ทดสอบการแจ้งเตือน', body: 'ถ้าเห็นข้อความนี้ แปลว่าระบบแจ้งเตือนทำงานปกติ', by: u.name });
  return { ok: true };
});

/* ---------- ตัวรับคำขอ ---------- */
export default async (req, ctx) => {
  if (req.method === 'OPTIONS') return preflight();
  const path = new URL(req.url).pathname.replace(/^\/\.netlify\/functions\/api/, '/api');
  try {
    for (const r of routes) {
      if (r.method !== req.method) continue;
      const m = r.re.exec(path); if (!m) continue;
      const p = {}; r.keys.forEach((k, i) => { p[k] = m[i + 1]; });
      const out = await r.fn(req, p, ctx);
      return out instanceof Response ? out : json(out, 200, path === '/api/fuel' ? { 'cache-control': 'public, max-age=120' } : {});
    }
    return json({ error: 'ไม่พบ API นี้: ' + req.method + ' ' + path }, 404);
  } catch (e) {
    const st = e instanceof HttpError || e.status ? e.status : 500;
    if (st >= 500) console.error('[api]', e);
    return json({ error: st >= 500 && !(e instanceof HttpError) ? 'ระบบขัดข้องชั่วคราว ลองใหม่อีกครั้ง' : e.message, ...(e.extra || {}) }, st);
  }
};

export const config = { path: ['/api/*'] };
