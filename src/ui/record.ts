// 军功簿：本周四件事（做完领奖）+ 战绩总账
import { C } from '../art/palette';
import { items } from '../data';
import { store } from '../game/store';
import { WEEK_BONUS, claimWeek, claimWeekBonus, recordLines, weekReward, weekRows, weekState } from '../game/weekly';
import { battlesToNextDay, calTick, weekday } from '../game/calendar';
import type { Host } from './panels';
import { tabs } from './p3';
import { Button, Modal, frame, sfx, text, toast } from './widgets';

let tab = 0;

export function recordPanel(h: Host, start?: number): void {
  if (start !== undefined) tab = start;
  const s = store.save;
  const m = new Modal(h, '军功簿', { help: '军功簿' });
  const dyn = h.add.container(0, 0);
  m.inner.add(dyn);
  const render = () => {
    dyn.removeAll(true);
    tabs(h, m, dyn, ['本周', '战绩'], tab, (i) => {
      tab = i;
      render();
    });
    let y = m.cy + 30;
    if (tab === 0) {
      const t = calTick(s);
      const w = weekState(s, t);
      store.commit();
      const left = battlesToNextDay(t);
      dyn.add(text(h, m.cx, y, `天下历这一周还有${7 - weekday(t)}天换新（再打${left}仗到明天）。每件做完领一份，四件全领完再给一份。`, { wrap: m.cw, color: C.brown, lineGap: 2 }));
      y += 40;
      const r = weekReward(s);
      const got = [`银两${r.silver}`, ...Object.entries(r.items).map(([id, k]) => `${items[id].name}×${k}`)].join('、');
      for (const row of weekRows(s, t)) {
        const g = h.add.graphics();
        const ready = row.done >= row.need && !row.claimed;
        frame(g, m.cx, y, m.cw, 50, ready ? 'red' : 'tan');
        dyn.add(g);
        dyn.add(text(h, m.cx + 8, y + 6, row.name, { color: ready ? 0xfff0c0 : C.darkRed }));
        dyn.add(text(h, m.cx + 8, y + 26, `${row.done}/${row.need}　奖励：${got}`, { color: ready ? 0xe8d8b0 : C.brown }));
        // 进度条
        const bar = h.add.graphics();
        bar.fillStyle(0x3a2a14, 0.35).fillRect(m.cx + 8, y + 42, m.cw - 90, 3);
        bar.fillStyle(0xd4a028).fillRect(m.cx + 8, y + 42, Math.round((m.cw - 90) * (row.done / row.need)), 3);
        dyn.add(bar);
        dyn.add(new Button(h, m.cx + m.cw - 70, y + 12, 62, 24, row.claimed ? '已领' : '领取', () => {
          const msg = claimWeek(s, row.key);
          store.commit();
          sfx('heal');
          toast(h, msg);
          h.refresh();
          render();
        }, { style: ready ? 'red' : 'tan', disabled: !ready }));
        y += 56;
      }
      const all = weekRows(s, t).every((x) => x.claimed);
      const bonus = Object.entries(WEEK_BONUS).map(([id, k]) => `${items[id].name}×${k}`).join('、');
      dyn.add(new Button(h, m.cx, y + 4, m.cw, 28, w.bonus ? `这一周全满（${bonus}已领）` : `四件全领完：${bonus}`, () => {
        const msg = claimWeekBonus(s);
        store.commit();
        sfx('level');
        toast(h, msg);
        h.refresh();
        render();
      }, { style: all && !w.bonus ? 'red' : 'tan', disabled: !all || w.bonus }));
    } else {
      for (const [k, v] of recordLines(s)) {
        dyn.add(text(h, m.cx + 6, y, k, { color: C.brown }));
        dyn.add(text(h, m.cx + 92, y, v, { color: C.darkBrown }));
        y += 22;
      }
    }
  };
  render();
}
