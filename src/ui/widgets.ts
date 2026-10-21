// 像素界面小部件：全部用整数坐标的实心矩形画，保证放大后边缘干净
import Phaser from 'phaser';
import { C, css, hex } from '../art/palette';

export const W = 360;
// 高度随手机屏幕比例伸缩（640～780），多出来的给聊天区；宽度固定 360
export const H = (() => {
  const ratio = window.innerHeight / Math.max(1, window.innerWidth);
  return Math.max(640, Math.min(780, Math.round(W * ratio)));
})();
export const FONT = 'FusionPixel';

export type FrameStyle = 'paper' | 'tan' | 'dark' | 'red' | 'pressed' | 'disabled' | 'ink' | 'blue';

const STYLES: Record<FrameStyle, { fill: number; border: number; hi: number; lo: number; text: number }> = {
  paper: { fill: C.paper, border: C.brown, hi: C.lightPaper, lo: C.sand, text: C.darkBrown },
  tan: { fill: C.sand, border: C.brown, hi: C.paper, lo: C.tan, text: C.darkBrown },
  pressed: { fill: C.tan, border: C.brown, hi: C.lightBrown, lo: C.sand, text: C.darkBrown },
  disabled: { fill: C.lightGray, border: C.gray, hi: C.white, lo: C.lightGray, text: C.gray },
  red: { fill: C.red, border: C.darkRed, hi: C.orange, lo: C.darkRed, text: C.lightPaper },
  blue: { fill: C.blue, border: C.navy, hi: C.lightBlue, lo: C.navy, text: C.lightPaper },
  dark: { fill: C.darkBrown, border: C.ink, hi: C.brown, lo: C.ink, text: C.paper },
  ink: { fill: C.ink, border: C.brown, hi: C.darkBrown, lo: C.ink, text: C.paper },
};

export function textColor(style: FrameStyle): number {
  return STYLES[style].text;
}

export function frame(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, style: FrameStyle = 'paper'): void {
  const s = STYLES[style];
  g.fillStyle(hex(s.border)).fillRect(x + 1, y, w - 2, h).fillRect(x, y + 1, w, h - 2);
  g.fillStyle(hex(s.fill)).fillRect(x + 1, y + 1, w - 2, h - 2);
  g.fillStyle(hex(s.hi)).fillRect(x + 1, y + 1, w - 2, 1).fillRect(x + 1, y + 1, 1, h - 2);
  g.fillStyle(hex(s.lo)).fillRect(x + 1, y + h - 2, w - 2, 1).fillRect(x + w - 2, y + 1, 1, h - 2);
}

export function rect(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, color: number): void {
  g.fillStyle(hex(color)).fillRect(x, y, w, h);
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
}

