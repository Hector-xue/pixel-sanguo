// 生活技能：采集（地形、存量、按步数恢复、好坏决定收成）、升级、烹饪、药膳加成和场次
import { describe, expect, it } from 'vitest';
import { arrive, deserialize, newSave, serialize } from '../src/game/state';
import { RECIPES, SPOT_SIZE, cook, eatFeast, feastBonus, feastTick, gather, lifeNeed, spotKind, spotLeft } from '../src/game/life';
import { playerUnit } from '../src/game/encounter';
import { items, locations } from '../src/data';

const fresh = () => newSave({ server: '豫州', name: '测试', gender: 'male', classId: 'warrior', avatar: 0, seed: 7 });
const find = (art: string) => Object.keys(locations).find((k) => !locations[k].town && locations[k].art === art)!;

describe('采集', () => {
  it('看地形：河边钓鱼、山洞采矿、树林采药，城镇没有', () => {
    expect(spotKind(find('river'))).toBe('fish');
    expect(spotKind(find('cave'))).toBe('mine');
    expect(spotKind(find('forest'))).toBe('herb');
    expect(spotKind('xinshoucun')).toBeNull();
  });

  it('打中有收成、没打中空手；一处挖几次就空，多走几步恢复', () => {
    const s = fresh();
    const loc = find('river');
    s.location = loc;
    const miss = gather(s, 'fish', [0]);
    expect(miss.got.length).toBe(0);
    const hit = gather(s, 'fish', [2]);
    expect(hit.got.length).toBeGreaterThan(0);
    expect(items[hit.got[0].id].name).toMatch(/鱼|鲤/);
    gather(s, 'fish', [1]);
    gather(s, 'fish', [1]);
    expect(spotLeft(s, loc)).toBe(0);
    expect(gather(s, 'fish', [2]).ok).toBe(false);
    for (let i = 0; i < 3; i++) arrive(s, 'xinshoucun');
    s.location = loc;
    expect(spotLeft(s, loc)).toBe(1);
    expect(spotLeft(s, find('cave'))).toBe(SPOT_SIZE);
  });

  it('采矿三锤，给当地档次的矿石；越练等级越高', () => {
    const s = fresh();
    s.location = find('cave');
    const before = s.p5.life.lv.mine;
    let got = 0;
    for (let i = 0; i < 40; i++) {
      s.p5.life.spots = {};
      s.bag = {};
      const r = gather(s, 'mine', [2, 2, 2]);
      got += r.got.length;
    }
    expect(got).toBeGreaterThanOrEqual(40);
    expect(s.p5.life.lv.mine).toBeGreaterThan(before);
    expect(lifeNeed(2)).toBeGreaterThan(lifeNeed(1));
  });
});

describe('烹饪与药膳', () => {
  it('城镇里才能做；等级不够做不了；材料够才做', () => {
    const s = fresh();
    s.location = find('river');
    s.bag.yu_ji = 1;
    expect(cook(s, 'cai_kaoyu')).toContain('城镇');
    s.location = 'xinshoucun';
    expect(cook(s, 'cai_yutang')).toContain('级才会做');
    expect(cook(s, 'cai_kaoyu')).toContain('烤鲫鱼');
    expect(s.bag.yu_ji ?? 0).toBe(0);
    expect(s.bag.cai_kaoyu).toBeGreaterThanOrEqual(1);
    expect(cook(s, 'cai_kaoyu')).toContain('材料不够');
    expect(RECIPES.every((r) => items[r.id] && Object.keys(r.need).every((id) => items[id]))).toBe(true);
  });

  it('药膳给主角加攻防，打满场数就没了', () => {
    const s = fresh();
    const atk0 = playerUnit(s).atk;
    s.bag.cai_yaoshan = 1;
    expect(eatFeast(s, 'cai_yaoshan')).toContain('5场');
    expect(feastBonus(s).atk).toBeCloseTo(0.08);
    expect(playerUnit(s).atk).toBeGreaterThan(atk0);
    expect(s.p5.life.feast?.left).toBe(5);
    for (let i = 0; i < 4; i++) expect(feastTick(s)).toBeNull();
    expect(feastTick(s)).toContain('劲头过去');
    expect(feastBonus(s).atk).toBe(0);
    expect(playerUnit(s).atk).toBe(atk0);
  });

  it('老存档补上生活技能', () => {
    const s = fresh() as unknown as { p5: Record<string, unknown> };
    delete s.p5.life;
    const back = deserialize(serialize(s as never));
    expect(back.p5.life.lv.fish).toBe(1);
    expect(back.p5.life.spots).toEqual({});
  });
});
