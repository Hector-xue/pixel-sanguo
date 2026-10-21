// 角色面板（新版五个分页：信息、属性、装备、战力、生平）和装备详情
import { C, hex } from '../art/palette';
import { avatarTex, gearTex, heroLookKey } from '../art/textures';
import { balance, classes, equips, items, locations, mainQuests, mounts } from '../data';
import { expToNext } from '../core/formulas';
import { attrReq, gearBonus, gearLines, gearName, gearValue, tierLevel } from '../core/gear';
import type { Gear, Slot, Stats } from '../core/types';
import { ATTR_KEYS, ATTR_NAMES, RESIST_KEYS, RESIST_NAMES } from '../core/types';
import { casinoTitle } from '../game/casino';
import type { Save } from '../game/state';
import { bagUsed, generalStats, playerAttrs, playerStats } from '../game/state';
import { canEquip, equipGear, unequip } from '../game/smith';
import { store } from '../game/store';
import { eatPill, staminaMax, staminaNow } from '../game/welfare';
import type { Host } from './panels';
import { allocatePanel, done, kv, section } from './panels';
import { Button, Modal, frame, text, toast } from './widgets';

// 战力：把面板属性折算成一个数（排行、对比用）【推定】
export function power(st: Stats): number {
  const res = RESIST_KEYS.reduce((n, k) => n + st.resist[k], 0);
  const r = st.rates;
  return Math.round(st.maxHp * 0.25 + st.maxMp * 0.1 + st.atk * 2 + st.def * 2 + st.spd * 2 + res + (r.crit + r.counter + r.fatal + r.dodge) * 5);
}

function basePlayerStats(s: Save): Stats {
  return playerStats({ ...s, equip: {}, riding: null });
}

function gearOnlyStats(s: Save): Stats {
  return playerStats({ ...s, riding: null });
}

// 家：最近一个去过的城镇，展示用
function homeName(s: Save): string {
  return s.flags.v_xuchang ? '许昌' : '新手村';
}

let roleTab = 0;
const TABS = ['信息', '属性', '装备', '战力', '生平'];

export function rolePanel(h: Host, tab?: number): void {
  if (tab !== undefined) roleTab = tab;
  const s = store.save;
  const p = s.player;
  const st = playerStats(s);
  const m = new Modal(h, '角色');
  const L = m.cx + 4;
  const R = m.cx + m.cw / 2 + 4;
  let y = m.cy;
  const g = h.add.graphics();
  frame(g, L - 4, y, 52, 52, 'tan');
  m.inner.add(g);
  m.inner.add(h.add.image(L - 2, y + 2, avatarTex(h, heroLookKey(p.classId, p.gender), p.avatar)).setOrigin(0).setScale(2));
  m.inner.add(text(h, L + 56, y + 2, p.name, { color: C.darkRed, scale: 2 }));
  m.inner.add(text(h, L + 56, y + 30, `${p.level}级${classes[p.classId].name}`, { color: C.darkBrown }));
  m.inner.add(text(h, L + 56, y + 44, `战力 ${power(st)}`, { color: C.red }));
  radar(h, m, m.cx + m.cw - 40, y + 32, 22, st, p.level);
  y += 60;
  const bw = Math.floor(m.cw / TABS.length);
  TABS.forEach((name, i) => m.inner.add(new Button(h, m.cx + i * bw, y, bw - 2, 22, name, () => {
    m.close();
    rolePanel(h, i);
  }, { style: roleTab === i ? 'dark' : 'tan' })));
  y += 30;
  [infoTab, attrTab, equipTab, powerTab, lifeTab][roleTab](h, m, y, L, R);
}

