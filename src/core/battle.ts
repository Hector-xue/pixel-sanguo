// 战斗内核：纯逻辑，不碰画面。一回合 = 双方下指令 → 回合开始结算中毒 → 按速度依次出手。
import { passiveOf } from './passives';
import { balance, items, skills } from '../data';
import { lerpLevel, resistReduce, skillMp } from './formulas';
import { Rng } from './rng';
import type { ClassId, ControlStatus, Gender, Rates, Resists, SkillDef, SkillState } from './types';
import { STATUS_NAMES } from './types';

export type Side = 'ally' | 'enemy';
export type UnitKind = 'player' | 'general' | 'monster' | 'mirror';

export interface PoisonStack {
  dmg: number;
  turns: number;
}

export interface UnitStatus {
  chaos: number;
  seal: number;
  trap: number;
  guard: { amount: number; turns: number; since: number } | null;
  poison: PoisonStack[];
}

export interface BUnit {
  id: string;
  name: string;
  side: Side;
  kind: UnitKind;
  refId: string;
  classId: ClassId;
  gender: Gender;
  look: string;
  level: number;
  row: 0 | 1;
  maxHp: number;
  hp: number;
  maxMp: number;
  mp: number;
  atk: number;
  def: number;
  spd: number;
  resist: Resists;
  rates: Rates;
  skills: SkillState[];
  aiSkills: { id: string; rate: number }[];
  status: UnitStatus;
  defending: boolean;
  alive: boolean;
  captured: boolean;
  historic: boolean;
  capturable: boolean;
  expYield: number;
  silverYield: number;
  monsterId?: string;
  profGain: Record<string, number>;
  variant?: number;
  // 副将忠诚：低了打仗时有概率不听指挥
  loyalty?: number;
  // 专属被动（PASSIVES 的键），和这场里打倒了几个人（无双用）、发没发过狂
  passive?: string;
  kills?: number;
  raged?: boolean;
}

export type CommandType = 'attack' | 'skill' | 'capture' | 'item' | 'summon' | 'defend' | 'flee';

export interface Command {
  actor: string;
  type: CommandType;
  target?: string;
  skill?: string;
  item?: string;
  summon?: string;
}

export type BEvent =
  | { t: 'round'; round: number }
  | { t: 'poison'; target: string; amount: number }
  | { t: 'act'; actor: string; label: string; target?: string; kind: 'melee' | 'cast' | 'none'; skill?: string }
  | { t: 'damage'; target: string; amount: number; crit?: boolean; fatal?: boolean; mp?: number; self?: boolean }
  | { t: 'miss'; target: string }
  | { t: 'heal'; target: string; hp: number; mp: number }
  | { t: 'status'; target: string; status: ControlStatus; ok: boolean }
  | { t: 'statusEnd'; target: string; status: ControlStatus }
  | { t: 'buff'; target: string; label: string }
  | { t: 'die'; target: string }
  | { t: 'capture'; target: string; ok: boolean }
  | { t: 'summon'; out?: string; in: string }
  | { t: 'flee'; ok: boolean }
  | { t: 'defend'; actor: string }
  | { t: 'text'; text: string }
  | { t: 'passive'; actor: string; label: string }
  | { t: 'end'; outcome: Outcome };

export type Outcome = 'win' | 'lose' | 'fled';

export interface Battle {
  rng: Rng;
  round: number;
  units: BUnit[];
  reserve: BUnit[];
  items: Record<string, number>;
  itemsUsed: Record<string, number>;
  captured: BUnit[];
  outcome: Outcome | null;
  title: string;
  canFlee: boolean;
  spar: boolean;
  lastCmd: Record<string, Command>;
  // 特殊战斗的标记（挖宝守卫等），战后结算用
  tag?: string;
  // 双方阵法（只给界面显示，数值开战前已经算进人身上）
  forms?: { ally: string; enemy: string | null; clash: number };
  // 战斗录像：开局快照 + 每回合的指令（同一种子重算就能复现）
  init?: BattleInit;
  log?: ReplayRound[];
}

// 一回合的录像：结算前的随机数状态 + 指令（AI 下指令也会用随机数，所以要记状态）
export interface ReplayRound {
  s: number;
  c: Command[];
}

