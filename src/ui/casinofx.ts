// 娱乐场开奖的过程：赤壁擂鼓交战、猜猜看揭锦囊、幸运王转灯，各演两三秒。
// 结果在点下去那一刻就已经算好、记进存档（中途关掉也改不了结果），这里只是把它演出来。
// 演的时候点一下跳到结尾，结尾再点一下（或者等一会儿）收起，返回键同样
import Phaser from 'phaser';
import { C } from '../art/palette';
import { iconTex, uiIconTex } from '../art/textures';
import { systems } from '../data';
import { luckyLabel } from '../game/events';
import { pushBack } from './back';
import type { Host } from './panels';
import { H, W, drawBar, frame, goldFrame, setTipOpen, sfx, text } from './widgets';
import type { FrameStyle } from './widgets';

const INK = 0xfbefd0;
const DIM = 0x9a8a70;
const GOLD = 0xffd860;
const RED = 0xff6a50;
// 演完以后自己收起要等多久
const HOLD = 2600;

class Show {
  c: Phaser.GameObjects.Container;
  ended = false;
  private closed = false;
  private timers: Phaser.Time.TimerEvent[] = [];
  private tws: Phaser.Tweens.Tween[] = [];
  private born: number;
  private offBack: () => void;
  private hint: Phaser.GameObjects.Text;
  private settle: () => void = () => undefined;

  constructor(private h: Host, private onDone: () => void) {
    this.born = h.time.now;
    this.c = h.add.container(0, 0).setDepth(950);
    const g = h.add.graphics();
    g.fillStyle(0x0a0604, 0.84).fillRect(0, 0, W, H);
    const z = h.add.zone(0, 0, W, H).setOrigin(0).setInteractive();
    // 点下去的那一下也会落到刚铺上的挡板上：刚出来的一小会儿不认
    z.on('pointerup', () => {
      if (h.time.now - this.born > 200) this.tap();
    });
    this.hint = text(h, W / 2, H - 56, '点一下跳过', { align: 'center', raw: true, color: DIM });
    this.c.add([g, z, this.hint]);
    this.offBack = pushBack(() => this.tap());
    // 成就横幅等它演完再出来（不压在标题上）
    setTipOpen(true);
    this.c.setAlpha(0);
    h.tweens.add({ targets: this.c, alpha: 1, duration: 140 });
  }

  // 演的那一块垫一张墨色底板（底下的面板一点都不透上来）
  board(top: number, bottom: number): void {
    const g = this.h.add.graphics();
    goldFrame(g, 10, top, W - 20, bottom - top, 0x1a100a);
    this.c.add(g);
  }

  // 演完以后怎么摆（跳过时直接摆成这样）
  onSettle(fn: () => void): void {
    this.settle = fn;
  }

  at(ms: number, fn: () => void): void {
    this.timers.push(this.h.time.delayedCall(ms, () => {
      if (!this.ended) fn();
    }));
  }

  tween(cfg: Phaser.Types.Tweens.TweenBuilderConfig): void {
    this.tws.push(this.h.tweens.add(cfg));
  }

  add<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.c.add(o);
    return o;
  }

  private tap(): void {
    if (this.ended) this.close();
    else this.end();
  }

  // 演到结尾：没放完的定时和动画全停掉，按结尾摆好
  end(): void {
    if (this.ended || this.closed) return;
    this.ended = true;
    for (const t of this.timers) t.remove(false);
    for (const t of this.tws) t.stop();
    this.settle();
    this.hint.setText('点一下收起');
    this.h.time.delayedCall(HOLD, () => this.close());
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.offBack();
    setTipOpen(false);
    this.h.tweens.add({ targets: this.c, alpha: 0, duration: 160, onComplete: () => this.c.destroy() });
    this.onDone();
  }
}

