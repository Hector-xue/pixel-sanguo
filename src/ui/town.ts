// 城镇设施面板：武器店、铁匠铺、馆驿、钱庄、孔庙、军马场、娱乐场、战场
import Phaser from 'phaser';
import { C } from '../art/palette';
import { avatarTex, gearTex, iconTex, mountTex } from '../art/textures';
import { GEM_KINDS, balance, equips, gemId, items, mounts, systems } from '../data';
import { gearLines, gearName, gearValue, mountPower } from '../core/gear';
import type { Gear, Slot } from '../core/types';
import { betChibi, casinoTitle, chibiView, guessCollect, guessPick, guessStart } from '../game/casino';
import { buyGear, combineGem, combineOre, forge, forgeRows, gemCombineCost, oreCombineCost, removeGem, sellGear, shopGear, socketGem } from '../game/smith';
import type { GearRef } from '../game/smith';
import { bagCap, bagCount, bagUsed, moveToInn, moveToTeam } from '../game/state';
import { store } from '../game/store';
import {
  buyGold, buyMount, deposit, enterCave, mountExpNeed, restMount, ride, sellGold, storeItem, takeItem, teleport, teleportTargets,
  templeGraduate, templeJoin, withdraw,
} from '../game/town';
import type { Host } from './panels';
import { chooseAmount, chooseCount, done, generalsPanel, hospitalPanel, skillSchoolPanel } from './panels';
import { arenaPanel, luckyPanel, stallPanel, treasurePanel } from './p3';
import { Button, Modal, ScrollArea, confirm, frame, sfx, text, toast } from './widgets';

export const FACILITIES: Record<string, [string, string, (h: Host) => void]> = {
  hospital: ['医馆', '治疗、买药、药品回收', (h) => hospitalPanel(h)],
  weapon: ['武器店', '买卖装备（只卖1级）', (h) => weaponShopPanel(h)],
  temple: ['孔庙', '拜师，打仗经验更多', (h) => templePanel(h)],
  smith: ['铁匠铺', '打造装备、合成矿石、宝石', (h) => smithPanel(h)],
  inn: ['馆驿', '寄存物品、存放副将、传送', (h) => innPanel(h)],
  bank: ['钱庄', '存钱、兑换金砖', (h) => bankPanel(h)],
  skillschool: ['技能学校', '学习和升级技能', (h) => skillSchoolPanel(h)],
  stable: ['军马场', '买马、骑乘、休息', (h) => stablePanel(h)],
  casino: ['娱乐场', '赤壁、猜猜看、幸运王', (h) => casinoPanel(h)],
  battlefield: ['战场', '进宝洞挖宝、抢宝', (h) => treasurePanel(h, () => battlefieldPanel(h))],
  arena: ['擂台', '擂台、斗将台、决斗场', (h) => arenaPanel(h)],
  market: ['跳蚤市场', '摆摊卖东西给NPC', (h) => stallPanel(h)],
};

type Rows = { area: ScrollArea; y: number };

function list(h: Host, m: Modal, parent: Phaser.GameObjects.Container, top: number, bottomPad = 40): Rows {
  return { area: new ScrollArea(h, m.cx, top, m.cw, m.py + m.ph - bottomPad - top, parent), y: 0 };
}

// 列表里的一行：图标 + 两行字 + 右边按钮
function row(h: Host, r: Rows, w: number, icon: string | null, title: string, sub: string, btn: string | null, fn: () => void, o: { disabled?: boolean; color?: number; scale?: number; style?: 'red' | 'tan' } = {}): void {
  const c = r.area.content;
  const g = h.add.graphics();
  frame(g, 0, r.y, w - 6, 36, 'tan');
  c.add(g);
  if (icon) c.add(h.add.image(6, r.y + 6, icon).setOrigin(0).setScale(o.scale ?? 2));
  const tx = icon ? 36 : 8;
  c.add(text(h, tx, r.y + 3, title, { color: o.color ?? C.darkBrown }));
  c.add(text(h, tx, r.y + 19, sub, { color: C.brown }));
  if (btn) c.add(new Button(h, w - 62, r.y + 7, 52, 22, btn, fn, { clip: r.area, disabled: o.disabled, style: o.style }));
  r.y += 40;
}

