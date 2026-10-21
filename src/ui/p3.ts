// P3 的界面：擂台/斗将台/决斗场、教派、训练、宝库、转职、排行榜、成就称号、银两环、组队、婚姻结拜、文曲星、幸运王、摆摊、抢宝、节日、战斗录像
import Phaser from 'phaser';
import { C } from '../art/palette';
import { avatarTex, heroLookKey, iconTex } from '../art/textures';
import { CLASS_IDS, balance, classes, items, locations, systems } from '../data';
import type { Battle } from '../core/battle';
import { randomSeed } from '../core/rng';
import type { ClassId, Gender } from '../core/types';
import { arenaBattle, arenaSalary, challengers, evilNow, fightsLeft, myRank, pkBattle, pkList } from '../game/arena';
import type { Ladder } from '../game/arena';
import { BOARDS, achvProgress, allTitles, board, myBoardRank, setTitle, titleText } from '../game/achv';
import type { BoardKind } from '../game/achv';
import {
  answerWenqu, claimFestival, festivalKey, festivalToday, luckyCost, luckyDraw, luckyDraws, silverRingLeft, silverRingReward,
  takeSilverRing, treasureBattle, treasureLeft, treasureNow, treasureTeleport, turnInSilverRing, wenquToday,
} from '../game/events';
import { canRebirth, generalRebirth, generalRebirthReason, rebirth } from '../game/rebirth';
import { rivalLevel } from '../game/rivals';
import {
  joinSect, leaveSect, sectDef, sectRankName, sectTaskDone, sectTaskText, sectTasksLeft, takeSectTask, turnInSect, vigorMax, vigorNow,
} from '../game/sect';
import { candidateName, candidates, divorce, giftCost, giftsLeft, giveGift, hireMerc, marry, mercCost, swear, swornReason } from '../game/social';
import { canSell, collectStall, fairPrice, putOnStall, setStallName, settleStall, takeOffStall } from '../game/stall';
import type { Save } from '../game/state';
import { allGenerals } from '../game/generals';
import { bagCount, findGeneral, generalStats, playerStats, sectRank } from '../game/state';
import { store } from '../game/store';
import { endTraining, startTraining, trainCost, trainExpPerHour, trainingProgress } from '../game/training';
import { expandVault, vaultStore, vaultTake, vaultUsed } from '../game/town';
import { showDialog } from './dialog';
import { overlayInput } from './input';
import type { Host } from './panels';
import { chooseAmount, chooseCount, done } from './panels';
import { power } from './role';
import { Button, Modal, ScrollArea, confirm, frame, sfx, text, toast } from './widgets';

// ===== 小工具 =====
export function tabs(h: Host, m: Modal, parent: Phaser.GameObjects.Container, names: string[], cur: number, pick: (i: number) => void, y = m.cy): void {
  const bw = Math.floor(m.cw / names.length);
  names.forEach((n, i) => parent.add(new Button(h, m.cx + i * bw, y, bw - 2, 22, n, () => pick(i), { style: i === cur ? 'dark' : 'tan' })));
}

export interface Rows {
  area: ScrollArea;
  y: number;
}

export function rows(h: Host, m: Modal, parent: Phaser.GameObjects.Container, top: number, bottom = 12): Rows {
  return { area: new ScrollArea(h, m.cx, top, m.cw, m.py + m.ph - bottom - top, parent), y: 0 };
}

export function row(h: Host, r: Rows, icon: string | null, title: string, sub: string, btn: string | null, fn: () => void, o: { disabled?: boolean; color?: number; style?: 'red' | 'tan' | 'blue'; scale?: number } = {}): void {
  const c = r.area.content;
  const w = r.area.w;
  const g = h.add.graphics();
  frame(g, 0, r.y, w - 6, 36, 'tan');
  c.add(g);
  if (icon) c.add(h.add.image(5, r.y + 6, icon).setOrigin(0).setScale(o.scale ?? 1).setCrop(0, 0, 24, 24));
  const tx = icon ? 34 : 8;
  c.add(text(h, tx, r.y + 3, title, { color: o.color ?? C.darkBrown }));
  c.add(text(h, tx, r.y + 19, sub, { color: C.brown }));
  if (btn) c.add(new Button(h, w - 62, r.y + 7, 54, 22, btn, fn, { clip: r.area, disabled: o.disabled, style: o.style }));
  r.y += 40;
}

export function fight(h: Host, b: Battle | string): void {
  if (typeof b === 'string') return void toast(h, b);
  store.flush();
  h.scene.start('Battle', { battle: b });
}

export const heroAvatar = (h: Host, cls: ClassId, gender: Gender, variant: number) => avatarTex(h, heroLookKey(cls, gender), variant);

