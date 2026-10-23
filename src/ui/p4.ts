// P4 的界面：国战沙盘（入国、沙盘地图、出征/驻守/单挑守将、战报、战功与官职、战功商店）、军团争霸、跨区大战
import Phaser from 'phaser';
import { C } from '../art/palette';
import { avatarTex, iconTex } from '../art/textures';
import { classes, items, monsters, systems } from '../data';
import type { NationId } from '../data';
import { randomSeed } from '../core/rng';
import {
  claimKuaqu, claimLeague, contestPending, kuaquBattle, kuaquReason, kuaquView, leagueBattle, leagueView,
} from '../game/contest';
import {
  PLAYABLE, attackTargets, buyWithMerit, capitalCover, cityDef, cityReason, citiesOf, claimSalary, claimSeason, defendTargets, gzBattle,
  DAY_BATTLES, battlesToNextDay, calTick, guardOf, joinNation, joinReason, kindOf, nationDef, nationRanks, neighbors, nextRank, ordersLeft,
  rankName, salary, salaryClaimed, shopItemId, syncWorld, turnOf, weekIndex,
} from '../game/guozhan';
import type { GzMode } from '../game/guozhan';
import type { Save } from '../game/state';
import { store } from '../game/store';
import { fit } from './textfit';
import type { Host } from './panels';
import { fight, heroAvatar, row, rows, tabs } from './p3';
import { Button, Modal, confirm, frame, hit, sfx, text, toast } from './widgets';

const G = systems.guozhan;

const natColor = (n: NationId) => nationDef(n).color;

function turnText(t: number): string {
  return `第${Math.floor(t / 24) + 1}天${t % 24}时`;
}

// 功能格上的小红点：有能领的赛季、争霸、跨区奖励
export function guozhanPending(s: Save): boolean {
  if (s.player.level < G.minLevel) return false;
  return contestPending(s);
}

// ===== 入国 =====
function joinPanel(h: Host, after: () => void): void {
  const s = store.save;
  const w = syncWorld(s);
  const m = new Modal(h, s.p4.nation ? '改投别国' : '投奔一国');
  let y = m.cy;
  m.inner.add(text(h, m.cx, y, '三国争天下，洛阳、虎牢关还在董卓余部手里。投奔一国，出征敌城、驻守前线，攒战功升官职。天下历七天一个赛季（每打18仗过一天），按城数排名发奖。', { wrap: m.cw, color: C.darkBrown }));
  y += 70;
  const why = joinReason(s);
  if (why) {
    m.inner.add(text(h, m.cx, y, why, { wrap: m.cw, color: C.red }));
    y += 22;
  }
  const r = rows(h, m, m.inner, y);
  for (const n of PLAYABLE) {
    const d = nationDef(n);
    const cs = citiesOf(w, n);
    row(h, r, avatarTex(h, ['gz_xiahoudun', 'gz_guanyu', 'gz_zhouyu'][PLAYABLE.indexOf(n)]), `${d.full}（${d.ruler}）`, `${cs.length}座城：${cs.slice(0, 3).map((c) => cityDef(c).name).join('、')}${cs.length > 3 ? '…' : ''}`, s.p4.nation === n ? '本国' : '投奔', () => {
      confirm(h, s.p4.nation ? `改投${d.full}？本赛季战功清零，可花的战功折半。` : `投奔${d.full}？入国后${G.player.joinCooldownDays}天内不能改投。`, () => {
        const msg = joinNation(s, n);
        if (msg) toast(h, msg, 2200);
        if (s.p4.nation === n) {
          sfx('level');
          m.close();
          h.refresh();
          after();
        }
      }, '投奔');
    }, { disabled: !!why || s.p4.nation === n, color: natColor(n) });
  }
  r.area.setContentHeight(r.y);
}

// ===== 主面板 =====
let gzTab = 0;
let picked: string | null = null;

