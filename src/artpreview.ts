import { LOOKS, POSES, drawAvatar, drawUnit, heroLook } from './art/units';
import { drawScene } from './art/scenes';
import type { SceneArt } from './art/scenes';
import { drawItemIcon } from './art/icons';

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
  for (const a of ['village', 'forest', 'hill', 'bamboo', 'grass', 'manor', 'valley', 'gate', 'camp', 'road'] as SceneArt[]) {
    const r = row(a);
    r.appendChild(drawScene(a, 180, 48, 0.62).toCanvas(2));
    r.appendChild(drawScene(a, 180, 120, 0.4).toCanvas(1));
  }
} else {
  for (const [k, L] of [...looks.slice(0, 18).filter((_, i) => i % 3 === 0 || mode === 'all'), ...Object.entries(LOOKS)]) {
    const r = row(k);
    for (const p of POSES) r.appendChild(drawUnit(L, p).toCanvas(3));
    r.appendChild(drawAvatar(L).toCanvas(3));
  }
  const r = row('icons');
  for (const id of ['dieda', 'zhixue', 'jinchuang', 'huichun', 'huami', 'qingquan', 'yaocai', 'zhusun', 'tiekuang']) r.appendChild(drawItemIcon(id).toCanvas(4));
}
