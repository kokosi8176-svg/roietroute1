// ตัวช่วยตอบกลับ HTTP
export class HttpError extends Error {
  constructor(status, message, extra) { super(message); this.status = status; this.extra = extra; }
}
export const fail = (status, message, extra) => { throw new HttpError(status, message, extra); };

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type, authorization',
  'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'access-control-max-age': '86400',
};

export function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...CORS, ...headers },
  });
}
export const preflight = () => new Response(null, { status: 204, headers: CORS });

export async function body(req, maxBytes = 3 * 1024 * 1024) {
  const t = await req.text();
  if (t.length > maxBytes) fail(413, 'ข้อมูลใหญ่เกินไป');
  if (!t) return {};
  try { return JSON.parse(t); } catch { fail(400, 'รูปแบบข้อมูลไม่ถูกต้อง (ต้องเป็น JSON)'); }
}

export const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
export const num = (v) => (typeof v === 'number' && isFinite(v) ? v : null);
export const id = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