// 五边形雷达：气血、攻击、防御、速度、精力，按同级参考值归一
function radar(h: Host, m: Modal, cx: number, cy: number, r: number, st: Stats, level: number): void {
  const ref = [80 + level * 22, 20 + level * 5, 6 + level * 2.2, 12 + level * 2.6, 40 + level * 7];
  const val = [st.maxHp, st.atk, st.def, st.spd, st.maxMp].map((v, i) => Math.max(0.15, Math.min(1.25, v / ref[i])));
  const pt = (i: number, k: number) => {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / 5;
    return { x: cx + Math.cos(a) * r * k, y: cy + Math.sin(a) * r * k };
  };
  const g = h.add.graphics();
  g.lineStyle(1, hex(C.tan));
  g.strokePoints([0, 1, 2, 3, 4, 0].map((i) => pt(i, 1)), false);
  g.strokePoints([0, 1, 2, 3, 4, 0].map((i) => pt(i, 0.5)), false);
  g.fillStyle(hex(C.red), 0.55);
  g.fillPoints([0, 1, 2, 3, 4].map((i) => pt(i, val[i] / 1.25)), true);
  m.inner.add(g);
  ['血', '攻', '防', '速', '精'].forEach((n, i) => {
    const q = pt(i, 1.3);
    m.inner.add(text(h, q.x, q.y - 6, n, { align: 'center', color: C.brown }));
  });
}

function infoTab(h: Host, m: Modal, y: number, L: number, R: number): void {
  const s = store.save;
  const p = s.player;
  y = section(m, y, '信息');
  const sta = staminaNow(s);
  const title = s.life.chibi || s.life.guess ? casinoTitle(s.casino.net) : '无';
  const rows: [string, string | number, number?][][] = [
    [['称号', title], ['会员', '无']],
    [['等级', p.level], ['升级还需经验', expToNext(p.level) - p.exp]],
    [['银两', p.silver], ['金砖', p.gold, C.darkRed]],
    [['绑定银', p.boundSilver], ['钱庄存款', s.bank]],
    [['体力', `${sta}/${staminaMax()}`], ['活力', p.level * 3]],
    [['魅力', p.level * 2], ['居住地', homeName(s)]],
    [['坐骑', s.riding ? `${mounts[s.riding].name}(${s.mounts[s.riding].level}级)` : '无'], ['师门', s.mentor.joined ? (s.mentor.graduated ? '已出师' : '孔庙夫子') : '无']],
  ];
  for (const row of rows) {
    row.forEach(([k, v, c], i) => kv(m, i ? R : L, y, k, v, c));
    y += 16;
  }
  y += 8;
  const btns: [string, () => void][] = [
    ['补体力', () => {
      const r = eatPill(s);
      m.close();
      done(h, r);
      rolePanel(h);
    }],
    ['更换头像', () => {
      p.avatar = (p.avatar + 1) % 3;
      m.close();
      done(h, '头像换好了');
      rolePanel(h);
    }],
    ['更换造型', () => toast(h, '更换造型在 P3 开放')],
    ['性格', () => toast(h, '性格在 P3 开放')],
    ['成就', () => toast(h, '成就在 P3 开放')],
  ];
  const bw = Math.floor((m.cw - 8) / 3);
  btns.forEach(([n, fn], i) => m.inner.add(new Button(h, m.cx + (i % 3) * (bw + 4), y + Math.floor(i / 3) * 30, bw, 26, n, fn)));
  y += 66;
  m.inner.add(text(h, m.cx, y, `体力每${balance.stamina.regenMinutes}分钟恢复1点，跑环每环用${5}点；体力丹一天最多${balance.stamina.pillPerDay}颗。`, { wrap: m.cw, color: C.gray }));
}

function attrTab(h: Host, m: Modal, y: number, L: number, R: number): void {
  const s = store.save;
  const p = s.player;
  const st = playerStats(s);
  const a = playerAttrs(s);
  y = section(m, y, `属性（剩余点数 ${p.free}）`);
  const derived: [string, string][] = [['气血', `${p.hp}/${st.maxHp}`], ['精力', `${p.mp}/${st.maxMp}`], ['攻击', `${st.atk}`], ['防御', `${st.def}`], ['速度', `${st.spd}`], ['负重', `${bagUsed(s)}/${st.carry}`]];
  ATTR_KEYS.forEach((k, i) => kv(m, L, y + i * 16, ATTR_NAMES[k], a[k]));
  derived.forEach(([k, v], i) => kv(m, R, y + i * 16, k, v));
  y += 6 * 16 + 4;
  y = section(m, y, '抗性与概率');
  const res = RESIST_KEYS;
  res.forEach((k, i) => kv(m, i % 2 ? R : L, y + Math.floor(i / 2) * 16, RESIST_NAMES[k], st.resist[k]));
  y += Math.ceil(res.length / 2) * 16;
  kv(m, L, y, '暴击', `${st.rates.crit}%`);
  kv(m, R, y, '躲避', `${Math.round(st.rates.dodge * 10) / 10}%`);
  y += 16;
  kv(m, L, y, '反击', `${st.rates.counter}%`);
  kv(m, R, y, '致命', `${st.rates.fatal}%`);
  m.inner.add(new Button(h, m.cx, m.py + m.ph - 34, m.cw, 26, p.free > 0 ? `分配属性点（${p.free}）` : '分配属性点', () => {
    m.close();
    allocatePanel(h);
  }, { style: p.free > 0 ? 'red' : 'tan', disabled: p.free <= 0 }));
}

