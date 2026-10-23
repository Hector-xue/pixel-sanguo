// 生活技能的界面：采集小游戏（钓鱼先等咬钩再拉线、采矿三锤敲准裂缝、采药一铲挖准），和生活面板（四项等级、药膳、菜谱）
import Phaser from 'phaser';
import { pushBack } from './back';
import { C } from '../art/palette';
import { iconTex } from '../art/textures';
import { PAPER, paperTex, titlePlaque, woodFrame } from '../art/chrome';
import { items } from '../data';
import { bagCount } from '../game/state';
import { store } from '../game/store';
import {
  FEASTS, LIFE_MAX, LIFE_NAMES, RECIPES, SPOT_SIZE, canCook, cook, cookHere, feastText, gather, lifeNeed, spotKind, spotLeft, zoneSpeed, zoneWidth,
} from '../game/life';
import type { GatherKind, LifeKind, Quality } from '../game/life';
import type { Host } from './panels';
import { Button, H, Modal, W, drawBar, sfx, text, toast } from './widgets';

const TITLE: Record<GatherKind, string> = { fish: '钓鱼', mine: '采矿', herb: '采药' };
const HINT: Record<GatherKind, string> = {
  fish: '浮漂一沉就点，再看准金色那段收线',
  mine: '看准金色那段点一下，一共三锤',
  herb: '看准金色那段点一下，越准收得越多',
};

