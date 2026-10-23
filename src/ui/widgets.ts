// 像素界面小部件：全部用整数坐标的实心矩形画，保证放大后边缘干净
import Phaser from 'phaser';
import { settings } from './settings';
import { pushBack } from './back';
import { sfx } from './audio';
import { C, css, hex } from '../art/palette';
import { PAPER, UI, drawFace, faceText, paperTex, sealBox, titlePlaque, woodFrame } from '../art/chrome';
import type { Face } from '../art/chrome';

// 逻辑宽度：标准 360；设置里选了「画面放大」是 320（整屏按宽度缩放，东西就大一成）。
// 画面最矮 640：屏幕要够长（高宽比 2 以上，18:9 及更长的手机）放大才真起作用，不够长的照旧 360
export function bigFits(): boolean {
  return window.innerHeight / Math.max(1, window.innerWidth) >= 2;
}
export const W = settings().big && bigFits() ? 320 : 360;
// 高度随手机屏幕比例伸缩（640～860，覆盖到 21:9 的长屏），多出来的给聊天区；宽度固定 360
export function calcH(): number {
  const ratio = window.innerHeight / Math.max(1, window.innerWidth);
  return Math.max(640, Math.min(860, Math.round(W * ratio)));
}
// 进出全屏后屏幕比例变了，由 main.ts 改它并重排当前场景（ES 模块导出是活绑定，各处读到的都是新值）
export let H = calcH();
export function setH(v: number): void {
  H = v;
}
// 屏幕顶上被状态栏、挖孔摄像头盖住的高度（画布像素）。背景（天空、场景）照样铺到最顶，字和按钮从这下面开始
export let SAFE_TOP = 0;
export function setSafeTop(v: number): void {
  SAFE_TOP = v;
}
export { FONT, charWidth, textWidth, wrap } from './textfit';
import { FONT, fit, textWidth, wrap } from './textfit';

export type FrameStyle = 'paper' | 'tan' | 'dark' | 'red' | 'pressed' | 'disabled' | 'ink' | 'blue' | 'magenta' | 'orange' | 'steel' | 'row';

// 面板配色：宣纸面板、浅黄卡片、木色描边（文字用调色板原色：墨、褐、朱）
const STYLES: Record<FrameStyle, { fill: number; border: number; hi: number; lo: number }> = {
  paper: { fill: PAPER.base, border: 0x3a2414, hi: PAPER.hi, lo: PAPER.edge },
  tan: { fill: 0xe8d6ae, border: 0xa88a5c, hi: 0xf7ecd2, lo: 0xcbb184 },
  pressed: { fill: 0xd6bf8e, border: 0x8a6c40, hi: 0xe6d2a8, lo: 0xb89c6c },
  disabled: { fill: 0xd8cfbc, border: 0xa89c86, hi: 0xe6dfd0, lo: 0xc0b6a2 },
  red: { fill: 0x8c1410, border: 0x300000, hi: 0xff7050, lo: 0x5a0804 },
  blue: { fill: 0x2440b0, border: 0x060c40, hi: 0x6c98ff, lo: 0x162878 },
  magenta: { fill: 0x8a1aa0, border: 0x28042e, hi: 0xe070ff, lo: 0x5a0c6a },
  orange: { fill: 0xb05008, border: 0x401400, hi: 0xffb040, lo: 0x6a2804 },
  dark: { fill: 0x2a1a10, border: UI.goldLo, hi: UI.gold, lo: 0x000000 },
  steel: { fill: 0x50505a, border: 0x101014, hi: 0x9090a0, lo: 0x303038 },
  row: { fill: 0xe8d6ae, border: 0xa88a5c, hi: 0xf7ecd2, lo: 0xcbb184 },
  ink: { fill: 0x1c120c, border: 0x000000, hi: 0x6a4a2c, lo: 0x0c0604 },
};

// 按钮用亮色渐变面（原版的金黄按钮、红按钮、蓝按钮、紫按钮）
const FACE_OF: Record<FrameStyle, Face> = {
  paper: 'gold', tan: 'gold', pressed: 'gold', disabled: 'gray', red: 'red', blue: 'blue', magenta: 'magenta', orange: 'orange', dark: 'sel', ink: 'dark', steel: 'steel', row: 'gold',
};

