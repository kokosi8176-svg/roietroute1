// งานจัดส่ง: สร้างจาก "โหมดคนขับ" ของเว็บเดิม (roiet.run) แล้วติดตามสถานะแต่ละจุด
import { jobs, users, getJSON, update, listKeys } from './db.mjs';
import { fail, str, num } from './http.mjs';
import { getUser, emailKey } from './auth.mjs';
import { notify, adminIds } from './notify.mjs';

const ST = ['todo', 'ok', 'fail'];
const hm = (m) => (m == null || !isFinite(m) ? '' : String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(Math.round(m % 60)).padStart(2, '0'));

function cleanItems(items) {
  if (!Array.isArray(items)) fail(400, 'ไม่มีรายการจุดส่ง');
  return items.slice(0, 300).map((x) => ({
    k: ['stop', 'dep', 'end'].includes(x.k) ? x.k : 'stop',
    no: num(x.no), n: str(x.n, 120), la: num(x.la), lo: num(x.lo), eta: num(x.eta),
    tw: str(x.tw, 60), w: num(x.w) || 0, pri: x.pri ? 1 : 0,
    st: ST.includes(x.st) ? x.st : 'todo', t: num(x.t), r: str(x.r, 120),
  }));
}
// เก็บข้อมูลงานแบบเต็ม (ยกเว้นบันทึกย้อนกลับ) ให้เครื่องคนขับเปิดโหมดคนขับต่อได้
function rawOf(run) {
  const r = { ...run }; ['log', 'title', 'raw', 'history', 'stats', 'owner', 'ownerName', 'driverId', 'driverName', 'created', 'updated'].forEach((k) => delete r[k]);
  if (r.gps) r.gps = { on: false, km: r.gps.km || 0, last: null, err: '' };
  const t = JSON.stringify(r);
  return t.length < 200000 ? r : null;
}
const stops = (j) => j.items.filter((x) => x.k === 'stop');
const statsOf = (j) => { const s = stops(j); return { n: s.length, ok: s.filter((x) => x.st === 'ok').length, fail: s.filter((x) => x.st === 'fail').length }; };

export function canSee(u, j) { return u.role === 'admin' || j.owner === u.id || j.driverId === u.id; }
async function recipients(j) { return [j.owner, j.driverId, ...(await adminIds())]; }

function routeDiff(a, b) {
  const na = stops(a).map((x) => x.n), nb = stops(b).map((x) => x.n);
  const add = nb.filter((x) => !na.includes(x)), del = na.filter((x) => !nb.includes(x));
  const order = !add.length && !del.length && na.join('|') !== nb.join('|');
  if (!add.length && !del.length && !order) return null;
  const parts = [];
  if (add.length) parts.push('เพิ่ม ' + add.join(', '));
  if (del.length) parts.push('ตัดออก ' + del.join(', '));
  if (order || add.length || del.length) parts.push('ลำดับใหม่: ' + nb.join(' → '));
  return parts.join(' · ');
}

