import { describe, expect, it } from 'vitest';
import { mainQuests, monsters, systems } from '../src/data';
import { aiCommand, living, needsCommand, resolveRound } from '../src/core/battle';
import type { Battle, Command } from '../src/core/battle';
import { LOOKS } from '../src/art/units';
import {
  afterContest, claimKuaqu, claimLeague, kuaquBattle, kuaquFoes, kuaquReason, kuaquView, leagueBattle, leagueTable, leagueView, matchWinner,
} from '../src/game/contest';
import { finishBattle } from '../src/game/encounter';
import {
  PLAYABLE, attackTargets, buyWithMerit, capitalCover, citiesOf, claimSalary, claimSeason, cityReason, defendTargets, gzBattle, gzBuff, joinNation,
  DAY_BATTLES, SEASON_BATTLES, calTick, nationRanks, neighbors, ordersLeft, rankName, seasonTurns, syncWorld, turnOf, weekIndex, weekday,
} from '../src/game/guozhan';
import { joinSect } from '../src/game/sect';
import { bagCount, deserialize, generalStats, newSave, playerStats, serialize } from '../src/game/state';
import type { Save } from '../src/game/state';
import { autoplay, generalCommand, playerCommand } from '../src/sim/autoplay';

const G = systems.guozhan;
// 天下历：赛季第一天第一格、第六天打到一半
const D = DAY_BATTLES;
const MON = 0;
const SAT = 5 * D + 9;
const NEXT = SEASON_BATTLES;

function hero(level = 80, seed = 5): Save {
  const s = newSave({ server: '1区', name: '测试', gender: 'male', classId: 'warrior', avatar: 0, seed });
  s.player.level = level;
  return s;
}

function drive(s: Save, b: Battle): Battle['outcome'] {
  for (let r = 0; r < 200 && !b.outcome; r++) {
    const cmds: Command[] = [];
    for (const u of living(b)) {
      if (!needsCommand(u)) continue;
      if (u.side === 'enemy') cmds.push(aiCommand(b, u));
      else if (u.kind === 'player') cmds.push(playerCommand(b, u, s, null));
      else cmds.push(generalCommand(b, u, null));
    }
    resolveRound(b, cmds);
  }
  return b.outcome;
}

// 不打，直接判赢/输，看结算
function settle(s: Save, b: Battle | string, outcome: 'win' | 'lose') {
  if (typeof b === 'string') throw new Error(b);
  b.outcome = outcome;
  return finishBattle(s, b);
}

describe('P4 数据', () => {
  it('城池连线都在表里、整张图连通；兵种和守将都有怪物和外形', () => {
    const ids = new Set(G.cities.map((c) => c.id));
    for (const [a, b] of G.links) expect(ids.has(a) && ids.has(b), `${a}-${b}`).toBe(true);
    const seen = new Set([G.cities[0].id]);
    const q = [G.cities[0].id];
    while (q.length) for (const x of neighbors(q.shift()!)) if (!seen.has(x)) seen.add(x), q.push(x);
    expect(seen.size).toBe(G.cities.length);
    for (const n of ['wei', 'shu', 'wu', 'qun'] as const) {
      for (const id of [...G.soldiers[n], ...G.guards[n]]) {
        expect(monsters[id], id).toBeTruthy();
        expect(LOOKS[monsters[id].look], monsters[id].look).toBeTruthy();
      }
      expect(G.cities.filter((c) => c.owner === n).length).toBeGreaterThanOrEqual(4);
    }
    for (const n of PLAYABLE) expect(G.cities.filter((c) => c.owner === n && c.kind === 'capital').length).toBe(1);
  });
});