function tabs(h: Host, m: Modal, parent: Phaser.GameObjects.Container, names: string[], cur: number, pick: (i: number) => void, y = m.cy): void {
  const bw = Math.floor(m.cw / names.length);
  names.forEach((n, i) => parent.add(new Button(h, m.cx + i * bw, y, bw - 2, 22, n, () => pick(i), { style: i === cur ? 'dark' : 'tan' })));
}

function money(h: Host, m: Modal, parent: Phaser.GameObjects.Container, y: number): void {
  const s = store.save;
  parent.add(text(h, m.cx, y, `银两：${s.player.silver}　金砖：${s.player.gold}　负重：${bagUsed(s)}/${bagCap(s)}`, { color: C.brown }));
}

// ===== 武器店 =====
export function weaponShopPanel(h: Host): void {
  const s = store.save;
  const m = new Modal(h, '武器店');
  const dyn = h.add.container(0, 0);
  m.inner.add(dyn);
  let tab = 0;
  const render = () => {
    dyn.removeAll(true);
    tabs(h, m, dyn, ['购买', '出售'], tab, (i) => {
      tab = i;
      render();
    });
    money(h, m, dyn, m.cy + 28);
    const r = list(h, m, dyn, m.cy + 48, 12);
    if (tab === 0) {
      for (const g of shopGear(s)) {
        const price = equips.shopPrice[g.slot];
        row(h, r, m.cw, gearTex(h, g.slot, 1, g.cls), `${gearName(g)}（${equips.slotNames[g.slot]}）`, `${gearLines(g).join(' ')}　${price}两`, '购买', () => {
          toast(h, buyGear(s, g.slot));
          h.refresh();
          render();
        }, { disabled: s.player.silver < price });
      }
      r.area.content.add(text(h, 4, r.y + 4, '武器店只卖1级装备。更高级的去铁匠铺打造。', { wrap: m.cw - 10, color: C.gray }));
      r.y += 30;
    } else {
      for (const g of s.gear) {
        row(h, r, m.cw, gearTex(h, g.slot, g.tier, g.cls), gearName(g), `${g.tier}级 · 回收价${gearValue(g)}两`, '出售', () => confirm(h, `把${gearName(g)}卖给武器店，得${gearValue(g)}两？${g.gems.some(Boolean) ? '上面的宝石也一起卖掉。' : ''}`, () => {
          toast(h, sellGear(s, g.uid));
          h.refresh();
          render();
        }, '出售'), { color: g.q ? C.purple : C.darkBrown });
      }
      if (!s.gear.length) r.area.content.add(text(h, 4, 4, '背包里没有能卖的装备（身上穿的要先卸下）。', { wrap: m.cw - 10, color: C.gray }));
    }
    r.area.setContentHeight(r.y);
  };
  render();
}

