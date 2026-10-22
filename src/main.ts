import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { TitleScene } from './scenes/TitleScene';
import { MainScene } from './scenes/MainScene';
import { BattleScene } from './scenes/BattleScene';
import { H, W } from './ui/widgets';
import { autoFullscreen, fitZoom, syncHeight } from './ui/screen';
import { store } from './game/store';
import { onlineTick } from './game/welfare';

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
  // 进出全屏、转屏后屏幕比例变了：标题页和主界面按新高度重排；战斗中只缩放，打完下一场再按新高度
  let relayout = 0;
  const onResize = () => {
    game.scale.setZoom(fitZoom());
    window.clearTimeout(relayout);
    relayout = window.setTimeout(() => {
      if (game.scene.isActive('Battle') || !syncHeight(game)) return;
      for (const key of ['Title', 'Main']) if (game.scene.isActive(key)) game.scene.getScene(key).scene.restart({ relayout: true });
    }, 250);
  };
  window.addEventListener('resize', onResize);
  document.addEventListener('fullscreenchange', onResize);
  autoFullscreen();
  // 在线奖励按当天在线时长算：页面在前台时每 10 秒记一次
  setInterval(() => {
    if (!document.hidden && store.has()) onlineTick(store.save, 10);
  }, 10000);
  (window as unknown as { __game: Phaser.Game }).__game = game;
}

boot();
