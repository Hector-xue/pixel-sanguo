// 像素界面小部件：全部用整数坐标的实心矩形画，保证放大后边缘干净
import Phaser from 'phaser';
import { sfx } from './audio';
import { C, css, hex } from '../art/palette';
import { PAPER, UI, drawFace, faceText, paperTex, sealBox, titlePlaque, woodFrame } from '../art/chrome';
import type { Face } from '../art/chrome';

export const W = 360;
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
export const FONT = 'FusionPixel';

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

// 等宽点阵字：中文 12 像素，ASCII 6 像素
export function charWidth(ch: string): number {
  return ch.charCodeAt(0) < 0x2e80 && !/[—‘-”…·]/.test(ch) ? 6 : 12;
}

export function textWidth(s: string): number {
  let w = 0;
  for (const ch of s) w += charWidth(ch);
  return w;
}

export function wrap(s: string, max: number): string[] {
  const out: string[] = [];
  for (const para of s.split('\n')) {
    let line = '';
    let w = 0;
    for (const ch of para) {
      const cw = charWidth(ch);
      // 标点不放行首
      if (w + cw > max && line && !'，。！？、；：）」』”'.includes(ch)) {
        out.push(line);
        line = '';
        w = 0;
      }
      line += ch;
      w += cw;
    }
    out.push(line);
  }
  return out;
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

  constructor(private scene: Phaser.Scene, public x: number, public y: number, public w: number, public h: number, parent?: Phaser.GameObjects.Container) {
    this.content = scene.add.container(x, y);
    this.maskG = scene.make.graphics({}, false);
    this.maskG.fillStyle(0xffffff).fillRect(x, y, w, h);
    this.content.setMask(this.maskG.createGeometryMask());
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
    return px >= this.x && px < this.x + this.w && py >= this.y && py < this.y + this.h;
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
    for (const [ev, fn] of this.handlers) this.scene.input.off(ev, fn as never);
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

  constructor(scene: Phaser.Scene, title: string, opts: { x?: number; y?: number; w?: number; h?: number; close?: string | null; onClose?: () => void; dim?: boolean } = {}) {
    super(scene, 0, 0);
    this.pw = opts.w ?? W - 16;
    // 默认高度：顶上让开刘海、摄像头那条，最高按普通手机的样子来（长屏手机上不拉得老长，内容少的空一大截）
    const room = H - SAFE_TOP - 40;
    this.ph = Math.min(opts.h ?? Math.min(room - 20, MODAL_MAX_H), room);
    this.px = opts.x ?? Math.round((W - this.pw) / 2);
    this.py = opts.y ?? SAFE_TOP + 20 + Math.round((room - this.ph) / 2);
    const block = scene.add.zone(0, 0, W, H).setOrigin(0).setInteractive();
    const g = scene.add.graphics();
    // 底下压暗；面板是漆木框 + 宣纸，标题写在朱漆题签上
    if (opts.dim !== false) g.fillStyle(0x0a0604, 0.62).fillRect(0, 0, W, H);
    woodFrame(g, this.px - 2, this.py - 2, this.pw + 4, this.ph + 4);
    this.add([block, g, scene.add.image(this.px + 4, this.py + 4, paperTex(scene, this.pw - 8, this.ph - 8)).setOrigin(0)]);
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
    this.setDepth(100 + modalDepth++);
    scene.add.existing(this);
    // 淡入 + 轻轻上浮
    this.setAlpha(0).setY(6);
    scene.tweens.add({ targets: this, alpha: 1, y: 0, duration: 140, ease: 'Quad.easeOut' });
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

let lastToast: Phaser.GameObjects.Container | null = null;
export function toast(scene: Phaser.Scene, msg: string, ms = 1600): void {
  if (lastToast?.active) lastToast.destroy();
  const lines = wrap(msg, 240);
  const w = Math.min(268, Math.max(...lines.map(textWidth)) + 28);
  const h = lines.length * 15 + 14;
  const c = scene.add.container(Math.round((W - w) / 2), Math.round(H * 0.3)).setDepth(1000);
  const g = scene.add.graphics();
  // 墨色底，上下两道金线，两端各一个小菱形
  g.fillStyle(0x000000, 0.35).fillRect(2, 3, w, h);
  g.fillStyle(0x140c08, 0.92).fillRect(1, 0, w - 2, h).fillRect(0, 1, w, h - 2);
  g.fillStyle(UI.gold).fillRect(6, 2, w - 12, 1).fillRect(6, h - 3, w - 12, 1);
  for (const x of [3, w - 4]) g.fillStyle(UI.goldHi).fillRect(x, 1, 1, 3).fillRect(x - 1, 2, 3, 1).fillRect(x, h - 4, 1, 3).fillRect(x - 1, h - 3, 3, 1);
  c.add([g, text(scene, w / 2, 7, lines.join('\n'), { align: 'center', color: 0xfbefd0 })]);
  lastToast = c;
  c.setAlpha(0).setY(c.y + 6);
  scene.tweens.add({ targets: c, alpha: 1, y: c.y - 6, duration: 140, ease: 'Quad.easeOut' });
  scene.tweens.add({ targets: c, alpha: 0, delay: ms, duration: 300, onComplete: () => c.destroy() });
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
