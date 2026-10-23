import { describe, expect, it } from 'vitest';
import { balance, equips, items, locations, mainQuests, monsters, systems } from '../src/data';
import { createBattle, aiCommand, autoCommand, living, needsCommand, resolveRound } from '../src/core/battle';
import type { Battle } from '../src/core/battle';
import type { ClassId, Gender } from '../src/core/types';
import { arenaBattle, challengers, evilNow, fightsLeft, ladder } from '../src/game/arena';
import { DAY_BATTLES, calTick, today } from '../src/game/calendar';
import { board, checkAchievements, setTitle } from '../src/game/achv';
import { finishBattle, startBattle } from '../src/game/encounter';
import {
  answerWenqu, claimFestival, festivalExpMul, festivalToday, luckyDraw, takeSilverRing, treasureBattle, treasureLeft, treasureNow,
  turnInSilverRing, wenquToday,
} from '../src/game/events';
import { canRebirth, generalRebirth, rebirth } from '../src/game/rebirth';
import { nextRing, turnInRing } from '../src/game/ring';
import { joinSect, sectTaskDone, takeSectTask, turnInSect } from '../src/game/sect';
import { giveGift, hireMerc, marry, swear, swornReason } from '../src/game/social';
import { collectStall, putOnStall, settleStall } from '../src/game/stall';
import { ORE_CHAIN } from '../src/game/smith';
import {
  addItem, arrive, bagCount, deserialize, setActive, grantPlayerExp, levelCap, makeGeneral, addGeneral, newSave, playerStats, questDropAllowed, serialize,
  skillSchool, upgradeSkill,
} from '../src/game/state';
import type { Save } from '../src/game/state';
import { TRAIN_SHARE, setTrainee, trainAfterBattle } from '../src/game/training';
import { expandVault, vaultStore, vaultTake } from '../src/game/town';
import { oreFor } from '../src/game/welfare';
import { Rng } from '../src/core/rng';
import { autoplay } from '../src/sim/autoplay';

const fresh = (classId: ClassId = 'warrior', gender: Gender = 'male') => newSave({ server: '1区', name: '测试', gender, classId, avatar: 0, seed: 5 });
const T0 = Date.UTC(2026, 2, 10, 4);
const HOUR = 3600000;

// 本地时区的某一天某个钟点
const at = (y: number, m: number, d: number, h: number, min = 0) => new Date(y, m - 1, d, h, min).getTime();

function lvl(s: Save, level: number): void {
  s.player.level = level;
  s.player.exp = 0;
}

function run(b: Battle): void {
  for (let r = 0; r < 100 && !b.outcome; r++) {
    const cmds = living(b).filter(needsCommand).map((u) => (u.side === 'enemy' ? aiCommand(b, u) : autoCommand(b, u)));
    resolveRound(b, cmds);
  }
}

describe('P3 数据', () => {
  it('地图出口成对，每张野外图的怪都存在，主线收集物都有怪掉', () => {
    const back = { up: 'down', down: 'up', left: 'right', right: 'left' } as const;
    for (const [id, loc] of Object.entries(locations)) {
      for (const [d, to] of Object.entries(loc.exits)) expect(locations[to!]?.exits[back[d as keyof typeof back]], `${id}.${d}`).toBe(id);
      for (const g of loc.groups) expect(monsters[g.monster], `${id} ${g.monster}`).toBeTruthy();
    }
    for (const q of mainQuests.filter((x) => x.type === 'collect')) {
      expect(Object.values(monsters).some((m) => m.drops.some((d) => d.item === q.target!.item && d.questOnly === q.id)), q.id).toBe(true);
    }
    // 主线的击杀目标都在任务写的地图上
    for (const q of mainQuests.filter((x) => x.target?.monster && x.type !== 'duel')) expect(locations[q.target!.at].groups.some((g) => g.monster === q.target!.monster), q.id).toBe(true);
    // 名将战：名将是演武塔、国战那套历史名将，地方得存在
    for (const q of mainQuests.filter((x) => x.type === 'duel')) {
      expect(monsters[q.target!.monster!]?.historic, q.id).toBe(true);
      expect(locations[q.target!.at], q.id).toBeTruthy();
    }
    for (const q of mainQuests.filter((x) => x.type === 'choice')) expect(q.choices?.length, q.id).toBe(2);
  });

  it('装备 16 档，矿石链跟着档走，按等级给矿', () => {
    expect(equips.tiers.length).toBe(16);
    expect(ORE_CHAIN.length).toBe(15);
    expect(oreFor(5)).toBe('tiekuang');
    expect(oreFor(45)).toBe('xuantie');
    expect(oreFor(55)).toBe('hantie');
    expect(oreFor(160)).toBe('hunyuan');
    expect(oreFor(150, 2)).toBe('hunyuan');
    for (const o of ORE_CHAIN) expect(items[o].cat).toBe('ore');
  });
});

