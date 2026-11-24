// ที่เก็บข้อมูล: Netlify Blobs (ไม่ต้องตั้งฐานข้อมูลเอง)
// ตอนทดสอบในเครื่องใช้หน่วยความจำแทน โดยตั้ง RR_MEMORY_DB=1
import { getStore } from '@netlify/blobs';

const MEM = new Map();
// โหมดตัวอย่างในเบราว์เซอร์: เก็บ/โหลดข้อมูลจำลองไว้ใน localStorage
const persist = () => { if (globalThis.__rrSave) globalThis.__rrSave(MEM); };
if (globalThis.__rrLoad) globalThis.__rrLoad(MEM);

function memStore(name) {
  const k = (key) => name + '\u0000' + key;
  let etagN = 0;
  return {
    async get(key, opt) {
      const v = MEM.get(k(key));
      if (v === undefined) return null;
      if (v.bin) return v.bin;
      return opt && opt.type === 'json' ? JSON.parse(v.data) : v.data;
    },
    async set(key, data) { MEM.set(k(key), { bin: data, data: '', etag: 'b' }); return { modified: true }; },
    async getWithMetadata(key, opt) {
      const v = MEM.get(k(key));
      if (v === undefined) return null;
      return { data: opt && opt.type === 'json' ? JSON.parse(v.data) : v.data, etag: v.etag, metadata: {} };
    },
    async setJSON(key, value, opt = {}) {
      const cur = MEM.get(k(key));
      if (opt.onlyIfNew && cur) return { modified: false };
      if (opt.onlyIfMatch && (!cur || cur.etag !== opt.onlyIfMatch)) return { modified: false };
      const etag = '"' + (++etagN) + '-' + Date.now() + '"';
      MEM.set(k(key), { data: JSON.stringify(value), etag });
      persist();
      return { modified: true, etag };
    },
    async delete(key) { MEM.delete(k(key)); persist(); },
    async list(opt = {}) {
      const pre = name + '\u0000' + (opt.prefix || '');
      const blobs = [];
      for (const key of MEM.keys()) if (key.startsWith(pre)) blobs.push({ key: key.slice(name.length + 1), etag: MEM.get(key).etag });
      blobs.sort((a, b) => (a.key < b.key ? -1 : 1));
      return { blobs, directories: [] };
    },
  };
}

export function memReset() { MEM.clear(); }

const cache = {};
export function store(name) {
  if (cache[name]) return cache[name];
  cache[name] = process.env.RR_MEMORY_DB ? memStore(name) : getStore({ name, consistency: 'strong' });
  return cache[name];
}

export const users = () => store('rr-users');
export const data = () => store('rr-data');
export const jobs = () => store('rr-jobs');
export const notes = () => store('rr-notify');
export const fuel = () => store('rr-fuel');
export const tts = () => store('rr-tts');

export async function getJSON(s, key) {
  try { return await s.get(key, { type: 'json' }); } catch { return null; }
}

// เขียนแบบกันชนกัน: อ่าน → แก้ → เขียนถ้ายังไม่มีใครแก้ก่อน (ลองซ้ำได้ 5 ครั้ง)
export async function update(s, key, fn) {
  for (let i = 0; i < 5; i++) {
    const cur = await s.getWithMetadata(key, { type: 'json' });
    const next = await fn(cur ? cur.data : null);
    if (next === undefined) return cur ? cur.data : null;
    const r = cur ? await s.setJSON(key, next, { onlyIfMatch: cur.etag }) : await s.setJSON(key, next, { onlyIfNew: true });
    if (r && r.modified !== false) return next;
  }
  throw Object.assign(new Error('ข้อมูลถูกแก้พร้อมกันหลายที่ ลองใหม่อีกครั้ง'), { status: 409 });
}

export async function listKeys(s, prefix) {
  const r = await s.list({ prefix });
  return (r.blobs || []).map((b) => b.key);
}
