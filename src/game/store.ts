// 当前存档 + 自动保存到浏览器本地。三个存档位：第一个沿用原来的键（老玩家的存档就在这一位），另两个各一个键
import type { Save } from './state';
import { SAVE_KEY, deserialize, serialize } from './state';

export const SLOTS = 3;
const SLOT_KEY = 'pxsg.slot';
const keyOf = (i: number) => (i === 0 ? SAVE_KEY : `${SAVE_KEY}.slot${i + 1}`);

// 防坏：每隔一阵把读得通的存档留一份 .bak；主存档读不出来就用备份顶上（坏的那份另存 .broken，不删）
const BAK_EVERY = 10 * 60 * 1000;
const bakOf = (i: number) => `${keyOf(i)}.bak`;
const brokenOf = (i: number) => `${keyOf(i)}.broken`;

let current: Save | null = null;
let timer: number | null = null;
let slot = 0;
let bakAt = 0;
let warned = false;
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
  // 读档出了岔子（用备份顶上了）、写不进去，告诉玩家一声；main.ts 接到屏幕上
  onWarn: null as ((msg: string) => void) | null,
  // 读档时用备份恢复了：标题页提示一次
  restored: '',
  peek(i: number): SlotInfo | null {
    // 主存档坏了就看备份（不然这一位看着是空的，一不小心就在上面建新角色盖掉了）
    for (const key of [keyOf(i), bakOf(i)]) {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const j = JSON.parse(raw);
        return { name: j.player.name, level: j.player.level, classId: j.player.classId, location: j.location, savedAt: Number(localStorage.getItem(`${keyOf(i)}.t`)) || 0 };
      } catch {
        // 换备份看
      }
    }
    return null;
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
      for (const k of [keyOf(i), `${keyOf(i)}.t`, bakOf(i), brokenOf(i)]) localStorage.removeItem(k);
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
    const raw = serialize(current);
    const now = Date.now();
    const write = () => {
      localStorage.setItem(keyOf(slot), raw);
      localStorage.setItem(`${keyOf(slot)}.t`, String(now));
    };
    try {
      // 隔一阵留一份备份：备份的是盘上原来那份（先确认读得通），这样内存里的存档出了毛病也不会连备份一起坏
      if (now - bakAt >= BAK_EVERY) {
        const prev = localStorage.getItem(keyOf(slot));
        let good = !prev;
        try {
          if (prev) good = !!deserialize(prev);
        } catch {
          good = false;
        }
        if (good) localStorage.setItem(bakOf(slot), prev ?? raw);
        bakAt = now;
      }
      write();
    } catch (e) {
      // 多半是存储满了：先腾掉备份和坏档再试一次
      try {
        for (let i = 0; i < SLOTS; i++) {
          localStorage.removeItem(bakOf(i));
          localStorage.removeItem(brokenOf(i));
        }
        write();
        bakAt = 0;
      } catch {
        console.warn('存档写入失败', e);
        if (!warned) this.onWarn?.('存档写不进去了（手机存储可能满了）。先别清浏览器数据，去「设置」导出存档或传到云端');
        warned = true;
        return;
      }
    }
    warned = false;
  },
  loadLocal(): Save | null {
    current = null;
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(keyOf(slot));
      if (raw) current = deserialize(raw);
    } catch (e) {
      console.warn('读取存档失败', e);
      current = null;
    }
    if (!current) {
      // 主存档没有或读不出来：有备份就用备份
      try {
        const bak = localStorage.getItem(bakOf(slot));
        if (bak) {
          current = deserialize(bak);
          if (raw) localStorage.setItem(brokenOf(slot), raw);
          this.restored = `${raw ? '存档读不出来' : '存档不见了'}，已用备份恢复（${current.player.name} ${current.player.level}级）。最后十来分钟的进度可能没了${raw ? '，读不出来的那份留着没删' : ''}`;
          localStorage.setItem(keyOf(slot), bak);
        }
      } catch (e) {
        console.warn('备份也读不出来', e);
        current = null;
      }
    }
    bakAt = 0;
    return current;
  },
  clear(): void {
    current = null;
    try {
      for (const k of [keyOf(slot), `${keyOf(slot)}.t`, bakOf(slot), brokenOf(slot)]) localStorage.removeItem(k);
    } catch {
      // 读不到本地存储就算了
    }
  },
};

window.addEventListener('pagehide', () => store.flush());
