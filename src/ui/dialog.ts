// 剧情对话框：上面头像和名字，中间黑底大文本框，底下一排选项
import Phaser from 'phaser';
import { C } from '../art/palette';
import { avatarTex, heroLookKey } from '../art/textures';
import { classes, npcs } from '../data';
import type { DialogLine } from '../data';
import { store } from '../game/store';
import { Button, H, W, frame, hit, text, wrap } from './widgets';

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
  const top = 300;
  const block = scene.add.zone(0, 0, W, H).setOrigin(0).setInteractive();
  root.add(block);
  let page: Phaser.GameObjects.Container | null = null;

  const render = () => {
    page?.destroy();
    page = scene.add.container(0, 0);
    root.add(page);
    const line = lines[i];
    const g = scene.add.graphics();
    frame(g, 4, top, W - 8, H - top - 4, 'tan');
    frame(g, 10, top + 62, W - 20, H - top - 112, 'ink');
    page.add(g);
    const named = line.who === 'player' || (!!line.who && !!npcs[line.who]);
    if (named) frame(g, 10, top + 4, 52, 52, 'paper');
    let name = '';
    if (line.who === 'player' && store.has()) {
      const p = store.save.player;
      page.add(scene.add.image(12, top + 6, avatarTex(scene, heroLookKey(p.classId, p.gender), p.avatar)).setOrigin(0).setScale(2));
      name = p.name;
    } else if (line.who && npcs[line.who]) {
      page.add(scene.add.image(12, top + 6, avatarTex(scene, npcs[line.who].look)).setOrigin(0).setScale(2));
      name = npcs[line.who].name;
    }
    if (name) page.add(text(scene, 70, top + 22, name, { color: C.darkRed, scale: 2 }));
    else page.add(text(scene, 16, top + 30, '旁白', { color: C.brown }));
    const body = wrap(fillText(line.text), W - 44).join('\n');
    page.add(text(scene, 20, top + 72, body, { color: C.paper, lineGap: 6 }));
    page.add(text(scene, W - 18, H - 68, `${i + 1}/${lines.length}`, { color: C.gray, align: 'right' }));
    const last = i === lines.length - 1;
    const by = H - 40;
    if (!last || !options.length) {
      page.add(hit(scene, 10, top + 62, W - 20, H - top - 112, next));
      page.add(new Button(scene, W - 100, by, 88, 26, last ? '返回' : '继续', next, { style: 'red' }));
    } else {
      const bw = Math.min(100, Math.floor((W - 24 - (options.length - 1) * 6) / options.length));
      options.forEach((o, k) => {
        page!.add(new Button(scene, 12 + k * (bw + 6), by, bw, 26, o.label, () => {
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
