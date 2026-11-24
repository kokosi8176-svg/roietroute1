// ดึงราคาน้ำมันทุกปั๊มอัตโนมัติทุกชั่วโมง (Netlify Scheduled Function)
// ราคาน้ำมันไทยมักเปลี่ยนตอนตี 5 ทุกชั่วโมงจึงทันภายในไม่เกิน 1 ชั่วโมง
import { refresh } from '../lib/fuel.mjs';

export default async () => {
  const r = await refresh();
  console.log('[fuel-cron]', JSON.stringify(r.sources));
};

export const config = { schedule: '5 * * * *' };