// 调色板里的字色本来就是按宣纸配的（墨、褐、朱、绿），直接用；大于 31 的当作原始色值
export function uiColor(c: number): string {
  if (c > 31) return '#' + c.toString(16).padStart(6, '0');
  return css(c);
}

function rawColor(c: number): string {
  return c > 31 ? '#' + c.toString(16).padStart(6, '0') : css(c);
}

export function textColor(style: FrameStyle): number {
  return faceText(FACE_OF[style]);
}

export function frame(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, style: FrameStyle = 'paper'): void {
  const s = STYLES[style];
  g.fillStyle(s.border).fillRect(x + 1, y, w - 2, h).fillRect(x, y + 1, w, h - 2);
  g.fillStyle(s.fill).fillRect(x + 1, y + 1, w - 2, h - 2);
  g.fillStyle(s.hi).fillRect(x + 1, y + 1, w - 2, 1).fillRect(x + 1, y + 1, 1, h - 2);
  g.fillStyle(s.lo).fillRect(x + 1, y + h - 2, w - 2, 1).fillRect(x + w - 2, y + 1, 1, h - 2);
}

// 金边框（主界面、战果、角色立绘框）：外深内亮两道
export function goldFrame(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, fill: number | null = UI.black): void {
  g.fillStyle(0x000000).fillRect(x, y, w, h);
  g.fillStyle(UI.goldLo).fillRect(x + 1, y + 1, w - 2, h - 2);
  g.fillStyle(UI.gold).fillRect(x + 2, y + 2, w - 4, h - 4);
  g.fillStyle(UI.goldHi).fillRect(x + 2, y + 2, w - 4, 1);
  g.fillStyle(0x000000).fillRect(x + 3, y + 3, w - 6, h - 6);
  if (fill !== null) g.fillStyle(fill).fillRect(x + 4, y + 4, w - 8, h - 8);
  else g.fillStyle(0x000000, 0).fillRect(x + 4, y + 4, w - 8, h - 8);
  // 四角小方钉
  for (const [cx, cy] of [[x + 1, y + 1], [x + w - 4, y + 1], [x + 1, y + h - 4], [x + w - 4, y + h - 4]]) {
    g.fillStyle(UI.goldHi).fillRect(cx, cy, 3, 3);
    g.fillStyle(UI.goldLo).fillRect(cx + 1, cy + 1, 1, 1);
  }
}

export function rect(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, color: number): void {
  g.fillStyle(color > 31 ? color : hex(color)).fillRect(x, y, w, h);
}

export interface TextOpts {
  color?: number;
  wrap?: number;
  align?: 'left' | 'center' | 'right';
  scale?: number;
  lineGap?: number;
  stroke?: number;
  // 颜色不做深色底映射（画在亮色按钮、战场上的字）
  raw?: boolean;
}

export function text(scene: Phaser.Scene, x: number, y: number, s: string, o: TextOpts = {}): Phaser.GameObjects.Text {
  const body = o.wrap ? wrap(s, o.wrap).join('\n') : s;
  const t = scene.add.text(Math.round(x), Math.round(y), body, {
    fontFamily: FONT,
    fontSize: '12px',
    color: o.raw ? rawColor(o.color ?? UI.white) : uiColor(o.color ?? C.darkBrown),
    lineSpacing: o.lineGap ?? 3,
    align: o.align ?? 'left',
    stroke: o.stroke !== undefined ? rawColor(o.stroke) : undefined,
    strokeThickness: o.stroke !== undefined ? 2 : 0,
    padding: { top: 1, bottom: 1 },
  });
  if (o.scale) t.setScale(o.scale);
  if (o.align === 'center') t.setOrigin(0.5, 0);
  if (o.align === 'right') t.setOrigin(1, 0);
  return t;
}

export function textLines(s: string, max: number, gap = 3): number {
  return wrap(s, max).length * (12 + gap);
}

// 一行放不下就截断加省略号；截过的点一下弹出整句（clip：在滚动列表里时，拖动不算点）
export function fitText(scene: Phaser.Scene, x: number, y: number, s: string, maxW: number, o: TextOpts = {}, clip?: Clip): Phaser.GameObjects.Text {
  const short = fit(s, maxW);
  const t = text(scene, x, y, short, o);
  if (short !== s) {
    t.setInteractive({ useHandCursor: true });
    t.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (clip && (!clip.contains(p.x, p.y) || clip.dragging())) return;
      toast(scene, s, 2800);
    });
  }
  return t;
}