// ===== 擂台 / 斗将台 / 决斗场 =====
let arenaTab = 0;
export function arenaPanel(h: Host, tab?: number): void {
  if (tab !== undefined) arenaTab = tab;
  const s = store.save;
  const m = new Modal(h, '擂台');
  const dyn = h.add.container(0, 0);
  m.inner.add(dyn);
  const render = () => {
    dyn.removeAll(true);
    tabs(h, m, dyn, ['擂台', '斗将台', '决斗场'], arenaTab, (i) => {
      arenaTab = i;
      render();
    });
    let y = m.cy + 30;
    if (arenaTab < 2) {
      const kind: Ladder = arenaTab === 0 ? 'arena' : 'duel';
      const rank = myRank(s, kind);
      const L = kind === 'arena' ? s.p3.arena : s.p3.duel;
      const who = kind === 'arena' ? s.player.name : findGeneral(s, s.activeGeneral ?? '')?.name ?? '（没有出战副将）';
      dyn.add(text(h, m.cx, y, `${who}　名次：${rank ? `第${rank}名` : '未上榜'}　最好：${L.best ? `第${L.best}名` : '-'}`, { color: C.darkRed }));
      y += 18;
      dyn.add(text(h, m.cx, y, `今天还能挑战${fightsLeft(s, kind)}次。打赢就换到对方的名次（只能挑战高你5名以内的）。`, { wrap: m.cw, color: C.brown }));
      y += 34;
      if (kind === 'arena') {
        dyn.add(new Button(h, m.cx, y, m.cw, 24, '领今天的擂台俸禄', () => {
          toast(h, arenaSalary(s));
          h.refresh();
          render();
        }, { style: 'red', disabled: !rank }));
        y += 30;
      }
      const r = rows(h, m, dyn, y);
      for (const c of challengers(s, kind).reverse()) {
        const lv = rivalLevel(s, c.rival);
        const icon = kind === 'arena' ? heroAvatar(h, c.rival.classId, c.rival.gender, c.rival.variant) : avatarTex(h, c.rival.general.look);
        const title = kind === 'arena' ? `第${c.rank}名 ${c.rival.name}` : `第${c.rank}名 ${c.rival.name}的${c.rival.general.name}`;
        const sub = kind === 'arena' ? `${lv}级${classes[c.rival.classId].name}，带着${c.rival.general.name}` : `${Math.max(1, lv - 3)}级${classes[c.rival.general.classId].name}`;
        row(h, r, icon, title, sub, '挑战', () => {
          m.close();
          fight(h, arenaBattle(s, kind, c.rank, randomSeed()));
        }, { disabled: fightsLeft(s, kind) <= 0, style: 'red' });
      }
      r.area.setContentHeight(r.y);
    } else {
      const evil = evilNow(s);
      dyn.add(text(h, m.cx, y, `恶人值：${evil}（每小时消1点；打比自己弱5级以上的人涨得多）`, { wrap: m.cw, color: evil >= 50 ? C.red : C.brown }));
      y += 34;
      dyn.add(text(h, m.cx, y, `今天还能决斗${fightsLeft(s, 'pk')}次。赢了抢对方银两，输了被抢一点。`, { wrap: m.cw, color: C.brown }));
      y += 34;
      const r = rows(h, m, dyn, y);
      for (const rv of pkList(s)) {
        const lv = rivalLevel(s, rv);
        row(h, r, heroAvatar(h, rv.classId, rv.gender, rv.variant), rv.name, `${lv}级${classes[rv.classId].name}${lv <= s.player.level - 5 ? '（比你弱）' : ''}`, '决斗', () => {
          m.close();
          fight(h, pkBattle(s, rv.id, randomSeed()));
        }, { disabled: fightsLeft(s, 'pk') <= 0, style: 'red' });
      }
      r.area.setContentHeight(r.y);
    }
  };
  render();
}

// ===== 教派 =====
export function sectTalk(h: Host): void {
  const s = store.save;
  const say = (t: string, opts: { label: string; fn: () => void }[] = []) => showDialog(h, [{ who: 'jiaopai', text: t }], opts);
  if (!s.p3.sect.id) {
    if (s.player.level < systems.sect.minLevel) return say(`${systems.sect.minLevel}级以后再来吧。`);
    return say('四大教派，各有各的好处。你想入哪一家？', [
      ...systems.sect.sects.map((x) => ({ label: x.name, fn: () => confirm(h, `加入${x.name}（${x.desc}）？`, () => done(h, joinSect(s, x.id)), '加入') })),
    ]);
  }
  sectPanel(h);
}

