// 舆图：按出口方向把所有地点排到格子上（往北的出口就在上面一格），再按去没去过分三种：
// 去过的照常显示、和去过的地方相邻的只露个影子（「未至」）、其余藏在雾里
import { locations, startLocation } from '../data';
import type { Save } from './state';
import { exitsOf } from './state';

export interface Cell {
  x: number;
  y: number;
}

const DV: Record<string, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

let cached: Record<string, Cell> | null = null;

// 从起点广度优先铺开；撞到已经占了的格子就沿同一方向再挪一格，还不行就试旁边
export function worldLayout(): Record<string, Cell> {
  if (cached) return cached;
  const pos: Record<string, Cell> = { [startLocation]: { x: 0, y: 0 } };
  const used = new Set<string>(['0,0']);
  const key = (c: Cell) => `${c.x},${c.y}`;
  const queue = [startLocation];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const e of exitsOf(cur)) {
      if (e.locked || pos[e.to]) continue;
      const [dx, dy] = DV[e.dir];
      const base = pos[cur];
      const tries: Cell[] = [
        { x: base.x + dx, y: base.y + dy }, { x: base.x + dx * 2, y: base.y + dy * 2 },
        { x: base.x + dx + dy, y: base.y + dy + dx }, { x: base.x + dx - dy, y: base.y + dy - dx },
      ];
      const c = tries.find((t) => !used.has(key(t))) ?? tries[1];
      pos[e.to] = c;
      used.add(key(c));
      queue.push(e.to);
    }
  }
  // 没有出口连着的地方（宝洞从许昌的设施进）放在入口旁边
  for (const id of Object.keys(locations)) {
    if (pos[id]) continue;
    const near = id === 'baodong' ? pos.xuchang : pos[startLocation];
    const around: Cell[] = [[1, 1], [-1, 1], [1, -1], [-1, -1], [0, 2], [2, 0]].map(([dx, dy]) => ({ x: near.x + dx, y: near.y + dy }));
    const c = around.find((t) => !used.has(key(t))) ?? around[0];
    pos[id] = c;
    used.add(key(c));
  }
  // 平移到从 0 开始
  const minX = Math.min(...Object.values(pos).map((c) => c.x));
  const minY = Math.min(...Object.values(pos).map((c) => c.y));
  for (const c of Object.values(pos)) {
    c.x -= minX;
    c.y -= minY;
  }
  cached = pos;
  return pos;
}

export function worldSize(): { cols: number; rows: number } {
  const cs = Object.values(worldLayout());
  return { cols: Math.max(...cs.map((c) => c.x)) + 1, rows: Math.max(...cs.map((c) => c.y)) + 1 };
}

export function visited(s: Save, id: string): boolean {
  return id === startLocation || id === s.location || !!s.flags[`v_${id}`];
}

export type Fog = 'seen' | 'near' | 'hidden';

// 去过的 seen；和去过的地方直接相连的 near；其余 hidden
export function fogOf(s: Save): Record<string, Fog> {
  const out: Record<string, Fog> = {};
  for (const id of Object.keys(locations)) out[id] = visited(s, id) ? 'seen' : 'hidden';
  for (const id of Object.keys(locations)) {
    if (out[id] !== 'seen') continue;
    for (const e of exitsOf(id)) if (!e.locked && out[e.to] === 'hidden') out[e.to] = 'near';
  }
  return out;
}

// 两地之间的路（只画两头都露出来的）
export function worldRoads(): [string, string][] {
  const seen = new Set<string>();
  const out: [string, string][] = [];
  for (const id of Object.keys(locations)) {
    for (const e of exitsOf(id)) {
      if (e.locked) continue;
      const k = [id, e.to].sort().join('|');
      if (seen.has(k)) continue;
      seen.add(k);
      out.push([id, e.to]);
    }
  }
  return out;
}

export function levelRange(id: string): [number, number] | null {
  const gs = locations[id].groups;
  if (!gs.length) return null;
  return [Math.min(...gs.map((g) => g.level[0])), Math.max(...gs.map((g) => g.level[1]))];
}
