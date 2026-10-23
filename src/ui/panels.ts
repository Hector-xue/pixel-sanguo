// 主界面里点开的各个面板：状态/加点/物品/副将/任务/医馆/技能学校/公告/攻略/退出/此地侠客，以及 NPC 对话
import { APP_VERSION, changelogPanel } from './changelog';
import { buzz, canVibrate } from './haptics';
import { PASSIVES } from '../core/passives';
import { XINFA_LEVEL, chooseXinfa, xinfaChoices, xinfaCost, xinfaReason } from '../game/growth';
import { FACTION_NAMES, campMods, campSummary, factionOf } from '../game/camp';
import Phaser from 'phaser';
import { C } from '../art/palette';
import { avatarTex, bustTex, gearTex, heroLookKey, iconTex } from '../art/textures';
import { balance, bountyOptions, classes, items, locations, mainQuests, monsters, npcs, quiz, skills } from '../data';
import { expToNext, skillMp } from '../core/formulas';
import type { Attrs } from '../core/types';
import { ATTR_KEYS, ATTR_NAMES } from '../core/types';
import { gearLines, gearName } from '../core/gear';
import { playerClassName, playersAt } from '../game/chatter';
import { TIERS, chatWith, favorOf, giftValue, giftable, giftsLeftToday, giveGift, likedCat, likedText, tierName, tierOf } from '../game/bond';
import { allGenerals, readXinfa, rerollApt, rewardCost, rewardGeneral, starCost, starUp } from '../game/generals';
import { ringDestination, ringStatusText } from '../game/ring';
import type { AiPlayer } from '../game/chatter';
import { createBattle } from '../core/battle';
import { randomSeed } from '../core/rng';
import { generalUnit, playerUnit } from '../game/encounter';
import { mirrorUnit } from '../game/rivals';
import {
  abandonBounty, acceptBounty, acceptQuest, allocate, bagCap, bagUsed, buy, currentQuest, findGeneral, generalStats, heal,
  advStartLevel, healCost, learnSkill, log, moveToInn, moveToTeam, npcMark, playerAttrs, playerStats, profCap, questDestination,
  questProgressText, quickRecover, releaseGeneral, sell, sellPrice, serialize, skillSchool,
  targetHpMp, turnInBounty, turnInQuest, upgradeSkill, useItem, skillLevelText, DEPLOY_LEVELS, deploySlots, deployedUids, isDeployed, toggleDeploy } from '../game/state';
import { generalRebirth, generalRebirthReason } from '../game/rebirth';
import type { Target } from '../game/state';
import { store } from '../game/store';
import { today, tomorrowHint } from '../game/calendar';
import { cloudPanel } from './cloud';
import { forgetSlot, isApp } from '../game/cloud';
import { checkUpdateNow } from './update';
import type { ChatBox } from './chat';
import { fillText, showDialog } from './dialog';
import { digTalk, generalSkillPanel, pickGeneral, recruitPanel, ringTalk, useMisc } from './fun';
import { equipGrid, gearDetail, power, rolePanel } from './role';
import * as X from './p3';
import { Button, Modal, ScrollArea, W, bar, bigFits, confirm, fitText, frame, setHelpOpener, sfx, tabFade, text, textLines, toast } from './widgets';
import { SPEEDS, TRACK_IDS, TRACK_NAMES, VOLUME_NAMES, saveSettings, settings } from './settings';
import type { TrackPick } from './settings';
import { previewMusic } from './audio';
import type { TrackId } from './audio';

export interface Host extends Phaser.Scene {
  refresh(): void;
  chat: ChatBox;
  autoPath(dest: string): void;
}

export function done(h: Host, msg?: string): void {
  if (msg) toast(h, msg);
  h.refresh();
}

export function section(m: Modal, y: number, title: string): number {
  const g = m.scene.add.graphics();
  frame(g, m.cx, y, m.cw, 18, 'tan');
  m.inner.add(g);
  m.inner.add(text(m.scene, m.cx + 6, y + 3, title, { color: C.darkRed }));
  return y + 22;
}

export function kv(m: Modal, x: number, y: number, k: string, v: string | number, color: number = C.darkBrown): void {
  m.inner.add(text(m.scene, x, y, `${k}：`, { color: C.brown }));
  m.inner.add(text(m.scene, x + (k.length + 1) * 12, y, String(v), { color }));
}

export function notYet(h: Host, name: string, why: string): void {
  toast(h, `${name}：${why}`);
}

// ===== 状态：新版角色面板（信息、属性、装备、战力、生平） =====
export function statusPanel(h: Host): void {
  rolePanel(h);
}

// ===== 分配属性点 =====
export function allocatePanel(h: Host): void {
  const s = store.save;
  const add: Attrs = { con: 0, str: 0, int: 0, agi: 0 };
  const m = new Modal(h, '分配属性点', { h: 420 });
  const dyn = h.add.container(0, 0);
  m.inner.add(dyn);
  const render = () => {
    dyn.removeAll(true);
    const used = ATTR_KEYS.reduce((n, k) => n + add[k], 0);
    const left = s.player.free - used;
    const base = playerAttrs(s);
    const preview = { ...s, player: { ...s.player, added: { ...s.player.added } } };
    for (const k of ATTR_KEYS) preview.player.added[k] += add[k];
    const now = playerStats(s);
    const next = playerStats(preview);
    dyn.add(text(h, m.cx + m.cw / 2, m.cy, `剩余点数：${left}`, { align: 'center', color: left ? C.red : C.brown, scale: 2 }));
    ATTR_KEYS.forEach((k, i) => {
      const y = m.cy + 36 + i * 44;
      const g = h.add.graphics();
      frame(g, m.cx, y, 196, 40, 'tan');
      dyn.add(g);
      dyn.add(text(h, m.cx + 6, y + 6, ATTR_NAMES[k], { color: C.darkRed }));
      dyn.add(text(h, m.cx + 6, y + 22, `${base[k]}${add[k] ? ` +${add[k]}` : ''}`, { color: add[k] ? C.green : C.darkBrown }));
      dyn.add(new Button(h, m.cx + 62, y + 9, 26, 22, '-', () => {
        if (add[k] > 0) add[k]--;
        render();
      }, { disabled: add[k] <= 0 }));
      dyn.add(new Button(h, m.cx + 92, y + 9, 26, 22, '+', () => {
        if (left > 0) add[k]++;
        render();
      }, { disabled: left <= 0 }));
      dyn.add(new Button(h, m.cx + 122, y + 9, 68, 22, '分配全部', () => {
        add[k] += left;
        render();
      }, { disabled: left <= 0 }));
    });
    const rows: [string, number, number][] = [['气血', now.maxHp, next.maxHp], ['精力', now.maxMp, next.maxMp], ['攻击', now.atk, next.atk], ['防御', now.def, next.def], ['速度', now.spd, next.spd], ['负重', now.carry, next.carry]];
    const rx = m.cx + 204;
    const g2 = h.add.graphics();
    frame(g2, rx, m.cy + 36, m.cw - 204, 172, 'paper');
    dyn.add(g2);
    rows.forEach(([k, a, b], i) => {
      dyn.add(text(h, rx + 6, m.cy + 44 + i * 27, k, { color: C.brown }));
      dyn.add(text(h, rx + 40, m.cy + 44 + i * 27, `${b}`, { color: b > a ? C.green : C.darkBrown }));
    });
    dyn.add(text(h, m.cx, m.cy + 222, '体质→气血、防御　力量→攻击、负重\n智力→精力　敏捷→速度\n智力不加技能伤害', { wrap: m.cw, color: C.gray }));
    dyn.add(new Button(h, m.cx, m.py + m.ph - 34, 140, 26, '重新分配', () => {
      for (const k of ATTR_KEYS) add[k] = 0;
      render();
    }));
    dyn.add(new Button(h, m.cx + m.cw - 140, m.py + m.ph - 34, 140, 26, '确认分配', () => {
      if (!used) return toast(h, '还没有加点');
      confirm(h, `确定这样分配吗？分配后不能更改。`, () => {
        allocate(s, add);
        m.close();
        done(h, '属性点已分配');
      });
    }, { style: 'red', disabled: !used }));
  };
  render();
}

// ===== 选择用药对象 =====
export function chooseTarget(h: Host, title: string, onPick: (t: Target) => void): void {
  const s = store.save;
  const list: Target[] = ['player', ...s.generals.map((g) => g.uid)];
  const m = new Modal(h, title, { h: 60 + list.length * 40, w: 280 });
  list.forEach((t, i) => {
    const c = targetHpMp(s, t)!;
    const y = m.cy + i * 40;
    m.inner.add(new Button(h, m.cx, y, m.cw, 36, '', () => {
      m.close();
      onPick(t);
    }));
    m.inner.add(text(h, m.cx + 8, y + 4, c.name, { color: C.darkRed }));
    m.inner.add(bar(h, m.cx + 100, y + 6, 140, 7, c.hp / c.maxHp, C.red, C.darkRed));
    m.inner.add(bar(h, m.cx + 100, y + 20, 140, 7, c.mp / c.maxMp, C.lightBlue, C.navy));
    m.inner.add(text(h, m.cx + 8, y + 19, `${c.hp}/${c.maxHp}`, { color: C.brown }));
  });
}