// 换分页：新的一页从淡到实浮出来（120ms），不是整块一下子换掉
export function tabFade(scene: Phaser.Scene, c: Phaser.GameObjects.Container): void {
  scene.tweens.killTweensOf(c);
  c.setAlpha(0.2);
  scene.tweens.add({ targets: c, alpha: 1, duration: 120, ease: 'Quad.easeOut' });
}

export interface Clip {
  contains(x: number, y: number): boolean;
  dragging(): boolean;
}

export interface ButtonOpts {
  style?: FrameStyle;
  disabled?: boolean;
  clip?: Clip;
  color?: number;
}

export class Button extends Phaser.GameObjects.Container {
  private g: Phaser.GameObjects.Graphics;
  private label: Phaser.GameObjects.Text;
  private zone: Phaser.GameObjects.Zone;
  private down = false;
  style: FrameStyle;
  disabled: boolean;

  constructor(scene: Phaser.Scene, x: number, y: number, public bw: number, public bh: number, caption: string, private onTap: () => void, private o: ButtonOpts = {}) {
    super(scene, Math.round(x), Math.round(y));
    // 没有字的按钮是列表行（字另外叠上去），画成深色行而不是金按钮
    this.style = o.style ?? (caption === '' ? 'row' : 'tan');
    this.disabled = !!o.disabled;
    this.g = scene.add.graphics();
    this.label = text(scene, bw / 2, Math.round((bh - 14) / 2), caption, { align: 'center', raw: true });
    this.zone = scene.add.zone(0, 0, bw, bh).setOrigin(0).setInteractive({ useHandCursor: true });
    this.add([this.g, this.label, this.zone]);
    this.zone.on('pointerdown', () => {
      if (this.disabled) return;
      this.down = true;
      this.redraw();
    });
    this.zone.on('pointerout', () => {
      this.down = false;
      this.redraw();
    });
    this.zone.on('pointerup', (p: Phaser.Input.Pointer) => {
      const was = this.down;
      this.down = false;
      this.redraw();
      if (!was || this.disabled) return;
      if (this.o.clip && (!this.o.clip.contains(p.x, p.y) || this.o.clip.dragging())) return;
      sfx('click');
      this.onTap();
    });
    this.redraw();
    scene.add.existing(this);
  }

  setCaption(s: string): this {
    this.label.setText(s);
    return this;
  }

  setDisabled(d: boolean): this {
    this.disabled = d;
    this.redraw();
    return this;
  }

  setStyle(s: FrameStyle): this {
    this.style = s;
    this.redraw();
    return this;
  }

  private redraw(): void {
    const face: Face = this.disabled ? 'gray' : FACE_OF[this.style];
    this.g.clear();
    if (this.style === 'row') frame(this.g, 0, 0, this.bw, this.bh, this.disabled ? 'disabled' : this.down ? 'pressed' : 'row');
    else drawFace(this.g, 0, 0, this.bw, this.bh, face, this.down);
    this.label.setColor(rawColor(this.o.color !== undefined && !this.disabled ? (this.o.color <= 31 ? hex(this.o.color) : this.o.color) : faceText(face)));
    this.label.setY(Math.round((this.bh - 14) / 2) + (this.down ? 1 : 0));
  }
}

// 点击区域（不画东西）
export function hit(scene: Phaser.Scene, x: number, y: number, w: number, h: number, onTap: () => void, clip?: Clip): Phaser.GameObjects.Zone {
  const z = scene.add.zone(x, y, w, h).setOrigin(0).setInteractive({ useHandCursor: true });
  let down = false;
  z.on('pointerdown', () => (down = true));
  z.on('pointerout', () => (down = false));
  z.on('pointerup', (p: Phaser.Input.Pointer) => {
    if (!down) return;
    down = false;
    if (clip && (!clip.contains(p.x, p.y) || clip.dragging())) return;
    sfx('click');
    onTap();
  });
  return z;
}

export function bar(scene: Phaser.Scene, x: number, y: number, w: number, h: number, ratio: number, fill: number, back: number): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  drawBar(g, x, y, w, h, ratio, fill, back);
  return g;
}