export interface BattleInit {
  seed: number;
  allies: BUnit[];
  reserve?: BUnit[];
  enemies: BUnit[];
  items: Record<string, number>;
  title: string;
  spar?: boolean;
  canFlee?: boolean;
  tag?: string;
}

export function emptyStatus(): UnitStatus {
  return { chaos: 0, seal: 0, trap: 0, guard: null, poison: [] };
}

export function createBattle(init: BattleInit): Battle {
  const snapshot = JSON.parse(JSON.stringify(init)) as BattleInit;
  return {
    init: snapshot,
    log: [],
    rng: new Rng(init.seed),
    round: 0,
    units: [...init.allies, ...init.enemies],
    reserve: init.reserve ?? [],
    items: { ...init.items },
    itemsUsed: {},
    captured: [],
    outcome: null,
    title: init.title,
    canFlee: init.canFlee ?? true,
    spar: !!init.spar,
    lastCmd: {},
    tag: init.tag,
  };
}

export function unit(b: Battle, id: string): BUnit | undefined {
  return b.units.find((u) => u.id === id) ?? b.reserve.find((u) => u.id === id);
}

export function living(b: Battle, side?: Side): BUnit[] {
  return b.units.filter((u) => u.alive && (!side || u.side === side));
}

export function foesOf(b: Battle, u: BUnit): BUnit[] {
  return living(b, u.side === 'ally' ? 'enemy' : 'ally');
}

export function friendsOf(b: Battle, u: BUnit): BUnit[] {
  return living(b, u.side);
}

export function controlOf(u: BUnit): ControlStatus | null {
  if (u.status.seal > 0) return 'seal';
  if (u.status.chaos > 0) return 'chaos';
  if (u.status.trap > 0) return 'trap';
  return null;
}

// 被封、被乱的单位这回合不用下指令（自己控制不了）
export function needsCommand(u: BUnit): boolean {
  return u.alive && u.status.seal <= 0 && u.status.chaos <= 0;
}

export function usableItems(b: Battle): string[] {
  return Object.keys(b.items).filter((k) => b.items[k] > 0 && items[k]?.cat === 'drug');
}

export function canCast(u: BUnit, skillId: string): boolean {
  const st = u.skills.find((s) => s.id === skillId);
  if (!st) return false;
  return u.mp >= skillMp(skills[skillId].mp, st.level);
}

export function availableCommands(b: Battle, u: BUnit): Record<CommandType, boolean> {
  const trapped = u.status.trap > 0;
  return {
    attack: !trapped,
    skill: !trapped && u.skills.length > 0,
    capture: !trapped && !b.spar && foesOf(b, u).some((f) => f.kind === 'monster'),
    item: usableItems(b).length > 0,
    summon: u.kind === 'player' && b.reserve.some((r) => r.hp > 0),
    defend: true,
    flee: true,
  };
}

// 预测出手顺序（选目标时显示"速度第N"）
export function predictOrder(b: Battle): BUnit[] {
  return living(b).sort((a, c) => c.spd - a.spd || a.id.localeCompare(c.id));
}

// 普攻只能打前排；前排死光才能打后排
export function attackableFoes(b: Battle, u: BUnit): BUnit[] {
  const foes = foesOf(b, u);
  const front = foes.filter((f) => f.row === 0);
  return front.length ? front : foes;
}

function profCoef(st: SkillState): number {
  const full = balance.skill.maxLevel * balance.skill.profPerLevel;
  // 化境（第 6 级）再乘一次
  return (1 + (Math.min(st.prof, full) / full) * 0.3) * (st.level > balance.skill.maxLevel ? balance.skill.huajingMul : 1);
}

function guardOf(u: BUnit): number {
  return u.status.guard ? u.status.guard.amount : 0;
}

class Resolver {
  ev: BEvent[] = [];
  // 这回合已经追击过的人（七进七出每回合一次）
  chased = new Set<string>();
  constructor(public b: Battle) {}

  pv(u: BUnit) {
    return passiveOf(u.passive);
  }

  tell(u: BUnit): void {
    const p = this.pv(u);
    if (p) this.emit({ t: 'passive', actor: u.id, label: p.name });
  }

