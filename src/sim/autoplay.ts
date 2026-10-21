// 自动通关模拟：用自动战斗跑完整条新手主线，检查任务能不能走通、升级节奏合不合适。单测和数值调整都用它。
import { aiCommand, autoCommand, canCast, foesOf, living, needsCommand, resolveRound } from '../core/battle';
import type { BUnit, Battle, Command } from '../core/battle';
import { Rng } from '../core/rng';
import { classSkills, items, locations, monsters, skills } from '../data';
import { finishBattle, startBattle } from '../game/encounter';
import type { Save } from '../game/state';
import {
  acceptQuest, allocate, buy, currentQuest, findPath, heal, learnSkill, npcLocation, playerStats, skillSchool,
  turnInQuest, upgradeSkill,
} from '../game/state';

export interface AutoplayReport {
  finished: boolean;
  battles: number;
  wins: number;
  losses: number;
  level: number;
  steps: { quest: string; level: number; battles: number }[];
  generals: number;
}

function teleport(s: Save, to: string): void {
  if (!findPath(s.location, to)) throw new Error(`走不到 ${to}`);
  s.location = to;
}

function playerCommand(b: Battle, u: BUnit, s: Save, captureId: string | null): Command {
  const foes = foesOf(b, u);
  if (captureId) {
    const t = foes.find((f) => f.monsterId === captureId && f.hp / f.maxHp < 0.45);
    if (t) return { actor: u.id, type: 'capture', target: t.id };
  } else if (s.generals.length < 3) {
    const t = foes.find((f) => f.capturable && f.kind === 'monster' && f.hp / f.maxHp < 0.35);
    if (t) return { actor: u.id, type: 'capture', target: t.id };
  }
  if (u.hp < u.maxHp * 0.3) {
    const drug = Object.keys(b.items).filter((k) => b.items[k] > 0 && items[k].hp).sort((a, c) => items[c].hp! - items[a].hp!)[0];
    if (drug) return { actor: u.id, type: 'item', item: drug, target: u.id };
  }
  const own = classSkills(s.player.classId, s.player.gender).filter((id) => u.skills.some((x) => x.id === id) && canCast(u, id));
  const aoe = own.find((id) => skills[id].kind === 'aoe');
  if (aoe && foes.length >= 2) return { actor: u.id, type: 'skill', skill: aoe };
  const dmg = own.find((id) => ['nuke', 'cleave', 'poison', 'control'].includes(skills[id].kind));
  if (dmg && !(captureId && foes.some((f) => f.monsterId === captureId))) {
    return { actor: u.id, type: 'skill', skill: dmg, target: [...foes].sort((a, c) => c.hp - a.hp)[0]?.id };
  }
  return autoCommand(b, u);
}

function fight(s: Save, groupIndex: number, rng: Rng, captureId: string | null): Battle['outcome'] {
  const b = startBattle(s, groupIndex, rng.int(0, 2 ** 31));
  for (let r = 0; r < 200 && !b.outcome; r++) {
    const cmds: Command[] = [];
    for (const u of living(b)) {
      if (!needsCommand(u)) continue;
      if (u.side === 'enemy') cmds.push(aiCommand(b, u));
      else if (u.kind === 'player') cmds.push(playerCommand(b, u, s, captureId));
      else if (captureId && foesOf(b, u).some((f) => f.monsterId === captureId)) {
        const t = foesOf(b, u).find((f) => f.monsterId === captureId && f.hp > f.maxHp * 0.5);
        cmds.push(t ? { actor: u.id, type: 'attack', target: t.id } : { actor: u.id, type: 'defend' });
      } else cmds.push(autoCommand(b, u));
    }
    resolveRound(b, cmds);
  }
  finishBattle(s, b);
  return b.outcome;
}