export function chooseCount(h: Host, title: string, max: number, onPick: (n: number) => void): void {
  const m = new Modal(h, title, { w: 280, h: 110 });
  [1, 5, 10, 20].forEach((n, i) => {
    m.inner.add(new Button(h, m.cx + i * 66, m.cy + 10, 60, 30, `${n}个`, () => {
      m.close();
      onPick(n);
    }, { disabled: n > max }));
  });
}

// 选银两数额：常用档位 + 全部
export function chooseAmount(h: Host, title: string, max: number, onPick: (n: number) => void, min = 1): void {
  const opts = [100, 500, 1000, 5000, 10000, 50000, 100000].filter((n) => n >= min && n <= max);
  const m = new Modal(h, title, { w: 300, h: 92 + Math.ceil((opts.length + 1) / 4) * 34 });
  m.inner.add(text(h, m.cx, m.cy, `最多${max}`, { color: C.brown }));
  [...opts, max].forEach((n, i) => {
    const label = i === opts.length ? '全部' : n >= 10000 ? `${n / 10000}万` : String(n);
    m.inner.add(new Button(h, m.cx + (i % 4) * 70, m.cy + 20 + Math.floor(i / 4) * 34, 64, 28, label, () => {
      m.close();
      onPick(n);
    }, { disabled: n < min || n <= 0 }));
  });
}

// ===== 物品（背包） =====
let bagTab = 'drug';
export function bagPanel(h: Host): void {
  const s = store.save;
  const m = new Modal(h, '物品');
  const tabs: [string, string][] = [['mine', '我的装备'], ['drug', '药品'], ['equip', '装备'], ['ore', '矿石'], ['misc', '杂物']];
  const dyn = h.add.container(0, 0);
  m.inner.add(dyn);
  const render = () => {
    dyn.removeAll(true);
    dyn.add(text(h, m.cx, m.cy, `负重 ${bagUsed(s)}/${bagCap(s)}`, { color: bagUsed(s) >= bagCap(s) ? C.red : C.brown }));
    dyn.add(new Button(h, m.cx + m.cw - 80, m.cy - 4, 80, 22, '快速恢复', () => {
      const r = quickRecover(s);
      h.refresh();
      toast(h, r);
      render();
    }, { style: 'red' }));
    const bw = Math.floor(m.cw / tabs.length);
    tabs.forEach(([id, name], i) => dyn.add(new Button(h, m.cx + i * bw, m.cy + 22, bw - 2, 22, name, () => {
      bagTab = id;
      render();
    }, { style: bagTab === id ? 'dark' : 'tan' })));
    if (bagTab === 'mine') {
      equipGrid(h, m, m.cy + 52, render, dyn);
      dyn.add(text(h, m.cx, m.cy + 52 + 3 * 54 + 6, '点格子看详情、卸下。武器店买1级装备，铁匠铺打造更高级的。', { wrap: m.cw, color: C.gray }));
      return;
    }
    const area = new ScrollArea(h, m.cx, m.cy + 50, m.cw, m.ph - 90, dyn);
    let y = 0;
    if (bagTab === 'equip') {
      for (const g of s.gear) {
        const bg = h.add.graphics();
        frame(bg, 0, y, m.cw - 6, 34, 'tan');
        area.content.add(bg);
        area.content.add(h.add.image(6, y + 5, gearTex(h, g.slot, g.tier, g.cls)).setOrigin(0).setScale(2));
        area.content.add(text(h, 36, y + 3, `${gearName(g)}（不绑定）`, { color: g.q ? C.purple : C.darkBrown }));
        area.content.add(text(h, 36, y + 18, `${g.tier}级 ${gearLines(g).slice(0, 2).join(' ')}`, { color: C.brown }));
        area.content.add(new Button(h, m.cw - 58, y + 6, 48, 22, '装备', () => gearDetail(h, g, render), { clip: area }));
        y += 38;
      }
      if (!s.gear.length) area.content.add(text(h, 4, 4, '背包里没有装备。许昌的武器店卖1级装备，铁匠铺能打造。', { wrap: m.cw - 8, color: C.gray }));
      area.setContentHeight(y);
      return;
    }
    const ids = Object.keys(s.bag).filter((id) => items[id] && (items[id].cat === bagTab || (bagTab === 'ore' && items[id].cat === 'gem')));
    for (const id of ids) {
      const def = items[id];
      const g = h.add.graphics();
      frame(g, 0, y, m.cw - 6, 34, 'tan');
      area.content.add(g);
      area.content.add(h.add.image(6, y + 5, iconTex(h, id)).setOrigin(0).setScale(2));
      area.content.add(text(h, 36, y + 3, `${def.name}${def.quest ? '（任务）' : '（不绑定）'}`, { color: C.darkBrown }));
      const eff = [def.hp ? `气血+${def.hp}` : '', def.mp ? `精力+${def.mp}` : '', def.gem ? '去铁匠铺镶到装备上' : '', def.desc ?? ''].filter(Boolean).join(' ');
      area.content.add(fitText(h, 36, y + 18, `×${s.bag[id]}  ${eff}`, m.cw - 36 - (def.use || def.cat === 'drug' ? 66 : 12), { color: C.brown }, area));
      if (def.use) {
        area.content.add(new Button(h, m.cw - 58, y + 6, 48, 22, '使用', () => useMisc(h, id, render), { clip: area }));
      }
      if (def.cat === 'drug') {
        area.content.add(new Button(h, m.cw - 58, y + 6, 48, 22, '使用', () => {
          chooseTarget(h, `使用${def.name}`, (t) => {
            const r = useItem(s, id, t);
            h.refresh();
            toast(h, r);
            render();
          });
        }, { clip: area }));
      }
      y += 38;
    }
    if (!ids.length) area.content.add(text(h, 4, 4, '这一栏是空的。', { color: C.gray }));
    area.setContentHeight(y);
  };
  render();
}

// ===== 副将 =====
let genTab: 'team' | 'inn' = 'team';
export function generalsPanel(h: Host): void {
  const s = store.save;
  const m = new Modal(h, '副将', { help: '副将' });
  const dyn = h.add.container(0, 0);
  m.inner.add(dyn);
  const render = () => {
    dyn.removeAll(true);
    dyn.add(new Button(h, m.cx, m.cy, 100, 22, `随行(${s.generals.length}/${balance.followerMax})`, () => {
      genTab = 'team';
      render();
    }, { style: genTab === 'team' ? 'dark' : 'tan' }));
    dyn.add(new Button(h, m.cx + 104, m.cy, 100, 22, `馆驿(${s.inn.length})`, () => {
      genTab = 'inn';
      render();
    }, { style: genTab === 'inn' ? 'dark' : 'tan' }));
    const list = genTab === 'team' ? s.generals : s.inn;
    list.forEach((g, i) => {
      const y = m.cy + 30 + i * 40;
      dyn.add(new Button(h, m.cx, y, m.cw - 56, 36, '', () => {
        m.close();
        generalDetail(h, g.uid);
      }));
      dyn.add(h.add.image(m.cx + 4, y + 6, avatarTex(h, g.look)).setOrigin(0).setCrop(0, 0, 24, 24));
      dyn.add(text(h, m.cx + 32, y + 4, `（${g.level}）${g.name}`, { color: C.darkRed }));
      const fc = factionOf(g);
      const pv = g.recruitId ? PASSIVES[g.recruitId] : undefined;
      dyn.add(text(h, m.cx + 32, y + 19, `${g.grade} · ${classes[g.classId].name}${fc ? ` · ${FACTION_NAMES[fc]}` : ''}${pv ? ` · ${pv.name}` : ''}`, { color: C.brown }));
      if (genTab === 'team') {
        const active = isDeployed(s, g.uid);
        dyn.add(new Button(h, m.cx + m.cw - 50, y + 6, 50, 24, active ? '战' : '休', () => {
          const r = toggleDeploy(s, g.uid);
          if (r.includes('满')) toast(h, r);
          h.refresh();
          render();
        }, { style: active ? 'red' : 'tan' }));
      } else {
        dyn.add(new Button(h, m.cx + m.cw - 50, y + 6, 50, 24, '随行', () => {
          const r = moveToTeam(s, g.uid);
          h.refresh();
          toast(h, r);
          render();
        }));
      }
    });
    // 随行的羁绊
    if (genTab === 'team' && list.length) {
      let yy = m.cy + 36 + list.length * 40;
      const bonds = campSummary(s);
      dyn.add(text(h, m.cx, yy, bonds.length ? '羁绊' : '羁绊：随行里带上同阵营的武将（魏蜀吴群），或者二乔、刘备旧部、吕布旧部，就有加成', { wrap: m.cw, color: C.darkRed }));
      yy += bonds.length ? 18 : 34;
      for (const bd of bonds) {
        dyn.add(text(h, m.cx + 6, yy, `${bd.on ? '●' : '○'} ${bd.label}  ${bd.desc}`, { wrap: m.cw - 10, color: bd.on ? C.green : C.gray }));
        yy += 18;
      }
    }
    if (!list.length) dyn.add(text(h, m.cx + 4, m.cy + 36, genTab === 'team' ? '还没有副将。\n在野外把怪物打到残血，用「招降」收服。新手任务里赵云会教你。' : '馆驿里没有副将。随行满3个后，再招降的会自动放到这里。', { wrap: m.cw - 8, color: C.gray }));
    dyn.add(text(h, m.cx, m.py + m.ph - 40, `「战」：每场战斗带它上场，现在有${deploySlots(s)}个出战位${deploySlots(s) < DEPLOY_LEVELS.length ? `（${DEPLOY_LEVELS[deploySlots(s)]}级再开一个）` : ''}；其余随行副将在战斗中用「招将」换上。`, { wrap: m.cw, color: C.gray }));
  };
  render();
}

