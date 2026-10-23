import { describe, expect, it } from 'vitest';
import {
  aiCommand, autoCommand, availableCommands, computeRewards, createBattle, emptyStatus, needsCommand,
  predictOrder, resolveRound,
} from '../src/core/battle';
import type { BUnit, Battle, Command } from '../src/core/battle';
import { emptyResists, expLevelMul } from '../src/core/formulas';

function mk(id: string, side: 'ally' | 'enemy', o: Partial<BUnit> = {}): BUnit {
  return {
    id, name: id, side, kind: side === 'ally' ? 'player' : 'monster', refId: id, classId: 'warrior', gender: 'male',
    look: 'thief', level: 5, row: 0, maxHp: 1000, hp: 1000, maxMp: 200, mp: 200, atk: 100, def: 0, spd: 10,
    resist: emptyResists(), rates: { crit: 0, counter: 0, fatal: 0, dodge: 0 }, skills: [], aiSkills: [],
    status: emptyStatus(), defending: false, alive: true, captured: false, historic: false, capturable: true,
    expYield: 50, silverYield: 10, monsterId: side === 'enemy' ? 'xiaotou' : undefined, profGain: {},
    ...o,
  };
}

function battle(allies: BUnit[], enemies: BUnit[], extra: Partial<Parameters<typeof createBattle>[0]> = {}): Battle {
  return createBattle({ seed: 42, allies, enemies, items: {}, title: 'test', ...extra });
}

const atk = (actor: string, target?: string): Command => ({ actor, type: 'attack', target });
const idle = (actor: string): Command => ({ actor, type: 'defend' });

describe('出手顺序', () => {
  it('速度高的先出手', () => {
    const a = mk('a', 'ally', { spd: 50 });
    const e = mk('e', 'enemy', { spd: 10 });
    const ev = resolveRound(battle([a], [e]), [atk('a', 'e'), atk('e', 'a')]);
    const acts = ev.filter((x) => x.t === 'act').map((x) => (x as { actor: string }).actor);
    expect(acts).toEqual(['a', 'e']);
  });

  it('预测顺序用于"速度第N"', () => {
    const b = battle([mk('a', 'ally', { spd: 5 })], [mk('e1', 'enemy', { spd: 30 }), mk('e2', 'enemy', { spd: 20 })]);
    expect(predictOrder(b).map((u) => u.id)).toEqual(['e1', 'e2', 'a']);
  });
});

describe('普攻', () => {
  it('伤害 = 攻击 ± 10% − 防御×0.6，防御减半', () => {
    const a = mk('a', 'ally', { atk: 100 });
    const e = mk('e', 'enemy', { def: 50 });
    const b = battle([a], [e]);
    resolveRound(b, [atk('a', 'e'), idle('e')]);
    const dmg = 1000 - e.hp;
    expect(dmg).toBeGreaterThanOrEqual(Math.round((90 - 30) * 0.5));
    expect(dmg).toBeLessThanOrEqual(Math.round((110 - 30) * 0.5));
  });

  it('躲避会飘"未中"', () => {
    const b = battle([mk('a', 'ally')], [mk('e', 'enemy', { rates: { crit: 0, counter: 0, fatal: 0, dodge: 100 } })]);
    const ev = resolveRound(b, [atk('a', 'e'), idle('e')]);
    expect(ev.some((x) => x.t === 'miss')).toBe(true);
  });

  it('前排没死光之前，普攻打不到后排', () => {
    const front = mk('f', 'enemy', { row: 0 });
    const back = mk('k', 'enemy', { row: 1 });
    const b = battle([mk('a', 'ally')], [front, back]);
    resolveRound(b, [atk('a', 'k'), idle('f'), idle('k')]);
    expect(back.hp).toBe(1000);
    expect(front.hp).toBeLessThan(1000);
  });

  it('武士自带的抗物理减伤', () => {
    const plain = mk('e1', 'enemy');
    const tough = mk('e2', 'enemy', { resist: { ...emptyResists(), phys: 100 } });
    const b1 = battle([mk('a', 'ally')], [plain]);
    const b2 = battle([mk('a', 'ally')], [tough]);
    resolveRound(b1, [atk('a', 'e1'), idle('e1')]);
    resolveRound(b2, [atk('a', 'e2'), idle('e2')]);
    expect(1000 - tough.hp).toBeCloseTo((1000 - plain.hp) / 2, -1);
  });
});

