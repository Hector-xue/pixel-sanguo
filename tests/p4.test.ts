import { describe, expect, it } from 'vitest';
import { monsters, systems } from '../src/data';
import { aiCommand, living, needsCommand, resolveRound } from '../src/core/battle';
import type { Battle, Command } from '../src/core/battle';
import { LOOKS } from '../src/art/units';
import {
  afterContest, claimKuaqu, claimLeague, kuaquBattle, kuaquFoes, kuaquReason, kuaquView, leagueBattle, leagueTable, leagueView, matchWinner,
} from '../src/game/contest';
import { finishBattle } from '../src/game/encounter';
import {
  PLAYABLE, attackTargets, buyWithMerit, citiesOf, claimSalary, claimSeason, cityReason, defendTargets, gzBattle, gzBuff, joinNation,
  nationRanks, neighbors, ordersLeft, rankName, seasonTurns, syncWorld, turnOf, weekIndex, weekday,
} from '../src/game/guozhan';
import { joinSect } from '../src/game/sect';
import { bagCount, deserialize, generalStats, newSave, playerStats, serialize } from '../src/game/state';
import type { Save } from '../src/game/state';
import { autoplay, generalCommand, playerCommand } from '../src/sim/autoplay';

const G = systems.guozhan;
const HOUR = 3600000;
// 2026-10-19 是星期一
const MON = new Date(2026, 9, 19, 0, 0).getTime();
const SAT = new Date(2026, 9, 24, 12).getTime();

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
function settle(s: Save, b: Battle | string, outcome: 'win' | 'lose', now: number) {
  if (typeof b === 'string') throw new Error(b);
  b.outcome = outcome;
  return finishBattle(s, b, now);
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
  it('周一 0 点开赛季，每小时一回合，一周 168 回合', () => {
    expect(weekday(MON)).toBe(0);
    expect(weekday(SAT)).toBe(5);
    expect(weekIndex(MON - 1)).toBe(weekIndex(MON) - 1);
    expect(turnOf(MON)).toBe(0);
    expect(turnOf(MON + 5 * HOUR + 59 * 60000)).toBe(5);
    expect(seasonTurns).toBe(168);
    expect(turnOf(MON + 7 * 24 * HOUR - 1)).toBe(167);
  });

  it('离线补算和一小时一小时推进结果一样', () => {
    const a = hero();
    const b = hero();
    for (let t = 0; t <= 60; t++) syncWorld(a, MON + t * HOUR + 1000);
    syncWorld(b, MON + 60 * HOUR + 1000);
    expect(JSON.stringify(a.p4.world)).toBe(JSON.stringify(b.p4.world));
    expect(a.p4.world!.turn).toBe(60);
  });

  it('一个赛季打下来三国都还在、都城不被 AI 打下；城池会易主', () => {
    let moved = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const s = hero(80, seed);
      const w = syncWorld(s, MON + 167 * HOUR + 1000);
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
    expect(joinNation(s, 'shu', MON + 3 * 24 * HOUR)).toContain('不能改投');
    joinNation(s, 'shu', MON + 8 * 24 * HOUR);
    expect(s.p4.nation).toBe('shu');
    expect(s.p4.merit).toBe(50);
    expect(s.p4.seasonMerit).toBe(0);
  });

  it('出征打赢削守军、加战功、用掉军令；军令每天8道', () => {
    const s = hero(80);
    joinNation(s, 'wei', MON);
    const w = syncWorld(s, MON + 1000);
    const id = attackTargets(s, w)[0];
    const before = w.cities[id].troops;
    const sum = settle(s, gzBattle(s, id, 'atk', 1, MON + 1000), 'win', MON + 2000);
    expect(s.p4.world!.cities[id].troops).toBeLessThan(before);
    expect(s.p4.merit).toBe(G.player.meritAtk);
    expect(ordersLeft(s, MON + 2000)).toBe(G.ordersPerDay - 1);
    expect(sum.lines.join()).toContain('击溃');
    s.p4.orders.used = G.ordersPerDay;
    expect(gzBattle(s, id, 'atk', 2, MON + 3000)).toContain('军令用完');
    // 第二天又有了
    expect(ordersLeft(s, MON + 25 * HOUR)).toBe(G.ordersPerDay);
    // 不接壤的城打不了
    const far = G.cities.find((c) => !attackTargets(s, s.p4.world!).includes(c.id) && s.p4.world!.cities[c.id].owner !== 'wei')!;
    expect(cityReason(s, s.p4.world!, far.id, 'atk', MON + 25 * HOUR)).toContain('接壤');
  });

  it('守军打光守将出城；斩将夺城，城归本国；输了不回新手村、不扣经验', () => {
    const s = hero(80);
    joinNation(s, 'wei', MON);
    const w = syncWorld(s, MON + 1000);
    const id = attackTargets(s, w)[0];
    expect(cityReason(s, w, id, 'boss', MON + 1000)).toContain('守军还没打光');
    w.cities[id].troops = 0;
    s.location = 'luoyang';
    const exp = (s.player.exp = 500);
    const lose = settle(s, gzBattle(s, id, 'boss', 3, MON + 1000), 'lose', MON + 2000);
    expect(s.location).toBe('luoyang');
    expect(s.player.exp).toBe(exp);
    expect(lose.lines.join()).toContain('败退回营');
    // 守将战不用军令
    expect(ordersLeft(s, MON + 2000)).toBe(G.ordersPerDay);
    settle(s, gzBattle(s, id, 'boss', 4, MON + 3000), 'win', MON + 4000);
    expect(s.p4.world!.cities[id].owner).toBe('wei');
    expect(s.life.gzCaptures).toBe(1);
    expect(s.p4.merit).toBe(G.player.meritBoss);
  });

  it('驻守补兵；占着洛阳经验加成；官职加属性、有俸禄；战功能换东西', () => {
    const s = hero(80);
    joinNation(s, 'wei', MON);
    const w = syncWorld(s, MON + 1000);
    const front = defendTargets(s, w)[0];
    w.cities[front].troops = 500;
    settle(s, gzBattle(s, front, 'def', 5, MON + 1000), 'win', MON + 2000);
    expect(s.p4.world!.cities[front].troops).toBeGreaterThan(500);
    expect(gzBuff(s).exp).toBe(0);
    s.p4.world!.cities.luoyang.owner = 'wei';
    // gzBuff 只认当前赛季：这里把世界当成本周的
    s.p4.world!.season = weekIndex();
    expect(gzBuff(s).exp).toBeCloseTo(0.1);
    const atk0 = playerStats(s).atk;
    s.p4.meritTotal = 10000;
    expect(rankName(s)).toBe('将军');
    expect(playerStats(s).atk).toBeGreaterThan(atk0);
    expect(claimSalary(s, MON)).toContain('俸禄');
    expect(claimSalary(s, MON + 1000)).toContain('领过');
    s.p4.merit = 1000;
    buyWithMerit(s, G.shop.findIndex((e) => e.id === 'jiangjunling'));
    expect(bagCount(s, 'jiangjunling')).toBe(1);
    expect(s.p4.merit).toBe(700);
  });

  it('跨赛季：战功够的按本国名次发奖；奖励只领一次', () => {
    const s = hero(80);
    joinNation(s, 'wei', MON);
    s.p4.seasonMerit = G.seasonMinMerit;
    const w = syncWorld(s, MON + 1000);
    const rank = nationRanks(syncWorld(deserialize(serialize(s)), MON + 167 * HOUR + 1000)).findIndex((x) => x.id === 'wei') + 1;
    syncWorld(s, MON + 7 * 24 * HOUR + 1000);
    expect(s.p4.world!.season).toBe(w.season + 1);
    expect(s.p4.seasonMerit).toBe(0);
    expect(s.p4.seasonClaim?.rank).toBe(rank);
    const silver = s.player.silver;
    claimSeason(s);
    expect(s.player.silver).toBeGreaterThan(silver);
    expect(claimSeason(s)[0]).toContain('没有');
  });
});