  // 被动改过的攻击、防御
  effAtk(u: BUnit): number {
    const p = this.pv(u);
    let m = 1;
    if (p?.kind === 'opening' && p.stat === 'atk' && this.b.round <= (p.n ?? 1)) m += p.v;
    if (p?.kind === 'berserk' && u.hp < u.maxHp / 2) {
      m += p.v;
      if (!u.raged) {
        u.raged = true;
        this.tell(u);
      }
    }
    return u.atk * m;
  }

  effDef(u: BUnit): number {
    const p = this.pv(u);
    return p?.kind === 'opening' && p.stat === 'def' && this.b.round <= (p.n ?? 1) ? u.def * (1 + p.v) : u.def;
  }

  get rng(): Rng {
    return this.b.rng;
  }

  emit(e: BEvent): void {
    this.ev.push(e);
  }

  damage(t: BUnit, amount: number, extra: Partial<Extract<BEvent, { t: 'damage' }>> = {}, src?: BUnit): void {
    if (!t.alive) return;
    amount = Math.max(1, Math.round(amount));
    t.hp = Math.max(0, t.hp - amount);
    this.emit({ t: 'damage', target: t.id, amount, ...extra });
    if (t.status.trap > 0 && t.hp > 0) {
      t.status.trap = 0;
      this.emit({ t: 'statusEnd', target: t.id, status: 'trap' });
    }
    if (t.hp <= 0) {
      this.kill(t);
      if (src) src.kills = (src.kills ?? 0) + 1;
    }
  }

  kill(t: BUnit): void {
    t.alive = false;
    t.hp = 0;
    t.status = emptyStatus();
    t.defending = false;
    this.emit({ t: 'die', target: t.id });
  }

  ended(): boolean {
    if (this.b.outcome) return true;
    if (living(this.b, 'enemy').length === 0) this.b.outcome = 'win';
    else if (living(this.b, 'ally').length === 0) this.b.outcome = 'lose';
    if (this.b.outcome) this.emit({ t: 'end', outcome: this.b.outcome });
    return !!this.b.outcome;
  }

  retarget(id: string | undefined, pool: BUnit[]): BUnit | undefined {
    const t = id ? pool.find((p) => p.id === id && p.alive) : undefined;
    if (t) return t;
    return pool.length ? this.rng.pick(pool) : undefined;
  }

  physical(a: BUnit, t: BUnit): { dmg: number; crit: boolean; fatal: boolean } {
    const D = balance.damage;
    const v = 1 + this.rng.range(-D.variance, D.variance);
    const atk = this.effAtk(a);
    let dmg = Math.max(atk * v - this.effDef(t) * D.defK, atk * D.minRatio);
    dmg *= 1 - resistReduce(t.resist.phys + guardOf(t));
    if (t.defending) dmg *= D.defend;
    const ap = this.pv(a);
    const crit = this.rng.chance((a.rates.crit + (ap?.kind === 'crit' ? ap.v : 0)) / 100);
    const fatal = !crit && this.rng.chance(a.rates.fatal / 100);
    if (crit) dmg *= D.crit;
    if (fatal) dmg *= D.fatal;
    return { dmg, crit, fatal };
  }

  attack(a: BUnit, t: BUnit, label: string, allowCounter: boolean): void {
    this.emit({ t: 'act', actor: a.id, label, target: t.id, kind: 'melee' });
    const canDodge = t.status.seal <= 0 && t.status.trap <= 0;
    if (canDodge && this.rng.chance(t.rates.dodge / 100)) {
      this.emit({ t: 'miss', target: t.id });
      return;
    }
    const hit = this.physical(a, t);
    let dmg = hit.dmg;
    const { crit, fatal } = hit;
    // 格挡：挨普攻有机会只吃一半
    const tp = this.pv(t);
    if (tp?.kind === 'block' && t.side !== a.side && this.rng.chance(tp.v)) {
      this.tell(t);
      dmg *= 0.5;
    }
    this.damage(t, dmg, { crit, fatal }, a);
    // 带毒
    const ap = this.pv(a);
    if (ap?.kind === 'venom' && t.alive && t.side !== a.side) t.status.poison.push({ dmg: Math.max(1, Math.round(dmg * ap.v)), turns: 2 });
    // 逗乐：挨打的把打人的逗得发愣
    if (tp?.kind === 'jest' && t.alive && a.alive && t.side !== a.side && !controlOf(a) && this.rng.chance(tp.v)) {
      this.tell(t);
      a.status.chaos = 1;
      this.emit({ t: 'status', target: a.id, status: 'chaos', ok: true });
    }
    if (allowCounter && t.alive && a.alive && !controlOf(t) && t.side !== a.side && this.rng.chance(t.rates.counter / 100)) {
      this.attack(t, a, '反击', false);
    }
  }

