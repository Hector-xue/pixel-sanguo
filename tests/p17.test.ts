// 0.1.4：职业平衡、技能成长、主线剧情、功能逐级开放……
import { describe, expect, it } from 'vitest';
import { afterGz, attackTargets, gzAlert, gzAlertPower, gzBattle, joinNation, syncWorld } from '../src/game/guozhan';
import type { Save } from '../src/game/state';
import { advancedSkills, skills as SK, systems } from '../src/data';
import { createBattle, emptyStatus, resolveRound } from '../src/core/battle';
import type { BUnit, Battle } from '../src/core/battle';
import { chooseXinfa, xinfaCost, xinfaKey, xinfaReason } from '../src/game/growth';
import { rebirth } from '../src/game/rebirth';
import { MAIN_QV, acceptQuest, currentQuest, learnSkill, migrateMain, newSave, skillSchool, turnInQuest } from '../src/game/state';
import { afterDuel, choiceOf, duelBattle, duelReason, epilogue, taofaBattle, taofaReason } from '../src/game/story';
import { mainQuests } from '../src/data';
import { UNLOCKS, isUnlocked, markUnlocked, nextUnlock, pendingUnlocks } from '../src/game/unlocks';
import { playerUnit } from '../src/game/encounter';
import { autoplay } from '../src/sim/autoplay';
import { heroLook, heroVariantOf } from '../src/art/units';
import { WEEK_PICKS, claimWeek, claimWeekBonus, recordLines, weekRows, weekState } from '../src/game/weekly';

const A = systems.guozhan.player.alert;

function hero(level = 80, seed = 5): Save {
  const s = newSave({ server: '1区', name: '测试', gender: 'male', classId: 'warrior', avatar: 0, seed });
  s.player.level = level;
  return s;
}

describe('国战敌军戒备', () => {
  it('老存档没有戒备，按 0 算；戒备越高敌军越强', () => {
    const s = hero();
    joinNation(s, 'wei', 0);
    expect(gzAlert(s)).toBe(0);
    expect(gzAlertPower(s)).toBe(1);
    const id = attackTargets(s, syncWorld(s))[0];
    const b0 = gzBattle(s, id, 'atk', 7) as Battle;
    s.p4.streak = 10;
    const b1 = gzBattle(s, id, 'atk', 7) as Battle;
    const hp = (b: Battle) => b.units.filter((u) => u.side === 'enemy').reduce((n, u) => n + u.maxHp, 0);
    expect(hp(b1)).toBeGreaterThan(hp(b0) * (1 + 10 * A.per) * 0.95);
    s.p4.streak = 999;
    expect(gzAlert(s)).toBe(A.cap);
  });

  it('赢一仗 +1、战功按戒备多给；输一仗减几点、不低于 0', () => {
    const s = hero();
    joinNation(s, 'wei', 0);
    const id = attackTargets(s, syncWorld(s))[0];
    const b = gzBattle(s, id, 'atk', 7) as Battle;
    b.outcome = 'win';
    s.p4.streak = 10;
    const m0 = s.p4.merit;
    afterGz(s, b);
    expect(s.p4.streak).toBe(11);
    expect(s.p4.merit - m0).toBe(Math.round(systems.guozhan.player.meritAtk * (1 + 10 * A.meritPer)));
    b.outcome = 'lose';
    afterGz(s, b);
    expect(s.p4.streak).toBe(11 - A.lossDrop);
    s.p4.streak = 1;
    afterGz(s, b);
    expect(s.p4.streak).toBe(0);
    b.outcome = 'fled';
    s.p4.streak = 5;
    afterGz(s, b);
    expect(s.p4.streak).toBe(5);
  });
});

