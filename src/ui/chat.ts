// 聊天区：频道 区/派/商/世，系统消息紫色，AI 玩家闲聊营造"此地有人"的感觉
import Phaser from 'phaser';
import { C } from '../art/palette';
import { chatterLines } from '../game/chatter';
import type { Channel } from '../game/state';
import { store } from '../game/store';
import { Button, ScrollArea, hit, text, textLines, textWidth, toast } from './widgets';
import { UI, drawFace, slateTex } from '../art/chrome';

const CH_COLOR: Record<string, number> = { qu: 0xffffff, pai: 0xffffff, shang: 0xff5050, shi: 0xff5050 };
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
    // 原版聊天区：深石板云纹底，左上一块橙色"快捷键"斜牌，右边频道字
    this.root.add(scene.add.image(x, y, slateTex(scene, w, h)).setOrigin(0));
    const g = scene.add.graphics();
    g.fillStyle(0x000000).fillRect(x, y, w, 1);
    g.fillStyle(0x000000, 0.35).fillRect(x, y + 1, w, 20);
    drawFace(g, x, y + 1, 70, 20, 'orange');
    g.fillStyle(0x000000, 0).fillRect(0, 0, 1, 1);
    // 斜切右端
    for (let k = 0; k < 20; k++) g.fillStyle(0x000000, 0.35).fillRect(x + 70 - Math.round(k / 2), y + 1 + k, Math.round(k / 2), 1);
    this.root.add(g);
    this.root.add(text(scene, x + 6, y + 5, '快捷键', { color: 0xfff4d0, stroke: 0x6a2000 }));
    this.root.add(hit(scene, x, y, 70, 22, () => toast(scene, '单机版没有其他真人玩家，频道里是 AI 玩家的闲聊')));
    TABS.forEach(([ch, name], i) => {
      const b = new Button(scene, x + w - 168 + i * 42, y + 2, 38, 18, name, () => {
        channel = ch;
        this.refresh();
      }, { style: 'ink', color: CH_COLOR[ch] });
      this.tabs.push(b);
      this.root.add(b);
    });
    this.refresh();
  }

  refresh(): void {
    this.tabs.forEach((b, i) => b.setStyle(TABS[i][0] === channel ? 'dark' : 'ink'));
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
      // 玩家发言：时间白、名字黄、正文白（原版样式）；系统消息整行紫
      const head = m.ch === 'sys' ? '' : `${hhmm(m.t)}${m.who}`;
      const body = m.ch === 'sys' ? `${hhmm(m.t)}【${CH_NAME.sys}】${m.text}` : `${' '.repeat(textWidth(head) / 6)}：${m.text}`;
      this.area.content.add(text(this.scene, 0, yy, body, { color: m.ch === 'sys' ? UI.magenta : UI.white, wrap: width, lineGap: 2, stroke: 0x101414 }));
      if (head) {
        this.area.content.add(text(this.scene, 0, yy, hhmm(m.t), { color: UI.white, stroke: 0x101414 }));
        this.area.content.add(text(this.scene, 30, yy, m.who, { color: UI.yellow, stroke: 0x101414 }));
      }
      yy += textLines(body, width, 2) + 2;
    }
    this.area.setContentHeight(yy);
    this.area.scrollToBottom();
  }
}