export function generalDetail(h: Host, uid: string): void {
  const s = store.save;
  const g = findGeneral(s, uid);
  if (!g) return;
  const st = generalStats(g);
  const inTeam = s.generals.includes(g);
  const m = new Modal(h, '副将详情');
  const L = m.cx + 4;
  const R = m.cx + m.cw / 2 + 4;
  let y = m.cy;
  const fg = h.add.graphics();
  frame(fg, L - 4, y, 52, 52, 'tan');
  m.inner.add(fg);
  m.inner.add(h.add.image(L - 2, y + 2, avatarTex(h, g.look)).setOrigin(0).setScale(2));
  m.inner.add(text(h, L + 56, y + 4, g.name, { color: C.darkRed, scale: 2 }));
  m.inner.add(text(h, L + 56, y + 34, `ID ${g.uid.slice(1).padStart(5, '0')} · ${inTeam ? (isDeployed(s, uid) ? '参战' : '休息') : '馆驿'}`, { color: C.brown }));
  y += 58;
  y = section(m, y, '基本');
  kv(m, L, y, '头衔', g.grade);
  kv(m, R, y, '星级', `${g.star}星`);
  y += 16;
  kv(m, L, y, '职业', `${g.level}级${classes[g.classId].name}`);
  kv(m, R, y, '转数', `${g.level}级(${g.reborn ?? 0}转)`);
  y += 16;
  kv(m, L, y, '战力', power(st), C.red);
  y += 16;
  kv(m, L, y, '升级还需经验', expToNext(g.level) - g.exp);
  y += 16;
  kv(m, L, y, '默契度', g.rapport);
  kv(m, R, y, '忠诚', `${g.loyalty}/100`);
  y += 22;
  y = section(m, y, '资质');
  kv(m, L, y, '成长', g.apt.growth.toFixed(2));
  kv(m, R, y, '体质', g.apt.con.toFixed(2));
  y += 16;
  kv(m, L, y, '力量', g.apt.str.toFixed(2));
  kv(m, R, y, '智力', g.apt.int.toFixed(2));
  y += 16;
  kv(m, L, y, '敏捷', g.apt.agi.toFixed(2));
  y += 22;
  y = section(m, y, '属性');
  kv(m, L, y, '气血', `${g.hp}/${st.maxHp}`);
  kv(m, R, y, '精力', `${g.mp}/${st.maxMp}`);
  y += 16;
  kv(m, L, y, '攻击', st.atk);
  kv(m, R, y, '防御', st.def);
  y += 16;
  kv(m, L, y, '速度', st.spd);
  y += 16;
  kv(m, L, y, '技能', g.skills.length ? g.skills.map((k) => `${skills[k.id].name}${skillLevelText(k.level)}`).join('、') : g.grade === '常人' ? '无（常人不能学技能）' : '无（10级后能学）');
  y += 22;
  // 专属被动、阵营、眼下吃到的羁绊
  const pv = g.recruitId ? PASSIVES[g.recruitId] : undefined;
  const fc = factionOf(g);
  const cm = campMods(s, g);
  y = section(m, y, '被动与羁绊');
  m.inner.add(text(h, L, y, pv ? `「${pv.name}」${pv.desc}` : '没有专属被动（名将才有）', { wrap: m.cw - 8, color: pv ? C.darkRed : C.gray }));
  y += pv && pv.desc.length > 18 ? 32 : 16;
  kv(m, L, y, '阵营', fc ? FACTION_NAMES[fc] : '无');
  kv(m, R, y, '羁绊', cm.tags.length ? cm.tags.join('、') : '无');
  const by = m.py + m.ph - 92;
  const reopen = () => {
    m.close();
    h.refresh();
    generalDetail(h, uid);
  };
  const sc = starCost(g);
  const btns: [string, () => void][] = [
    ['升星', () => confirm(h, g.star >= balance.general.starMax ? '已经满星了' : `升到${g.star + 1}星要：副将${sc.level}级、将军令×${sc.tokens}、${sc.silver}两。每颗星加4%气血攻击防御速度。`, () => {
      toast(h, starUp(s, uid));
      reopen();
    }, '升星')],
    ['迅速升级', () => {
      const books = ['xinfa1', 'xinfa2', 'xinfa3'].filter((b) => (s.bag[b] ?? 0) > 0);
      if (!books.length) return toast(h, '迅速升级要用心法书（常人心法、高级心法、特级心法），跑环、宝箱、江湖行记都会给');
      const mm = new Modal(h, '用哪本心法书', { w: 280, h: 60 + books.length * 36 });
      books.forEach((b, i) => mm.inner.add(new Button(h, mm.cx, mm.cy + i * 36, mm.cw, 30, `${items[b].name}×${s.bag[b]}（经验+${items[b].amount}）`, () => {
        mm.close();
        toast(h, readXinfa(s, uid, b), 2000);
        reopen();
      })));
    }],
    ['奖赏', () => {
      toast(h, rewardGeneral(s, uid));
      reopen();
    }],
    ['洗资质', () => confirm(h, `用1个将军令重洗${g.name}的五项资质（成长、体质、智力、力量、敏捷）？结果随机，可能变差。你有${s.bag.jiangjunling ?? 0}个将军令。`, () => {
      toast(h, rerollApt(s, uid), 2000);
      reopen();
    }, '洗')],
    ['学技能', () => {
      m.close();
      generalSkillPanel(h, uid);
    }],
    ['转生', () => {
      const why = generalRebirthReason(s, uid);
      if (why) return toast(h, `${why}（也可以去洛阳找左慈）`);
      confirm(h, `花1个大将军令让${g.name}转生？成长+0.1，可以继续升到160级。`, () => {
        toast(h, generalRebirth(s, uid), 2200);
        reopen();
      }, '转生');
    }],
  ];
  if (inTeam) {
    btns.push([isDeployed(s, uid) ? '休息' : '出战', () => {
      const r = toggleDeploy(s, uid);
      m.close();
      done(h, r);
    }]);
    btns.push(['去馆驿', () => {
      const r = moveToInn(s, uid);
      m.close();
      done(h, r);
    }]);
  } else {
    btns.push(['随行', () => {
      const r = moveToTeam(s, uid);
      m.close();
      done(h, r);
    }]);
  }
  const per = 4;
  const bw = Math.floor((m.cw - (per - 1) * 4) / per);
  btns.forEach(([name, fn], i) => m.inner.add(new Button(h, m.cx + (i % per) * (bw + 4), by + Math.floor(i / per) * 30, bw, 26, name, fn)));
  m.inner.add(text(h, m.cx, by - 18, `奖赏${rewardCost(g)}两加10忠诚；忠诚低于60打仗会不听指挥`, { color: C.gray }));
  m.inner.add(new Button(h, m.cx, by + 60, m.cw, 24, '放生', () => confirm(h, `确定放生${g.name}吗？放生后就找不回来了。`, () => {
    const r = releaseGeneral(s, uid);
    m.close();
    done(h, r);
  }, '放生'), { style: 'red' }));
}

