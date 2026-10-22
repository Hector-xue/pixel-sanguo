// 把程序生成的像素图注册成 Phaser 贴图，按需生成并缓存
import Phaser from 'phaser';
import { drawAvatar, drawUnit, lookFor } from './units';
import type { Pose } from './units';
import { drawScene } from './scenes';
import { drawBust } from './bust';
import type { SceneArt } from './scenes';
import { drawGearIcon, drawItemIcon, drawMount } from './icons';
import { C } from './palette';
import { Grid } from './pixel';
import { drawProp } from './props';
import type { PropKind } from './props';

function ensure(scene: Phaser.Scene, key: string, make: () => Grid): string {
  if (!scene.textures.exists(key)) scene.textures.addCanvas(key, make().toCanvas(1));
  return key;
}

export function unitTex(scene: Phaser.Scene, look: string, variant: number, pose: Pose): string {
  return ensure(scene, `u:${look}:${variant}:${pose}`, () => drawUnit(lookFor(look, variant), pose));
}

export function avatarTex(scene: Phaser.Scene, look: string, variant = 0): string {
  return ensure(scene, `a:${look}:${variant}`, () => drawAvatar(lookFor(look, variant)));
}

export function bustTex(scene: Phaser.Scene, look: string, variant = 0): string {
  return ensure(scene, `b:${look}:${variant}`, () => drawBust(lookFor(look, variant)));
}

export function sceneTex(scene: Phaser.Scene, art: string, w: number, h: number, horizon: number): string {
  return ensure(scene, `s:${art}:${w}x${h}`, () => drawScene(art as SceneArt, w, h, horizon));
}

export function iconTex(scene: Phaser.Scene, item: string): string {
  return ensure(scene, `i:${item}`, () => drawItemIcon(item));
}

export function gearTex(scene: Phaser.Scene, slot: string, tier: number, cls?: string): string {
  return ensure(scene, `g:${slot}:${tier}:${cls ?? ''}`, () => drawGearIcon(slot, tier, cls));
}

export function mountTex(scene: Phaser.Scene, color: string): string {
  const pal = C as Record<string, number>;
  const body = pal[color] ?? C.brown;
  const mane = body === C.ink || body === C.navy || body === C.darkPurple ? C.gray : body === C.white || body === C.lightPaper ? C.lightGray : C.ink;
  return ensure(scene, `m:${color}`, () => drawMount(body, mane));
}

export function heroLookKey(classId: string, gender: string): string {
  return `hero_${classId}_${gender}`;
}

// 场景摆设（同一种东西按 seed 取几种变体）
export function propTex(scene: Phaser.Scene, kind: PropKind, seed: number): string {
  const v = seed % 4;
  return ensure(scene, `p:${kind}:${v}`, () => drawProp(kind, v * 7919 + kind.length));
}

// 界面小图标：字符画，一个字符一格
const ICON_PAL: Record<string, number> = {
  k: C.ink, b: C.brown, B: C.darkBrown, t: C.tan, s: C.sand, p: C.paper, P: C.lightPaper, r: C.red, R: C.darkRed, o: C.orange,
  g: C.gold, y: C.yellow, w: C.white, G: C.gray, L: C.lightGray, D: C.darkGray, e: C.green, E: C.darkGreen, l: C.lime, n: C.navy, u: C.blue, i: C.pink,
};
const UI_ICONS: Record<string, string[]> = {
  house: [
    '.....kk.....', '....krrk....', '...krRRrk...', '..krRRRRrk..', '.krRRRRRRrk.', 'kkkkkkkkkkkk',
    '.kPPPPPPPPk.', '.kPbbPPbbPk.', '.kPbbPkkPPk.', '.kPPPPkbkPk.', '.kPPPPkbkPk.', '.kkkkkkkkkk.',
  ],
  map: [
    'kkk..kkk..kk', 'ksskkppkkssk', 'ksspprppsssk', 'kspprrpspssk', 'ksppprpssrsk', 'kspppprsrrsk',
    'kspppprrrssk', 'ksspppppsssk', 'kssppskpppsk', 'ksskkppkkssk', 'kkk..kkk..kk', '............',
  ],
  bag: [
    '....kkkk....', '...kbkkbk...', '...kb..bk...', '..kkkkkkkk..', '.kbbbbbbbbk.', 'kbttttttttbk',
    'kbttkggkttbk', 'kbttkyykttbk', 'kbttkkkkttbk', 'kbttttttttbk', '.kbbbbbbbbk.', '..kkkkkkkk..',
  ],
  helmet: [
    '.....kk.....', '....krrk....', '....krrk....', '...kLLLLk...', '..kLwLLLLk..', '.kLwLLLLLGk.',
    '.kLLLLLLLGk.', '.kggggggggk.', '.kLGk..kLGk.', '.kLGk..kLGk.', '..kk....kk..', '............',
  ],
  scroll: [
    '.kkkkkkkkkk.', 'kbbbbbbbbbbk', '.kPPPPPPPPk.', '.kPkkkkkkPk.', '.kPPPPPPPPk.', '.kPkkkkkPPk.',
    '.kPPPPPPPPk.', '.kPkkkkkkPk.', '.kPPPPPPPPk.', 'kbbbbbbbbbbk', '.kkkkkkkkkk.', '............',
  ],
  coin: ['..kkkk..', '.kLLLLk.', 'kLwkkLGk', 'kLLkkLGk', 'kLLLLLGk', '.kGGGGk.', '..kkkk..'],
  ingot: ['........', '..kkkk..', 'kkgyygkk', 'kgyyyygk', 'kgggggok', '.kooook.', '..kkkk..'],
  heart: ['.kk.kk.', 'krrkrrk', 'krwrrrk', 'krrrrrk', '.krrrk.', '..krk..', '...k...'],
  sword: ['.......kk', '......kwk', '.....kwk.', '..k.kwk..', '..kkwk...', '...kbk...', '..kbkkk..', '.kbk.....', 'kkk......'],
  chat: ['.kkkkkkkk.', 'kPPPPPPPPk', 'kPkkPkkPPk', 'kPPPPPPPPk', 'kPkkkPkkPk', 'kPPPPPPPPk', '.kkPkkkkk.', '..kk......'],
  gift: ['..kk.kk...', '.krrkrrk..', 'kkkkkkkkkk', 'krrrgyrrrk', 'kkkkkkkkkk', '.krrgyrrk.', '.krrgyrrk.', '.krrgyrrk.', '.kkkkkkkk.'],
  flag: ['kk........', 'kbkkkkkk..', 'kbrrrrrrk.', 'kbrrwwrrrk', 'kbrrrrrrk.', 'kbkkkkkk..', 'kb........', 'kb........', 'kk........'],
};
export function uiIconTex(scene: Phaser.Scene, name: string): string {
  return ensure(scene, `ui:${name}`, () => {
    const rows = UI_ICONS[name];
    const g = new Grid(rows[0].length, rows.length);
    rows.forEach((row, y) => [...row].forEach((ch, x) => {
      if (ch !== '.') g.set(x, y, ICON_PAL[ch]);
    }));
    return g;
  });
}