export function sectPanel(h: Host): void {
  const s = store.save;
  const def = sectDef(s.p3.sect.id);
  if (!def) {
    toast(h, `还没入教派。${systems.sect.minLevel}级以后去陈留找教派使者。`);
    return;
  }
  const m = new Modal(h, `教派 · ${def.name}`);
  const dyn = h.add.container(0, 0);
  m.inner.add(dyn);
  const render = () => {
    dyn.removeAll(true);
    let y = m.cy;
    const rank = sectRank(s.p3.sect.rep);
    const next = systems.sect.ranks[rank + 1];
    const lines = [
      `职位：${sectRankName(s.p3.sect.rep)}　声望：${s.p3.sect.rep}${next ? `（${next.rep}升${next.name}）` : ''}`,
      `教派加成：${def.desc}（职位越高越多）`,
      `活力：${vigorNow(s)}/${vigorMax(s)}　今天还能做${sectTasksLeft(s)}个任务（每个用${systems.sect.vigorCost}点活力）`,
    ];
    for (const l of lines) {
      dyn.add(text(h, m.cx, y, l, { wrap: m.cw, color: C.darkBrown }));
      y += 18;
    }
    y += 4;
    const t = s.p3.sect.task;
    if (t) {
      dyn.add(text(h, m.cx, y, `当前任务：${sectTaskText(t)}`, { wrap: m.cw, color: sectTaskDone(s) ? C.red : C.green }));
      y += 34;
      if (sectTaskDone(s)) {
        dyn.add(new Button(h, m.cx, y, m.cw, 26, '交任务', () => {
          const r = turnInSect(s);
          sfx('level');
          toast(h, r.join('\n'), 2400);
          h.refresh();
          render();
        }, { style: 'red' }));
      } else if (t.at) {
        dyn.add(new Button(h, m.cx, y, m.cw, 26, `开启寻路 → ${locations[t.at].name}`, () => {
          m.close();
          h.autoPath(t.at!);
        }, { style: 'red' }));
      }
      y += 32;
    } else {
      dyn.add(new Button(h, m.cx, y, m.cw, 26, '领教派任务', () => {
        toast(h, takeSectTask(s), 2200);
        h.refresh();
        render();
      }, { style: 'red', disabled: sectTasksLeft(s) <= 0 }));
      y += 32;
    }
    dyn.add(text(h, m.cx, y, '教派排名（按声望）', { color: C.darkRed }));
    y += 18;
    for (const b of board(s, 'bangpai', () => 0, 0, 0)) {
      dyn.add(text(h, m.cx + 8, y, b.name, { color: b.mine ? C.red : C.darkBrown }));
      dyn.add(text(h, m.cx + m.cw - 8, y, `声望${b.value}`, { align: 'right', color: C.brown }));
      y += 16;
    }
    y += 10;
    dyn.add(new Button(h, m.cx, y, m.cw, 24, '退出教派', () => confirm(h, '退出后声望清零，确定吗？', () => {
      m.close();
      done(h, leaveSect(s));
    }, '退出')));
  };
  render();
}

// ===== 训练 =====
export function trainingPanel(h: Host): void {
  const s = store.save;
  const m = new Modal(h, '训练');
  const dyn = h.add.container(0, 0);
  m.inner.add(dyn);
  let who = 'player';
  const render = () => {
    dyn.removeAll(true);
    let y = m.cy;
    const p = trainingProgress(s);
    if (p && s.p3.training) {
      const tw = s.p3.training.who;
      const name = tw === 'player' ? s.player.name : findGeneral(s, tw)?.name ?? '';
      dyn.add(text(h, m.cx, y, `${name}正在训练：${p.hours.toFixed(1)}/${s.p3.training.hours}小时，已攒经验${p.exp}`, { wrap: m.cw, color: C.darkRed }));
      y += 36;
      dyn.add(new Button(h, m.cx, y, m.cw, 26, p.done ? '训练完成，领经验' : '提前结束（按已练时长给经验）', () => {
        const r = endTraining(s);
        sfx('level');
        toast(h, r.join('\n'), 2400);
        h.refresh();
        render();
      }, { style: 'red' }));
      return;
    }
    dyn.add(text(h, m.cx, y, '交银两挂着练，关了游戏也按真实时间涨经验。周末半价。训练中的副将不能出战。', { wrap: m.cw, color: C.brown }));
    y += 36;
    const opts: [string, string][] = [['player', s.player.name], ...allGenerals(s).map((g) => [g.uid, `${g.name}（${g.level}级）`] as [string, string])];
    const r = rows(h, m, dyn, y, 150);
    for (const [id, name] of opts) {
      row(h, r, null, name, `每小时经验${trainExpPerHour(s, id)}`, who === id ? '已选' : '选', () => {
        who = id;
        render();
      }, { style: who === id ? 'red' : 'tan' });
    }
    r.area.setContentHeight(r.y);
    const by = m.py + m.ph - 140;
    balance.training.hours.forEach((hr, i) => {
      const cost = trainCost(s, who, hr);
      dyn.add(new Button(h, m.cx + (i % 2) * (m.cw / 2), by + Math.floor(i / 2) * 34, m.cw / 2 - 4, 28, `${hr}小时 ${cost}两`, () => {
        toast(h, startTraining(s, who, hr), 2200);
        h.refresh();
        render();
      }, { disabled: s.player.silver < cost }));
    });
  };
  render();
}