// 玩家习惯：属性点按职业套路加，能学就学，能升就升，药不够就买
function upkeep(s: Save): void {
  const p = s.player;
  if (p.free > 0) {
    const n = p.free;
    const plan = p.classId === 'warrior' ? { con: Math.ceil(n / 2), str: Math.floor(n / 2), int: 0, agi: 0 }
      : { con: Math.ceil(n / 2), str: 0, int: Math.floor(n / 4), agi: n - Math.ceil(n / 2) - Math.floor(n / 4) };
    allocate(s, plan);
  }
  for (const row of skillSchool(s)) {
    if (row.action === 'learn') learnSkill(s, row.id);
    if (row.action === 'upgrade') upgradeSkill(s, row.id);
  }
  const st = playerStats(s);
  if (s.player.hp < st.maxHp * 0.6 || s.generals.some((g) => g.hp <= 1)) {
    const back = s.location;
    teleport(s, 'xinshoucun');
    heal(s);
    const want = s.player.level < 8 ? 'dieda' : 'zhixue';
    if ((s.bag[want] ?? 0) < 5) buy(s, want, Math.min(10, Math.floor(s.player.silver / items[want].price / 2)));
    teleport(s, back);
  }
}

function groupFor(locId: string, monsterId: string): number {
  return locations[locId].groups.findIndex((g) => g.monster === monsterId);
}

export function autoplay(s: Save, seed = 7, maxBattles = 600): AutoplayReport {
  const rng = new Rng(seed);
  const rep: AutoplayReport = { finished: false, battles: 0, wins: 0, losses: 0, level: 1, steps: [], generals: 0 };
  let guard = 0;
  while (guard++ < 5000 && rep.battles < maxBattles) {
    const q = currentQuest(s);
    if (!q || s.main.state === 'done') {
      rep.finished = true;
      break;
    }
    upkeep(s);
    if (s.main.state === 'available') {
      teleport(s, npcLocation(q.giver)!);
      acceptQuest(s);
      continue;
    }
    if (s.main.state === 'ready' || q.type === 'talk') {
      teleport(s, npcLocation(q.turnIn)!);
      turnInQuest(s);
      rep.steps.push({ quest: q.title, level: s.player.level, battles: rep.battles });
      continue;
    }
    if (q.type === 'flag') {
      // 加点、学技能在 upkeep 里做了；属性点为 0 时还没触发，就等升级
      if (q.flag === 'allocated' && s.player.free === 0 && !s.flags.allocated) {
        fightAnywhere(s, rng, rep);
      }
      continue;
    }
    const at = q.target!.at;
    const monster = q.target!.monster!;
    const gi = groupFor(at, monster);
    if (gi < 0) throw new Error(`${locations[at].name} 没有 ${monsters[monster].name}`);
    const g = locations[at].groups[gi];
    const need = g.level[0] - (monsters[monster].boss ? 2 : 1);
    if (s.player.level < need) {
      grind(s, rng, rep);
      continue;
    }
    teleport(s, at);
    const out = fight(s, gi, rng, q.type === 'capture' ? monster : null);
    rep.battles++;
    if (out === 'win') rep.wins++;
    if (out === 'lose') rep.losses++;
  }
  rep.level = s.player.level;
  rep.generals = s.generals.length + s.inn.length;
  return rep;
}

// 等级不够时找等级合适的地方练级（怪物等级上限不超过自己+1）
function grind(s: Save, rng: Rng, rep: AutoplayReport): void {
  let best: { loc: string; gi: number; lv: number } | null = null;
  for (const [loc, def] of Object.entries(locations)) {
    def.groups.forEach((g, gi) => {
      if (monsters[g.monster].boss || g.level[1] > s.player.level + 1) return;
      if (!best || g.level[0] > best.lv) best = { loc, gi, lv: g.level[0] };
    });
  }
  const pick = best as { loc: string; gi: number } | null;
  teleport(s, pick ? pick.loc : 'cunbei');
  const out = fight(s, pick ? pick.gi : 0, rng, null);
  rep.battles++;
  if (out === 'win') rep.wins++;
  if (out === 'lose') rep.losses++;
}

function fightAnywhere(s: Save, rng: Rng, rep: AutoplayReport): void {
  teleport(s, 'cunbei');
  const out = fight(s, 0, rng, null);
  rep.battles++;
  if (out === 'win') rep.wins++;
  if (out === 'lose') rep.losses++;
}
