// แจ้งเตือน: เก็บในระบบ (กระดิ่งบนเว็บ) + ส่งออกไป Telegram / Discord / LINE ถ้าตั้งค่าไว้
import { notes, getJSON, listKeys } from './db.mjs';
import { listUsers } from './auth.mjs';

export const TYPES = {
  job_new: { th: 'มีรายการส่งใหม่', level: 'info' },
  stop_fail: { th: 'จัดส่งไม่สำเร็จ', level: 'danger' },
  stop_ok: { th: 'ส่งสำเร็จ', level: 'ok' },
  route_change: { th: 'เส้นทางมีการเปลี่ยนแปลง', level: 'warn' },
  job_done: { th: 'จบงานจัดส่ง', level: 'ok' },
  fuel_change: { th: 'ราคาน้ำมันเปลี่ยน', level: 'info' },
};

const pad = (n) => String(n).padStart(14, '0');

// ส่งให้ผู้รับหลายคน (uids) — คืนรายการที่สร้าง
export async function notify(uids, n) {
  const s = notes(), at = Date.now();
  const uniq = [...new Set(uids.filter(Boolean))];
  const item = { type: n.type, level: (TYPES[n.type] || {}).level || 'info', title: n.title || (TYPES[n.type] || {}).th || 'แจ้งเตือน', body: n.body || '', jobId: n.jobId || null, at, by: n.by || null };
  await Promise.all(uniq.map((uid) => {
    const key = 'n/' + uid + '/' + pad(at) + '-' + Math.random().toString(36).slice(2, 7);
    return s.setJSON(key, { ...item, id: key.split('/').pop() });
  }));
  if (n.external !== false && n.type !== 'stop_ok') await external(item).catch(() => {});
  return item;
}

export async function adminIds() {
  return (await listUsers()).filter((u) => u.role === 'admin' && !u.disabled).map((u) => u.id);
}

export async function list(uid, { since = 0, limit = 50 } = {}) {
  const s = notes();
  const keys = (await listKeys(s, 'n/' + uid + '/')).slice(-200);
  const recent = keys.slice(-limit).reverse();
  const read = (await getJSON(s, 'r/' + uid)) || { upTo: 0, ids: [] };
  const items = (await Promise.all(recent.map((k) => getJSON(s, k)))).filter(Boolean).filter((x) => x.at > since);
  items.forEach((x) => { x.read = x.at <= read.upTo || read.ids.includes(x.id); });
  const unread = keys.map((k) => k.split('/').pop()).filter((idv) => +idv.slice(0, 14) > read.upTo && !read.ids.includes(idv)).length;
  // ล้างของเก่าเกิน 200 รายการ
  if (keys.length >= 200) { const all = await listKeys(s, 'n/' + uid + '/'); await Promise.all(all.slice(0, Math.max(0, all.length - 200)).map((k) => s.delete(k))); }
  return { items, unread };
}

export async function markRead(uid, b) {
  const s = notes(), key = 'r/' + uid;
  const cur = (await getJSON(s, key)) || { upTo: 0, ids: [] };
  if (b.all) { cur.upTo = Date.now(); cur.ids = []; }
  else if (Array.isArray(b.ids)) cur.ids = [...new Set(cur.ids.concat(b.ids.map(String)))].slice(-300);
  await s.setJSON(key, cur);
  return cur;
}

/* ---------- ช่องทางภายนอก (ใส่ค่าใน Netlify > Environment variables) ---------- */
async function post(url, payload, headers = {}) {
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), 6000);
  try { await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(payload), signal: ac.signal }); }
  finally { clearTimeout(t); }
}
async function external(item) {
  const icon = { danger: '🔴', warn: '🟠', ok: '🟢', info: '🔵' }[item.level] || '🔔';
  const text = `${icon} ${item.title}\n${item.body}`.trim();
  const jobs = [];
  const e = process.env;
  if (e.TG_BOT_TOKEN && e.TG_CHAT_ID) jobs.push(post(`https://api.telegram.org/bot${e.TG_BOT_TOKEN}/sendMessage`, { chat_id: e.TG_CHAT_ID, text }));
  if (e.DISCORD_WEBHOOK_URL) jobs.push(post(e.DISCORD_WEBHOOK_URL, { content: text }));
  if (e.LINE_CHANNEL_TOKEN && e.LINE_TO) jobs.push(post('https://api.line.me/v2/bot/message/push', { to: e.LINE_TO, messages: [{ type: 'text', text }] }, { authorization: 'Bearer ' + e.LINE_CHANNEL_TOKEN }));
  await Promise.allSettled(jobs);
}