// 盖在某样东西上的一个大字印（败、空）
function stamp(h: Host, x: number, y: number, s: string, color: number): Phaser.GameObjects.Text {
  return text(h, x, y, s, { align: 'center', raw: true, color, stroke: 0x1a0804, scale: 2 }).setOrigin(0.5);
}

// ===== 赤壁：三面大旗，擂三通鼓，交战一阵，两方先后败下来，剩下的那方胜 =====
export function chibiShow(h: Host, o: { round: number; winner: number; mine: number[]; text: string; won: boolean }, onDone: () => void): void {
  const sides = systems.casino.sides;
  const sh = new Show(h, onDone);
  const cw = Math.min(100, Math.floor((W - 40) / 3));
  const gap = 8;
  const x0 = Math.round((W - cw * 3 - gap * 2) / 2);
  const top = Math.round(H * 0.3);
  const fh = 110;
  const styles: FrameStyle[] = ['blue', 'red', 'dark'];
  sh.board(top - 86, top + fh + 72);
  sh.add(text(h, W / 2, top - 70, `赤壁第${o.round}局`, { align: 'center', raw: true, color: GOLD, scale: 2 }));
  const call = sh.add(text(h, W / 2, top - 34, '擂鼓——', { align: 'center', raw: true, color: INK }));
  // 两个败的：哪个先败随便，各自败下来的时刻
  const losers = [0, 1, 2].filter((i) => i !== o.winner).sort(() => Math.random() - 0.5);
  const fallAt = new Map([[losers[0], 2100], [losers[1], 2800]]);
  const FIGHT = 900;
  const flags = sides.map((side, i) => {
    const x = x0 + i * (cw + gap);
    const c = h.add.container(x, top);
    const glow = h.add.graphics();
    const g = h.add.graphics();
    frame(g, 0, 0, cw, fh, styles[i]);
    const bars = h.add.graphics();
    drawBar(bars, 8, fh - 18, cw - 16, 8, 1, C.gold, C.sand);
    c.add([glow, g, text(h, cw / 2, 14, side, { align: 'center', raw: true, color: INK, scale: 3 }), bars]);
    if (o.mine[i] > 0) c.add(text(h, cw / 2, fh + 6, `我押${o.mine[i]}`, { align: 'center', raw: true, color: GOLD }));
    sh.add(c);
    c.setY(top - 40).setAlpha(0);
    sh.tween({ targets: c, y: top, alpha: 1, duration: 260, delay: i * 120, ease: 'Back.easeOut' });
    return { c, glow, bars, x, power: 1 };
  });
  for (const k of [0, 330, 660]) sh.at(k, () => sfx('drum'));
  sh.at(FIGHT, () => {
    call.setText('交战！').setColor('#ff7050');
    sfx('slash');
  });
  // 交战：军势条此起彼伏，旗子晃，刀兵声
  const STEP = 110;
  for (let t = FIGHT + STEP; t < 3000; t += STEP) {
    sh.at(t, () => {
      flags.forEach((f, i) => {
        if (f.power <= 0) return;
        const end = fallAt.get(i);
        const p = end ? 1 - Math.pow((t - FIGHT) / (end - FIGHT), 1.3) : 1 - ((t - FIGHT) / 2100) * 0.45;
        f.power = end && t >= end ? 0 : Math.max(0.04, Math.min(1, p + (Math.random() - 0.5) * 0.12));
        drawBar(f.bars, 8, fh - 18, cw - 16, 8, f.power, C.gold, C.sand);
        f.c.x = f.x + Math.round((Math.random() - 0.5) * 4);
        if (f.power === 0) fall(i);
      });
      if (Math.random() < 0.4) sfx(Math.random() < 0.5 ? 'hit' : 'slash');
    });
  }
  const fallen = new Set<number>();
  const fall = (i: number) => {
    if (fallen.has(i)) return;
    fallen.add(i);
    const f = flags[i];
    f.c.x = f.x;
    drawBar(f.bars, 8, fh - 18, cw - 16, 8, 0, C.gold, C.sand);
    f.c.setAlpha(0.45);
    f.c.add(stamp(h, cw / 2, fh / 2 - 6, '败', RED));
    if (!sh.ended) sfx('crit');
  };
  const result = () => {
    for (const i of losers) fall(i);
    const f = flags[o.winner];
    f.c.setPosition(f.x, top).setAlpha(1);
    goldFrame(f.glow, -4, -4, cw + 8, fh + 8, null);
    call.setText(`${sides[o.winner]}胜！`).setColor('#ffd860');
    sh.add(text(h, W / 2, top + fh + 30, o.text.replace(/^赤壁第\d+局：.胜。/, ''), { align: 'center', raw: true, color: o.won ? GOLD : INK, wrap: W - 48 }));
  };
  sh.at(3000, () => {
    sh.end();
    const f = flags[o.winner];
    h.tweens.add({ targets: f.c, scale: { from: 1, to: 1.06 }, x: f.x - cw * 0.03, duration: 180, yoyo: true });
    sfx(o.won ? 'win' : 'lose');
  });
  sh.onSettle(result);
}