const BAR_FILL: Partial<Record<number, number>> = { [C.red]: 0xf01818, [C.lightBlue]: 0x2c50ff, [C.blue]: 0x2c50ff, [C.gold]: 0xffc020 };
const BAR_BACK: Partial<Record<number, number>> = { [C.darkRed]: 0x4a0606, [C.navy]: 0x0a1050, [C.sand]: 0x302410 };

export function drawBar(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, ratio: number, fill: number, back: number): void {
  g.clear();
  g.fillStyle(0x000000).fillRect(x, y, w, h);
  g.fillStyle(BAR_BACK[back] ?? 0x20202c).fillRect(x + 1, y + 1, w - 2, h - 2);
  const r = Math.max(0, Math.min(1, ratio));
  const fw = Math.round((w - 2) * r);
  if (fw > 0) {
    // 原版血条是饱和的纯红、纯蓝
    g.fillStyle(BAR_FILL[fill] ?? hex(fill)).fillRect(x + 1, y + 1, fw, h - 2);
    if (h > 3) g.fillStyle(0xffffff, 0.45).fillRect(x + 1, y + 1, fw, 1);
  }
}

// 可拖动滚动的区域：content 里随便放东西，最后 setContentHeight
export class ScrollArea implements Clip {
  content: Phaser.GameObjects.Container;
  private maskG: Phaser.GameObjects.Graphics;
  private bar: Phaser.GameObjects.Graphics;
  private scroll = 0;
  private contentH = 0;
  private dragStart: { y: number; scroll: number } | null = null;
  private moved = false;
  private handlers: [string, Function][] = [];
  // 外面那层（弹窗）往下挪了多少：遮罩和点按判断跟着挪（弹窗按内容缩短后会居中下移）
  private offY = 0;

  constructor(private scene: Phaser.Scene, public x: number, public y: number, public w: number, public h: number, parent?: Phaser.GameObjects.Container) {
    this.content = scene.add.container(x, y);
    this.maskG = scene.make.graphics({}, false);
    this.maskG.fillStyle(0xffffff).fillRect(x, y, w, h);
    this.content.setMask(this.maskG.createGeometryMask());
    (this.content as unknown as { __area: ScrollArea }).__area = this;
    const follow = () => {
      const p = this.content.parentContainer;
      const ty = p ? Math.round(p.getWorldTransformMatrix().ty) : 0;
      this.offY = ty;
      this.maskG.y = ty;
    };
    scene.events.on('postupdate', follow);
    this.handlers.push(['__postupdate', follow]);
    this.bar = scene.add.graphics();
    if (parent) parent.add([this.content, this.bar]);
    const on = (ev: string, fn: Function) => {
      scene.input.on(ev, fn);
      this.handlers.push([ev, fn]);
    };
    on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (!this.content.active) return;
      if (this.containsRaw(p.x, p.y)) {
        this.dragStart = { y: p.y, scroll: this.scroll };
        this.moved = false;
      }
    });
    on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.dragStart || !p.isDown) return;
      const dy = p.y - this.dragStart.y;
      if (Math.abs(dy) > 4) this.moved = true;
      if (this.moved) this.setScroll(this.dragStart.scroll - dy);
    });
    on('pointerup', () => {
      this.dragStart = null;
      // 松手这一帧按钮还要判断 dragging()，下一帧再清
      scene.time.delayedCall(0, () => (this.moved = false));
    });
    on('wheel', (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      if (this.content.active && this.containsRaw(p.x, p.y)) this.setScroll(this.scroll + dy * 0.5);
    });
    this.content.once('destroy', () => this.dispose());
  }

  private containsRaw(px: number, py: number): boolean {
    const y = this.y + this.offY;
    return px >= this.x && px < this.x + this.w && py >= y && py < y + this.h;
  }

  // 内容实际占到哪儿（弹窗按内容定高用）：内容比可视区短就到内容底
  get usedBottom(): number {
    return this.y + Math.min(this.h, this.contentH);
  }

  contains(px: number, py: number): boolean {
    return this.containsRaw(px, py);
  }

  dragging(): boolean {
    return this.moved;
  }

  setContentHeight(h: number): void {
    this.contentH = h;
    this.setScroll(this.scroll);
  }

  scrollToBottom(): void {
    this.setScroll(1e9);
  }

  setScroll(v: number): void {
    const max = Math.max(0, this.contentH - this.h);
    this.scroll = Math.round(Math.max(0, Math.min(max, v)));
    this.content.y = this.y - this.scroll;
    this.bar.clear();
    if (max > 0) {
      const bh = Math.max(12, Math.round((this.h * this.h) / this.contentH));
      const by = this.y + Math.round(((this.h - bh) * this.scroll) / max);
      rect(this.bar, this.x + this.w - 3, this.y, 2, this.h, 0xd8c294);
      rect(this.bar, this.x + this.w - 3, by, 2, bh, 0x8a5c32);
    }
  }

  destroy(): void {
    this.content.destroy();
    this.bar.destroy();
  }

  private dispose(): void {
    for (const [ev, fn] of this.handlers) {
      if (ev === '__postupdate') this.scene.events.off('postupdate', fn as never);
      else this.scene.input.off(ev, fn as never);
    }
    this.handlers = [];
    this.maskG.destroy();
  }
}

