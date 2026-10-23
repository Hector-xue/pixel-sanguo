// 江湖指引：新系统第一次用得上时，屏幕上方滑出一张小卡片说清楚怎么用，点一下收起，每条只出一次。
// 主线里教过的（采集、灶台、徽章、布阵）不重复；这里管后面才碰得到的：新阵法、羁绊成形、福利可领、舆图
import Phaser from 'phaser';
import { pushBack } from './back';
import { PAPER, paperTex, sealBox, woodFrame } from '../art/chrome';
import { pendingTips } from '../game/guide';
import type { Tip } from '../game/guide';
import { store } from '../game/store';
import { Modal, SAFE_TOP, W, sfx, text, wrap } from './widgets';

let showing: Phaser.GameObjects.Container | null = null;

export function markTip(key: string): void {
  if (!store.has()) return;
  store.save.flags[`tip_${key}`] = true;
  store.commit();
}

// 出一条（前一条还开着就等它收起）
export function showTip(scene: Phaser.Scene, tip: Tip, onClose?: () => void): void {
  if (showing?.active) return;
  markTip(tip.key);
  const w = W - 24;
  // 正文从 x+46 写起，右边留出木框和纸边（原来按 w-56 折行，最后一个字会出框）
  const tw = w - 64;
  const bodyH = wrap(tip.body, tw).length * 17;
  const h = Math.max(56, 40 + bodyH);
  const x = 12;
  const y = SAFE_TOP + 92;
  const c = scene.add.container(0, 0).setDepth(880);
  const g = scene.add.graphics();
  woodFrame(g, x, y, w, h);
  c.add([g, scene.add.image(x + 6, y + 6, paperTex(scene, w - 12, h - 12)).setOrigin(0)]);
  const sg = scene.add.graphics();
  sealBox(sg, x + 12, y + 12, 26);
  c.add([sg, text(scene, x + 25, y + 18, '引', { align: 'center', color: 0xfff0c0 })]);
  c.add(text(scene, x + 46, y + 10, tip.title, { color: 0x8c1a0c }));
  c.add(text(scene, x + 46, y + 28, tip.body, { color: PAPER.ink, wrap: tw, lineGap: 3 }));
  c.add(text(scene, x + w - 12, y + 10, '点一下收起', { align: 'right', color: 0xa89470 }));
  const z = scene.add.zone(x, y, w, h).setOrigin(0).setInteractive({ useHandCursor: true });
  c.add(z);
  c.setAlpha(0).setY(-12);
  scene.tweens.add({ targets: c, alpha: 1, y: 0, duration: 220, ease: 'Quad.easeOut' });
  sfx('click');
  showing = c;
  // 弹窗打开时提示卡会压住弹窗的标题和关闭钮：先收起，这条不算看过，弹窗关了再出
  const onAdd = (o: Phaser.GameObjects.GameObject) => {
    if (!(o instanceof Modal) || !c.active) return;
    if (store.has()) delete store.save.flags[`tip_${tip.key}`];
    close();
  };
  scene.events.on(Phaser.Scenes.Events.ADDED_TO_SCENE, onAdd);
  const close = () => {
    if (!c.active) return;
    scene.events.off(Phaser.Scenes.Events.ADDED_TO_SCENE, onAdd);
    scene.tweens.add({ targets: c, alpha: 0, y: -10, duration: 160, onComplete: () => {
      c.destroy();
      if (showing === c) showing = null;
      onClose?.();
    } });
  };
  z.on('pointerup', close);
  c.once(Phaser.GameObjects.Events.DESTROY, pushBack(close));
  scene.time.delayedCall(9000, close);
}

// 主界面刷新时调用：有该出的就出第一条，收起后再看下一条
export function runTips(scene: Phaser.Scene): void {
  if (!store.has() || showing?.active) return;
  // 对话、弹窗、小游戏、舆图开着的时候先不打扰，过一会儿再看
  const busy = scene.children.list.some((o) => o instanceof Modal || ((o as unknown as { depth: number }).depth >= 400 && (o as unknown as { depth: number }).depth < 880));
  if (busy) {
    scene.time.delayedCall(1500, () => scene.scene.isActive() && runTips(scene));
    return;
  }
  const t = pendingTips(store.save)[0];
  if (t) showTip(scene, t, () => runTips(scene));
}