// ===== 铁匠铺 =====
let smithTab = 0;
let smithSlot: Slot = 'weapon';
export function smithPanel(h: Host): void {
  const s = store.save;
  const m = new Modal(h, '铁匠铺');
  const dyn = h.add.container(0, 0);
  m.inner.add(dyn);
  const render = () => {
    dyn.removeAll(true);
    tabs(h, m, dyn, ['打造', '矿石合成', '宝石'], smithTab, (i) => {
      smithTab = i;
      render();
    });
    money(h, m, dyn, m.cy + 28);
    if (smithTab === 0) {
      const bw = Math.floor(m.cw / 6);
      equips.slots.forEach((slot, i) => dyn.add(new Button(h, m.cx + i * bw, m.cy + 46, bw - 2, 22, equips.slotNames[slot], () => {
        smithSlot = slot;
        render();
      }, { style: smithSlot === slot ? 'red' : 'tan' })));
      const r = list(h, m, dyn, m.cy + 74, 12);
      for (const f of forgeRows(s, smithSlot)) {
        const g: Gear = { uid: '', slot: smithSlot, tier: f.tier, cls: s.player.classId, q: 0, gems: [] };
        const c = r.area.content;
        const bg = h.add.graphics();
        frame(bg, 0, r.y, m.cw - 6, 56, 'tan');
        c.add(bg);
        c.add(h.add.image(6, r.y + 6, gearTex(h, smithSlot, f.tier, s.player.classId)).setOrigin(0).setScale(3));
        c.add(text(h, 46, r.y + 3, `${f.name}（${f.level}级）`, { color: C.darkRed }));
        c.add(text(h, 46, r.y + 18, gearLines(g).join(' '), { color: C.brown }));
        const have = bagCount(s, f.ore);
        c.add(text(h, 46, r.y + 33, `${items[f.ore].name}${have}/${f.oreN}　${f.silver}两`, { color: have >= f.oreN ? C.green : C.red }));
        c.add(new Button(h, m.cw - 62, r.y + 8, 52, 22, '打造', () => {
          const msg = forge(s, smithSlot, f.tier);
          if (msg.startsWith('打造成功')) sfx('level');
          toast(h, msg);
          h.refresh();
          render();
        }, { clip: r.area, style: 'red', disabled: !!f.reason }));
        if (f.reason) c.add(text(h, m.cw - 36, r.y + 36, f.reason, { align: 'center', color: C.gray }));
        r.y += 60;
      }
      r.area.content.add(text(h, 4, r.y + 4, `打造有${Math.round(balance.equip.qualityChance * 100)}%的机会出精良（属性×${balance.equip.qualityMul}）。2级以上装备有孔，可以镶宝石。`, { wrap: m.cw - 10, color: C.gray }));
      r.area.setContentHeight(r.y + 40);
    } else if (smithTab === 1) {
      const r = list(h, m, dyn, m.cy + 48, 12);
      for (const to of ['jingtie', 'jinggang', 'xuantie']) {
        const c = oreCombineCost(to)!;
        const have = bagCount(s, c.from);
        row(h, r, m.cw, iconTex(h, to), `${c.n}块${items[c.from].name} → 1块${items[to].name}`, `有${have}块　手续费${c.silver}两`, '合成', () => {
          toast(h, combineOre(s, to));
          h.refresh();
          render();
        }, { disabled: have < c.n || s.player.silver < c.silver });
      }
      for (const id of ['tiekuang', 'jingtie', 'jinggang', 'xuantie']) r.area.content.add(text(h, 4, r.y + 4 + ['tiekuang', 'jingtie', 'jinggang', 'xuantie'].indexOf(id) * 16, `${items[id].name}：${bagCount(s, id)}块　${items[id].desc}`, { color: C.gray }));
      r.area.setContentHeight(r.y + 70);
    } else {
      gemTab(h, m, dyn, render);
    }
  };
  render();
}