// ===== 任务 =====
export function questPanel(h: Host): void {
  const s = store.save;
  const m = new Modal(h, '任务');
  const q = currentQuest(s);
  let y = m.cy;
  const chapter = q?.chapter ?? '许昌篇';
  y = section(m, y, `主线 · ${chapter}`);
  const inCh = mainQuests.filter((x) => (x.chapter ?? '新手任务') === chapter);
  const done2 = inCh.filter((x) => mainQuests.indexOf(x) < s.main.step).length;
  m.inner.add(text(h, m.cx + 4, y, `进度 ${done2}/${inCh.length}`, { color: C.brown }));
  y += 18;
  if (!q || s.main.state === 'done') {
    m.inner.add(text(h, m.cx + 4, y, '许昌篇都完成了！陈留在 P3 开放。跑环、挖宝、娱乐场可以接着玩。', { wrap: m.cw - 8, color: C.green }));
    y += 40;
  } else {
    const g = h.add.graphics();
    frame(g, m.cx, y, m.cw, 150, 'tan');
    m.inner.add(g);
    m.inner.add(text(h, m.cx + 8, y + 6, q.title, { color: C.darkRed, scale: 2 }));
    m.inner.add(text(h, m.cx + 8, y + 36, '任务提示：', { color: C.brown }));
    m.inner.add(text(h, m.cx + 68, y + 36, s.main.state === 'available' ? `去找${npcs[q.giver].name}接任务` : fillText(q.hint), { wrap: m.cw - 80 }));
    m.inner.add(text(h, m.cx + 8, y + 72, '任务要求：', { color: C.brown }));
    m.inner.add(text(h, m.cx + 68, y + 72, questProgressText(s), { wrap: m.cw - 80, color: s.main.state === 'ready' ? C.red : C.darkBrown }));
    const r = q.reward;
    const rw = [r.exp ? `经验${r.exp}` : '', r.silver ? `银两${r.silver}` : '', ...Object.entries(r.items ?? {}).map(([id, n]) => `${items[id].name}×${n}`)].filter(Boolean).join('、');
    m.inner.add(text(h, m.cx + 8, y + 108, '任务奖励：', { color: C.brown }));
    m.inner.add(text(h, m.cx + 68, y + 108, rw, { wrap: m.cw - 80, color: C.darkRed }));
    y += 156;
    const dest = questDestination(s);
    m.inner.add(new Button(h, m.cx, y, m.cw, 28, dest ? `开启寻路 → ${locations[dest].name}` : '开启寻路', () => {
      if (!dest) return;
      m.close();
      h.autoPath(dest);
    }, { style: 'red', disabled: !dest }));
    y += 36;
  }
  y = section(m, y, '支线 · 跑环');
  const ringText = ringStatusText(s);
  m.inner.add(text(h, m.cx + 4, y, ringText, { wrap: m.cw - 70, color: s.ring.task ? C.darkBrown : C.gray }));
  const rd = ringDestination(s);
  if (rd) m.inner.add(new Button(h, m.cx + m.cw - 60, y - 2, 60, 22, '寻路', () => {
    m.close();
    h.autoPath(rd);
  }, { style: 'red' }));
  y += Math.max(20, textLines(ringText, m.cw - 70)) + 6;
  y = section(m, y, '支线 · 赏金猎人');
  if (s.bounty) {
    const o = bountyOptions.find((b) => b.id === s.bounty!.id)!;
    const where = npcs.bukuai.bounty?.includes(o.id) ? '新手村' : '许昌';
    m.inner.add(text(h, m.cx + 4, y, `悬赏令：打败${monsters[o.monster].name} ${s.bounty.count}/${o.count}，赏银${o.silver}两。${s.bounty.count >= o.count ? `已完成，回${where}找捕快领赏。` : ''}`, { wrap: m.cw - 8 }));
  } else {
    m.inner.add(text(h, m.cx + 4, y, '没有进行中的悬赏令。新手村和许昌的捕快那里可以接。', { wrap: m.cw - 8, color: C.gray }));
  }
}

// ===== 医馆 =====
export function hospitalPanel(h: Host): void {
  const s = store.save;
  const m = new Modal(h, '医馆');
  const dyn = h.add.container(0, 0);
  m.inner.add(dyn);
  const render = (mode: 'buy' | 'sell') => {
    dyn.removeAll(true);
    const cost = healCost(s);
    dyn.add(new Button(h, m.cx, m.cy, m.cw, 30, cost ? `治疗（${cost}两）` : '治疗（10级以前免费）', () => {
      const r = heal(s);
      h.refresh();
      toast(h, r);
      sfx('heal');
      render(mode);
    }, { style: 'red' }));
    dyn.add(text(h, m.cx, m.cy + 38, `银两：${s.player.silver}　负重：${bagUsed(s)}/${bagCap(s)}`, { color: C.brown }));
    const area = new ScrollArea(h, m.cx, m.cy + 58, m.cw, m.ph - 130, dyn);
    let y = 0;
    const ids = mode === 'buy' ? Object.keys(items).filter((id) => items[id].cat === 'drug' && !items[id].cook) : Object.keys(s.bag).filter((id) => !items[id].quest && sellPrice(id) > 0);
    for (const id of ids) {
      const def = items[id];
      const g = h.add.graphics();
      frame(g, 0, y, m.cw - 6, 34, 'tan');
      area.content.add(g);
      area.content.add(h.add.image(6, y + 5, iconTex(h, id)).setOrigin(0).setScale(2));
      area.content.add(text(h, 36, y + 3, def.name, { color: C.darkBrown }));
      const eff = def.hp ? `回血${def.hp}` : def.mp ? `回精力${def.mp}` : def.desc ?? '';
      area.content.add(text(h, 36, y + 18, mode === 'buy' ? `${eff}　${def.price}两` : `×${s.bag[id]}　回收价${sellPrice(id)}两`, { color: C.brown }));
      area.content.add(new Button(h, m.cw - 58, y + 6, 48, 22, mode === 'buy' ? '购买' : '回收', () => {
        if (mode === 'buy') {
          chooseCount(h, `购买${def.name}（${def.price}两）`, Math.floor(s.player.silver / def.price), (n) => {
            toast(h, buy(s, id, n));
            h.refresh();
            render(mode);
          });
        } else {
          chooseCount(h, `回收${def.name}`, s.bag[id] ?? 0, (n) => {
            toast(h, sell(s, id, n));
            h.refresh();
            render(mode);
          });
        }
      }, { clip: area }));
      y += 38;
    }
    if (!ids.length) area.content.add(text(h, 4, 4, '没有可以回收的东西。', { color: C.gray }));
    area.setContentHeight(y);
    dyn.add(new Button(h, m.cx, m.py + m.ph - 34, m.cw, 26, mode === 'buy' ? '药品回收' : '返回买药', () => render(mode === 'buy' ? 'sell' : 'buy')));
  };
  render('buy');
}

// ===== 技能学校 =====
export function skillSchoolPanel(h: Host): void {
  const s = store.save;
  const m = new Modal(h, '技能学校', { help: '技能' });
  const area = new ScrollArea(h, m.cx, m.cy, m.cw, m.py + m.ph - 12 - m.cy, m.inner);
  const render = () => {
    area.content.removeAll(true);
    const add = (o: Phaser.GameObjects.GameObject) => area.content.add(o);
    let y = 0;
    add(text(h, 0, y, `本职业：${classes[s.player.classId].name}。学技能、升技能都免费。`, { wrap: m.cw, color: C.brown }));
    y += 20;
    const rows = skillSchool(s);
    rows.forEach((row, i) => {
      // 头三个是本职业的老技能，后两个是 30 级专属、100 级绝学
      if (i === 3) {
        add(text(h, 0, y + 2, '进阶招式（学会时直接从3级、5级起步）', { color: C.darkRed }));
        y += 20;
      }
      const def = skills[row.id];
      const hgt = 26 + textLines(def.desc, m.cw - 80, 2) + 18;
      const g = h.add.graphics();
      frame(g, 0, y, m.cw, hgt, 'tan');
      add(g);
      const lv = row.state ? skillLevelText(row.state.level) : '未学习';
      add(text(h, 8, y + 6, `${def.name}${def.short ? `（${def.short}）` : ''}`, { color: C.darkRed }));
      add(text(h, 8 + 12 * (def.name.length + (def.short ? 3 : 0)) + 8, y + 6, lv, { color: row.state ? C.green : C.gray }));
      add(text(h, 8, y + 24, def.desc, { wrap: m.cw - 80, lineGap: 2 }));
      const info = row.state ? `熟练度 ${row.state.prof}/${profCap(row.state.level)}　耗精力${skillMp(def.mp, row.state.level)}` : `${def.learnLevel}级可学　耗精力${skillMp(def.mp, advStartLevel(row.id))}`;
      add(text(h, 8, y + hgt - 18, info, { color: C.brown }));
      if (row.action) {
        add(new Button(h, m.cw - 64, y + 8, 56, 24, row.action === 'learn' ? '学习' : row.state && row.state.level >= balance.skill.maxLevel ? '入化境' : '升级', () => {
          const r = row.action === 'learn' ? learnSkill(s, row.id) : upgradeSkill(s, row.id);
          h.refresh();
          toast(h, r);
          sfx('level');
          render();
        }, { style: 'red', clip: area }));
      } else {
        add(text(h, m.cw - 8, y + 12, row.reason, { align: 'right', color: C.gray }));
      }
      y += hgt + 4;
    });
    // 心法：60 级二选一，转职后成「·极」
    add(text(h, 0, y + 2, `心法（${XINFA_LEVEL}级二选一，转职后升成「·极」）`, { color: C.darkRed }));
    y += 20;
    for (const id of xinfaChoices(s)) {
      const key = s.p3.reborn ? `${id}_ji` : id;
      const pv = PASSIVES[key];
      const on = s.player.xinfa === id;
      const hgt = 26 + textLines(pv.desc, m.cw - 80, 2);
      const g = h.add.graphics();
      frame(g, 0, y, m.cw, hgt, on ? 'red' : 'tan');
      add(g);
      add(text(h, 8, y + 6, `${pv.name}${on ? '（正在修）' : ''}`, { color: on ? 0xfff0c0 : C.darkRed }));
      add(text(h, 8, y + 24, pv.desc, { wrap: m.cw - 80, lineGap: 2, color: on ? 0xe8d8b0 : C.darkBrown }));
      const why = xinfaReason(s, id);
      if (!why) {
        const cost = xinfaCost(s);
        add(new Button(h, m.cw - 64, y + 8, 56, 24, cost ? '改修' : '修习', () => {
          const go = () => {
            toast(h, chooseXinfa(s, id), 3000);
            sfx('level');
            h.refresh();
            render();
          };
          if (cost) confirm(h, `改修【${pv.name}】要${cost}银两，原来那门就不修了。`, go, '改修');
          else go();
        }, { style: 'red', clip: area }));
      } else if (!on) {
        add(text(h, m.cw - 8, y + 12, why, { align: 'right', color: C.gray }));
      }
      y += hgt + 4;
    }
    add(text(h, 0, y + 2, `熟练度够了回来升级，升级后熟练度不清零。人物每${balance.skill.roleLevelPerSkillLevel}级可以多升一级技能。`, { wrap: m.cw, color: C.gray }));
    y += 36;
    ['副将技能学习', '副将技能升级'].forEach((name, i) => add(new Button(h, i * (m.cw / 2 + 2), y, m.cw / 2 - 2, 26, name, () => {
      const list = allGenerals(s).filter((g) => g.grade !== '常人');
      if (!list.length) return toast(h, '常人副将不能学技能。去许昌找招贤使者招英才、将才');
      pickGeneral(h, name, list, (g) => generalSkillPanel(h, g.uid));
    }, { clip: area })));
    y += 32;
    area.setContentHeight(y);
  };
  render();
}