describe('中计状态', () => {
  it('封：跳过行动，不需要下指令', () => {
    const e = mk('e', 'enemy');
    e.status.seal = 1;
    const a = mk('a', 'ally');
    expect(needsCommand(e)).toBe(false);
    const b = battle([a], [e]);
    const ev = resolveRound(b, [idle('a'), atk('e', 'a')]);
    expect(a.hp).toBe(1000);
    expect(ev.some((x) => x.t === 'statusEnd' && x.status === 'seal')).toBe(true);
  });

  it('乱：随机攻击场上目标（可能打自己人），不能控制', () => {
    const e1 = mk('e1', 'enemy', { spd: 99 });
    const e2 = mk('e2', 'enemy', { spd: 1 });
    e1.status.chaos = 5;
    let hitFriend = false;
    for (let seed = 0; seed < 30 && !hitFriend; seed++) {
      const b = createBattle({ seed, allies: [mk('a', 'ally')], enemies: [{ ...e1, status: { ...e1.status } }, { ...e2 }], items: {}, title: '' });
      const ev = resolveRound(b, [idle('a'), idle('e2')]);
      hitFriend = ev.some((x) => x.t === 'damage' && x.target === 'e2');
    }
    expect(hitFriend).toBe(true);
  });

  it('围：不能普攻和放技能，能用道具；挨打就醒', () => {
    const a = mk('a', 'ally', { hp: 500 });
    a.status.trap = 3;
    const e = mk('e', 'enemy', { spd: 1 });
    const b = battle([a], [e], { items: { dieda: 2 } });
    const cmds = availableCommands(b, a);
    expect(cmds.attack).toBe(false);
    expect(cmds.skill).toBe(false);
    expect(cmds.item).toBe(true);
    resolveRound(b, [{ actor: 'a', type: 'item', item: 'dieda', target: 'a' }, atk('e', 'a')]);
    expect(b.itemsUsed.dieda).toBe(1);
    expect(a.status.trap).toBe(0); // 被打醒
  });

  it('控制技能按抗性降低命中，成功后换掉原来的状态', () => {
    const caster = mk('c', 'ally', { classId: 'scholar', spd: 99, skills: [{ id: 'simian', level: 5, prof: 30000 }] });
    const e = mk('e', 'enemy');
    e.status.chaos = 2;
    let sealed = 0;
    for (let seed = 0; seed < 40; seed++) {
      const t = { ...e, status: { ...e.status, poison: [] } };
      const b = createBattle({ seed, allies: [{ ...caster, mp: 200 }], enemies: [t], items: {}, title: '' });
      resolveRound(b, [{ actor: 'c', type: 'skill', skill: 'simian', target: 'e' }]);
      if (t.status.seal > 0) {
        sealed++;
        expect(t.status.chaos).toBe(0);
      }
    }
    expect(sealed).toBeGreaterThan(25);
  });

  it('暗渡陈仓让中计的队友恢复', () => {
    const c = mk('c', 'ally', { classId: 'scholar', spd: 99, skills: [{ id: 'andu', level: 5, prof: 30000 }] });
    const friend = mk('f', 'ally', { kind: 'general' });
    friend.status.seal = 3;
    const b = battle([c, friend], [mk('e', 'enemy')]);
    resolveRound(b, [{ actor: 'c', type: 'skill', skill: 'andu' }, idle('e')]);
    expect(friend.status.seal).toBe(0);
  });
});

describe('巫蛊极毒', () => {
  it('回合开始先结算、之后每回合是首回合的一半、可以叠加', () => {
    const c = mk('c', 'ally', { classId: 'mystic', spd: 99, skills: [{ id: 'wugu', level: 1, prof: 0 }] });
    const e = mk('e', 'enemy', { spd: 1 });
    const b = battle([c], [e]);
    const ev1 = resolveRound(b, [{ actor: 'c', type: 'skill', skill: 'wugu', target: 'e' }, idle('e')]);
    const first = (ev1.find((x) => x.t === 'damage' && x.target === 'e') as { amount: number }).amount;
    expect(e.status.poison).toHaveLength(1);
    const ev2 = resolveRound(b, [{ actor: 'c', type: 'skill', skill: 'wugu', target: 'e' }, idle('e')]);
    expect(ev2[1]).toMatchObject({ t: 'poison', target: 'e', amount: Math.round(first / 2) });
    expect(e.status.poison).toHaveLength(2);
    const ev3 = resolveRound(b, [idle('c'), idle('e')]);
    const tick = ev3.find((x) => x.t === 'poison') as { amount: number };
    expect(tick.amount).toBeGreaterThan(Math.round(first / 2));
  });
});

