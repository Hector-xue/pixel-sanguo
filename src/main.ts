import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { TitleScene } from './scenes/TitleScene';
import { MainScene } from './scenes/MainScene';
import { BattleScene } from './scenes/BattleScene';
import { H, W } from './ui/widgets';
import { autoFullscreen, fitZoom, syncHeight } from './ui/screen';

async function boot(): Promise<void> {
  try {
    await document.fonts.load('12px FusionPixel', '像素三国');
  } catch {
    // 字体没加载成功也继续，会用系统字体顶上
  }
  document.getElementById('boot')?.remove();
  // 东西删掉时把它身上的补间也停掉：舞台、对话、弹窗里有不少无限循环的小动画（气泡跳、灯火闪、立绘呼吸），
  // 不停的话每重画一次就多一批在后台空转，走得越久越卡，最后像卡死、点不动
  const destroy = Phaser.GameObjects.GameObject.prototype.destroy;
  Phaser.GameObjects.GameObject.prototype.destroy = function (this: Phaser.GameObjects.GameObject, fromScene?: boolean) {
    if (this.scene && !fromScene) this.scene.tweens?.killTweensOf(this);
    destroy.call(this, fromScene);
  };
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
  (window as unknown as { __game: Phaser.Game }).__game = game;
}

boot();