function gemTab(h: Host, m: Modal, dyn: Phaser.GameObjects.Container, render: () => void): void {
  const s = store.save;
  const r = list(h, m, dyn, m.cy + 48, 12);
  const c = r.area.content;
  c.add(text(h, 4, r.y, '镶嵌：点装备上的孔。', { color: C.darkRed }));
  r.y += 18;
  const gears: [GearRef, Gear, string][] = [
    ...equips.slots.filter((sl) => s.equip[sl]).map((sl) => [{ slot: sl }, s.equip[sl]!, '身上'] as [GearRef, Gear, string]),
    ...s.gear.map((g) => [{ uid: g.uid }, g, '背包'] as [GearRef, Gear, string]),
  ].filter(([, g]) => g.gems.length);
  for (const [ref, g, where] of gears) {
    const bg = h.add.graphics();
    frame(bg, 0, r.y, m.cw - 6, 36, 'tan');
    c.add(bg);
    c.add(h.add.image(6, r.y + 6, gearTex(h, g.slot, g.tier, g.cls)).setOrigin(0).setScale(2));
    c.add(text(h, 36, r.y + 3, `${gearName(g)}（${where}）`, { color: C.darkBrown }));
    g.gems.forEach((gem, i) => {
      c.add(new Button(h, 36 + i * 96, r.y + 17, 92, 17, gem ? items[gem].name : '空孔·镶嵌', () => {
        if (gem) confirm(h, `拆下${items[gem].name}要${balance.equip.gemRemoveCost}两，确定吗？`, () => {
          toast(h, removeGem(s, ref, i));
          h.refresh();
          render();
        }, '拆下');
        else pickGem(h, (id) => {
          toast(h, socketGem(s, ref, i, id));
          sfx('level');
          h.refresh();
          render();
        });
      }, { clip: r.area, style: gem ? 'tan' : 'red' }));
    });
    r.y += 40;
  }
  if (!gears.length) {
    c.add(text(h, 4, r.y, '没有带孔的装备。2级以上的装备才有孔。', { color: C.gray, wrap: m.cw - 10 }));
    r.y += 20;
  }
  r.y += 8;
  c.add(text(h, 4, r.y, `合成：${balance.gem.combineN}颗同级宝石合成1颗高一级的。`, { color: C.darkRed }));
  r.y += 18;
  let any = false;
  for (const kind of GEM_KINDS) {
    for (let lv = 1; lv < balance.gem.maxLevel; lv++) {
      const id = gemId(kind, lv);
      const have = bagCount(s, id);
      if (!have) continue;
      any = true;
      const cost = gemCombineCost(lv);
      row(h, r, m.cw, iconTex(h, id), `${items[id].name} ×${have}`, `→ ${items[gemId(kind, lv + 1)].name}，手续费${cost}两`, '合成', () => {
        toast(h, combineGem(s, kind, lv));
        h.refresh();
        render();
      }, { disabled: have < balance.gem.combineN || s.player.silver < cost });
    }
  }
  if (!any) {
    c.add(text(h, 4, r.y, '背包里没有宝石。跑环、挖宝、宝箱都会出。', { color: C.gray, wrap: m.cw - 10 }));
    r.y += 20;
  }
  c.add(text(h, 4, r.y + 4, '钻石：抗物理、暴击、速度　绿宝石：抗围困、抗风沙、反击\n红宝石：抗扰乱、抗妖火、致命　蓝宝石：抗封锁、抗落雷、体质', { wrap: m.cw - 10, color: C.gray }));
  r.area.setContentHeight(r.y + 50);
}

function pickGem(h: Host, onPick: (id: string) => void): void {
  const s = store.save;
  const gems = Object.keys(s.bag).filter((id) => items[id]?.gem).sort((a, b) => items[b].gem!.level - items[a].gem!.level);
  if (!gems.length) return toast(h, '背包里没有宝石');
  const m = new Modal(h, '选一颗宝石', { w: 300, h: Math.min(420, 70 + gems.length * 40) });
  const r = list(h, m, m.inner, m.cy, 10);
  for (const id of gems) row(h, r, m.cw, iconTex(h, id), `${items[id].name} ×${s.bag[id]}`, gemDesc(id), '镶嵌', () => {
    m.close();
    onPick(id);
  });
  r.area.setContentHeight(r.y);
}

function gemDesc(id: string): string {
  const k = items[id].gem!.kind;
  return { zuanshi: '抗物理 暴击 速度', lvbaoshi: '抗围困 抗风沙 反击', hongbaoshi: '抗扰乱 抗妖火 致命', lanbaoshi: '抗封锁 抗落雷 体质' }[k] ?? '';
}