describe('主角成长：进阶招式、心法', () => {
  it('男女武士 30 级专属不一样；学会直接 3 级，100 级绝学 5 级', () => {
    expect(advancedSkills('warrior', 'male')[0]).not.toBe(advancedSkills('warrior', 'female')[0]);
    const s = hero(29);
    expect(skillSchool(s).find((r) => r.id === 'hengsao')?.action).toBeNull();
    s.player.level = 30;
    learnSkill(s, 'hengsao');
    expect(s.player.skills.find((x) => x.id === 'hengsao')?.level).toBe(3);
    s.player.level = 100;
    learnSkill(s, 'wanfu');
    expect(s.player.skills.find((x) => x.id === 'wanfu')?.level).toBe(5);
  });

  it('心法头一回免费，改修花银两；战斗里挂在主角身上；转职成「·极」并换成新职业同位置那门', () => {
    const s = hero(59);
    expect(xinfaReason(s, 'xf_xuezhan')).toContain('60级');
    s.player.level = 100;
    expect(xinfaCost(s)).toBe(0);
    chooseXinfa(s, 'xf_xuezhan');
    expect(playerUnit(s).passive).toBe('xf_xuezhan');
    s.player.silver = 0;
    expect(xinfaReason(s, 'xf_tiebi')).toContain('银两');
    s.player.silver = xinfaCost(s);
    chooseXinfa(s, 'xf_tiebi');
    expect(s.player.silver).toBe(0);
    learnSkill(s, 'hengsao');
    rebirth(s, 'mystic', 'female', 0);
    expect(s.player.xinfa).toBe('xf_guidao');
    expect(xinfaKey(s)).toBe('xf_guidao_ji');
    // 30 级专属按位置换成新职业新性别的那个
    expect(s.player.skills.some((x) => x.id === 'mihun')).toBe(true);
  });
});

function u(id: string, side: 'ally' | 'enemy', over: Partial<BUnit> = {}): BUnit {
  return {
    id, name: id, side, kind: side === 'ally' ? 'player' : 'monster', refId: id, classId: 'warrior', gender: 'male', look: 'x', level: 50, row: 0,
    maxHp: 1000, hp: 1000, maxMp: 500, mp: 500, atk: 200, def: 50, spd: side === 'ally' ? 100 : 10,
    resist: { phys: 0, chaos: 0, seal: 0, trap: 0, thunder: 0, fire: 0, wind: 0, poison: 0, mystic: 0 },
    rates: { crit: 0, fatal: 0, dodge: 0, counter: 0, hit: 100 } as BUnit['rates'],
    skills: [], aiSkills: [], status: emptyStatus(), defending: false, alive: true, captured: false, historic: false, capturable: false,
    expYield: 0, silverYield: 0, profGain: {}, ...over,
  };
}

describe('新招式结算', () => {
  const cast = (skill: string, allies: BUnit[], foes: BUnit[], target?: string) => {
    allies[0].skills = [{ id: skill, level: 3, prof: 0 }];
    const b = createBattle({ seed: 1, allies, enemies: foes, items: {}, title: 't', canFlee: true });
    const ev = resolveRound(b, [{ actor: allies[0].id, type: 'skill', skill, target }, ...foes.map((f) => ({ actor: f.id, type: 'defend' as const }))]);
    return { b, ev };
  };
  it('横扫打全体，凤舞连打三下', () => {
    const foes = [u('e1', 'enemy'), u('e2', 'enemy'), u('e3', 'enemy')];
    const { ev } = cast('hengsao', [u('p', 'ally')], foes);
    expect(new Set(ev.filter((e) => e.t === 'damage').map((e) => (e as { target: string }).target)).size).toBe(3);
    const r = cast('fengwu', [u('p', 'ally')], [u('e1', 'enemy')], 'e1');
    expect(r.ev.filter((e) => e.t === 'damage').length).toBe(SK.fengwu.hits);
  });
  it('回血不超上限、妙手回春解控；鼓舞加攻；吸星吸血', () => {
    const a = u('p', 'ally', { hp: 100 });
    const g = u('g', 'ally', { hp: 900, kind: 'general' });
    g.status.chaos = 2;
    const { ev } = cast('miaoshou', [a, g], [u('e1', 'enemy')]);
    expect(a.hp).toBeGreaterThan(100);
    expect(g.hp).toBeLessThanOrEqual(g.maxHp);
    expect(g.status.chaos).toBe(0);
    expect(ev.some((e) => e.t === 'statusEnd')).toBe(true);
    const r = u('p', 'ally');
    cast('wanfu', [r], [u('e1', 'enemy')]);
    expect(r.status.rally?.v).toBeGreaterThan(0.2);
    const d = u('p', 'ally', { hp: 500 });
    cast('xixing', [d], [u('e1', 'enemy')], 'e1');
    expect(d.hp).toBeGreaterThan(500);
  });
});

