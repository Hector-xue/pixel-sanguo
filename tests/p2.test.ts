import { decayLoyalty } from '../src/game/generals';
import { describe, expect, it } from 'vitest';
import { gemId, items, mainQuests, systems } from '../src/data';
import { gearBonus, gearName } from '../src/core/gear';
import type { ClassId, Gender } from '../src/core/types';
import { aiPools, betChibi, chibiView, chibiWinner, guessCollect, guessPick, guessStart, roundId, settleChibi } from '../src/game/casino';
import { afterGuard, digOnce, nextIsGuard, startDig } from '../src/game/dig';
import { finishBattle } from '../src/game/encounter';
import { generalLearn, generalSkillRows, giveRecruit, readXinfa, recruitWith, rerollApt, rewardGeneral, starUp } from '../src/game/generals';
import { abandonRing, nextRing, taskDone, turnInRing } from '../src/game/ring';
import { buyGear, combineGem, combineOre, equipGear, forge, forgeRows, removeGem, sellGear, socketGem, unequip } from '../src/game/smith';
import {
  acceptQuest, addItem, arrive, bagCount, bagUsed, deserialize, findGeneral, findPath, generalAttrs, generalStats, makeGeneral, newSave,
  playerStats, serialize, setActive,
} from '../src/game/state';
import { buyGold, buyMount, deposit, ride, sellGold, teleport, teleportTargets, templeGraduate, templeJoin, withdraw } from '../src/game/town';
import { MILESTONES, SUPPLY_CAP, claimMilestone, claimSupply, dailyTick, eatPill, milestoneReady, openBox, suppliesReady } from '../src/game/welfare';
import { Rng } from '../src/core/rng';
import { autoplay } from '../src/sim/autoplay';

const fresh = (classId: ClassId = 'warrior', gender: Gender = 'male') => newSave({ server: '1区', name: '测试', gender, classId, avatar: 0, seed: 5 });
const DAY = 86400000;
const T0 = Date.UTC(2026, 3, 1, 4);

describe('装备', () => {
  it('武器店只卖1级、本职业武器；穿上后面板变化，脱下回背包', () => {
    const s = fresh('scholar');
    s.player.silver = 1000;
    expect(buyGear(s, 'weapon')).toContain('竹扇');
    const g = s.gear[0];
    const atk = playerStats(s).atk;
    expect(equipGear(s, g.uid)).toContain('穿上');
    expect(playerStats(s).atk).toBe(atk + 8);
    expect(s.flags.equipped).toBe(true);
    expect(unequip(s, 'weapon')).toContain('脱下');
    expect(s.gear.length).toBe(1);
    expect(sellGear(s, g.uid)).toContain('卖出');
    expect(s.gear.length).toBe(0);
  });

  it('打造要等级、矿石、银两；装备占负重', () => {
    const s = fresh();
    s.player.silver = 5000;
    expect(forgeRows(s, 'armor')[0].reason).toContain('10级');
    s.player.level = 10;
    expect(forgeRows(s, 'armor')[0].reason).toContain('铁矿石0/3');
    addItem(s, 'tiekuang', 3);
    const used = bagUsed(s);
    expect(forge(s, 'armor', 2)).toContain('打造成功');
    expect(bagCount(s, 'tiekuang')).toBe(0);
    expect(s.player.silver).toBe(4500);
    expect(bagUsed(s)).toBe(used - 3 + 1);
    expect(s.gear[0].gems.length).toBe(1);
    expect(s.flags.forged).toBe(true);
  });

  it('等级不够穿不上高级装备，武器有属性门槛', () => {
    const s = fresh('warrior');
    s.player.level = 20;
    s.gear.push({ uid: 'x', slot: 'weapon', tier: 3, cls: 'warrior', q: 0, gems: [null] });
    s.player.added.str = 0;
    // 20级武士力量 6+19=25 ≥ 20，能穿
    expect(equipGear(s, 'x')).toContain('穿上');
    s.gear.push({ uid: 'y', slot: 'weapon', tier: 4, cls: 'warrior', q: 0, gems: [null, null] });
    expect(equipGear(s, 'y')).toContain('30级');
    s.gear.push({ uid: 'z', slot: 'weapon', tier: 1, cls: 'mystic', q: 0, gems: [] });
    expect(equipGear(s, 'z')).toContain('本职业');
  });

  it('矿石3合1，宝石3合1，宝石镶嵌加属性、拆下要钱', () => {
    const s = fresh();
    s.player.silver = 10000;
    addItem(s, 'tiekuang', 3);
    expect(combineOre(s, 'jingtie')).toContain('精铁矿');
    expect(bagCount(s, 'jingtie')).toBe(1);
    addItem(s, gemId('zuanshi', 1), 3);
    expect(combineGem(s, 'zuanshi', 1)).toContain('2级钻石');
    s.player.level = 10;
    s.equip.armor = { uid: 'a', slot: 'armor', tier: 2, q: 0, gems: [null] };
    const before = playerStats(s);
    expect(socketGem(s, { slot: 'armor' }, 0, gemId('zuanshi', 2))).toContain('镶到');
    const after = playerStats(s);
    expect(after.resist.phys - before.resist.phys).toBe(12);
    expect(after.rates.crit - before.rates.crit).toBe(2);
    expect(s.flags.gemmed).toBe(true);
    expect(removeGem(s, { slot: 'armor' }, 0)).toContain('拆下');
    expect(bagCount(s, gemId('zuanshi', 2))).toBe(1);
  });

  it('蓝宝石加体质，体质再换算成气血', () => {
    const s = fresh();
    const hp = playerStats(s).maxHp;
    s.equip.head = { uid: 'h', slot: 'head', tier: 2, q: 0, gems: [gemId('lanbaoshi', 1)] };
    expect(playerStats(s).maxHp).toBe(hp + 50 + 2 * 8);
    expect(gearName(s.equip.head)).toBe('铁盔');
    expect(gearBonus({ ...s.equip.head, q: 1, gems: [] }).hp).toBe(Math.round(50 * 1.15));
  });
});

