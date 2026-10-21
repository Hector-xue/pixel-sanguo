// 主界面：顶部地点名 + 场景图；左边状态栏；右边 人物/设施/移动/功能 四个分页；下面此地玩家条和聊天区
import Phaser from 'phaser';
import { C } from '../art/palette';
import { avatarTex, heroLookKey, sceneTex } from '../art/textures';
import { classes, locations, monsters, npcs } from '../data';
import { randomSeed } from '../core/rng';
import { expToNext } from '../core/formulas';
import { chatterTick, playersAt } from '../game/chatter';
import { groupLabel, startBattle } from '../game/encounter';
import {
  arrive, currentQuest, exitsOf, findPath, generalStats, moneyText, moveTo, npcMark, playerStats, questDestination, questProgressText,
} from '../game/state';
import { dailyTick, welfarePending } from '../game/welfare';
import { welfarePanel } from '../ui/fun';
import { FACILITIES } from '../ui/town';
import * as T from '../ui/town';
import * as F from '../ui/fun';
import * as R from '../ui/role';
import { store } from '../game/store';
import { ChatBox } from '../ui/chat';
import { Button, H, ScrollArea, W, bar, frame, hit, rect, sfx, text, toast } from '../ui/widgets';
import * as P from '../ui/panels';

type Tab = 'people' | 'facility' | 'move' | 'func';
const TABS: [Tab, string][] = [['people', '人物'], ['facility', '设施'], ['move', '移动'], ['func', '功能']];
const DIR_ARROW: Record<string, string> = { up: '↑', down: '↓', left: '←', right: '→' };

const TOP = 20;
const BANNER_H = 64;
const MID_Y = TOP + BANNER_H;
const MID_H = 268;
const TAB_Y = MID_Y + MID_H;
const PLAYERS_Y = TAB_Y + 28;
const CHAT_Y = PLAYERS_Y + 26;

let tab: Tab = 'people';

export class MainScene extends Phaser.Scene implements P.Host {
  private layer!: Phaser.GameObjects.Container;
  chat!: ChatBox;
  private walking = false;

  constructor() {
    super('Main');
  }

  create(): void {
    if (!store.has()) {
      this.scene.start('Title');
      return;
    }
    this.layer = this.add.container(0, 0);
    this.chat = new ChatBox(this, 0, CHAT_Y, W, H - CHAT_Y);
    this.time.addEvent({
      delay: 9000, loop: true, callback: () => {
        if (Math.random() < 0.6) {
          chatterTick();
          this.chat.refresh();
        }
      },
    });
    const daily = dailyTick(store.save);
    this.refresh();
    if (daily.length) toast(this, daily.join('\n'), 2600);
    if (import.meta.env.DEV) Object.assign(window, { __P: P, __T: T, __F: F, __R: R, __store: store, __main: this });
  }

  // 存档变了就整页重画，简单可靠
  refresh(): void {
    store.commit();
    this.layer.removeAll(true);
    this.drawTop();
    this.drawStatus();
    this.drawTabs();
    this.drawPlayers();
    this.drawTabContent();
    this.chat.refresh();
  }

  private drawTop(): void {
    const s = store.save;
    const loc = locations[s.location];
    const g = this.add.graphics();
    rect(g, 0, 0, W, TOP, C.darkBrown);
    rect(g, 0, TOP - 1, W, 1, C.ink);
    this.layer.add(g);
    this.layer.add(text(this, W / 2, 4, loc.name, { align: 'center', color: C.yellow }));
    this.layer.add(text(this, 6, 4, s.server, { color: C.tan }));
    this.layer.add(this.add.image(0, TOP, sceneTex(this, loc.art, 180, BANNER_H / 2, 0.62)).setOrigin(0).setScale(2));
  }