  magic(u: BUnit, st: SkillState, def: SkillDef, t: BUnit): number {
    const raw = (def.base ? def.base[0] + def.base[1] * u.level : 0) * lerpLevel(def.mul, st.level) * profCoef(st);
    const res = def.resist ? t.resist[def.resist] : 0;
    const sp = this.pv(u);
    let dmg = raw * (1 - resistReduce(res + guardOf(t))) * (1 + this.rng.range(-0.05, 0.05)) * (sp?.kind === 'spell' ? 1 + sp.v : 1);
    if (t.defending) dmg *= balance.damage.defend;
    return dmg;
  }

  skill(u: BUnit, cmd: Command): void {
    const def = cmd.skill ? skills[cmd.skill] : undefined;
    const st = u.skills.find((s) => s.id === cmd.skill);
    if (!def || !st) return this.basicAttack(u, cmd.target);
    const cost = skillMp(def.mp, st.level);
    if (u.mp < cost) {
      this.emit({ t: 'text', text: `${u.name}精力不足，无法施放${def.name}` });
      return;
    }
    u.mp -= cost;
    if (u.side === 'ally') u.profGain[st.id] = (u.profGain[st.id] ?? 0) + balance.skill.profPerCast;
    const foes = foesOf(this.b, u);
    const friends = friendsOf(this.b, u);
    const lvl = st.level;

    switch (def.kind) {
      case 'cleave': {
        const t = this.retarget(cmd.target, foes);
        if (!t) return;
        this.emit({ t: 'act', actor: u.id, label: def.name, target: t.id, kind: 'melee', skill: cmd.skill });
        const keep = 1 - resistReduce((def.resist ? t.resist[def.resist] : 0) + guardOf(t));
        const pct = lerpLevel(def.pct, lvl) * profCoef(st);
        let dmg = (t.hp * pct + this.effAtk(u) * (def.atkMul ?? 0)) * keep;
        if (t.defending) dmg *= balance.damage.defend;
        const mpCut = Math.round(t.mp * pct * keep);
        t.mp = Math.max(0, t.mp - mpCut);
        this.damage(t, dmg, { mp: mpCut });
        return;
      }
      case 'sacrifice': {
        const t = this.retarget(cmd.target, foes);
        if (!t) return;
        this.emit({ t: 'act', actor: u.id, label: def.name, target: t.id, kind: 'melee', skill: cmd.skill });
        const boost = 1 + (st.prof / (balance.skill.maxLevel * balance.skill.profPerLevel)) * (def.profMul ?? 0);
        let dmg = this.effAtk(u) * lerpLevel(def.mul, lvl) * boost * (1 - resistReduce(t.resist.phys + guardOf(t)));
        if (t.defending) dmg *= balance.damage.defend;
        const selfCost = Math.min(u.hp - 1, Math.round(u.maxHp * lerpLevel(def.selfPct, lvl) * boost));
        this.damage(t, dmg);
        if (selfCost > 0) {
          u.hp -= selfCost;
          this.emit({ t: 'damage', target: u.id, amount: selfCost, self: true });
        }
        return;
      }
      case 'guard': {
        this.emit({ t: 'act', actor: u.id, label: def.name, kind: 'cast', skill: cmd.skill });
        const amount = Math.round(lerpLevel(def.amount, lvl) * profCoef(st));
        for (const f of friends) {
          f.status.guard = { amount, turns: def.turns ?? 3, since: this.b.round };
          this.emit({ t: 'buff', target: f.id, label: `抗性+${amount}` });
        }
        return;
      }
      case 'control': {
        const first = this.retarget(cmd.target, foes);
        if (!first || !def.status) return;
        this.emit({ t: 'act', actor: u.id, label: def.name, target: first.id, kind: 'cast', skill: cmd.skill });
        const n = def.targets?.[lvl - 1] ?? 1;
        const others = this.rng.shuffle(foes.filter((f) => f !== first)).slice(0, n - 1);
        const chance = Math.min(0.95, lerpLevel(def.chance, lvl) * profCoef(st));
        for (const t of [first, ...others]) {
          const res = (def.resist ? t.resist[def.resist] : 0) + guardOf(t);
          const ok = this.rng.chance(chance * (1 - resistReduce(res)));
          if (ok) {
            t.status.chaos = t.status.seal = t.status.trap = 0;
            t.status[def.status] = def.turns ?? 2;
            t.defending = false;
          }
          this.emit({ t: 'status', target: t.id, status: def.status, ok });
        }
        return;
      }
      case 'cleanse': {
        this.emit({ t: 'act', actor: u.id, label: def.name, kind: 'cast', skill: cmd.skill });
        const chance = Math.min(1, lerpLevel(def.chance, lvl) * profCoef(st));
        let any = false;
        for (const f of friends) {
          const c = controlOf(f);
          if (!c) continue;
          any = true;
          if (this.rng.chance(chance)) {
            f.status.chaos = f.status.seal = f.status.trap = 0;
            this.emit({ t: 'statusEnd', target: f.id, status: c });
          } else {
            this.emit({ t: 'text', text: `${f.name}没能恢复` });
          }
        }
        if (!any) this.emit({ t: 'text', text: '没有队友中计' });
        return;
      }
      case 'nuke': {
        const t = this.retarget(cmd.target, foes);
        if (!t) return;
        this.emit({ t: 'act', actor: u.id, label: def.name, target: t.id, kind: 'cast', skill: cmd.skill });
        this.damage(t, this.magic(u, st, def, t));
        return;
      }
      case 'poison': {
        const t = this.retarget(cmd.target, foes);
        if (!t) return;
        this.emit({ t: 'act', actor: u.id, label: def.name, target: t.id, kind: 'cast', skill: cmd.skill });
        const dmg = Math.max(1, Math.round(this.magic(u, st, def, t)));
        this.damage(t, dmg);
        if (t.alive) t.status.poison.push({ dmg: Math.max(1, Math.round(dmg / 2)), turns: def.turns ?? 3 });
        return;
      }
      case 'aoe': {
        this.emit({ t: 'act', actor: u.id, label: def.name, kind: 'cast', skill: cmd.skill });
        for (const t of foes) this.damage(t, this.magic(u, st, def, t));
        return;
      }
    }
  }