describe('军团争霸、跨区大战', () => {
  it('四个教派一周循环；你赢的阵越多，本教派越容易赢这一轮', () => {
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

  it('没入教派不能打；每天三阵；跨周按名次发奖', () => {
    const s = hero(80);
    expect(leagueBattle(s, 1, MON)).toContain('先入一个教派');
    joinSect(s, 'qinglong');
    for (let i = 0; i < 3; i++) {
      const b = leagueBattle(s, i, MON + HOUR);
      if (typeof b === 'string') throw new Error(b);
      b.outcome = 'win';
      afterContest(s, b, MON + HOUR);
    }
    expect(leagueView(s, MON + HOUR).left).toBe(0);
    expect(leagueBattle(s, 9, MON + HOUR)).toContain('打完');
    leagueView(s, MON + 7 * 24 * HOUR);
    expect(s.p4.league.claim).not.toBeNull();
    const rep = s.p3.sect.rep;
    claimLeague(s, MON + 7 * 24 * HOUR);
    expect(s.p3.sect.rep).toBeGreaterThan(rep);
  });

  it('跨区只在周末、80级以上；赢了加分；周一按名次领奖', () => {
    const s = hero(79);
    expect(kuaquReason(s, SAT)).toContain('80级');
    s.player.level = 85;
    expect(kuaquReason(s, MON)).toContain('周六');
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
    kuaquView(s, MON + 7 * 24 * HOUR);
    expect(s.p4.kuaqu.claim?.points).toBe(v.points);
    expect(claimKuaqu(s, MON + 7 * 24 * HOUR)[0]).toContain('跨区大战');
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
    autoplay(s0, 11, 6000, 60);
    expect(s0.player.level).toBeGreaterThanOrEqual(60);
    joinNation(s0, 'wei', SAT);
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
    const N = 20;
    for (let k = 0; k < N; k++) {
      let s = deserialize(snap);
      const w = syncWorld(s, SAT);
      const id = attackTargets(s, w)[0];
      if (drive(s, gzBattle(s, id, 'atk', 100 + k, SAT) as Battle) === 'win') win.atk++;
      s = deserialize(snap);
      syncWorld(s, SAT).cities[id].troops = 0;
      if (drive(s, gzBattle(s, id, 'boss', 200 + k, SAT) as Battle) === 'win') win.boss++;
      s = deserialize(snap);
      if (drive(s, leagueBattle(s, 300 + k, SAT) as Battle) === 'win') win.league++;
    }
    console.log('P4 实战胜率', s0.player.level, JSON.stringify(win));
    expect(win.atk / N).toBeGreaterThan(0.7);
    expect(win.boss / N).toBeGreaterThan(0.5);
    expect(win.league / N).toBeGreaterThan(0.5);
  }, 300000);
});
