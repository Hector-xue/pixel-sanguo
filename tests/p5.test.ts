// 精品化第一轮：NPC 好感（闲聊、送礼、谢礼）、野外奇遇、旧存档迁移
import { describe, expect, it } from 'vitest';
import { newSave, deserialize, serialize } from '../src/game/state';
import { FAVOR_MAX, GIFTS_PER_DAY, TIERS, chatWith, favorOf, giftValue, giveGift, likedCat, tierOf } from '../src/game/bond';
import { rollJourney } from '../src/game/journey';
import { items, locations } from '../src/data';

const fresh = () => newSave({ server: '豫州', name: '测试', gender: 'male', classId: 'warrior', avatar: 0, seed: 7 });

describe('好感', () => {
  it('每天只有第一次闲聊涨好感', () => {
    const s = fresh();
    const a = chatWith(s, 'cunzhang');
    expect(a.first).toBe(true);
    expect(a.gain).toBeGreaterThanOrEqual(2);
    const b = chatWith(s, 'cunzhang');
    expect(b.first).toBe(false);
    expect(favorOf(s, 'cunzhang')).toBe(a.gain);
    expect(b.text.length).toBeGreaterThan(0);
  });

  it('送礼：扣东西、偏好翻倍、每天三次', () => {
    const s = fresh();
    const npc = 'cunzhang';
    const cat = likedCat(npc);
    const liked = Object.keys(items).find((id) => items[id].cat === cat && giftValue(id) > 0)!;
    s.bag[liked] = 10;
    const r = giveGift(s, npc, liked);
    expect(r.ok).toBe(true);
    expect(r.liked).toBe(true);
    expect(r.gain).toBe(giftValue(liked) * 2);
    expect(s.bag[liked]).toBe(9);
    for (let i = 1; i < GIFTS_PER_DAY; i++) expect(giveGift(s, npc, liked).ok).toBe(true);
    expect(giveGift(s, npc, liked).ok).toBe(false);
    expect(s.bag[liked]).toBe(10 - GIFTS_PER_DAY);
  });

  it('任务物品送不出去', () => {
    const s = fresh();
    const q = Object.keys(items).find((id) => items[id].quest)!;
    s.bag[q] = 1;
    expect(giveGift(s, 'cunzhang', q).ok).toBe(false);
    expect(s.bag[q]).toBe(1);
  });

  it('到新一档给一次谢礼，不重复给，好感有上限', () => {
    const s = fresh();
    s.bag.dajiangjunling = 50;
    const silver0 = s.player.silver;
    const lines: string[] = [];
    for (let d = 0; d < 20; d++) {
      s.p5.gifts = {};
      for (let i = 0; i < GIFTS_PER_DAY; i++) lines.push(...giveGift(s, 'cunzhang', 'dajiangjunling').lines);
    }
    expect(favorOf(s, 'cunzhang')).toBe(FAVOR_MAX);
    expect(tierOf(favorOf(s, 'cunzhang'))).toBe(TIERS.length - 1);
    expect(lines.filter((l) => l.includes('回赠'))).toHaveLength(TIERS.length - 1);
    expect(s.player.silver).toBeGreaterThan(silver0);
  });
});

describe('奇遇', () => {
  it('城镇不触发，野外按概率触发并进冷却', () => {
    const s = fresh();
    s.location = Object.keys(locations).find((k) => locations[k].town)!;
    s.p5.journey.cooldown = 0;
    expect(rollJourney(s)).toBeNull();
    s.location = Object.keys(locations).find((k) => !locations[k].town && locations[k].groups.length)!;
    let hit = 0;
    for (let i = 0; i < 400; i++) {
      s.p5.journey.cooldown = 0;
      if (rollJourney(s)) hit++;
    }
    expect(hit).toBeGreaterThan(40);
    expect(hit).toBeLessThan(140);
    s.p5.journey.cooldown = 0;
    let ev = rollJourney(s);
    while (!ev) {
      s.p5.journey.cooldown = 0;
      ev = rollJourney(s);
    }
    expect(s.p5.journey.cooldown).toBeGreaterThan(0);
    expect(rollJourney(s)).toBeNull();
  });

  it('每个选项都能跑通，钱不够的选项是灰的', () => {
    const s = fresh();
    s.location = Object.keys(locations).find((k) => !locations[k].town && locations[k].groups.length)!;
    const seen = new Set<string>();
    for (let i = 0; i < 2000 && seen.size < 8; i++) {
      s.p5.journey.cooldown = 0;
      const ev = rollJourney(s);
      if (!ev) continue;
      seen.add(ev.id);
      for (const c of ev.choices) {
        if (c.disabled) continue;
        const copy = deserialize(serialize(s));
        const out = c.run(copy);
        expect(out.lines.length).toBeGreaterThan(0);
        expect(copy.player.silver).toBeGreaterThanOrEqual(0);
      }
    }
    expect(seen.size).toBeGreaterThanOrEqual(7);
    s.player.silver = 0;
    s.p5.journey.seen = {};
    for (let i = 0; i < 500; i++) {
      s.p5.journey.cooldown = 0;
      const ev = rollJourney(s);
      if (ev?.id === 'doctor') {
        expect(ev.choices[0].disabled).toBe(true);
        break;
      }
    }
  });
});

describe('存档迁移', () => {
  it('老存档补上 p5，分区名换成本州', () => {
    const s = fresh() as unknown as Record<string, unknown>;
    delete s.p5;
    s.server = '1区 许昌';
    const back = deserialize(JSON.stringify(s));
    expect(back.p5.favor).toEqual({});
    expect(back.server).toBe('豫州');
  });
});