// ===== 公告（系统消息） =====
export function messagesPanel(h: Host): void {
  const s = store.save;
  const m = new Modal(h, '公告 · 系统消息');
  m.inner.add(new Button(h, m.cx, m.cy, m.cw, 24, `战斗录像（最近${s.p3.replays.length}场）`, () => X.replayPanel(h), { style: 'red' }));
  const area = new ScrollArea(h, m.cx, m.cy + 30, m.cw, m.ph - 70, m.inner);
  let y = 0;
  const list = s.messages.filter((x) => x.ch === 'sys').slice(-100);
  for (const msg of list) {
    const d = new Date(msg.t);
    const body = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}  ${msg.text}`;
    area.content.add(text(h, 2, y, body, { wrap: m.cw - 10, color: C.purple, lineGap: 2 }));
    y += textLines(body, m.cw - 10, 2) + 4;
  }
  area.setContentHeight(y);
  area.scrollToBottom();
}

// ===== 攻略 =====
setHelpOpener((scene, topic) => helpPanel(scene as Host, topic));

// 攻略分五页；topic 给了就翻到那一页、滚到那一条并标红（弹窗右上角的「？」用）
const HELP_TABS: [string, string[]][] = [
  ['入门', ['战斗', '速战', '招降', '招将', '中计', '中毒', '前后排', '加点', '医馆', '寻路', '存档', '设置', '安卓版']],
  ['成长', ['技能', '心法', '装备', '宝石', '坐骑', '体力丹', '化境', '转职', '跑环', '二环三环', '训练', '宝库', '阵法']],
  ['副将', ['副将', '名将', '羁绊', '馆驿', '婚姻结拜', '组队']],
  ['日常', ['每天', '福利', '抢宝', '银两环', '文曲星', '娱乐场', '挖宝', '摆摊', '生活', '徽章', '教派', '擂台', '演武塔', '成就称号', '录像']],
  ['国战', ['国战', '战功官职', '军团争霸', '诸州会武']],
];
let helpTab = 0;

export function helpPanel(h: Host, topic?: string): void {
  const tips = [
    '【战斗】每回合先给主角下指令，再给出战副将下指令，各有60秒。点「自动」后，每个人重复上一次的招式（精力不够就普攻）。',
    '【速战】10级以后，比你低10级以上的普通怪，怪物卡上多出「速战」「连战10场」：跳过动画直接出结果，经验、银两、掉落、任务进度照算；血少于四成、打输或换了地方就停。头目、名将要亲自打，速战也不招降。',
    '【招降】把怪物打到残血再招降，成功率高得多；你比它等级高也更容易。历史名将不能招降。招降成功后变成常人副将。',
    '【招将】战斗中主角可以用「招将」把出战副将换成另外的随行副将。',
    '【中计】乱：随机攻击场上目标，可能打自己人。封：无法行动。围：不能普攻和放技能，能用道具，挨打就醒。',
    '【中毒】巫蛊极毒能叠加，每回合开始时先结算，之后每回合是第一回合的一半。',
    '【技能】放技能涨熟练度，熟练度满了去技能学校手动升级，升级后熟练度不清零。30级能学一个按性别不同的专属招式（直接3级起步），100级能学本职业的绝学（直接5级起步）。',
    '【心法】60级在技能学校修一门心法，每个职业两门二选一（武士：血战、不动如山；文人：养气、智囊；异人：通玄、诡道），头一回免费，以后改修要花银两；转职后心法升成「·极」，效果再加一半。',
    '【加点】体质加气血和防御；力量加攻击和负重；智力加精力，不加技能伤害；敏捷加速度，速度快先出手。',
    '【前后排】敌人前排没倒下之前，普攻打不到后排；技能不受影响。',
    '【医馆】10级以前治疗免费。背包满了（负重）就买不了药、捡不了东西。',
    '【寻路】「功能 → 任务」里点「开启寻路」，会自动走到任务地点。',
    '【装备】六个部位：头、项链、武器、护腕、铠甲、靴子。许昌武器店只卖1级的；10/20/30/40级可以在铁匠铺用矿石+银两打2～5级装备，有机会出精良。三块低级矿石能合成一块高级的。',
    '【宝石】2级以上装备有孔。钻石加抗物理、暴击、速度；绿宝石加抗围困、抗风沙、反击；红宝石加抗扰乱、抗妖火、致命；蓝宝石加抗封锁、抗落雷、体质。三颗同级合成一颗高一级的。',
    '【副将】招贤使者那里用将军令招英才、大将军令招将才、令牌招指定的人。英才和将才10级后能学技能，学了哪个职业的技能就变成哪个职业。忠诚低于60打仗会不听指挥；随行的副将每打30场忠诚掉5点，记得奖赏。心法书能让副将迅速升级。',
    '【名将】赵云、大乔、小乔、陈登这些招来的名将各有一个专属被动（副将详情里能看），剧情和国战里的吕布、关羽、诸葛亮也有。被动触发时头顶会飘金字。',
    '【羁绊】随行里同阵营（魏蜀吴群）的带两个攻防+5%、三个+10%；二乔同行气血上限+10%，刘备旧部速度+10%，吕布旧部攻击+8%。',
    '【跑环】20级以后找许昌的跑环使者，一环10个任务，跑完一整环给技能书。中途放弃要从这一档的第一环重新跑。',
    '【福利】江湖行记：七件事做到了就能领奖，最后一件送大乔。战备补给：每打10场仗攒一份，最多攒3份。',
    '【体力丹】战斗外服下，你和出战副将的气血精力全满。',
    '【坐骑】军马场买马骑上，加速度和抗扰乱、抗封锁、抗围困。马骑着打仗会升级。',
    '【挖宝】许昌「设施 → 战场」进宝洞，找宝洞老人买铲子挖宝，第3、6、9铲有护宝守卫。',
    '【娱乐场】赤壁：押魏、蜀、吴其中一方，押中的按比例分全部奖池，押的人越少赔率越高。猜猜看：三个锦囊选一个，猜中2.5倍，可以接着猜。押好了自己擂鼓开战，当场结算。',
    '【馆驿】寄存物品不占负重；还能传送到去过的城镇。钱庄存钱有利息，还能换金砖去商城买东西。',
    '【存档】自动保存在这个浏览器里。换手机、清缓存前，在「功能 → 设置」里导出存档，或者登录云存档上传；新设备在标题页点「云存档」下载。',
    '【二环三环】40级开二环（第11–20环）、60级开三环（第21–30环），在跑环使者那里选。',
    '【化境】技能5级熟练度满30000、人物90级以后，去技能学校升一次就入化境，威力再涨一截。',
    '【转职】100级以后去洛阳找左慈，重选性别、职业、头像，属性点退回重加；不转职等级停在100。副将100级也能转生（花大将军令）。',
    '【教派】34级以后去陈留找教派使者入教，做教派任务攒声望（不限次数）；声望高了升职位，教派加成更大。',
    '【阵法】「功能 → 阵法」布阵：长蛇、锋矢、鱼鳞、鹤翼、八卦，按等级解锁，首尾相克。怪物卡上能看到对面列的阵，克住它全队攻击再加一成。',
    '【徽章】每个地方的地上都藏着一枚印，隔几秒反一下光，点到就收下。集齐10、25、45枚和全部各有大礼，舆图上能看到哪里还没找到。',
    '【生活】河边钓鱼、山洞采矿、树林采药：场景里闪光的地方点一下，看准时机点。城镇灶台做菜，药膳管几场战斗的加成。',
    '【擂台】陈留、濮阳、洛阳、长安有擂台：擂台是主角排位，斗将台是副将单挑，决斗场抢江湖侠客的银两（欺负弱的涨恶人值，恶人值每打一仗消一点，也能找捕快交罚银消掉）。',
    '【训练】「功能 → 训练」挑一员不出战的副将随军操练：你每打赢一仗，他分到你这一仗经验的一半。',
    '【宝库】「功能 → 宝库」是金砖商城：将军令、大将军令、心法书、宝箱都在这里买；「武将」页能看每位英才、将才的资质和属性；「仓库」页随时存取东西，花金砖扩容。',
    '【设置】「功能 → 设置」能调背景音乐和音效的音量、各场合放哪首、画面大小（长屏手机能放大一成）、战斗动画速度（正常、1.5倍、2倍）、要不要沿用上一仗的自动战斗、暴击震屏、手机振动；导出存档、云存档、回到标题也在这里。设置只记在这台设备上。安卓 App 里按返回键先关最上面的弹窗，主界面按两次才退出；出了新版会提醒一次，设置最下面也能点「检查更新」。',
    '【每天】擂台、抢宝、银两环、文曲星、幸运王、送礼这些「每天几次」都按天下历的天算：你每打18仗过一天，用完了去打几仗就到明天，不用等真实的明天。',
    '【抢宝】天下历每天9时、15时各开一阵（各三仗的工夫），宝藏埋在野外，「设施 → 战场」能直接传送过去，打赢宝藏守卫就归你，每天3次。',
    '【银两环】40级以后去庐江（谯郡往下）找庐江都尉，打庐江逃兵追回军资换银两，一天3次。',
    '【文曲星】许昌的文曲星每天出5道三国题，答对有经验和银两。',
    '【摆摊】许昌「设施 → 跳蚤市场」摆摊，你每打一仗来一轮NPC买家；标价低卖得快。',
    '【婚姻结拜】洛阳的月老：送礼攒好感，满100成亲（加气血）；默契50以上的英才、将才可以结拜。',
    '【组队】「功能 → 组队」或濮阳的佣兵头领那里雇AI队友，跟你一起打20场。',
    '【录像】「功能 → 公告」里能回放最近8场战斗。',
    '【成就称号】角色面板里看成就、换称号；排行榜在「功能 → 排行」。',
    '【国战】60级以后「功能 → 国战」投奔魏、蜀、吴其中一国。日子按天下历走：你每打一仗天下走一格，18 仗算一天，各国 AI 跟着补兵、打邻城；七天一个赛季，按城数排名发奖。你每天有8道军令（用完了去别处打几仗就到明天）：出征打和本国接壤的敌城削守军，驻守前线补兵；守军打光后守将出城，单挑赢了这座城就归本国（守将战不用军令；打光后一天之内对方补不上兵、别国也不来抢，过了这天就补回来）。另外两国也有玩家天天出征，专削本国前线兵少的城，记得分军令驻守；你夺来的城，原主会一心打回去。敌国都城还有自家的城接壤时守军打不光，要先拔掉周边。一国只剩两座城时成了哀兵，守得更硬。本国占着洛阳经验+10%，占着虎牢关银两+10%。沙盘上出了大事（要地易主、攻破都城、一国只剩两城、一国势大引来合纵），打完仗回来谋士会来报。国战打得越顺，各国越提防你：赢一仗「敌军戒备」+1、输一仗−3，戒备越高敌军越强、越常有敌国名人带队，战功也多给（沙盘左下角能看到）。',
    '【战功官职】出征、驻守、斩将都给战功：累计战功升官职（士卒到大将军），官职越高加的属性越多、每天俸禄越多；可用战功在「国战 → 战功」里换将军令、宝石、矿石。',
    '【军团争霸】入了教派就能打：四个教派一个赛季的循环赛（和国战同一套天下历），每天一轮，你替本教派打三阵，赢的阵越多本教派越可能赢这一轮。下个赛季按积分领奖。',
    '【演武塔】80级以后在「功能 → 擂台 → 演武塔」一层层往上打：第1层是80级的守兵，每层高1级、再强一点，每10层有名将把守。回满血上阵、不带药；打赢不耗次数，每天能输3次；每层第一次打赢给银两、经验，每5层多一个高级宝箱，每10层多一枚将军令或大将军令。',
    '【诸州会武】80级以后，每个赛季的第六、七天在「国战 → 会武」和兖州、徐州的高手过招，赢了给本州加分，下个赛季按三州的名次领奖。',
    '【安卓版】安卓手机在标题页点「下载安卓版」装 App，可以离线玩；存档和网页版是分开的，用云存档互相同步。',
  ];
  const byKey = new Map(tips.map((x) => [x.slice(1, x.indexOf('】')), x]));
  if (topic) helpTab = Math.max(0, HELP_TABS.findIndex(([, ks]) => ks.includes(topic)));
  const m = new Modal(h, '攻略');
  const dyn = h.add.container(0, 0);
  m.inner.add(dyn);
  const render = (focus?: string) => {
    dyn.removeAll(true);
    const bw = Math.floor(m.cw / HELP_TABS.length);
    HELP_TABS.forEach(([name], i) => dyn.add(new Button(h, m.cx + i * bw, m.cy, bw - 2, 22, name, () => {
      const was = helpTab;
      helpTab = i;
      render();
      if (i !== was) tabFade(h, dyn);
    }, { style: i === helpTab ? 'dark' : 'tan' })));
    const area = new ScrollArea(h, m.cx, m.cy + 30, m.cw, m.py + m.ph - 16 - m.cy - 30, dyn);
    let y = 0;
    let at = 0;
    // 分页里列出的在前；没归到哪页的（以后新加的）放到「日常」最后，不会丢
    const listed = new Set(HELP_TABS.flatMap(([, ks]) => ks));
    const keys = [...HELP_TABS[helpTab][1], ...(HELP_TABS[helpTab][0] === '日常' ? [...byKey.keys()].filter((k) => !listed.has(k)) : [])];
    for (const k of keys) {
      const tx = byKey.get(k);
      if (!tx) continue;
      if (k === focus) {
        at = y;
        const g = h.add.graphics();
        g.fillStyle(0xe8c890, 0.6).fillRect(0, y - 3, m.cw - 6, textLines(tx, m.cw - 10, 3) + 6);
        area.content.add(g);
      }
      area.content.add(text(h, 2, y, tx, { wrap: m.cw - 10, lineGap: 3, color: k === focus ? C.darkRed : undefined }));
      y += textLines(tx, m.cw - 10, 3) + 8;
    }
    area.setContentHeight(y);
    if (focus) area.setScroll(Math.max(0, at - 6));
  };
  render(topic);
}

// ===== 退出（存档管理） =====
// 设置：声音、战斗、存档（原来的「退出」也并在这里）
export function settingsPanel(h: Host): void {
  const m = new Modal(h, '设置', { h: 510, w: 300 });
  const dyn = h.add.container(0, 0);
  m.inner.add(dyn);
  const render = () => {
    dyn.removeAll(true);
    const st = settings();
    let y = m.cy + 2;
    const head = (t: string) => {
      dyn.add(text(h, m.cx, y, t, { color: C.darkRed }));
      y += 20;
    };
    // 一行选项：左边名字，右边一排按钮，选中的是红的
    const pick = (label: string, names: string[], at: number, fn: (i: number) => void) => {
      dyn.add(text(h, m.cx, y + 5, label, { color: C.darkBrown }));
      const x0 = m.cx + 70;
      const bw = Math.floor((m.cw - 70 - (names.length - 1) * 4) / names.length);
      names.forEach((n, i) => dyn.add(new Button(h, x0 + i * (bw + 4), y, bw, 22, n, () => {
        fn(i);
        sfx('click');
        render();
      }, { style: i === at ? 'red' : 'tan' })));
      y += 30;
    };
    head('声音');
    pick('背景音乐', VOLUME_NAMES, st.music, (i) => saveSettings({ music: i }));
    pick('音效', VOLUME_NAMES, st.sfx, (i) => saveSettings({ sfx: i }));
    const changed = Object.keys(st.tracks).length;
    dyn.add(text(h, m.cx, y + 5, '选曲', { color: C.darkBrown }));
    dyn.add(new Button(h, m.cx + 70, y, m.cw - 70, 22, changed ? `各场合放哪首（改了${changed}处）` : '各场合放哪首', () => musicPanel(h, render)));
    y += 30;
    // 屏幕不够长（16:9 那种）放大不了，不给这一项
    if (bigFits() || W < 360) pick('画面大小', ['标准', '放大'], W < 360 ? 1 : 0, (i) => {
      if ((i === 1) === (W < 360)) return;
      confirm(h, i === 1 ? '画面放大一成（字、按钮、人物都大一点），要重新打开一次页面。' : '换回标准大小，要重新打开一次页面。', () => {
        saveSettings({ big: i === 1 });
        store.flush();
        location.reload();
      }, '重新打开');
    });
    y += 6;
    head('战斗');
    pick('动画速度', SPEEDS.map((v) => (v === 1 ? '正常' : `${v}倍`)), SPEEDS.indexOf(st.speed), (i) => saveSettings({ speed: SPEEDS[i] }));
    pick('自动战斗', ['每仗手动', '沿用上一仗'], st.keepAuto ? 1 : 0, (i) => saveSettings({ keepAuto: i === 1 }));
    pick('暴击震屏', ['开', '关'], st.shake ? 0 : 1, (i) => saveSettings({ shake: i === 0 }));
    if (canVibrate()) pick('手机振动', ['开', '关'], st.vibrate ? 0 : 1, (i) => {
      saveSettings({ vibrate: i === 0 });
      buzz('medium');
    });
    y += 6;
    head('存档');
    const half = Math.floor((m.cw - 6) / 2);
    dyn.add(new Button(h, m.cx, y, half, 28, '导出存档', () => {
      store.flush();
      const s = store.save;
      const blob = new Blob([serialize(s)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `像素三国-${s.player.name}-${s.player.level}级.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      toast(h, '存档文件已下载');
    }));
    dyn.add(new Button(h, m.cx + half + 6, y, half, 28, '云存档', () => {
      m.close();
      cloudPanel(h, true, () => h.scene.restart());
    }, { style: 'red' }));
    y += 36;
    dyn.add(new Button(h, m.cx, y, half, 28, '换存档位', () => {
      store.flush();
      h.scene.start('Title', { slots: true });
    }));
    dyn.add(new Button(h, m.cx + half + 6, y, half, 28, '回到标题', () => {
      store.flush();
      h.scene.start('Title');
    }));
    y += 36;
    dyn.add(new Button(h, m.cx, y, m.cw, 28, `删除存档${'一二三'[store.slot]}（${store.save.player.name}）`, () => confirm(h, '删除后无法恢复，确定吗？建议先导出。', () => {
      forgetSlot(store.slot);
      store.clear();
      h.scene.start('Title');
    }, '删除'), { style: 'red' }));
    y += 38;
    dyn.add(text(h, m.cx, y + 5, `版本 ${APP_VERSION}`, { color: C.gray }));
    dyn.add(new Button(h, m.cx + m.cw - 80, y, 80, 22, '更新记录', () => changelogPanel(h)));
    if (isApp()) dyn.add(new Button(h, m.cx + m.cw - 166, y, 80, 22, '检查更新', () => checkUpdateNow(h)));
    y += 30;
    dyn.add(text(h, m.cx, y, '游戏和设置都自动存在这台设备上。', { wrap: m.cw, color: C.gray }));
  };
  render();
}

