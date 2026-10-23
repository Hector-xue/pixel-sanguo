// 天气：按真实日期和地点定下来（同一天同一处不会一会儿晴一会儿雨），季节按真实月份。只管观感，不影响玩法。
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export type Weather = 'clear' | 'rain' | 'snow';

export function seasonOf(d = new Date()): Season {
  const m = d.getMonth() + 1;
  return m >= 3 && m <= 5 ? 'spring' : m >= 6 && m <= 8 ? 'summer' : m >= 9 && m <= 11 ? 'autumn' : 'winter';
}

// 室内、洞里、古墓没有天气
const INDOOR = new Set(['cave', 'tomb']);
const CHANCE: Record<Season, { rain: number; snow: number }> = {
  spring: { rain: 0.22, snow: 0 },
  summer: { rain: 0.28, snow: 0 },
  autumn: { rain: 0.14, snow: 0 },
  winter: { rain: 0.05, snow: 0.3 },
};

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

export function weatherOf(loc: string, art: string, d = new Date()): Weather {
  if (INDOOR.has(art)) return 'clear';
  // 开发版截图用：window.__wx = 'rain' / 'snow' 强制天气
  const force = import.meta.env?.DEV ? (globalThis as { __wx?: Weather }).__wx : undefined;
  if (force) return force;
  const day = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  // 一片地方（地点 id 前四个字母一样的，比如许昌和许昌郊外）同一天天气一样：从城里走到城郊不会突然雨停
  const x = hash(`${day}|${loc.slice(0, 4)}`);
  const c = CHANCE[seasonOf(d)];
  if (x < c.snow) return 'snow';
  if (x < c.snow + c.rain) return 'rain';
  return 'clear';
}

export const WEATHER_NAMES: Record<Weather, string> = { clear: '', rain: '小雨', snow: '小雪' };