// ===== 馆驿 =====
let innTab = 0;
export function innPanel(h: Host): void {
  const s = store.save;
  const m = new Modal(h, '馆驿');
  const dyn = h.add.container(0, 0);
  m.inner.add(dyn);
  const render = () => {
    dyn.removeAll(true);
    tabs(h, m, dyn, ['寄存', '取出', '副将', '传送'], innTab, (i) => {
      innTab = i;
      render();
    });
    money(h, m, dyn, m.cy + 28);
    const r = list(h, m, dyn, m.cy + 48, 12);
    if (innTab === 0) {
      const ids = Object.keys(s.bag).filter((id) => !items[id].quest);
      for (const id of ids) row(h, r, m.cw, iconTex(h, id), `${items[id].name} ×${s.bag[id]}`, '寄存后不占负重', '寄存', () => chooseCount(h, `寄存${items[id].name}`, s.bag[id], (n) => {
        toast(h, storeItem(s, id, n));
        h.refresh();
        render();
      }));
      if (!ids.length) r.area.content.add(text(h, 4, 4, '背包是空的。', { color: C.gray }));
    } else if (innTab === 1) {
      const ids = Object.keys(s.storage);
      for (const id of ids) row(h, r, m.cw, iconTex(h, id), `${items[id].name} ×${s.storage[id]}`, '寄存在馆驿', '取出', () => chooseCount(h, `取出${items[id].name}`, s.storage[id], (n) => {
        toast(h, takeItem(s, id, n) || '负重不够');
        h.refresh();
        render();
      }));
      if (!ids.length) r.area.content.add(text(h, 4, 4, '馆驿里没有寄存的东西。', { color: C.gray }));
    } else if (innTab === 2) {
      for (const g of s.inn) row(h, r, m.cw, avatarTex(h, g.look), `（${g.level}）${g.name}`, `${g.grade} · 在馆驿休息`, '随行', () => {
        toast(h, moveToTeam(s, g.uid));
        h.refresh();
        render();
      });
      for (const g of s.generals) row(h, r, m.cw, avatarTex(h, g.look), `（${g.level}）${g.name}`, `${g.grade} · 随行中`, '留下', () => {
        toast(h, moveToInn(s, g.uid));
        h.refresh();
        render();
      });
      r.area.content.add(new Button(h, 0, r.y + 4, m.cw - 6, 24, '打开副将列表', () => {
        m.close();
        generalsPanel(h);
      }));
      r.y += 30;
    } else {
      for (const t of teleportTargets(s)) row(h, r, m.cw, null, t.name, t.ok ? `传送费${balance.inn.teleportCost}两` : '还没去过', '传送', () => {
        const msg = teleport(s, t.id);
        m.close();
        sfx('step');
        done(h, msg);
      }, { disabled: !t.ok || s.player.silver < balance.inn.teleportCost });
    }
    r.area.setContentHeight(r.y);
  };
  render();
}