export function guozhanPanel(h: Host, tab?: number): void {
  const s = store.save;
  if (s.player.level < G.minLevel) {
    toast(h, `国战${G.minLevel}级开放。军团争霸要先入教派，诸州会武${systems.kuaqu.minLevel}级开放。`, 2400);
    return;
  }
  if (!s.p4.nation) return joinPanel(h, () => guozhanPanel(h, 0));
  if (tab !== undefined) gzTab = tab;
  const m = new Modal(h, `国战 · ${nationDef(s.p4.nation).full}`);
  const dyn = h.add.container(0, 0);
  m.inner.add(dyn);
  const render = () => {
    dyn.removeAll(true);
    tabs(h, m, dyn, ['沙盘', '战报', '战功', '争霸', '会武'], gzTab, (i) => {
      gzTab = i;
      render();
    });
    const y = m.cy + 28;
    if (gzTab === 0) mapTab(h, m, dyn, y, render);
    else if (gzTab === 1) reportTab(h, m, dyn, y);
    else if (gzTab === 2) meritTab(h, m, dyn, y, render);
    else if (gzTab === 3) leagueTab(h, m, dyn, y, render);
    else kuaquTab(h, m, dyn, y, render);
  };
  render();
}

function mapTab(h: Host, m: Modal, dyn: Phaser.GameObjects.Container, y0: number, rerender: () => void): void {
  const s = store.save;
  const w = syncWorld(s);
  const n = s.p4.nation!;
  const t = calTick(s);
  dyn.add(text(h, m.cx, y0, `${rankName(s)}　战功${s.p4.merit}　军令${ordersLeft(s)}/${G.ordersPerDay}`, { color: C.darkRed }));
  dyn.add(text(h, m.cx + m.cw, y0, `第${weekIndex(t) + 1}季${turnText(turnOf(t)).replace(/\d+时$/, '')}·再打${battlesToNextDay(t)}仗到明天`, { align: 'right', color: C.brown }));
  // 沙盘
  const mx = m.cx;
  const my = y0 + 20;
  const mw = m.cw;
  const mh = 250;
  const g = h.add.graphics();
  g.fillStyle(0x2a3a2a).fillRect(mx, my, mw, mh);
  g.lineStyle(1, 0x000000, 0.6).strokeRect(mx, my, mw, mh);
  dyn.add(g);
  const pos = (id: string) => {
    const c = cityDef(id);
    return { x: mx + 16 + (c.x / 100) * (mw - 32), y: my + 14 + (c.y / 100) * (mh - 32) };
  };
  for (const [a, b] of G.links) {
    const p = pos(a);
    const q = pos(b);
    const war = w.cities[a].owner !== w.cities[b].owner;
    g.lineStyle(war ? 2 : 1, war ? 0xd8a040 : 0x8c8c90, war ? 0.9 : 0.6).lineBetween(p.x, p.y, q.x, q.y);
  }
  const atk = attackTargets(s, w);
  const defs = defendTargets(s, w);
  for (const c of G.cities) {
    const p = pos(c.id);
    const st = w.cities[c.id];
    const big = c.kind === 'capital' || c.kind === 'key' || c.kind === 'pass';
    const r = big ? 7 : 5;
    g.fillStyle(0x000000).fillRect(p.x - r - 1, p.y - r - 1, r * 2 + 2, r * 2 + 2);
    g.fillStyle(natColor(st.owner)).fillRect(p.x - r, p.y - r, r * 2, r * 2);
    // 兵力条：方块上沿
    const ratio = Math.max(0, st.troops / kindOf(c.id).max);
    g.fillStyle(0xffffff, 0.85).fillRect(p.x - r, p.y - r, Math.round(r * 2 * ratio), 2);
    if (c.kind === 'capital') g.fillStyle(0xf6d36a).fillRect(p.x - 2, p.y - 2, 4, 4);
    if (st.troops <= 0 && st.owner !== n) g.lineStyle(2, 0xff3020).strokeRect(p.x - r - 3, p.y - r - 3, r * 2 + 6, r * 2 + 6);
    else if (atk.includes(c.id)) g.lineStyle(1, 0xffa040).strokeRect(p.x - r - 3, p.y - r - 3, r * 2 + 6, r * 2 + 6);
    if (picked === c.id) g.lineStyle(2, 0xffffff).strokeRect(p.x - r - 4, p.y - r - 4, r * 2 + 8, r * 2 + 8);
    dyn.add(text(h, p.x, p.y + r + 1, c.name, { align: 'center', color: 0xf0e8d0, stroke: 0x000000 }));
    dyn.add(hit(h, p.x - 18, p.y - 12, 36, 28, () => {
      picked = c.id;
      sfx('click');
      rerender();
    }));
  }
  // 各国城数
  let y = my + mh + 6;
  const ranks = nationRanks(w);
  const qun = citiesOf(w, 'qun').length;
  const standing = [...ranks.map((x) => `${nationDef(x.id).name}${x.cities}城`), `群${qun}城`].join('　');
  dyn.add(text(h, m.cx, y, standing, { color: C.darkBrown }));
  const bt = Object.entries(G.buffs).filter(([id]) => w.cities[id].owner === n).map(([id, b]) => `${cityDef(id).name}${b.text}`);
  y += 18;
  dyn.add(text(h, m.cx, y, bt.length ? `本国占着${bt.join('，')}` : '本国占下洛阳经验+10%、虎牢关银两+10%', { color: bt.length ? C.red : C.gray }));
  y += 22;
  // 选中的城
  const id = picked && w.cities[picked] ? picked : null;
  if (!id) {
    dyn.add(text(h, m.cx, y, '点沙盘上的城看详情。橙框是能出征的敌城，红框是守军打光、守将要出城的城。', { wrap: m.cw, color: C.brown }));
    return;
  }
  const c = cityDef(id);
  const st = w.cities[id];
  const k = kindOf(id);
  const gb = h.add.graphics();
  frame(gb, m.cx, y, m.cw, 96, 'tan');
  dyn.add(gb);
  dyn.add(text(h, m.cx + 8, y + 6, `${c.name}（${k.name}）`, { color: natColor(st.owner), stroke: 0x000000 }));
  dyn.add(text(h, m.cx + m.cw - 8, y + 6, `${nationDef(st.owner).full}　守军${Math.max(0, st.troops)}/${k.max}`, { align: 'right', color: C.darkBrown }));
  const info = text(h, m.cx + 8, y + 24, `守将：${monsters[guardOf(w, id)].name}　接壤：${neighbors(id).map((x) => cityDef(x).name).join('、')}`, { wrap: m.cw - 16, color: C.brown });
  dyn.add(info);
  // 一句当前局势：原主要打回来 / 都城有接应
  const cover = st.owner !== n ? capitalCover(w, id) : [];
  const note = st.owner === n && st.lostBy ? `${nationDef(st.lostBy).full}一心要夺回这座城，兵少了记得驻守`
    : cover.length ? `有${cover.map((x) => cityDef(x).name).join('、')}接应，守军打不光` : '';
  const ny = y + 26 + info.height;
  if (note && ny + 14 <= y + 58) dyn.add(text(h, m.cx + 8, ny, fit(note, m.cw - 16), { color: C.red }));
  const btns: [string, GzMode][] = [];
  if (st.owner !== n && st.troops <= 0) btns.push(['单挑守将', 'boss']);
  else if (atk.includes(id)) btns.push(['出征', 'atk']);
  if (defs.includes(id)) btns.push(['驻守', 'def']);
  if (!btns.length) {
    dyn.add(text(h, m.cx + 8, y + 62, st.owner === n ? '本国后方，不用驻守' : '不和本国接壤，打不到', { color: C.gray }));
    return;
  }
  const bw = Math.floor((m.cw - 16) / btns.length);
  btns.forEach(([label, mode], i) => {
    const why = cityReason(s, w, id, mode);
    dyn.add(new Button(h, m.cx + 8 + i * bw, y + 60, bw - 6, 26, label, () => {
      if (why) return void toast(h, why);
      m.close();
      fight(h, gzBattle(s, id, mode, randomSeed()));
    }, { style: 'red', disabled: !!why }));
  });
}