describe('二环、三环、化境、转职', () => {
  it('40级能接二环，从第11环开始；跑完第11环给 ring2 引导', () => {
    const s = fresh();
    lvl(s, 45);
    for (const id of Object.keys(locations)) arrive(s, id);
    arrive(s, 'xuchang');
    expect(nextRing(s, T0, 3)).toContain('60级');
    expect(nextRing(s, T0, 2)).toContain('二环第11环');
    expect(s.ring.index).toBe(11);
    const t = s.ring.task!;
    if (t.type === 'buy' || t.type === 'deliver') addItem(s, t.item!, t.count);
    else if (t.type === 'goto') t.arrived = true;
    else t.have = t.count;
    turnInRing(s);
    expect(s.flags.ring2).toBe(true);
    expect(s.ring.index).toBe(12);
  });

  it('化境：5级满熟练度 + 90级，升一次变第6级，威力更大', () => {
    const s = fresh('mystic');
    lvl(s, 89);
    s.player.skills = [{ id: 'wulei', level: 5, prof: 30000 }];
    expect(skillSchool(s).find((r) => r.id === 'wulei')!.action).toBe(null);
    lvl(s, 90);
    expect(skillSchool(s).find((r) => r.id === 'wulei')!.action).toBe('upgrade');
    expect(upgradeSkill(s, 'wulei')).toContain('化境');
    expect(s.player.skills[0].level).toBe(6);
    expect(skillSchool(s).find((r) => r.id === 'wulei')!.reason).toBe('已入化境');
  });

  it('不转职停在100级；转职重选职业、退点、等级上限160', () => {
    const s = fresh('warrior');
    lvl(s, 99);
    grantPlayerExp(s, 1e9);
    expect(s.player.level).toBe(100);
    expect(levelCap(s)).toBe(100);
    s.player.added = { con: 100, str: 100, int: 0, agi: 0 };
    s.player.free = 0;
    s.player.skills = [{ id: 'lipi', level: 5, prof: 20000 }, { id: 'sheming', level: 3, prof: 5000 }];
    expect(canRebirth(s)).toBe('');
    expect(rebirth(s, 'mystic', 'female', 2)).toContain('异人');
    expect(s.player.classId).toBe('mystic');
    expect(s.player.free).toBe(200 + balance.rebirth.bonusPoints);
    expect(s.player.skills.map((x) => [x.id, x.level])).toEqual([['wugu', 5], ['hufeng', 3]]);
    expect(levelCap(s)).toBe(160);
    grantPlayerExp(s, 1e7);
    expect(s.player.level).toBeGreaterThan(100);
    expect(canRebirth(s)).toBe('已经转过职了');
  });

  it('副将100级以后转生要大将军令，转了才能继续升', () => {
    const s = fresh();
    s.p3.reborn = 1;
    const g = makeGeneral(s, 'shanzei', 100, new Rng(1));
    addGeneral(s, g);
    expect(generalRebirth(s, g.uid)).toContain('大将军令');
    addItem(s, 'dajiangjunling', 1);
    expect(generalRebirth(s, g.uid)).toContain('转生');
    expect(g.reborn).toBe(1);
  });
});