// ===== 钱庄（商城在「功能 → 宝库」） =====
let bankTab = 0;
export function bankPanel(h: Host, tab?: number): void {
  if (tab !== undefined) bankTab = tab;
  bankTab = Math.min(bankTab, 1);
  const s = store.save;
  const m = new Modal(h, '钱庄');
  const dyn = h.add.container(0, 0);
  m.inner.add(dyn);
  const render = () => {
    dyn.removeAll(true);
    tabs(h, m, dyn, ['存取', '金砖'], bankTab, (i) => {
      bankTab = i;
      render();
    });
    let y = m.cy + 30;
    dyn.add(text(h, m.cx, y, `身上银两：${s.player.silver}`, { color: C.darkBrown }));
    dyn.add(text(h, m.cx + m.cw / 2, y, `金砖：${s.player.gold}`, { color: C.darkRed }));
    y += 18;
    const act = (fn: () => string) => () => {
      toast(h, fn());
      h.refresh();
      render();
    };
    if (bankTab === 0) {
      dyn.add(text(h, m.cx, y, `钱庄存款：${s.bank}`, { color: C.green, scale: 2 }));
      y += 34;
      dyn.add(new Button(h, m.cx, y, m.cw / 2 - 4, 30, '存入', () => chooseAmount(h, '存入多少', s.player.silver, (n) => act(() => deposit(s, n))()), { style: 'red', disabled: s.player.silver <= 0 }));
      dyn.add(new Button(h, m.cx + m.cw / 2 + 4, y, m.cw / 2 - 4, 30, '取出', () => chooseAmount(h, '取出多少', s.bank, (n) => act(() => withdraw(s, n))()), { disabled: s.bank <= 0 }));
      y += 40;
      dyn.add(text(h, m.cx, y, `存款每天有${balance.bank.interestDaily * 100}%的利息（一天最多${balance.bank.interestCap}两）。`, { wrap: m.cw, color: C.gray }));
    } else {
      dyn.add(text(h, m.cx, y, `买入：${balance.bank.goldBuy}两换1块金砖\n卖出：1块金砖换${balance.bank.goldSell}两`, { color: C.brown, lineGap: 4 }));
      y += 40;
      [1, 10, 50].forEach((n, i) => dyn.add(new Button(h, m.cx + i * (m.cw / 3), y, m.cw / 3 - 4, 28, `买${n}块`, act(() => buyGold(s, n)), { disabled: s.player.silver < n * balance.bank.goldBuy })));
      y += 34;
      [1, 10, 50].forEach((n, i) => dyn.add(new Button(h, m.cx + i * (m.cw / 3), y, m.cw / 3 - 4, 28, `卖${n}块`, act(() => sellGold(s, n)), { disabled: s.player.gold < n })));
      y += 40;
      dyn.add(text(h, m.cx, y, '金砖在「功能 → 宝库」的商城里花（将军令、心法书……），也能买好马。七日签到也送金砖。', { wrap: m.cw, color: C.gray }));
    }
  };
  render();
}

// ===== 孔庙 =====
export function templePanel(h: Host): void {
  const s = store.save;
  const m = new Modal(h, '孔庙', { h: 300 });
  const T = balance.temple;
  m.inner.add(h.add.image(m.cx, m.cy, avatarTex(h, 'elder')).setOrigin(0).setScale(2));
  const msg = s.mentor.graduated ? '你已经出师了。学无止境，常回来看看。'
    : s.mentor.joined ? `你是我的弟子。好好历练，到${T.graduateLevel}级就可以出师。`
      : `拜我为师，拜师礼${T.cost}两。拜师以后打仗得到的经验多${Math.round(T.expBonus * 100)}%，${T.graduateLevel}级出师还有谢师礼。`;
  m.inner.add(text(h, m.cx + 60, m.cy, '孔庙夫子', { color: C.darkRed, scale: 2 }));
  m.inner.add(text(h, m.cx, m.cy + 60, msg, { wrap: m.cw, lineGap: 4 }));
  const by = m.py + m.ph - 40;
  if (!s.mentor.joined) m.inner.add(new Button(h, m.cx, by, m.cw, 28, `拜师（${T.cost}两）`, () => {
    const r = templeJoin(s);
    m.close();
    done(h, r);
  }, { style: 'red', disabled: s.player.silver < T.cost }));
  else if (!s.mentor.graduated) m.inner.add(new Button(h, m.cx, by, m.cw, 28, s.player.level >= T.graduateLevel ? '出师' : `${T.graduateLevel}级出师`, () => {
    const r = templeGraduate(s);
    m.close();
    sfx('level');
    done(h, r);
  }, { style: 'red', disabled: s.player.level < T.graduateLevel }));
  m.inner.add(text(h, m.cx, by - 40, '原版是拜玩家为师，单机版改成拜孔庙夫子。', { wrap: m.cw, color: C.gray }));
}

