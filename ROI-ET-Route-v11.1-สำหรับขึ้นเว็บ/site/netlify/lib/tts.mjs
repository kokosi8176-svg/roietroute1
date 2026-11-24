// เสียงพูดธรรมชาติสำหรับระบบนำทาง ภาษาไทย ชาย/หญิง
// เลือกได้ 2 เจ้า (ตั้งอย่างใดอย่างหนึ่งใน Netlify > Environment variables)
//   1) Google Chirp 3 HD (แนะนำ ฟังเหมือนคนที่สุด): GOOGLE_TTS_KEY
//   2) Azure Neural: AZURE_SPEECH_KEY + AZURE_SPEECH_REGION (เช่น southeastasia)
// ตั้งทั้งคู่ = ใช้ Google ก่อน (เปลี่ยนได้ด้วย TTS_PROVIDER=azure)
// ไม่ตั้งเลย = หน้าเว็บใช้เสียงในเครื่องแทน · เก็บไฟล์เสียงที่สร้างแล้วไว้ใช้ซ้ำ (ประโยคนำทางซ้ำบ่อย)
import crypto from 'node:crypto';
import { tts as ttsStore } from './db.mjs';
import { fail } from './http.mjs';
import * as Cfg from './settings.mjs';

const DEF = {
  google: { f: 'th-TH-Chirp3-HD-Achernar', m: 'th-TH-Chirp3-HD-Charon' },
  azure: { f: 'th-TH-PremwadeeNeural', m: 'th-TH-NiwatNeural' },
};
// คีย์จาก Netlify (Environment variables) มาก่อน ไม่มีค่อยใช้ที่แอดมินบันทึกไว้ในหน้าแอดมิน
export async function keys() {
  const e = process.env, c = await Cfg.get();
  return {
    google: e.GOOGLE_TTS_KEY || c.googleTtsKey || '', googleFrom: e.GOOGLE_TTS_KEY ? 'env' : c.googleTtsKey ? 'admin' : null,
    azure: e.AZURE_SPEECH_KEY || c.azureKey || '', azureFrom: e.AZURE_SPEECH_KEY ? 'env' : c.azureKey ? 'admin' : null,
    region: e.AZURE_SPEECH_REGION || c.azureRegion || '',
    pref: e.TTS_PROVIDER || c.ttsProvider || '',
  };
}
function pick(k) {
  const g = !!k.google, a = !!(k.azure && k.region);
  if (k.pref === 'azure' && a) return 'azure';
  if (k.pref === 'google' && g) return 'google';
  return g ? 'google' : a ? 'azure' : null;
}
async function provider() { return pick(await keys()); }
export function voices(p = provider()) {
  if (!p) return {};
  return { f: process.env.TTS_VOICE_F || DEF[p].f, m: process.env.TTS_VOICE_M || DEF[p].m };
}
export const VOICES = DEF.azure; // เดิม (ใช้ในเทสต์)
export async function info() {
  const p = await provider();
  return { provider: p, voices: voices(p) };
}
const escXml = (s) => s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));

async function viaAzure(t, voice, r, signal, K) {
  const ssml = `<speak version="1.0" xml:lang="th-TH"><voice name="${voice}"><prosody rate="${r}%">${escXml(t)}</prosody></voice></speak>`;
  const res = await fetch(`https://${K.region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: 'POST', signal,
    headers: { 'Ocp-Apim-Subscription-Key': K.azure, 'Content-Type': 'application/ssml+xml', 'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3', 'User-Agent': 'roiet-route' },
    body: ssml,
  });
  if (!res.ok) fail(502, 'สร้างเสียงไม่สำเร็จ (Azure ' + res.status + ')');
  return res.arrayBuffer();
}
async function viaGoogle(t, voice, r, signal, K) {
  const body = (rate) => JSON.stringify({
    input: { text: t },
    voice: { languageCode: 'th-TH', name: voice },
    audioConfig: Object.assign({ audioEncoding: 'MP3', sampleRateHertz: 24000 }, rate ? { speakingRate: rate } : {}),
  });
  const url = 'https://texttospeech.googleapis.com/v1/text:synthesize?key=' + encodeURIComponent(K.google);
  const go = (rate) => fetch(url, { method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: body(rate) });
  let res = await go(r ? 1 + r / 100 : 0);
  if (!res.ok && r && res.status === 400) res = await go(0); // บางเสียงไม่รับการปรับความเร็ว
  if (!res.ok) fail(502, 'สร้างเสียงไม่สำเร็จ (Google ' + res.status + ')');
  const j = await res.json();
  if (!j || !j.audioContent) fail(502, 'สร้างเสียงไม่สำเร็จ (Google ไม่ส่งเสียงกลับมา)');
  const b = Buffer.from(j.audioContent, 'base64');
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}

export async function speak(text, g, rate) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t) fail(400, 'ไม่มีข้อความ');
  if (t.length > 220) fail(400, 'ข้อความยาวเกินไป');
  if (!/[฀-๿]/.test(t)) fail(400, 'รองรับเฉพาะข้อความภาษาไทย');
  const K = await keys(), p = pick(K);
  if (!p) fail(501, 'ยังไม่ได้ตั้งค่าเสียงธรรมชาติ (GOOGLE_TTS_KEY หรือ AZURE_SPEECH_KEY)');
  const vs = voices(p), voice = g === 'm' ? vs.m : vs.f, r = Math.max(-30, Math.min(30, Math.round(+rate || 0)));
  const key = (p === 'google' ? 'g/' : 'a/') + crypto.createHash('sha256').update(voice + '|' + r + '|' + t).digest('hex');
  const st = ttsStore();
  const hit = await st.get(key, { type: 'arrayBuffer' }).catch(() => null);
  if (hit) return { audio: hit, cached: true };
  const ac = new AbortController(), tm = setTimeout(() => ac.abort(), 9000);
  try {
    const buf = await (p === 'google' ? viaGoogle : viaAzure)(t, voice, r, ac.signal, K);
    await st.set(key, buf).catch(() => {});
    return { audio: buf, cached: false };
  } finally { clearTimeout(tm); }
}
