// 当前存档 + 自动保存到浏览器本地
import type { Save } from './state';
import { SAVE_KEY, deserialize, serialize } from './state';

let current: Save | null = null;
let timer: number | null = null;

export const store = {
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
      localStorage.setItem(SAVE_KEY, serialize(current));
    } catch (e) {
      console.warn('存档写入失败', e);
    }
  },
  loadLocal(): Save | null {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
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
      localStorage.removeItem(SAVE_KEY);
    } catch {
      // 读不到本地存储就算了
    }
  },
};

window.addEventListener('pagehide', () => store.flush());
