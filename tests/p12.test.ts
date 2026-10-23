import { beforeAll, describe, expect, it, vi } from 'vitest';
import { newSave, serialize } from '../src/game/state';
import type { Save } from '../src/game/state';

// 浏览器里才有的 localStorage / window：测试里用内存的顶上
const mem = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
  removeItem: (k: string) => void mem.delete(k),
});
vi.stubGlobal('window', { addEventListener() {}, setTimeout, clearTimeout });

// 假云端：三个存档位各存各的版本号
const cloud: Record<number, { rev: number; save: string }[]> = {};
vi.stubGlobal('fetch', async (url: string, init: { body: string }) => {
  const name = url.split('/').pop()!;
  const b = JSON.parse(init.body);
  const slot = b.slot ?? 0;
  const list = (cloud[slot] ??= []);
  const top = list[list.length - 1];
  const reply = (status: number, data: unknown) => ({ ok: status < 300, status, json: async () => data });
  if (name === 'login') return reply(200, { account: 'a', token: 't', rev: 0, at: 0, summary: null, history: [], slots: [] });
  if (name === 'upload') {
    if ((top?.rev ?? 0) !== b.base && !b.force) return reply(409, { error: 'conflict', msg: '冲突', rev: top?.rev });
    list.push({ rev: (top?.rev ?? 0) + 1, save: b.save });
    return reply(200, { rev: (top?.rev ?? 0) + 1, at: 1 });
  }
  if (name === 'download') return top ? reply(200, { rev: top.rev, at: 1, save: top.save, summary: {} }) : reply(404, { error: 'empty', msg: '空' });
  return reply(404, { error: 'not_found', msg: '' });
});

let C: typeof import('../src/game/cloud');
let store: typeof import('../src/game/store').store;
beforeAll(async () => {
  C = await import('../src/game/cloud');
  store = (await import('../src/game/store')).store;
});

const hero = (name: string): Save => newSave({ server: '1', name, gender: 'male', classId: 'warrior', avatar: 0, seed: 1 });

describe('云存档分存档位', () => {
  it('老凭据：对上第一位的原样搬过来；对上别的位子的从 0 记起', () => {
    expect(C.upgradeCred({ account: 'a', token: 't', auto: true, rev: 5, syncedAt: 9, hash: 'h' }).slots).toEqual({ 0: { rev: 5, syncedAt: 9, hash: 'h' } });
    expect(C.upgradeCred({ account: 'a', token: 't', auto: true, rev: 5, syncedAt: 9, hash: 'h', slot: 2 }).slots).toEqual({});
  });

  it('每个存档位传到云端同一位，各记各的版本；删了本机存档再建新角色，上传会先冲突', async () => {
    await C.login('a', '123456');
    C.setAuto(true);
    store.useSlot(0);
    store.set(hero('甲'));
    expect(await C.autoTick(store.save, true)).toBeNull();
    store.useSlot(1);
    store.set(hero('乙'));
    expect(await C.autoTick(store.save, true)).toBeNull();
    expect(cloud[0].length).toBe(1);
    expect(cloud[1].length).toBe(1);
    expect(JSON.parse(cloud[1][0].save).player.name).toBe('乙');
    const c = C.loadCred()!;
    expect([C.slotSync(c, 0).rev, C.slotSync(c, 1).rev, C.slotSync(c, 2).rev]).toEqual([1, 1, 0]);
    // 第二位再改一改：只往第二位传
    store.save.player.level = 9;
    await C.autoTick(store.save, true);
    expect([cloud[0].length, cloud[1].length]).toEqual([1, 2]);
    // 没变就不传
    await C.autoTick(store.save, true);
    expect(cloud[1].length).toBe(2);
    // 删了第二位、建新角色：云端第二位还是老角色，自动同步停下来问
    store.removeSlot(1);
    C.forgetSlot(1);
    store.useSlot(1);
    store.set(hero('丙'));
    expect(await C.autoTick(store.save, true)).toContain('存档二');
    expect(JSON.parse(cloud[1][1].save).player.name).toBe('乙');
    expect(C.loadCred()!.auto).toBe(false);
  });

  it('下载指定存档位', async () => {
    const out = await C.download(undefined, 0);
    expect(JSON.parse(out.save).player.name).toBe('甲');
    expect(serialize(hero('甲')).length).toBeGreaterThan(0);
  });
});