// ===== 军马场 =====
export function stablePanel(h: Host): void {
  const s = store.save;
  const m = new Modal(h, '军马场');
  const dyn = h.add.container(0, 0);
  m.inner.add(dyn);
  const render = () => {
    dyn.removeAll(true);
    money(h, m, dyn, m.cy);
    dyn.add(text(h, m.cx, m.cy + 16, s.riding ? `正在骑：${mounts[s.riding].name}` : '没有骑马', { color: s.riding ? C.green : C.gray }));
    const r = list(h, m, dyn, m.cy + 36, 12);
    const ids = Object.keys(mounts).sort((a, b) => (s.mounts[b] ? 1 : 0) - (s.mounts[a] ? 1 : 0) || mounts[a].level - mounts[b].level);
    for (const id of ids) {
      const d = mounts[id];
      const own = s.mounts[id];
      const c = r.area.content;
      const bg = h.add.graphics();
      frame(bg, 0, r.y, m.cw - 6, 48, own ? 'paper' : 'tan');
      c.add(bg);
      c.add(h.add.image(4, r.y + 4, mountTex(h, d.color)).setOrigin(0).setScale(2));
      c.add(text(h, 56, r.y + 3, own ? `${d.name}（${own.level}级）` : d.name, { color: own ? C.darkRed : C.darkBrown }));
      const lv = own?.level ?? 1;
      const pw = mountPower(id, lv);
      c.add(text(h, 56, r.y + 18, own ? `战力${pw}　经验${own.exp}/${mountExpNeed(own.level)}` : `${d.level}级可骑　${d.gold ? `${d.gold}金砖` : `${d.silver}两`}`, { color: C.brown }));
      const b = d.base;
      c.add(text(h, 56, r.y + 32, `速度+${b.spd} 抗乱封围+${b.chaos}/${b.seal}/${b.trap}`, { color: C.gray }));
      const riding = s.riding === id;
      const label = own ? (riding ? '休息' : '骑乘') : '购买';
      c.add(new Button(h, m.cw - 62, r.y + 13, 52, 22, label, () => {
        const msg = own ? (riding ? restMount(s) : ride(s, id)) : buyMount(s, id);
        toast(h, msg);
        h.refresh();
        render();
      }, { clip: r.area, style: own && !riding ? 'red' : 'tan', disabled: !own && (s.player.level < d.level || (d.gold ? s.player.gold < d.gold : s.player.silver < (d.silver ?? 0))) }));
      r.y += 52;
    }
    r.area.setContentHeight(r.y);
  };
  render();
}