// 选曲：每个场合放原曲、换成别的某首，或者关掉；点一下换一首并当场试听
function musicPanel(h: Host, onDone: () => void): void {
  const done = () => {
    previewMusic(null, true);
    onDone();
  };
  const m = new Modal(h, '选曲', { w: 300, onClose: done });
  const dyn = h.add.container(0, 0);
  m.inner.add(dyn);
  const label = (scene: TrackId, v: TrackPick) => (v === 'off' ? '关（不放音乐）' : v === scene ? `原曲` : `换成「${TRACK_NAMES[v]}」`);
  const render = () => {
    dyn.removeAll(true);
    const st = settings();
    let y = m.cy + 2;
    if (st.music === 0) {
      dyn.add(text(h, m.cx, y, '背景音乐现在关着，先在设置里把音量调起来才听得到。', { wrap: m.cw, color: C.red }));
      y += 36;
    }
    for (const scene of TRACK_IDS) {
      const v = st.tracks[scene] ?? scene;
      dyn.add(text(h, m.cx, y + 5, TRACK_NAMES[scene], { color: C.darkBrown }));
      dyn.add(new Button(h, m.cx + 84, y, m.cw - 84, 22, label(scene, v), () => {
        // 原曲 → 其他各首 → 关 → 原曲
        const order: TrackPick[] = [scene, ...TRACK_IDS.filter((x) => x !== scene), 'off'];
        const next = order[(order.indexOf(v) + 1) % order.length];
        const tracks = { ...st.tracks };
        if (next === scene) delete tracks[scene];
        else tracks[scene] = next;
        saveSettings({ tracks });
        previewMusic(next === 'off' ? null : next);
        render();
      }, { style: v === scene ? 'tan' : 'red' }));
      y += 28;
    }
    y += 4;
    dyn.add(new Button(h, m.cx, y, m.cw, 26, '全部恢复原曲', () => {
      saveSettings({ tracks: {} });
      previewMusic(null, true);
      render();
    }, { disabled: !Object.keys(st.tracks).length }));
    y += 34;
    dyn.add(text(h, m.cx, y, '点一下换一首，当场试听；关掉这个窗口回到眼下这一处的曲子。', { wrap: m.cw, color: C.gray }));
  };
  render();
}