// 弹窗：铺一层挡板吃掉下面的点击，上面是宣纸面板
// 弹窗默认最高多少（普通 640 高的手机上正好铺满）
export const MODAL_MAX_H = 580;

export class Modal extends Phaser.GameObjects.Container {
  inner: Phaser.GameObjects.Container;
  px: number;
  py: number;
  pw: number;
  ph: number;

  // 看得见的高度：默认高度的弹窗内容少时缩到内容那么高（ph 不变，面板照旧按 ph 排版）
  vh: number;
  private frameG!: Phaser.GameObjects.Graphics;
  private dimG!: Phaser.GameObjects.Graphics;
  private paper!: Phaser.GameObjects.Image;
  private blockZ!: Phaser.GameObjects.Zone;
  private sig = '';
  private fitOff = 0;
  private fitted = false;
  lift = 6;

  constructor(scene: Phaser.Scene, title: string, opts: { x?: number; y?: number; w?: number; h?: number; close?: string | null; onClose?: () => void; dim?: boolean; help?: string } = {}) {
    super(scene, 0, 0);
    this.pw = opts.w ?? W - 16;
    // 默认高度：顶上让开刘海、摄像头那条，最高按普通手机的样子来（长屏手机上不拉得老长，内容少的空一大截）
    const room = H - SAFE_TOP - 40;
    this.ph = Math.min(opts.h ?? Math.min(room - 20, MODAL_MAX_H), room);
    this.px = opts.x ?? Math.round((W - this.pw) / 2);
    this.py = opts.y ?? SAFE_TOP + 20 + Math.round((room - this.ph) / 2);
    this.vh = this.ph;
    const block = scene.add.zone(0, 0, W, H).setOrigin(0).setInteractive();
    // 底下压暗；面板是漆木框 + 宣纸，标题写在朱漆题签上
    this.dimG = scene.add.graphics();
    if (opts.dim !== false) this.dimG.fillStyle(0x0a0604, 0.62).fillRect(0, -H, W, H * 3);
    this.frameG = scene.add.graphics();
    woodFrame(this.frameG, this.px - 2, this.py - 2, this.pw + 4, this.ph + 4);
    this.paper = scene.add.image(this.px + 4, this.py + 4, paperTex(scene, this.pw - 8, this.ph - 8)).setOrigin(0);
    this.blockZ = block;
    this.add([block, this.dimG, this.frameG, this.paper]);
    const deco = scene.add.graphics();
    if (title) {
      const tw = Math.max(64, textWidth(title) + 28);
      titlePlaque(deco, this.px + this.pw / 2, this.py + 5, tw);
      // 题签两侧一道淡墨线
      deco.fillStyle(PAPER.edge).fillRect(this.px + 10, this.py + 14, this.pw / 2 - tw / 2 - 22, 1).fillRect(this.px + this.pw / 2 + tw / 2 + 12, this.py + 14, this.pw / 2 - tw / 2 - 22, 1);
    }
    this.add(deco);
    if (title) this.add(text(scene, this.px + this.pw / 2, this.py + 7, title, { align: 'center', color: 0xfff0c0, stroke: 0x4a0804 }));
    this.inner = scene.add.container(0, 0);
    this.add(this.inner);
    if (opts.close !== null) {
      const close = () => {
        this.close();
        opts.onClose?.();
      };
      if (opts.close) {
        this.add(new Button(scene, this.px + this.pw - 48, this.py + 4, 42, 18, opts.close, close, { style: 'red' }));
      } else {
        // 印章式关闭钮：朱红方块里一个 ×
        const sx = this.px + this.pw - 24;
        const sy = this.py + 4;
        const cg = scene.add.graphics();
        const draw = (down: boolean) => {
          cg.clear();
          sealBox(cg, sx, sy, 18, down);
          cg.fillStyle(0xfff0c0);
          for (let k = 0; k < 8; k++) {
            cg.fillRect(sx + 5 + k, sy + 5 + k, 2, 1);
            cg.fillRect(sx + 12 - k, sy + 5 + k, 2, 1);
          }
        };
        draw(false);
        const z = scene.add.zone(sx - 6, sy - 4, 30, 26).setOrigin(0).setInteractive({ useHandCursor: true });
        z.on('pointerdown', () => draw(true));
        z.on('pointerout', () => draw(false));
        z.on('pointerup', () => {
          draw(false);
          sfx('click');
          close();
        });
        this.add([cg, z]);
      }
    }
    // 左上角「？」：打开攻略里讲这个的那一条
    if (opts.help && helpOpener) {
      const topic = opts.help;
      const hx = this.px + 8;
      const hy = this.py + 4;
      const hg = scene.add.graphics();
      sealBox(hg, hx, hy, 18, false);
      const hz = scene.add.zone(hx - 4, hy - 4, 28, 26).setOrigin(0).setInteractive({ useHandCursor: true });
      hz.on('pointerup', () => {
        sfx('click');
        helpOpener?.(scene, topic);
      });
      this.add([hg, text(scene, hx + 9, hy + 3, '?', { align: 'center', color: 0xfff0c0 }), hz]);
    }
    // 返回键：有关闭钮的弹窗就关掉（没有的要在里面选，返回键不动它，也不让它漏到底下）
    const offBack = pushBack(opts.close !== null ? () => {
      this.close();
      opts.onClose?.();
    } : () => undefined);
    this.once(Phaser.GameObjects.Events.DESTROY, offBack);
    this.setDepth(100 + modalDepth++);
    scene.add.existing(this);
    // 淡入 + 轻轻上浮
    this.setAlpha(0).setY(6);
    scene.tweens.add({ targets: this, alpha: 1, lift: 0, duration: 140, ease: 'Quad.easeOut' });
    // 只有默认高度的弹窗才按内容收缩
    const auto = opts.h === undefined && opts.y === undefined;
    const tick = () => {
      if (!this.active) return void scene.events.off('postupdate', tick);
      if (auto) this.autoFit();
      this.y = this.fitOff + this.lift;
    };
    scene.events.on('postupdate', tick);
  }