  basicAttack(u: BUnit, targetId?: string): void {
    const t = this.retarget(targetId, attackableFoes(this.b, u));
    if (!t) return;
    // 无双只算这一下之前打倒的人数（本回合打倒的，下回合才算）
    const killsBefore = u.kills ?? 0;
    this.attack(u, t, '普通攻击', true);
    const p = this.pv(u);
    if (!p || !u.alive || this.b.outcome) return;
    // 连击：同一个人再打一下
    if (p.kind === 'combo' && t.alive && this.rng.chance(p.v)) {
      this.tell(u);
      this.attack(u, t, '连击', false);
    }
    // 追击：打倒了就冲向下一个（每回合一次）
    if (p.kind === 'chase' && !t.alive && !this.chased.has(u.id)) {
      const next = this.retarget(undefined, attackableFoes(this.b, u));
      if (next) {
        this.chased.add(u.id);
        this.tell(u);
        this.attack(u, next, p.name, false);
      }
    }
    // 无双：打倒过几个人，就多打几下
    if (p.kind === 'wushuang') {
      const extra = Math.min(p.v, killsBefore);
      for (let i = 0; i < extra && u.alive; i++) {
        const tt = t.alive ? t : this.retarget(undefined, attackableFoes(this.b, u));
        if (!tt) break;
        if (i === 0) this.tell(u);
        this.attack(u, tt, p.name, false);
      }
    }
  }

