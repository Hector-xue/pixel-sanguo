// 本机设置：音乐、音效音量，战斗速度、记住自动战斗、暴击震屏。跟着设备走，不进存档（换设备、读云存档都不变）
export interface Settings {
  // 音量档：0 关、1 小、2 中、3 大
  music: number;
  sfx: number;
  // 战斗动画速度倍数
  speed: number;
  // 开战时沿用上一仗的自动/手动
  keepAuto: boolean;
  // 上一仗最后是不是自动
  lastAuto: boolean;
  // 暴击、受重击时镜头抖一下
  shake: boolean;
}

const KEY = 'pxsg.settings.v1';
export const VOLUME_NAMES = ['关', '小', '中', '大'];
export const VOLUME_GAIN = [0, 0.35, 0.7, 1];
export const SPEEDS = [1, 1.5, 2];

// 音效默认和以前一样是开着的；背景音乐是新加的，默认放得小一点
const DEFAULTS: Settings = { music: 1, sfx: 2, speed: 1, keepAuto: false, lastAuto: false, shake: true };

let cur: Settings | null = null;

export function settings(): Settings {
  if (cur) return cur;
  let raw: Partial<Settings> = {};
  try {
    raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {};
  } catch {
    // 隐私模式读不到就用默认
  }
  cur = { ...DEFAULTS, ...raw };
  if (!SPEEDS.includes(cur.speed)) cur.speed = 1;
  for (const k of ['music', 'sfx'] as const) cur[k] = Math.max(0, Math.min(3, Math.round(Number(cur[k]) || 0)));
  return cur;
}

const listeners: (() => void)[] = [];

export function onSettings(fn: () => void): void {
  listeners.push(fn);
}

export function saveSettings(patch: Partial<Settings>): void {
  Object.assign(settings(), patch);
  try {
    localStorage.setItem(KEY, JSON.stringify(cur));
  } catch {
    // 存不下就只在这次打开里生效
  }
  for (const fn of listeners) fn();
}