// ===== 猜猜看：先揭开一个空的，再揭你选的；没猜中，最后亮出铜钱在哪 =====
export function guessShow(h: Host, o: { pick: number; answer: number; win: boolean; text: string }, onDone: () => void): void {
  const sh = new Show(h, onDone);
  const top = Math.round(H * 0.32);
  const cw = 92;
  sh.board(top - 86, top + 160);

  sh.add(text(h, W / 2, top - 70, '猜猜看', { align: 'center', raw: true, color: GOLD, scale: 2 }));
  const call = sh.add(text(h, W / 2, top - 34, '揭锦囊……', { align: 'center', raw: true, color: INK }));
  const bags = [0, 1, 2].map((i) => {
    const x = Math.round(W / 2 + (i - 1) * cw);
    const img = h.add.image(x, top + 40, iconTex(h, 'jinnang')).setScale(5);
    const glow = h.add.graphics();
    if (i === o.pick) goldFrame(glow, x - 38, top - 2, 76, 84, null);
    const cap = text(h, x, top + 90, i === o.pick ? '你选的' : `锦囊${'一二三'[i]}`, { align: 'center', raw: true, color: i === o.pick ? GOLD : DIM });
    sh.add(glow);
    sh.add(img);
    sh.add(cap);
    return { x, img, opened: false };
  });
  // 先揭的那个：既不是你选的、也不是有铜钱的
  const others = [0, 1, 2].filter((i) => i !== o.pick && i !== o.answer);
  const first = others[Math.floor(Math.random() * others.length)];
  // 锦囊抖起来，越来越急
  for (let t = 200, k = 0; t < 1300; t += 240 - k * 25, k++) {
    sh.at(t, () => {
      sfx('click');
      for (const [i, b] of bags.entries()) {
        sh.tween({ targets: b.img, angle: { from: -8, to: 8 }, duration: 60, yoyo: true, repeat: i === o.pick ? 1 : 0, onComplete: () => b.img.setAngle(0) });
      }
    });
  }
  const open = (i: number, coin: boolean, quiet = false) => {
    const b = bags[i];
    if (b.opened) return;
    b.opened = true;
    b.img.setAngle(0);
    if (coin) {
      const c = sh.add(h.add.image(b.x, top + 30, uiIconTex(h, 'coin')).setScale(4));
      if (!quiet) sh.tween({ targets: c, y: top + 4, duration: 260, ease: 'Back.easeOut' });
      else c.setY(top + 4);
      b.img.setAlpha(0.8);
    } else {
      b.img.setAlpha(0.35);
      sh.add(stamp(h, b.x, top + 40, '空', DIM));
      if (!quiet) sfx('miss');
    }
  };
  sh.at(1300, () => open(first, false));
  sh.at(2100, () => {
    open(o.pick, o.win);
    if (o.win) {
      call.setText('猜中了！').setColor('#ffd860');
      sfx('level');
    }
  });
  if (!o.win) sh.at(2700, () => {
    open(o.answer, true);
    call.setText('没猜中').setColor('#ff7050');
    sfx('lose');
  });
  const result = () => {
    for (const i of [0, 1, 2]) open(i, i === o.answer, true);
    call.setText(o.win ? '猜中了！' : '没猜中').setColor(o.win ? '#ffd860' : '#ff7050');
    sh.add(text(h, W / 2, top + 120, o.text, { align: 'center', raw: true, color: o.win ? GOLD : INK, wrap: W - 48 }));
  };
  sh.at(o.win ? 2500 : 3000, () => sh.end());
  sh.onSettle(result);
}

