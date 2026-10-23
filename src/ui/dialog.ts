// 剧情对话：场景压暗当背景，说话人的半身立绘站在对话框上（NPC 在左、主角在右），
// 名字写在朱漆题签上，文字逐字打出；点一下补全，再点一下翻页；最后一句的选项竖排在右上方。
import { heroVariant } from '../game/state';
import { pushBack } from './back';
import Phaser from 'phaser';
import { bustTex, heroLookKey } from '../art/textures';
import { BUST_W } from '../art/bust';
import { classes, npcs } from '../data';
import type { DialogLine } from '../data';
import { store } from '../game/store';
import { Button, H, W, sfx, text, wrap } from './widgets';
import { PAPER, paperTex, titlePlaque, woodFrame } from '../art/chrome';

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

// 说话人的立绘和名字；who 也可以直接写一个外观名（奇遇里的路人），name 跟在 | 后面
export function speaker(scene: Phaser.Scene, who: string): { tex: string | null; name: string; player: boolean } {
  if (who === 'player' && store.has()) {
    const p = store.save.player;
    return { tex: bustTex(scene, heroLookKey(p.classId, p.gender), heroVariant(store.save)), name: p.name, player: true };
  }
  const npc = who ? npcs[who] : undefined;
  if (npc) return { tex: bustTex(scene, npc.look), name: npc.name, player: false };
  if (who.includes('|')) {
    const [look, name] = who.split('|');
    return { tex: bustTex(scene, look), name, player: false };
  }
  return { tex: null, name: '', player: false };
}

const BOX_H = 118;
const CPS = 40;

// lines 播完后显示 options；没有 options 就在结束时调用 onDone
export function showDialog(scene: Phaser.Scene, lines: DialogLine[], options: DialogOption[] = [], onDone?: () => void): void {
  if (!lines.length) lines = [{ who: '', text: '……' }];
  let i = 0;
  const root = scene.add.container(0, 0).setDepth(500);
  // 返回键：对话开着时不往下漏（不跳过剧情，免得错过选项）
  root.once(Phaser.GameObjects.Events.DESTROY, pushBack(() => undefined));
  const block = scene.add.zone(0, 0, W, H).setOrigin(0).setInteractive();
  const dim = scene.add.graphics();
  // 上面轻压暗，越往下越暗，场景还看得见
  for (let k = 0; k < 8; k++) dim.fillStyle(0x0a0604, 0.18 + k * 0.05).fillRect(0, Math.round((H * k) / 8), W, Math.ceil(H / 8));
  root.add([block, dim]);
  const boxY = H - BOX_H - 10;
  const box = scene.add.graphics();
  woodFrame(box, 6, boxY, W - 12, BOX_H);
  root.add(box);
  root.add(scene.add.image(12, boxY + 6, paperTex(scene, W - 24, BOX_H - 12)).setOrigin(0));
  let page: Phaser.GameObjects.Container | null = null;
  let typing: Phaser.Time.TimerEvent | null = null;
  let full = '';
  let body: Phaser.GameObjects.Text | null = null;
  let arrow: Phaser.GameObjects.Text | null = null;
  let lastWho = '\u0000';

  const finishTyping = () => {
    typing?.remove();
    typing = null;
    body?.setText(full);
    arrow?.setVisible(true);
    if (i === lines.length - 1 && options.length) showOptions();
  };

  const close = (after?: () => void) => {
    typing?.remove();
    scene.tweens.add({ targets: root, alpha: 0, duration: 120, onComplete: () => {
      root.destroy();
      after?.();
    } });
  };

  const showOptions = () => {
    if (!page || page.getData('opts')) return;
    page.setData('opts', true);
    arrow?.setVisible(false);
    const bw = 150;
    options.forEach((o, k) => {
      const y = boxY - 8 - (options.length - k) * 30;
      const b = new Button(scene, W - bw - 10, y, bw, 26, o.label, () => close(o.fn), { style: o.style ?? (k === 0 ? 'red' : 'tan') });
      b.setAlpha(0).setX(b.x + 12);
      scene.tweens.add({ targets: b, alpha: 1, x: b.x - 12, delay: k * 50, duration: 140, ease: 'Quad.easeOut' });
      page!.add(b);
    });
  };

  const render = () => {
    page?.destroy();
    page = scene.add.container(0, 0);
    root.add(page);
    const line = lines[i];
    const sp = speaker(scene, line.who);
    // 立绘：换人时从侧边滑进来，同一个人连着说就不动
    if (sp.tex) {
      const px = sp.player ? W - BUST_W * 2 - 2 : 2;
      const img = scene.add.image(px, boxY - 6, sp.tex).setOrigin(0, 1).setScale(2).setFlipX(sp.player);
      page.add(img);
      if (line.who !== lastWho) {
        img.setAlpha(0).setX(px + (sp.player ? 16 : -16));
        scene.tweens.add({ targets: img, alpha: 1, x: px, duration: 180, ease: 'Quad.easeOut' });
      }
      scene.tweens.add({ targets: img, y: img.y - 1, duration: 900, yoyo: true, repeat: -1, ease: 'Stepped', easeParams: [1] });
    }
    lastWho = line.who;
    // 名字题签压在对话框上沿
    if (sp.name) {
      const g = scene.add.graphics();
      const tw = Math.max(60, sp.name.length * 12 + 24);
      const cx = sp.player ? W - 150 - tw / 2 : 150 + tw / 2;
      titlePlaque(g, cx, boxY - 8, tw);
      page.add([g, text(scene, cx, boxY - 6, sp.name, { align: 'center', color: 0xfff0c0, stroke: 0x4a0804 })]);
    }
    full = wrap(fillText(line.text), W - 52).join('\n');
    body = text(scene, 22, boxY + 18, '', { color: sp.name ? PAPER.ink : 0x6a4a2c, lineGap: 6 });
    page.add(body);
    page.add(text(scene, W - 22, boxY + BOX_H - 22, `${i + 1}/${lines.length}`, { color: 0xa08860, align: 'right' }));
    arrow = text(scene, W - 50, boxY + BOX_H - 22, '▼', { color: 0xb42c18 }).setVisible(false);
    page.add(arrow);
    scene.tweens.add({ targets: arrow, y: arrow.y + 2, duration: 300, yoyo: true, repeat: -1, ease: 'Stepped', easeParams: [2] });
    // 跳过：一句没说完也能直接走
    if (!(i === lines.length - 1 && options.length)) {
      // 放在对话框左下角（原来在右上角，满一行的字会钻到它底下）
      page.add(new Button(scene, 18, boxY + BOX_H - 26, 44, 16, '跳过', () => {
        if (options.length) {
          i = lines.length - 1;
          render();
          finishTyping();
        } else close(onDone);
      }, { style: 'tan' }));
    }
    let n = 0;
    const chars = [...full];
    typing = scene.time.addEvent({
      delay: 1000 / CPS, loop: true, callback: () => {
        n++;
        body?.setText(chars.slice(0, n).join(''));
        if (n % 3 === 0 && chars[n - 1]?.trim()) sfx('step');
        if (n >= chars.length) finishTyping();
      },
    });
  };

  const next = () => {
    if (typing) return finishTyping();
    if (i < lines.length - 1) {
      i++;
      render();
    } else if (!options.length) close(onDone);
  };
  block.on('pointerup', next);
  root.setAlpha(0);
  scene.tweens.add({ targets: root, alpha: 1, duration: 140 });
  render();
}