function equipTab(h: Host, m: Modal, y: number): void {
  equipGrid(h, m, y, () => {
    m.close();
    rolePanel(h);
  });
  m.inner.add(text(h, m.cx, m.py + m.ph - 40, '点格子看详情。2级以上装备有孔，去铁匠铺镶宝石。', { wrap: m.cw, color: C.gray }));
}

// 六个装备格（背包的「我的装备」也用它）
export function equipGrid(h: Host, m: Modal, y: number, after: () => void, parent = m.inner): void {
  const s = store.save;
  const cw = Math.floor((m.cw - 4) / 2);
  equips.slots.forEach((slot, i) => {
    const x = m.cx + (i % 2) * (cw + 4);
    const yy = y + Math.floor(i / 2) * 54;
    const g = s.equip[slot];
    parent.add(new Button(h, x, yy, cw, 50, '', () => (g ? gearDetail(h, g, after) : toast(h, `${equips.slotNames[slot]}：还没有装备`))));
    const fg = h.add.graphics();
    frame(fg, x + 4, yy + 5, 40, 40, g ? 'paper' : 'disabled');
    parent.add(fg);
    if (g) parent.add(h.add.image(x + 6, yy + 7, gearTex(h, slot, g.tier, g.cls)).setOrigin(0).setScale(3));
    parent.add(text(h, x + 50, yy + 6, g ? gearName(g) : equips.slotNames[slot], { color: g ? (g.q ? C.purple : C.darkRed) : C.gray }));
    if (g) {
      parent.add(text(h, x + 50, yy + 21, gearLines(g).slice(0, 2).join(' '), { color: C.brown }));
      const gems = g.gems.length ? g.gems.map((x2) => (x2 ? '◆' : '◇')).join('') : '';
      parent.add(text(h, x + 50, yy + 35, `${g.tier}级 ${gems}`, { color: C.blue }));
    }
  });
}

export function gearDetail(h: Host, g: Gear, after: () => void): void {
  const s = store.save;
  const worn = s.equip[g.slot]?.uid === g.uid;
  const lines = gearLines(g);
  const gemLines = g.gems.map((x, i) => `孔${i + 1}：${x ? items[x].name : '空'}`);
  const m = new Modal(h, gearName(g), { w: 300, h: 150 + (lines.length + gemLines.length) * 15 });
  const fg = h.add.graphics();
  frame(fg, m.cx, m.cy, 52, 52, 'tan');
  m.inner.add(fg);
  m.inner.add(h.add.image(m.cx + 2, m.cy + 2, gearTex(h, g.slot, g.tier, g.cls)).setOrigin(0).setScale(4));
  const req = attrReq(g);
  m.inner.add(text(h, m.cx + 60, m.cy, `${equips.slotNames[g.slot]} · ${g.tier}级装备${g.q ? ' · 精良' : ''}`, { color: C.darkRed }));
  m.inner.add(text(h, m.cx + 60, m.cy + 16, `需要人物${tierLevel(g.tier)}级${req ? `，${req.key === 'str' ? '力量' : '智力'}${req.value}` : ''}`, { color: C.brown }));
  m.inner.add(text(h, m.cx + 60, m.cy + 32, `${g.slot === 'weapon' ? `${classes[g.cls ?? 'warrior'].name}专用 · ` : ''}回收价${gearValue(g)}两`, { color: C.brown }));
  let y = m.cy + 58;
  const total = gearBonus(g);
  for (const l of lines) {
    m.inner.add(text(h, m.cx + 4, y, l));
    y += 15;
  }
  for (const l of gemLines) {
    m.inner.add(text(h, m.cx + 4, y, l, { color: C.blue }));
    y += 15;
  }
  if (g.gems.some(Boolean)) {
    const extra = Object.entries(total.resist).filter(([, v]) => v).map(([k, v]) => `${RESIST_NAMES[k as keyof typeof RESIST_NAMES]}${v}`).join(' ');
    if (extra) m.inner.add(text(h, m.cx + 4, y, `合计：${extra}`, { color: C.gray, wrap: m.cw - 8 }));
  }
  const by = m.py + m.ph - 32;
  if (worn) {
    m.inner.add(new Button(h, m.cx, by, m.cw, 24, '卸下', () => {
      const r = unequip(s, g.slot as Slot);
      m.close();
      done(h, r);
      after();
    }));
  } else if (s.gear.includes(g)) {
    const why = canEquip(s, g);
    m.inner.add(new Button(h, m.cx, by, m.cw, 24, why ? `穿不上：${why}` : '穿上', () => {
      const r = equipGear(s, g.uid);
      m.close();
      done(h, r);
      after();
    }, { style: why ? 'tan' : 'red', disabled: !!why }));
  }
}

