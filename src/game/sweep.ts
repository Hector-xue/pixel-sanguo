// 速战：比自己低很多级的普通怪，跳过动画直接算出结果（同一套战斗内核，指令交给自动），还能一口气连打几场。
// 头目、名将、不让逃的怪不给速战；要招降就手动打（速战不招降）。
import { aiCommand, autoCommand, canCast, foesOf, friendsOf, living, needsCommand, resolveRound } from '../core/battle';
import type { BUnit, Battle, Command } from '../core/battle';
import { balance, items, locations, monsters, playerSkillIds, skills } from '../data';
import type { MonsterGroup } from '../data';
import { finishBattle, startBattle } from './encounter';
import { playerStats } from './state';
import type { Save } from './state';

const S = balance.sweep;

// 不能速战时返回原因；能就返回 null
export function sweepReason(s: Save, gr: MonsterGroup): string | null {
  const all = [gr.monster, gr.escort?.monster].filter(Boolean) as string[];
  if (all.some((m) => monsters[m].boss || monsters[m].historic || monsters[m].noFlee)) return '头目、名将要亲自打';
  if (s.player.level < S.minLevel) return `${S.minLevel}级以后才能速战`;
  const top = Math.max(gr.level[1], gr.escort?.level ?? 0);
  if (top > s.player.level - S.levelGap) return `比你低${S.levelGap}级以上的怪才能速战`;
  return null;
}

// 主角：血少吃药，能群攻就群攻，有伤害技能就放，不然普攻；从不招降
function quickCommand(b: Battle, u: BUnit, s: Save): Command {
  const foes = foesOf(b, u);
  if (u.hp < u.maxHp * 0.35) {
    const drug = Object.keys(b.items).filter((k) => b.items[k] > 0 && items[k].hp).sort((a, c) => items[c].hp! - items[a].hp!)[0];
    if (drug) return { actor: u.id, type: 'item', item: drug, target: u.id };
  }
  if (u.kind === 'player' && u.status.trap <= 0) {
    const own = playerSkillIds(s.player.classId, s.player.gender).filter((id) => u.skills.some((x) => x.id === id) && canCast(u, id));
    const heal = own.find((id) => skills[id].kind === 'heal');
    if (heal && friendsOf(b, u).filter((f) => f.hp < f.maxHp * 0.55).length >= 2) return { actor: u.id, type: 'skill', skill: heal };
    const aoe = own.find((id) => skills[id].kind === 'aoe' || (skills[id].kind === 'sweep' && foes.length >= 3));
    if (aoe && foes.length >= 2) return { actor: u.id, type: 'skill', skill: aoe };
    const dmg = own.find((id) => ['nuke', 'cleave', 'poison', 'drain', 'multi'].includes(skills[id].kind));
    if (dmg) return { actor: u.id, type: 'skill', skill: dmg, target: [...foes].sort((a, c) => c.hp - a.hp)[0]?.id };
  }
  return autoCommand(b, u);
}

// 打完一整场（不写回存档）
export function runQuick(b: Battle, s: Save): Battle {
  // 速战不进录像
  b.init = undefined;
  b.log = undefined;
  for (let r = 0; r < 200 && !b.outcome; r++) {
    const cmds: Command[] = [];
    for (const u of living(b)) {
      if (!needsCommand(u)) continue;
      if (u.side === 'enemy' || u.kind === 'mirror') cmds.push(aiCommand(b, u));
      else cmds.push(quickCommand(b, u, s));
    }
    resolveRound(b, cmds);
  }
  if (!b.outcome) b.outcome = 'fled';
  return b;
}

export interface SweepResult {
  fights: number;
  wins: number;
  exp: number;
  silver: number;
  drops: Record<string, number>;
  used: Record<string, number>;
  lines: string[];
  stop: string;
  lost: boolean;
}

// 连战：最多 n 场；输了、血少了、到了不能速战的级数、离开了这个地方就停
export function sweep(s: Save, gi: number, n: number, seed: () => number): SweepResult {
  const res: SweepResult = { fights: 0, wins: 0, exp: 0, silver: 0, drops: {}, used: {}, lines: [], stop: '', lost: false };
  const at = s.location;
  const gr = locations[at].groups[gi];
  for (let k = 0; k < n; k++) {
    const why = s.location !== at ? '换了地方' : sweepReason(s, gr);
    if (why) {
      res.stop = why;
      break;
    }
    if (s.player.hp < playerStats(s).maxHp * S.stopHpPct) {
      res.stop = '气血不多了，先歇一歇';
      break;
    }
    const b = runQuick(startBattle(s, gi, seed()), s);
    for (const [id, c] of Object.entries(b.itemsUsed)) res.used[id] = (res.used[id] ?? 0) + c;
    const sum = finishBattle(s, b);
    res.fights++;
    // 第一行是主角（经验、银两都记在这行）
    res.exp += sum.rows[0]?.exp ?? 0;
    res.silver += sum.rows[0]?.silver ?? 0;
    for (const d of sum.drops) res.drops[d.name] = (res.drops[d.name] ?? 0) + d.n;
    // 升级、任务、负重这些要紧的话留下来；同一句不重复
    for (const l of sum.lines) if (!res.lines.includes(l)) res.lines.push(l);
    if (b.outcome !== 'win') {
      res.lost = b.outcome === 'lose';
      res.stop = res.lost ? '打输了' : '没打完';
      break;
    }
    res.wins++;
  }
  return res;
}

export function sweepText(r: SweepResult): string[] {
  const out = [`速战${r.fights}场，赢${r.wins}场${r.stop ? `（${r.stop}，停下）` : ''}`];
  if (r.exp || r.silver) out.push(`经验+${r.exp}　银两+${r.silver}`);
  const drops = Object.entries(r.drops).filter(([, n]) => n > 0).map(([k, n]) => `${k}×${n}`);
  if (drops.length) out.push(`缴获：${drops.join('、')}`);
  const used = Object.entries(r.used).map(([k, n]) => `${items[k].name}×${n}`);
  if (used.length) out.push(`吃掉：${used.join('、')}`);
  return [...out, ...r.lines];
}
