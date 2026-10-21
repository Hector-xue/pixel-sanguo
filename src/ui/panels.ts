// 主界面里点开的各个面板：状态/加点/物品/副将/任务/医馆/技能学校/公告/攻略/退出/此地玩家，以及 NPC 对话
import Phaser from 'phaser';
import { C } from '../art/palette';
import { avatarTex, heroLookKey, iconTex } from '../art/textures';
import { balance, bountyOptions, classes, items, locations, mainQuests, monsters, npcs, quiz, skills } from '../data';
import { expToNext, skillMp } from '../core/formulas';
import type { Attrs } from '../core/types';
import { ATTR_KEYS, ATTR_NAMES, RESIST_KEYS, RESIST_NAMES } from '../core/types';
import { playerClassName, playersAt } from '../game/chatter';
import type { AiPlayer } from '../game/chatter';
import {
  abandonBounty, acceptBounty, acceptQuest, allocate, bagCap, bagUsed, buy, currentQuest, findGeneral, generalStats, heal,
  healCost, learnSkill, log, moveToInn, moveToTeam, npcMark, playerAttrs, playerStats, profCap, questDestination,
  questProgressText, quickRecover, releaseGeneral, sell, sellPrice, serialize, setActive, skillSchool,
  targetHpMp, turnInBounty, turnInQuest, upgradeSkill, useItem,
} from '../game/state';
import type { Target } from '../game/state';
import { store } from '../game/store';
import type { ChatBox } from './chat';
import { fillText, showDialog } from './dialog';
import { Button, Modal, ScrollArea, bar, confirm, frame, isMuted, setMuted, sfx, text, textLines, toast } from './widgets';

export interface Host extends Phaser.Scene {
  refresh(): void;
  chat: ChatBox;
  autoPath(dest: string): void;
}

function done(h: Host, msg?: string): void {
  if (msg) toast(h, msg);
  h.refresh();
}

function section(m: Modal, y: number, title: string): number {
  const g = m.scene.add.graphics();
  frame(g, m.cx, y, m.cw, 18, 'tan');
  m.inner.add(g);
  m.inner.add(text(m.scene, m.cx + 6, y + 3, title, { color: C.darkRed }));
  return y + 22;
}

function kv(m: Modal, x: number, y: number, k: string, v: string | number, color: number = C.darkBrown): void {
  m.inner.add(text(m.scene, x, y, `${k}：`, { color: C.brown }));
  m.inner.add(text(m.scene, x + (k.length + 1) * 12, y, String(v), { color }));
}

export function notYet(h: Host, name: string, why: string): void {
  toast(h, `${name}：${why}`);
}