function reportTab(h: Host, m: Modal, dyn: Phaser.GameObjects.Container, y: number): void {
  const s = store.save;
  const w = syncWorld(s);
  dyn.add(text(h, m.cx, y, `本赛季战报（七天一季，每打${DAY_BATTLES}仗过一天）`, { color: C.darkRed }));
  const r = rows(h, m, dyn, y + 20);
  const list = [...w.events].reverse();
  if (!list.length) {
    r.area.content.add(text(h, 4, 0, '这赛季还没打起来。', { color: C.gray }));
    r.area.setContentHeight(20);
    return;
  }
  let yy = 0;
  for (const e of list) {
    r.area.content.add(text(h, 4, yy, turnText(e.turn), { color: C.brown }));
    const t = text(h, 76, yy, e.text, { wrap: m.cw - 90, color: e.big ? C.red : C.darkBrown });
    r.area.content.add(t);
    yy += Math.max(18, t.height + 4);
  }
  r.area.setContentHeight(yy);
}

function meritTab(h: Host, m: Modal, dyn: Phaser.GameObjects.Container, y: number, rerender: () => void): void {
  const s = store.save;
  const nx = nextRank(s);
  const lines = [
    `官职：${rankName(s)}　累计战功：${s.p4.meritTotal}${nx ? `（${nx.merit}升${nx.name}）` : ''}`,
    `可用战功：${s.p4.merit}　本赛季战功：${s.p4.seasonMerit}（够${G.seasonMinMerit}才有赛季奖励）`,
    `官职加成：每级加气血、攻击、防御（跟着等级涨）`,
  ];
  for (const l of lines) {
    dyn.add(text(h, m.cx, y, l, { wrap: m.cw, color: C.darkBrown }));
    y += 18;
  }
  y += 4;
  const half = Math.floor(m.cw / 2);
  dyn.add(new Button(h, m.cx, y, half - 4, 24, salary(s) ? `领俸禄${salary(s)}两` : '士卒没有俸禄', () => {
    toast(h, claimSalary(s));
    h.refresh();
    rerender();
  }, { style: 'red', disabled: !salary(s) || salaryClaimed(s) }));
  const sc = s.p4.seasonClaim;
  dyn.add(new Button(h, m.cx + half, y, half, 24, sc ? `领上赛季奖励（第${sc.rank}）` : '没有赛季奖励', () => {
    toast(h, claimSeason(s).join('\n'), 2600);
    sfx('level');
    h.refresh();
    rerender();
  }, { style: 'red', disabled: !sc }));
  y += 30;
  dyn.add(text(h, m.cx, y, '战功商店', { color: C.darkRed }));
  y += 18;
  const r = rows(h, m, dyn, y);
  G.shop.forEach((e, i) => {
    const id = shopItemId(s, e.id);
    const name = id === 'gem' ? '随机宝石（按等级）' : items[id].name;
    row(h, r, iconTex(h, id === 'gem' ? 'gem_hongbaoshi_1' : id), name, `${e.cost}战功`, '兑换', () => {
      toast(h, buyWithMerit(s, i));
      h.refresh();
      rerender();
    }, { disabled: s.p4.merit < e.cost });
  });
  r.area.setContentHeight(r.y);
}

