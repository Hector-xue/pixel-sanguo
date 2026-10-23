// 国战纪事：从沙盘的局势里看出几件大事（要地易主、攻破都城、一国只剩两城、一国势大引来合纵），
// 每个赛季每件事讲一次，由各国的谋士说两句；没入国不讲。
import { monsters, systems } from '../data';
import type { DialogLine, NationId } from '../data';
import { PLAYABLE, citiesOf, nationDef, nationRanks, syncWorld } from './guozhan';
import { log } from './state';
import type { Save } from './state';

const G = systems.guozhan;
const S = systems.gzStory;

export interface StoryBeat {
  key: string;
  lines: DialogLine[];
}

function speaker(n: NationId): string {
  const id = S.advisors[n];
  const m = monsters[id];
  return m ? `${m.look}|${m.name}` : '';
}

function render(tpl: [string, string][], n: NationId, me: NationId, vars: Record<string, string>): DialogLine[] {
  const d = nationDef(n);
  const all: Record<string, string> = { full: d.full, name: d.name, ruler: d.ruler, ...vars };
  return tpl.map(([who, text]) => ({
    who: speaker(who === 'n' ? n : me),
    text: text.replace(/\{(\w+)\}/g, (_, k: string) => all[k] ?? ''),
  }));
}

// 这个赛季新冒出来的事（讲过的记下来，下次不再讲）
export function storyTick(s: Save): StoryBeat[] {
  const me = s.p4.nation;
  if (!me || s.player.level < G.minLevel) return [];
  const w = syncWorld(s);
  const pre = `${w.season}:`;
  const seen = new Set((s.p4.story ?? []).filter((k) => k.startsWith(pre)));
  const out: StoryBeat[] = [];
  const add = (key: string, lines: DialogLine[]) => {
    const k = pre + key;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ key: k, lines });
  };
  for (const c of G.cities) {
    const owner = w.cities[c.id].owner;
    if (owner === c.owner || !PLAYABLE.includes(owner)) continue;
    const tpl = S.keyCities[c.id];
    if (tpl) add(`key:${c.id}:${owner}`, render(owner === me ? tpl.self : tpl.other, owner, me, { city: c.name }));
    // 都城只有玩家打得下来
    if (c.kind === 'capital' && owner === me) {
      const foe = nationDef(c.owner);
      add(`cap:${c.id}`, render(S.capital, me, me, { city: c.name, foe: foe.full, foeRuler: foe.ruler }));
    }
  }
  for (const n of PLAYABLE) {
    const count = citiesOf(w, n).length;
    if (count > 0 && count <= G.ai.lastStandCities) add(`stand:${n}`, render(n === me ? S.standSelf : S.standOther, n, me, { count: `${count}` }));
  }
  const ranks = nationRanks(w);
  if (ranks[0].cities - ranks[1].cities >= 2) {
    const n = ranks[0].id;
    add(`lead:${n}`, render(n === me ? S.leadSelf : S.leadOther, n, me, {}));
  }
  s.p4.story = [...seen];
  for (const b of out) log(s, `【天下】${b.lines[0].text}`);
  return out;
}

