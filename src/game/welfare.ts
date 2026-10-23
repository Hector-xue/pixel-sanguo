// 福利与道具：发奖励、宝箱、体力丹、江湖行记（里程碑）、战备补给（按场次）、每日结算、技能书、宝石珍矿
import { GEM_KINDS, balance, gemId, items, systems, equips } from '../data';
import type { LootEntry, Reward } from '../data';
import { Rng } from '../core/rng';
import { giveRandomRecruit, giveRecruit } from './generals';
import type { Save } from './state';
import { addItem, addProf, bump, dayKey, dayNum, findGeneral, generalStats, isDeployed, log, playerStats, removeItem, rollRng } from './state';

// ===== 发奖励 =====
export function grantReward(s: Save, r: Reward): string[] {
  const out: string[] = [];
  const got: string[] = [];
  if (r.silver) {
    s.player.silver += r.silver;
    got.push(`银两${r.silver}`);
  }
  if (r.gold) {
    s.player.gold += r.gold;
    got.push(`金砖${r.gold}`);
  }
  for (const [id, n] of Object.entries(r.items ?? {})) {
    const lost = addItem(s, id, n);
    got.push(`${items[id].name}×${n - lost}`);
    if (lost) out.push(`负重已满，${lost}个${items[id].name}没拿到`);
  }
  if (got.length) out.unshift(`获得${got.join('、')}`);
  if (r.general) {
    const line = r.general === 'yingcai' ? giveRandomRecruit(s, '英才') : r.general === 'jiangcai' ? giveRandomRecruit(s, '将才') : giveRecruit(s, r.general);
    if (line) out.push(line);
  }
  return out;
}

// 按人物等级给对应档的矿石；step=2 再高一档
export function oreFor(level: number, step = 1): string {
  // 能打的最高一档用的矿石（10 级以前也给铁矿石）
  const order = equips.tiers.slice(1);
  let base = 0;
  order.forEach((t, i) => {
    if (t.level <= Math.max(level, 10)) base = i;
  });
  return order[Math.min(order.length - 1, base + step - 1)].ore!;
}

export function randomGem(rng: Rng, level: number): string {
  return gemId(rng.pick(GEM_KINDS), Math.max(1, Math.min(balance.gem.maxLevel, level)));
}

// 从奖励表里按权重抽一项，换算成具体奖励
export function rollLoot(s: Save, table: LootEntry[], rng: Rng): Reward | null {
  const pool = table.filter((e) => !e.minLevel || s.player.level >= e.minLevel);
  const total = pool.reduce((n, e) => n + e.w, 0);
  let x = rng.next() * total;
  const e = pool.find((it) => (x -= it.w) < 0) ?? pool[pool.length - 1];
  if (!e || e.nothing) return null;
  const r: Reward = {};
  if (e.silver) r.silver = rng.int(e.silver[0], e.silver[1]);
  if (e.items) r.items = { ...e.items };
  if (e.ore) r.items = { ...r.items, [oreFor(s.player.level, e.ore)]: e.ore === 1 ? rng.int(1, 2) : 1 };
  if (e.gem) r.items = { ...r.items, [randomGem(rng, e.gem)]: 1 };
  if (e.general) r.general = e.general;
  return r;
}

export function openBox(s: Save, id: 'baoxiang' | 'gaojibaoxiang'): string {
  if (!removeItem(s, id, 1)) return `没有${items[id].name}`;
  const r = rollLoot(s, systems.boxes[id === 'baoxiang' ? 'box' : 'bigbox'], rollRng(s));
  bump(s, 'boxes');
  const lines = r ? grantReward(s, r) : ['里面是空的……'];
  log(s, `打开${items[id].name}：${lines.join('，')}`);
  return [`打开了${items[id].name}`, ...lines].join('\n');
}

export function openGemOre(s: Save): string {
  if (!removeItem(s, 'zhenkuang', 1)) return '没有宝石珍矿';
  const rng = rollRng(s);
  const gem = randomGem(rng, rng.chance(0.3) ? 3 : 2);
  addItem(s, gem, 1);
  return `敲开宝石珍矿，得到${items[gem].name}`;
}

// 技能书：给主角一个技能加熟练度
export function readSkillBook(s: Save, skillId: string): string {
  const st = s.player.skills.find((x) => x.id === skillId);
  if (!st) return '还没学这个技能';
  if (!removeItem(s, 'jinengshu', 1)) return '没有技能书';
  const before = st.prof;
  addProf(st, items.jinengshu.amount ?? 0);
  return `熟练度+${st.prof - before}${st.prof - before < (items.jinengshu.amount ?? 0) ? '（已到本级上限，去技能学校升级）' : ''}`;
}

// 技能书给副将用
export function readSkillBookGeneral(s: Save, uid: string, skillId: string): string {
  const g = findGeneral(s, uid);
  const st = g?.skills.find((x) => x.id === skillId);
  if (!g || !st) return '';
  if (!removeItem(s, 'jinengshu', 1)) return '没有技能书';
  const before = st.prof;
  addProf(st, items.jinengshu.amount ?? 0);
  return `${g.name}的熟练度+${st.prof - before}`;
}

