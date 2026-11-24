// ค่าตั้งที่แอดมินแก้ได้จากหน้าเว็บ (ไม่ต้องเข้า Netlify) เช่น คีย์เสียงธรรมชาติ
// ค่าใน Environment variables ของ Netlify มาก่อนเสมอ (ถ้าตั้งไว้ทั้งสองที่)
import { data, update } from './db.mjs';
import { fail } from './http.mjs';

const KEY = 'cfg/settings';
let cache = null, at = 0;
export async function get() {
  if (cache && Date.now() - at < 30000) return cache;
  cache = (await data().get(KEY, { type: 'json' }).catch(() => null)) || {};
  at = Date.now();
  return cache;
}
const FIELDS = {
  googleTtsKey: (v) => /^[\w\-.]{20,200}$/.test(v),
  azureKey: (v) => /^[\w\-.]{16,200}$/.test(v),
  azureRegion: (v) => /^[a-z0-9]{3,40}$/.test(v),
  ttsProvider: (v) => v === 'google' || v === 'azure',
};
export async function set(patch) {
  const clean = {};
  for (const k of Object.keys(patch || {})) {
    if (!FIELDS[k]) continue;
    const v = String(patch[k] == null ? '' : patch[k]).trim();
    if (v && !FIELDS[k](v)) {
      fail(400, { googleTtsKey: 'รูปแบบคีย์ Google ไม่ถูกต้อง', azureKey: 'รูปแบบคีย์ Azure ไม่ถูกต้อง', azureRegion: 'ภูมิภาค Azure ต้องเป็นตัวพิมพ์เล็ก เช่น southeastasia', ttsProvider: 'เลือกได้แค่ google หรือ azure' }[k]);
    }
    clean[k] = v;
  }
  const next = await update(data(), KEY, (x) => {
    const y = { ...(x || {}) };
    for (const k of Object.keys(clean)) { if (clean[k]) y[k] = clean[k]; else delete y[k]; }
    y.updatedAt = Date.now();
    return y;
  });
  cache = next; at = Date.now();
  return next;
}
export const tail = (s) => (s ? '••••' + String(s).slice(-4) : '');
