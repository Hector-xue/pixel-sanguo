// 主界面：顶部地点名 + 场景图；左边状态栏；右边 人物/设施/移动/功能 四个分页；下面此地玩家条和聊天区
import Phaser from 'phaser';
import { setChrome, syncHeight } from '../ui/screen';
import { C } from '../art/palette';
import { avatarTex, heroLookKey, sceneTex } from '../art/textures';
import { classes, locations, monsters, npcs } from '../data';
import { randomSeed } from '../core/rng';
import { expToNext } from '../core/formulas';
import { chatterTick, playersAt } from '../game/chatter';
import { groupLabel, startBattle } from '../game/encounter';
import {
  arrive, currentQuest, exitsOf, findPath, generalStats, moneyText, moveTo, npcMark, playerStats, questDestination, questProgressText, heroVariant,
} from '../game/state';
import { dailyTick, welfarePending } from '../game/welfare';
import { welfarePanel } from '../ui/fun';
import { FACILITIES } from '../ui/town';
import * as T from '../ui/town';
import * as F from '../ui/fun';
import * as R from '../ui/role';
import { store } from '../game/store';
import { ChatBox } from '../ui/chat';
import { Button, H, ScrollArea, W, bar, goldFrame, hit, sfx, text, toast } from '../ui/widgets';
import { UI, drawFace, fireTex, vgrad } from '../art/chrome';
import * as P from '../ui/panels';
import * as X from '../ui/p3';
import * as G4 from '../ui/p4';
import { announce } from '../game/guozhan';
import { autoTick } from '../game/cloud';
import { checkAchievements } from '../game/achv';
import { treasureNow } from '../game/events';
import { log } from '../game/state';

type Tab = 'people' | 'facility' | 'move' | 'func';
const TABS: [Tab, string][] = [['people', '人物'], ['facility', '设施'], ['move', '移动'], ['func', '功能']];
const DIR_ARROW: Record<string, string> = { up: '↑', down: '↓', left: '←', right: '→' };

const TOP = 24;
const MID_Y = TOP;
// 原版按 640 高排；屏幕更长时多出来的高度七成给上半区（人物列表、状态栏），剩下的给聊天区，不让内容全挤在顶上
let MID_H = 292;
let TAB_Y = MID_Y + MID_H;
let PLAYERS_Y = TAB_Y + 32;
let CHAT_Y = PLAYERS_Y + 28;
function layout(): void {
  MID_H = 292 + Math.round(Math.max(0, H - 640) * 0.7);
  TAB_Y = MID_Y + MID_H;
  PLAYERS_Y = TAB_Y + 32;
  CHAT_Y = PLAYERS_Y + 28;
}
const LEFT_W = 132;

let tab: Tab = 'people';

export class MainScene extends Phaser.Scene implements P.Host {
  private layer!: Phaser.GameObjects.Container;
  chat!: ChatBox;
  private walking = false;

  constructor() {
    super('Main');
  }

  create(): void {
    // 战斗中进出过全屏：回到主界面时按新高度排
    syncHeight(this.game);
    layout();
    setChrome('#0a0604');
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
    // 抢宝开场时在系统频道公告一次
    this.time.addEvent({ delay: 15000, loop: true, callback: () => this.announceTreasure() });
    // 国战大事（城池易主）进公告
    this.time.addEvent({ delay: 60000, loop: true, callback: () => {
      announce(store.save);
    // 云存档自动同步：每分钟看一眼，有变化且离上次满 5 分钟就传；切到后台时不等
    const sync = (due: boolean) => void autoTick(store.save, due).then((msg) => msg && toast(this, msg, 3200));
    this.time.addEvent({ delay: 60000, loop: true, callback: () => sync(false) });
    const onHide = () => document.visibilityState === 'hidden' && sync(true);
    document.addEventListener('visibilitychange', onHide);
    this.events.once('shutdown', () => document.removeEventListener('visibilitychange', onHide));
      this.chat.refresh();
    } });
    announce(store.save);
    this.announceTreasure();
    const daily = dailyTick(store.save);
    this.refresh();
    if (daily.length) toast(this, daily.join('\n'), 2600);
    if (import.meta.env.DEV) Object.assign(window, { __P: P, __T: T, __F: F, __R: R, __X: X, __G4: G4, __store: store, __main: this });
  }