// ===== 此地侠客 =====
export function playersPanel(h: Host): void {
  const s = store.save;
  const list = playersAt(s.location);
  const m = new Modal(h, `此地侠客（${list.length}）`);
  const area = new ScrollArea(h, m.cx, m.cy, m.cw, m.ph - 40, m.inner);
  list.forEach((pl, i) => {
    const y = i * 38;
    area.content.add(new Button(h, 0, y, m.cw - 100, 34, '', () => playerDetail(h, pl), { clip: area }));
    area.content.add(h.add.image(4, y + 5, avatarTex(h, heroLookKey(pl.classId, pl.gender), pl.variant)).setOrigin(0).setCrop(0, 0, 24, 24));
    area.content.add(text(h, 32, y + 4, pl.name, { color: C.darkRed }));
    area.content.add(text(h, 32, y + 18, `${pl.level}级${playerClassName(pl)}`, { color: C.brown }));
    area.content.add(new Button(h, m.cw - 96, y + 6, 42, 22, '队', () => X.teamPanel(h), { clip: area }));
    area.content.add(new Button(h, m.cw - 50, y + 6, 42, 22, '看', () => playerDetail(h, pl), { clip: area }));
  });
  area.setContentHeight(list.length * 38);
}

export function playerDetail(h: Host, pl: AiPlayer): void {
  const m = new Modal(h, '侠客', { h: 320, w: 300 });
  const fg = h.add.graphics();
  frame(fg, m.cx, m.cy, 52, 52, 'tan');
  m.inner.add(fg);
  m.inner.add(h.add.image(m.cx + 2, m.cy + 2, avatarTex(h, heroLookKey(pl.classId, pl.gender), pl.variant)).setOrigin(0).setScale(2));
  m.inner.add(text(h, m.cx + 60, m.cy + 4, pl.name, { color: C.darkRed, scale: 2 }));
  m.inner.add(text(h, m.cx + 60, m.cy + 34, `${pl.level}级${playerClassName(pl)}`, { color: C.brown }));
  const lines = ['四海为家，路过此地。', '听说前面不太平，正要去看看。', '想切磋两招？点到为止。', '江湖路远，多交个朋友。'];
  m.inner.add(text(h, m.cx, m.cy + 64, `「${lines[pl.name.length % lines.length]}」`, { wrap: m.cw, color: C.darkBrown }));
  m.inner.add(new Button(h, m.cx, m.cy + 136, m.cw / 2 - 4, 28, '切磋', () => sparWith(h, pl), { style: 'red' }));
  m.inner.add(new Button(h, m.cx + m.cw / 2 + 4, m.cy + 136, m.cw / 2 - 4, 28, '雇他同行', () => X.teamPanel(h)));
}

// 切磋：和此地的侠客打一场，不掉经验不掉血
function sparWith(h: Host, pl: AiPlayer): void {
  const s = store.save;
  const allies = [playerUnit(s)];
  const reserve = [];
  const dep = deployedUids(s);
  for (const g of s.generals) {
    const u = generalUnit(g);
    if (dep.includes(g.uid) && u.alive) allies.push(u);
    else reserve.push(u);
  }
  for (const u of [...allies, ...reserve]) {
    u.hp = u.maxHp;
    u.mp = u.maxMp;
    u.alive = true;
  }
  const b = createBattle({ seed: randomSeed(), allies, reserve, enemies: [mirrorUnit('e0', pl.name, pl.classId, pl.gender, pl.variant, pl.level, 'enemy')], items: {}, title: `切磋·${pl.name}`, spar: true, canFlee: true });
  store.flush();
  h.scene.start('Battle', { battle: b });
}