describe('技能', () => {
  it('精力不够放不出来', () => {
    const c = mk('c', 'ally', { mp: 0, skills: [{ id: 'wulei', level: 1, prof: 0 }] });
    const e = mk('e', 'enemy');
    const ev = resolveRound(battle([c], [e]), [{ actor: 'c', type: 'skill', skill: 'wulei', target: 'e' }, idle('e')]);
    expect(ev.some((x) => x.t === 'text' && x.text.includes('精力不足'))).toBe(true);
    expect(e.hp).toBe(1000);
  });

  it('呼风唤雨打全体、必中', () => {
    const c = mk('c', 'ally', { skills: [{ id: 'hufeng', level: 1, prof: 0 }] });
    const es = [0, 1, 2].map((i) => mk(`e${i}`, 'enemy', { rates: { crit: 0, counter: 0, fatal: 0, dodge: 100 } }));
    const ev = resolveRound(battle([c], es), [{ actor: 'c', type: 'skill', skill: 'hufeng' }, ...es.map((e) => idle(e.id))]);
    expect(ev.filter((x) => x.t === 'damage').length).toBe(3);
    expect(ev.some((x) => x.t === 'miss')).toBe(false);
  });

  it('舍命一击无视防御并自损', () => {
    const c = mk('c', 'ally', { skills: [{ id: 'sheming', level: 1, prof: 0 }] });
    const e = mk('e', 'enemy', { def: 10000 });
    e.status.seal = 1;
    resolveRound(battle([c], [e]), [{ actor: 'c', type: 'skill', skill: 'sheming', target: 'e' }]);
    expect(1000 - e.hp).toBe(180);
    expect(c.hp).toBe(1000 - 80);
  });

  it('固若金汤给全队加抗性，持续几个回合', () => {
    const c = mk('c', 'ally', { skills: [{ id: 'gujin', level: 1, prof: 0 }] });
    const f = mk('f', 'ally', { kind: 'general' });
    const b = battle([c, f], [mk('e', 'enemy')]);
    resolveRound(b, [{ actor: 'c', type: 'skill', skill: 'gujin' }, idle('f'), idle('e')]);
    expect(f.status.guard?.amount).toBe(20);
    for (let i = 0; i < 3; i++) resolveRound(b, [idle('c'), idle('f'), idle('e')]);
    expect(f.status.guard).toBeNull();
  });

  it('放技能涨熟练度', () => {
    const c = mk('c', 'ally', { skills: [{ id: 'wulei', level: 1, prof: 0 }] });
    const b = battle([c], [mk('e', 'enemy', { hp: 100000, maxHp: 100000 })]);
    resolveRound(b, [{ actor: 'c', type: 'skill', skill: 'wulei', target: 'e' }, idle('e')]);
    expect(c.profGain.wulei).toBe(30);
  });
});