// 采集小游戏：一张宣纸卡，上半是画面，下半是判定条；点屏幕任何地方都算
export function gatherGame(h: Host, onClose: () => void): void {
  const s = store.save;
  const kind = spotKind(s.location);
  if (!kind) return;
  const root = h.add.container(0, 0).setDepth(650);
  const block = h.add.zone(0, 0, W, H).setOrigin(0).setInteractive();
  const dim = h.add.graphics();
  dim.fillStyle(0x0a0604, 0.6).fillRect(0, 0, W, H);
  const cw = 320;
  const ch = 300;
  const cx = (W - cw) / 2;
  const cy = Math.round((H - ch) / 2);
  const fr = h.add.graphics();
  woodFrame(fr, cx, cy, cw, ch);
  root.add([block, dim, fr, h.add.image(cx + 6, cy + 6, paperTex(h, cw - 12, ch - 12)).setOrigin(0)]);
  const tg = h.add.graphics();
  titlePlaque(tg, W / 2, cy - 6, 80, 20);
  root.add([tg, text(h, W / 2, cy - 3, TITLE[kind], { align: 'center', color: 0xfff0c0, stroke: 0x4a0804 })]);
  const view = h.add.container(0, 0);
  root.add(view);
  const status = text(h, W / 2, cy + 150, '', { align: 'center', color: PAPER.ink });
  const left = text(h, cx + cw - 16, cy + 16, '', { align: 'right', color: 0x9a8460 });
  root.add([status, left, text(h, W / 2, cy + ch - 56, HINT[kind], { align: 'center', color: 0x9a8460, wrap: cw - 30 })]);

  // 判定条
  const bx = cx + 30;
  const bw = cw - 60;
  const by = cy + 178;
  const barG = h.add.graphics();
  const cursor = h.add.graphics();
  root.add([barG, cursor]);
  let zoneAt = 0.5;
  const zw = zoneWidth(s, kind);
  const drawBarZone = () => {
    barG.clear();
    barG.fillStyle(0x2a1a10).fillRect(bx - 2, by - 2, bw + 4, 18);
    barG.fillStyle(0x6a5236).fillRect(bx, by, bw, 14);
    barG.fillStyle(0xc89a40).fillRect(Math.round(bx + (zoneAt - zw.good / 2) * bw), by, Math.round(zw.good * bw), 14);
    barG.fillStyle(0xffe070).fillRect(Math.round(bx + (zoneAt - zw.perfect / 2) * bw), by, Math.max(2, Math.round(zw.perfect * bw)), 14);
  };
  const t0 = { v: 0 };
  let sweep: Phaser.Tweens.Tween | null = null;
  const startSweep = () => {
    sweep?.remove();
    t0.v = 0;
    sweep = h.tweens.add({ targets: t0, v: 1, duration: zoneSpeed(s.location), yoyo: true, repeat: -1, ease: 'Sine.easeInOut', onUpdate: () => {
      cursor.clear();
      const x = Math.round(bx + t0.v * bw);
      cursor.fillStyle(0x2a0402).fillRect(x - 2, by - 6, 5, 26);
      cursor.fillStyle(0xf04424).fillRect(x - 1, by - 5, 3, 24);
    } });
  };
  const judge = (): Quality => {
    const d = Math.abs(t0.v - zoneAt);
    return d <= zw.perfect / 2 ? 2 : d <= zw.good / 2 ? 1 : 0;
  };
  const newZone = () => {
    zoneAt = 0.2 + Math.random() * 0.6;
    drawBarZone();
  };

  // 画面：按种类画一小块
  const scene = (phase: number) => {
    view.removeAll(true);
    const g = h.add.graphics();
    const vx = cx + 20;
    const vy = cy + 30;
    const vw = cw - 40;
    const vh = 110;
    if (kind === 'fish') {
      g.fillStyle(0x7ab0d0).fillRect(vx, vy, vw, vh);
      g.fillStyle(0x5a90b8).fillRect(vx, vy + 30, vw, vh - 30);
      for (let i = 0; i < 8; i++) g.fillStyle(0xa8d0e8).fillRect(vx + 10 + i * 36, vy + 46 + (i % 3) * 18, 12, 1);
      // 钓线和浮漂：咬钩时浮漂沉下去
      const fx = vx + vw / 2 + 30;
      const fy = vy + 54 + (phase === 1 ? 8 : 0);
      g.lineStyle(1, 0x2a1a10).lineBetween(vx + 10, vy - 10, fx, fy - 6);
      g.fillStyle(0xf04424).fillRect(fx - 2, fy - 6, 4, 4);
      g.fillStyle(0xffffff).fillRect(fx - 2, fy - 2, 4, 3);
      if (phase === 1) for (let k = 0; k < 3; k++) g.lineStyle(1, 0xffffff, 0.8).strokeEllipse(fx, fy + 2, 12 + k * 10, 4 + k * 3);
    } else if (kind === 'mine') {
      g.fillStyle(0x4a4038).fillRect(vx, vy, vw, vh);
      g.fillStyle(0x7a6e62).fillEllipse(vx + vw / 2, vy + 62, 150, 80);
      g.fillStyle(0x9a8e80).fillEllipse(vx + vw / 2 - 20, vy + 50, 80, 36);
      // 裂缝：敲中几下就裂几道
      for (let k = 0; k < phase; k++) {
        const x0 = vx + vw / 2 - 30 + k * 26;
        g.lineStyle(2, 0x1a1410).lineBetween(x0, vy + 34, x0 + 10, vy + 62).lineBetween(x0 + 10, vy + 62, x0 + 2, vy + 88);
      }
      for (let k = 0; k < 4; k++) g.fillStyle(0xffe070).fillRect(vx + vw / 2 - 40 + k * 24, vy + 40 + (k % 2) * 30, 2, 2);
    } else {
      g.fillStyle(0x6a8a3a).fillRect(vx, vy, vw, vh);
      g.fillStyle(0x5a3a1c).fillRect(vx, vy + 70, vw, vh - 70);
      g.fillStyle(0x3a7a2a).fillEllipse(vx + vw / 2, vy + 58, 70, 30);
      g.fillStyle(0x5aa83a).fillEllipse(vx + vw / 2 - 14, vy + 50, 30, 16).fillEllipse(vx + vw / 2 + 16, vy + 48, 30, 16);
      g.lineStyle(2, 0xd8c8a0).lineBetween(vx + vw / 2, vy + 74, vx + vw / 2 - 6, vy + 100).lineBetween(vx + vw / 2, vy + 74, vx + vw / 2 + 8, vy + 98);
    }
    view.add(g);
  };

  let phase: 'wait' | 'bite' | 'aim' | 'done' = 'aim';
  const qs: Quality[] = [];
  const need = kind === 'mine' ? 3 : 1;
  let biteTimer: Phaser.Time.TimerEvent | null = null;
  const btns = h.add.container(0, 0);
  root.add(btns);
  const updLeft = () => left.setText(`这一处还剩 ${spotLeft(s, s.location)}/${SPOT_SIZE}`);

  const begin = () => {
    btns.removeAll(true);
    qs.length = 0;
    updLeft();
    barG.setVisible(true);
    cursor.setVisible(true);
    if (kind === 'fish') {
      phase = 'wait';
      scene(0);
      barG.setVisible(false);
      cursor.setVisible(false);
      status.setText('等鱼咬钩……');
      biteTimer = h.time.delayedCall(1200 + Math.random() * 2200, () => {
        phase = 'bite';
        scene(1);
        sfx('miss');
        status.setText('咬钩了！快点！');
        // 0.9 秒内不点，鱼就跑了
        biteTimer = h.time.delayedCall(900, () => phase === 'bite' && finish([0], '没跟上，鱼跑了……'));
      });
    } else {
      phase = 'aim';
      scene(0);
      newZone();
      startSweep();
      status.setText(kind === 'mine' ? '第1锤' : '下铲');
    }
  };

  const finish = (q: Quality[], why?: string) => {
    phase = 'done';
    biteTimer?.remove();
    sweep?.remove();
    cursor.clear();
    const r = gather(s, kind, q);
    store.commit();
    // 自己点早了、没跟上：只说原因，不再重复「鱼跑了」
    status.setText(why && !r.got.length ? [why, ...r.lines.slice(1)].join('\n') : r.lines.join('\n'));
    sfx(r.got.length ? 'heal' : 'miss');
    for (const [i, gt] of r.got.entries()) {
      const ic = h.add.image(W / 2 - (r.got.length - 1) * 14 + i * 28, cy + 132, iconTex(h, gt.id)).setScale(2);
      btns.add(ic);
      ic.setAlpha(0).setY(ic.y + 8);
      h.tweens.add({ targets: ic, alpha: 1, y: ic.y - 8, duration: 200, delay: i * 80 });
    }
    updLeft();
    const more = spotLeft(s, s.location) > 0;
    btns.add(new Button(h, W / 2 - 110, cy + ch - 36, 100, 26, more ? '再来一次' : '这里空了', () => more && begin(), { style: 'red', disabled: !more }));
    btns.add(new Button(h, W / 2 + 10, cy + ch - 36, 100, 26, '收起', () => close(), { style: 'tan' }));
  };

  const close = () => {
    biteTimer?.remove();
    sweep?.remove();
    root.destroy();
    onClose();
  };
  root.once(Phaser.GameObjects.Events.DESTROY, pushBack(close));

  block.on('pointerdown', () => {
    if (phase === 'wait') return finish([0], '太心急了，鱼被吓跑了');
    if (phase === 'bite') {
      biteTimer?.remove();
      phase = 'aim';
      status.setText('收线！');
      barG.setVisible(true);
      cursor.setVisible(true);
      newZone();
      startSweep();
      return;
    }
    if (phase !== 'aim') return;
    const q = judge();
    qs.push(q);
    sfx(q ? (q === 2 ? 'crit' : 'hit') : 'miss');
    const ft = text(h, Math.round(bx + t0.v * bw), by - 24, q === 2 ? '正中！' : q ? '不错' : '偏了', { align: 'center', color: q === 2 ? 0xb07800 : q ? 0x2a6a1a : 0x8a6a40 });
    root.add(ft);
    h.tweens.add({ targets: ft, y: ft.y - 14, alpha: 0, duration: 600, onComplete: () => ft.destroy() });
    if (kind === 'mine') {
      scene(qs.filter((x) => x > 0).length);
      h.cameras.main.shake(80, q ? 0.004 : 0.002);
    }
    if (qs.length >= need) return finish(qs);
    status.setText(`第${qs.length + 1}锤`);
    newZone();
  });
  // 开发时给自动化截图用：读当前阶段、指针位置和金色区
  if (import.meta.env.DEV) Object.assign(window, { __gather: { get phase() { return phase; }, get v() { return t0.v; }, get zone() { return zoneAt; } } });
  begin();
}