// ===== 状态（人物详情） =====
export function statusPanel(h: Host): void {
  const s = store.save;
  const p = s.player;
  const st = playerStats(s);
  const a = playerAttrs(s);
  const m = new Modal(h, '人物状态');
  const L = m.cx + 4;
  const R = m.cx + m.cw / 2 + 4;
  let y = m.cy;
  const g = h.add.graphics();
  frame(g, L - 4, y, 52, 52, 'tan');
  m.inner.add(g);
  m.inner.add(h.add.image(L - 2, y + 2, avatarTex(h, heroLookKey(p.classId, p.gender), p.avatar)).setOrigin(0).setScale(2));
  m.inner.add(text(h, L + 56, y + 4, p.name, { color: C.darkRed, scale: 2 }));
  m.inner.add(text(h, L + 56, y + 34, `${s.server} · ID ${String(s.createdAt).slice(-6)}`, { color: C.brown }));
  y += 58;
  y = section(m, y, '基本');
  kv(m, L, y, '职业', `${p.level}级${classes[p.classId].name}`);
  kv(m, R, y, '称号', '无');
  y += 16;
  kv(m, L, y, '升级还需经验', expToNext(p.level) - p.exp);
  y += 16;
  kv(m, L, y, '银两', p.silver);
  kv(m, R, y, '金砖', p.gold, C.darkRed);
  y += 16;
  kv(m, L, y, '绑定银', p.boundSilver);
  kv(m, R, y, '居住地', '新手村');
  y += 16;
  kv(m, L, y, '战斗次数', s.battles);
  kv(m, R, y, '击败数', Object.values(s.kills).reduce((a2, b) => a2 + b, 0));
  y += 22;
  y = section(m, y, `属性（剩余点数 ${p.free}）`);
  const derived: [string, string][] = [['气血', `${p.hp}/${st.maxHp}`], ['精力', `${p.mp}/${st.maxMp}`], ['攻击', `${st.atk}`], ['防御', `${st.def}`], ['速度', `${st.spd}`], ['负重', `${bagUsed(s)}/${st.carry}`]];
  ATTR_KEYS.forEach((k, i) => kv(m, L, y + i * 16, ATTR_NAMES[k], a[k]));
  derived.forEach(([k, v], i) => kv(m, R, y + i * 16, k, v));
  y += 6 * 16 + 4;
  y = section(m, y, '抗性与概率');
  const res = RESIST_KEYS.filter((k) => k !== 'poison' && k !== 'mystic');
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
function chooseTarget(h: Host, title: string, onPick: (t: Target) => void): void {
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

function chooseCount(h: Host, title: string, max: number, onPick: (n: number) => void): void {
  const m = new Modal(h, title, { w: 280, h: 110 });
  [1, 5, 10, 20].forEach((n, i) => {
    m.inner.add(new Button(h, m.cx + i * 66, m.cy + 10, 60, 30, `${n}个`, () => {
      m.close();
      onPick(n);
    }, { disabled: n > max }));
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
    const area = new ScrollArea(h, m.cx, m.cy + 50, m.cw, m.ph - 90, dyn);
    let y = 0;
    if (bagTab === 'mine' || bagTab === 'equip') {
      area.content.add(text(h, 4, 4, bagTab === 'mine' ? '头、项链、武器、护腕、铠甲、靴子六个部位。\n装备系统在许昌开放（P2）：武器店买1级装备，铁匠铺打造更高级的。' : '还没有装备。', { wrap: m.cw - 8, color: C.gray }));
      area.setContentHeight(60);
      return;
    }
    const ids = Object.keys(s.bag).filter((id) => items[id] && items[id].cat === bagTab);
    for (const id of ids) {
      const def = items[id];
      const g = h.add.graphics();
      frame(g, 0, y, m.cw - 6, 34, 'tan');
      area.content.add(g);
      area.content.add(h.add.image(6, y + 5, iconTex(h, id)).setOrigin(0).setScale(2));
      area.content.add(text(h, 36, y + 3, `${def.name}${def.quest ? '（任务）' : '（不绑定）'}`, { color: C.darkBrown }));
      const eff = [def.hp ? `气血+${def.hp}` : '', def.mp ? `精力+${def.mp}` : '', def.desc ?? ''].filter(Boolean).join(' ');
      area.content.add(text(h, 36, y + 18, `×${s.bag[id]}  ${eff}`, { color: C.brown }));
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
  const m = new Modal(h, '副将');
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
      dyn.add(text(h, m.cx + 32, y + 19, `${g.grade} · ${classes[g.classId].name}`, { color: C.brown }));
      if (genTab === 'team') {
        const active = s.activeGeneral === g.uid;
        dyn.add(new Button(h, m.cx + m.cw - 50, y + 6, 50, 24, active ? '战' : '休', () => {
          setActive(s, active ? null : g.uid);
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
    if (!list.length) dyn.add(text(h, m.cx + 4, m.cy + 36, genTab === 'team' ? '还没有副将。\n在野外把怪物打到残血，用「招降」收服。新手任务里赵云会教你。' : '馆驿里没有副将。随行满3个后，再招降的会自动放到这里。', { wrap: m.cw - 8, color: C.gray }));
    dyn.add(text(h, m.cx, m.py + m.ph - 40, '「战」：每场战斗带它上场；其余随行副将在战斗中用「招将」换上。', { wrap: m.cw, color: C.gray }));
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
  m.inner.add(text(h, L + 56, y + 34, `ID ${g.uid.slice(1).padStart(5, '0')} · ${inTeam ? (s.activeGeneral === uid ? '参战' : '休息') : '馆驿'}`, { color: C.brown }));
  y += 58;
  y = section(m, y, '基本');
  kv(m, L, y, '头衔', g.grade);
  kv(m, R, y, '星级', `${g.star}星`);
  y += 16;
  kv(m, L, y, '职业', `${g.level}级${classes[g.classId].name}`);
  kv(m, R, y, '转数', `${g.level}级(0转)`);
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
  kv(m, L, y, '技能', g.skills.length ? g.skills.map((k) => skills[k.id].name).join('、') : '无（常人不能学技能）');
  const by = m.py + m.ph - 64;
  const btns: [string, () => void, boolean?][] = [
    ['升星', () => toast(h, '升星在 P2 开放')],
    ['迅速升级', () => toast(h, '用心法书升级，P2 开放')],
  ];
  if (inTeam) {
    btns.push([s.activeGeneral === uid ? '休息' : '出战', () => {
      setActive(s, s.activeGeneral === uid ? null : uid);
      m.close();
      done(h);
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
  const bw = Math.floor((m.cw - (btns.length - 1) * 4) / btns.length);
  btns.forEach(([name, fn], i) => m.inner.add(new Button(h, m.cx + i * (bw + 4), by, bw, 26, name, fn)));
  m.inner.add(new Button(h, m.cx, by + 30, m.cw, 24, '放生', () => confirm(h, `确定放生${g.name}吗？放生后就找不回来了。`, () => {
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
  y = section(m, y, '主线 · 新手任务');
  const done2 = mainQuests.slice(0, s.main.step).length;
  m.inner.add(text(h, m.cx + 4, y, `进度 ${done2}/${mainQuests.length}`, { color: C.brown }));
  y += 18;
  if (!q || s.main.state === 'done') {
    m.inner.add(text(h, m.cx + 4, y, '新手任务都完成了！往南经村南草原去下邳之路，许昌在 P2 开放。', { wrap: m.cw - 8, color: C.green }));
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
  y = section(m, y, '支线 · 赏金猎人');
  if (s.bounty) {
    const o = bountyOptions.find((b) => b.id === s.bounty!.id)!;
    m.inner.add(text(h, m.cx + 4, y, `悬赏令：打败${monsters[o.monster].name} ${s.bounty.count}/${o.count}，赏银${o.silver}两。${s.bounty.count >= o.count ? '已完成，回新手村找捕快领赏。' : ''}`, { wrap: m.cw - 8 }));
  } else {
    m.inner.add(text(h, m.cx + 4, y, '没有进行中的悬赏令。新手村的捕快那里可以接。', { wrap: m.cw - 8, color: C.gray }));
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
    const ids = mode === 'buy' ? Object.keys(items).filter((id) => items[id].cat === 'drug') : Object.keys(s.bag).filter((id) => !items[id].quest && sellPrice(id) > 0);
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
  const m = new Modal(h, '技能学校');
  const dyn = h.add.container(0, 0);
  m.inner.add(dyn);
  const render = () => {
    dyn.removeAll(true);
    let y = m.cy;
    dyn.add(text(h, m.cx, y, `本职业：${classes[s.player.classId].name}。学技能、升技能都免费。`, { wrap: m.cw, color: C.brown }));
    y += 20;
    for (const row of skillSchool(s)) {
      const def = skills[row.id];
      const hgt = 26 + textLines(def.desc, m.cw - 80, 2) + 18;
      const g = h.add.graphics();
      frame(g, m.cx, y, m.cw, hgt, 'tan');
      dyn.add(g);
      const lv = row.state ? `${row.state.level}级` : '未学习';
      dyn.add(text(h, m.cx + 8, y + 6, `${def.name}${def.short ? `（${def.short}）` : ''}`, { color: C.darkRed }));
      dyn.add(text(h, m.cx + 8 + 12 * (def.name.length + (def.short ? 3 : 0)) + 8, y + 6, lv, { color: row.state ? C.green : C.gray }));
      dyn.add(text(h, m.cx + 8, y + 24, def.desc, { wrap: m.cw - 80, lineGap: 2 }));
      const info = row.state ? `熟练度 ${row.state.prof}/${profCap(row.state.level)}　耗精力${skillMp(def.mp, row.state.level)}` : `${def.learnLevel}级可学　耗精力${skillMp(def.mp, 1)}`;
      dyn.add(text(h, m.cx + 8, y + hgt - 18, info, { color: C.brown }));
      if (row.action) {
        dyn.add(new Button(h, m.cx + m.cw - 64, y + 8, 56, 24, row.action === 'learn' ? '学习' : '升级', () => {
          const r = row.action === 'learn' ? learnSkill(s, row.id) : upgradeSkill(s, row.id);
          h.refresh();
          toast(h, r);
          sfx('level');
          render();
        }, { style: 'red' }));
      } else {
        dyn.add(text(h, m.cx + m.cw - 8, y + 12, row.reason, { align: 'right', color: C.gray }));
      }
      y += hgt + 4;
    }
    dyn.add(text(h, m.cx, y + 2, `熟练度够了回来升级，升级后熟练度不清零。人物每${balance.skill.roleLevelPerSkillLevel}级可以多升一级技能。`, { wrap: m.cw, color: C.gray }));
    y += 36;
    const extra = ['副将技能学习', '副将技能升级', '研习神将技', '转熟练度'];
    extra.forEach((name, i) => dyn.add(new Button(h, m.cx + (i % 2) * (m.cw / 2 + 2), y + Math.floor(i / 2) * 30, m.cw / 2 - 2, 26, name, () => toast(h, i < 2 ? '常人副将不能学技能；英才、将才在 P2 开放' : `${name}在 P3 开放`))));
  };
  render();
}

// ===== 公告（系统消息） =====
export function messagesPanel(h: Host): void {
  const s = store.save;
  const m = new Modal(h, '公告 · 系统消息');
  const area = new ScrollArea(h, m.cx, m.cy, m.cw, m.ph - 40, m.inner);
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
export function helpPanel(h: Host): void {
  const m = new Modal(h, '攻略');
  const tips = [
    '【战斗】每回合先给主角下指令，再给出战副将下指令，各有60秒。点「自动」后，每个人重复上一次的招式（精力不够就普攻）。',
    '【招降】把怪物打到残血再招降，成功率高得多；你比它等级高也更容易。历史名将不能招降。招降成功后变成常人副将。',
    '【招将】战斗中主角可以用「招将」把出战副将换成另外的随行副将。',
    '【中计】乱：随机攻击场上目标，可能打自己人。封：无法行动。围：不能普攻和放技能，能用道具，挨打就醒。',
    '【中毒】巫蛊极毒能叠加，每回合开始时先结算，之后每回合是第一回合的一半。',
    '【技能】放技能涨熟练度，熟练度满了去技能学校手动升级，升级后熟练度不清零。',
    '【加点】体质加气血和防御；力量加攻击和负重；智力加精力，不加技能伤害；敏捷加速度，速度快先出手。',
    '【前后排】敌人前排没倒下之前，普攻打不到后排；技能不受影响。',
    '【医馆】10级以前治疗免费。背包满了（负重）就买不了药、捡不了东西。',
    '【寻路】「功能 → 任务」里点「开启寻路」，会自动走到任务地点。',
    '【存档】自动保存在这个浏览器里。换手机、清缓存前，在「功能 → 退出」里导出存档。',
  ];
  const area = new ScrollArea(h, m.cx, m.cy, m.cw, m.ph - 40, m.inner);
  let y = 0;
  for (const t of tips) {
    area.content.add(text(h, 2, y, t, { wrap: m.cw - 10, lineGap: 3 }));
    y += textLines(t, m.cw - 10, 3) + 8;
  }
  area.setContentHeight(y);
}

// ===== 退出（存档管理） =====
export function exitPanel(h: Host): void {
  const m = new Modal(h, '退出', { h: 300, w: 280 });
  let y = m.cy + 4;
  const add = (label: string, fn: () => void, style: 'red' | 'tan' = 'tan') => {
    m.inner.add(new Button(h, m.cx, y, m.cw, 30, label, fn, { style }));
    y += 38;
  };
  add('导出存档', () => {
    store.flush();
    const s = store.save;
    const blob = new Blob([serialize(s)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `像素三国-${s.player.name}-${s.player.level}级.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast(h, '存档文件已下载');
  });
  add(isMuted() ? '打开音效' : '关闭音效', () => {
    setMuted(!isMuted());
    m.close();
    toast(h, isMuted() ? '音效已关闭' : '音效已打开');
  });
  add('回到标题', () => {
    store.flush();
    h.scene.start('Title');
  });
  add('删除存档', () => confirm(h, '删除后无法恢复，确定吗？建议先导出。', () => {
    store.clear();
    h.scene.start('Title');
  }, '删除'), 'red');
  m.inner.add(text(h, m.cx, y, '游戏会自动保存在这个浏览器里。', { wrap: m.cw, color: C.gray }));
}

// ===== 此地玩家 =====
export function playersPanel(h: Host): void {
  const s = store.save;
  const list = playersAt(s.location);
  const m = new Modal(h, `此地玩家（${list.length}）`);
  const area = new ScrollArea(h, m.cx, m.cy, m.cw, m.ph - 40, m.inner);
  list.forEach((pl, i) => {
    const y = i * 38;
    area.content.add(new Button(h, 0, y, m.cw - 100, 34, '', () => playerDetail(h, pl), { clip: area }));
    area.content.add(h.add.image(4, y + 5, avatarTex(h, heroLookKey(pl.classId, pl.gender), pl.variant)).setOrigin(0).setCrop(0, 0, 24, 24));
    area.content.add(text(h, 32, y + 4, pl.name, { color: C.darkRed }));
    area.content.add(text(h, 32, y + 18, `${pl.level}级${playerClassName(pl)}`, { color: C.brown }));
    area.content.add(new Button(h, m.cw - 96, y + 6, 42, 22, '队', () => toast(h, '组队在 P3 开放（雇 AI 队友）'), { clip: area }));
    area.content.add(new Button(h, m.cw - 50, y + 6, 42, 22, '聊', () => toast(h, `${pl.name}：你好呀，一起加油！`), { clip: area }));
  });
  area.setContentHeight(list.length * 38);
}

function playerDetail(h: Host, pl: AiPlayer): void {
  const m = new Modal(h, '玩家详情', { h: 320, w: 300 });
  const fg = h.add.graphics();
  frame(fg, m.cx, m.cy, 52, 52, 'tan');
  m.inner.add(fg);
  m.inner.add(h.add.image(m.cx + 2, m.cy + 2, avatarTex(h, heroLookKey(pl.classId, pl.gender), pl.variant)).setOrigin(0).setScale(2));
  m.inner.add(text(h, m.cx + 60, m.cy + 4, pl.name, { color: C.darkRed, scale: 2 }));
  m.inner.add(text(h, m.cx + 60, m.cy + 34, `${pl.level}级${playerClassName(pl)}`, { color: C.brown }));
  const info = ['阶层：平民', '段位：无', '称号：无', '帮派：无', `活力：${pl.level * 3}`, `魅力：${pl.level * 2}`, '摊位：无', '房产：无'];
  info.forEach((t, i) => m.inner.add(text(h, m.cx + (i % 2) * 140, m.cy + 62 + Math.floor(i / 2) * 16, t)));
  const btns = ['发信息', '加好友', '查看包', '加黑', '切磋', '禁言'];
  btns.forEach((b, i) => m.inner.add(new Button(h, m.cx + (i % 3) * 94, m.cy + 136 + Math.floor(i / 3) * 30, 88, 26, b, () => toast(h, b === '切磋' ? '切磋（打 AI 镜像）在 P3 开放' : '单机版没有其他真人玩家'))));
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
  if (n.bounty) opts.push({ label: '悬赏令', fn: () => bountyPanel(h) });
  if (opts.length) opts.push({ label: '返回', fn: () => {} });
  showDialog(h, lines, opts);
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function quizRound(h: Host, npcId: string): void {
  const s = store.save;
  if (s.quiz.day !== today()) s.quiz = { day: today(), answered: [] };
  if (s.quiz.answered.length >= 3) {
    showDialog(h, [{ who: npcId, text: '今天的题都答过啦，明天再来陪我说说话吧。' }]);
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

function bountyPanel(h: Host): void {
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
  bountyOptions.forEach((o, i) => {
    const y = m.cy + 22 + i * 40;
    m.inner.add(new Button(h, m.cx, y, m.cw, 34, '', () => {
      const r = acceptBounty(s, o.id);
      m.close();
      done(h, r);
    }));
    m.inner.add(text(h, m.cx + 10, y + 10, `打败${o.count}个${monsters[o.monster].name}`, { color: C.darkRed }));
    m.inner.add(text(h, m.cx + m.cw - 10, y + 10, `赏银${o.silver}两`, { align: 'right', color: C.darkRed }));
  });
  m.inner.add(text(h, m.cx, m.cy + 150, '小偷在村北山林、村南草原、村西荒山；草寇在村南草原、村西荒山；盗贼在村东竹林。', { wrap: m.cw, color: C.gray }));
}

