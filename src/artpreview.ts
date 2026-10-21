import { LOOKS, POSES, drawAvatar, drawUnit, heroLook, lookFor } from './art/units';
import { drawScene } from './art/scenes';
import type { SceneArt } from './art/scenes';
import { drawGearIcon, drawItemIcon, drawMount } from './art/icons';
import { C } from './art/palette';
import { items, mounts } from './data';

const out = document.getElementById('out')!;
const row = (label: string) => {
  const d = document.createElement('div');
  d.className = 'row';
  d.textContent = label + ' ';
  out.appendChild(d);
  return d;
};
const looks: [string, ReturnType<typeof heroLook>][] = [];
for (const c of ['warrior', 'scholar', 'mystic']) for (const g of ['male', 'female']) for (let v = 0; v < 3; v++) looks.push([`${c}/${g}/${v}`, heroLook(c, g, v)]);
const mode = location.hash.slice(1);
if (mode === 'scenes') {
  for (const a of (location.search.includes('new') ? ['tomb', 'marsh', 'ruins', 'pass', 'altar'] : ['village', 'forest', 'hill', 'bamboo', 'grass', 'manor', 'valley', 'gate', 'camp', 'road', 'city', 'farm', 'river', 'cave', 'tomb', 'marsh', 'ruins', 'pass', 'altar']) as SceneArt[]) {
    const r = row(a);
    r.appendChild(drawScene(a, 180, 48, 0.62).toCanvas(2));
    r.appendChild(drawScene(a, 180, 120, 0.4).toCanvas(1));
  }
} else if (mode === 'icons') {
  let r = row('items');
  for (const id of Object.keys(items)) r.appendChild(drawItemIcon(id).toCanvas(4));
  for (const cls of ['warrior', 'scholar', 'mystic']) {
    r = row(`gear ${cls}`);
    for (let t = 1; t <= 5; t++) for (const slot of ['head', 'neck', 'weapon', 'wrist', 'armor', 'boots']) r.appendChild(drawGearIcon(slot, t, cls).toCanvas(3));
  }
  r = row('mounts');
  const pal = C as Record<string, number>;
  for (const m of Object.values(mounts)) r.appendChild(drawMount(pal[m.color] ?? C.brown, C.ink).toCanvas(3));
  r = row('class change');
  for (const k of ['cls:g_chendeng:scholar', 'cls:g_chendeng:mystic', 'cls:g_daqiao:warrior', 'cls:caokou:scholar']) r.appendChild(drawUnit(lookFor(k), 'idle').toCanvas(3));
} else {
  const keys = mode === 'p2' ? Object.entries(LOOKS).slice(16) : [...looks.slice(0, 18).filter((_, i) => i % 3 === 0 || mode === 'all'), ...Object.entries(LOOKS)];
  for (const [k, L] of keys) {
    const r = row(k);
    for (const p of POSES) r.appendChild(drawUnit(L, p).toCanvas(3));
    r.appendChild(drawAvatar(L).toCanvas(3));
  }
}