const stepOf = (id: string) => mainQuests.findIndex((q) => q.id === id);

describe('主线剧情：抉择、名将战、讨伐战', () => {
  it('老存档（qv3）换算：新插的任务跳过，原来在做的还是那个', () => {
    const s = hero(100);
    const oldIds = mainQuests.filter((q) => !/a$/.test(q.id) || ['m7a', 'm7b', 'm8a', 'm15a', 'm10a'].includes(q.id)).map((q) => q.id);
    s.main = { step: oldIds.indexOf('m75'), state: 'active', count: 0, qv: 3 };
    migrateMain(s);
    expect(currentQuest(s)?.id).toBe('m75');
    expect(s.main.qv).toBe(MAIN_QV);
  });

  it('抉择：两个选项奖励不同，记下选了哪个，结尾回顾说起', () => {
    const s = hero(53);
    s.main = { step: stepOf('m44a'), state: 'available', count: 0, qv: MAIN_QV };
    acceptQuest(s);
    const silver = s.player.silver;
    const r = turnInQuest(s, 1)!;
    expect(r.silver).toBeGreaterThan(mainQuests[stepOf('m44a')].reward.silver!);
    expect(s.player.silver - silver).toBe(r.silver);
    expect(choiceOf(s, 'm44a')).toBe(1);
    expect(epilogue(s).some((l) => l.text.includes('剿匪'))).toBe(true);
  });

  it('名将战：到了地方才能挑战，按切磋算，赢了任务完成', () => {
    const s = hero(60);
    s.main = { step: stepOf('m49a'), state: 'available', count: 0, qv: MAIN_QV };
    acceptQuest(s);
    s.location = 'chenliu';
    expect(duelReason(s)).toContain('先锋三营');
    s.location = 'xianfeng3';
    const b = duelBattle(s, 3) as Battle;
    expect(b.spar).toBe(true);
    expect(b.units.find((u) => u.side === 'enemy')?.name).toBe('夏侯惇');
    b.outcome = 'lose';
    afterDuel(s, b);
    expect(s.main.state).toBe('active');
    b.outcome = 'win';
    afterDuel(s, b);
    expect(s.main.state).toBe('ready');
  });

  it('讨伐战：打怪任务到了地方、还差不少时能打，一拨 5 个', () => {
    const s = hero(55);
    s.main = { step: stepOf('m45'), state: 'available', count: 0, qv: MAIN_QV };
    acceptQuest(s);
    expect(taofaReason(s)).not.toBe('');
    s.location = currentQuest(s)!.target!.at;
    expect(taofaReason(s)).toBe('');
    const b = taofaBattle(s, 5) as Battle;
    expect(b.tag).toBe('taofa');
    expect(b.units.filter((u) => u.side === 'enemy').length).toBe(5);
    s.main.count = questNeedOf('m45') - 2;
    expect(taofaReason(s)).toContain('只差');
  });
});

function questNeedOf(id: string): number {
  return mainQuests[stepOf(id)].target!.count;
}