// ===== 体力丹 =====
// 单机不按真实时间卡人：跑环不再扣体力。体力丹改成战斗外服下，主角和出战副将气血精力全满
export function eatPill(s: Save): string {
  const p = s.player;
  const st = playerStats(s);
  const gens = s.generals.filter((x) => isDeployed(s, x.uid));
  const full = p.hp >= st.maxHp && p.mp >= st.maxMp && gens.every((g) => {
    const gs = generalStats(g);
    return g.hp >= gs.maxHp && g.mp >= gs.maxMp;
  });
  if (full) return '气血精力都是满的';
  if (!removeItem(s, 'tilidan', 1)) return '没有体力丹';
  p.hp = st.maxHp;
  p.mp = st.maxMp;
  for (const g of gens) {
    const gs = generalStats(g);
    g.hp = gs.maxHp;
    g.mp = gs.maxMp;
  }
  return `服下体力丹，${gens.length ? `你和${gens.map((g) => g.name).join('、')}` : '你'}的气血精力都回满了`;
}

// ===== 江湖行记：七个里程碑，达成就能领（替代原来的七日签到；s.signin.count 是已领到第几个） =====
export interface Milestone {
  name: string;
  goal: string;
  done: (s: Save) => boolean;
  progress: (s: Save) => string;
}
export const MILESTONES: Milestone[] = [
  { name: '初出茅庐', goal: '打第一场仗', done: (s) => s.battles >= 1, progress: (s) => `${Math.min(1, s.battles)}/1` },
  { name: '小有名气', goal: '升到5级', done: (s) => s.player.level >= 5, progress: (s) => `${s.player.level}/5级` },
  { name: '收得良将', goal: '收服第一员副将', done: (s) => s.generals.length + s.inn.length >= 1, progress: (s) => `${Math.min(1, s.generals.length + s.inn.length)}/1` },
  { name: '身经百战', goal: '累计打30场仗', done: (s) => s.battles >= 30, progress: (s) => `${Math.min(30, s.battles)}/30` },
  { name: '崭露头角', goal: '升到15级', done: (s) => s.player.level >= 15, progress: (s) => `${s.player.level}/15级` },
  { name: '江湖故交', goal: '和一位江湖人交情到「熟络」', done: (s) => Object.values(s.p5.favor).some((f) => f >= 30), progress: (s) => `最高交情${Math.max(0, ...Object.values(s.p5.favor))}/30` },
  { name: '名动一方', goal: '升到20级', done: (s) => s.player.level >= 20, progress: (s) => `${s.player.level}/20级` },
];

export function milestoneReady(s: Save): boolean {
  const m = MILESTONES[s.signin.count];
  return !!m && m.done(s);
}

export function claimMilestone(s: Save): string {
  const m = MILESTONES[s.signin.count];
  if (!m) return '江湖行记已经全部领完';
  if (!m.done(s)) return `还没做到：${m.goal}（${m.progress(s)}）`;
  const r = systems.signin.days[s.signin.count];
  s.signin.count++;
  const lines = grantReward(s, r);
  log(s, `江湖行记「${m.name}」：${lines.join('，')}`);
  return [`江湖行记「${m.name}」`, ...lines].join('\n');
}

// ===== 战备补给：每打 SUPPLY_EVERY 场攒一份，最多攒 SUPPLY_CAP 份，五档奖励轮着发（替代原来的在线奖励） =====
export const SUPPLY_EVERY = 10;
export const SUPPLY_CAP = 3;

export function suppliesReady(s: Save): number {
  return Math.max(0, Math.min(SUPPLY_CAP, Math.floor(s.battles / SUPPLY_EVERY) - s.p5.supply));
}

// 下一份补给离攒好还差几场
export function supplyNext(s: Save): number {
  return SUPPLY_EVERY - (s.battles % SUPPLY_EVERY);
}

export function nextSupply(s: Save): Reward {
  const tiers = systems.online.tiers;
  return tiers[s.p5.supply % tiers.length];
}

export function claimSupply(s: Save): string {
  if (!suppliesReady(s)) return `再打${supplyNext(s)}场仗，补给就到了`;
  // 攒满了还不领，多出来的那几份作废：领的时候把计数追到「最多欠 CAP 份」
  s.p5.supply = Math.max(s.p5.supply, Math.floor(s.battles / SUPPLY_EVERY) - SUPPLY_CAP);
  const r = nextSupply(s);
  s.p5.supply++;
  const lines = grantReward(s, r);
  log(s, `战备补给：${lines.join('，')}`);
  return ['战备补给到了', ...lines].join('\n');
}

export function welfarePending(s: Save): boolean {
  return milestoneReady(s) || suppliesReady(s) > 0;
}

// ===== 每日结算：钱庄利息（副将忠诚改成按打仗场数掉，见 encounter） =====
export function dailyTick(s: Save, now = Date.now()): string[] {
  const day = dayKey(now);
  if (s.day === day) return [];
  const out: string[] = [];
  if (s.day) {
    const days = Math.max(1, Math.min(7, dayNum(now) - (s.dayN ?? dayNum(now) - 1)));
    if (s.bank > 0) {
      const gain = Math.min(balance.bank.interestCap, Math.floor(s.bank * balance.bank.interestDaily * days));
      if (gain > 0) {
        s.bank += gain;
        out.push(`钱庄利息${gain}两`);
      }
    }
  }
  s.day = day;
  s.dayN = dayNum(now);
  for (const l of out) log(s, l);
  return out;
}