  capture(u: BUnit, cmd: Command): void {
    const foes = foesOf(this.b, u).filter((f) => f.kind === 'monster');
    const t = this.retarget(cmd.target, foes);
    if (!t) return;
    this.emit({ t: 'act', actor: u.id, label: '招降', target: t.id, kind: 'none' });
    if (t.historic) {
      this.emit({ t: 'text', text: '战斗中的历史副将不能招降' });
      return;
    }
    if (!t.capturable) {
      this.emit({ t: 'text', text: `${t.name}不肯归降` });
      this.emit({ t: 'capture', target: t.id, ok: false });
      return;
    }
    const C = balance.capture;
    // 说客：同场的队友帮着劝
    const talker = friendsOf(this.b, u).find((f) => this.pv(f)?.kind === 'persuade');
    const bonus = talker ? this.pv(talker)!.v : 0;
    if (talker) this.tell(talker);
    const p = Math.max(C.min, Math.min(C.max, C.base + (1 - t.hp / t.maxHp) * C.hpWeight + (u.level - t.level) * C.levelDiff + bonus));
    const ok = this.rng.chance(p);
    this.emit({ t: 'capture', target: t.id, ok });
    if (ok) {
      t.alive = false;
      t.captured = true;
      t.status = emptyStatus();
      this.b.captured.push(t);
    }
  }

  item(u: BUnit, cmd: Command): void {
    const id = cmd.item;
    const def = id ? items[id] : undefined;
    if (!id || !def || !(this.b.items[id] > 0)) {
      this.emit({ t: 'text', text: '物品不足' });
      return;
    }
    const t = this.retarget(cmd.target, friendsOf(this.b, u)) ?? u;
    this.b.items[id]--;
    this.b.itemsUsed[id] = (this.b.itemsUsed[id] ?? 0) + 1;
    this.emit({ t: 'act', actor: u.id, label: def.name, target: t.id, kind: 'none' });
    const hp = Math.min(def.hp ?? 0, t.maxHp - t.hp);
    const mp = Math.min(def.mp ?? 0, t.maxMp - t.mp);
    t.hp += hp;
    t.mp += mp;
    this.emit({ t: 'heal', target: t.id, hp, mp });
  }

  summon(u: BUnit, cmd: Command): void {
    const incoming = this.b.reserve.find((r) => r.id === cmd.summon && r.hp > 0);
    if (u.kind !== 'player' || !incoming) {
      this.emit({ t: 'text', text: '没有可以替换的副将' });
      return;
    }
    this.emit({ t: 'act', actor: u.id, label: '招将', kind: 'none' });
    const current = this.b.units.find((x) => x.side === 'ally' && x.kind === 'general');
    this.b.reserve = this.b.reserve.filter((r) => r !== incoming);
    if (current) {
      this.b.units = this.b.units.filter((x) => x !== current);
      current.defending = false;
      current.status = { ...emptyStatus(), poison: current.alive ? current.status.poison : [] };
      this.b.reserve.push(current);
    }
    incoming.alive = true;
    this.b.units.push(incoming);
    this.emit({ t: 'summon', out: current?.id, in: incoming.id });
  }

  flee(u: BUnit): void {
    this.emit({ t: 'act', actor: u.id, label: '逃跑', kind: 'none' });
    if (!this.b.canFlee) {
      this.emit({ t: 'text', text: '这场战斗无法逃跑' });
      this.emit({ t: 'flee', ok: false });
      return;
    }
    const F = balance.flee;
    const foes = foesOf(this.b, u);
    const avg = foes.reduce((s, f) => s + f.spd, 0) / Math.max(1, foes.length);
    const ok = this.rng.chance(Math.max(F.min, Math.min(F.max, F.base + (u.spd - avg) * F.spdWeight)));
    this.emit({ t: 'flee', ok });
    if (ok) {
      this.b.outcome = 'fled';
      this.emit({ t: 'end', outcome: 'fled' });
    }
  }