describe('教派、训练、宝库', () => {
  it('34级入教派，领任务不限次数，做完涨声望；声望够了升职位、加成变大', () => {
    const s = fresh();
    lvl(s, 50);
    for (const id of Object.keys(locations)) arrive(s, id);
    expect(joinSect(s, 'qinglong')).toContain('青龙会');
    expect(s.flags.joinedSect).toBe(true);
    const atk0 = playerStats(s).atk;
    expect(takeSectTask(s)).toContain('教派任务');
    const t = s.p3.sect.task!;
    if (t.type === 'deliver') addItem(s, t.item!, t.count);
    else if (t.type === 'goto') t.arrived = true;
    else t.have = t.count;
    expect(sectTaskDone(s)).toBe(true);
    turnInSect(s);
    expect(s.p3.sect.rep).toBeGreaterThan(0);
    s.p3.sect.rep = 5000;
    expect(playerStats(s).atk).toBeGreaterThan(atk0);
  });

  it('随军操练：挑一个歇着的副将，打赢一仗分一半经验；叫上场就停', () => {
    const s = fresh();
    lvl(s, 30);
    const g = makeGeneral(s, 'shanzei', 20, new Rng(2));
    addGeneral(s, g);
    s.activeGeneral = g.uid;
    expect(setTrainee(s, g.uid)).toContain('出战');
    s.activeGeneral = null;
    expect(setTrainee(s, g.uid)).toContain('随军操练');
    expect(s.flags.trained).toBe(true);
    const r = trainAfterBattle(s, 1000);
    expect(r?.exp).toBe(Math.round(1000 * TRAIN_SHARE));
    setActive(s, g.uid);
    expect(s.p3.training).toBeNull();
  });

  it('老存档里按小时挂着练的，读档时把已练的经验给完、改成随军操练', () => {
    const s = fresh();
    const g = makeGeneral(s, 'shanzei', 20, new Rng(2));
    addGeneral(s, g);
    s.activeGeneral = null;
    const exp0 = g.exp + g.level * 1e6;
    (s.p3 as unknown as { training: unknown }).training = { who: g.uid, start: Date.now() - 2 * HOUR, hours: 4 };
    const back = deserialize(serialize(s));
    const g2 = back.generals.find((x) => x.uid === g.uid)!;
    expect(g2.exp + g2.level * 1e6).toBeGreaterThan(exp0);
    expect(back.p3.training).toEqual({ who: g.uid });
  });

  it('宝库存取、扩容花金砖', () => {
    const s = fresh();
    addItem(s, 'baoxiang', 5);
    expect(vaultStore(s, 'baoxiang', 3)).toContain('3');
    expect(bagCount(s, 'baoxiang')).toBe(2);
    expect(vaultTake(s, 'baoxiang', 1)).toContain('取出');
    expect(s.p3.vault.baoxiang).toBe(2);
    expect(expandVault(s)).toContain('金砖');
    s.player.gold = 100;
    expect(expandVault(s)).toContain('50');
  });
});

describe('擂台、决斗场、恶人值', () => {
  it('没上榜挑最后5名，赢了换到对方名次，切磋不掉经验不回城', () => {
    const s = fresh();
    lvl(s, 60);
    s.location = 'chenliu';
    expect(challengers(s, 'arena').map((c) => c.rank)).toEqual([96, 97, 98, 99, 100]);
    const b = arenaBattle(s, 'arena', 100, 3) as Battle;
    expect(typeof b).toBe('object');
    for (const u of b.units) if (u.side === 'enemy') u.hp = 1;
    b.outcome = 'win';
    const exp = s.player.exp;
    finishBattle(s, b, T0);
    expect(s.p3.arena.rank).toBe(100);
    expect(s.flags.arena).toBe(true);
    expect(s.player.exp).toBe(exp);
    expect(s.location).toBe('chenliu');
    expect(ladder(s, 'arena')[99].rival).toBe(null);
    const b2 = arenaBattle(s, 'arena', 97, 4) as Battle;
    b2.outcome = 'lose';
    finishBattle(s, b2, T0);
    expect(s.p3.arena.rank).toBe(100);
    expect(s.location).toBe('chenliu');
  });

  it('决斗打赢涨恶人值，每打一仗消1点', () => {
    const s = fresh();
    lvl(s, 60);
    s.p3.evil = 10;
    s.p3.evilAt = calTick(s);
    s.battles += 3;
    expect(evilNow(s)).toBe(7);
  });

  it('擂台次数按天下历的天：用完了再打几仗就到明天', () => {
    const s = fresh();
    lvl(s, 60);
    s.location = 'chenliu';
    s.p3.arena.day = today(s);
    s.p3.arena.fights = balance.arena.perDay;
    expect(fightsLeft(s, 'arena')).toBe(0);
    expect(arenaBattle(s, 'arena', 100, 1) as string).toContain('就到明天');
    s.battles += DAY_BATTLES;
    expect(fightsLeft(s, 'arena')).toBe(balance.arena.perDay);
  });
});

