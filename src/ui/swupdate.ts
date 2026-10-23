// 网页版离线缓存（sw.js 由构建生成，见 vite.config.ts）：注册一下；网站上出了新版、后台下好了，
// 等你在标题页或主界面（不在战斗、没开弹窗）时问一句要不要刷新。安卓 App 本来就离线，不用它。
import Phaser from 'phaser';
import { isApp } from '../game/cloud';
import { store } from '../game/store';
import { Modal, confirm } from './widgets';

let waiting: ServiceWorker | null = null;
let asked = false;

export function installServiceWorker(game: Phaser.Game): void {
  if (!import.meta.env.PROD || isApp() || !('serviceWorker' in navigator)) return;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // 只有点了「刷新」才会换版本（skipWaiting），换好了重新打开页面
    if (reloading || !asked) return;
    reloading = true;
    location.reload();
  });
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    const watch = (w: ServiceWorker | null) => {
      if (!w) return;
      w.addEventListener('statechange', () => {
        // 第一次装（以前没有 controller）不用问，直接生效；换版本才问
        if (w.state === 'installed' && navigator.serviceWorker.controller) offer(game, w);
      });
    };
    if (reg.waiting && navigator.serviceWorker.controller) offer(game, reg.waiting);
    reg.addEventListener('updatefound', () => watch(reg.installing));
    // 一直开着的页面：每半小时看一眼网站上有没有新版
    setInterval(() => void reg.update().catch(() => {}), 30 * 60000);
  }).catch(() => {
    // 注册不上就算了（隐私模式、老浏览器），游戏照常
  });
}

function offer(game: Phaser.Game, w: ServiceWorker): void {
  waiting = w;
  const tryAsk = () => {
    if (asked || !waiting) return;
    const sc = ['Title', 'Main'].map((k) => game.scene.getScene(k)).find((s) => s?.sys.isActive());
    const busy = !sc || game.scene.isActive('Battle') || sc.children.list.some((o) => o instanceof Modal);
    if (busy) return void setTimeout(tryAsk, 5000);
    confirm(sc, '新版本已经下好了，刷新一下就是新版（存档不受影响）。', () => {
      asked = true;
      if (store.has()) store.flush();
      waiting?.postMessage('skip');
    }, '刷新', '等会儿');
  };
  tryAsk();
}