describe('副将养成', () => {
  it('将军令招英才、令牌招指定的人，随行满了进馆驿', () => {
    const s = fresh();
    s.player.level = 20;
    addItem(s, 'jiangjunling', 1);
    addItem(s, 'zhaoyunling', 1);
    expect(recruitWith(s, 'jiangjunling')).toContain('成为了你的副将');
    expect(s.generals[0].grade).toBe('英才');
    expect(s.generals[0].level).toBe(15);
    recruitWith(s, 'zhaoyunling');
    expect(s.generals[1].name).toBe('赵云');
    expect(s.generals[1].grade).toBe('将才');
    giveRecruit(s, 'daqiao');
    giveRecruit(s, 'xiaoqiao');
    expect(s.inn[0].name).toBe('小乔');
    expect(s.flags.recruited).toBe(true);
  });

  it('常人不能学技能；英才10级后能学，学别的职业的技能就转职业、换外形', () => {
    const s = fresh();
    const cap = makeGeneral(s, 'caokou', 12, new Rng(1));
    expect(generalSkillRows(cap).every((r) => r.action === null)).toBe(true);
    s.player.level = 20;
    giveRecruit(s, 'chendeng');
    const g = s.generals[0];
    expect(g.classId).toBe('warrior');
    expect(generalLearn(s, g.uid, 'huadi')).toContain('休息');
    setActive(s, null);
    expect(generalLearn(s, g.uid, 'huadi')).toContain('文人');
    expect(g.classId).toBe('scholar');
    expect(g.look).toBe('cls:g_chendeng:scholar');
    expect(g.skills.map((k) => k.id)).toEqual(['huadi']);
  });

  it('心法书加经验；奖赏加忠诚；洗资质换资质；升星要等级和将军令', () => {
    const s = fresh();
    s.player.level = 30;
    s.player.silver = 100000;
    giveRecruit(s, 'caobao');
    const g = s.generals[0];
    addItem(s, 'xinfa2', 1);
    readXinfa(s, g.uid, 'xinfa2');
    expect(g.exp).toBe(12000);
    expect(bagCount(s, 'xinfa2')).toBe(0);
    g.loyalty = 50;
    expect(rewardGeneral(s, g.uid)).toContain('忠诚+10');
    expect(g.loyalty).toBe(60);
    expect(rerollApt(s, g.uid)).toContain('将军令');
    addItem(s, 'jiangjunling', 2);
    expect(rerollApt(s, g.uid)).toContain('重洗');
    const st = generalStats(g);
    expect(starUp(s, g.uid)).toContain('1星');
    expect(generalStats(g).atk).toBeGreaterThan(st.atk);
  });

  it('副将属性=起点+资质成长，洗资质后能重算', () => {
    const s = fresh();
    const g = makeGeneral(s, 'caokou', 5, new Rng(3));
    const a5 = generalAttrs(g);
    g.level = 15;
    const a15 = generalAttrs(g);
    expect(a15.con).toBeGreaterThan(a5.con);
    expect(Math.abs(a15.con - a5.con - 10 * 2 * g.apt.con * g.apt.growth)).toBeLessThan(1);
  });

  it('忠诚低于60时有概率不听指挥', async () => {
    const { createBattle, resolveRound } = await import('../src/core/battle');
    const { generalUnit, monsterUnit, playerUnit } = await import('../src/game/encounter');
    const s = fresh();
    const g = makeGeneral(s, 'caokou', 10, new Rng(3));
    g.loyalty = 0;
    let disobey = 0;
    for (let seed = 0; seed < 30; seed++) {
      const b = createBattle({ seed, allies: [playerUnit(s), generalUnit(g)], enemies: [monsterUnit('e0', 'xiaotou', 1, 0)], items: {}, title: '' });
      const ev = resolveRound(b, [{ actor: g.uid, type: 'attack', target: 'e0' }, { actor: 'p', type: 'defend' }]);
      if (ev.some((e) => e.t === 'text' && e.text.includes('不听指挥'))) disobey++;
    }
    expect(disobey).toBeGreaterThan(5);
  });
});