  // 内容变了（翻页、刷新）就重新量一次：没有滚动列表的，缩到最下面那样东西再留一点边
  private autoFit(): void {
    let n = 0;
    let sum = 0;
    const each = (o: Phaser.GameObjects.GameObject) => {
      n++;
      sum += Math.round((o as unknown as { y: number }).y ?? 0) + ((o as unknown as { __area?: ScrollArea }).__area?.usedBottom ?? 0);
      const list = (o as Phaser.GameObjects.Container).list;
      if (list) list.forEach(each);
    };
    this.inner.list.forEach(each);
    const sig = `${n}:${sum}`;
    if (sig === this.sig) return;
    this.sig = sig;
    let masked = false;
    let bottom = this.py + 30;
    const measure = (o: Phaser.GameObjects.GameObject) => {
      const any = o as unknown as { visible?: boolean; mask?: unknown; list?: Phaser.GameObjects.GameObject[]; commandBuffer?: number[]; getBounds?: () => Phaser.Geom.Rectangle; type: string };
      if (any.visible === false) return;
      if (any.mask) {
        // 滚动列表：内容少就量到内容底，满了就铺满
        const area = (o as unknown as { __area?: ScrollArea }).__area;
        if (area && area.usedBottom < area.y + area.h) bottom = Math.max(bottom, area.usedBottom);
        else masked = true;
        return;
      }
      if (any.type === 'Graphics' && any.commandBuffer) {
        const m = (o as Phaser.GameObjects.Graphics).getWorldTransformMatrix();
        const yb = graphicsBottom(any.commandBuffer);
        if (yb > -Infinity) bottom = Math.max(bottom, m.ty - this.y + yb);
      } else if (any.type !== 'Zone' && any.type !== 'Container' && any.getBounds) {
        const b = any.getBounds();
        if (b.height > 0) bottom = Math.max(bottom, b.bottom - this.y);
      }
      if (any.list) any.list.forEach(measure);
    };
    this.inner.list.forEach(measure);
    let want = masked ? this.ph : Math.max(120, Math.min(this.ph, Math.round(bottom - this.py + 14)));
    // 第一次量完以后只长不缩：翻页时框子不会一会儿大一会儿小
    if (this.fitted) want = Math.max(want, this.vh);
    this.fitted = true;
    if (want === this.vh) return;
    this.vh = want;
    this.frameG.clear();
    woodFrame(this.frameG, this.px - 2, this.py - 2, this.pw + 4, want + 4);
    this.paper.setTexture(paperTex(this.scene, this.pw - 8, want - 8));
    // 缩了就往下挪一半，还是居中
    this.fitOff = Math.round((this.ph - want) / 2);
    this.blockZ.setPosition(0, -this.fitOff);
  }

