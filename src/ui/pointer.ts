// 新东西第一次用得上时，一只金箭头加一圈光指着那个按钮（点一下屏幕或 6 秒后收起）；每个角色每样只指一次
import Phaser from 'phaser';
import { store } from '../game/store';

// idle：要等对话、弹窗都关了再指（主界面上的按钮）；没 idle 的是指弹窗里的按钮
export function pointAt(scene: Phaser.Scene, x: number, y: number, key: string, idle = false, tries = 0, owner?: Phaser.GameObjects.GameObject): void {
  if (!store.has() || !scene.sys.isActive()) return;
  const flag = `pt_${key}`;
  if (store.save.flags[flag]) return;
  if (idle && scene.children.list.some((o) => (o as unknown as { depth: number }).depth >= 100 && (o as unknown as { depth: number }).depth < 1400)) {
    if (tries < 10) scene.time.delayedCall(1500, () => pointAt(scene, x, y, key, true, tries + 1));
    return;
  }
  store.save.flags[flag] = true;
  store.commit();
  const c = scene.add.container(Math.round(x), Math.round(y)).setDepth(1500);
  const ring = scene.add.ellipse(0, 0, 44, 30).setStrokeStyle(2, 0xffe080, 1);
  const g = scene.add.graphics();
  // 往下指的箭头（像素块拼的），描一道黑边
  g.fillStyle(0x1a0c04).fillRect(-4, -40, 8, 14).fillTriangle(-10, -27, 10, -27, 0, -15);
  g.fillStyle(0xffd040).fillRect(-2, -39, 4, 13).fillTriangle(-7, -26, 7, -26, 0, -18);
  c.add([ring, g]);
  scene.tweens.add({ targets: g, y: 6, duration: 360, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  scene.tweens.add({ targets: ring, scaleX: 1.25, scaleY: 1.25, alpha: 0.4, duration: 520, yoyo: true, repeat: -1 });
  let gone = false;
  const done = () => {
    if (gone || !c.active) return;
    gone = true;
    scene.input.off('pointerdown', done);
    scene.tweens.add({ targets: c, alpha: 0, duration: 160, onComplete: () => c.destroy() });
  };
  // 当前这一下（打开弹窗的那次点按）不算
  scene.time.delayedCall(250, () => scene.input.on('pointerdown', done));
  scene.time.delayedCall(6000, done);
  c.once(Phaser.GameObjects.Events.DESTROY, () => scene.input.off('pointerdown', done));
  // 指的是弹窗里的按钮：弹窗关了（返回键、点外面）箭头也收
  owner?.once(Phaser.GameObjects.Events.DESTROY, done);
}