describe('跑环', () => {
  it('20级才开；接环不要体力；完成后交给跑环使者；10环一轮给技能书；放弃要从头来', () => {
    const s = fresh();
    expect(nextRing(s, T0)).toContain('20级');
    s.player.level = 20;
    for (const loc of ['xuchang', 'xuchangjiaowai', 'xuchangxijiao']) arrive(s, loc);
    expect(nextRing(s, T0)).toContain('第1环');
    expect(s.ring.index).toBe(1);
    expect(turnInRing(s).ok).toBe(false);
    for (let i = 1; i <= 10; i++) {
      if (!s.ring.task) nextRing(s, T0);
      const t = s.ring.task!;
      if (t.type === 'buy' || t.type === 'deliver') addItem(s, t.item!, t.count);
      else if (t.type === 'goto') t.arrived = true;
      else t.have = t.count;
      expect(taskDone(s, t)).toBe(true);
      const r = turnInRing(s);
      expect(r.ok).toBe(true);
    }
    expect(s.flags.ringRound).toBe(true);
    expect(s.ring.index).toBe(0);
    expect(s.life.ringRounds).toBe(1);
    nextRing(s, T0);
    expect(abandonRing(s)).toContain('第一环');
    expect(s.ring.index).toBe(0);
  });

  it('送信任务走到地方就算完成', () => {
    const s = fresh();
    s.ring = { index: 3, task: { type: 'goto', at: 'cunbei', count: 1, have: 0, arrived: false } };
    arrive(s, 'cunbei');
    expect(taskDone(s, s.ring.task!)).toBe(true);
  });
});

