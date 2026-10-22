// 阵营羁绊：招来的武将分魏、蜀、吴、群。随行副将里同阵营的带了两个，这几个攻防各 +5%；带满三个 +10%。
// 另有三组：二乔（大乔、小乔都带着，气血上限 +10%）、刘备旧部（孙乾、简雍、糜芳任两个，速度 +10%）、吕布旧部（魏续、宋宪、侯成任两个，攻击 +8%）
import type { General, Save } from './state';
import { recruitDef } from './generals';

export type Faction = 'wei' | 'shu' | 'wu' | 'qun';
export const FACTION_NAMES: Record<Faction, string> = { wei: '魏', shu: '蜀', wu: '吴', qun: '群' };

export interface Combo {
  name: string;
  members: string[];
  need: number;
  desc: string;
  atk?: number;
  spd?: number;
  hp?: number;
}

export const COMBOS: Combo[] = [
  { name: '二乔', members: ['daqiao', 'xiaoqiao'], need: 2, desc: '大乔、小乔都带着：两人气血上限+10%', hp: 0.1 },
  { name: '刘备旧部', members: ['sunqian', 'jianyong', 'mifang'], need: 2, desc: '孙乾、简雍、糜芳带两个以上：速度+10%', spd: 0.1 },
  { name: '吕布旧部', members: ['weixu', 'songxian', 'houcheng'], need: 2, desc: '魏续、宋宪、侯成带两个以上：攻击+8%', atk: 0.08 },
];

export function factionOf(g: General): Faction | null {
  return (g.recruitId ? recruitDef(g.recruitId)?.def.faction : null) ?? null;
}

export interface CampMods {
  atk: number;
  def: number;
  spd: number;
  hp: number;
  tags: string[];
}

function carriedIds(s: Save): string[] {
  return s.generals.map((g) => g.recruitId).filter(Boolean) as string[];
}

export function factionCount(s: Save, f: Faction): number {
  return s.generals.filter((g) => factionOf(g) === f).length;
}

// 这位副将眼下吃到的加成（只算随行的，客栈里歇着的不算）
export function campMods(s: Save, g: General): CampMods {
  const m: CampMods = { atk: 0, def: 0, spd: 0, hp: 0, tags: [] };
  if (!s.generals.includes(g)) return m;
  const f = factionOf(g);
  if (f) {
    const n = factionCount(s, f);
    const v = n >= 3 ? 0.1 : n >= 2 ? 0.05 : 0;
    if (v) {
      m.atk += v;
      m.def += v;
      m.tags.push(`${FACTION_NAMES[f]}·同心${n}人`);
    }
  }
  const ids = carriedIds(s);
  for (const c of COMBOS) {
    if (!g.recruitId || !c.members.includes(g.recruitId)) continue;
    if (c.members.filter((id) => ids.includes(id)).length < c.need) continue;
    m.atk += c.atk ?? 0;
    m.spd += c.spd ?? 0;
    m.hp += c.hp ?? 0;
    m.tags.push(c.name);
  }
  return m;
}

// 面板用：每个阵营带了几个、三组羁绊成没成
export function campSummary(s: Save): { label: string; on: boolean; desc: string }[] {
  const out: { label: string; on: boolean; desc: string }[] = [];
  for (const f of Object.keys(FACTION_NAMES) as Faction[]) {
    const n = factionCount(s, f);
    if (!n) continue;
    out.push({ label: `${FACTION_NAMES[f]}·同心`, on: n >= 2, desc: `随行${n}人${n >= 3 ? '：攻防+10%' : n >= 2 ? '：攻防+5%（带满三人+10%）' : '：再带一个同阵营的攻防+5%'}` });
  }
  const ids = carriedIds(s);
  for (const c of COMBOS) {
    const have = c.members.filter((id) => ids.includes(id)).length;
    if (!have) continue;
    out.push({ label: c.name, on: have >= c.need, desc: c.desc });
  }
  return out;
}