// ===== 娱乐场 =====
let casinoTab = 0;
export function casinoPanel(h: Host): void {
  const s = store.save;
  const m = new Modal(h, '娱乐场');
  const dyn = h.add.container(0, 0);
  m.inner.add(dyn);
  const K = systems.casino;
  let timer: Phaser.Time.TimerEvent | null = null;
  m.once('destroy', () => timer?.remove());
  const render = () => {
    dyn.removeAll(true);
    tabs(h, m, dyn, ['赤壁', '猜猜看', '幸运王'], casinoTab, (i) => {
      casinoTab = i;
      render();
    });
    if (casinoTab === 2) return luckyPanel(h, dyn, m, m.cy + 30, render);
    let y = m.cy + 28;
    dyn.add(text(h, m.cx, y, `银两：${s.player.silver}　娱乐场称号：${casinoTitle(s.casino.net)}（${s.casino.net >= 0 ? '+' : ''}${s.casino.net}）`, { color: C.brown }));
    y += 20;
    if (casinoTab === 0) {
      const v = chibiView(s);
      if (v.settled) toast(h, v.settled, 2600);
      const left = Math.max(0, Math.ceil((v.end - Date.now()) / 1000));
      dyn.add(text(h, m.cx + m.cw / 2, y, `第${v.id % 10000}局　距开战 ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`, { align: 'center', color: C.darkRed, scale: 2 }));
      y += 36;
      const cw = Math.floor((m.cw - 8) / 3);
      const total = v.pools.reduce((a, b) => a + b, 0);
      K.sides.forEach((side, i) => {
        const x = m.cx + i * (cw + 4);
        const g = h.add.graphics();
        frame(g, x, y, cw, 150, i === 0 ? 'blue' : i === 1 ? 'red' : 'dark');
        dyn.add(g);
        dyn.add(text(h, x + cw / 2, y + 8, side, { align: 'center', color: C.lightPaper, scale: 3 }));
        dyn.add(text(h, x + cw / 2, y + 52, `奖池\n${v.pools[i]}`, { align: 'center', color: C.lightPaper }));
        dyn.add(text(h, x + cw / 2, y + 86, `赔率 ${v.odds[i]}`, { align: 'center', color: C.yellow }));
        dyn.add(text(h, x + cw / 2, y + 102, `我押 ${v.mine[i]}`, { align: 'center', color: C.lightPaper }));
        dyn.add(new Button(h, x + 6, y + 120, cw - 12, 24, `押${side}`, () => chooseAmount(h, `押${side}多少`, Math.min(s.player.silver, K.maxBet), (n) => {
          toast(h, betChibi(s, i, n));
          h.refresh();
          render();
        }, K.minBet), { disabled: s.player.silver < K.minBet || left < 5 }));
      });
      y += 158;
      dyn.add(text(h, m.cx, y, `魏蜀吴三方对战，押中的一方按押注比例分走全部奖池（娱乐场抽${K.houseCut * 100}%）。押的人越少赔率越高。每局${K.chibiMinutes}分钟，开战后自动结算。总奖池${total}两。`, { wrap: m.cw, color: C.gray, lineGap: 3 }));
      timer?.remove();
      timer = h.time.addEvent({ delay: 1000, callback: render });
    } else {
      timer?.remove();
      const g = s.casino.guess;
      if (!g) {
        dyn.add(text(h, m.cx, y, `押银两，三个锦囊里藏着一枚铜钱，猜中拿${K.guessMul}倍。猜中以后可以收手，也可以拿奖池接着猜。`, { wrap: m.cw, lineGap: 4 }));
        y += 60;
        dyn.add(new Button(h, m.cx, y, m.cw, 30, '押注开始', () => chooseAmount(h, '押多少', Math.min(s.player.silver, K.maxBet), (n) => {
          toast(h, guessStart(s, n));
          h.refresh();
          render();
        }, K.minBet), { style: 'red', disabled: s.player.silver < K.minBet }));
      } else {
        dyn.add(text(h, m.cx + m.cw / 2, y, `奖池 ${g.pot} 两`, { align: 'center', color: C.darkRed, scale: 2 }));
        y += 36;
        const cw = Math.floor((m.cw - 8) / 3);
        [0, 1, 2].forEach((i) => {
          dyn.add(new Button(h, m.cx + i * (cw + 4), y, cw, 80, `锦囊${'一二三'[i]}`, () => {
            const r = guessPick(s, i);
            sfx(r.win ? 'win' : 'lose');
            toast(h, r.text, 2200);
            h.refresh();
            render();
          }, { style: 'red' }));
        });
        y += 90;
        if (g.pot > g.base) dyn.add(new Button(h, m.cx, y, m.cw, 30, `收手，拿走${g.pot}两`, () => {
          toast(h, guessCollect(s));
          sfx('heal');
          h.refresh();
          render();
        }));
      }
    }
  };
  render();
}

// ===== 战场（宝洞） =====
export function battlefieldPanel(h: Host): void {
  const s = store.save;
  confirm(h, `去宝洞挖宝吗？宝洞老人卖铲子（${items.chanzi.price}两一把），一把挖10铲，挖深了会遇到护宝守卫。${bagCount(s, 'chanzi') ? `\n你有${bagCount(s, 'chanzi')}把铲子。` : ''}`, () => {
    const r = enterCave(s);
    sfx('step');
    done(h, r);
  }, '进入宝洞');
}