describe('福利与体力丹', () => {
  it('江湖行记按里程碑依次领，做不到不能领，第七件送大乔', () => {
    const s = fresh();
    expect(milestoneReady(s)).toBe(false);
    expect(claimMilestone(s)).toContain('还没做到');
    s.battles = 30;
    s.player.level = 20;
    s.p5.favor.cunzhang = 30;
    for (let i = 0; i < MILESTONES.length; i++) {
      if (i === 2) {
        // 第三件要有副将：先卡住，收了副将才能往下领
        expect(milestoneReady(s)).toBe(false);
        s.inn.push({ uid: 'g1', name: '测试' } as never);
      }
      expect(milestoneReady(s)).toBe(true);
      expect(claimMilestone(s)).toContain(MILESTONES[i].name);
    }
    expect([...s.generals, ...s.inn].some((g) => g.name === '大乔')).toBe(true);
    expect(claimMilestone(s)).toContain('全部领完');
  });

  it('战备补给按场次攒，最多攒三份，轮着发', () => {
    const s = fresh();
    expect(suppliesReady(s)).toBe(0);
    expect(claimSupply(s)).toContain('再打10场');
    s.battles = 10;
    expect(suppliesReady(s)).toBe(1);
    expect(claimSupply(s)).toContain('银两');
    expect(suppliesReady(s)).toBe(0);
    s.battles = 200;
    expect(suppliesReady(s)).toBe(SUPPLY_CAP);
    claimSupply(s);
    // 攒满后多出来的作废，领一份后还剩两份
    expect(suppliesReady(s)).toBe(SUPPLY_CAP - 1);
  });

  it('体力丹战斗外回满主角和出战副将', () => {
    const s = fresh();
    expect(eatPill(s)).toContain('满的');
    s.player.hp = 1;
    expect(eatPill(s)).toContain('没有');
    addItem(s, 'tilidan', 1);
    expect(eatPill(s)).toContain('回满');
    expect(s.bag.tilidan ?? 0).toBe(0);
    expect(s.player.hp).toBeGreaterThan(1);
  });

  it('宝箱能开出东西；钱庄按天有利息；副将忠诚不再按天掉，改成每打30场掉一点', () => {
    const s = fresh();
    addItem(s, 'baoxiang', 1);
    expect(openBox(s, 'baoxiang')).toContain('打开了宝箱');
    s.bank = 100000;
    s.generals.push(makeGeneral(s, 'caokou', 3, new Rng(1)));
    const l0 = s.generals[0].loyalty;
    dailyTick(s, T0);
    dailyTick(s, T0 + DAY);
    expect(s.generals[0].loyalty).toBe(l0);
    expect(s.bank).toBe(100200);
    expect(decayLoyalty(s)).toBe(true);
    expect(s.generals[0].loyalty).toBe(l0 - 5);
  });
});

describe('城镇设施', () => {
  it('钱庄存取、金砖兑换', () => {
    const s = fresh();
    s.player.silver = 3000;
    deposit(s, 1000);
    expect(s.bank).toBe(1000);
    withdraw(s, 500);
    expect(s.player.silver).toBe(2500);
    buyGold(s, 2);
    expect(s.player.gold).toBe(2);
    sellGold(s, 1);
    expect(s.player.gold).toBe(1);
  });

  it('馆驿只能传送到去过的城镇', () => {
    const s = fresh();
    s.player.silver = 1000;
    expect(teleportTargets(s).find((t) => t.id === 'xuchang')?.ok).toBe(false);
    arrive(s, 'xuchang');
    arrive(s, 'xinshoucun');
    expect(teleport(s, 'xuchang')).toContain('传送到了许昌');
    expect(s.location).toBe('xuchang');
  });

  it('孔庙拜师经验加成，40级出师', () => {
    const s = fresh();
    s.player.silver = 2000;
    expect(templeJoin(s)).toContain('拜师成功');
    expect(templeGraduate(s)).toContain('40级');
    s.player.level = 40;
    expect(templeGraduate(s)).toContain('出师');
  });

  it('坐骑：等级够才能买，骑上加速度和抗中计，打仗涨坐骑经验', () => {
    const s = fresh();
    s.player.silver = 5000;
    expect(buyMount(s, 'zhanma')).toContain('10级');
    s.player.level = 10;
    expect(buyMount(s, 'zhanma')).toContain('买下');
    const before = playerStats(s);
    ride(s, 'zhanma');
    const after = playerStats(s);
    expect(after.spd).toBe(before.spd + 2);
    expect(after.resist.chaos).toBe(before.resist.chaos + 3);
    expect(s.flags.mounted).toBe(true);
  });
});

describe('挖宝', () => {
  it('一把铲子挖10铲，第3、6、9铲是守卫战；守卫打输铲子就没了', () => {
    const s = fresh();
    s.location = 'baodong';
    addItem(s, 'chanzi', 2);
    expect(startDig(s)).toContain('10铲');
    expect(digOnce(s).kind).toBe('loot');
    expect(digOnce(s).kind).toBe('loot');
    expect(nextIsGuard(s)).toBe(true);
    expect(digOnce(s).kind).toBe('guard');
    const lines = afterGuard(s, true);
    expect(lines.join()).toContain('宝箱');
    expect(s.dig!.n).toBe(3);
    for (let i = 0; i < 2; i++) digOnce(s);
    expect(digOnce(s).kind).toBe('guard');
    afterGuard(s, false);
    expect(s.dig).toBe(null);
  });
});