describe('抢宝、银两环、文曲星、幸运王、节日', () => {
  it('老存档：今天（真实日期）用掉的次数挪到天下历的今天，恶人值和摊位先按真实时间折算，赤壁退押注', () => {
    const s = fresh();
    s.battles = 40;
    const now = new Date(2026, 9, 22, 15, 0).getTime();
    const real = `2026-10-22`;
    const raw = JSON.parse(serialize(s));
    delete raw.p4.calV;
    raw.p3.arena = { ...raw.p3.arena, day: real, fights: 4 };
    raw.p3.wenqu = { day: '2026-10-21', answered: [1, 2, 3, 4, 5], right: 5 };
    raw.p3.evil = 20;
    raw.p3.evilAt = now - 5 * 3600000;
    raw.p3.stall = { ...raw.p3.stall, goods: [{ item: 'baoxiang', price: 100, n: 3 }], last: now - 3600000 };
    raw.casino.chibi = { id: 99, start: 0, end: now + 60000, bets: [500, 0, 0] };
    raw.p5.gifts = { diaochan: `${real}:2`, other: '2026-10-20:3' };
    const silver = raw.player.silver;
    const realNow = Date.now;
    Date.now = () => now;
    let s2: Save;
    try {
      s2 = deserialize(JSON.stringify(raw));
    } finally {
      Date.now = realNow;
    }
    expect(s2.p3.arena.day).toBe(today(s2));
    expect(fightsLeft(s2, 'arena')).toBe(balance.arena.perDay - 4);
    expect(s2.p3.wenqu.day).toBe('');
    expect(s2.p3.evil).toBe(15);
    expect(s2.p3.evilAt).toBe(calTick(s2));
    expect(calTick(s2) - s2.p3.stall.last).toBe(6);
    expect(s2.casino.chibi).toBeNull();
    expect(s2.player.silver).toBe(silver + 500);
    expect(s2.p5.gifts).toEqual({ diaochan: `${today(s2)}:2` });
    expect(deserialize(serialize(s2)).p3.arena.fights).toBe(4);
  });

  it('天下历每天9时、15时各开三仗的工夫；宝藏在去过的野外、这一场不挪地方；每天3次', () => {
    const s = fresh();
    for (const id of ['cunbei', 'cunnan', 'cunxi']) arrive(s, id);
    const open = [...Array(DAY_BATTLES).keys()].filter((t) => treasureNow(s, t).open);
    expect(open).toEqual([7, 8, 9, 12, 13, 14]);
    expect(treasureNow(s, 6).next).toContain('再打1仗');
    expect(treasureNow(s, 15).next).toContain('明天9时');
    s.battles = 7;
    const t = treasureNow(s);
    expect(['cunbei', 'cunnan', 'cunxi']).toContain(t.at);
    expect(treasureNow(s, 9).at).toBe(t.at);
    s.location = t.at!;
    const b = treasureBattle(s, 1) as Battle;
    expect(b.tag).toBe('treasure');
    b.outcome = 'win';
    const silver = s.player.silver;
    finishBattle(s, b);
    expect(s.player.silver).toBeGreaterThan(silver);
    expect(treasureLeft(s)).toBe(2);
  });

  it('银两环：接了差事庐江逃兵才掉军资，交10份领赏', () => {
    const s = fresh();
    lvl(s, 45);
    expect(questDropAllowed(s, 'silverRing')).toBe(false);
    expect(takeSilverRing(s)).toContain('军资');
    expect(questDropAllowed(s, 'silverRing')).toBe(true);
    addItem(s, 'junzi', 10);
    const silver = s.player.silver;
    expect(turnInSilverRing(s)).toContain('赏银');
    expect(s.player.silver).toBeGreaterThan(silver);
  });

  it('文曲星每天5题；幸运王每天免费一次，之后要金砖', () => {
    const s = fresh();
    let right = 0;
    for (let i = 0; i < 5; i++) {
      const t = wenquToday(s);
      expect(t.qi).not.toBe(null);
      const r = answerWenqu(s, t.qi!, systems.wenqu.questions[t.qi!].ok);
      if (r.ok) right++;
    }
    expect(right).toBe(5);
    expect(wenquToday(s).qi).toBe(null);
    expect(luckyDraw(s)).toContain('幸运值');
    expect(luckyDraw(s)).toContain('金砖');
    expect(s.p3.lucky.luck).toBeGreaterThan(0);
    // 过一天又有题
    s.battles += DAY_BATTLES;
    expect(wenquToday(s).qi).not.toBe(null);
  });

  it('节日按日期认；当天礼包只能领一次，经验加成', () => {
    const s = fresh();
    expect(festivalToday(at(2026, 10, 1, 12))?.name).toBe('国庆');
    expect(festivalToday(at(2026, 9, 25, 12))?.name).toBe('中秋');
    expect(festivalToday(at(2026, 3, 11, 12))).toBe(null);
    expect(festivalExpMul(at(2026, 10, 1, 12))).toBe(1.5);
    expect(claimFestival(s, at(2026, 10, 1, 12))).toContain('国庆快乐');
    expect(claimFestival(s, at(2026, 10, 2, 12))).toContain('领过');
  });
});