  act(u: BUnit, cmd: Command | undefined): void {
    if (u.status.seal > 0) {
      u.status.seal--;
      this.emit({ t: 'text', text: `${u.name}被封住了，无法行动` });
      if (u.status.seal === 0) this.emit({ t: 'statusEnd', target: u.id, status: 'seal' });
      return;
    }
    if (u.status.chaos > 0) {
      u.status.chaos--;
      const pool = living(this.b).filter((x) => x !== u);
      if (pool.length) this.attack(u, this.rng.pick(pool), `${STATUS_NAMES.chaos}·乱打`, false);
      if (u.status.chaos === 0 && u.alive) this.emit({ t: 'statusEnd', target: u.id, status: 'chaos' });
      return;
    }
    const c = cmd ?? { actor: u.id, type: 'attack' };
    const L = balance.general.loyaltyDisobey;
    if (u.kind === 'general' && u.loyalty !== undefined && u.loyalty < L && this.rng.chance((L - u.loyalty) / 100)) {
      this.emit({ t: 'text', text: `${u.name}忠诚太低，不听指挥` });
      this.emit({ t: 'defend', actor: u.id });
      return;
    }
    if (u.status.trap > 0) {
      u.status.trap--;
      const blocked = c.type === 'attack' || c.type === 'skill' || c.type === 'capture';
      if (blocked) this.emit({ t: 'text', text: `${u.name}被围困，无法出手` });
      else this.run(u, c);
      if (u.status.trap === 0 && u.alive) this.emit({ t: 'statusEnd', target: u.id, status: 'trap' });
      return;
    }
    this.run(u, c);
  }

  run(u: BUnit, c: Command): void {
    switch (c.type) {
      case 'attack':
        return this.basicAttack(u, c.target);
      case 'skill':
        return this.skill(u, c);
      case 'capture':
        return this.capture(u, c);
      case 'item':
        return this.item(u, c);
      case 'summon':
        return this.summon(u, c);
      case 'defend':
        this.emit({ t: 'defend', actor: u.id });
        return;
      case 'flee':
        return this.flee(u);
    }
  }
}

export function resolveRound(b: Battle, cmds: Command[]): BEvent[] {
  const r = new Resolver(b);
  if (b.outcome) return r.ev;
  b.log?.push({ s: b.rng.state, c: cmds.map((c) => ({ ...c })) });
  b.round++;
  r.emit({ t: 'round', round: b.round });

  // 回合开始先结算中毒（巫蛊极毒在其他攻击之前结算）
  for (const u of living(b)) {
    if (!u.status.poison.length) continue;
    const amount = u.status.poison.reduce((s, p) => s + p.dmg, 0);
    u.status.poison = u.status.poison.map((p) => ({ ...p, turns: p.turns - 1 })).filter((p) => p.turns > 0);
    u.hp = Math.max(0, u.hp - amount);
    r.emit({ t: 'poison', target: u.id, amount });
    if (u.hp <= 0) r.kill(u);
  }
  if (r.ended()) return r.ev;

  // 回合开始的被动：自己回血、给最虚的队友治疗、开局加成报一声
  for (const u of living(b)) {
    const p = r.pv(u);
    if (!p) continue;
    if (p.kind === 'regen' && u.hp < u.maxHp) {
      const hp = Math.min(u.maxHp - u.hp, Math.round(u.maxHp * p.v));
      u.hp += hp;
      r.tell(u);
      r.emit({ t: 'heal', target: u.id, hp, mp: 0 });
    } else if (p.kind === 'heal') {
      const hurt = friendsOf(b, u).filter((f) => f.hp < f.maxHp).sort((a, c) => a.hp / a.maxHp - c.hp / c.maxHp)[0];
      if (hurt) {
        const hp = Math.min(hurt.maxHp - hurt.hp, Math.round(hurt.maxHp * p.v));
        hurt.hp += hp;
        r.tell(u);
        r.emit({ t: 'heal', target: hurt.id, hp, mp: 0 });
      }
    } else if (p.kind === 'opening' && b.round === 1) r.tell(u);
  }

  const byActor = new Map(cmds.map((c) => [c.actor, c]));
  for (const c of cmds) b.lastCmd[c.actor] = c;
  for (const u of living(b)) u.defending = byActor.get(u.id)?.type === 'defend' && needsCommand(u);

  const tie = new Map(living(b).map((u) => [u.id, b.rng.next()]));
  const order = living(b).sort((a, c) => c.spd - a.spd || tie.get(a.id)! - tie.get(c.id)!);
  for (const u of order) {
    if (!u.alive || !b.units.includes(u)) continue;
    r.act(u, byActor.get(u.id));
    if (r.ended()) break;
  }

  for (const u of b.units) {
    u.defending = false;
    const g = u.status.guard;
    if (g && g.since !== b.round && --g.turns <= 0) u.status.guard = null;
  }
  return r.ev;
}

