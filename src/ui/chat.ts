// 聊天区：频道 区/派/商/世，系统消息紫色，AI 玩家闲聊营造"此地有人"的感觉
import Phaser from 'phaser';
import { C } from '../art/palette';
import { chatterLines } from '../game/chatter';
import type { Channel } from '../game/state';
import { store } from '../game/store';
import { Button, ScrollArea, frame, text, textLines, toast } from './widgets';

const TABS: [Exclude<Channel, 'sys'>, string][] = [['qu', '区'], ['pai', '派'], ['shang', '商'], ['shi', '世']];
const CH_NAME: Record<Channel, string> = { sys: '系统', qu: '区', pai: '派', shang: '商', shi: '世' };
let channel: Exclude<Channel, 'sys'> = 'qu';

function hhmm(t: number): string {
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export class ChatBox {
  root: Phaser.GameObjects.Container;
  private area!: ScrollArea;
  private tabs: Button[] = [];

  constructor(private scene: Phaser.Scene, private x: number, private y: number, private w: number, private h: number) {
    this.root = scene.add.container(0, 0);
    const g = scene.add.graphics();
    frame(g, x, y, w, h, 'tan');
    frame(g, x + 3, y + 23, w - 6, h - 26, 'paper');
    this.root.add(g);
    this.root.add(new Button(scene, x + 4, y + 3, 52, 18, '快捷键', () => {
      toast(scene, '单机版没有其他真人玩家，频道里是 AI 玩家的闲聊');
    }));
    TABS.forEach(([ch, name], i) => {
      const b = new Button(scene, x + 62 + i * 40, y + 3, 36, 18, name, () => {
        channel = ch;
        this.refresh();
      });
      this.tabs.push(b);
      this.root.add(b);
    });
    this.refresh();
  }

  refresh(): void {
    this.tabs.forEach((b, i) => b.setStyle(TABS[i][0] === channel ? 'dark' : 'tan'));
    this.area?.destroy();
    this.area = new ScrollArea(this.scene, this.x + 6, this.y + 26, this.w - 12, this.h - 32, this.root);
    const sys = store.has() ? store.save.messages.slice(-40) : [];
    const ai = chatterLines().filter((l) => l.ch === channel);
    const all = [...sys.map((m) => ({ ...m, who: m.who ?? '' })), ...ai].sort((a, b) => a.t - b.t).slice(-40);
    let yy = 0;
    const width = this.w - 18;
    if (channel === 'pai') {
      const t = text(this.scene, 0, yy, '（你还没有加入帮派，帮派34级开放）', { color: C.gray, wrap: width });
      this.area.content.add(t);
      yy += 16;
    }
    for (const m of all) {
      if (m.ch !== 'sys' && m.ch !== channel) continue;
      const body = m.ch === 'sys' ? `${hhmm(m.t)}【${CH_NAME.sys}】${m.text}` : `${hhmm(m.t)} ${m.who}：${m.text}`;
      const t = text(this.scene, 0, yy, body, { color: m.ch === 'sys' ? C.purple : C.darkBrown, wrap: width, lineGap: 2 });
      this.area.content.add(t);
      yy += textLines(body, width, 2) + 2;
    }
    this.area.setContentHeight(yy);
    this.area.scrollToBottom();
  }
}
