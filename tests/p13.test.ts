import { describe, expect, it } from 'vitest';
import { locations, mainQuests } from '../src/data';
import { deserialize, newSave, playerStats, serialize } from '../src/game/state';
import { sweep, sweepReason, sweepText } from '../src/game/sweep';
import { dailyCount, dailyItems } from '../src/game/daily';
import { finishBattle } from '../src/game/encounter';
import { joinNation, syncWorld } from '../src/game/guozhan';
import { storyTick } from '../src/game/gzstory';
import { floorBoss, floorLevel, floorPower, floorReward, towerBattle, towerBest, towerLossesLeft, towerReason } from '../src/game/tower';

const hero = (level: number, at: string) => {
  const s = newSave({ server: '1', name: '速战', gender: 'female', classId: 'scholar', avatar: 0, seed: 9 });
  s.player.level = level;
  s.location = at;
  s.player.hp = playerStats(s).maxHp;
  s.player.mp = playerStats(s).maxMp;
  return s;
};

describe('速战', () => {
  it('只给比自己低很多级的普通怪', () => {
    expect(sweepReason(hero(5, 'cunbei'), locations.cunbei.groups[0])).toMatch(/级以后/);
    expect(sweepReason(hero(20, 'cuizhushangu'), locations.cuizhushangu.groups[0])).toMatch(/低10级/);
    expect(sweepReason(hero(30, 'cuizhushangu'), locations.cuizhushangu.groups[0])).toBeNull();
    // 头目不给速战
    expect(sweepReason(hero(60, 'shanzeiyingzhai'), locations.shanzeiyingzhai.groups[1])).toMatch(/头目/);
  });

  it('连战照常结算经验银两，不进录像；血少了停下', () => {
    const s = hero(30, 'cuizhushangu');
    const exp0 = s.player.exp;
    const silver0 = s.player.silver;
    const battles0 = s.battles;
    let seed = 1;
    const r = sweep(s, 0, 10, () => seed++);
    expect(r.fights).toBe(10);
    expect(r.wins).toBe(10);
    expect(s.battles - battles0).toBe(10);
    expect(s.player.silver - silver0).toBe(r.silver);
    expect(r.exp).toBeGreaterThan(0);
    expect(s.player.exp).not.toBe(exp0);
    expect(s.p3.replays.length).toBe(0);
    expect(sweepText(r)[0]).toBe('速战10场，赢10场');

    s.player.hp = 1;
    const r2 = sweep(s, 0, 10, () => seed++);
    expect(r2.fights).toBe(0);
    expect(r2.stop).toMatch(/气血/);
  });
});

describe('今日事务', () => {
  it('没解锁的不列，有事的排前面；办完的变灰', () => {
    const s = hero(5, 'xinshoucun');
    const names = dailyItems(s).map((x) => x.name);
    expect(names).toContain('文曲星答题');
    expect(names).toContain('擂台');
    expect(names).not.toContain('银两环');
    expect(names).not.toContain('国战军令');
    const n = dailyCount(s);
    expect(n).toBeGreaterThan(0);
    // 文曲星答完了就不算待办，排到后面
    s.p3.wenqu.answered = [0, 1, 2, 3, 4];
    const list = dailyItems(s);
    const wq = list.find((x) => x.name === '文曲星答题')!;
    expect(wq.todo).toBe(false);
    expect(dailyCount(s)).toBe(n - 1);
    expect(list.findIndex((x) => !x.todo)).toBe(list.filter((x) => x.todo).length);
  });

  it('60级没入国提示国战，40级有银两环', () => {
    const s = hero(60, 'xuchang');
    const names = dailyItems(s).map((x) => x.name);
    expect(names).toContain('银两环');
    expect(dailyItems(s).find((x) => x.name === '国战')?.todo).toBe(true);
  });
});