// รับสถานะงานจากเว็บ (สร้างใหม่ / อัปเดต) แล้วแจ้งเตือนตามสิ่งที่เปลี่ยน
export async function syncRun(u, b) {
  const run = b.run || {};
  const runId = str(run.id, 40);
  if (!runId) fail(400, 'ไม่มีรหัสงาน');
  const items = cleanItems(run.items);
  const s = jobs(), key = 'j/' + runId, events = [];
  let prevReplaced = null;
  let job = await update(s, key, (cur) => {
    events.length = 0;
    const base = cur || {
      id: runId, owner: u.id, ownerName: u.name, driverId: u.role === 'driver' ? u.id : null, driverName: u.role === 'driver' ? u.name : '',
      created: Date.now(), history: [],
    };
    if (cur && !canSee(u, cur)) fail(403, 'ไม่มีสิทธิ์แก้งานนี้');
    const next = {
      ...base, title: str(run.title, 120) || ('ส่งของจาก ' + str(run.depot, 80)), depot: str(run.depot, 80), car: str(run.car, 80),
      items, pkm: num(run.pkm), pmin: num(run.pmin), state: ['ready', 'run', 'finish'].includes(run.state) ? run.state : 'ready',
      updated: Date.now(), raw: rawOf(run),
    };
    if (!cur) events.push({ type: 'job_new' });
    else {
      const d = routeDiff(cur, next);
      if (d) events.push({ type: 'route_change', body: d });
      const old = {}; cur.items.forEach((x, i) => { if (x.k === 'stop') old[x.no + '|' + x.n] = x.st; });
      next.items.forEach((x) => {
        if (x.k !== 'stop') return;
        const was = old[x.no + '|' + x.n];
        if (was === x.st || x.st === 'todo') return;
        events.push({ type: x.st === 'fail' ? 'stop_fail' : 'stop_ok', stop: x });
      });
      if (cur.state !== 'finish' && next.state === 'finish') events.push({ type: 'job_done' });
    }
    next.stats = statsOf(next);
    next.history = (base.history || []).concat(events.map((e) => ({ at: Date.now(), by: u.name, type: e.type }))).slice(-100);
    return next;
  });

  // งานใหม่ที่มาแทนงานเดิมที่ยังไม่จบ = เปลี่ยนเส้นทาง
  if (b.replaces && b.replaces !== runId && events.some((e) => e.type === 'job_new')) {
    const okey = 'j/' + str(b.replaces, 40);
    prevReplaced = await update(s, okey, (o) => (o && canSee(u, o) && o.state !== 'finish' ? { ...o, state: 'replaced', replacedBy: runId, updated: Date.now() } : undefined));
    if (prevReplaced && prevReplaced.replacedBy === runId) {
      const i = events.findIndex((e) => e.type === 'job_new');
      events[i] = { type: 'route_change', body: routeDiff(prevReplaced, job) || 'สร้างแผนเส้นทางใหม่แทนงานเดิม' };
      if (prevReplaced.driverId && !job.driverId) job = await update(s, key, (j) => ({ ...j, driverId: prevReplaced.driverId, driverName: prevReplaced.driverName }));
    }
  }
  await s.setJSON('o/' + job.owner + '/' + runId, { at: job.updated });
  if (job.driverId) await s.setJSON('d/' + job.driverId + '/' + runId, { at: job.updated });

  if (events.length) {
    const to = await recipients(job);
    for (const e of events) await notify(to, { ...msg(job, e, u), jobId: job.id, by: u.name });
  }
  return { job, events: events.map((e) => e.type) };
}

function msg(j, e, u) {
  if (e.type === 'job_new') return { type: e.type, title: 'มีรายการส่งใหม่ ' + stops(j).length + ' จุด', body: j.title + ' · ' + (j.pkm != null ? j.pkm.toFixed(1) + ' กม.' : '') + ' · สร้างโดย ' + u.name };
  if (e.type === 'route_change') return { type: e.type, title: 'เส้นทางมีการเปลี่ยนแปลง', body: j.title + ': ' + e.body };
  if (e.type === 'stop_fail') return { type: e.type, title: 'จัดส่งไม่สำเร็จ: ' + e.stop.n, body: 'จุดที่ ' + e.stop.no + (e.stop.r ? ' · เหตุผล: ' + e.stop.r : '') + ' · ' + j.title + ' · โดย ' + u.name };
  if (e.type === 'stop_ok') return { type: e.type, title: 'ส่งสำเร็จ: ' + e.stop.n, body: 'จุดที่ ' + e.stop.no + ' · ' + j.title };
  if (e.type === 'job_done') { const s = statsOf(j); return { type: e.type, title: 'จบงานจัดส่ง', body: j.title + ' · สำเร็จ ' + s.ok + '/' + s.n + (s.fail ? ' · ไม่สำเร็จ ' + s.fail : '') }; }
  return { type: e.type, title: e.type, body: '' };
}