describe('娱乐场', () => {
  it('赤壁：奖池分成，押中按比例分走全部奖池（抽一成）', () => {
    const s = fresh();
    s.player.silver = 50000;
    const now = roundId(T0) * 180000 + 1000;
    const w = chibiWinner(roundId(now));
    expect(betChibi(s, w, 10000, now)).toContain('押');
    expect(betChibi(s, (w + 1) % 3, 1000, now)).toContain('押');
    const end = (roundId(now) + 1) * 180000;
    const pools = aiPools(roundId(now), end);
    pools[w] += 10000;
    pools[(w + 1) % 3] += 1000;
    const total = pools.reduce((a, b) => a + b, 0);
    const expectWin = Math.floor((10000 * total * 0.9) / pools[w]);
    expect(settleChibi(s, end + 10)).toContain('胜');
    expect(s.player.silver).toBe(50000 - 11000 + expectWin);
    expect(s.casino.net).toBe(expectWin - 11000);
    expect(chibiView(s, end + 20).mine).toEqual([0, 0, 0]);
  });

  it('猜猜看：猜中翻2.5倍可以收手，猜错押金没了', () => {
    const s = fresh();
    s.player.silver = 1000;
    guessStart(s, 400);
    expect(s.player.silver).toBe(600);
    let r = guessPick(s, 0);
    while (r.win) {
      guessCollect(s);
      guessStart(s, 100);
      r = guessPick(s, 0);
    }
    expect(s.casino.guess).toBe(null);
  });
});

describe('存档兼容', () => {
  it('P1 的存档能读：副将属性换算后不变，新字段补默认值', () => {
    const s = fresh();
    const g = makeGeneral(s, 'caokou', 8, new Rng(2));
    const old = JSON.parse(serialize({ ...s, generals: [g] }));
    for (const k of ['equip', 'gear', 'storage', 'bank', 'mounts', 'riding', 'ring', 'signin', 'casino', 'life']) delete old[k];
    old.generals[0].attrs = generalAttrs(g);
    delete old.generals[0].base;
    delete old.generals[0].baseLevel;
    const back = deserialize(JSON.stringify(old));
    expect(generalAttrs(back.generals[0])).toEqual(generalAttrs(g));
    expect(back.equip).toEqual({});
    expect(back.ring.index).toBe(0);
    expect(findGeneral(back, g.uid)).toBeTruthy();
  });

  it('许昌全线都能走到，陈留锁着', () => {
    expect(findPath('xinshoucun', 'panjun5')).toBeTruthy();
    expect(findPath('xinshoucun', 'yingshui')).toBeTruthy();
    expect(findPath('xinshoucun', 'zhongmou')).toBeTruthy();
    const s = fresh();
    s.main.step = mainQuests.findIndex((q) => q.id === 'm14');
    acceptQuest(s);
    expect(s.main.state).toBe('active');
  });

  it('物品表里宝石是自动生成的', () => {
    expect(items[gemId('hongbaoshi', 3)].name).toBe('3级红宝石');
    expect(systems.signin.days.length).toBe(7);
  });

  it('战斗结算不报错（宝洞守卫战）', async () => {
    const { guardBattle } = await import('../src/game/dig');
    const s = fresh();
    s.location = 'baodong';
    s.dig = { left: 8, n: 2 };
    const b = guardBattle(s, 1);
    b.outcome = 'lose';
    finishBattle(s, b);
    expect(s.dig).toBe(null);
  });
});

describe('P2 自动通关模拟（1级打到许昌篇结束）', () => {
  for (const classId of ['warrior', 'scholar', 'mystic'] as ClassId[]) {
    for (const gender of ['male', 'female'] as Gender[]) {
      it(`${classId}/${gender} 打通许昌篇，40级以上`, () => {
        const s = fresh(classId, gender);
        const rep = autoplay(s, 11, 1500, mainQuests.findIndex((q) => q.id === 'm36'));
        console.log(classId, gender, JSON.stringify({ battles: rep.battles, losses: rep.losses, level: rep.level, rings: rep.rings }));
        expect(rep.finished).toBe(true);
        expect(rep.level).toBeGreaterThanOrEqual(40);
        expect(rep.level).toBeLessThanOrEqual(48);
        expect(rep.rings).toBeGreaterThanOrEqual(10);
        expect(rep.battles).toBeLessThan(800);
      }, 60000);
    }
  }
});