// ===== 幸运王：一圈花灯，亮光一盏盏转过去，越转越慢，停在抽中的那盏上 =====
export function luckyShow(h: Host, o: { prize: number; text: string }, onDone: () => void): void {
  const sh = new Show(h, onDone);
  const n = systems.lucky.prizes.length;
  const cx = W / 2;
  const cy = Math.round(H * 0.42);
  const r = Math.min(118, W / 2 - 52);
  const bw = 82;
  const bh = 26;
  sh.board(cy - r - 86, cy + r + 36);
  sh.add(text(h, cx, cy - r - 70, '幸运王', { align: 'center', raw: true, color: GOLD, scale: 2 }));
  const cells = Array.from({ length: n }, (_, i) => {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
    const x = Math.round(cx + Math.cos(a) * r - bw / 2);
    const y = Math.round(cy + Math.sin(a) * r * 0.86 - bh / 2);
    const g = h.add.graphics();
    sh.add(g);
    const t = sh.add(text(h, x + bw / 2, y + 7, luckyLabel(i), { align: 'center', raw: true, color: INK }));
    return { x, y, g, t };
  });
  const paint = (lit: number) => cells.forEach((c, i) => {
    c.g.clear();
    if (i === lit) goldFrame(c.g, c.x - 2, c.y - 2, bw + 4, bh + 4, 0x6a1408);
    else frame(c.g, c.x, c.y, bw, bh, 'red');
    c.t.setColor(i === lit ? '#ffe890' : '#e8d0b0');
  });
  paint(0);
  const mid = sh.add(text(h, cx, cy - 8, '转——', { align: 'center', raw: true, color: INK }));
  // 转三圈多再停到抽中的那盏；每一步的间隔越拉越长
  const steps = n * 3 + ((o.prize % n) + n) % n;
  let t = 120;
  for (let k = 1; k <= steps; k++) {
    const left = steps - k;
    t += left > 10 ? 55 : 55 + (10 - left) * (10 - left) * 3.2;
    const lit = k % n;
    sh.at(t, () => {
      paint(lit);
      sfx('click');
    });
  }
  const big = (() => {
    const e = systems.lucky.prizes[o.prize] as { gold?: number[]; items?: Record<string, number> };
    return !!e?.gold || !!e?.items?.jiangjunling || !!e?.items?.gaojibaoxiang;
  })();
  const result = () => {
    paint(o.prize);
    mid.setText(big ? '大奖！' : luckyLabel(o.prize)).setColor(big ? '#ffd860' : '#fbefd0');
    sh.add(text(h, cx, cy + 10, o.text.split('，').join('\n'), { align: 'center', raw: true, color: GOLD, wrap: 2 * r - bw }));
  };
  sh.at(t + 250, () => {
    sh.end();
    sfx(big ? 'level' : 'magic');
    const c = cells[o.prize];
    const flash = h.add.graphics();
    flash.fillStyle(0xfff0a0, 0.6).fillRect(c.x - 2, c.y - 2, bw + 4, bh + 4);
    sh.add(flash);
    h.tweens.add({ targets: flash, alpha: 0, duration: 500, repeat: big ? 2 : 0 });
  });
  sh.onSettle(result);
}