export async function listJobs(u, q = {}) {
  const s = jobs();
  let keys;
  if (u.role === 'admin' && q.scope !== 'mine') keys = (await listKeys(s, 'j/')).map((k) => k.slice(2));
  else keys = [...new Set([...(await listKeys(s, 'o/' + u.id + '/')), ...(await listKeys(s, 'd/' + u.id + '/'))].map((k) => k.split('/').pop()))];
  let all = (await Promise.all(keys.map((k) => getJSON(s, 'j/' + k)))).filter(Boolean).filter((j) => canSee(u, j));
  if (q.state) all = all.filter((j) => j.state === q.state);
  all.sort((a, b) => b.updated - a.updated);
  return all.slice(0, Math.min(+q.limit || 100, 300)).map(summary);
}
export const summary = (j) => ({ id: j.id, title: j.title, depot: j.depot, car: j.car, state: j.state, owner: j.owner, ownerName: j.ownerName, driverId: j.driverId, driverName: j.driverName, stats: j.stats, pkm: j.pkm, created: j.created, updated: j.updated });

export async function getJob(u, idv) {
  const j = await getJSON(jobs(), 'j/' + str(idv, 40));
  if (!j || !canSee(u, j)) fail(404, 'ไม่พบงานนี้');
  return { ...j, items: j.items.map((x) => ({ ...x, etaTxt: hm(x.eta) })) };
}

// แก้สถานะจุดจากหน้าแอดมิน/เครื่องอื่น
export async function setStop(u, idv, no, b) {
  const st = b.st;
  if (!['ok', 'fail', 'todo'].includes(st)) fail(400, 'สถานะต้องเป็น ok / fail / todo');
  const j = await getJob(u, idv);
  const items = j.items.map((x) => (x.k === 'stop' && x.no === +no ? { ...x, st, t: Date.now(), r: st === 'fail' ? str(b.r, 120) || 'อื่นๆ' : '' } : x));
  if (!items.some((x) => x.k === 'stop' && x.no === +no)) fail(404, 'ไม่พบจุดที่ ' + no);
  return syncRun(u, { run: { ...(j.raw || {}), id: j.id, title: j.title, depot: j.depot, car: j.car, pkm: j.pkm, pmin: j.pmin, state: j.state, items } });
}

export async function assign(u, idv, b) {
  const j = await getJob(u, idv);
  if (u.role !== 'admin' && j.owner !== u.id) fail(403, 'เฉพาะผู้สร้างงานหรือผู้ดูแลระบบ');
  let drv = null;
  if (b.driverEmail) {
    const ref = await getJSON(users(), emailKey(str(b.driverEmail, 120)));
    drv = ref && (await getUser(ref.id));
    if (!drv) fail(404, 'ไม่พบบัญชีคนขับอีเมลนี้');
  }
  const s = jobs();
  const nj = await update(s, 'j/' + j.id, (x) => ({ ...x, driverId: drv ? drv.id : null, driverName: drv ? drv.name : '', updated: Date.now() }));
  if (j.driverId && j.driverId !== (drv && drv.id)) await s.delete('d/' + j.driverId + '/' + j.id);
  if (drv) {
    await s.setJSON('d/' + drv.id + '/' + j.id, { at: Date.now() });
    await notify([drv.id], { type: 'job_new', title: 'คุณได้รับมอบหมายงานส่งของ ' + stops(j).length + ' จุด', body: j.title + ' · มอบหมายโดย ' + u.name, jobId: j.id, by: u.name });
  }
  return summary(nj);
}

export async function cancel(u, idv) {
  const j = await getJob(u, idv);
  if (u.role !== 'admin' && j.owner !== u.id) fail(403, 'เฉพาะผู้สร้างงานหรือผู้ดูแลระบบ');
  return summary(await update(jobs(), 'j/' + j.id, (x) => ({ ...x, state: 'cancel', updated: Date.now() })));
}
