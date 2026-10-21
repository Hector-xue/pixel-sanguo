// 剧情对话框：上面头像和名字，中间黑底大文本框，底下一排选项
import { heroVariant } from '../game/state';
import Phaser from 'phaser';
import { avatarTex, heroLookKey } from '../art/textures';
import { classes, npcs } from '../data';
import type { DialogLine } from '../data';
import { store } from '../game/store';
import { Button, H, W, frame, goldFrame, hit, text, wrap } from './widgets';
import { UI, stoneTex } from '../art/chrome';

export interface DialogOption {
  label: string;
  fn: () => void;
  style?: 'red' | 'tan';
}

export function fillText(s: string): string {
  if (!store.has()) return s;
  const p = store.save.player;
  return s.replace(/\{name\}/g, p.name).replace(/\{class\}/g, classes[p.classId].name);
}

// lines 播完后显示 options；没有 options 就显示"继续"并在结束时调用 onDone
export function showDialog(scene: Phaser.Scene, lines: DialogLine[], options: DialogOption[] = [], onDone?: () => void): void {
  let i = 0;
  const root = scene.add.container(0, 0).setDepth(500);
  const block = scene.add.zone(0, 0, W, H).setOrigin(0).setInteractive();
  // 原版剧情页：整页灰石云纹边，NPC 头像和红字名字在左上，中间深蓝大字框，主角说话时头像在右下
  root.add([block, scene.add.image(0, 0, stoneTex(scene, W, H)).setOrigin(0)]);
  let page: Phaser.GameObjects.Container | null = null;
  const boxY = 92;
  const boxH = Math.min(220, H - boxY - 150);

  const render = () => {
    page?.destroy();
    page = scene.add.container(0, 0);
    root.add(page);
    const line = lines[i];
    const g = scene.add.graphics();
    frame(g, 8, 8, W - 16, H - 16, 'paper');
    frame(g, 16, boxY, W - 32, boxH, 'ink');
    g.fillStyle(0x30346a).fillRect(22, boxY + boxH - 30, W - 44, 1);
    page.add(g);
    const isPlayer = line.who === 'player' && store.has();
    const npc = line.who && line.who !== 'player' ? npcs[line.who] : undefined;
    const portrait = (px: number, py: number, tex: string) => {
      const pg = scene.add.graphics();
      goldFrame(pg, px, py, 60, 60, 0x10204a);
      page!.add(pg);
      page!.add(scene.add.image(px + 6, py + 6, tex).setOrigin(0).setScale(2));
    };
    if (npc) {
      portrait(18, 18, avatarTex(scene, npc.look));
      page.add(text(scene, 86, 22, npc.name, { color: UI.red, stroke: 0x000000, scale: 2 }));
    } else if (!isPlayer) {
      page.add(text(scene, 22, 40, '旁白', { color: UI.dim }));
    }
    if (isPlayer) {
      const p = store.save.player;
      const py = boxY + boxH + 10;
      portrait(W - 80, py, avatarTex(scene, heroLookKey(p.classId, p.gender), heroVariant(store.save)));
      page.add(text(scene, W - 88, py + 18, p.name, { align: 'right', color: UI.red, stroke: 0x000000, scale: 2 }));
    }
    const body = wrap(fillText(line.text), W - 56).join('\n');
    page.add(text(scene, 26, boxY + 10, body, { color: UI.white, lineGap: 6 }));
    page.add(text(scene, W - 26, boxY + boxH - 46, `${i + 1}/${lines.length}`, { color: UI.dim, align: 'right' }));
    const last = i === lines.length - 1;
    const by = H - 44;
    if (!last || !options.length) {
      page.add(text(scene, W / 2, boxY + boxH - 22, last ? '➤ 返回' : '➤ 继续', { align: 'center', color: UI.yellow }));
      page.add(hit(scene, 16, boxY, W - 32, boxH, next));
      page.add(new Button(scene, 16, by, 88, 26, '返回', () => {
        root.destroy();
        if (!options.length) onDone?.();
      }, { color: 0xc00c00 }));
    } else {
      const bw = Math.min(100, Math.floor((W - 32 - (options.length - 1) * 6) / options.length));
      options.forEach((o, k) => {
        page!.add(new Button(scene, 16 + k * (bw + 6), by, bw, 26, o.label, () => {
          root.destroy();
          o.fn();
        }, { style: o.style ?? (k === 0 ? 'red' : 'tan') }));
      });
    }
  };
  const next = () => {
    if (i < lines.length - 1) {
      i++;
      render();
    } else if (!options.length) {
      root.destroy();
      onDone?.();
    }
  };
  if (!lines.length) lines = [{ who: '', text: '……' }];
  render();
}