// ===== 宝库 =====
export function vaultPanel(h: Host): void {
  const s = store.save;
  const m = new Modal(h, '宝库');
  const dyn = h.add.container(0, 0);
  m.inner.add(dyn);
  let tab = 0;
  const render = () => {
    dyn.removeAll(true);
    tabs(h, m, dyn, ['存入', '取出'], tab, (i) => {
      tab = i;
      render();
    });
    dyn.add(text(h, m.cx, m.cy + 28, `宝库 ${vaultUsed(s)}/${s.p3.vaultCap}　随时随地都能存取`, { color: C.brown }));
    dyn.add(new Button(h, m.cx + m.cw - 110, m.cy + 24, 110, 22, `扩容（${balance.vault.goldPerStep}金砖）`, () => {
      toast(h, expandVault(s));
      h.refresh();
      render();
    }));
    const r = rows(h, m, dyn, m.cy + 52);
    const src = tab === 0 ? s.bag : s.p3.vault;
    for (const [id, n] of Object.entries(src)) {
      if (!items[id] || (tab === 0 && items[id].quest)) continue;
      row(h, r, iconTex(h, id), items[id].name, `×${n}`, tab === 0 ? '存入' : '取出', () => chooseCount(h, `${tab === 0 ? '存入' : '取出'}几个？`, n, (k) => {
        toast(h, tab === 0 ? vaultStore(s, id, k) : vaultTake(s, id, k));
        h.refresh();
        render();
      }), { scale: 2 });
    }
    r.area.setContentHeight(r.y);
  };
  render();
}

// ===== 转职（左慈） =====
export function rebirthTalk(h: Host): void {
  const s = store.save;
  const why = canRebirth(s);
  if (why) return showDialog(h, [{ who: 'zuoci', text: why === '已经转过职了' ? '你已经脱胎换骨了。副将满一百级，也能来找我转生（要一个大将军令）。' : '百级之人，可以脱胎换骨。你火候还不到。' }], [
    { label: '副将转生', fn: () => generalRebirthPanel(h) },
    { label: '返回', fn: () => {} },
  ]);
  showDialog(h, [{ who: 'zuoci', text: '转职以后，性别、职业、头像都能重选，等级不变。加过的属性点全部退给你重加，再多给四十点；三个技能按顺序带过去。' }], [
    { label: '转职', fn: () => rebirthPanel(h) },
    { label: '副将转生', fn: () => generalRebirthPanel(h) },
    { label: '再想想', fn: () => {} },
  ]);
}

function rebirthPanel(h: Host): void {
  const s = store.save;
  const st = { classId: s.player.classId, gender: s.player.gender, avatar: s.player.avatar };
  const m = new Modal(h, '转职');
  const dyn = h.add.container(0, 0);
  m.inner.add(dyn);
  const render = () => {
    dyn.removeAll(true);
    let y = m.cy;
    dyn.add(text(h, m.cx, y, '性别', { color: C.brown }));
    (['male', 'female'] as Gender[]).forEach((g, i) => dyn.add(new Button(h, m.cx + 50 + i * 66, y - 4, 60, 22, g === 'male' ? '男' : '女', () => {
      st.gender = g;
      render();
    }, { style: st.gender === g ? 'red' : 'tan' })));
    y += 30;
    dyn.add(text(h, m.cx, y, '职业', { color: C.brown }));
    CLASS_IDS.forEach((c, i) => dyn.add(new Button(h, m.cx + 50 + i * 80, y - 4, 74, 22, classes[c].name, () => {
      st.classId = c;
      render();
    }, { style: st.classId === c ? 'red' : 'tan' })));
    y += 30;
    dyn.add(text(h, m.cx, y, '头像', { color: C.brown }));
    for (let v = 0; v < 3; v++) {
      const x = m.cx + 50 + v * 60;
      const g = h.add.graphics();
      frame(g, x, y - 4, 54, 54, st.avatar === v ? 'red' : 'tan');
      dyn.add(g);
      dyn.add(h.add.image(x + 3, y - 1, heroAvatar(h, st.classId, st.gender, v)).setOrigin(0).setScale(2));
      const z = h.add.zone(x, y - 4, 54, 54).setOrigin(0).setInteractive();
      z.on('pointerup', () => {
        st.avatar = v;
        render();
      });
      dyn.add(z);
    }
    y += 66;
    dyn.add(text(h, m.cx, y, `转职后：${classes[st.classId].name}，等级${s.player.level}，可分配属性点${s.player.free + Object.values(s.player.added).reduce((a, b) => a + b, 0) + balance.rebirth.bonusPoints}，面板+${Math.round(balance.rebirth.statMul * 100)}%，等级上限${balance.levelCap}。`, { wrap: m.cw, color: C.darkBrown }));
    y += 52;
    dyn.add(new Button(h, m.cx, y, m.cw, 30, '脱胎换骨', () => confirm(h, '转职以后不能反悔，确定吗？', () => {
      const r = rebirth(s, st.classId, st.gender, st.avatar);
      m.close();
      sfx('level');
      toast(h, r, 3200);
      h.refresh();
    }, '转职'), { style: 'red' }));
  };
  render();
}

