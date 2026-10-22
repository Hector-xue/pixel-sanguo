import { mainQuests } from '../src/data';
import { describe, expect, it } from 'vitest';
import { expToNext } from '../src/core/formulas';
import {
  acceptQuest, addItem, allocate, bagCap, bagUsed, currentQuest, findPath, grantPlayerExp, learnSkill, newSave,
  npcMark, playerStats, quickRecover, skillSchool, turnInQuest, upgradeSkill, deserialize, serialize, buy, heal, healCost,
} from '../src/game/state';
import { autoplay } from '../src/sim/autoplay';
import type { ClassId, Gender } from '../src/core/types';

const fresh = (classId: ClassId = 'warrior', gender: Gender = 'male') =>
  newSave({ server: '1区', name: '测试', gender, classId, avatar: 0, seed: 1 });

describe('角色', () => {
  it('武士天生20点抗物理，开局满血满精力', () => {
    const s = fresh();
    const st = playerStats(s);
    expect(st.resist.phys).toBe(20);
    expect(s.player.hp).toBe(st.maxHp);
    expect(s.player.mp).toBe(st.maxMp);
  });

  it('升级给属性点并回满', () => {
    const s = fresh();
    s.player.hp = 1;
    const lines = grantPlayerExp(s, expToNext(1));
    expect(s.player.level).toBe(2);
    expect(s.player.free).toBe(4);
    expect(s.player.hp).toBe(playerStats(s).maxHp);
    expect(lines[0]).toContain('2级');
  });

  it('加点不能超过剩余点数', () => {
    const s = fresh();
    grantPlayerExp(s, expToNext(1));
    expect(allocate(s, { con: 5, str: 0, int: 0, agi: 0 })).toBe(false);
    const before = playerStats(s).maxHp;
    expect(allocate(s, { con: 4, str: 0, int: 0, agi: 0 })).toBe(true);
    expect(playerStats(s).maxHp).toBe(before + 32);
    expect(s.player.free).toBe(0);
  });
});

describe('技能学校', () => {
  it('只教本职业本性别的三个技能，按等级开放', () => {
    const s = fresh('scholar', 'female');
    const rows = skillSchool(s);
    expect(rows.map((r) => r.name)).toEqual(['四面楚歌', '画地为牢', '暗渡陈仓']);
    expect(rows.map((r) => r.action)).toEqual(['learn', null, null]);
  });

  it('熟练度够了手动升级，熟练度不清零', () => {
    const s = fresh('mystic');
    learnSkill(s, 'wulei');
    const st = s.player.skills[0];
    expect(upgradeSkill(s, 'wulei')).toContain('熟练度');
    st.prof = 6000;
    s.player.level = 10;
    expect(upgradeSkill(s, 'wulei')).toContain('2级');
    expect(st.prof).toBe(6000);
  });
});

describe('背包与医馆', () => {
  it('负重满了放不下', () => {
    const s = fresh();
    const cap = bagCap(s);
    expect(addItem(s, 'dieda', cap + 3)).toBe(3);
    expect(bagUsed(s)).toBe(cap);
    expect(addItem(s, 'yaocai', 2)).toBe(0); // 任务物品不占负重
  });

  it('10级前治疗免费', () => {
    const s = fresh();
    s.player.hp = 1;
    expect(healCost(s)).toBe(0);
    heal(s);
    expect(s.player.hp).toBe(playerStats(s).maxHp);
  });

  it('买药扣银两，快速恢复先用小药', () => {
    const s = fresh();
    s.player.silver = 100;
    expect(buy(s, 'dieda', 3)).toContain('30两');
    s.player.hp -= 100;
    quickRecover(s);
    expect(s.bag.dieda).toBe(1);
  });
});

describe('主线任务', () => {
  it('接任务 → NPC 标记 → 交任务拿奖励', () => {
    const s = fresh();
    expect(npcMark(s, 'daohang')).toBe('!');
    acceptQuest(s);
    expect(npcMark(s, 'cunzhang')).toBe('?');
    const r = turnInQuest(s);
    expect(r?.silver).toBe(100);
    expect(s.bag.dieda).toBe(3);
    expect(currentQuest(s)?.id).toBe('m1');
  });

  it('所有任务地点都能走到', () => {
    expect(findPath('xinshoucun', 'shanzeiyingzhai')).toEqual(['xinshoucun', 'cunbei', 'cuizhushanzhuang', 'cuizhushangu', 'shanzeidamen', 'shanzeiyingzhai']);
    expect(findPath('xinshoucun', 'xiapizhilu')).toEqual(['xinshoucun', 'cunnan', 'xiapizhilu']);
  });

  it('存档可以导出再导入', () => {
    const s = fresh();
    s.player.silver = 123;
    expect(deserialize(serialize(s)).player.silver).toBe(123);
  });
});

describe('自动通关模拟', () => {
  for (const classId of ['warrior', 'scholar', 'mystic'] as ClassId[]) {
    for (const gender of ['male', 'female'] as Gender[]) {
      it(`${classId}/${gender} 能打通新手主线`, () => {
        const s = fresh(classId, gender);
        const rep = autoplay(s, 11, 600, mainQuests.findIndex((q) => q.id === 'm13'));
        console.log(classId, gender, JSON.stringify({ battles: rep.battles, wins: rep.wins, losses: rep.losses, level: rep.level, generals: rep.generals }));
        expect(rep.finished).toBe(true);
        expect(rep.generals).toBeGreaterThanOrEqual(1);
        expect(rep.level).toBeGreaterThanOrEqual(10);
        expect(rep.battles).toBeLessThan(250);
      });
    }
  }
});

describe('新手手感', () => {
  for (const classId of ['warrior', 'scholar', 'mystic'] as ClassId[]) {
    it(`${classId} 1级开自动、不吃药，打2只2级小偷胜率 ≥ 80%`, async () => {
      const { monsterUnit, playerUnit } = await import('../src/game/encounter');
      const { createBattle, resolveRound, living, needsCommand, aiCommand, autoCommand } = await import('../src/core/battle');
      let wins = 0;
      for (let seed = 0; seed < 100; seed++) {
        const s = fresh(classId);
        const b = createBattle({ seed, allies: [playerUnit(s)], enemies: [monsterUnit('e0', 'xiaotou', 2, 0), monsterUnit('e1', 'xiaotou', 2, 0)], items: {}, title: '' });
        for (let r = 0; r < 60 && !b.outcome; r++) {
          resolveRound(b, living(b).filter(needsCommand).map((u) => (u.side === 'enemy' ? aiCommand(b, u) : autoCommand(b, u))));
        }
        if (b.outcome === 'win') wins++;
      }
      console.log(classId, 'win%', wins);
      expect(wins).toBeGreaterThanOrEqual(80);
    });
  }
});
