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
  today: ['.kk....kk.', 'kkkkkkkkkk', 'krrrrrrrrk', 'kkkkkkkkkk', 'kPPPPPPPPk', 'kPkPkkkkPk', 'kPPPPPPPPk', 'kPkPkkkPPk', 'kkkkkkkkkk'],
  flag: ['kk........', 'kbkkkkkk..', 'kbrrrrrrk.', 'kbrrwwrrrk', 'kbrrrrrrk.', 'kbkkkkkk..', 'kb........', 'kb........', 'kk........'],
};
// 功能菜单的图标：16×16 字符画，比上面的小图标多几种颜色（f 肤、F 肤影、c 浅褐、q 浅蓝、v 天青）
const FUNC_PAL: Record<string, number> = { ...ICON_PAL, f: C.skin, F: C.skinShade, c: C.lightBrown, q: C.lightBlue, v: C.sky };
export const FUNC_ICONS: Record<string, string[]> = {
  // 军功簿 红绶金牌
  record: [
    '................', '...kkk....kkk...', '...krrk..krrk...', '....krrkkrrk....',
    '.....krrrrk.....', '......kkkk......', '.....kggggk.....', '....kgyyyggk....',
    '...kgyywyyggk...', '...kgyyyyyggk...', '...kggyyyyogk...', '....kgggggok....',
    '.....kooook.....', '......kkkk......', '................', '................',
  ],
  // 状态 半身像
  status: [
    '................', '......kkkk......', '.....kBBBBk.....', '....kBBBBBBk....',
    '...kBBffffBBk...', '...kBfkffkfBk...', '...kBffffffBk...', '....kfFffFfk....',
    '.....kffffk.....', '....kkrrrrkk....', '...krrwrrwrrk...', '..krrrwyywrrrk..',
    '..krrrrwwrrrrk..', '..krrRrrrrRrrk..', '..kkkkkkkkkkkk..', '................',
  ],
  // 物品 葫芦
  items: [
    '................', '........kk......', '.......kbbk.....', '......kkkkk.....',
    '.....kggggk.....', '....kgyyggok....', '....kgygggok....', '.....kggook.....',
    '....kkrrrrkk....', '...kggggggggk...', '..kgyyggggggok..', '..kgyggggggook..',
    '..kggggggggook..', '...kgggggoook...', '....kkkkkkkk....', '................',
  ],
  // 副将 红缨盔
  generals: [
    '................', '.......kk.......', '......krrk......', '.....krork......',
    '......krk.......', '.....kkgkk......', '....kLLLLLLk....', '...kLwwLLLLGk...',
    '..kLwLLLLLLLGk..', '..kLLLLLLLLLGk..', '..kggggggggggk..', '..kGLk....kLGk..',
    '..kGLk....kLGk..', '..kGLkk..kkLGk..', '...kkk....kkk...', '................',
  ],
  // 任务 卷轴朱印
  quest: [
    '................', '..kkkkkkkkkkkk..', '.kcbbbbbbbbbbck.', '..kPPPPPPPPPPk..',
    '..kPkkkkkkkPPk..', '..kPPPPPPPPPPk..', '..kPkkkkkPPPPk..', '..kPPPPPPPPPPk..',
    '..kPkkkkkkPPPk..', '..kPPPPPPPrrrk..', '..kPkkkkPPrwrk..', '..kPPPPPPPrrrk..',
    '.kcbbbbbbbbbbck.', '..kkkkkkkkkkkk..', '................', '................',
  ],
  // 组队 两人
  team: [
    '................', '...kkkk.........', '..kBBBBk..kkkk..', '..kBffBk.kBBBBk.',
    '..kffffk.kBffBk.', '...kffk..kffffk.', '..kkuukk..kffk..', '.kuuuuuukkkrrkk.',
    '.kuquuuqukrrrrrk', '.kuquuuqukrorrok', '.kuuuuuuukrrrrrk', '.kuuuuuuukrrrrrk',
    '..kkkkkkkkkkkkk.', '................', '................', '................',
  ],
  // 排行 领奖台
  rank: [
    '................', '......k.k.k.....', '......kykyk.....', '......kyyyk.....',
    '......kgggk.....', '......kkkkk.....', '.....kgggggk....', '.....kgyyggk....',
    '.kkkkkgyggokkkk.', '.kLLLkgggggkccck', '.kLwLkgggggkcsck', '.kLLLkgggggkccck',
    '.kLLLkgggggkccck', '.kkkkkkkkkkkkkkk', '................', '................',
  ],
  // 国战 城头战旗
  guozhan: [
    '................', '......kk........', '......kbkkkkk...', '......kbrrrrrk..',
    '......kbrryrrrk.', '......kbrrrrrk..', '......kbkkkkk...', '......kb........',
    '.kk.kkkbkk.kk...', '.kGkkGkbGkkGk...', '.kGGGGGbGGGGGk..', '.kGLLGGGGLLGGk..',
    '.kGGGGkkkGGGGk..', '.kGLLGkBkGLLGk..', '.kkkkkkkkkkkkk..', '................',
  ],
  // 福利 红包
  welfare: [
    '................', '...kkkkkkkkkk...', '..krrrrrrrrrrk..', '..kRrrrrrrrrRk..',
    '..krRrrrrrrRrk..', '..krrRRggRRrrk..', '..krrrkgykrrrk..', '..krrrkyykrrrk..',
    '..krrrrkkrrrrk..', '..krrrrrrrrrrk..', '..krrgyyyygrrk..', '..krrrrrrrrrrk..',
    '..krrrrrrrrrrk..', '..kRRRRRRRRRRk..', '...kkkkkkkkkk...', '................',
  ],
  // 擂台 双剑
  arena: [
    '................', '.kk..........kk.', '.kwk........kwk.', '..kwk......kwk..',
    '...kwk....kwk...', '....kwk..kwk....', '.....kwkkwk.....', '......kwwk......',
    '......kwwk......', '.....kwkkwk.....', '...kkkk..kkkk...', '...kgk....kgk...',
    '..kbk......kbk..', '.kbk........kbk.', '.kk..........kk.', '................',
  ],
  // 帮派 牌坊
  sect: [
    '................', '.kkkkkkkkkkkkkk.', 'kRRRRRRRRRRRRRRk', '.kkkkkkkkkkkkkk.',
    '..krk.kkkk.krk..', '..krk.kygk.krk..', '..krk.kkkk.krk..', '.kkkkkkkkkkkkkk.',
    '.kRRRRRRRRRRRRk.', '.kkkkkkkkkkkkkk.', '..krk......krk..', '..krk......krk..',
    '..krk......krk..', '..krk......krk..', '.kkkkk....kkkkk.', '................',
  ],
  // 训练 木人桩
  train: [
    '................', '.......kkk......', '......kcttk.....', '......kcttk.....',
    '.......kck......', '...kkkkcckkkk...', '...kttcccttck...', '...kkkkcckkkk...',
    '......kcttk.....', '..kkkkkcttkkkk..', '..kttttcctttck..', '..kkkkkcttkkkk..',
    '......kcttk.....', '....kkkcttkkk...', '...kbbbbbbbbbk..', '...kkkkkkkkkkk..',
  ],
  // 宝库 宝箱
  vault: [
    '................', '................', '...kkkkkkkkkk...', '..kcccccccccck..',
    '..kcbbbbbbbbck..', '..kcbbbbbbbbck..', '.kkkkkkkkkkkkkk.', '.kggggkyykggggk.',
    '.kcbbbkgykbbbck.', '.kcbbbbkkbbbbck.', '.kcbbbbbbbbbbck.', '.kggggggggggggk.',
    '.kcbbbbbbbbbbck.', '.kkkkkkkkkkkkkk.', '................', '................',
  ],
  // 生活 鱼
  life: [
    '................', '................', '................', '.....kkkkk......',
    '...kkqqqqqkk..kk', '..kvvqqqqqqqkkqk', '.kvwkvqqqqqqqqqk', 'kvvkkvqqqqqqquk.',
    'kqvvvvqqqqqqquk.', '.kqqqqqqqqqqqqqk', '..kuqqqqqqquukuk', '...kkuuuuuukk.kk',
    '.....kkkkkk.....', '................', '................', '................',
  ],
  // 阵法 太极
  formation: [
    '................', '.....kkkkkk.....', '...kkPPPPPrkk...', '..kPPPPPPPPrrk..',
    '.kPPPPPrrPPPrrk.', '.kPPPPPrrPPPrrk.', '.kPPPPPPPPPrrrk.', '.kPPPPPPPrrrrrk.',
    '.kPPPPPrrrrrrrk.', '.kPPPrrrrrrrrrk.', '.kPPrrrrPPrrrrk.', '.kPPrrrrPPrrrrk.',
    '..kPPrrrrrrrrk..', '...kkPrrrrrkk...', '.....kkkkkk.....', '................',
  ],
  // 攻略 线装书
  guide: [
    '................', '..kkkkkkkkkkk...', '..kbPPPPPPPPPk..', '..kbPPkkkkkPPk..',
    '..kbPPPPPPPPPk..', '..kRPPrrrrPPPk..', '..kbPPrwwrPPPk..', '..kbPPrrrrPPPk..',
    '..kRPPPPPPPPPk..', '..kbPPkkkkPPPk..', '..kbPPPPPPPPPk..', '..kRPPkkkPPPPk..',
    '..kbPPPPPPPPPk..', '..kkkkkkkkkkkk..', '................', '................',
  ],
  // 设置 铜齿轮
  settings: [
    '................', '......kkkk......', '..kk..kggk..kk..', '..kgkkkggkkkgk..',
    '...kgggggggggk..', '...kggkkkkggk...', '.kkkgkk..kkgkkk.', '.kgggk....kgggk.',
    '.kgggk....kgggk.', '.kkkgkk..kkgkkk.', '...kggkkkkggk...', '...kgggggggggk..',
    '..kgkkkggkkkgk..', '..kk..kggk..kk..', '......kkkk......', '................',
  ],
};
export function funcIconTex(scene: Phaser.Scene, name: string): string {
  return ensure(scene, `fn:${name}`, () => {
    const rows = FUNC_ICONS[name];
    const g = new Grid(16, 16);
    rows.forEach((row, y) => [...row].forEach((ch, x) => {
      if (ch !== '.') g.set(x, y, FUNC_PAL[ch]);
    }));
    return g;
  });
}


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