function generalRebirthPanel(h: Host): void {
  const s = store.save;
  const m = new Modal(h, '副将转生', { h: 360 });
  const r = rows(h, m, m.inner, m.cy);
  for (const g of allGenerals(s)) {
    const why = generalRebirthReason(s, g.uid);
    row(h, r, avatarTex(h, g.look), `${g.name}（${g.level}级${g.reborn ? '·1转' : ''}）`, why || '可以转生（花1个大将军令）', '转生', () => {
      m.close();
      done(h, generalRebirth(s, g.uid));
    }, { disabled: !!why, style: 'red' });
  }
  r.area.setContentHeight(r.y);
}

// ===== 排行榜 =====
let boardKind: BoardKind = 'gaoshou';
export function rankPanel(h: Host): void {
  const s = store.save;
  const m = new Modal(h, '排行榜');
  const dyn = h.add.container(0, 0);
  m.inner.add(dyn);
  const render = () => {
    dyn.removeAll(true);
    const bw = Math.floor(m.cw / 5);
    BOARDS.forEach(([k, name], i) => dyn.add(new Button(h, m.cx + (i % 5) * bw, m.cy + Math.floor(i / 5) * 26, bw - 2, 22, name, () => {
      boardKind = k;
      render();
    }, { style: boardKind === k ? 'dark' : 'tan' })));
    const st = playerStats(s);
    const myPower = power(st);
    const myResist = Object.values(st.resist).reduce((a, b) => a + b, 0);
    const rowsB = board(s, boardKind, (lv) => Math.round(lv * lv * 0.9 + lv * 40), myPower, myResist);
    const mine = myBoardRank(rowsB);
    dyn.add(text(h, m.cx, m.cy + 56, mine ? `你排第${mine}名` : '你没进前50名', { color: C.red }));
    const area = new ScrollArea(h, m.cx, m.cy + 76, m.cw, m.ph - 112, dyn);
    rowsB.forEach((b, i) => {
      const y = i * 20;
      if (b.mine) {
        const g = h.add.graphics();
        frame(g, 0, y - 2, m.cw - 6, 19, 'red');
        area.content.add(g);
      }
      area.content.add(text(h, 6, y, `${i + 1}`, { color: i < 3 ? C.yellow : C.brown }));
      area.content.add(text(h, 40, y, b.name, { color: b.mine ? C.lightPaper : C.darkBrown }));
      area.content.add(text(h, m.cw - 12, y, b.text, { align: 'right', color: C.brown }));
    });
    area.setContentHeight(rowsB.length * 20);
  };
  render();
}

// ===== 成就 =====
export function achvPanel(h: Host): void {
  const s = store.save;
  const m = new Modal(h, '成就');
  const got = systems.achv.filter((a) => s.p3.achv[a.id]).length;
  m.inner.add(text(h, m.cx, m.cy, `已达成 ${got}/${systems.achv.length}`, { color: C.brown }));
  const r = rows(h, m, m.inner, m.cy + 20);
  for (const a of systems.achv) {
    const ok = !!s.p3.achv[a.id];
    row(h, r, null, `${a.name}${a.title ? `（称号：${a.title}）` : ''}`, `${a.desc}　${ok ? '已达成' : achvProgress(s, a)}`, null, () => {}, { color: ok ? C.red : C.gray });
  }
  r.area.setContentHeight(r.y);
}

export function titlePanel(h: Host, after: () => void): void {
  const s = store.save;
  const m = new Modal(h, '更换称号', { h: 360 });
  const list = allTitles(s);
  m.inner.add(text(h, m.cx, m.cy, `当前：${titleText(s)}。称号从成就、娱乐场里来。`, { wrap: m.cw, color: C.brown }));
  const r = rows(h, m, m.inner, m.cy + 22);
  row(h, r, null, '不戴称号', '', '选', () => {
    setTitle(s, null);
    m.close();
    after();
  });
  for (const t of list) {
    row(h, r, null, t, s.p3.title === t ? '正戴着' : '', '戴上', () => {
      toast(h, setTitle(s, t));
      m.close();
      after();
    }, { style: 'red' });
  }
  r.area.setContentHeight(r.y);
}

// ===== 银两环（庐江都尉） =====
export function silverRingTalk(h: Host): void {
  const s = store.save;
  const say = (t: string, opts: { label: string; fn: () => void }[] = []) => showDialog(h, [{ who: 'lujiangduwei', text: t }], opts);
  const t = s.p3.silverRing.task;
  if (t) {
    const have = bagCount(s, 'junzi');
    if (have >= t.need) return say(`${t.need}份军资都追回来了？好！`, [{ label: '交军资', fn: () => {
      sfx('level');
      done(h, turnInSilverRing(s));
    } }]);
    return say(`军资还差${t.need - have}份。庐江逃兵就在城外，打他们就能抢回来。`, [{ label: '知道了', fn: () => {} }]);
  }
  say(`逃兵抢了军资。帮我追回${systems.silverRing.need}份，赏你${silverRingReward(s)}两。今天还能接${silverRingLeft(s)}次。`, [
    { label: '接差事', fn: () => done(h, takeSilverRing(s)) },
    { label: '返回', fn: () => {} },
  ]);
}