  private drawStatus(): void {
    const s = store.save;
    const p = s.player;
    const st = playerStats(s);
    const x = 0;
    const y = MID_Y;
    const w = 130;
    const g = this.add.graphics();
    frame(g, x, y, w, MID_H, 'paper');
    frame(g, x + 4, y + 4, 52, 52, 'tan');
    this.layer.add(g);
    this.layer.add(this.add.image(x + 6, y + 6, avatarTex(this, heroLookKey(p.classId, p.gender), p.avatar)).setOrigin(0).setScale(2));
    this.layer.add(hit(this, x + 4, y + 4, 52, 52, () => P.statusPanel(this)));
    this.layer.add(text(this, x + 60, y + 8, p.name, { color: C.darkRed }));
    this.layer.add(text(this, x + 60, y + 24, `${p.level}级${classes[p.classId].name}`));
    this.layer.add(text(this, x + 60, y + 40, p.gender === 'male' ? '男' : '女', { color: C.brown }));

    const by = y + 62;
    this.layer.add(text(this, x + 6, by, '气血', { color: C.red }));
    this.layer.add(bar(this, x + 34, by + 3, 90, 8, p.hp / st.maxHp, C.red, C.darkRed));
    this.layer.add(text(this, x + 124, by + 13, `${p.hp}/${st.maxHp}`, { align: 'right', color: C.brown }));
    this.layer.add(text(this, x + 6, by + 30, '精力', { color: C.blue }));
    this.layer.add(bar(this, x + 34, by + 33, 90, 8, p.mp / st.maxMp, C.lightBlue, C.navy));
    this.layer.add(text(this, x + 124, by + 43, `${p.mp}/${st.maxMp}`, { align: 'right', color: C.brown }));

    // 随行副将三格
    const gy = by + 62;
    for (let i = 0; i < 3; i++) {
      const gx = x + 6 + i * 40;
      const gen = s.generals[i];
      const fg = this.add.graphics();
      frame(fg, gx, gy, 36, 36, gen && gen.uid === s.activeGeneral ? 'red' : 'tan');
      this.layer.add(fg);
      if (gen) {
        this.layer.add(this.add.image(gx + 6, gy + 4, avatarTex(this, gen.look)).setOrigin(0));
        const gs = generalStats(gen);
        this.layer.add(bar(this, gx + 4, gy + 29, 28, 4, gen.hp / gs.maxHp, C.red, C.darkRed));
        this.layer.add(hit(this, gx, gy, 36, 36, () => P.generalDetail(this, gen.uid)));
      } else {
        this.layer.add(text(this, gx + 18, gy + 11, '将', { align: 'center', color: C.tan }));
        this.layer.add(hit(this, gx, gy, 36, 36, () => toast(this, '野外把怪物打到残血，用「招降」收为副将')));
      }
    }

    const iy = gy + 44;
    this.layer.add(text(this, x + 6, iy, `银：${moneyText(p.silver)}`, { color: C.darkBrown }));
    this.layer.add(text(this, x + 70, iy, `金：${moneyText(p.gold)}`, { color: C.darkRed }));
    this.layer.add(text(this, x + 6, iy + 18, `升级还需经验：${expToNext(p.level) - p.exp}`, { color: C.brown }));
    this.layer.add(bar(this, x + 6, iy + 34, 118, 5, p.exp / expToNext(p.level), C.gold, C.sand));
    if (p.free > 0) {
      this.layer.add(new Button(this, x + 6, iy + 44, 118, 20, `可分配属性点 ${p.free}`, () => P.allocatePanel(this), { style: 'red' }));
    }
    const q = questProgressText(s);
    const qy = iy + 70;
    this.layer.add(hit(this, x, qy - 2, w, y + MID_H - qy, () => P.questPanel(this)));
    this.layer.add(text(this, x + 6, qy, `任务：${q}`, { wrap: 118, color: currentQuest(s) && s.main.state === 'ready' ? C.red : C.green, lineGap: 2 }));
  }

  private drawTabs(): void {
    TABS.forEach(([id, name], i) => {
      const b = new Button(this, i * 90, TAB_Y, 90, 28, name, () => {
        tab = id;
        this.refresh();
      }, { style: tab === id ? 'dark' : 'tan' });
      this.layer.add(b);
    });
  }

  private drawPlayers(): void {
    const s = store.save;
    const ps = playersAt(s.location);
    const g = this.add.graphics();
    frame(g, 0, PLAYERS_Y, W, 26, 'paper');
    this.layer.add(g);
    this.layer.add(text(this, 6, PLAYERS_Y + 7, '此地玩家', { color: C.brown }));
    ps.slice(0, 8).forEach((pl, i) => {
      const img = this.add.image(62 + i * 28, PLAYERS_Y + 2, avatarTex(this, heroLookKey(pl.classId, pl.gender), pl.variant)).setOrigin(0).setCrop(0, 2, 24, 22);
      this.layer.add(img);
    });
    this.layer.add(new Button(this, W - 66, PLAYERS_Y + 3, 62, 20, `更多(${ps.length})`, () => P.playersPanel(this)));
  }

  private drawTabContent(): void {
    const x = 130;
    const y = MID_Y;
    const w = W - 130;
    const g = this.add.graphics();
    frame(g, x, y, w, MID_H, 'paper');
    this.layer.add(g);
    if (tab === 'people') this.drawPeople(x + 4, y + 4, w - 8, MID_H - 8);
    else if (tab === 'facility') this.drawFacilities(x + 4, y + 4, w - 8);
    else if (tab === 'move') this.drawMove(x + 4, y + 4, w - 8);
    else this.drawFunc(x + 4, y + 4, w - 8);
  }

