// 当前存档 + 自动保存到浏览器本地。三个存档位：第一个沿用原来的键（老玩家的存档就在这一位），另两个各一个键
import type { Save } from './state';
import { SAVE_KEY, deserialize, serialize } from './state';

export const SLOTS = 3;
const SLOT_KEY = 'pxsg.slot';
const keyOf = (i: number) => (i === 0 ? SAVE_KEY : `${SAVE_KEY}.slot${i + 1}`);

let current: Save | null = null;
let timer: number | null = null;
let slot = 0;
try {
  slot = Math.max(0, Math.min(SLOTS - 1, Number(localStorage.getItem(SLOT_KEY)) || 0));
} catch {
  slot = 0;
}

// 存档位上是谁（不完整读档，只看名字、等级、职业、地点、最后保存时间）
export interface SlotInfo {
  name: string;
  level: number;
  classId: string;
  location: string;
  savedAt: number;
}

export const store = {
  get slot(): number {
    return slot;
  },
  peek(i: number): SlotInfo | null {
    try {
      const raw = localStorage.getItem(keyOf(i));
      if (!raw) return null;
      const j = JSON.parse(raw);
      return { name: j.player.name, level: j.player.level, classId: j.player.classId, location: j.location, savedAt: Number(localStorage.getItem(`${keyOf(i)}.t`)) || 0 };
    } catch {
      return null;
    }
  },
  // 换到另一个存档位：先把手上的存好，再读那一位（空位就没有存档）
  useSlot(i: number): Save | null {
    this.flush();
    slot = Math.max(0, Math.min(SLOTS - 1, i));
    try {
      localStorage.setItem(SLOT_KEY, String(slot));
    } catch {
      // 存不下就只这次有效
    }
    current = null;
    return this.loadLocal();
  },
  removeSlot(i: number): void {
    try {
      localStorage.removeItem(keyOf(i));
      localStorage.removeItem(`${keyOf(i)}.t`);
    } catch {
      // 读不到本地存储就算了
    }
    if (i === slot) current = null;
  },
  get save(): Save {
    if (!current) throw new Error('还没有存档');
    return current;
  },
  has(): boolean {
    return !!current;
  },
  set(s: Save): void {
    current = s;
    this.flush();
  },
  // 改完存档调一次，300ms 内合并成一次写入
  commit(): void {
    if (timer !== null) clearTimeout(timer);
    timer = window.setTimeout(() => this.flush(), 300);
  },
  flush(): void {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    if (!current) return;
    try {
      localStorage.setItem(keyOf(slot), serialize(current));
      localStorage.setItem(`${keyOf(slot)}.t`, String(Date.now()));
    } catch (e) {
      console.warn('存档写入失败', e);
    }
  },
  loadLocal(): Save | null {
    try {
      const raw = localStorage.getItem(keyOf(slot));
      if (raw) current = deserialize(raw);
    } catch (e) {
      console.warn('读取存档失败', e);
      current = null;
    }
    return current;
  },
  clear(): void {
    current = null;
    try {
      localStorage.removeItem(keyOf(slot));
      localStorage.removeItem(`${keyOf(slot)}.t`);
    } catch {
      // 读不到本地存储就算了
    }
  },
};

window.addEventListener('pagehide', () => store.flush());