// ===== 组队（雇 AI 队友） =====
export function teamPanel(h: Host): void {
  const s = store.save;
  const m = new Modal(h, '组队', { h: 340 });
  let y = m.cy;
  m.inner.add(text(h, m.cx, y, '单机版没有真人玩家，可以雇 AI 队友跟你一起打。队友不吃经验，打一场少一场。', { wrap: m.cw, color: C.brown }));
  y += 40;
  if (s.p3.merc) {
    m.inner.add(text(h, m.cx, y, `现在的队友：${classes[s.p3.merc.id as ClassId]?.name ?? ''}，还能打${s.p3.merc.battles}场`, { color: C.darkRed }));
    y += 24;
    m.inner.add(new Button(h, m.cx, y, m.cw, 26, '解散队伍', () => {
      s.p3.merc = null;
      m.close();
      done(h, '队友走了');
    }));
    return;
  }
  const cost = mercCost(s);
  CLASS_IDS.forEach((c, i) => {
    m.inner.add(new Button(h, m.cx, y + i * 36, m.cw, 30, `雇一个${classes[c].name}（${systems.merc.battles}场，${cost}两）`, () => {
      m.close();
      done(h, hireMerc(s, c));
    }, { disabled: s.player.silver < cost }));
  });
}

// ===== 月老：婚姻、结拜 =====
export function marriageTalk(h: Host): void {
  const s = store.save;
  const m = new Modal(h, '月老');
  const dyn = h.add.container(0, 0);
  m.inner.add(dyn);
  const render = () => {
    dyn.removeAll(true);
    let y = m.cy;
    const M = systems.marriage;
    if (s.p3.marriage.spouse) {
      dyn.add(text(h, m.cx, y, `配偶：${candidateName(s.p3.marriage.spouse)}（气血+${s.player.level * balance.marriage.hpPerLevel}）`, { color: C.red }));
      y += 22;
      dyn.add(new Button(h, m.cx, y, m.cw, 24, '和离', () => confirm(h, '和离以后好感清零，确定吗？', () => {
        toast(h, divorce(s));
        h.refresh();
        render();
      }, '和离')));
      y += 34;
    } else {
      dyn.add(text(h, m.cx, y, `送礼攒好感，满100就能成亲（聘礼${M.weddingSilver}两）。礼物${giftCost(s)}两一份，今天还能送${giftsLeft(s)}次。`, { wrap: m.cw, color: C.brown }));
      y += 40;
      for (const c of candidates(s)) {
        const f = s.p3.marriage.favor[c.id] ?? 0;
        const g = h.add.graphics();
        frame(g, m.cx, y, m.cw, 36, 'tan');
        dyn.add(g);
        dyn.add(h.add.image(m.cx + 5, y + 6, avatarTex(h, c.look)).setOrigin(0).setCrop(0, 0, 24, 24));
        dyn.add(text(h, m.cx + 34, y + 3, c.name, { color: C.darkRed }));
        dyn.add(text(h, m.cx + 34, y + 19, `好感${f}/100`, { color: C.brown }));
        dyn.add(new Button(h, m.cx + m.cw - 118, y + 7, 54, 22, '送礼', () => {
          toast(h, giveGift(s, c.id));
          h.refresh();
          render();
        }, { disabled: giftsLeft(s) <= 0 }));
        dyn.add(new Button(h, m.cx + m.cw - 60, y + 7, 54, 22, '成亲', () => confirm(h, `和${c.name}成亲？`, () => {
          sfx('level');
          toast(h, marry(s, c.id), 2600);
          h.refresh();
          render();
        }, '成亲'), { style: 'red', disabled: f < 100 }));
        y += 40;
      }
      y += 6;
    }
    dyn.add(text(h, m.cx, y, `结拜：默契${M.swornRapport}以上的英才、将才，最多${M.swornMax}个。结拜后忠诚不掉、属性+${Math.round(M.swornMul * 100)}%。`, { wrap: m.cw, color: C.brown }));
    y += 40;
    for (const g of allGenerals(s).filter((x) => x.grade !== '常人')) {
      const why = swornReason(s, g.uid);
      const gg = h.add.graphics();
      frame(gg, m.cx, y, m.cw, 30, 'tan');
      dyn.add(gg);
      dyn.add(text(h, m.cx + 8, y + 8, `${g.name}　默契${g.rapport}${g.sworn ? '　已结拜' : ''}`, { color: g.sworn ? C.red : C.darkBrown }));
      if (!g.sworn) dyn.add(new Button(h, m.cx + m.cw - 60, y + 4, 54, 22, '结拜', () => {
        toast(h, swear(s, g.uid));
        h.refresh();
        render();
      }, { disabled: !!why }));
      y += 34;
      if (y > m.py + m.ph - 40) break;
    }
  };
  render();
}