// 生活面板：四项等级、药膳加成、菜谱（在城镇里能做）
export function lifePanel(h: Host): void {
  const s = store.save;
  const L = s.p5.life;
  const m = new Modal(h, '生活', { help: '生活' });
  const dyn = h.add.container(0, 0);
  m.inner.add(dyn);
  const render = () => {
    dyn.removeAll(true);
    let y = m.cy;
    (['fish', 'mine', 'herb', 'cook'] as LifeKind[]).forEach((k, i) => {
      const x = m.cx + (i % 2) * (m.cw / 2);
      const yy = y + Math.floor(i / 2) * 34;
      dyn.add(text(h, x, yy, `${LIFE_NAMES[k]} ${L.lv[k]}级`, { color: C.darkRed }));
      const g = h.add.graphics();
      const max = L.lv[k] >= LIFE_MAX;
      drawBar(g, x, yy + 17, m.cw / 2 - 12, 6, max ? 1 : L.exp[k] / lifeNeed(L.lv[k]), C.gold, C.sand);
      dyn.add(g);
      if (max) dyn.add(text(h, x + m.cw / 2 - 12, yy, '满级', { align: 'right', color: C.gray }));
    });
    y += 74;
    dyn.add(text(h, m.cx, y, '河边、沼泽、农田能钓鱼；山洞、山地、关隘能采矿；树林、竹林、山谷、草原能采药。场景里闪光的地方点一下就行。', { wrap: m.cw, color: C.brown, lineGap: 2 }));
    y += 52;
    const fe = L.feast;
    dyn.add(text(h, m.cx, y, fe ? `药膳：${items[fe.id].name}（${feastText(fe.id)}，还剩${fe.left}场）` : '药膳：没吃', { color: fe ? C.red : C.gray }));
    y += 22;
    const here = cookHere(s);
    dyn.add(text(h, m.cx, y, here ? '菜谱（这里有灶台，可以做）' : '菜谱（到城镇里才能做）', { color: C.darkBrown }));
    y += 20;
    for (const r of RECIPES) {
      const lock = L.lv.cook < r.lv;
      const ok = here && canCook(s, r);
      const g = h.add.graphics();
      g.fillStyle(lock ? 0xd8c8a4 : 0xe8d6ae).fillRect(m.cx, y, m.cw, 40);
      g.fillStyle(0xa88a5c).fillRect(m.cx, y + 39, m.cw, 1);
      dyn.add(g);
      dyn.add(h.add.image(m.cx + 4, y + 8, iconTex(h, r.id)).setOrigin(0).setScale(2).setAlpha(lock ? 0.4 : 1));
      dyn.add(text(h, m.cx + 34, y + 3, items[r.id].name, { color: lock ? C.gray : C.darkRed }));
      const mats = Object.entries(r.need).map(([id, n]) => `${items[id].name}${bagCount(s, id)}/${n}`).join(' ');
      dyn.add(text(h, m.cx + 34, y + 21, lock ? `烹饪${r.lv}级学会` : mats, { color: C.brown }));
      dyn.add(text(h, m.cx + 34 + 92, y + 3, FEASTS[r.id] ? feastText(r.id) : `气血${items[r.id].hp} 精力${items[r.id].mp}`, { color: C.gray }));
      if (!lock) dyn.add(new Button(h, m.cx + m.cw - 50, y + 8, 46, 24, '做', () => {
        const msg = cook(s, r.id);
        sfx('heal');
        toast(h, msg, 1800);
        h.refresh();
        render();
      }, { style: ok ? 'red' : 'tan', disabled: !ok }));
      y += 44;
    }
  };
  render();
}