function powerTab(h: Host, m: Modal, y: number, L: number, R: number): void {
  const s = store.save;
  const total = power(playerStats(s));
  const base = power(basePlayerStats(s));
  const gear = power(gearOnlyStats(s)) - base;
  const mount = total - base - gear;
  const g = s.generals.find((x) => x.uid === s.activeGeneral);
  y = section(m, y, '战力构成');
  const rows: [string, number][] = [['人物', base], ['装备和宝石', gear], ['坐骑', mount]];
  const max = Math.max(1, ...rows.map((r) => r[1]));
  for (const [k, v] of rows) {
    m.inner.add(text(h, L, y, k, { color: C.brown }));
    const bg = h.add.graphics();
    frame(bg, L + 80, y + 1, Math.max(6, Math.round(((m.cw - 140) * v) / max)), 10, 'red');
    m.inner.add(bg);
    m.inner.add(text(h, m.cx + m.cw - 4, y, String(v), { align: 'right' }));
    y += 18;
  }
  kv(m, L, y + 4, '总战力', total, C.red);
  y += 30;
  y = section(m, y, '出战副将');
  if (g) {
    kv(m, L, y, g.name, `${g.level}级${classes[g.classId].name}`);
    kv(m, R, y, '战力', power(generalStats(g)), C.red);
  } else m.inner.add(text(h, L, y, '没有出战副将', { color: C.gray }));
  y += 26;
  m.inner.add(text(h, m.cx, y, '战力 = 气血、精力、攻击、防御、速度、各项抗性和概率折算的总和，只用来比较强弱。', { wrap: m.cw, color: C.gray }));
}

function lifeTab(_h: Host, m: Modal, y: number, L: number, R: number): void {
  const s = store.save;
  const d = new Date(s.createdAt);
  const days = Math.max(1, Math.ceil((Date.now() - s.createdAt) / 86400000));
  const n = (k: string) => s.life[k] ?? 0;
  const kills = Object.values(s.kills).reduce((a, b) => a + b, 0);
  y = section(m, y, '生平');
  const rows: [string, string | number][] = [
    ['出生', `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`], ['闯荡天数', days],
    ['战斗次数', s.battles], ['击败数', kills],
    ['主线进度', `${Math.min(s.main.step, mainQuests.length)}/${mainQuests.length}`], ['到过的地方', Object.keys(s.flags).filter((k) => k.startsWith('v_') && locations[k.slice(2)]).length + 1],
    ['跑环', `${n('rings')}环（${n('ringRounds')}轮）`], ['打造', `${n('forged')}件`],
    ['开宝箱', n('boxes')], ['挖宝', `${n('digs')}铲`],
    ['招募名将', n('recruits')], ['副将', s.generals.length + s.inn.length],
    ['赤壁', `${n('chibi')}局`], ['娱乐场输赢', s.casino.net],
  ];
  rows.forEach(([k, v], i) => kv(m, i % 2 ? R : L, y + Math.floor(i / 2) * 16, k, v));
}