// ===== 文曲星 =====
export function wenquTalk(h: Host): void {
  const s = store.save;
  const t = wenquToday(s);
  if (t.qi === null) return showDialog(h, [{ who: 'wenquxing', text: `今天的${systems.wenqu.perDay}道题都答完了。你一共答对${s.p3.wenqu.right}题，明天再来。` }]);
  const q = systems.wenqu.questions[t.qi];
  const n = systems.wenqu.perDay - t.left + 1;
  showDialog(h, [{ who: 'wenquxing', text: `第${n}/${systems.wenqu.perDay}题：${q.q}` }], q.a.map((a, k) => ({
    label: a,
    style: 'tan' as const,
    fn: () => {
      const r = answerWenqu(s, t.qi!, k);
      sfx(r.ok ? 'heal' : 'miss');
      toast(h, r.lines.join('\n'), 2200);
      h.refresh();
      if (wenquToday(s).qi !== null) h.time.delayedCall(500, () => wenquTalk(h));
    },
  })));
}

// ===== 幸运王（娱乐场的第三页） =====
export function luckyPanel(h: Host, parent: Phaser.GameObjects.Container, m: Modal, y: number, rerender: () => void): void {
  const s = store.save;
  const L = systems.lucky;
  const used = luckyDraws(s);
  parent.add(text(h, m.cx, y, `幸运值：${s.p3.lucky.luck}　今天抽了${used}/${L.maxDraws}次`, { color: C.darkRed }));
  y += 22;
  parent.add(text(h, m.cx, y, `每天第一次免费，之后每次${L.goldPerDraw}金砖。每抽一次涨幸运值，幸运值上排行榜。`, { wrap: m.cw, color: C.brown }));
  y += 40;
  const cost = luckyCost(s);
  parent.add(new Button(h, m.cx + m.cw / 2 - 80, y, 160, 40, cost ? `抽一次（${cost}金砖）` : '免费抽一次', () => {
    const r = luckyDraw(s);
    sfx('magic');
    toast(h, r, 2200);
    h.refresh();
    rerender();
  }, { style: 'red', disabled: used >= L.maxDraws || s.player.gold < cost }));
}

// ===== 摆摊（跳蚤市场） =====
export function stallPanel(h: Host): void {
  const s = store.save;
  const sold = settleStall(s);
  if (sold.length) toast(h, sold.join('\n'), 2400);
  const m = new Modal(h, '跳蚤市场');
  const dyn = h.add.container(0, 0);
  m.inner.add(dyn);
  let input: HTMLInputElement | null = null;
  m.once('destroy', () => input?.remove());
  const render = () => {
    dyn.removeAll(true);
    input?.remove();
    const st = s.p3.stall;
    let y = m.cy;
    dyn.add(text(h, m.cx, y + 4, '摊名', { color: C.brown }));
    input = overlayInput(h, m.cx + 36, y, 150, 22, st.name || `${s.player.name}的小摊`, 8);
    dyn.add(new Button(h, m.cx + 194, y, 60, 22, '改名', () => {
      toast(h, setStallName(s, input!.value));
      render();
    }));
    y += 30;
    dyn.add(text(h, m.cx, y, `货款：${st.income}两　累计卖出${st.sold}件（市场抽${Math.round(systems.stall.fee * 100)}%）`, { color: C.darkRed }));
    dyn.add(new Button(h, m.cx + m.cw - 60, y - 4, 60, 22, '收钱', () => {
      toast(h, collectStall(s));
      h.refresh();
      render();
    }, { style: 'red', disabled: !st.income }));
    y += 22;
    dyn.add(text(h, m.cx, y, '标价比行情低卖得快，高了没人要。买家每10分钟来一轮，不在线也照样卖（最多算12小时）。', { wrap: m.cw, color: C.brown }));
    y += 36;
    const r = rows(h, m, dyn, y, 52);
    for (const g of st.goods) {
      row(h, r, iconTex(h, g.item), `${items[g.item].name} ×${g.n}`, `标价${g.price}两（行情${fairPrice(g.item)}）`, '下架', () => {
        toast(h, takeOffStall(s, g.item));
        h.refresh();
        render();
      }, { scale: 2 });
    }
    r.area.setContentHeight(r.y);
    dyn.add(new Button(h, m.cx, m.py + m.ph - 40, m.cw, 28, `摆上新货（${st.goods.length}/${systems.stall.slots}）`, () => pickGood(), { style: 'red', disabled: st.goods.length >= systems.stall.slots }));
  };
  const pickGood = () => {
    const pm = new Modal(h, '选要卖的东西', { h: 420 });
    const r = rows(h, pm, pm.inner, pm.cy);
    for (const [id, n] of Object.entries(s.bag)) {
      if (!canSell(id)) continue;
      row(h, r, iconTex(h, id), `${items[id].name} ×${n}`, `行情${fairPrice(id)}两`, '摆上', () => {
        pm.close();
        chooseCount(h, '摆几个？', n, (k) => chooseAmount(h, '每个卖多少两？', fairPrice(id) * 3, (price) => {
          toast(h, putOnStall(s, id, k, price));
          h.refresh();
          render();
        }, 1));
      }, { scale: 2 });
    }
    r.area.setContentHeight(r.y);
  };
  render();
}