  // 内容区左上角
  get cx(): number {
    return this.px + 8;
  }

  get cy(): number {
    return this.py + 30;
  }

  get cw(): number {
    return this.pw - 16;
  }

  close(): void {
    this.destroy();
  }
}
let modalDepth = 0;
// 攻略面板在 panels.ts（它又引用这里），由它开机时登记进来
let helpOpener: ((scene: Phaser.Scene, topic: string) => void) | null = null;
export function setHelpOpener(fn: (scene: Phaser.Scene, topic: string) => void): void {
  helpOpener = fn;
}

// 一个 Graphics 画到的最下沿（读它的绘图指令：矩形、线、弧、三角）；什么都没画返回 -Infinity
const ARGS: Record<number, number> = { 0: 7, 1: 0, 2: 0, 3: 4, 4: 2, 5: 2, 6: 3, 7: 2, 8: 0, 9: 0, 10: 6, 11: 6, 14: 0, 15: 0, 16: 2, 17: 2, 18: 1, 21: 8, 22: 6 };
function graphicsBottom(buf: number[]): number {
  let y = -Infinity;
  for (let i = 0; i < buf.length;) {
    const c = buf[i];
    const k = ARGS[c];
    if (k === undefined) return y;
    if (c === 3) y = Math.max(y, buf[i + 2] + buf[i + 4]);
    else if (c === 4 || c === 5) y = Math.max(y, buf[i + 2]);
    else if (c === 0) y = Math.max(y, buf[i + 2] + buf[i + 3]);
    else if (c === 10 || c === 11) y = Math.max(y, buf[i + 2], buf[i + 4], buf[i + 6]);
    i += 1 + k;
  }
  return y;
}

// 提示条：几条接连出来时往下摞（最多三条，最老的先收），不再把上一条直接顶掉；一模一样的不重复出
let toasts: { c: Phaser.GameObjects.Container; msg: string; h: number }[] = [];
export function toast(scene: Phaser.Scene, msg: string, ms = 1600): void {
  toasts = toasts.filter((x) => x.c.active && x.c.scene === scene);
  const same = toasts.find((x) => x.msg === msg);
  if (same) same.c.destroy();
  toasts = toasts.filter((x) => x.c.active);
  while (toasts.length >= 3) toasts.shift()!.c.destroy();
  const lines = wrap(msg, 240);
  const w = Math.min(268, Math.max(...lines.map(textWidth)) + 28);
  const h = lines.length * 15 + 14;
  const y0 = Math.round(H * 0.3) + toasts.reduce((a, x) => a + x.h + 4, 0);
  const c = scene.add.container(Math.round((W - w) / 2), y0).setDepth(1000);
  const g = scene.add.graphics();
  // 墨色底，上下两道金线，两端各一个小菱形
  g.fillStyle(0x000000, 0.35).fillRect(2, 3, w, h);
  g.fillStyle(0x140c08, 0.92).fillRect(1, 0, w - 2, h).fillRect(0, 1, w, h - 2);
  g.fillStyle(UI.gold).fillRect(6, 2, w - 12, 1).fillRect(6, h - 3, w - 12, 1);
  for (const x of [3, w - 4]) g.fillStyle(UI.goldHi).fillRect(x, 1, 1, 3).fillRect(x - 1, 2, 3, 1).fillRect(x, h - 4, 1, 3).fillRect(x - 1, h - 3, 3, 1);
  c.add([g, text(scene, w / 2, 7, lines.join('\n'), { align: 'center', color: 0xfbefd0 })]);
  toasts.push({ c, msg, h });
  c.setAlpha(0).setY(c.y + 6);
  scene.tweens.add({ targets: c, alpha: 1, y: c.y - 6, duration: 140, ease: 'Quad.easeOut' });
  scene.tweens.add({ targets: c, alpha: 0, delay: ms, duration: 300, onComplete: () => c.destroy() });
}