// ===== NPC 对话 =====
export function talkTo(h: Host, npcId: string): void {
  const s = store.save;
  const q = currentQuest(s);
  const mark = npcMark(s, npcId);
  if (q && mark === '!') {
    showDialog(h, q.accept, [
      { label: '接过来', fn: () => {
        acceptQuest(s);
        h.refresh();
        toast(h, `接受任务：${q.title}`);
        if (npcMark(s, npcId) === '?') talkTo(h, npcId);
      } },
      { label: '返回', fn: () => {} },
    ]);
    return;
  }
  if (q && mark === '?') {
    showDialog(h, q.finish, [], () => {
      const r = turnInQuest(s);
      if (r) {
        const got = [r.exp ? `经验${r.exp}` : '', r.silver ? `银两${r.silver}` : '', ...Object.entries(r.items).map(([id, n]) => `${items[id].name}×${n}`)].filter(Boolean).join('、');
        sfx(r.lines.some((l) => l.includes('升到')) ? 'level' : 'heal');
        toast(h, [`完成任务：${q.title}`, `获得${got}`, ...r.lines].join('\n'), 2200);
      }
      h.refresh();
      if (npcMark(s, npcId) === '!') h.time.delayedCall(400, () => talkTo(h, npcId));
    });
    return;
  }
  const n = npcs[npcId];
  const lines = n.lines.map((t) => ({ who: npcId, text: t }));
  if (q && s.main.state === 'active' && q.giver === npcId) lines.push({ who: npcId, text: `任务提示：${q.hint}` });
  const opts = [];
  if (n.quiz) opts.push({ label: '答题', fn: () => quizRound(h, npcId) });
  if (n.bounty) opts.push({ label: '悬赏令', fn: () => bountyPanel(h, npcId) });
  if (n.recruit) opts.push({ label: '招贤', fn: () => recruitPanel(h) });
  if (n.ring) opts.push({ label: '跑环', fn: () => ringTalk(h) });
  if (n.dig) opts.push({ label: '挖宝', fn: () => digTalk(h) });
  if (n.sect) opts.push({ label: '教派', fn: () => X.sectTalk(h) });
  if (n.rebirth) opts.push({ label: '转职', fn: () => X.rebirthTalk(h) });
  if (n.silverRing) opts.push({ label: '军资', fn: () => X.silverRingTalk(h) });
  if (n.mercenary) opts.push({ label: '雇队友', fn: () => X.teamPanel(h) });
  if (n.marriage) opts.push({ label: '婚姻', fn: () => X.marriageTalk(h) });
  if (n.wenqu) opts.push({ label: '答题', fn: () => X.wenquTalk(h) });
  if (n.bounty && s.p3.evil > 0) opts.push({ label: '交罚银', fn: () => X.payFine(h) });
  opts.push({ label: '闲聊', fn: () => chatNpc(h, npcId) });
  opts.push({ label: `送礼（${tierName(s, npcId)} ${favorOf(s, npcId)}）`, fn: () => giftPanel(h, npcId) });
  opts.push({ label: '告辞', fn: () => {} });
  showDialog(h, lines, opts);
}

// 闲聊：每天第一次涨点好感，顺带听个传闻
function chatNpc(h: Host, npcId: string): void {
  const s = store.save;
  const r = chatWith(s, npcId);
  store.commit();
  showDialog(h, [{ who: npcId, text: r.text }], [], () => {
    toast(h, [r.first ? `好感+${r.gain}（${tierName(s, npcId)}）` : '今天已经聊过了', ...r.lines].join('\n'), r.lines.length ? 2600 : 1400);
    h.refresh();
  });
}

function giftPanel(h: Host, npcId: string): void {
  const s = store.save;
  const n = npcs[npcId];
  const m = new Modal(h, `送礼给${n.name}`);
  const dyn = h.add.container(0, 0);
  m.inner.add(dyn);
  const render = () => {
    dyn.removeAll(true);
    const v = favorOf(s, npcId);
    const t = tierOf(v);
    const next = TIERS[t + 1];
    dyn.add(h.add.image(m.cx + 4, m.cy + 74, bustTex(h, n.look)).setOrigin(0, 1).setScale(1));
    dyn.add(text(h, m.cx + 72, m.cy + 4, `交情：${TIERS[t].name}（${v}）`, { color: C.darkRed }));
    dyn.add(bar(h, m.cx + 72, m.cy + 22, m.cw - 80, 7, next ? (v - TIERS[t].at) / (next.at - TIERS[t].at) : 1, C.red, C.darkRed));
    dyn.add(text(h, m.cx + 72, m.cy + 34, next ? `再${next.at - v}点到「${next.name}」，到了会回赠谢礼` : '已是莫逆之交', { color: C.brown }));
    dyn.add(text(h, m.cx + 72, m.cy + 50, `偏好：${likedText(npcId)}　今天还能送${giftsLeftToday(s, npcId)}次`, { color: C.brown }));
    const r = X.rows(h, m, dyn, m.cy + 82);
    const ids = giftable(s).sort((a, b) => giftValue(b) - giftValue(a));
    if (!ids.length) dyn.add(text(h, m.cx, m.cy + 90, '行囊里没有能送的东西。', { color: C.gray }));
    for (const id of ids) {
      const liked = items[id].cat === likedCat(npcId);
      X.row(h, r, iconTex(h, id), `${items[id].name} ×${s.bag[id]}`, `好感+${giftValue(id) * (liked ? 2 : 1)}${liked ? '　正合心意' : ''}`, '送', () => {
        const res = giveGift(s, npcId, id);
        store.commit();
        sfx(res.ok ? 'heal' : 'miss');
        toast(h, [res.ok ? `好感+${res.gain}${res.liked ? '（正合心意）' : ''}` : res.lines[0], ...(res.ok ? res.lines : [])].join('\n'), res.lines.length > 0 && res.ok ? 2600 : 1400);
        h.refresh();
        render();
      }, { disabled: giftsLeftToday(s, npcId) <= 0, color: liked ? C.darkRed : C.darkBrown, scale: 2 });
    }
    r.area.setContentHeight(r.y);
  };
  render();
}

function quizRound(h: Host, npcId: string): void {
  const s = store.save;
  if (s.quiz.day !== today(s)) s.quiz = { day: today(s), answered: [] };
  if (s.quiz.answered.length >= 3) {
    showDialog(h, [{ who: npcId, text: `今天的题都答过啦。${tomorrowHint(s)}，到时候再来陪我说说话吧。` }]);
    return;
  }
  const left = quiz.questions.map((_, i) => i).filter((i) => !s.quiz.answered.includes(i));
  const qi = left[Math.floor(Math.random() * left.length)];
  const qq = quiz.questions[qi];
  showDialog(h, [{ who: npcId, text: `考考你：${qq.q}（今天第${s.quiz.answered.length + 1}/3题）` }], qq.a.map((ans, k) => ({
    label: ans,
    style: 'tan' as const,
    fn: () => {
      s.quiz.answered.push(qi);
      if (k === qq.ok) {
        s.player.silver += quiz.reward;
        log(s, `答对了貂蝉的题，获得银两${quiz.reward}`);
        sfx('heal');
        toast(h, `答对了！获得银两${quiz.reward}`);
      } else {
        toast(h, `答错了，正确答案是「${qq.a[qq.ok]}」`);
      }
      h.refresh();
    },
  })));
}

function bountyPanel(h: Host, npcId: string): void {
  const s = store.save;
  const m = new Modal(h, '悬赏令', { h: 280 });
  if (s.bounty) {
    const o = bountyOptions.find((b) => b.id === s.bounty!.id)!;
    const fin = s.bounty.count >= o.count;
    m.inner.add(text(h, m.cx, m.cy, `你手上的悬赏令：打败${o.count}个${monsters[o.monster].name}，赏银${o.silver}两。\n进度：${s.bounty.count}/${o.count}`, { wrap: m.cw }));
    m.inner.add(new Button(h, m.cx, m.cy + 60, m.cw, 28, '交令领赏', () => {
      const r = turnInBounty(s);
      m.close();
      if (fin) sfx('heal');
      done(h, r);
    }, { style: 'red', disabled: !fin }));
    m.inner.add(new Button(h, m.cx, m.cy + 96, m.cw, 28, '放弃悬赏令', () => confirm(h, '放弃后进度清零，确定吗？', () => {
      const r = abandonBounty(s);
      m.close();
      done(h, r);
    })));
    return;
  }
  m.inner.add(text(h, m.cx, m.cy, '选一张悬赏令，一次只能接一张：', { color: C.brown }));
  bountyOptions.filter((o) => npcs[npcId].bounty?.includes(o.id)).forEach((o, i) => {
    const y = m.cy + 22 + i * 40;
    m.inner.add(new Button(h, m.cx, y, m.cw, 34, '', () => {
      const r = acceptBounty(s, o.id);
      m.close();
      done(h, r);
    }));
    m.inner.add(text(h, m.cx + 10, y + 10, `打败${o.count}个${monsters[o.monster].name}`, { color: C.darkRed }));
    m.inner.add(text(h, m.cx + m.cw - 10, y + 10, `赏银${o.silver}两`, { align: 'right', color: C.darkRed }));
  });
  m.inner.add(text(h, m.cx, m.cy + 150, npcId === 'bukuai' ? '小偷在村北山林、村南草原、村西荒山；草寇在村南草原、村西荒山；盗贼在村东竹林。' : '流寇在许昌郊外、西郊；地痞在长社；街匪在颍川。', { wrap: m.cw, color: C.gray }));
}