// ===== 战场：宝洞 + 抢宝 =====
export function treasurePanel(h: Host, enterCave: () => void): void {
  const s = store.save;
  const m = new Modal(h, '战场', { h: 320 });
  const t = treasureNow(s);
  let y = m.cy;
  m.inner.add(new Button(h, m.cx, y, m.cw, 30, '进入宝洞挖宝', () => {
    m.close();
    enterCave();
  }));
  y += 42;
  m.inner.add(text(h, m.cx, y, `抢宝：每天${systems.treasure.hours.join('点、')}点各开${systems.treasure.minutes}分钟，宝藏埋在野外某处，打赢宝藏守卫就归你。今天还能抢${treasureLeft(s)}次。`, { wrap: m.cw, color: C.brown }));
  y += 56;
  if (t.open && t.at) {
    m.inner.add(text(h, m.cx, y, `宝藏出现在【${locations[t.at].name}】！`, { color: C.red }));
    y += 22;
    m.inner.add(new Button(h, m.cx, y, m.cw, 28, '直接传送过去', () => {
      m.close();
      done(h, treasureTeleport(s));
    }, { style: 'red', disabled: treasureLeft(s) <= 0 }));
  } else {
    m.inner.add(text(h, m.cx, y, `现在没开。下一场：${t.next}`, { color: C.gray }));
  }
}

// 主界面「人物」页里，宝藏点多一行
export function treasureHere(s: Save): boolean {
  const t = treasureNow(s);
  return t.open && t.at === s.location && treasureLeft(s) > 0;
}

export function fightTreasure(h: Host): void {
  fight(h, treasureBattle(store.save, randomSeed()));
}

// ===== 节日（邮件第三页） =====
export function festivalBlock(h: Host, parent: Phaser.GameObjects.Container, m: Modal, y: number, rerender: () => void): void {
  const s = store.save;
  const f = festivalToday();
  if (!f) {
    parent.add(text(h, m.cx, y, '今天不是节日。元旦、春节、元宵、情人节、劳动节、端午、七夕、中秋、国庆、重阳当天有礼包，打怪经验×1.5。', { wrap: m.cw, color: C.brown }));
    return;
  }
  const got = s.p3.festival.includes(festivalKey()!);
  parent.add(text(h, m.cx, y, `今天是${f.name}！打怪经验×${systems.festivals.expMul}。`, { color: C.red }));
  y += 24;
  parent.add(new Button(h, m.cx, y, m.cw, 30, got ? '礼包已领' : `领${f.name}礼包`, () => {
    sfx('level');
    toast(h, claimFestival(s), 2400);
    h.refresh();
    rerender();
  }, { style: 'red', disabled: got }));
}

// ===== 战斗录像 =====
export function replayPanel(h: Host): void {
  const s = store.save;
  const m = new Modal(h, '战斗录像');
  m.inner.add(text(h, m.cx, m.cy, `最近${s.p3.replays.length}场战斗，可以回放。`, { color: C.brown }));
  const r = rows(h, m, m.inner, m.cy + 20);
  s.p3.replays.forEach((rp, i) => {
    const d = new Date(rp.t);
    const when = `${d.getMonth() + 1}-${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    row(h, r, null, rp.title, `${when}　${locations[rp.at]?.name ?? ''}　${rp.rounds.length}回合　${rp.outcome === 'win' ? '胜' : rp.outcome === 'lose' ? '败' : '逃'}`, '回放', () => {
      store.flush();
      h.scene.start('Battle', { replay: s.p3.replays[i] });
    }, { color: rp.outcome === 'win' ? C.darkRed : C.gray });
  });
  r.area.setContentHeight(r.y);
}

// ===== 捕快：交罚银消恶人值 =====
export function evilFine(s: Save): number {
  return evilNow(s) * s.player.level * 5;
}

export function payFine(h: Host): void {
  const s = store.save;
  const fine = evilFine(s);
  if (!fine) return void toast(h, '你清清白白，用不着交罚银');
  confirm(h, `恶人值${s.p3.evil}，交${fine}两罚银就能一笔勾销。`, () => {
    if (s.player.silver < fine) return void toast(h, '银两不够');
    s.player.silver -= fine;
    s.p3.evil = 0;
    done(h, '恶人值清零了');
  }, '交罚银');
}

// 副将详情里用：副将现在的战力（排行榜副将榜同口径）
export function generalPower(uid: string): number {
  const g = findGeneral(store.save, uid);
  if (!g) return 0;
  const st = generalStats(g);
  return Math.round(st.maxHp / 10 + st.atk + st.def + st.spd);
}

export function festivalPending(s: Save): boolean {
  const k = festivalKey();
  return !!k && !s.p3.festival.includes(k);
}
