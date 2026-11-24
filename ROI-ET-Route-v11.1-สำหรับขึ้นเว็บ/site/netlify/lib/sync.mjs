// เก็บข้อมูลของเว็บเดิมบนคลาวด์ (ประวัติ ร้านประจำ ผลตรวจความแม่นยำ ราคาน้ำมันที่แก้เอง)
import { data, getJSON, update } from './db.mjs';
import { fail } from './http.mjs';

export const KEYS = ['roiet.hist', 'roiet.fav', 'roiet.acc', 'roiet.fuel'];
const okKey = (k) => { if (!KEYS.includes(k)) fail(400, 'ไม่รองรับข้อมูลชนิดนี้: ' + k); return k; };

export async function getAll(u) {
  const s = data(), out = {};
  await Promise.all(KEYS.map(async (k) => { const v = await getJSON(s, 'd/' + u.id + '/' + k); if (v) out[k] = v; }));
  return out;
}

// เขียนได้เมื่อเวอร์ชันที่เครื่องนี้รู้ล่าสุดตรงกับบนคลาวด์ ไม่งั้นตอบ 409 ให้เครื่องรวมข้อมูลก่อน
export async function put(u, key, b) {
  okKey(key);
  const s = data();
  const r = await update(s, 'd/' + u.id + '/' + key, (cur) => {
    if (cur && b.base != null && cur.rev !== b.base) fail(409, 'มีข้อมูลใหม่จากเครื่องอื่น', { current: cur });
    return { value: b.value === undefined ? null : b.value, rev: ((cur && cur.rev) || 0) + 1, at: Date.now() };
  });
  return r;
}

export async function usage(u) {
  const all = await getAll(u), o = {};
  Object.keys(all).forEach((k) => { o[k] = { rev: all[k].rev, at: all[k].at, bytes: JSON.stringify(all[k].value).length }; });
  return o;
}
