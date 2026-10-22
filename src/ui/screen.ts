// 全屏与系统栏：网页在安卓上点一下就进全屏（盖住状态栏和导航条），各场景把浏览器顶栏染成自己的颜色
import type Phaser from 'phaser';
import { isApp } from '../game/cloud';
import { H, W, calcH, setH, setSafeTop } from './widgets';

// 铺满屏幕（宽固定 360、高随屏幕比例伸缩，所以基本没有空边）；画布用 pixelated 放大，像素和点阵字仍是硬边
export function fitZoom(): number {
  return Math.min(window.innerWidth / W, window.innerHeight / H);
}

// 屏幕比例变了就把画布改成新高度；返回是否改了（改了的话当前场景要重排）
export function syncHeight(game: Phaser.Game): boolean {
  const nh = calcH();
  const changed = Math.abs(nh - H) >= 4;
  if (changed) {
    setH(nh);
    game.scale.resize(W, H);
  }
  game.scale.setZoom(fitZoom());
  setSafeTop(safeTop());
  return changed;
}

// 顶部安全区：系统报的刘海/挖孔高度；全屏、App、主屏幕模式下系统不报也至少让出一条状态栏的高度
let probe: HTMLDivElement | null = null;
function safeTop(): number {
  // 开发时可以在控制台设 window.__safeTop 模拟挖孔屏
  const dev = (window as unknown as { __safeTop?: number }).__safeTop;
  if (import.meta.env.DEV && dev !== undefined) return dev;
  if (!probe) {
    probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:env(safe-area-inset-top,0px);visibility:hidden;pointer-events:none';
    document.body.appendChild(probe);
  }
  let css = probe.offsetHeight;
  if (isFullscreen() || standalone() || isApp()) css = Math.max(css, 28);
  return Math.round(css / fitZoom());
}

const ua = navigator.userAgent;
const isIOS = /iPhone|iPad|iPod/i.test(ua);
const standalone = () => window.matchMedia?.('(display-mode: standalone)').matches || window.matchMedia?.('(display-mode: fullscreen)').matches;

// App 里由原生沉浸模式负责；iPhone 的 Safari 不支持网页全屏（添加到主屏幕后本来就是全屏）
export function fullscreenSupported(): boolean {
  return !isApp() && !isIOS && !!document.documentElement.requestFullscreen && !standalone();
}

export function isFullscreen(): boolean {
  return !!document.fullscreenElement;
}

export async function enterFullscreen(): Promise<void> {
  if (!fullscreenSupported() || isFullscreen()) return;
  try {
    await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    // 进了全屏才能锁方向；锁不住也无所谓
    await (screen.orientation as unknown as { lock?: (o: string) => Promise<void> }).lock?.('portrait').catch(() => undefined);
  } catch {
    // 浏览器拒绝（比如不是用户点击触发的）就保持原样
  }
}

export async function exitFullscreen(): Promise<void> {
  if (isFullscreen()) await document.exitFullscreen().catch(() => undefined);
}

// 安卓网页：第一次点屏幕时自动进全屏（浏览器只允许在点击里进）。退出过就不再强拉，想回去点标题页左上角的按钮
export function autoFullscreen(): void {
  if (!fullscreenSupported() || !/Android/i.test(ua)) return;
  const once = () => {
    window.removeEventListener('pointerup', once, true);
    void enterFullscreen();
  };
  window.addEventListener('pointerup', once, true);
}

// 浏览器顶栏 / 刘海旁边的空白跟着场景换色，不是一条突兀的深灰
export function setChrome(color: string): void {
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
  document.body.style.background = color;
}
