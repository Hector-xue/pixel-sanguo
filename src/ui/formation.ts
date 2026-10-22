// 阵法面板：上面一张相克环（五个阵围成一圈，箭头指向被克的那个），下面逐个列出加成、解锁等级、布阵按钮
import { C } from '../art/palette';
import { BEATS, FORMS, FORM_ORDER, formUnlocked, myFormation, setFormation } from '../game/formation';
import type { FormId } from '../game/formation';
import { store } from '../game/store';
import type { Host } from './panels';
import { Button, Modal, sfx, text, toast } from './widgets';

export function formationPanel(h: Host, onPick?: () => void): void {
  const s = store.save;
  const m = new Modal(h, '阵法');
  const dyn = h.add.container(0, 0);
  m.inner.add(dyn);
  const render = () => {
    dyn.removeAll(true);
    const cur = myFormation(s);
    // 相克环
    const cx = m.cx + m.cw / 2;
    const cy = m.cy + 82;
    const R = 62;
    const pos = (i: number) => ({ x: Math.round(cx + Math.sin((i / 5) * Math.PI * 2) * R), y: Math.round(cy - Math.cos((i / 5) * Math.PI * 2) * R) });
    // 环上的顺序就是相克顺序：锋矢 → 鹤翼 → 长蛇 → 八卦 → 鱼鳞 → 锋矢
    const ring: FormId[] = ['fengshi', 'heyi', 'changshe', 'bagua', 'yulin'];
    const g = h.add.graphics();
    ring.forEach((id, i) => {
      const a = pos(i);
      const b = pos(ring.indexOf(BEATS[id]));
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy);
      const ux = dx / len;
      const uy = dy / len;
      const sx = a.x + ux * 22;
      const sy = a.y + uy * 14;
      const ex = b.x - ux * 24;
      const ey = b.y - uy * 16;
      for (let k = 0; k <= 20; k++) g.fillStyle(0xb42c18).fillRect(Math.round(sx + ((ex - sx) * k) / 20) - 1, Math.round(sy + ((ey - sy) * k) / 20) - 1, 2, 2);
      // 箭头
      g.fillStyle(0xb42c18).fillTriangle(ex + ux * 6, ey + uy * 6, ex - uy * 5, ey + ux * 5, ex + uy * 5, ey - ux * 5);
    });
    dyn.add(g);
    ring.forEach((id, i) => {
      const p = pos(i);
      const open = formUnlocked(s, id);
      const on = id === cur;
      const bg = h.add.graphics();
      bg.fillStyle(0x2a1a10).fillRect(p.x - 25, p.y - 11, 50, 22);
      bg.fillStyle(on ? 0xd8442a : open ? 0xe8d6ae : 0xc8bca4).fillRect(p.x - 24, p.y - 10, 48, 20);
      dyn.add(bg);
      dyn.add(text(h, p.x, p.y - 7, FORMS[id].name, { align: 'center', color: on ? 0xfff0c0 : open ? C.darkRed : C.gray }));
    });
    dyn.add(text(h, cx, cy - 7, '克', { align: 'center', color: 0xb42c18, scale: 2 }).setY(cy - 12));
    let y = m.cy + 168;
    dyn.add(text(h, m.cx, y, '箭头指向被克的阵：克住对面，全队攻击再加一成；被克，攻击少一点。怪物卡上能看到对面列的什么阵。', { wrap: m.cw, color: C.brown, lineGap: 2 }));
    y += 44;
    for (const id of FORM_ORDER) {
      const f = FORMS[id];
      const open = formUnlocked(s, id);
      const on = id === cur;
      const rg = h.add.graphics();
      rg.fillStyle(on ? 0xf0d8b0 : 0xe8d6ae).fillRect(m.cx, y, m.cw, 46);
      rg.fillStyle(0xa88a5c).fillRect(m.cx, y + 45, m.cw, 1);
      dyn.add(rg);
      dyn.add(text(h, m.cx + 8, y + 5, f.name, { color: open ? C.darkRed : C.gray }));
      dyn.add(text(h, m.cx + 72, y + 5, f.desc, { color: open ? C.darkBrown : C.gray }));
      const beaten = FORM_ORDER.find((x) => BEATS[x] === id)!;
      dyn.add(text(h, m.cx + 8, y + 25, `克${FORMS[BEATS[id]].name}，被${FORMS[beaten].name}克`, { color: C.gray }));
      if (on) dyn.add(text(h, m.cx + m.cw - 10, y + 15, '布阵中', { align: 'right', color: C.red }));
      else dyn.add(new Button(h, m.cx + m.cw - 60, y + 10, 54, 26, open ? '布阵' : `${f.lv}级`, () => {
        sfx('click');
        toast(h, setFormation(s, id), 1600);
        h.refresh();
        render();
        onPick?.();
      }, { style: open ? 'red' : 'tan', disabled: !open }));
      y += 50;
    }
  };
  render();
}
