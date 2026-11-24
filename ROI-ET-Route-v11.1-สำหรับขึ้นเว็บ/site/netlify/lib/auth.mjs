// บัญชีผู้ใช้: รหัสผ่านเข้ารหัสแบบ scrypt + โทเคนเซ็นด้วย RR_SECRET (อายุ 30 วัน)
import crypto from 'node:crypto';
import { users, getJSON, update } from './db.mjs';
import { fail, str, id as newId } from './http.mjs';

export const ROLES = ['admin', 'staff', 'driver'];
export const ROLE_TH = { admin: 'ผู้ดูแลระบบ', staff: 'ผู้วางแผน', driver: 'คนขับ' };
const TOKEN_DAYS = 30;

function secret() {
  const s = process.env.RR_SECRET;
  if (!s || s.length < 24) fail(500, 'ยังไม่ได้ตั้งค่า RR_SECRET ใน Netlify (ต้องยาวอย่างน้อย 24 ตัวอักษร) ดูคู่มือติดตั้งข้อ 3');
  return s;
}
const b64u = (b) => Buffer.from(b).toString('base64url');

export function hashPassword(pw, salt = crypto.randomBytes(16).toString('hex')) {
  const h = crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
  return { salt, hash: h };
}
export function checkPassword(pw, salt, hash) {
  const h = crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 });
  const want = Buffer.from(hash, 'hex');
  return want.length === h.length && crypto.timingSafeEqual(h, want);
}

export function sign(user) {
  const p = { sub: user.id, v: user.tokenV || 0, exp: Date.now() + TOKEN_DAYS * 864e5 };
  const body = b64u(JSON.stringify(p));
  const sig = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  return body + '.' + sig;
}
function verify(token) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return null;
  const want = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  if (want.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(want), Buffer.from(sig))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    return p.exp > Date.now() ? p : null;
  } catch { return null; }
}

export const emailKey = (e) => 'e/' + crypto.createHash('sha256').update(String(e).toLowerCase()).digest('hex');
export const getUser = (uid) => getJSON(users(), 'u/' + uid);

export function publicUser(u) {
  return u && { id: u.id, email: u.email, name: u.name, role: u.role, roleTh: ROLE_TH[u.role], disabled: !!u.disabled, created: u.created, lastLogin: u.lastLogin || null };
}

// ตรวจโทเคนในคำขอ คืนผู้ใช้ (หรือ null ถ้า optional)
export async function auth(req, { optional = false, roles = null } = {}) {
  const h = req.headers.get('authorization') || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : '';
  const p = t && verify(t);
  if (!p) { if (optional) return null; fail(401, 'กรุณาเข้าสู่ระบบ'); }
  const u = await getUser(p.sub);
  if (!u || (u.tokenV || 0) !== p.v) { if (optional) return null; fail(401, 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่'); }
  if (u.disabled) fail(403, 'บัญชีนี้ถูกระงับ ติดต่อผู้ดูแลระบบ');
  if (roles && !roles.includes(u.role)) fail(403, 'สิทธิ์ไม่พอสำหรับการทำรายการนี้');
  return u;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export function checkNewPassword(pw) {
  if (typeof pw !== 'string' || pw.length < 8) fail(400, 'รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร');
  if (pw.length > 200) fail(400, 'รหัสผ่านยาวเกินไป');
}

export function adminEmails() {
  return (process.env.ADMIN_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

export async function register(b) {
  const email = str(b.email, 120).toLowerCase(), name = str(b.name, 60) || email.split('@')[0];
  if (!EMAIL.test(email)) fail(400, 'อีเมลไม่ถูกต้อง');
  checkNewPassword(b.password);
  if (process.env.ALLOW_SIGNUP === 'false') {
    const anyUser = await getJSON(users(), 'meta/count');
    if (anyUser && anyUser.n > 0) fail(403, 'ปิดการสมัครเองแล้ว ให้ผู้ดูแลระบบสร้างบัญชีให้');
  }
  const s = users(), uid = newId(), ek = emailKey(email);
  const claim = await s.setJSON(ek, { id: uid }, { onlyIfNew: true });
  if (claim && claim.modified === false) fail(409, 'อีเมลนี้มีบัญชีอยู่แล้ว');
  // คนแรกที่สมัคร หรืออีเมลใน ADMIN_EMAILS เป็นผู้ดูแลระบบ
  const cnt = await update(s, 'meta/count', (c) => ({ n: ((c && c.n) || 0) + 1 }));
  let role = cnt.n === 1 || adminEmails().includes(email) ? 'admin' : (ROLES.includes(b.role) && b.role !== 'admin' ? b.role : 'staff');
  if (b._byAdmin && ROLES.includes(b.role)) role = b.role;
  const { salt, hash } = hashPassword(b.password);
  const u = { id: uid, email, name, role, salt, hash, created: Date.now(), lastLogin: b._byAdmin ? null : Date.now(), tokenV: 0, disabled: false };
  await s.setJSON('u/' + uid, u);
  return u;
}

export async function login(b) {
  const email = str(b.email, 120).toLowerCase(), s = users();
  const rlKey = 'rl/' + emailKey(email).slice(2, 34);
  const rl = await getJSON(s, rlKey);
  if (rl && rl.until > Date.now()) fail(429, 'ใส่รหัสผิดหลายครั้ง กรุณารอ ' + Math.ceil((rl.until - Date.now()) / 60000) + ' นาทีแล้วลองใหม่');
  const ref = await getJSON(s, emailKey(email));
  const u = ref && (await getUser(ref.id));
  const ok = u && typeof b.password === 'string' && checkPassword(b.password, u.salt, u.hash);
  if (!ok) {
    const expired = rl && rl.until && rl.until <= Date.now();
    const n = ((rl && !expired && rl.n) || 0) + 1;
    await s.setJSON(rlKey, { n, until: n >= 8 ? Date.now() + 10 * 60000 : 0 });
    fail(401, 'อีเมลหรือรหัสผ่านไม่ถูกต้อง');
  }
  if (u.disabled) fail(403, 'บัญชีนี้ถูกระงับ ติดต่อผู้ดูแลระบบ');
  if (rl) await s.delete(rlKey);
  const nu = await update(s, 'u/' + u.id, (x) => x && { ...x, lastLogin: Date.now() });
  return nu || u;
}

export async function changePassword(u, b) {
  if (!checkPassword(String(b.oldPassword || ''), u.salt, u.hash)) fail(400, 'รหัสผ่านเดิมไม่ถูกต้อง');
  checkNewPassword(b.newPassword);
  const { salt, hash } = hashPassword(b.newPassword);
  // เปลี่ยนรหัสแล้ว โทเคนเก่าทุกเครื่องใช้ไม่ได้
  return update(users(), 'u/' + u.id, (x) => ({ ...x, salt, hash, tokenV: (x.tokenV || 0) + 1 }));
}

export async function listUsers() {
  const s = users();
  const r = await s.list({ prefix: 'u/' });
  const all = await Promise.all((r.blobs || []).map((b) => getJSON(s, b.key)));
  return all.filter(Boolean);
}