  private drawPeople(x: number, y: number, w: number, h: number): void {
    const s = store.save;
    const loc = locations[s.location];
    const area = new ScrollArea(this, x, y, w, h, this.layer);
    const c = area.content;
    let yy = 0;
    const q = currentQuest(s);
    const dest = questDestination(s);
    const hereIsTarget = dest === s.location;
    const guideNpc = loc.npcs.find((n) => npcMark(s, n));
    if (guideNpc && s.player.level < 15) {
      c.add(text(this, 2, yy, `点击箭头处，与${npcs[guideNpc].name}对话`, { color: C.red, wrap: w - 6 }));
      yy += 18;
    }
    for (const id of loc.npcs) {
      const n = npcs[id];
      const mark = npcMark(s, id);
      this.row(c, yy, w, avatarTex(this, n.look), `${n.name}${mark ? ' ' + mark : ''}`, mark ? C.red : C.darkBrown, '对话', () => P.talkTo(this, id), area, !!mark);
      yy += 32;
    }
    loc.groups.forEach((gr, gi) => {
      const m = monsters[gr.monster];
      const lv = gr.level[0] === gr.level[1] ? `${gr.level[0]}` : `${gr.level[0]}-${gr.level[1]}`;
      const isTarget = hereIsTarget && s.main.state === 'active' && q?.target?.monster === gr.monster;
      this.row(c, yy, w, avatarTex(this, m.look), `${groupLabel(gr)} ${lv}级`, m.boss ? C.darkRed : C.darkBrown, '战斗', () => this.fight(gi), area, isTarget);
      yy += 32;
    });
    if (!loc.npcs.length && !loc.groups.length) c.add(text(this, 2, yy, '这里空无一人。', { color: C.gray }));
    area.setContentHeight(yy);
  }

  private row(c: Phaser.GameObjects.Container, y: number, w: number, avatar: string, label: string, color: number, action: string, fn: () => void, area: ScrollArea, arrow: boolean): void {
    const g = this.add.graphics();
    frame(g, 0, y, w - 4, 30, 'tan');
    c.add(g);
    c.add(this.add.image(3, y + 3, avatar).setOrigin(0).setCrop(0, 0, 24, 24));
    c.add(text(this, 32, y + 8, label, { color }));
    c.add(new Button(this, w - 54, y + 4, 46, 22, action, fn, { style: action === '战斗' ? 'red' : 'tan', clip: area }));
    if (arrow) {
      const a = text(this, w - 70, y + 8, '◀', { color: C.red });
      c.add(a);
      this.tweens.add({ targets: a, x: a.x - 4, duration: 300, yoyo: true, repeat: -1, ease: 'Stepped', easeParams: [2] });
    }
  }

  private drawFacilities(x: number, y: number, w: number): void {
    const loc = locations[store.save.location];
    const fac = loc.facilities ?? [];
    if (!loc.town || !fac.length) {
      this.layer.add(text(this, x + 2, y + 2, '野外没有设施。\n回城镇（新手村、翠竹山庄、许昌、颍阳、陈）才能用医馆等设施。', { wrap: w - 6, color: C.gray }));
      return;
    }
    const area = new ScrollArea(this, x, y, w, MID_H - 8, this.layer);
    fac.forEach((f, i) => {
      const [name, desc, open] = FACILITIES[f];
      const yy = i * 40;
      const g = this.add.graphics();
      frame(g, 0, yy, w - 6, 36, 'tan');
      area.content.add(g);
      area.content.add(text(this, 8, yy + 3, name, { color: C.darkRed }));
      area.content.add(text(this, 8, yy + 19, desc, { color: C.brown }));
      area.content.add(new Button(this, w - 58, yy + 7, 48, 22, '进入', () => open(this), { clip: area }));
    });
    area.setContentHeight(fac.length * 40);
  }

