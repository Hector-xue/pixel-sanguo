// 中文输入需要输入法，Phaser 画不了输入框，所以临时放一个 HTML 输入框盖在画布上
import Phaser from 'phaser';
import { W } from './widgets';

export function overlayInput(scene: Phaser.Scene, x: number, y: number, w: number, h: number, value: string, maxLen: number): HTMLInputElement {
  const el = document.createElement('input');
  el.value = value;
  el.maxLength = maxLen;
  el.autocomplete = 'off';
  Object.assign(el.style, {
    position: 'fixed', boxSizing: 'border-box', border: '2px solid #5c3f26', background: '#fff6e0', color: '#3b2a1a',
    fontFamily: 'FusionPixel, monospace', padding: '0 6px', outline: 'none', borderRadius: '0', zIndex: '10',
  } as CSSStyleDeclaration);
  document.body.appendChild(el);
  const place = () => {
    const r = scene.game.canvas.getBoundingClientRect();
    const k = r.width / W;
    Object.assign(el.style, { left: `${r.left + x * k}px`, top: `${r.top + y * k}px`, width: `${w * k}px`, height: `${h * k}px`, fontSize: `${12 * k}px` });
  };
  place();
  scene.scale.on('resize', place);
  window.addEventListener('resize', place);
  const cleanup = () => {
    el.remove();
    window.removeEventListener('resize', place);
    scene.scale.off('resize', place);
  };
  scene.events.once('shutdown', cleanup);
  scene.events.once('destroy', cleanup);
  return el;
}
