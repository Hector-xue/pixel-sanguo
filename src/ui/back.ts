// 返回键（安卓 App 的返回键、手机浏览器的返回手势）：先关最上面那一层（弹窗、对话、战斗里的子菜单），
// 什么都没开时在主界面按两次才退出。各层打开时登记一个处理函数，关掉时撤掉。
import { store } from '../game/store';
import { isApp } from '../game/cloud';

type Handler = () => void;
const stack: Handler[] = [];
let exitArmed = 0;
// 没有弹窗时交给场景（战斗里退回指令盘、标题页回首页）；返回 true 表示处理了
let sceneHandler: (() => boolean) | null = null;
let warn: ((msg: string) => void) | null = null;

export function pushBack(fn: Handler): () => void {
  stack.push(fn);
  return () => {
    const i = stack.lastIndexOf(fn);
    if (i >= 0) stack.splice(i, 1);
  };
}

export function setSceneBack(fn: (() => boolean) | null): void {
  sceneHandler = fn;
}

export function setBackWarn(fn: (msg: string) => void): void {
  warn = fn;
}

// true：处理了（留在游戏里）；false：该退出了
export function handleBack(now = Date.now()): boolean {
  const top = stack[stack.length - 1];
  if (top) {
    top();
    return true;
  }
  if (sceneHandler?.()) return true;
  if (now - exitArmed < 2000) {
    store.flush();
    return false;
  }
  exitArmed = now;
  warn?.('再按一次返回退出游戏（进度已自动保存）');
  return true;
}

// App 里由 MainActivity 调 window.__pxBack()；浏览器里用一条 history 记录拦住返回手势
export function installBack(): void {
  (window as unknown as { __pxBack: () => boolean }).__pxBack = () => handleBack();
  if (isApp()) return;
  try {
    history.pushState({ px: 1 }, '');
    window.addEventListener('popstate', () => {
      if (handleBack()) history.pushState({ px: 1 }, '');
      else history.back();
    });
  } catch {
    // 不支持就算了
  }
}

export const _test = { stack, reset: () => { stack.length = 0; exitArmed = 0; sceneHandler = null; } };
