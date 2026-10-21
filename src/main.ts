import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { TitleScene } from './scenes/TitleScene';
import { MainScene } from './scenes/MainScene';
import { BattleScene } from './scenes/BattleScene';
import { H, W } from './ui/widgets';
import { store } from './game/store';
import { onlineTick } from './game/welfare';

// 按设备像素整数倍放大，保证像素和点阵字清晰；屏幕太小时才退回非整数缩放
function fitZoom(): number {
  const dpr = window.devicePixelRatio || 1;
  const k = Math.floor(Math.min((window.innerWidth * dpr) / W, (window.innerHeight * dpr) / H));
  if (k >= 1) return k / dpr;
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
    backgroundColor: '#3b2a1a',
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