// 成就横幅：从顶上滑下来一条，一次一条按顺序播（一下子达成好几个也不挤成一大块、不挡面板中间）
const bannerQ: string[] = [];
let bannerOn = false;
export function achvBanner(scene: Phaser.Scene, lines: string[]): void {
  bannerQ.push(...lines);
  if (!bannerOn) nextBanner(scene);
}

function nextBanner(scene: Phaser.Scene): void {
  if (!scene.sys.isActive()) {
    bannerOn = false;
    return;
  }
  const msg = bannerQ.shift();
  if (!msg) {
    bannerOn = false;
    return;
  }
  bannerOn = true;
  sfx('level');
  const w = W - 32;
  const lines = wrap(msg, w - 56);
  const h = Math.max(34, lines.length * 15 + 12);
  const y = SAFE_TOP + 4;
  const c = scene.add.container(16, -h - 4).setDepth(1001);
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.4).fillRect(2, 3, w, h);
  g.fillStyle(0x2a0a04, 0.95).fillRect(0, 0, w, h);
  g.fillStyle(UI.gold).fillRect(0, 0, w, 1).fillRect(0, h - 1, w, 1).fillRect(0, 0, 1, h).fillRect(w - 1, 0, 1, h);
  sealBox(g, 6, Math.round(h / 2) - 12, 24);
  c.add([g, text(scene, 18, Math.round(h / 2) - 7, '成', { align: 'center', color: 0xfff0c0 }), text(scene, 38, 6, lines.join('\n'), { color: 0xffe9a8, lineGap: 3 })]);
  c.add(scene.add.zone(0, 0, w, h).setOrigin(0).setInteractive().on('pointerup', () => done()));
  let gone = false;
  const done = () => {
    if (gone || !c.active) return;
    gone = true;
    scene.tweens.add({ targets: c, y: -h - 4, duration: 200, ease: 'Quad.easeIn', onComplete: () => {
      c.destroy();
      nextBanner(scene);
    } });
  };
  scene.tweens.add({ targets: c, y, duration: 220, ease: 'Quad.easeOut' });
  scene.time.delayedCall(2600, done);
  // 场景切走了（进了战斗）：这条算播过，剩下的等回到主界面接着播
  c.once(Phaser.GameObjects.Events.DESTROY, () => {
    if (!gone) bannerOn = false;
  });
}

export function resumeBanner(scene: Phaser.Scene): void {
  if (!bannerOn && bannerQ.length) nextBanner(scene);
}

export function confirm(scene: Phaser.Scene, msg: string, onYes: () => void, yes = '确定', no = '取消'): Modal {
  const lines = textLines(msg, 220);
  const m = new Modal(scene, '', { w: 248, h: lines + 60, close: null });
  m.inner.add(text(scene, m.px + 14, m.py + 14, msg, { wrap: 220 }));
  m.inner.add(new Button(scene, m.px + 24, m.py + m.ph - 32, 90, 22, yes, () => {
    m.close();
    onYes();
  }, { style: 'red' }));
  m.inner.add(new Button(scene, m.px + m.pw - 114, m.py + m.ph - 32, 90, 22, no, () => m.close()));
  return m;
}

// 音效和背景音乐在 audio.ts
export { sfx };