export function text(scene: Phaser.Scene, x: number, y: number, s: string, o: TextOpts = {}): Phaser.GameObjects.Text {
  const body = o.wrap ? wrap(s, o.wrap).join('\n') : s;
  const t = scene.add.text(Math.round(x), Math.round(y), body, {
    fontFamily: FONT,
    fontSize: '12px',
    color: css(o.color ?? C.darkBrown),
    lineSpacing: o.lineGap ?? 3,
    align: o.align ?? 'left',
    stroke: o.stroke !== undefined ? css(o.stroke) : undefined,
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
    this.style = o.style ?? 'tan';
    this.disabled = !!o.disabled;
    this.g = scene.add.graphics();
    this.label = text(scene, bw / 2, Math.round((bh - 14) / 2), caption, { align: 'center' });
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
    const st: FrameStyle = this.disabled ? 'disabled' : this.down ? 'pressed' : this.style;
    this.g.clear();
    frame(this.g, 0, 0, this.bw, this.bh, st);
    this.label.setColor(css(this.o.color !== undefined && !this.disabled ? this.o.color : textColor(st)));
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

export function drawBar(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, ratio: number, fill: number, back: number): void {
  g.clear();
  rect(g, x, y, w, h, C.ink);
  rect(g, x + 1, y + 1, w - 2, h - 2, back);
  const r = Math.max(0, Math.min(1, ratio));
  const fw = Math.round((w - 2) * r);
  if (fw > 0) {
    rect(g, x + 1, y + 1, fw, h - 2, fill);
    if (h > 4) rect(g, x + 1, y + 1, fw, 1, C.lightPaper);
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
      rect(this.bar, this.x + this.w - 3, this.y, 2, this.h, C.sand);
      rect(this.bar, this.x + this.w - 3, by, 2, bh, C.lightBrown);
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
export class Modal extends Phaser.GameObjects.Container {
  inner: Phaser.GameObjects.Container;
  px: number;
  py: number;
  pw: number;
  ph: number;

  constructor(scene: Phaser.Scene, title: string, opts: { x?: number; y?: number; w?: number; h?: number; close?: string | null; onClose?: () => void; dim?: boolean } = {}) {
    super(scene, 0, 0);
    this.pw = opts.w ?? W - 16;
    this.ph = opts.h ?? H - 60;
    this.px = opts.x ?? Math.round((W - this.pw) / 2);
    this.py = opts.y ?? Math.round((H - this.ph) / 2);
    const block = scene.add.zone(0, 0, W, H).setOrigin(0).setInteractive();
    const g = scene.add.graphics();
    if (opts.dim !== false) {
      g.fillStyle(hex(C.ink), 0.55).fillRect(0, 0, W, H);
    }
    frame(g, this.px, this.py, this.pw, this.ph, 'paper');
    if (title) {
      frame(g, this.px + 4, this.py + 4, this.pw - 8, 20, 'dark');
    }
    this.add([block, g]);
    if (title) this.add(text(scene, this.px + this.pw / 2, this.py + 7, title, { align: 'center', color: C.paper }));
    this.inner = scene.add.container(0, 0);
    this.add(this.inner);
    if (opts.close !== null) {
      this.add(new Button(scene, this.px + this.pw - 48, this.py + 5, 42, 18, opts.close ?? '返回', () => {
        this.close();
        opts.onClose?.();
      }, { style: 'red' }));
    }
    this.setDepth(100 + modalDepth++);
    scene.add.existing(this);
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
  const w = Math.min(260, Math.max(...lines.map(textWidth)) + 20);
  const h = lines.length * 15 + 12;
  const c = scene.add.container(Math.round((W - w) / 2), 250).setDepth(1000);
  const g = scene.add.graphics();
  frame(g, 0, 0, w, h, 'ink');
  c.add([g, text(scene, w / 2, 6, lines.join('\n'), { align: 'center', color: C.paper })]);
  lastToast = c;
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

// ===== 音效：WebAudio 方波小芯片音 =====
let actx: AudioContext | null = null;
let muted = false;
export function setMuted(m: boolean): void {
  muted = m;
}
export function isMuted(): boolean {
  return muted;
}

export function sfx(kind: 'click' | 'hit' | 'crit' | 'magic' | 'heal' | 'win' | 'lose' | 'step' | 'miss' | 'level'): void {
  if (muted) return;
  try {
    actx ??= new AudioContext();
    const t0 = actx.currentTime;
    const notes: Record<string, [number, number, OscillatorType][]> = {
      click: [[880, 0.03, 'square']],
      step: [[330, 0.04, 'triangle']],
      hit: [[180, 0.05, 'square'], [90, 0.06, 'square']],
      crit: [[260, 0.04, 'sawtooth'], [130, 0.05, 'square'], [65, 0.08, 'square']],
      miss: [[600, 0.03, 'triangle'], [500, 0.03, 'triangle']],
      magic: [[660, 0.05, 'triangle'], [990, 0.05, 'triangle'], [1320, 0.08, 'triangle']],
      heal: [[523, 0.06, 'triangle'], [784, 0.1, 'triangle']],
      win: [[523, 0.1, 'square'], [659, 0.1, 'square'], [784, 0.1, 'square'], [1046, 0.25, 'square']],
      lose: [[392, 0.15, 'triangle'], [330, 0.15, 'triangle'], [262, 0.3, 'triangle']],
      level: [[784, 0.08, 'square'], [988, 0.08, 'square'], [1175, 0.2, 'square']],
    };
    let t = t0;
    for (const [f, d, type] of notes[kind]) {
      const o = actx.createOscillator();
      const gn = actx.createGain();
      o.type = type;
      o.frequency.value = f;
      gn.gain.setValueAtTime(0.06, t);
      gn.gain.exponentialRampToValueAtTime(0.001, t + d);
      o.connect(gn).connect(actx.destination);
      o.start(t);
      o.stop(t + d);
      t += d;
    }
  } catch {
    // 浏览器不让放声音就算了，不影响游戏
  }
}