describe('摆摊、婚姻、结拜、组队', () => {
  it('摆上的东西每打一仗来一轮买家，价钱低卖得快', () => {
    const s = fresh();
    addItem(s, 'baoxiang', 6);
    putOnStall(s, 'baoxiang', 6, 100);
    expect(settleStall(s)).toEqual([]);
    s.battles += 20;
    settleStall(s);
    expect(s.p3.stall.sold).toBeGreaterThan(3);
    expect(collectStall(s)).toContain('货款');
  });

  it('送礼到100好感才能成亲；默契够的英才能结拜', () => {
    const s = fresh('warrior', 'male');
    lvl(s, 50);
    s.player.silver = 1e7;
    expect(marry(s, 'zhenfu')).toContain('好感');
    s.p3.marriage.favor.zhenfu = 95;
    giveGift(s, 'zhenfu');
    expect(s.p3.marriage.favor.zhenfu).toBe(100);
    const hp = playerStats(s).maxHp;
    expect(marry(s, 'zhenfu')).toContain('夫妻');
    expect(playerStats(s).maxHp).toBeGreaterThan(hp);
    const g = makeGeneral(s, 'shanzei', 30, new Rng(3));
    addGeneral(s, g);
    expect(swornReason(s, g.uid)).toContain('常人');
    g.grade = '英才';
    g.rapport = 60;
    expect(swear(s, g.uid)).toContain('结拜');
    expect(g.sworn).toBe(true);
  });

  it('雇的队友跟着上场，打一场少一场', () => {
    const s = fresh();
    lvl(s, 20);
    s.player.silver = 1e6;
    hireMerc(s, 'mystic');
    s.location = 'cunnan';
    const b = startBattle(s, 0, 9);
    expect(b.units.some((u) => u.id === 'merc')).toBe(true);
    b.outcome = 'win';
    finishBattle(s, b, T0);
    expect(s.p3.merc!.battles).toBe(systems.merc.battles - 1);
  });
});

describe('战斗录像、成就、存档迁移', () => {
  it('录像按记下的随机数和指令重算，结果和原来一样', () => {
    const s = fresh();
    lvl(s, 10);
    s.location = 'cunxi';
    const b = startBattle(s, 0, 77);
    run(b);
    finishBattle(s, b, T0);
    const rp = s.p3.replays[0];
    expect(rp.rounds.length).toBe(b.round);
    const r = createBattle(JSON.parse(JSON.stringify(rp.init)));
    for (const round of rp.rounds) {
      r.rng.state = round.s;
      resolveRound(r, round.c);
    }
    expect(r.outcome).toBe(b.outcome);
    expect(r.units.map((u) => u.hp)).toEqual(b.units.map((u) => u.hp));
  });

  it('成就达成发奖给称号；称号能换；排行榜里有自己', () => {
    const s = fresh();
    lvl(s, 60);
    const got = checkAchievements(s, T0);
    expect(got.some((x) => x.includes('名动一方'))).toBe(true);
    expect(s.p3.titles).toContain('名动一方');
    expect(setTitle(s, '名动一方')).toContain('名动一方');
    expect(checkAchievements(s, T0)).toEqual([]);
    const rows = board(s, 'gaoshou', (lv) => lv, 0, 0);
    expect(rows.some((r) => r.mine)).toBe(true);
  });

  it('老存档补上 P3 字段；停在「全部完成」的接着往下走', () => {
    const s = fresh();
    const raw = JSON.parse(serialize(s));
    delete raw.p3;
    raw.main = { step: 36, state: 'done', count: 0 };
    const s2 = deserialize(JSON.stringify(raw));
    expect(s2.p3.reborn).toBe(0);
    expect(s2.main.state).toBe('available');
    // 主线中间插过新手教学任务，老存档的 step 按任务 id 换算，还是指着 m36
    expect(mainQuests[s2.main.step].id).toBe('m36');
  });
});

describe('P3 自动通关模拟（1级打到汉中篇结束）', () => {
  for (const classId of ['warrior', 'scholar', 'mystic'] as ClassId[]) {
    for (const gender of ['male', 'female'] as Gender[]) {
      it(`${classId}/${gender} 打通全部主线，转职，到155级以上`, () => {
        const s = fresh(classId, gender);
        const rep = autoplay(s, 11, 6000);
        console.log(classId, gender, JSON.stringify({ battles: rep.battles, losses: rep.losses, level: rep.level, rings: rep.rings }));
        expect(rep.finished).toBe(true);
        expect(s.main.state).toBe('done');
        expect(s.p3.reborn).toBe(1);
        expect(rep.level).toBeGreaterThanOrEqual(155);
        expect(rep.battles).toBeLessThan(4500);
      }, 120000);
    }
  }
});
