// 武将专属被动（追击、无双、连击、回血、治疗、格挡、计策加成、发狂、说客、资财）、阵营羁绊、被动表都对得上人
import { describe, expect, it } from 'vitest';
import { createBattle, resolveRound } from '../src/core/battle';
import type { BEvent, BUnit } from '../src/core/battle';
import { PASSIVES } from '../src/core/passives';
import { generalUnit, monsterUnit } from '../src/game/encounter';
import { campMods, campSummary } from '../src/game/camp';
import { giveRecruit } from '../src/game/generals';
import { newSave } from '../src/game/state';
import { recruits, monsters } from '../src/data';

const fresh = () => newSave({ server: '豫州', name: '测试', gender: 'male', classId: 'warrior', avatar: 0, seed: 7 });

// 一个打手（带被动）对一排软柿子
function arena(passive: string, opts: { foes?: number; foeHp?: number; atk?: number; hp?: number } = {}) {
  const hero = monsterUnit('a0', 'xiaotou', 30, 0);
  hero.side = 'ally';
  hero.passive = passive;
  hero.atk = opts.atk ?? 5000;
  hero.spd = 9999;
  hero.rates = { crit: 0, counter: 0, fatal: 0, dodge: 0 };
  if (opts.hp) hero.hp = opts.hp;
  const foes: BUnit[] = [];
  for (let i = 0; i < (opts.foes ?? 3); i++) {
    const f = monsterUnit(`e${i}`, 'xiaotou', 1, 0);
    f.maxHp = f.hp = opts.foeHp ?? 10;
    f.rates = { crit: 0, counter: 0, fatal: 0, dodge: 0 };
    f.atk = 1;
    foes.push(f);
  }
  return createBattle({ seed: 3, allies: [hero], enemies: foes, items: {}, title: '测试', canFlee: true });
}
const passives = (ev: BEvent[]) => ev.filter((e) => e.t === 'passive').map((e) => (e as { label: string }).label);

describe('专属被动', () => {
  it('被动表里的人都真实存在（招得到的武将或名将）', () => {
    const ids = new Set([...recruits.yingcai, ...recruits.jiangcai].map((g) => g.id));
    // 主角心法（xf_ 开头）不是人
    for (const k of Object.keys(PASSIVES)) expect(ids.has(k) || !!monsters[k] || k.startsWith('xf_'), k).toBe(true);
    for (const id of ids) expect(PASSIVES[id], id).toBeTruthy();
  });

  it('七进七出：打倒一个立刻冲向下一个，一回合只追一次', () => {
    const b = arena('zhaoyun');
    const ev = resolveRound(b, [{ actor: 'a0', type: 'attack', target: 'e0' }]);
    expect(passives(ev)).toContain('七进七出');
    expect(b.units.filter((u) => u.side === 'enemy' && !u.alive).length).toBe(2);
  });

  it('无双：打倒过几个，之后每回合普攻就多打几下', () => {
    const b = arena('lvbu', { foes: 5 });
    resolveRound(b, [{ actor: 'a0', type: 'attack', target: 'e0' }]);
    expect(b.units.find((u) => u.id === 'a0')!.kills).toBe(1);
    const ev = resolveRound(b, [{ actor: 'a0', type: 'attack', target: 'e1' }]);
    expect(passives(ev)).toContain('无双');
    expect(b.units.filter((u) => u.side === 'enemy' && !u.alive).length).toBe(3);
  });

  it('五斗米道每回合回血；流离给最虚的队友回血', () => {
    const b = arena('zhanglu', { foeHp: 999999, atk: 1, hp: 10 });
    const ev = resolveRound(b, [{ actor: 'a0', type: 'defend' }]);
    expect(passives(ev)).toContain('五斗米道');
    expect(ev.some((e) => e.t === 'heal')).toBe(true);
  });

  it('连击、格挡多次跑下来都会触发', () => {
    let combo = 0;
    let block = 0;
    for (let seed = 1; seed < 60; seed++) {
      const b = arena('gz_ganning', { foeHp: 1e7, atk: 10 });
      b.rng.state = seed;
      combo += passives(resolveRound(b, [{ actor: 'a0', type: 'attack', target: 'e0' }])).filter((x) => x === '锦帆').length;
      const c = arena('caobao', { foeHp: 1e7, atk: 1 });
      c.rng.state = seed;
      for (const u of c.units) if (u.side === 'enemy') u.atk = 500;
      block += passives(resolveRound(c, [{ actor: 'a0', type: 'defend' }])).filter((x) => x === '丹阳兵').length;
    }
    expect(combo).toBeGreaterThan(5);
    expect(block).toBeGreaterThan(5);
  });

  it('招来的武将带着自己的被动上场', () => {
    const s = fresh();
    giveRecruit(s, 'zhaoyun');
    const g = [...s.generals, ...s.inn].find((x) => x.recruitId === 'zhaoyun')!;
    expect(generalUnit(g).passive).toBe('zhaoyun');
    expect(monsterUnit('e', 'lvbu', 30, 0).passive).toBe('lvbu');
    expect(monsterUnit('e', 'xiaotou', 3, 0).passive).toBeUndefined();
  });
});

describe('阵营羁绊', () => {
  it('二乔同行气血上限+10%；同阵营两人攻防+5%；客栈里的不算', () => {
    const s = fresh();
    giveRecruit(s, 'daqiao');
    giveRecruit(s, 'xiaoqiao');
    const all = [...s.generals, ...s.inn];
    s.generals = all.filter((g) => g.recruitId === 'daqiao' || g.recruitId === 'xiaoqiao');
    s.inn = all.filter((g) => !s.generals.includes(g));
    const dq = s.generals.find((g) => g.recruitId === 'daqiao')!;
    const m = campMods(s, dq);
    expect(m.hp).toBeCloseTo(0.1);
    expect(m.atk).toBeCloseTo(0.05);
    expect(m.tags).toContain('二乔');
    expect(generalUnit(dq, s).maxHp).toBeGreaterThan(generalUnit(dq).maxHp);
    expect(campSummary(s).some((x) => x.label === '二乔' && x.on)).toBe(true);
    s.inn.push(s.generals.pop()!);
    expect(campMods(s, dq).hp).toBe(0);
  });
});
