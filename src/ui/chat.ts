// 江湖见闻：自己一路上的经历（任务、奖励、奇遇、升级、战报），按时间排。
// compact 是主界面底下那条，只露最近几行，点开看全部。
import Phaser from 'phaser';
import { store } from '../game/store';
import { ScrollArea, hit, text, textLines } from './widgets';
import { UI } from '../art/chrome';
import { uiIconTex } from '../art/textures';

function hhmm(t: number): string {
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// 系统消息里的几类关键字换个颜色，一眼看出是什么事
function tone(s: string): number {
  if (/奇遇/.test(s)) return 0xf0a0ff;
  if (/升到|升级|交情/.test(s)) return 0xffe060;
  if (/完成任务|获得|得到|银两/.test(s)) return 0x9ae870;
  if (/接受任务/.test(s)) return 0x9ad0ff;
  return 0xe8dcc0;
}

export class ChatBox {
  root: Phaser.GameObjects.Container;
  private area!: ScrollArea;
  private sig = '';

  constructor(private scene: Phaser.Scene, private x: number, private y: number, private w: number, private h: number, private opts: { compact?: boolean; onTap?: () => void; defer?: boolean } = {}) {
    this.root = scene.add.container(0, 0);
    const g = scene.add.graphics();
    // 墨色底，上沿一道暗金线
    g.fillStyle(0x140d08).fillRect(x, y, w, h);
    g.fillStyle(0x000000).fillRect(x, y, w, 1);
    g.fillStyle(UI.goldLo).fillRect(x, y + 1, w, 1);
    this.root.add(g);
    if (opts.compact) {
      this.root.add(scene.add.image(x + 6, y + 6, uiIconTex(scene, 'chat')).setOrigin(0));
      this.root.add(text(scene, x + w - 6, y + 4, '见闻 ▲', { align: 'right', color: 0xa08860 }));
      this.root.add(hit(scene, x, y, w, h, () => opts.onTap?.()));
    }
    // defer：等主人第一次 refresh 再画（主界面建好以后还会往见闻里写公告，不用先画一遍）
    if (!opts.defer) this.refresh();
  }

  refresh(): void {
    const compact = this.opts.compact;
    const all = store.has() ? store.save.messages : [];
    // 没有新消息就不重画（主界面每次刷新都会叫一遍，一条消息两段描边字，重建一遍不便宜）
    const last = all[all.length - 1];
    const sig = `${all.length}:${last?.t ?? 0}:${last?.text ?? ''}`;
    if (this.area && sig === this.sig) return;
    this.sig = sig;
    this.area?.destroy();
    const top = compact ? 4 : 6;
    const left = compact ? 24 : 6;
    this.area = new ScrollArea(this.scene, this.x + left, this.y + top, this.w - left - (compact ? 48 : 6), this.h - top - 4, this.root);
    const width = this.w - (compact ? 78 : 18);
    // 底下的小聊天区只放得下几行：从最新的往前取，够两屏就停（全部的在点开的「江湖见闻」里）
    let msgs = all.slice(compact ? -12 : -120);
    if (compact) {
      let room = (this.h - top - 4) * 2;
      let k = msgs.length;
      while (k > 0 && room > 0) room -= textLines(`${hhmm(msgs[--k].t)} ${msgs[k].text}`, width, 2) + 2;
      msgs = msgs.slice(k);
    }
    let yy = 0;
    if (!msgs.length) {
      this.area.content.add(text(this.scene, 0, 0, '还没有什么事。四处走走看吧。', { color: 0xa08860 }));
      yy = 16;
    }
    for (const m of msgs) {
      const body = `${hhmm(m.t)} ${m.text}`;
      this.area.content.add(text(this.scene, 0, yy, body, { color: tone(m.text), wrap: width, lineGap: 2, stroke: 0x000000 }));
      this.area.content.add(text(this.scene, 0, yy, hhmm(m.t), { color: 0x8a7a60, stroke: 0x000000 }));
      yy += textLines(body, width, 2) + 2;
    }
    this.area.setContentHeight(yy);
    this.area.scrollToBottom();
  }
}
