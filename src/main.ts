import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { TitleScene } from './scenes/TitleScene';
import { MainScene } from './scenes/MainScene';
import { BattleScene } from './scenes/BattleScene';
import { H, W } from './ui/widgets';
import { store } from './game/store';
import { onlineTick } from './game/welfare';

// 铺满屏幕（宽固定 360、高随屏幕比例伸缩，所以基本没有空边）；画布用 pixelated 放大，像素和点阵字仍是硬边
function fitZoom(): number {
  return Math.min(window.innerWidth / W, window.innerHeight / H);
}

async function boot(): Promise<void> {
  try {
    await document.fonts.load('12px FusionPixel', '像素三国');
  } catch {
    // 字体没加载成功也继续，会用系统字体顶上
  }
  document.getElementById('boot')?.remove();
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: W,
    height: H,
    pixelArt: true,
    roundPixels: true,
    backgroundColor: '#202428',
    scale: { mode: Phaser.Scale.NONE, zoom: fitZoom(), autoCenter: Phaser.Scale.CENTER_BOTH },
    input: { activePointers: 2 },
    scene: [BootScene, TitleScene, MainScene, BattleScene],
  });
  window.addEventListener('resize', () => game.scale.setZoom(fitZoom()));
  // 在线奖励按当天在线时长算：页面在前台时每 10 秒记一次
  setInterval(() => {
    if (!document.hidden && store.has()) onlineTick(store.save, 10);
  }, 10000);
  (window as unknown as { __game: Phaser.Game }).__game = game;
}

boot();