function leagueTab(h: Host, m: Modal, dyn: Phaser.GameObjects.Container, y: number, rerender: () => void): void {
  const s = store.save;
  const v = leagueView(s);
  const L = systems.league;
  const claim = s.p4.league.claim;
  if (claim) {
    dyn.add(new Button(h, m.cx, y, m.cw, 24, `领上赛季争霸奖励（第${claim.rank}名）`, () => {
      toast(h, claimLeague(s).join('\n'), 2600);
      sfx('level');
      h.refresh();
      rerender();
    }, { style: 'red' }));
    y += 30;
  }
  if (!s.p3.sect.id) {
    dyn.add(text(h, m.cx, y, `军团争霸是四个教派一个赛季（天下历七天）的循环赛。先入一个教派（${systems.sect.minLevel}级以后去陈留找教派使者）。`, { wrap: m.cw, color: C.brown }));
    return;
  }
  dyn.add(text(h, m.cx, y, `第${v.day + 1}天：对阵${v.foe?.name ?? '-'}，今天还能打${v.left}阵（已赢${v.wins}阵）`, { wrap: m.cw, color: C.darkRed }));
  y += 18;
  dyn.add(text(h, m.cx, y, `每天三阵，你赢得越多本教派越可能拿下这一轮（赢3阵约${Math.round(Math.min(0.95, L.baseP + L.perWin * 3) * 100)}%）。结果第二天揭晓。`, { wrap: m.cw, color: C.brown }));
  y += 36;
  dyn.add(new Button(h, m.cx, y, m.cw, 26, v.left ? `出战第${v.fought + 1}阵` : `今天打完了·再打${v.next}仗到明天`, () => {
    m.close();
    fight(h, leagueBattle(s, randomSeed()));
  }, { style: 'red', disabled: !v.left }));
  y += 34;
  dyn.add(text(h, m.cx, y, '本赛季积分（赢一轮3分）', { color: C.darkRed }));
  y += 18;
  v.table.forEach((r, i) => {
    dyn.add(text(h, m.cx + 8, y, `${i + 1}. ${r.name}`, { color: r.mine ? C.red : C.darkBrown }));
    dyn.add(text(h, m.cx + m.cw - 8, y, `${r.won}胜 ${r.points}分`, { align: 'right', color: C.brown }));
    y += 16;
  });
  y += 6;
  for (const x of v.history) {
    dyn.add(text(h, m.cx + 8, y, `第${x.day + 1}天 对${x.foe}：${x.won ? '胜' : '负'}（你赢了${x.wins}阵）`, { color: x.won ? C.green : C.gray }));
    y += 16;
  }
}