describe('国战沙盘', () => {
  it('天下历：打一仗走一格，18 仗一天、七天一季，AI 一天 24 回合', () => {
    expect(D).toBe(18);
    expect(weekday(MON)).toBe(0);
    expect(weekday(SAT)).toBe(5);
    expect(weekIndex(NEXT - 1)).toBe(0);
    expect(weekIndex(NEXT)).toBe(1);
    expect(weekday(NEXT)).toBe(0);
    expect(turnOf(MON)).toBe(0);
    expect(turnOf(D)).toBe(24);
    expect(seasonTurns).toBe(168);
    expect(turnOf(NEXT - 1)).toBeLessThan(168);
    // 每打一仗（切磋也算）天下走一格
    const s = hero();
    const t0 = calTick(s);
    const b = gzBattle(s, 'xuchang', 'atk', 1);
    expect(typeof b).toBe('string');
    s.battles += 3;
    expect(calTick(s)).toBe(t0 + 3);
  });

  it('一格一格推进和一次补算结果一样', () => {
    const a = hero();
    const b = hero();
    for (let t = 0; t <= 60; t++) syncWorld(a, t);
    syncWorld(b, 60);
    expect(JSON.stringify(a.p4.world)).toBe(JSON.stringify(b.p4.world));
    expect(a.p4.world!.turn).toBe(turnOf(60));
  });

  it('一个赛季打下来三国都还在、都城不被 AI 打下；城池会易主', () => {
    let moved = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const s = hero(80, seed);
      const w = syncWorld(s, NEXT - 1);
      for (const n of PLAYABLE) expect(citiesOf(w, n).length, `${seed} ${n}`).toBeGreaterThan(0);
      for (const c of G.cities.filter((x) => x.kind === 'capital')) expect(w.cities[c.id].owner).toBe(c.owner);
      if (w.events.some((e) => e.big)) moved++;
    }
    expect(moved).toBeGreaterThan(50);
  });

  it('60级才能入国；入国7天内不能改投，改投战功折半、赛季战功清零', () => {
    const s = hero(59);
    expect(joinNation(s, 'wei', MON)).toContain('60级');
    s.player.level = 60;
    joinNation(s, 'wei', MON);
    expect(s.p4.nation).toBe('wei');
    s.p4.merit = 100;
    s.p4.seasonMerit = 100;
    expect(joinNation(s, 'shu', 3 * D)).toContain('不能改投');
    joinNation(s, 'shu', 8 * D);
    expect(s.p4.nation).toBe('shu');
    expect(s.p4.merit).toBe(50);
    expect(s.p4.seasonMerit).toBe(0);
  });

  it('本国名将助阵（带专属被动）；敌方守将也带被动', () => {
    const s = hero(80);
    joinNation(s, 'shu', MON);
    const w = syncWorld(s, MON);
    const id = attackTargets(s, w)[0];
    const b = gzBattle(s, id, 'atk', 1, MON);
    if (typeof b === 'string') throw new Error(b);
    const aid = b.units.find((u) => u.id === 'a9')!;
    expect(aid.side).toBe('ally');
    expect(G.guards.shu).toContain(aid.passive);
    expect(aid.passive).toBeTruthy();
    expect(b.title).toContain('助阵');
    const boss = gzBattle(s, id, 'boss', 2, MON);
    if (typeof boss === 'string') return;
    expect(boss.units.find((u) => u.id === 'e0')!.passive).toBeTruthy();
  });

  it('出征打赢削守军、加战功、用掉军令；军令每天8道', () => {
    const s = hero(80);
    joinNation(s, 'wei', MON);
    const w = syncWorld(s, MON);
    const id = attackTargets(s, w)[0];
    const before = w.cities[id].troops;
    const sum = settle(s, gzBattle(s, id, 'atk', 1, MON), 'win');
    expect(s.p4.world!.cities[id].troops).toBeLessThan(before);
    expect(s.p4.merit).toBe(G.player.meritAtk);
    expect(ordersLeft(s, MON)).toBe(G.ordersPerDay - 1);
    expect(sum.lines.join()).toContain('击溃');
    s.p4.orders.used = G.ordersPerDay;
    expect(gzBattle(s, id, 'atk', 2, MON)).toContain('军令用完');
    expect(gzBattle(s, id, 'atk', 2) as string).toContain(`再打${D - 1}仗就到明天`);
    // 第二天又有了
    expect(ordersLeft(s, D)).toBe(G.ordersPerDay);
    // 不接壤的城打不了
    const far = G.cities.find((c) => !attackTargets(s, s.p4.world!).includes(c.id) && s.p4.world!.cities[c.id].owner !== 'wei')!;
    expect(cityReason(s, s.p4.world!, far.id, 'atk', D)).toContain('接壤');
  });

  it('守军打光守将出城；斩将夺城，城归本国；输了不回新手村、不扣经验', () => {
    const s = hero(80);
    joinNation(s, 'wei', MON);
    const w = syncWorld(s, MON);
    const id = attackTargets(s, w)[0];
    expect(cityReason(s, w, id, 'boss', MON)).toContain('守军还没打光');
    w.cities[id].troops = 0;
    w.cities[id].broken = w.turn;
    s.location = 'luoyang';
    const exp = (s.player.exp = 500);
    const lose = settle(s, gzBattle(s, id, 'boss', 3), 'lose');
    expect(s.location).toBe('luoyang');
    expect(s.player.exp).toBe(exp);
    expect(lose.lines.join()).toContain('败退回营');
    // 守将战不用军令
    expect(ordersLeft(s, MON)).toBe(G.ordersPerDay);
    settle(s, gzBattle(s, id, 'boss', 4), 'win');
    expect(s.p4.world!.cities[id].owner).toBe('wei');
    expect(s.life.gzCaptures).toBe(1);
    expect(s.p4.merit).toBe(G.player.meritBoss);
  });

  it('夺来的城记着原主；敌国都城有接应时守军打不光；敌国玩家会出征削本国的城', () => {
    const s = hero(80);
    joinNation(s, 'wei', MON);
    const w = syncWorld(s, MON);
    const id = attackTargets(s, w)[0];
    const was = w.cities[id].owner;
    w.cities[id].troops = 0;
    w.cities[id].broken = w.turn;
    settle(s, gzBattle(s, id, 'boss', 4), 'win');
    expect(s.p4.world!.cities[id].lostBy).toBe(was);
    // 吴国都城建业：接壤的吴城还在，守军最少留一成半
    const s2 = hero(160);
    joinNation(s2, 'wei', MON);
    const w2 = syncWorld(s2, MON);
    const cap = 'jianye';
    expect(capitalCover(w2, cap).length).toBeGreaterThan(0);
    // 留一座吴城接应，其余接壤的城归魏（这样建业能打到）
    neighbors(cap).forEach((x, i) => (w2.cities[x].owner = i === 0 ? 'wu' : 'wei'));
    expect(capitalCover(w2, cap)).toEqual([neighbors(cap)[0]]);
    // 这几仗里 AI 不打仗，免得接应的城被别国抢走
    const ai = { ...G.ai };
    Object.assign(G.ai, { attackChance: 0, allyAttackBonus: 0, revengeAttackBonus: 0 });
    const floor = Math.round(G.kinds.capital.max * G.player.capitalFloorPct);
    w2.cities[cap].troops = 10;
    const sum = settle(s2, gzBattle(s2, cap, 'atk', 5, MON), 'win');
    expect(s2.p4.world!.cities[cap].troops).toBeGreaterThanOrEqual(10);
    expect(sum.lines.join()).toContain('接应');
    w2.cities[cap].troops = floor + 50;
    settle(s2, gzBattle(s2, cap, 'atk', 6, MON), 'win');
    expect(s2.p4.world!.cities[cap].troops).toBeGreaterThanOrEqual(floor);
    // 接应的城没了，就能打光
    w2.cities[neighbors(cap)[0]].owner = 'wei';
    w2.cities[cap].troops = 100;
    settle(s2, gzBattle(s2, cap, 'atk', 7, MON), 'win');
    expect(s2.p4.world!.cities[cap].troops).toBe(0);
    Object.assign(G.ai, ai);
    // 敌国玩家出征的战报：一个赛季里总有
    const s3 = hero(80);
    joinNation(s3, 'shu', MON);
    const w3 = syncWorld(s3, NEXT - 1);
    expect(w3.events.some((e) => e.text.includes('出征'))).toBe(true);
    // 没入国就没有
    const s4 = hero(80);
    expect(syncWorld(s4, NEXT - 1).events.some((e) => e.text.includes('出征'))).toBe(false);
  });

  it('驻守补兵；占着洛阳经验加成；官职加属性、有俸禄；战功能换东西', () => {
    const s = hero(80);
    joinNation(s, 'wei', MON);
    const w = syncWorld(s, MON);
    const front = defendTargets(s, w)[0];
    w.cities[front].troops = 500;
    settle(s, gzBattle(s, front, 'def', 5, MON), 'win');
    expect(s.p4.world!.cities[front].troops).toBeGreaterThan(500);
    expect(gzBuff(s).exp).toBe(0);
    s.p4.world!.cities.luoyang.owner = 'wei';
    // gzBuff 只认当前赛季
    expect(s.p4.world!.season).toBe(weekIndex(calTick(s)));
    expect(gzBuff(s).exp).toBeCloseTo(0.1);
    const atk0 = playerStats(s).atk;
    s.p4.meritTotal = 10000;
    expect(rankName(s)).toBe('将军');
    expect(playerStats(s).atk).toBeGreaterThan(atk0);
    expect(claimSalary(s, MON)).toContain('俸禄');
    expect(claimSalary(s, 1)).toContain('领过');
    expect(claimSalary(s, D)).toContain('俸禄');
    s.p4.merit = 1000;
    buyWithMerit(s, G.shop.findIndex((e) => e.id === 'jiangjunling'));
    expect(bagCount(s, 'jiangjunling')).toBe(1);
    expect(s.p4.merit).toBe(700);
  });

  it('跨赛季：战功够的按本国名次发奖；奖励只领一次', () => {
    const s = hero(80);
    joinNation(s, 'wei', MON);
    s.p4.seasonMerit = G.seasonMinMerit;
    const w = syncWorld(s, MON);
    const rank = nationRanks(syncWorld(deserialize(serialize(s)), NEXT - 1)).findIndex((x) => x.id === 'wei') + 1;
    syncWorld(s, NEXT);
    expect(s.p4.world!.season).toBe(w.season + 1);
    expect(s.p4.seasonMerit).toBe(0);
    expect(s.p4.seasonClaim?.rank).toBe(rank);
    const silver = s.player.silver;
    claimSeason(s);
    expect(s.player.silver).toBeGreaterThan(silver);
    expect(claimSeason(s)[0]).toContain('没有');
  });

  it('打光守军后一天之内守军不补，过了这天补回来', () => {
    const s = hero(80);
    joinNation(s, 'wei');
    const w = syncWorld(s);
    const id = attackTargets(s, w)[0];
    w.cities[id].troops = 1;
    const sum = settle(s, gzBattle(s, id, 'atk', 8), 'win');
    expect(sum.lines.join()).toContain('一天之内');
    for (let i = 0; i < D - 2; i++) {
      s.battles++;
      const c = syncWorld(s).cities[id];
      expect(c.owner).not.toBe('wei');
      expect(c.troops).toBe(0);
    }
    expect(cityReason(s, s.p4.world!, id, 'boss')).toBe('');
    s.battles += 3;
    expect(syncWorld(s).cities[id].troops).toBeGreaterThan(0);
  });

  it('一天最后一格开打，军令记在那天；打完进了下一天，军令又满', () => {
    const s = hero(80);
    joinNation(s, 'wei');
    s.battles = D - 1;
    const id = attackTargets(s, syncWorld(s))[0];
    settle(s, gzBattle(s, id, 'atk', 7), 'win');
    expect(calTick(s)).toBe(D);
    expect(ordersLeft(s)).toBe(G.ordersPerDay);
  });

  it('老存档：真实时间的赛季、当天用掉的军令、入国时间换算到天下历', () => {
    const s = hero(80);
    s.battles = 500;
    joinNation(s, 'wei');
    syncWorld(s);
    // 2026-10-22（周四）15 点：按老算法本周第 3 天 15 时
    const now = new Date(2026, 9, 22, 15, 0).getTime();
    const raw = JSON.parse(serialize(s));
    delete raw.p4.calBase;
    const realWeek = Math.floor((Math.floor((now - new Date(now).getTimezoneOffset() * 60000) / 86400000) + 3) / 7);
    raw.p4.world.season = realWeek;
    raw.p4.world.turn = 3 * 24 + 15;
    const today = new Date(now);
    raw.p4.orders = { day: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`, used: 5 };
    raw.p4.joinedAt = now - 2 * 86400000;
    raw.p4.league.week = realWeek - 1;
    const realNow = Date.now;
    Date.now = () => now;
    let s2: Save;
    try {
      s2 = deserialize(JSON.stringify(raw));
    } finally {
      Date.now = realNow;
    }
    const t = calTick(s2);
    expect(weekday(t)).toBe(3);
    expect(s2.p4.world!.season).toBe(0);
    expect(ordersLeft(s2)).toBe(G.ordersPerDay - 5);
    // 入国两天：还要再过五天才能改投
    expect(joinNation(s2, 'shu')).toContain('不能改投');
    expect(joinNation(s2, 'shu', t + 5 * D + 1)).toContain('改投');
    // 上周的争霸记录算成上一季，进来就结算
    expect(s2.p4.league.week).toBe(-1);
    // 再读一次不会重复换算
    const s3 = deserialize(serialize(s2));
    expect(s3.p4.calBase).toBe(s2.p4.calBase);
  });
});

describe('军团争霸、跨区大战', () => {
  it('四个教派一季循环；你赢的阵越多，本教派越容易赢这一轮', () => {
    const s = hero(80);
    let w0 = 0;
    let w3 = 0;
    for (let week = 0; week < 300; week++) {
      if (matchWinner(s, week, 0, 0, 1, 0, 0) === 0) w0++;
      if (matchWinner(s, week, 0, 0, 1, 0, 3) === 0) w3++;
    }
    expect(w0 / 300).toBeLessThan(0.45);
    expect(w3 / 300).toBeGreaterThan(0.85);
    const t = leagueTable(s, 10, 7, 'qinglong', [3, 3, 3, 3, 3, 3, 3]);
    expect(t.reduce((a, r) => a + r.won, 0)).toBe(14);
  });

  it('没入教派不能打；每天三阵；跨赛季按名次发奖', () => {
    const s = hero(80);
    expect(leagueBattle(s, 1, MON)).toContain('先入一个教派');
    joinSect(s, 'qinglong');
    for (let i = 0; i < 3; i++) {
      const b = leagueBattle(s, i, MON + 1);
      if (typeof b === 'string') throw new Error(b);
      b.outcome = 'win';
      afterContest(s, b, MON + 1);
    }
    expect(leagueView(s, MON + 1).left).toBe(0);
    expect(leagueBattle(s, 9, MON + 1)).toContain('打完');
    leagueView(s, NEXT);
    expect(s.p4.league.claim).not.toBeNull();
    const rep = s.p3.sect.rep;
    claimLeague(s, NEXT);
    expect(s.p3.sect.rep).toBeGreaterThan(rep);
  });

  it('跨区只在赛季最后两天、80级以上；赢了加分；下个赛季按名次领奖', () => {
    const s = hero(79);
    expect(kuaquReason(s, SAT)).toContain('80级');
    s.player.level = 85;
    expect(kuaquReason(s, MON)).toContain('第六、七天');
    expect(kuaquReason(s, SAT)).toBe('');
    const foes = kuaquFoes(s, SAT);
    expect(foes.length).toBe(systems.kuaqu.fightsPerDay);
    for (const f of foes) expect(f.level).toBeGreaterThanOrEqual(s.player.level);
    const b = kuaquBattle(s, 0, 1, SAT);
    if (typeof b === 'string') throw new Error(b);
    b.outcome = 'win';
    afterContest(s, b, SAT);
    expect(s.p4.kuaqu.points).toBeGreaterThanOrEqual(systems.kuaqu.winPoints);
    expect(kuaquBattle(s, 0, 2, SAT)).toContain('打过');
    const v = kuaquView(s, SAT);
    expect(v.scores.length).toBe(3);
    kuaquView(s, NEXT);
    expect(s.p4.kuaqu.claim?.points).toBe(v.points);
    expect(claimKuaqu(s, NEXT)[0]).toContain('诸州会武');
  });

  it('老存档补上 P4 字段', () => {
    const s = hero(80);
    const raw = JSON.parse(serialize(s));
    delete raw.p4;
    const s2 = deserialize(JSON.stringify(raw));
    expect(s2.p4.nation).toBeNull();
    expect(s2.p4.league.fought.length).toBe(7);
  });
});

describe('P4 实战（自动打到 60 级出头）', () => {
  it('出征、守将、争霸都打得赢', () => {
    const s0 = hero(1, 5);
    s0.player.level = 1;
    autoplay(s0, 11, 6000, mainQuests.findIndex((q) => q.id === 'm60'));
    expect(s0.player.level).toBeGreaterThanOrEqual(60);
    joinNation(s0, 'wei');
    joinSect(s0, 'qinglong');
    // 出征前先去医馆回满（国战不是切磋，按当前血量上）
    const st = playerStats(s0);
    s0.player.hp = st.maxHp;
    s0.player.mp = st.maxMp;
    for (const g of s0.generals) {
      const gs = generalStats(g);
      g.hp = gs.maxHp;
      g.mp = gs.maxMp;
    }
    const snap = serialize(s0);
    const win = { atk: 0, boss: 0, league: 0 };
    const N = 40;
    for (let k = 0; k < N; k++) {
      let s = deserialize(snap);
      const w = syncWorld(s);
      const id = attackTargets(s, w)[0];
      if (drive(s, gzBattle(s, id, 'atk', 100 + k) as Battle) === 'win') win.atk++;
      s = deserialize(snap);
      syncWorld(s).cities[id].troops = 0;
      if (drive(s, gzBattle(s, id, 'boss', 200 + k) as Battle) === 'win') win.boss++;
      s = deserialize(snap);
      if (drive(s, leagueBattle(s, 300 + k) as Battle) === 'win') win.league++;
    }
    console.log('P4 实战胜率', s0.player.level, JSON.stringify(win));
    expect(win.atk / N).toBeGreaterThan(0.7);
    expect(win.boss / N).toBeGreaterThan(0.5);
    // 军团争霸对面是同级 AI 玩家一队人，65 级的武士大约对半开（0.1.3 时 80 场赢 34 场，0.1.4 赢 39 场）；20 场的老门槛 0.5 是碰运气过的
    expect(win.league / N).toBeGreaterThan(0.35);
  }, 300000);
});