describe('招降、招将、逃跑、防御', () => {
  it('历史名将不能招降', () => {
    const e = mk('e', 'enemy', { historic: true });
    const ev = resolveRound(battle([mk('a', 'ally')], [e]), [{ actor: 'a', type: 'capture', target: 'e' }, idle('e')]);
    expect(ev.some((x) => x.t === 'text' && x.text === '战斗中的历史副将不能招降')).toBe(true);
  });

  it('残血更容易招降，成功后目标离场、算胜利但不算击杀', () => {
    let ok = 0;
    for (let seed = 0; seed < 50; seed++) {
      const e = mk('e', 'enemy', { hp: 1 });
      const b = createBattle({ seed, allies: [mk('a', 'ally', { spd: 99 })], enemies: [e], items: {}, title: '' });
      resolveRound(b, [{ actor: 'a', type: 'capture', target: 'e' }, idle('e')]);
      if (e.captured) {
        ok++;
        expect(b.outcome).toBe('win');
        const r = computeRewards(b, () => 1, () => true, () => []);
        expect(r.kills.xiaotou).toBeUndefined();
        expect(r.captured).toHaveLength(1);
      }
    }
    expect(ok).toBeGreaterThan(30);
  });

  it('招将：换上后备副将', () => {
    const p = mk('p', 'ally', { spd: 99 });
    const g1 = mk('g1', 'ally', { kind: 'general' });
    const g2 = mk('g2', 'ally', { kind: 'general' });
    const b = createBattle({ seed: 1, allies: [p, g1], reserve: [g2], enemies: [mk('e', 'enemy')], items: {}, title: '' });
    expect(availableCommands(b, p).summon).toBe(true);
    resolveRound(b, [{ actor: 'p', type: 'summon', summon: 'g2' }, idle('g1'), idle('e')]);
    expect(b.units.map((u) => u.id)).toContain('g2');
    expect(b.units.map((u) => u.id)).not.toContain('g1');
    expect(b.reserve.map((u) => u.id)).toEqual(['g1']);
  });

  it('打头目时不能逃跑', () => {
    const b = battle([mk('a', 'ally')], [mk('e', 'enemy')], { canFlee: false });
    const ev = resolveRound(b, [{ actor: 'a', type: 'flee' }, idle('e')]);
    expect(b.outcome).toBeNull();
    expect(ev.some((x) => x.t === 'flee' && !x.ok)).toBe(true);
  });

  it('防御让本回合伤害减半', () => {
    const d = mk('d', 'ally', { spd: 1 });
    const n = mk('n', 'ally', { spd: 1 });
    const e1 = mk('e', 'enemy', { spd: 99 });
    const b1 = createBattle({ seed: 3, allies: [d], enemies: [e1], items: {}, title: '' });
    resolveRound(b1, [{ actor: 'd', type: 'defend' }, atk('e', 'd')]);
    const b2 = createBattle({ seed: 3, allies: [n], enemies: [{ ...e1, status: emptyStatus() }], items: {}, title: '' });
    resolveRound(b2, [atk('n'), atk('e', 'n')]);
    expect(1000 - d.hp).toBeCloseTo((1000 - n.hp) / 2, -1);
  });
});

describe('指令选择', () => {
  it('"自动"重复上一次的技能，精力不够就普攻', () => {
    const c = mk('c', 'ally', { skills: [{ id: 'wulei', level: 1, prof: 0 }] });
    const b = battle([c], [mk('e', 'enemy', { hp: 100000, maxHp: 100000 })]);
    resolveRound(b, [{ actor: 'c', type: 'skill', skill: 'wulei', target: 'e' }, idle('e')]);
    expect(autoCommand(b, c).type).toBe('skill');
    c.mp = 0;
    expect(autoCommand(b, c).type).toBe('attack');
  });

  it('怪物 AI 只会对活着的目标出手', () => {
    const a = mk('a', 'ally');
    const dead = mk('g', 'ally', { kind: 'general', alive: false, hp: 0 });
    const e = mk('e', 'enemy');
    const b = battle([a, dead], [e]);
    for (let i = 0; i < 20; i++) expect(aiCommand(b, e).target).toBe('a');
  });
});

describe('战后经验', () => {
  it('等级比怪物高太多，经验打折', () => {
    expect(expLevelMul(5, 5)).toBe(1);
    expect(expLevelMul(9, 5)).toBe(0.8);
    expect(expLevelMul(20, 5)).toBe(0.2);
  });
});

describe('计策中几个人', () => {
  it('技能练过 5 级还是按最后一档算，不会退回 1 个人', () => {
    for (const level of [5, 6, 9]) {
      const a = mk('a', 'ally', { spd: 50, skills: [{ id: 'chenhuo', level, prof: 99999 }] });
      const es = ['e1', 'e2', 'e3', 'e4'].map((id) => mk(id, 'enemy'));
      const ev = resolveRound(battle([a], es), [{ actor: 'a', type: 'skill', skill: 'chenhuo', target: 'e1' }, ...es.map((e) => idle(e.id))]);
      expect(ev.filter((x) => x.t === 'status').length, `level ${level}`).toBe(3);
    }
  });
});
