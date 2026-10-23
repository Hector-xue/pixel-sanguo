// 手机振动：几种轻重。浏览器不支持（电脑、iPhone）就什么也不做；App 里要安卓清单有 VIBRATE 权限
import { settings } from './settings';

const PATTERN = { light: 12, medium: 28, heavy: [40, 50, 40] } as const;
export type Buzz = keyof typeof PATTERN;

let last = 0;
export function buzz(kind: Buzz): void {
  if (!settings().vibrate) return;
  const now = Date.now();
  // 一连串暴击不要震成一片
  if (kind !== 'heavy' && now - last < 120) return;
  last = now;
  try {
    navigator.vibrate?.(PATTERN[kind] as number | number[]);
  } catch {
    // 不支持就算了
  }
}

export function canVibrate(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}
