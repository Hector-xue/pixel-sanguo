// 福利与道具：发奖励、宝箱、体力（体力丹）、七日签到、在线奖励、每日结算、技能书、宝石珍矿
import { GEM_KINDS, balance, gemId, items, systems, equips } from '../data';
import type { LootEntry, Reward } from '../data';
import { Rng } from '../core/rng';
import { decayLoyalty, giveRandomRecruit, giveRecruit } from './generals';
import type { Save } from './state';
import { addItem, addProf, bump, dayKey, dayNum, findGeneral, log, removeItem, rollRng } from './state';

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

// ===== 体力 =====
const ST = balance.stamina;

export function staminaMax(): number {
  return ST.max;
}

// 按真实时间恢复体力
export function staminaNow(s: Save, now = Date.now()): number {
  const step = ST.regenMinutes * 60000;
  if (s.stamina >= ST.max) {
    s.staminaAt = now;
    return s.stamina;
  }
  const n = Math.floor((now - s.staminaAt) / step);
  if (n > 0) {
    s.stamina = Math.min(ST.max, s.stamina + n);
    s.staminaAt += n * step;
  }
  return s.stamina;
}

export function spendStamina(s: Save, n: number, now = Date.now()): boolean {
  if (staminaNow(s, now) < n) return false;
  if (s.stamina >= ST.max) s.staminaAt = now;
  s.stamina -= n;
  return true;
}

export function eatPill(s: Save, now = Date.now()): string {
  const day = dayKey(now);
  if (s.pills.day !== day) s.pills = { day, n: 0 };
  if (s.pills.n >= ST.pillPerDay) return `今天已经吃了${ST.pillPerDay}颗体力丹`;
  if (staminaNow(s, now) >= ST.max) return '体力是满的';
  if (!removeItem(s, 'tilidan', 1)) return '没有体力丹';
  s.pills.n++;
  s.stamina = Math.min(ST.max, s.stamina + ST.pill);
  return `体力+${ST.pill}（${s.stamina}/${ST.max}），今天还能吃${ST.pillPerDay - s.pills.n}颗`;
}

// ===== 七日签到（累计签到，漏签不清零） =====
export function canSignIn(s: Save, now = Date.now()): boolean {
  return s.signin.count < systems.signin.days.length && s.signin.day !== dayKey(now);
}

export function signIn(s: Save, now = Date.now()): string {
  if (!canSignIn(s, now)) return s.signin.count >= systems.signin.days.length ? '七日签到已经全部领完' : '今天已经签过到了';
  const r = systems.signin.days[s.signin.count];
  s.signin.count++;
  s.signin.day = dayKey(now);
  const lines = grantReward(s, r);
  log(s, `第${s.signin.count}天签到：${lines.join('，')}`);
  return [`第${s.signin.count}天签到成功`, ...lines].join('\n');
}

// ===== 在线奖励（按当天在线时长） =====
export function onlineTick(s: Save, seconds: number, now = Date.now()): void {
  const day = dayKey(now);
  if (s.online.day !== day) s.online = { day, seconds: 0, claimed: [] };
  s.online.seconds += seconds;
}

export function onlineMinutes(s: Save, now = Date.now()): number {
  return s.online.day === dayKey(now) ? Math.floor(s.online.seconds / 60) : 0;
}

export function claimOnline(s: Save, i: number, now = Date.now()): string {
  const t = systems.online.tiers[i];
  if (!t) return '';
  onlineTick(s, 0, now);
  if (s.online.claimed.includes(i)) return '已经领过了';
  if (onlineMinutes(s, now) < t.minutes) return `今天在线满${t.minutes}分钟才能领`;
  s.online.claimed.push(i);
  return grantReward(s, t).join('\n');
}

export function welfarePending(s: Save, now = Date.now()): boolean {
  if (canSignIn(s, now)) return true;
  const m = onlineMinutes(s, now);
  return systems.online.tiers.some((t, i) => m >= t.minutes && !(s.online.day === dayKey(now) && s.online.claimed.includes(i)));
}

// ===== 每日结算：忠诚下降、钱庄利息 =====
export function dailyTick(s: Save, now = Date.now()): string[] {
  const day = dayKey(now);
  if (s.day === day) return [];
  const out: string[] = [];
  if (s.day) {
    const days = Math.max(1, Math.min(7, dayNum(now) - (s.dayN ?? dayNum(now) - 1)));
    decayLoyalty(s, days);
    if (s.bank > 0) {
      const gain = Math.min(balance.bank.interestCap, Math.floor(s.bank * balance.bank.interestDaily * days));
      if (gain > 0) {
        s.bank += gain;
        out.push(`钱庄利息${gain}两`);
      }
    }
    if (s.generals.length + s.inn.length) out.push('新的一天，副将的忠诚下降了，记得去奖赏');
  }
  s.day = day;
  s.dayN = dayNum(now);
  for (const l of out) log(s, l);
  return out;
}
