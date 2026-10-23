import { beforeAll, describe, expect, it, vi } from 'vitest';
import { SAVE_KEY, newSave } from '../src/game/state';

// 内存版 localStorage：可以设一个容量，超了就像浏览器一样抛错
const mem = new Map<string, string>();
let cap = Infinity;
const used = () => [...mem.entries()].reduce((a, [k, v]) => a + k.length + v.length, 0);
vi.stubGlobal('localStorage', {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => {
    const before = mem.get(k);
    mem.set(k, String(v));
    if (used() > cap) {
      if (before === undefined) mem.delete(k);
      else mem.set(k, before);
      throw new Error('QuotaExceededError');
    }
  },
  removeItem: (k: string) => void mem.delete(k),
});
vi.stubGlobal('window', { addEventListener() {}, setTimeout, clearTimeout });

let store: typeof import('../src/game/store').store;
beforeAll(async () => {
  store = (await import('../src/game/store')).store;
});

const hero = (name: string, level = 5) => {
  const s = newSave({ server: '1', name, gender: 'male', classId: 'warrior', avatar: 0, seed: 1 });
  s.player.level = level;
  return s;
};

describe('本地存档防坏', () => {
  it('隔一阵留一份读得通的备份；主存档坏了用备份恢复，坏的那份留着', () => {
    let now = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    store.useSlot(0);
    store.set(hero('甲', 5));
    expect(mem.get(`${SAVE_KEY}.bak`)).toContain('"甲"');
    // 十分钟内再写，备份不动
    store.save.player.level = 6;
    store.flush();
    expect(JSON.parse(mem.get(`${SAVE_KEY}.bak`)!).player.level).toBe(5);
    // 过了十分钟：备份换成盘上原来那份（6 级），主存档是新的（7 级）
    now += 11 * 60 * 1000;
    store.save.player.level = 7;
    store.flush();
    expect(JSON.parse(mem.get(`${SAVE_KEY}.bak`)!).player.level).toBe(6);
    expect(JSON.parse(mem.get(SAVE_KEY)!).player.level).toBe(7);
    // 主存档写坏了
    mem.set(SAVE_KEY, '{"v":1,"player":');
    expect(store.peek(0)?.level).toBe(6);
    const s = store.loadLocal();
    expect(s?.player.level).toBe(6);
    expect(store.restored).toMatch(/已用备份恢复（甲 6级）/);
    expect(mem.get(`${SAVE_KEY}.broken`)).toBe('{"v":1,"player":');
    expect(JSON.parse(mem.get(SAVE_KEY)!).player.level).toBe(6);
    vi.restoreAllMocks();
  });

  it('盘上那份本身读不出来就不拿它当备份', () => {
    let now = 5_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    store.useSlot(1);
    store.set(hero('乙', 9));
    const key = `${SAVE_KEY}.slot2`;
    const bak = mem.get(`${key}.bak`);
    mem.set(key, 'garbage');
    now += 11 * 60 * 1000;
    store.flush();
    expect(mem.get(`${key}.bak`)).toBe(bak);
    vi.restoreAllMocks();
  });

  it('删除存档连备份一起删', () => {
    store.useSlot(1);
    store.removeSlot(1);
    expect([...mem.keys()].some((k) => k.startsWith(`${SAVE_KEY}.slot2`))).toBe(false);
    expect(store.peek(1)).toBeNull();
  });

  it('存储满了：先腾掉备份再写；还写不进去就提示一次', () => {
    store.useSlot(0);
    const warn = vi.fn();
    store.onWarn = warn;
    // 容量只够主存档、不够再加备份
    const big = hero('丙', 30);
    store.set(big);
    cap = used() - (mem.get(`${SAVE_KEY}.bak`)?.length ?? 0) + 200;
    store.save.player.level = 31;
    store.flush();
    expect(JSON.parse(mem.get(SAVE_KEY)!).player.level).toBe(31);
    expect(mem.has(`${SAVE_KEY}.bak`)).toBe(false);
    expect(warn).not.toHaveBeenCalled();
    // 再小到连主存档都放不下
    cap = 100;
    store.flush();
    store.flush();
    expect(warn).toHaveBeenCalledTimes(1);
    cap = Infinity;
  });
});
