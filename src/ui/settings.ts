// 本机设置：音乐、音效音量，各场合放哪首曲子，战斗速度、记住自动战斗、暴击震屏。跟着设备走，不进存档（换设备、读云存档都不变）
import type { TrackId } from './audio';

// 每个场合原本放的那首（键既是场合也是曲子）
export const TRACK_NAMES: Record<TrackId, string> = {
  title: '标题', town: '城镇', field: '野外', night: '夜里野外', cave: '宝洞古墓', battle: '战斗', guozhan: '国战', boss: '首领战',
};
export const TRACK_IDS = Object.keys(TRACK_NAMES) as TrackId[];
// 某个场合换成哪首；'off' = 这个场合不放音乐；没写 = 原曲
export type TrackPick = TrackId | 'off';

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
  // 手机振动（暴击、升级、招降成功、名将登场）。老玩家默认关，新建角色时打开
  vibrate: boolean;
  // 画面放大：逻辑宽度从 360 改成 320，所有东西放大约一成（改了要重开页面）
  big: boolean;
  tracks: Partial<Record<TrackId, TrackPick>>;
}

const KEY = 'pxsg.settings.v1';
export const VOLUME_NAMES = ['关', '小', '中', '大'];
export const VOLUME_GAIN = [0, 0.35, 0.7, 1];
// 背景音乐的几档（音乐过了压缩，整体比以前响得多；「小」也要手机外放听得清）
export const MUSIC_GAIN = [0, 0.5, 0.75, 1];
export const SPEEDS = [1, 1.5, 2];

// 音效默认和以前一样是开着的；背景音乐是新加的，默认放得小一点
const DEFAULTS: Settings = { music: 1, sfx: 2, speed: 1, keepAuto: false, lastAuto: false, shake: true, vibrate: false, big: false, tracks: {} };

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
  // 选曲：认不得的场合、曲子丢掉（曲目以后改名也不出错）
  const tr: Partial<Record<TrackId, TrackPick>> = {};
  const src = cur.tracks && typeof cur.tracks === 'object' ? cur.tracks : {};
  for (const id of TRACK_IDS) {
    const v = (src as Record<string, unknown>)[id];
    if (v === 'off' || (TRACK_IDS as unknown[]).includes(v)) tr[id] = v as TrackPick;
  }
  cur.tracks = tr;
  return cur;
}

// 这个场合实际放哪首（null = 不放）
export function trackFor(scene: TrackId): TrackId | null {
  const v = settings().tracks[scene] ?? scene;
  return v === 'off' ? null : v;
}

// 这台设备上有没有自己选过振动（没选过的新角色才替他打开）
export function hasVibrateChoice(): boolean {
  try {
    return 'vibrate' in (JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {});
  } catch {
    return true;
  }
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