function kuaquTab(h: Host, m: Modal, dyn: Phaser.GameObjects.Container, y: number, rerender: () => void): void {
  const s = store.save;
  const v = kuaquView(s);
  const K = systems.kuaqu;
  const claim = s.p4.kuaqu.claim;
  if (claim) {
    dyn.add(new Button(h, m.cx, y, m.cw, 24, `领上赛季会武奖励（第${claim.rank}名）`, () => {
      toast(h, claimKuaqu(s).join('\n'), 2600);
      sfx('level');
      h.refresh();
      rerender();
    }, { style: 'red' }));
    y += 30;
  }
  const why = kuaquReason(s);
  dyn.add(text(h, m.cx, y, why || `赛季最后两天，和别州高手过招，每赢一场给本州加分。今天还能打${K.fightsPerDay - v.fought.length}场（再打${v.next}仗换一批对手），你共拿${v.points}分。`, { wrap: m.cw, color: why ? C.red : C.darkRed }));
  y += 36;
  dyn.add(text(h, m.cx, y, '各区积分', { color: C.darkRed }));
  y += 18;
  v.scores.forEach((r, i) => {
    dyn.add(text(h, m.cx + 8, y, `${i + 1}. ${r.name}`, { color: r.mine ? C.red : C.darkBrown }));
    dyn.add(text(h, m.cx + m.cw - 8, y, `${r.score}分`, { align: 'right', color: C.brown }));
    y += 16;
  });
  y += 8;
  if (why) return;
  const r = rows(h, m, dyn, y);
  for (const f of v.foes) {
    const done = v.fought.includes(f.idx);
    row(h, r, heroAvatar(h, f.classId, f.gender, f.variant), `${f.server} ${f.name}`, `${f.level}级${classes[f.classId].name}`, done ? '已打' : '挑战', () => {
      m.close();
      fight(h, kuaquBattle(s, f.idx, randomSeed()));
    }, { disabled: done, style: 'red' });
  }
  r.area.setContentHeight(r.y);
}