  // 存档变了就整页重画，简单可靠
  refresh(): void {
    const got = checkAchievements(store.save);
    if (got.length) this.time.delayedCall(300, () => toast(this, got.join('\n'), 2800));
    store.commit();
    this.layer.removeAll(true);
    this.drawTop();
    this.drawStatus();
    this.drawTabs();
    this.drawPlayers();
    this.drawTabContent();
    this.chat.refresh();
  }

  // 顶栏：一条远景画 + 地点名（原版顶上那条山水）
  private drawTop(): void {
    const s = store.save;
    const loc = locations[s.location];
    this.layer.add(this.add.image(0, -36, sceneTex(this, loc.art, 180, 40, 0.62)).setOrigin(0).setScale(2).setCrop(0, 18, 180, 12));
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.35).fillRect(0, 0, W, TOP);
    g.fillStyle(0x000000).fillRect(0, TOP - 1, W, 1);
    g.fillStyle(UI.stoneHi).fillRect(0, TOP - 2, W, 1);
    this.layer.add(g);
    this.layer.add(text(this, W / 2, 5, loc.name, { align: 'center', color: UI.white, stroke: 0x000000 }));
    this.layer.add(text(this, 6, 5, s.server, { color: UI.cream, stroke: 0x000000 }));
  }

  private drawStatus(): void {
    const s = store.save;
    const p = s.player;
    const st = playerStats(s);
    const x = 0;
    const y = MID_Y;
    const w = LEFT_W;
    const g = this.add.graphics();
    goldFrame(g, x, y, w, MID_H, 0x0c0806);
    // 头像圈
    g.fillStyle(UI.goldLo).fillRect(x + 6, y + 6, 50, 50);
    g.fillStyle(UI.gold).fillRect(x + 7, y + 7, 48, 48);
    g.fillStyle(0x10204a).fillRect(x + 8, y + 8, 46, 46);
    this.layer.add(g);
    this.layer.add(this.add.image(x + 7, y + 7, avatarTex(this, heroLookKey(p.classId, p.gender), heroVariant(s))).setOrigin(0).setScale(2));
    this.layer.add(hit(this, x + 6, y + 6, 50, 50, () => P.statusPanel(this)));
    this.layer.add(text(this, x + 60, y + 9, p.name, { color: UI.white }));
    this.layer.add(text(this, x + 60, y + 25, `${p.level}级${classes[p.classId].name}`, { color: UI.cream }));
    this.layer.add(text(this, x + 60, y + 41, p.gender === 'male' ? '男' : '女', { color: UI.dim }));

    // 血条精力条：原版是两根饱和的红蓝长条，数字压在条上
    const by = y + 62;
    this.layer.add(bar(this, x + 6, by, w - 12, 13, p.hp / st.maxHp, C.red, C.darkRed));
    this.layer.add(text(this, x + w / 2, by, `${p.hp}/${st.maxHp}`, { align: 'center', color: UI.white, stroke: 0x000000 }));
    this.layer.add(bar(this, x + 6, by + 16, w - 12, 13, p.mp / st.maxMp, C.lightBlue, C.navy));
    this.layer.add(text(this, x + w / 2, by + 16, `${p.mp}/${st.maxMp}`, { align: 'center', color: UI.white, stroke: 0x000000 }));

    // 随行副将三格（原版是一排灰色"将"字圆槽）
    const gy = by + 36;
    const sg = this.add.graphics();
    sg.fillStyle(0x000000).fillRect(x + 5, gy - 1, w - 10, 40);
    vgrad(sg, x + 6, gy, w - 12, 38, [0x5a4a44, 0x3a2c28, 0x2a1e1a]);
    this.layer.add(sg);
    for (let i = 0; i < 3; i++) {
      const gx = x + 9 + i * 39;
      const gen = s.generals[i];
      const fg = this.add.graphics();
      const active = gen && gen.uid === s.activeGeneral;
      fg.fillStyle(active ? UI.goldHi : 0x8a8a90).fillRect(gx, gy + 2, 36, 34);
      fg.fillStyle(active ? 0x7a2a10 : 0x2c2a30).fillRect(gx + 1, gy + 3, 34, 32);
      this.layer.add(fg);
      if (gen) {
        this.layer.add(this.add.image(gx + 6, gy + 4, avatarTex(this, gen.look)).setOrigin(0));
        const gs = generalStats(gen);
        this.layer.add(bar(this, gx + 4, gy + 29, 28, 4, gen.hp / gs.maxHp, C.red, C.darkRed));
        this.layer.add(hit(this, gx, gy, 36, 36, () => P.generalDetail(this, gen.uid)));
      } else {
        this.layer.add(text(this, gx + 18, gy + 12, '将', { align: 'center', color: 0x9a9aa0 }));
        this.layer.add(hit(this, gx, gy, 36, 36, () => toast(this, '野外把怪物打到残血，用「招降」收为副将')));
      }
    }

    // 资料框：职业、银、金、升级还需经验
    const iy = gy + 44;
    const ig = this.add.graphics();
    ig.fillStyle(UI.goldLo).fillRect(x + 5, iy, w - 10, MID_H - (iy - y) - 6);
    ig.fillStyle(0x000000).fillRect(x + 6, iy + 1, w - 12, MID_H - (iy - y) - 8);
    this.layer.add(ig);
    this.layer.add(text(this, x + 10, iy + 5, `职业：${p.level}级${classes[p.classId].name}`, { color: UI.white }));
    this.layer.add(text(this, x + 10, iy + 21, `银：${moneyText(p.silver)}`, { color: UI.white }));
    this.layer.add(text(this, x + 10, iy + 37, `金：${moneyText(p.gold)}`, { color: UI.yellow }));
    this.layer.add(text(this, x + 10, iy + 53, '升级还需经验：', { color: UI.white }));
    this.layer.add(text(this, x + w / 2, iy + 68, `${expToNext(p.level) - p.exp}`, { align: 'center', color: UI.white }));
    this.layer.add(bar(this, x + 10, iy + 84, w - 20, 4, p.exp / expToNext(p.level), C.gold, C.sand));
    let qy = iy + 94;
    if (p.free > 0) {
      this.layer.add(new Button(this, x + 9, qy, w - 18, 20, `可分配属性点 ${p.free}`, () => P.allocatePanel(this), { style: 'red' }));
      qy += 24;
    }
    const q = questProgressText(s);
    this.layer.add(hit(this, x, qy - 2, w, y + MID_H - qy, () => P.questPanel(this)));
    this.layer.add(text(this, x + 10, qy, `任务：${q}`, { wrap: w - 20, color: currentQuest(s) && s.main.state === 'ready' ? UI.red : UI.green, lineGap: 2 }));
  }

  // 四个分页：原版是一排橙色金属牌，选中的那块发亮
  private drawTabs(): void {
    const g = this.add.graphics();
    g.fillStyle(0x000000).fillRect(0, TAB_Y, W, 32);
    this.layer.add(g);
    TABS.forEach(([id, name], i) => {
      const b = new Button(this, i * 90 + 1, TAB_Y + 1, 88, 30, '', () => {
        tab = id;
        this.refresh();
      }, { style: tab === id ? 'dark' : 'orange' });
      this.layer.add(b);
      this.layer.add(text(this, i * 90 + 45, TAB_Y + 3, name, { align: 'center', color: tab === id ? 0xc01000 : 0xfff4d0, stroke: tab === id ? 0xffffff : 0x6a2000, scale: 2 }));
    });
  }

  private drawPlayers(): void {
    const s = store.save;
    const ps = playersAt(s.location);
    const g = this.add.graphics();
    g.fillStyle(0x000000).fillRect(0, PLAYERS_Y, W, 28);
    g.fillStyle(0x2a2a30).fillRect(0, PLAYERS_Y + 27, W, 1);
    this.layer.add(g);
    ps.slice(0, 9).forEach((pl, i) => {
      const img = this.add.image(6 + i * 30, PLAYERS_Y + 2, avatarTex(this, heroLookKey(pl.classId, pl.gender), pl.variant)).setOrigin(0).setCrop(0, 0, 24, 24);
      this.layer.add(img);
    });
    this.layer.add(text(this, W - 8, PLAYERS_Y + 8, `更多(${ps.length})`, { align: 'right', color: UI.white }));
    this.layer.add(hit(this, 0, PLAYERS_Y, W, 28, () => P.playersPanel(this)));
  }

  private drawTabContent(): void {
    const x = LEFT_W;
    const y = MID_Y;
    const w = W - LEFT_W;
    const g = this.add.graphics();
    goldFrame(g, x, y, w, MID_H, null);
    this.layer.add(g);
    this.layer.add(this.add.image(x + 4, y + 4, fireTex(this, w - 8, MID_H - 8)).setOrigin(0));
    // 分页名水印（原版右下角那两个蓝色大字）
    const name = TABS.find(([id]) => id === tab)![1];
    this.layer.add(text(this, x + w - 14, y + MID_H - 40, name, { align: 'right', color: 0x4a9cff, stroke: 0xffffff, scale: 2 }).setAlpha(0.9));
    if (tab === 'people') this.drawPeople(x + 6, y + 6, w - 12, MID_H - 12);
    else if (tab === 'facility') this.drawFacilities(x + 6, y + 6, w - 12);
    else if (tab === 'move') this.drawMove(x + 6, y + 6, w - 12);
    else this.drawFunc(x + 6, y + 6, w - 12);
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
      this.row(c, yy, w, avatarTex(this, n.look), `${n.name}${mark ? ' ' + mark : ''}`, mark ? UI.red : UI.white, '对话', () => P.talkTo(this, id), area, !!mark);
      yy += 32;
    }
    loc.groups.forEach((gr, gi) => {
      const m = monsters[gr.monster];
      const lv = gr.level[0] === gr.level[1] ? `${gr.level[0]}` : `${gr.level[0]}-${gr.level[1]}`;
      const isTarget = hereIsTarget && s.main.state === 'active' && q?.target?.monster === gr.monster;
      this.row(c, yy, w, avatarTex(this, m.look), `${groupLabel(gr)} ${lv}级`, m.boss ? UI.yellow : UI.white, '战斗', () => this.fight(gi), area, isTarget);
      yy += 32;
    });
    if (X.treasureHere(s)) {
      this.row(c, yy, w, avatarTex(this, 'guardian'), '宝藏守卫（抢宝）', UI.yellow, '抢宝', () => X.fightTreasure(this), area, true);
      yy += 32;
    }
    if (!loc.npcs.length && !loc.groups.length) c.add(text(this, 2, yy, '这里空无一人。', { color: C.gray }));
    area.setContentHeight(yy);
  }

  private row(c: Phaser.GameObjects.Container, y: number, w: number, avatar: string, label: string, color: number, action: string, fn: () => void, area: ScrollArea, arrow: boolean): void {
    // 原版的列表：透明底，一行一条暗金分隔线
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.35).fillRect(0, y, w - 4, 30);
    g.fillStyle(UI.line).fillRect(0, y + 30, w - 4, 1);
    c.add(g);
    c.add(this.add.image(3, y + 3, avatar).setOrigin(0).setCrop(0, 0, 24, 24));
    c.add(text(this, 32, y + 8, label, { color, stroke: 0x000000 }));
    c.add(new Button(this, w - 52, y + 5, 44, 20, action, fn, { style: action === '战斗' ? 'red' : 'tan', clip: area, color: action === '战斗' ? undefined : 0x1a3cc0 }));
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
      g.fillStyle(0x000000, 0.35).fillRect(0, yy, w - 6, 36);
      g.fillStyle(UI.line).fillRect(0, yy + 36, w - 6, 1);
      area.content.add(g);
      area.content.add(text(this, 8, yy + 3, name, { color: UI.white, stroke: 0x000000 }));
      area.content.add(text(this, 8, yy + 19, desc, { color: UI.cream }));
      area.content.add(new Button(this, w - 58, yy + 7, 48, 22, '进入', () => open(this), { clip: area }));
    });
    area.setContentHeight(fac.length * 40);
  }

  private drawMove(x: number, y: number, w: number): void {
    const s = store.save;
    const loc = locations[s.location];
    const g = this.add.graphics();
    goldFrame(g, x, y + 20, 96, 96, null);
    this.layer.add(g);
    this.layer.add(this.add.image(x + 4, y + 24, sceneTex(this, loc.art, 88, 88, 0.4)).setOrigin(0));
    // 地点名牌（原版小地图上那块蓝底白字）
    const pg = this.add.graphics();
    drawFace(pg, x, y, 96, 18, 'blue');
    this.layer.add(pg);
    this.layer.add(text(this, x + 48, y + 3, loc.name, { align: 'center', color: UI.white, stroke: 0x0a1450 }));
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
    this.layer.add(text(this, x + 2, y + Math.max(124, rows * 34) + 6, '「功能 → 任务」里可以开启寻路，自动走到任务地点。', { wrap: w - 6, color: UI.cream, stroke: 0x000000 }));
  }

  private drawFunc(x: number, y: number, w: number): void {
    const items: [string, () => void][] = [
      ['状态', () => P.statusPanel(this)], ['物品', () => P.bagPanel(this)], ['副将', () => P.generalsPanel(this)],
      ['组队', () => X.teamPanel(this)], ['排行', () => X.rankPanel(this)], ['国战', () => G4.guozhanPanel(this)],
      ['邮件', () => welfarePanel(this)], ['任务', () => P.questPanel(this)], ['擂台', () => X.arenaPanel(this)],
      ['帮派', () => X.sectPanel(this)], ['训练', () => X.trainingPanel(this)], ['宝库', () => X.vaultPanel(this)],
      ['公告', () => P.messagesPanel(this)], ['攻略', () => P.helpPanel(this)], ['退出', () => P.exitPanel(this)],
    ];
    // 原版功能格：暗底白字，右边一枚金色箭头楔，横线分行
    const bw = Math.floor(w / 3);
    const g = this.add.graphics();
    this.layer.add(g);
    items.forEach(([name, fn], i) => {
      const bx = x + (i % 3) * bw;
      const by = y + Math.floor(i / 3) * 34;
      const dot = (name === '状态' && store.save.player.free > 0) || (name === '任务' && store.save.main.state === 'ready') || (name === '邮件' && (welfarePending(store.save) || X.festivalPending(store.save))) || (name === '国战' && G4.guozhanPending(store.save));
      g.fillStyle(0x000000, 0.4).fillRect(bx, by, bw - 2, 32);
      if (i % 3 === 0) g.fillStyle(UI.line).fillRect(x, by + 32, w, 1);
      // 金楔：上宽下窄的斜三角
      for (let k = 0; k < 16; k++) {
        const len = Math.max(1, 14 - k);
        g.fillStyle(k < 3 ? UI.goldHi : k < 9 ? UI.gold : UI.goldLo).fillRect(bx + bw - 6 - len, by + 8 + k, len, 1);
      }
      this.layer.add(text(this, bx + 6, by + 10, name, { color: dot ? UI.red : UI.white, stroke: 0x000000 }));
      if (dot) this.layer.add(text(this, bx + 6 + name.length * 12, by + 4, '●', { color: UI.red, raw: true }));
      this.layer.add(hit(this, bx, by, bw - 2, 32, fn));
    });
    this.layer.add(new Button(this, x + 20, y + 5 * 34 + 8, w - 40, 24, '任务帮助使者', () => P.talkTo(this, 'bangzhu'), { style: 'red' }));
  }

  private announceTreasure(): void {
    const s = store.save;
    const t = treasureNow(s);
    if (!t.open || !t.at) return;
    const key = `tr_${new Date().toDateString()}_${t.hour}`;
    if (s.flags[key]) return;
    for (const k of Object.keys(s.flags)) if (k.startsWith('tr_')) delete s.flags[k];
    s.flags[key] = true;
    log(s, `抢宝开始了！宝藏出现在【${locations[t.at].name}】，去「设施 → 战场」可以直接传送`);
    this.chat.refresh();
    store.commit();
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