  private drawMove(x: number, y: number, w: number): void {
    const s = store.save;
    const loc = locations[s.location];
    const g = this.add.graphics();
    frame(g, x, y, 96, 96, 'tan');
    this.layer.add(g);
    this.layer.add(this.add.image(x + 3, y + 3, sceneTex(this, loc.art, 90, 90, 0.4)).setOrigin(0));
    this.layer.add(text(this, x + 48, y + 100, loc.name, { align: 'center', color: C.darkRed }));
    const exits = exitsOf(s.location);
    exits.forEach((e, i) => {
      const yy = y + i * 34;
      this.layer.add(new Button(this, x + 104, yy, w - 108, 30, `${DIR_ARROW[e.dir]} ${e.name}`, () => {
        if (e.locked) return toast(this, `${e.name}，还不能去`);
        this.walkTo(e.to);
      }, { disabled: false, color: e.locked ? C.gray : undefined }));
    });
    if (s.location === 'baodong') {
      this.layer.add(new Button(this, x + 104, y, w - 108, 30, '离开宝洞，回许昌', () => this.walkTo('xuchang'), { style: 'red' }));
    } else if (s.location !== 'xinshoucun' && !exits.some((e) => e.to === 'xinshoucun')) {
      this.layer.add(new Button(this, x + 104, y + exits.length * 34, w - 108, 30, '返回新手村', () => {
        moveTo(s, 'xinshoucun');
        sfx('step');
        tab = 'people';
        this.refresh();
      }, { style: 'red' }));
    }
    const rows = exits.length + (s.location !== 'xinshoucun' && !exits.some((e) => e.to === 'xinshoucun') ? 1 : 0);
    this.layer.add(text(this, x + 2, y + Math.max(118, rows * 34) + 6, '「功能 → 任务」里可以开启寻路，自动走到任务地点。', { wrap: w - 6, color: C.gray }));
  }

  private drawFunc(x: number, y: number, w: number): void {
    const items: [string, () => void][] = [
      ['状态', () => P.statusPanel(this)], ['物品', () => P.bagPanel(this)], ['副将', () => P.generalsPanel(this)],
      ['组队', () => P.notYet(this, '组队', '单机版改成雇 AI 队友，P3 开放')], ['排行', () => P.notYet(this, '排行', '和 AI 玩家一起排名，P3 开放')], ['好友', () => P.notYet(this, '好友', '单机版没有其他真人玩家，去掉了好友')],
      ['邮件', () => welfarePanel(this)], ['任务', () => P.questPanel(this)], ['擂台', () => P.notYet(this, '擂台', '打 AI 排位赛，P3 开放')],
      ['帮派', () => P.notYet(this, '帮派', '34级开放，加入 NPC 帮派，P3 开放')], ['训练', () => P.notYet(this, '训练', '花银两挂机涨经验，P3 开放')], ['宝库', () => P.notYet(this, '宝库', '存放超出负重的物品，P3 开放')],
      ['公告', () => P.messagesPanel(this)], ['攻略', () => P.helpPanel(this)], ['退出', () => P.exitPanel(this)],
    ];
    const bw = Math.floor((w - 12) / 3);
    items.forEach(([name, fn], i) => {
      const bx = x + (i % 3) * (bw + 4);
      const by = y + Math.floor(i / 3) * 36;
      const dot = (name === '状态' && store.save.player.free > 0) || (name === '任务' && store.save.main.state === 'ready') || (name === '邮件' && welfarePending(store.save));
      this.layer.add(new Button(this, bx, by, bw, 32, name, fn, { style: dot ? 'red' : 'tan' }));
    });
    this.layer.add(new Button(this, x, y + 5 * 36 + 4, w - 4, 26, '任务帮助使者', () => P.talkTo(this, 'bangzhu')));
  }

  fight(groupIndex: number): void {
    const s = store.save;
    const st = playerStats(s);
    if (s.player.hp <= st.maxHp * 0.15) {
      toast(this, '气血太少了，先吃药或去医馆治疗');
      return;
    }
    const b = startBattle(s, groupIndex, randomSeed());
    store.flush();
    this.scene.start('Battle', { battle: b });
  }

  walkTo(to: string): void {
    if (moveTo(store.save, to)) {
      sfx('step');
      tab = 'people';
      this.refresh();
    }
  }

  // 开启寻路：一站一站自动走过去
  autoPath(dest: string): void {
    if (this.walking) return;
    const path = findPath(store.save.location, dest);
    if (!path) return toast(this, '找不到路');
    if (path.length === 1) {
      tab = 'people';
      this.refresh();
      return toast(this, '已经在目的地了');
    }
    this.walking = true;
    let i = 1;
    const step = () => {
      arrive(store.save, path[i]);
      sfx('step');
      tab = 'people';
      this.refresh();
      toast(this, i < path.length - 1 ? `寻路中…… → ${locations[path[path.length - 1]].name}` : `到达${locations[path[i]].name}`, 350);
      i++;
      if (i < path.length) this.time.delayedCall(450, step);
      else this.walking = false;
    };
    step();
  }
}