describe('功能逐级开放', () => {
  it('老存档第一次进来不补演；之后升级跨过门槛才演，演过不再演', () => {
    const s = hero(70);
    expect(pendingUnlocks(s)).toEqual([]);
    expect(isUnlocked(s, '国战')).toBe(true);
    const n = hero(1);
    expect(pendingUnlocks(n)).toEqual([]);
    expect(isUnlocked(n, '阵法')).toBe(false);
    expect(nextUnlock(n)?.key).toBe('阵法');
    n.player.level = 10;
    expect(pendingUnlocks(n).map((u) => u.key)).toEqual(['阵法', '排行', '宝库']);
    markUnlocked(n, '阵法');
    expect(pendingUnlocks(n).map((u) => u.key)).toEqual(['排行', '宝库']);
  });

  it('每样都在主线第一次要用到它之前开放（真跑一遍：接到任务时等级已经够了）', () => {
    const need: Record<string, string> = { m15a: '阵法', m38: '帮派', m43: '擂台', m56: '训练' };
    const s = hero(1, 9);
    const rep = autoplay(s, 9, 6000, stepOf('m57'));
    for (const [id, key] of Object.entries(need)) {
      // 交上一个任务时的等级 = 接到这个任务时的等级
      const prev = mainQuests[stepOf(id) - 1];
      const at = rep.steps.find((x) => x.quest === prev.title)!;
      expect(at.level, `${id} ${key}`).toBeGreaterThanOrEqual(UNLOCKS.find((u) => u.key === key)!.lv);
    }
  }, 120000);
});

describe('头像 4～6', () => {
  it('前三个头像的编号和样子都不变（老角色、老录像不换脸），后三个从 9 起', () => {
    for (let a = 0; a < 3; a++) for (let k = 0; k < 3; k++) expect(heroVariantOf(a, k)).toBe(a + 3 * k);
    expect(heroVariantOf(3, 0)).toBe(9);
    expect(heroVariantOf(5, 2)).toBe(17);
    expect(heroLook('warrior', 'male', 9).beardStyle).toBe('full');
    expect(heroLook('warrior', 'male', 0).beardStyle).toBeUndefined();
    // 造型（时装）照样叠在新头像上
    expect(heroLook('warrior', 'male', heroVariantOf(3, 1)).outfit).toEqual(heroLook('warrior', 'male', 3).outfit);
    expect(heroLook('warrior', 'male', heroVariantOf(4, 1)).scar).toBe(true);
  });
});

describe('本周军功簿', () => {
  it('换周重挑四件、第一件是打赢；进度按换周时记的底算；领完四件才能领全满奖', () => {
    const s = hero(85);
    const w = weekState(s);
    expect(w.keys.length).toBe(WEEK_PICKS);
    expect(w.keys[0]).toBe('win');
    expect(weekState(s)).toBe(w);
    s.life.wins = (s.life.wins ?? 0) + 59;
    expect(weekRows(s)[0].done).toBe(59);
    expect(claimWeek(s, 'win')).toContain('还差1');
    s.life.wins += 5;
    const silver = s.player.silver;
    claimWeek(s, 'win');
    expect(s.player.silver).toBeGreaterThan(silver);
    expect(claimWeek(s, 'win')).toContain('领过');
    expect(claimWeekBonus(s)).toContain('四件');
    // 天下历过了一周：换一批、从零算
    s.battles += 7 * 18;
    const w2 = weekState(s);
    expect(w2.idx).toBe(w.idx + 1);
    expect(weekRows(s)[0].done).toBe(0);
  });

  it('做不了的不挑（没入国就没有国战那件）', () => {
    const s = hero(85);
    for (let k = 0; k < 20; k++) {
      s.battles += 7 * 18;
      expect(weekState(s).keys).not.toContain('gz');
    }
  });

  it('战绩总账能算出来', () => {
    const s = hero(30);
    expect(recordLines(s).length).toBeGreaterThan(8);
  });
});