// ===== 指令选择 =====

export function defaultCommand(b: Battle, u: BUnit): Command {
  const t = attackableFoes(b, u)[0];
  return { actor: u.id, type: 'attack', target: t?.id };
}

// 敌人 AI：按技能概率放技能，否则普攻；目标偏向主角
export function aiCommand(b: Battle, u: BUnit): Command {
  const foes = foesOf(b, u);
  const pickFoe = (pool: BUnit[]): BUnit | undefined => {
    const player = pool.find((f) => f.kind === 'player');
    if (player && b.rng.chance(0.5)) return player;
    return pool.length ? b.rng.pick(pool) : undefined;
  };
  for (const s of u.aiSkills) {
    if (!canCast(u, s.id) || !b.rng.chance(s.rate)) continue;
    const def = skills[s.id];
    if (def.kind === 'guard' || def.kind === 'cleanse') {
      if (def.kind === 'cleanse' && !friendsOf(b, u).some(controlOf)) continue;
      return { actor: u.id, type: 'skill', skill: s.id };
    }
    if (def.kind === 'control') {
      const free = foes.filter((f) => !controlOf(f));
      if (!free.length) continue;
      return { actor: u.id, type: 'skill', skill: s.id, target: pickFoe(free)?.id };
    }
    return { actor: u.id, type: 'skill', skill: s.id, target: pickFoe(foes)?.id };
  }
  return { actor: u.id, type: 'attack', target: pickFoe(attackableFoes(b, u))?.id };
}

// "自动"：重复上一次的技能（精力够的话），否则打血最少的前排敌人
export function autoCommand(b: Battle, u: BUnit): Command {
  const last = b.lastCmd[u.id];
  const front = attackableFoes(b, u);
  const weakest = [...front].sort((a, c) => a.hp - c.hp)[0];
  if (last?.type === 'skill' && last.skill && canCast(u, last.skill) && u.status.trap <= 0) {
    const def = skills[last.skill];
    const foes = foesOf(b, u);
    const alive = foes.find((f) => f.id === last.target);
    if (def.target !== 'enemy') return { ...last };
    if (def.kind === 'control') {
      const free = foes.filter((f) => !controlOf(f));
      if (free.length) return { ...last, target: (alive && !controlOf(alive) ? alive : free[0]).id };
    } else {
      return { ...last, target: (alive ?? weakest ?? foes[0])?.id };
    }
  }
  if (u.status.trap > 0) return { actor: u.id, type: 'defend' };
  return { actor: u.id, type: 'attack', target: weakest?.id };
}

// ===== 战后结算 =====

export interface Rewards {
  exp: Record<string, number>;
  silver: number;
  drops: Record<string, number>;
  kills: Record<string, number>;
  captured: BUnit[];
}

export function computeRewards(b: Battle, expMul: (unitLevel: number, enemyLevel: number) => number, dropAllowed: (questOnly?: string) => boolean, dropTable: (monsterId: string) => { item: string; chance: number; questOnly?: string }[]): Rewards {
  const r: Rewards = { exp: {}, silver: 0, drops: {}, kills: {}, captured: b.captured };
  if (b.outcome !== 'win' || b.spar) return r;
  const beaten = b.units.filter((u) => u.side === 'enemy' && !u.alive);
  for (const e of beaten) {
    if (e.monsterId && !e.captured) r.kills[e.monsterId] = (r.kills[e.monsterId] ?? 0) + 1;
    r.silver += e.silverYield;
    if (!e.monsterId || e.captured) continue;
    for (const d of dropTable(e.monsterId)) {
      if (!dropAllowed(d.questOnly)) continue;
      if (b.rng.chance(d.chance)) r.drops[d.item] = (r.drops[d.item] ?? 0) + 1;
    }
  }
  const allies = b.units.filter((u) => u.side === 'ally' && u.alive);
  for (const a of allies) {
    let exp = 0;
    for (const e of beaten) exp += e.expYield * expMul(a.level, e.level);
    r.exp[a.id] = Math.round(exp);
  }
  return r;
}