describe('演武塔', () => {
  it('80级开放；层数越高越难，每10层名将', () => {
    expect(towerReason(hero(79, 'xuchang'))).toMatch(/80级/);
    expect(floorLevel(1)).toBe(80);
    expect(floorLevel(200)).toBe(160);
    expect(floorPower(1)).toBe(1);
    expect(floorPower(21)).toBeGreaterThan(floorPower(20));
    expect(floorBoss(9)).toBeNull();
    expect(floorBoss(10)).not.toBeNull();
    expect(floorBoss(20)).not.toBe(floorBoss(10));
  });

  it('打赢上一层、首通给奖励；输了记次数，输够了当天不能再打', () => {
    const s = hero(100, 'xuchang');
    const b = towerBattle(s, 1);
    if (typeof b === 'string') throw new Error(b);
    expect(b.spar).toBe(true);
    expect(b.title).toBe('演武塔第1层');
    const silver = s.player.silver;
    b.outcome = 'win';
    const sum = finishBattle(s, b);
    expect(towerBest(s)).toBe(1);
    expect(s.player.silver - silver).toBe(floorReward(1).silver);
    expect(sum.lines[0]).toMatch(/拿下演武塔第1层/);
    expect(floorReward(10).items).toHaveProperty('jiangjunling');
    expect(floorReward(5).items).toHaveProperty('gaojibaoxiang');
    for (let k = 0; k < 3; k++) {
      const x = towerBattle(s, 2 + k);
      if (typeof x === 'string') throw new Error(x);
      x.outcome = 'lose';
      finishBattle(s, x);
    }
    expect(towerBest(s)).toBe(1);
    expect(towerLossesLeft(s)).toBe(0);
    expect(towerBattle(s, 9)).toMatch(/输了3次/);
  });
});

describe('国战纪事', () => {
  it('要地易主、只剩两城、都城被破各讲一次；没入国不讲', () => {
    const s = hero(60, 'xuchang');
    expect(storyTick(s)).toEqual([]);
    joinNation(s, 'wei');
    const w = syncWorld(s);
    for (const c of Object.values(w.cities)) if (c.owner === 'wei' || c.owner === 'qun') c.owner = 'wu';
    w.cities.luoyang.owner = 'wei';
    w.cities.xuchang.owner = 'wei';
    w.cities.chengdu.owner = 'wei';
    for (const id of ['hanzhong', 'shangyong']) w.cities[id].owner = 'wu';
    const beats = storyTick(s);
    const keys = beats.map((b) => b.key.split(':').slice(1).join(':'));
    expect(keys).toContain('key:luoyang:wei');
    expect(keys).toContain('cap:chengdu');
    expect(keys).toContain('stand:shu');
    expect(keys).toContain('lead:wu');
    const lo = beats.find((b) => b.key.endsWith('key:luoyang:wei'))!;
    expect(lo.lines[0].who).toMatch(/郭嘉$/);
    expect(lo.lines[0].text).toMatch(/魏国号令天下/);
    expect(beats.every((b) => b.lines.every((l) => !/\{/.test(l.text)))).toBe(true);
    // 讲过的不再讲
    expect(storyTick(s)).toEqual([]);
  });
});

describe('营寨亲兵（主线第三版插的任务）', () => {
  it('上一版的老存档停在「擒贼擒王」：换算后还是擒贼擒王，不会掉进新插的那步', () => {
    const s = hero(12, 'xinshoucun');
    const raw = JSON.parse(serialize(s));
    const v2 = mainQuests.filter((q) => q.id !== 'm10a').map((q) => q.id);
    raw.main = { step: v2.indexOf('m11'), state: 'active', count: 0, qv: 2 };
    const back = deserialize(JSON.stringify(raw));
    expect(mainQuests[back.main.step].id).toBe('m11');
    // 停在叩关的，交了叩关就接到营寨亲兵
    raw.main = { step: v2.indexOf('m10'), state: 'ready', count: 8, qv: 2 };
    const b2 = deserialize(JSON.stringify(raw));
    expect(mainQuests[b2.main.step].id).toBe('m10');
    expect(mainQuests[b2.main.step + 1].id).toBe('m10a');
  });
});
