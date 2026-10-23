// 主界面：上半屏是当前地点的场景舞台（NPC、怪物、游荡的侠客都站在场景里，点人就能交互），
// 按真实时间分晨昏夜，有飘叶炊烟萤火；下面是状态栏、聊天条、底部五个导航（设施 / 地图 / 行囊 / 副将 / 功能）。
import Phaser from 'phaser';
import { setChrome, syncHeight } from '../ui/screen';
import { C } from '../art/palette';
import { avatarTex, bustTex, funcIconTex, heroLookKey, iconTex, propTex, sceneTex, uiIconTex, unitTex } from '../art/textures';
import { FEET_Y, UNIT_H, UNIT_W, BX } from '../art/units';
import { GLOW, OUTDOOR_DARK, daypart, layoutProps } from '../art/props';
import type { Daypart } from '../art/props';
import { balance, classes, items, locations, monsters, npcs } from '../data';
import type { MonsterGroup } from '../data';
import { randomSeed } from '../core/rng';
import { expToNext } from '../core/formulas';
import { playersAt } from '../game/chatter';
import { groupLabel, startBattle, startGroupBattle } from '../game/encounter';
import {
  arrive, currentQuest, exitsOf, findPath, generalStats, moneyText, moveTo, npcMark, playerStats, questDestination, questProgressText, heroVariant,
} from '../game/state';
import { dailyTick, welfarePending } from '../game/welfare';
import { rollJourney } from '../game/journey';
import type { JourneyEvent } from '../game/journey';
import { welfarePanel } from '../ui/fun';
import { FACILITIES } from '../ui/town';
import * as T from '../ui/town';
import * as F from '../ui/fun';
import * as R from '../ui/role';
import { store } from '../game/store';
import { ChatBox } from '../ui/chat';
import { Button, H, Modal, SAFE_TOP, W, achvBanner, bar, resumeBanner, hit, sfx, text, textWidth, toast, wrap } from '../ui/widgets';
import { fit } from '../ui/textfit';
import { UI, sealBox, timeTint, titlePlaque, vgrad } from '../art/chrome';
import { showDialog } from '../ui/dialog';
import { worldMap } from '../ui/worldmap';
import { gatherGame, lifePanel } from '../ui/life';
import { formationPanel } from '../ui/formation';
import { badgeSpot, findBadge, hasBadge } from '../game/badges';
import { runTips } from '../ui/tips';
import { FORMS, bestFormation, clash, clashText, enemyFormation, myFormation, setFormation } from '../game/formation';
import { SPOT_SIZE, spotKind, spotLeft } from '../game/life';
import type { GatherKind } from '../game/life';
import * as P from '../ui/panels';
import * as X from '../ui/p3';
import * as G4 from '../ui/p4';
import { announce } from '../game/guozhan';
import { storyTick } from '../game/gzstory';
import { autoTick } from '../game/cloud';
import { checkAchievements } from '../game/achv';
import { festivalToday, treasureNow } from '../game/events';
import { WEATHER_NAMES, seasonOf, weatherOf } from '../game/weather';
import { isDeployed, log } from '../game/state';
import { today } from '../game/calendar';
import { playJingle, playMusic } from '../ui/audio';
import { sweep, sweepReason } from '../game/sweep';
import { dailyCount } from '../game/daily';
import { dailyPanel } from '../ui/daily';
import { maybeWhatsNew } from '../ui/changelog';
import { pointAt } from '../ui/pointer';
import { setSceneBack } from '../ui/back';
import { buzz } from '../ui/haptics';

const DIR_ARROW: Record<string, string> = { up: '↑', down: '↓', left: '←', right: '→' };
const DIR_NAME: Record<string, string> = { up: '北', down: '南', left: '西', right: '东' };

// 版面：舞台占满上面，底下依次是状态栏、聊天条、导航；屏幕越长舞台越大
const HUD_H = 58;
const NAV_H = 54;
let CHAT_H = 96;
let STAGE_H = 432;
function layout(): void {
  CHAT_H = Math.max(84, Math.min(124, Math.round(H * 0.14)));
  STAGE_H = H - HUD_H - NAV_H - CHAT_H;
}
// 舞台里地平线的位置（场景图的 horizon 比例）
const HORIZON = 0.34;
const OFF = BX - UNIT_W / 2;

const SHICHEN = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
// 功能菜单：名字对应的图标
const FUNC_KEYS: Record<string, string> = {
  状态: 'status', 物品: 'items', 副将: 'generals', 任务: 'quest', 组队: 'team', 排行: 'rank', 国战: 'guozhan', 福利: 'welfare',
  擂台: 'arena', 帮派: 'sect', 训练: 'train', 宝库: 'vault', 生活: 'life', 阵法: 'formation', 攻略: 'guide', 设置: 'settings',
};

function shichen(d = new Date()): string {
  return `${SHICHEN[Math.floor(((d.getHours() + 1) % 24) / 2)]}时`;
}

interface Actor {
  kind: 'npc' | 'group' | 'treasure' | 'passer';
  id: string;
  look: string;
  variant: number;
  name: string;
  color: number;
  mark?: string;
  target?: boolean;
  count?: number;
  onTap: () => void;
}

export class MainScene extends Phaser.Scene implements P.Host {
  private layer!: Phaser.GameObjects.Container;
  private stage!: Phaser.GameObjects.Container;
  private ambient: Phaser.Time.TimerEvent[] = [];
  // 每帧跟着走的小事（侠客的点击区跟着人挪）；舞台重建时清空
  private followers: (() => void)[] = [];
  chat!: ChatBox;
  private walking = false;
  private stageKey = '';

  constructor() {
    super('Main');
  }

  create(): void {
    // 战斗中进出过全屏：回到主界面时按新高度排
    syncHeight(this.game);
    layout();
    setSceneBack(null);
    setChrome('#0a0604');
    if (!store.has()) {
      this.scene.start('Title');
      return;
    }
    this.stageKey = '';
    this.followers = [];
    const tick = () => this.followers.forEach((f) => f());
    this.events.on('update', tick);
    this.events.once('shutdown', () => this.events.off('update', tick));
    this.stage = this.add.container(0, 0);
    this.layer = this.add.container(0, 0).setDepth(10);
    this.chat = new ChatBox(this, 0, STAGE_H + HUD_H, W, CHAT_H, { compact: true, defer: true, onTap: () => this.chatSheet() });
    this.chat.root.setDepth(10);
    // 抢宝开场时在系统频道公告一次
    this.time.addEvent({ delay: 15000, loop: true, callback: () => this.announceTreasure() });
    // 国战大事（城池易主）进公告
    this.time.addEvent({ delay: 60000, loop: true, callback: () => {
      announce(store.save);
      this.chat.refresh();
    } });
    // 云存档自动同步：每分钟看一眼，有变化且离上次满 5 分钟就传；切到后台时不等
    const sync = (due: boolean) => void autoTick(store.save, due).then((msg) => msg && toast(this, msg, 3200));
    this.time.addEvent({ delay: 60000, loop: true, callback: () => sync(false) });
    const onHide = () => document.visibilityState === 'hidden' && sync(true);
    document.addEventListener('visibilitychange', onHide);
    this.events.once('shutdown', () => document.removeEventListener('visibilitychange', onHide));
    // 换时辰的时候重画一下舞台（晨昏夜）
    this.time.addEvent({ delay: 60000, loop: true, callback: () => {
      const k = this.stageSignature();
      if (k !== this.stageKey) this.refresh();
    } });
    announce(store.save);
    // 国战纪事：沙盘上出了大事，谋士来说两句（一次最多讲两件，其余只进见闻）
    const beats = storyTick(store.save);
    if (beats.length) this.time.delayedCall(500, () => this.scene.isActive() && showDialog(this, beats.slice(0, 2).flatMap((b) => b.lines)));
    this.announceTreasure();
    const daily = dailyTick(store.save);
    this.refresh();
    this.cameras.main.fadeIn(260, 10, 6, 4);
    if (daily.length) toast(this, daily.join('\n'), 2600);
    resumeBanner(this);
    // 更新后第一次进来：说说更新了什么（新角色不弹）
    if (!beats.length) this.time.delayedCall(700, () => this.scene.isActive() && maybeWhatsNew(this, store.save.battles));
    if (import.meta.env.DEV) Object.assign(window, { __P: P, __T: T, __F: F, __R: R, __X: X, __G4: G4, __store: store, __main: this });
  }

  // 存档变了就整页重画，简单可靠；舞台只在地点、时辰、人物变了才重建（不然动画会一直重来）
  refresh(): void {
    // 城里城外两首曲子
    const here = locations[store.save.location];
    playMusic(here?.town ? 'town' : OUTDOOR_DARK.has(here?.art) ? 'cave' : daypart() === 'night' ? 'night' : 'field');
    const got = checkAchievements(store.save);
    if (got.length) this.time.delayedCall(300, () => achvBanner(this, got));
    store.commit();
    const sig = this.stageSignature();
    if (sig !== this.stageKey) {
      this.stageKey = sig;
      this.drawStage();
    }
    this.layer.removeAll(true);
    this.drawStageHud();
    this.drawHud();
    this.drawNav();
    this.chat.refresh();
    // 江湖指引：新东西第一次用得上时提一句（等转场、对话这些先过去）
    this.time.delayedCall(900, () => this.scene.isActive() && runTips(this));
  }

  private stageSignature(): string {
    const s = store.save;
    const loc = locations[s.location];
    const marks = loc.npcs.map((n) => npcMark(s, n) ?? '').join('');
    return `${s.location}|${daypart()}|${weatherOf(s.location, loc.art)}|${marks}|${s.main.step}:${s.main.state}|${X.treasureHere(s) ? 1 : 0}|${H}|${spotLeft(s, s.location)}|${hasBadge(s, s.location) ? 1 : 0}`;
  }

  // ===== 舞台 =====
  private drawStage(): void {
    for (const t of this.ambient) t.remove();
    this.ambient = [];
    this.followers = [];
    this.stage.removeAll(true);
    const s = store.save;
    const loc = locations[s.location];
    const dp = daypart();
    const sh = Math.ceil(STAGE_H / 2);
    this.stage.add(this.add.image(0, 0, sceneTex(this, loc.art, 180, sh, HORIZON)).setOrigin(0).setScale(2));
    const hz = Math.round(STAGE_H * HORIZON);
    const top = hz + 34;
    const bottom = STAGE_H - 22;
    const actors = this.actors();
    // 采集点占一个站位（排在人后面），摆设也避开它
    const gk = spotKind(s.location);
    const spots = this.actorSpots(actors.length + (gk ? 1 : 0), top, bottom);
    const props = layoutProps(loc.art, s.location, W, hz + 8, bottom + 8, spots);
    const night = dp === 'night' || OUTDOOR_DARK.has(loc.art);
    const glows: [number, number][] = [];
    for (const p of props) {
      const key = propTex(this, p.kind, p.seed);
      const img = this.add.image(p.x, p.y, key).setOrigin(0.5, 1).setDepth(p.y);
      if (p.x > W / 2 && p.kind !== 'sign') img.setFlipX(true);
      this.stage.add(img);
      const gl = GLOW[p.kind];
      if (gl) for (const [gx, gy] of gl) {
        const fx = img.flipX ? img.width - gx : gx;
        glows.push([Math.round(p.x - img.width / 2 + fx), Math.round(p.y - img.height + gy)]);
      }
      if (p.kind === 'fire') this.flames(p.x, p.y - 6);
      if ((p.kind === 'house') && !OUTDOOR_DARK.has(loc.art)) this.smoke(p.x + (img.flipX ? -10 : 10), p.y - img.height + 4);
    }
    actors.forEach((a, i) => this.drawActor(a, spots[i][0], spots[i][1]));
    if (gk) this.drawGatherSpot(gk, spots[actors.length][0], spots[actors.length][1]);
    if (!hasBadge(s, s.location)) this.drawBadge(top, bottom, spots);
    this.passersby(top);
    // 时辰滤镜：晨橙、暮紫、夜蓝；夜里灯笼、营火、窗户亮起暖光
    const tint: Record<Daypart, [number, number] | null> = { dawn: [0xffe4c8, 1], day: null, dusk: [0xffccb0, 1], night: [0x5a64a8, 1] };
    const tt = OUTDOOR_DARK.has(loc.art) ? null : tint[dp];
    if (tt) this.stage.add(timeTint(this, 0, 0, W, STAGE_H, tt[0]).setDepth(900));
    if (night || dp === 'dusk') for (const [gx, gy] of glows) {
      const c = this.add.circle(gx, gy, 16, 0xffa040, 0.22).setBlendMode(Phaser.BlendModes.ADD).setDepth(901);
      const c2 = this.add.circle(gx, gy, 6, 0xffd080, 0.35).setBlendMode(Phaser.BlendModes.ADD).setDepth(901);
      this.stage.add([c, c2]);
      this.tweens.add({ targets: [c, c2], alpha: { from: 0.7, to: 1 }, duration: 600 + Math.random() * 400, yoyo: true, repeat: -1 });
    }
    this.weather(loc.art, dp, hz);
    // 舞台下沿压一道暗影，接住下面的状态栏
    const g = this.add.graphics().setDepth(950);
    vgrad(g, 0, STAGE_H - 18, W, 18, [0x000000, 0x0a0604]);
    g.setAlpha(0.55);
    this.stage.add(g);
  }

  private actors(): Actor[] {
    const s = store.save;
    const loc = locations[s.location];
    const out: Actor[] = [];
    const q = currentQuest(s);
    const dest = questDestination(s);
    for (const id of loc.npcs) {
      const n = npcs[id];
      const mark = npcMark(s, id) ?? undefined;
      out.push({ kind: 'npc', id, look: n.look, variant: 0, name: n.name, color: mark ? UI.yellow : 0xfbefd0, mark, onTap: () => P.talkTo(this, id) });
    }
    loc.groups.forEach((gr, gi) => {
      const m = monsters[gr.monster];
      const lv = gr.level[0] === gr.level[1] ? `${gr.level[0]}` : `${gr.level[0]}-${gr.level[1]}`;
      const target = dest === s.location && s.main.state === 'active' && q?.target?.monster === gr.monster;
      out.push({ kind: 'group', id: `g${gi}`, look: m.look, variant: 0, name: `${groupLabel(gr)} ${lv}级`, color: m.boss ? UI.yellow : 0xffb0a0, target, count: gr.count[1], onTap: () => this.groupCard(gi, gr) });
    });
    if (X.treasureHere(s)) out.push({ kind: 'treasure', id: 'treasure', look: 'guardian', variant: 0, name: '宝藏守卫', color: UI.yellow, target: true, onTap: () => X.fightTreasure(this) });
    return out;
  }

  // 站位：交错排开，前排靠下；人少就站中间一点
  private actorSpots(n: number, top: number, bottom: number): [number, number][] {
    const slots: [number, number][] = [
      [0.26, 0.18], [0.74, 0.24], [0.42, 0.42], [0.62, 0.5], [0.16, 0.6], [0.86, 0.66], [0.32, 0.82], [0.7, 0.88], [0.5, 1], [0.1, 0.96],
    ];
    const span = bottom - top;
    return slots.slice(0, n).map(([u, v]) => [Math.round(20 + u * (W - 40)), Math.round(top + v * span)]);
  }

  private drawActor(a: Actor, x: number, y: number): void {
    const flip = x < W / 2;
    const depth = y;
    const shadow = this.add.ellipse(x, y + 1, 26, 6, 0x000000, 0.28).setDepth(depth - 0.5);
    this.stage.add(shadow);
    const sprites: Phaser.GameObjects.Image[] = [];
    const mk = (dx: number, dy: number, d: number) => {
      const img = this.add.image(x + dx + (flip ? OFF : -OFF), y + dy, unitTex(this, a.look, a.variant, 'idle')).setOrigin(0.5, FEET_Y / UNIT_H).setFlipX(flip).setDepth(depth + d);
      this.stage.add(img);
      sprites.push(img);
      return img;
    };
    // 一群怪：后面再站一个
    if (a.kind === 'group' && (a.count ?? 1) > 1) {
      const back = mk(flip ? -12 : 12, -8, -1);
      back.setTint(0xc8c0b8);
    }
    const main = mk(0, 0, 0);
    // 待机：两帧交替 + 一点上下起伏，各人节奏不同
    let f = false;
    this.ambient.push(this.time.addEvent({ delay: 520 + Math.random() * 300, loop: true, callback: () => {
      f = !f;
      for (const sp of sprites) sp.setTexture(unitTex(this, a.look, a.variant, f ? 'idle2' : 'idle'));
    } }));
    // 名牌：脚下一块暗色小牌
    const nw = textWidth(a.name) + 10;
    const plate = this.add.graphics().setDepth(800 + depth / 1000);
    plate.fillStyle(0x0a0604, 0.72).fillRect(x - nw / 2, y + 4, nw, 15).fillRect(x - nw / 2 + 1, y + 3, nw - 2, 17);
    if (a.kind === 'group') plate.fillStyle(0xb42c18).fillRect(x - nw / 2 + 1, y + 18, nw - 2, 1);
    this.stage.add([plate, text(this, x, y + 5, a.name, { align: 'center', color: a.color, stroke: 0x000000 }).setDepth(801 + depth / 1000)]);
    // 头顶标记：任务「！」「？」、任务目标的红箭头
    if (a.mark || a.target) {
      const mx = x;
      const my = y - 70;
      const g = this.add.graphics().setDepth(820);
      if (a.mark) {
        // 金色（可接）/ 绿色（可交）气泡，里面一个大号「！」「？」
        const c = a.mark === '?' ? 0x8af060 : 0xffd040;
        g.fillStyle(0x2a1604).fillRect(mx - 11, my - 13, 22, 26).fillRect(mx - 12, my - 12, 24, 24);
        g.fillStyle(c).fillRect(mx - 10, my - 12, 20, 24).fillRect(mx - 11, my - 11, 22, 22);
        g.fillStyle(0xffffff, 0.6).fillRect(mx - 9, my - 11, 14, 2);
        g.fillStyle(0x2a1604).fillTriangle(mx - 4, my + 13, mx + 4, my + 13, mx, my + 18);
        g.fillStyle(c).fillTriangle(mx - 2, my + 12, mx + 2, my + 12, mx, my + 15);
      } else {
        g.fillStyle(0x3a0804).fillTriangle(mx - 8, my - 2, mx + 8, my - 2, mx, my + 10);
        g.fillStyle(0xf04424).fillTriangle(mx - 6, my - 1, mx + 6, my - 1, mx, my + 7);
      }
      this.stage.add(g);
      const parts: Phaser.GameObjects.GameObject[] = [g];
      if (a.mark) {
        const t = text(this, mx, my - 12, a.mark === '?' ? '?' : '!', { align: 'center', color: 0x2a1604, scale: 2 }).setDepth(821);
        this.stage.add(t);
        parts.push(t);
      }
      this.tweens.add({ targets: parts, y: '-=3', duration: 380, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
    const z = hit(this, x - 22, y - 58, 44, 80, () => {
      // 点人：先跳一下表示点到了
      this.tweens.add({ targets: main, y: main.y - 4, duration: 70, yoyo: true });
      a.onTap();
    }).setDepth(830);
    this.stage.add(z);
  }

  // 藏着的徽章：地上一小块暗红，隔几秒反一下光；点到就收下
  private drawBadge(top: number, bottom: number, spots: [number, number][]): void {
    const s = store.save;
    const b = badgeSpot(s.location);
    let x = Math.round(20 + b.u * (W - 40));
    const y = Math.round(top + b.v * (bottom - top));
    // 别和人、采集点挤在一起（点不到）
    for (let k = 0; k < 6 && spots.some(([sx, sy]) => Math.abs(sx - x) < 34 && Math.abs(sy - y) < 40); k++) x = 20 + ((x - 20 + 70) % (W - 40));
    const g = this.add.graphics().setDepth(y - 1);
    g.fillStyle(0x6a1a0c, 0.7).fillRect(x - 2, y - 2, 5, 4);
    g.fillStyle(0xb44a2a, 0.6).fillRect(x - 1, y - 2, 3, 1);
    this.stage.add(g);
    const glint = this.add.graphics().setDepth(y).setAlpha(0);
    glint.fillStyle(0xffffff).fillRect(x, y - 6, 1, 9).fillRect(x - 4, y - 2, 9, 1);
    glint.fillStyle(0xfff0a0).fillRect(x - 1, y - 3, 3, 3);
    this.stage.add(glint);
    this.tweens.add({ targets: glint, alpha: 1, duration: 220, yoyo: true, repeat: -1, repeatDelay: 2800 + (x % 7) * 300, delay: 600 });
    this.stage.add(hit(this, x - 16, y - 16, 32, 30, () => {
      const lines = findBadge(s, s.location);
      if (!lines.length) return;
      sfx('level');
      for (let k = 0; k < 10; k++) {
        const p = this.add.rectangle(x, y - 4, 2, 2, k % 2 ? 0xffe070 : 0xffffff).setDepth(900);
        this.stage.add(p);
        const a = (k / 10) * Math.PI * 2;
        this.tweens.add({ targets: p, x: x + Math.cos(a) * 18, y: y - 4 + Math.sin(a) * 12, alpha: 0, duration: 500, onComplete: () => p.destroy() });
      }
      store.commit();
      this.time.delayedCall(300, () => {
        showDialog(this, lines.map((t) => ({ who: '', text: t })), [], () => this.refresh());
      });
    }).setDepth(829));
  }

  // 采集点：水边一圈涟漪 / 一块带矿脉的石头 / 一丛草药，上面闪着光；挖空了就灰掉
  private drawGatherSpot(kind: GatherKind, x: number, y: number): void {
    const s = store.save;
    const left = spotLeft(s, s.location);
    const g = this.add.graphics().setDepth(y);
    if (kind === 'fish') {
      g.fillStyle(0x3a6a90).fillEllipse(x, y - 2, 46, 14);
      g.fillStyle(0x6aa0c8).fillEllipse(x, y - 3, 38, 9);
      g.lineStyle(1, 0xd8f0ff, 0.9).strokeEllipse(x + 4, y - 3, 14, 4);
      g.fillStyle(0x5a3a1c).fillRect(x - 20, y - 20, 2, 18);
      g.lineStyle(1, 0x2a1a10).lineBetween(x - 19, y - 20, x + 4, y - 3);
    } else if (kind === 'mine') {
      g.fillStyle(0x3a342e).fillEllipse(x, y - 8, 36, 22);
      g.fillStyle(0x6a6058).fillEllipse(x - 3, y - 10, 30, 16);
      g.fillStyle(0x8a7e70).fillEllipse(x - 6, y - 13, 14, 6);
      g.fillStyle(0xd8a040).fillRect(x - 6, y - 10, 3, 2).fillRect(x + 4, y - 7, 2, 2).fillRect(x, y - 14, 2, 1);
    } else {
      g.fillStyle(0x2a5a1a).fillEllipse(x, y - 6, 30, 14);
      g.fillStyle(0x4a8a2a).fillEllipse(x - 6, y - 9, 14, 8).fillEllipse(x + 6, y - 10, 14, 8);
      g.fillStyle(0xf8f0d0).fillRect(x - 3, y - 14, 2, 2).fillRect(x + 4, y - 15, 2, 2);
    }
    if (!left) g.setAlpha(0.45);
    this.stage.add(g);
    // 闪光：几颗金点轮流亮
    if (left) for (let k = 0; k < 3; k++) {
      const p = this.add.rectangle(x - 10 + k * 10, y - 18 - (k % 2) * 6, 2, 2, 0xfff0a0).setDepth(y + 1).setAlpha(0);
      this.stage.add(p);
      this.tweens.add({ targets: p, alpha: 1, duration: 300, yoyo: true, repeat: -1, delay: k * 280, repeatDelay: 600 });
    }
    const label = `${({ fish: '钓鱼', mine: '采矿', herb: '采药' } as const)[kind]} ${left}/${SPOT_SIZE}`;
    const nw = textWidth(label) + 10;
    const plate = this.add.graphics().setDepth(800);
    plate.fillStyle(0x0a0604, 0.72).fillRect(x - nw / 2, y + 4, nw, 15).fillRect(x - nw / 2 + 1, y + 3, nw - 2, 17);
    plate.fillStyle(0x6ab0d0).fillRect(x - nw / 2 + 1, y + 18, nw - 2, 1);
    this.stage.add([plate, text(this, x, y + 5, label, { align: 'center', color: left ? 0xd8f0ff : 0x9a9a9a, stroke: 0x000000 }).setDepth(801)]);
    this.stage.add(hit(this, x - 26, y - 26, 52, 48, () => {
      if (!left) return toast(this, '这一处已经空了，多走几个地方再回来');
      gatherGame(this, () => this.refresh());
    }).setDepth(830));
  }

  // 游荡的江湖侠客：在后排慢慢来回走，点他可以切磋、雇来同行
  private passersby(top: number): void {
    const s = store.save;
    const ps = playersAt(s.location).slice(0, locations[s.location].town ? 3 : 1);
    ps.forEach((pl, i) => {
      const y = Math.round(top - 26 + i * 6);
      const look = heroLookKey(pl.classId, pl.gender);
      let x = 30 + Math.random() * (W - 60);
      const img = this.add.image(x, y, unitTex(this, look, pl.variant, 'idle')).setOrigin(0.5, FEET_Y / UNIT_H).setDepth(y).setAlpha(0.95);
      this.stage.add(img);
      const nm = this.add.ellipse(x, y + 1, 18, 4, 0x000000, 0.22).setDepth(y - 1);
      this.stage.add(nm);
      const walk = () => {
        const nx = 30 + Math.random() * (W - 60);
        const dur = Math.abs(nx - x) * 40 + 400;
        img.setFlipX(nx > x);
        let f = false;
        const step = this.time.addEvent({ delay: 220, loop: true, callback: () => {
          f = !f;
          img.setTexture(unitTex(this, look, pl.variant, f ? 'idle2' : 'idle'));
        } });
        this.ambient.push(step);
        this.tweens.add({ targets: [img, nm], x: nx, duration: dur, onComplete: () => {
          step.remove();
          x = nx;
          this.ambient.push(this.time.delayedCall(1500 + Math.random() * 4000, walk));
        } });
      };
      this.ambient.push(this.time.delayedCall(800 + i * 1200, walk));
      const z = hit(this, x - 14, y - 50, 28, 56, () => P.playerDetail(this, pl)).setDepth(829);
      this.stage.add(z);
      this.followers.push(() => z.active && z.setX(img.x - 14));
    });
  }

  private flames(x: number, y: number): void {
    const cols = [0xffe060, 0xffa030, 0xf05020];
    this.ambient.push(this.time.addEvent({ delay: 70, loop: true, callback: () => {
      const p = this.add.rectangle(x - 4 + Math.random() * 8, y, 2 + Math.round(Math.random() * 2), 3, cols[Math.floor(Math.random() * 3)]).setOrigin(0).setDepth(y + 20);
      this.stage.add(p);
      this.tweens.add({ targets: p, y: y - 10 - Math.random() * 10, alpha: 0, scale: 0.4, duration: 420, onComplete: () => p.destroy() });
    } }));
  }

  private smoke(x: number, y: number): void {
    this.ambient.push(this.time.addEvent({ delay: 420, loop: true, callback: () => {
      const p = this.add.rectangle(x, y, 3, 3, 0xd8d8d0, 0.6).setOrigin(0).setDepth(y + 1);
      this.stage.add(p);
      this.tweens.add({ targets: p, y: y - 26, x: x + 6 + Math.random() * 6, alpha: 0, scale: 2, duration: 2200, onComplete: () => p.destroy() });
    } }));
  }

  // 环境动效：飘叶 / 落花 / 萤火 / 洞里的浮尘 / 天上的云
  private weather(art: string, dp: Daypart, hz: number): void {
    const leafy = ['forest', 'valley', 'grass', 'road', 'hill', 'bamboo', 'farm'].includes(art);
    const petal = ['village', 'manor', 'city'].includes(art);
    const spawn = (fn: () => void, delay: number) => this.ambient.push(this.time.addEvent({ delay, loop: true, callback: fn }));
    const season = seasonOf();
    const wx = weatherOf(store.save.location, art);
    // 过节：城镇、村子上空挂一排红灯笼
    if (festivalToday() && petal) this.lanterns(hz);
    if (wx === 'rain') {
      // 下雨：天色暗一点，细雨斜着落，地上溅起小水花
      this.stage.add(this.add.rectangle(0, 0, W, STAGE_H, 0x1a2430, 0.16).setOrigin(0).setDepth(895));
      spawn(() => {
        const x = Math.random() * (W + 60);
        const p = this.add.rectangle(x, -8, 1, 6, 0xc8d8f0, 0.55).setOrigin(0).setDepth(896).setAngle(20);
        this.stage.add(p);
        const ty = hz + Math.random() * (STAGE_H - hz);
        this.tweens.add({ targets: p, y: ty, x: x - (ty + 8) * 0.36, duration: 420 + Math.random() * 160, onComplete: () => {
          p.destroy();
          if (Math.random() < 0.3) {
            const d = this.add.rectangle(x - (ty + 8) * 0.36, ty, 3, 1, 0xc8d8f0, 0.6).setOrigin(0.5).setDepth(896);
            this.stage.add(d);
            this.tweens.add({ targets: d, scaleX: 2, alpha: 0, duration: 260, onComplete: () => d.destroy() });
          }
        } });
      }, 28);
      return this.clouds(dp, true);
    }
    if (wx === 'snow') {
      spawn(() => {
        const x = Math.random() * W;
        const p = this.add.rectangle(x, -4, 2, 2, 0xffffff, 0.9).setOrigin(0).setDepth(896);
        this.stage.add(p);
        this.tweens.add({ targets: p, y: hz + Math.random() * (STAGE_H - hz), duration: 4500 + Math.random() * 2500, onComplete: () => this.tweens.add({ targets: p, alpha: 0, duration: 800, onComplete: () => p.destroy() }) });
        this.tweens.add({ targets: p, x: x + 12, duration: 1200 + Math.random() * 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      }, 140);
      return this.clouds(dp, true);
    }
    // 晴天：春天飘花瓣，夏天绿叶，秋天红黄叶，冬天不落叶
    if ((leafy || petal) && dp !== 'night' && season !== 'winter') spawn(() => {
      const autumn = season === 'autumn';
      const c = petal && !autumn ? (Math.random() < 0.5 ? 0xf8b8c8 : 0xffe0e8) : autumn ? [0xd8602a, 0xe8a030, 0xb8401c][Math.floor(Math.random() * 3)] : Math.random() < 0.5 ? 0x86a94a : 0xd8b040;
      const x = Math.random() * W;
      const p = this.add.rectangle(x, -4, 2, 2, c).setOrigin(0).setDepth(890);
      this.stage.add(p);
      this.tweens.add({ targets: p, y: STAGE_H * (0.6 + Math.random() * 0.4), x: x - 40 - Math.random() * 60, duration: 5000 + Math.random() * 3000, onComplete: () => p.destroy() });
      this.tweens.add({ targets: p, scaleX: 0.3, duration: 400, yoyo: true, repeat: -1 });
    }, 700);
    if (dp === 'night' && !OUTDOOR_DARK.has(art) && art !== 'city') spawn(() => {
      const x = 20 + Math.random() * (W - 40);
      const y = hz + 20 + Math.random() * (STAGE_H - hz - 40);
      const p = this.add.rectangle(x, y, 2, 2, 0xd8ff80).setOrigin(0).setDepth(902).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);
      this.stage.add(p);
      this.tweens.add({ targets: p, alpha: 1, yoyo: true, duration: 900, x: x + (Math.random() - 0.5) * 30, y: y - 10 - Math.random() * 10, onComplete: () => p.destroy() });
    }, 300);
    if (OUTDOOR_DARK.has(art)) spawn(() => {
      const x = Math.random() * W;
      const y = Math.random() * STAGE_H;
      const p = this.add.rectangle(x, y, 1, 1, 0xf0e0c0, 0.7).setOrigin(0).setDepth(890);
      this.stage.add(p);
      this.tweens.add({ targets: p, y: y + 20, alpha: 0, duration: 4000, onComplete: () => p.destroy() });
    }, 250);
    if (!OUTDOOR_DARK.has(art)) this.clouds(dp, false);
  }

  // 节日灯笼：一根绳上挂五盏，轻轻晃
  private lanterns(hz: number): void {
    const y0 = Math.max(26, hz - 46);
    const line = this.add.graphics().setDepth(880);
    line.lineStyle(1, 0x3a2414, 0.9).beginPath().moveTo(0, y0).lineTo(W, y0 + 6).strokePath();
    this.stage.add(line);
    for (let i = 0; i < 5; i++) {
      const x = Math.round((W / 5) * (i + 0.5));
      const c = this.add.container(x, y0 + 1 + (i * 6) / 5).setDepth(881);
      const g = this.add.graphics();
      g.fillStyle(0x3a2414).fillRect(0, 0, 1, 4);
      g.fillStyle(0xe8b040).fillRect(-3, 4, 7, 2).fillRect(-3, 16, 7, 2);
      g.fillStyle(0xc8281c).fillRect(-5, 6, 11, 10);
      g.fillStyle(0xe85a3a).fillRect(-3, 7, 3, 8);
      g.fillStyle(0xffd060).fillRect(0, 18, 1, 4);
      c.add(g);
      this.stage.add(c);
      this.tweens.add({ targets: c, angle: { from: -4, to: 4 }, duration: 1400 + i * 120, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
  }

  // 两朵慢慢飘过的云（阴雨天多几朵、颜色灰一点）
  private clouds(dp: Daypart, grey: boolean): void {
    {
      for (let i = 0; i < (grey ? 4 : 2); i++) {
        const cy = 14 + i * (grey ? 12 : 22) + Math.random() * 10;
        const cl = this.add.graphics().setDepth(5).setAlpha(dp === 'night' ? 0.25 : grey ? 0.9 : 0.8);
        const w = 30 + Math.random() * 24;
        cl.fillStyle(grey ? 0xa8b0b8 : 0xffffff).fillRect(0, 4, w, 6).fillRect(6, 0, w * 0.5, 5).fillRect(w * 0.45, 2, w * 0.4, 4);
        cl.fillStyle(grey ? 0x808890 : 0xd8e4f0).fillRect(0, 9, w, 2);
        cl.setPosition(Math.random() * W, cy);
        this.stage.add(cl);
        const drift = () => {
          this.tweens.add({ targets: cl, x: W + 10, duration: (W + 10 - cl.x) * 220, onComplete: () => {
            cl.x = -w - 10;
            drift();
          } });
        };
        drift();
      }
    }
  }

  // 舞台上叠的界面：地名题签、时辰、任务追踪、右上角快捷钮
  private drawStageHud(): void {
    const s = store.save;
    const loc = locations[s.location];
    // 顶上让出状态栏、挖孔的高度（那一截只露天空），字从下面开始
    const T = SAFE_TOP;
    const g = this.add.graphics();
    vgrad(g, 0, T, W, 30, [0x000000, 0x000000]);
    g.setAlpha(0.26);
    this.layer.add(g);
    const pg = this.add.graphics();
    const tw = Math.max(80, textWidth(loc.name) + 32);
    titlePlaque(pg, W / 2, T + 5, tw, 20);
    this.layer.add([pg, text(this, W / 2, T + 8, loc.name, { align: 'center', color: 0xfff0c0, stroke: 0x4a0804 })]);
    const dp = daypart();
    const dpName: Record<Daypart, string> = { dawn: '清晨', day: '白昼', dusk: '黄昏', night: '夜' };
    const wn = WEATHER_NAMES[weatherOf(s.location, loc.art)];
    this.layer.add(text(this, W - 6, T + 8, `${shichen()}·${dpName[dp]}${wn ? `·${wn}` : ''}`, { align: 'right', color: 0xfbefd0, stroke: 0x000000 }));
    this.drawTracker();
    // 右上快捷：今日事务（几件没办）、福利、国战（有事时亮红点）
    const quick: [string, string, () => void, boolean | number][] = [
      ['today', '今日', () => dailyPanel(this), dailyCount(s)],
      ['gift', '福利', () => welfarePanel(this), welfarePending(s) || X.festivalPending(s)],
      ['flag', '国战', () => G4.guozhanPanel(this), G4.guozhanPending(s)],
    ];
    if (s.battles >= 10) this.time.delayedCall(1500, () => this.scene.isActive() && pointAt(this, W - 20, T + 50, 'today', true));
    quick.forEach(([icon, label, fn, dot], i) => {
      const x = W - 34;
      const y = T + 36 + i * 46;
      const qg = this.add.graphics();
      qg.fillStyle(0x000000, 0.45).fillRect(x - 1, y - 1, 30, 30);
      sealBox(qg, x, y, 28);
      this.layer.add(qg);
      this.layer.add(this.add.image(x + 14, y + 13, uiIconTex(this, icon)).setScale(2).setOrigin(0.5));
      this.layer.add(text(this, x + 14, y + 30, label, { align: 'center', color: 0xfbefd0, stroke: 0x000000 }));
      if (typeof dot === 'number' && dot > 0) {
        // 数字红点：还有几件事
        this.layer.add(this.add.circle(x + 26, y + 2, 7, 0xff3020).setStrokeStyle(1, 0xffffff));
        this.layer.add(text(this, x + 26, y - 4, `${Math.min(dot, 9)}`, { align: 'center', color: 0xffffff }));
      } else if (dot === true) this.layer.add(this.add.circle(x + 26, y + 2, 4, 0xff3020).setStrokeStyle(1, 0xffffff));
      this.layer.add(hit(this, x - 2, y - 2, 32, 46, fn));
    });
  }

  // 任务追踪：左上一块半透明墨底卡片，写当前主线；目的地不在这儿就给个「前往」
  private drawTracker(): void {
    const s = store.save;
    const q = currentQuest(s);
    if (!q) return;
    const x = 6;
    const y = SAFE_TOP + 34;
    const w = 196;
    const ready = s.main.state === 'ready';
    const body = s.main.state === 'available' ? `去找${npcs[q.giver]?.name ?? ''}接任务` : questProgressText(s);
    // 按真实折行算高度，最多两行，放不下第二行末尾加省略号
    const all = wrap(body, w - 16);
    const shown = all.length > 2 ? [all[0], fit(all.slice(1).join(''), w - 16)] : all;
    const lines = shown.length;
    const h = 22 + lines * 14 + 4;
    const g = this.add.graphics();
    g.fillStyle(0x0a0604, 0.62).fillRect(x, y, w, h).fillRect(x + 1, y - 1, w - 2, h + 2);
    g.fillStyle(ready ? 0x8af060 : 0xb42c18).fillRect(x, y, 2, h);
    this.layer.add(g);
    // 小红签「主线」
    const tg = this.add.graphics();
    tg.fillStyle(0xb42c18).fillRect(x + 6, y + 4, 28, 14);
    this.layer.add(tg);
    this.layer.add(text(this, x + 20, y + 5, '主线', { align: 'center', color: 0xfff0c0 }));
    this.layer.add(text(this, x + 40, y + 5, fit(q.title, w - 46), { color: ready ? 0x8af060 : UI.yellow, stroke: 0x000000 }));
    this.layer.add(text(this, x + 8, y + 22, shown.join('\n'), { color: 0xfbefd0, lineGap: 2 }));
    this.layer.add(hit(this, x, y, w, h, () => P.questPanel(this)));
    const dest = questDestination(s);
    if (dest && dest !== s.location) {
      this.layer.add(new Button(this, x + w + 4, y + 2, 40, 20, '前往', () => this.autoPath(dest), { style: 'red' }));
      if (s.player.level <= 3) this.time.delayedCall(1200, () => this.scene.isActive() && !this.walking && pointAt(this, x + w + 24, y + 12, 'goto', true));
    }
  }

  // ===== 状态栏 =====
  private drawHud(): void {
    const s = store.save;
    const p = s.player;
    const st = playerStats(s);
    const y = STAGE_H;
    const g = this.add.graphics();
    vgrad(g, 0, y, W, HUD_H, [0x2a1a10, 0x1c120a, 0x140d08]);
    g.fillStyle(0x000000).fillRect(0, y, W, 1);
    // 经验条压在状态栏上沿，金色细线
    const er = p.exp / expToNext(p.level);
    g.fillStyle(0x3a2a14).fillRect(0, y + 1, W, 2);
    g.fillStyle(UI.gold).fillRect(0, y + 1, Math.round(W * Math.max(0, Math.min(1, er))), 2);
    // 头像框
    g.fillStyle(0x000000).fillRect(5, y + 6, 48, 48);
    g.fillStyle(UI.goldLo).fillRect(6, y + 7, 46, 46);
    g.fillStyle(UI.gold).fillRect(7, y + 8, 44, 44);
    g.fillStyle(0x24160c).fillRect(8, y + 9, 42, 42);
    this.layer.add(g);
    const av = this.add.image(29, y + 30, avatarTex(this, heroLookKey(p.classId, p.gender), heroVariant(s))).setScale(2).setOrigin(0.5);
    av.setCrop(1, 1, 22, 22);
    this.layer.add(av);
    if (p.free > 0) {
      this.layer.add(this.add.circle(50, y + 9, 6, 0xd03018).setStrokeStyle(1, 0xffffff));
      this.layer.add(text(this, 50, y + 3, '+', { align: 'center', color: 0xffffff }));
    }
    this.layer.add(hit(this, 4, y + 4, 52, 52, () => (p.free > 0 ? P.allocatePanel(this) : P.statusPanel(this))));
    this.layer.add(text(this, 60, y + 6, p.name, { color: 0xfbefd0, stroke: 0x000000 }));
    this.layer.add(text(this, 62 + textWidth(p.name) + 6, y + 6, `${p.level}级${classes[p.classId].name}`, { color: UI.yellow, stroke: 0x000000 }));
    // 血条到右边三格副将之间留 8 像素（画面放大时窄一点）
    const bw = W - 170;
    this.layer.add(bar(this, 60, y + 23, bw, 11, p.hp / st.maxHp, C.red, C.darkRed));
    this.layer.add(text(this, 60 + bw / 2, y + 22, `${p.hp}/${st.maxHp}`, { align: 'center', color: 0xffffff, stroke: 0x000000 }));
    this.layer.add(bar(this, 60, y + 38, bw, 11, p.mp / st.maxMp, C.lightBlue, C.navy));
    this.layer.add(text(this, 60 + bw / 2, y + 37, `${p.mp}/${st.maxMp}`, { align: 'center', color: 0xffffff, stroke: 0x000000 }));
    // 右侧：三格副将 + 银两金砖
    for (let i = 0; i < 3; i++) {
      const gx = W - 102 + i * 33;
      const gy = y + 6;
      const gen = s.generals[i];
      const active = gen && isDeployed(s, gen.uid);
      const fg = this.add.graphics();
      fg.fillStyle(active ? UI.goldHi : 0x6a5a48).fillRect(gx, gy, 30, 30);
      fg.fillStyle(active ? 0x5a2a10 : 0x24160c).fillRect(gx + 1, gy + 1, 28, 28);
      this.layer.add(fg);
      if (gen) {
        // 没出战的副将头像压暗，一眼看出这一仗谁上场
        this.layer.add(this.add.image(gx + 3, gy + 2, avatarTex(this, gen.look)).setOrigin(0).setAlpha(active ? 1 : 0.45));
        const gs = generalStats(gen);
        this.layer.add(bar(this, gx + 2, gy + 25, 26, 3, gen.hp / gs.maxHp, C.red, C.darkRed));
        this.layer.add(hit(this, gx, gy, 30, 30, () => P.generalDetail(this, gen.uid)));
      } else {
        this.layer.add(text(this, gx + 15, gy + 8, '将', { align: 'center', color: 0x8a7a60 }));
        this.layer.add(hit(this, gx, gy, 30, 30, () => toast(this, '野外把怪物打到残血，用「招降」收为副将')));
      }
    }
    this.layer.add(this.add.image(W - 102, y + 41, uiIconTex(this, 'coin')).setOrigin(0));
    this.layer.add(text(this, W - 92, y + 39, moneyText(p.silver), { color: 0xe8e8f0, stroke: 0x000000 }));
    this.layer.add(this.add.image(W - 50, y + 41, uiIconTex(this, 'ingot')).setOrigin(0));
    this.layer.add(text(this, W - 40, y + 39, moneyText(p.gold), { color: UI.yellow, stroke: 0x000000 }));
  }

  // ===== 底部导航 =====
  private drawNav(): void {
    const s = store.save;
    const loc = locations[s.location];
    const y = H - NAV_H;
    const g = this.add.graphics();
    vgrad(g, 0, y, W, NAV_H, [0x3a2414, 0x24160c, 0x160c06]);
    g.fillStyle(0x000000).fillRect(0, y, W, 1);
    g.fillStyle(UI.goldLo).fillRect(0, y + 1, W, 1);
    this.layer.add(g);
    const town = !!loc.town && !!loc.facilities?.length;
    const funcDot = s.player.free > 0 || s.main.state === 'ready' || welfarePending(s) || X.festivalPending(s) || G4.guozhanPending(s);
    const items: [string, string, () => void, boolean, boolean][] = [
      ['house', town ? '设施' : '野外', () => (town ? this.facilitySheet() : toast(this, '野外没有设施，回城镇才能用医馆、钱庄这些')), false, !town],
      ['map', '地图', () => this.mapSheet(), false, false],
      ['bag', '行囊', () => P.bagPanel(this), false, false],
      ['helmet', '副将', () => P.generalsPanel(this), false, false],
      ['scroll', '功能', () => this.funcSheet(), funcDot, false],
    ];
    const bw = W / items.length;
    items.forEach(([icon, label, fn, dot, dim], i) => {
      const cx = Math.round(i * bw + bw / 2);
      if (i > 0) g.fillStyle(0x000000, 0.4).fillRect(Math.round(i * bw), y + 8, 1, NAV_H - 16);
      const img = this.add.image(cx, y + 18, uiIconTex(this, icon)).setScale(2).setAlpha(dim ? 0.4 : 1);
      this.layer.add(img);
      this.layer.add(text(this, cx, y + 34, label, { align: 'center', color: dim ? 0x8a7a60 : 0xfbefd0, stroke: 0x000000 }));
      if (dot) this.layer.add(this.add.circle(cx + 14, y + 7, 4, 0xff3020).setStrokeStyle(1, 0xffffff));
      this.layer.add(hit(this, Math.round(i * bw), y, Math.round(bw), NAV_H, () => {
        this.tweens.add({ targets: img, scale: 2.3, duration: 70, yoyo: true });
        fn();
      }));
    });
  }

  // ===== 弹出页 =====
  private sheet(title: string, h: number): Modal {
    const hh = Math.min(h, H - SAFE_TOP - 40);
    return new Modal(this, title, { h: hh, y: Math.max(SAFE_TOP + 8, H - NAV_H - hh - 8) });
  }

  private facilitySheet(): void {
    const loc = locations[store.save.location];
    // 城镇都有灶台（做菜）
    const fac = [...(loc.facilities ?? []), 'kitchen'];
    const rows = Math.ceil(fac.length / 2);
    const m = this.sheet(`${loc.name} · 设施`, 50 + rows * 52);
    const cw = Math.floor((m.cw - 6) / 2);
    fac.forEach((f, i) => {
      const [name, desc, open] = FACILITIES[f];
      const x = m.cx + (i % 2) * (cw + 6);
      const y = m.cy + Math.floor(i / 2) * 52;
      const b = new Button(this, x, y, cw, 46, '', () => {
        m.close();
        open(this);
      });
      m.inner.add(b);
      const sg = this.add.graphics();
      sealBox(sg, x + 6, y + 8, 30);
      m.inner.add(sg);
      m.inner.add(text(this, x + 21, y + 16, name[0], { align: 'center', color: 0xfff0c0 }));
      m.inner.add(text(this, x + 42, y + 7, name, { color: C.darkBrown }));
      m.inner.add(text(this, x + 42, y + 25, desc.length > 7 ? `${desc.slice(0, 7)}…` : desc, { color: C.brown }));
    });
  }

  private mapSheet(): void {
    const s = store.save;
    const loc = locations[s.location];
    const exits = exitsOf(s.location);
    const back = s.location === 'baodong' ? 'xuchang' : s.location !== 'xinshoucun' && !exits.some((e) => e.to === 'xinshoucun') ? 'xinshoucun' : null;
    const dest = questDestination(s);
    const n = exits.length + (back ? 1 : 0);
    const m = this.sheet('地图', 172 + n * 50 + (dest && dest !== s.location ? 34 : 0));
    // 当前位置：一张小场景图 + 名牌
    const fg = this.add.graphics();
    fg.fillStyle(0x3a2414).fillRect(m.cx, m.cy, m.cw, 72);
    m.inner.add(fg);
    m.inner.add(this.add.image(m.cx + 2, m.cy + 2, sceneTex(this, loc.art, Math.floor((m.cw - 4) / 2), 34, 0.5)).setOrigin(0).setScale(2));
    const pg = this.add.graphics();
    titlePlaque(pg, m.cx + m.cw / 2, m.cy + 50, Math.max(80, textWidth(loc.name) + 30));
    m.inner.add([pg, text(this, m.cx + m.cw / 2, m.cy + 52, `当前：${loc.name}`, { align: 'center', color: 0xfff0c0, stroke: 0x4a0804 })]);
    let y = m.cy + 80;
    m.inner.add(new Button(this, m.cx, y, m.cw, 28, '展开舆图（全图）', () => {
      m.close();
      worldMap(this, (to) => this.autoPath(to));
    }, { style: 'tan' }));
    y += 34;
    if (dest && dest !== s.location) {
      m.inner.add(new Button(this, m.cx, y, m.cw, 28, `寻路到任务地点：${locations[dest].name}`, () => {
        m.close();
        this.autoPath(dest);
      }, { style: 'red' }));
      y += 34;
    }
    for (const e of exits) {
      const b = new Button(this, m.cx, y, m.cw, 44, '', () => {
        if (e.locked) return toast(this, `${e.name}，还不能去`);
        m.close();
        this.walkTo(e.to);
      }, { disabled: e.locked });
      m.inner.add(b);
      const to = locations[e.to];
      m.inner.add(this.add.image(m.cx + 4, m.cy + 0 + (y - m.cy) + 4, sceneTex(this, to.art, 36, 18, 0.5)).setOrigin(0).setScale(2).setAlpha(e.locked ? 0.4 : 1));
      m.inner.add(text(this, m.cx + 84, y + 6, `${DIR_ARROW[e.dir]} 往${DIR_NAME[e.dir]}`, { color: C.brown }));
      m.inner.add(text(this, m.cx + 84, y + 23, e.name, { color: e.locked ? C.gray : C.darkBrown }));
      if (e.locked) m.inner.add(text(this, m.cx + m.cw - 8, y + 15, '未开放', { align: 'right', color: C.gray }));
      else if (to.town) m.inner.add(text(this, m.cx + m.cw - 8, y + 15, '城镇', { align: 'right', color: C.green }));
      else if (to.groups.length) {
        const lv = Math.min(...to.groups.map((g) => g.level[0]));
        m.inner.add(text(this, m.cx + m.cw - 8, y + 15, `${lv}级起`, { align: 'right', color: lv > s.player.level + 3 ? C.red : C.brown }));
      }
      y += 50;
    }
    if (back) {
      m.inner.add(new Button(this, m.cx, y, m.cw, 28, back === 'xuchang' ? '离开宝洞，回许昌' : '返回新手村', () => {
        m.close();
        this.walkTo(back, true);
      }));
    }
  }

  private funcSheet(): void {
    const s = store.save;
    const items: [string, () => void, boolean][] = [
      ['状态', () => P.statusPanel(this), s.player.free > 0], ['物品', () => P.bagPanel(this), false], ['副将', () => P.generalsPanel(this), false],
      ['任务', () => P.questPanel(this), s.main.state === 'ready'], ['组队', () => X.teamPanel(this), false], ['排行', () => X.rankPanel(this), false],
      ['国战', () => G4.guozhanPanel(this), G4.guozhanPending(s)], ['福利', () => welfarePanel(this), welfarePending(s) || X.festivalPending(s)], ['擂台', () => X.arenaPanel(this), false],
      ['帮派', () => X.sectPanel(this), false], ['训练', () => X.trainingPanel(this), false], ['宝库', () => X.vaultPanel(this), false],
      ['生活', () => lifePanel(this), false], ['阵法', () => formationPanel(this), false], ['攻略', () => P.helpPanel(this), false], ['设置', () => P.settingsPanel(this), false],
    ];
    const cols = 5;
    const rows = Math.ceil(items.length / cols);
    const m = this.sheet('功能', 84 + rows * 58);
    const cw = Math.floor(m.cw / cols);
    items.forEach(([name, fn, dot], i) => {
      const x = m.cx + (i % cols) * cw;
      const y = m.cy + 4 + Math.floor(i / cols) * 58;
      // 漆木小匾，里面一枚像素图标
      const sg = this.add.graphics();
      const bx = x + cw / 2 - 19;
      sg.fillStyle(0x1a1210).fillRect(bx, y - 2, 38, 38);
      sg.fillStyle(UI.goldLo).fillRect(bx + 1, y - 1, 36, 36);
      sg.fillStyle(0x4a2e1a).fillRect(bx + 2, y, 34, 34);
      sg.fillStyle(0x5c3a20).fillRect(bx + 2, y, 34, 17);
      sg.fillStyle(0xffffff, 0.12).fillRect(bx + 2, y, 34, 1);
      m.inner.add(sg);
      m.inner.add(this.add.image(x + cw / 2, y + 17, funcIconTex(this, FUNC_KEYS[name] ?? 'guide')).setScale(2));
      m.inner.add(text(this, x + cw / 2, y + 39, name, { align: 'center', color: C.darkBrown }));
      if (dot) m.inner.add(this.add.circle(x + cw / 2 + 18, y, 4, 0xff3020).setStrokeStyle(1, 0xffffff));
      m.inner.add(hit(this, x, y - 2, cw, 56, () => {
        m.close();
        fn();
      }));
    });
    m.inner.add(new Button(this, m.cx, m.cy + 8 + rows * 58, m.cw, 26, '任务帮助使者', () => {
      m.close();
      P.talkTo(this, 'bangzhu');
    }));
  }

  private chatSheet(): void {
    const m = new Modal(this, '江湖见闻', { h: Math.min(H - 80, 460) });
    const box = new ChatBox(this, m.cx, m.cy, m.cw, m.ph - 40);
    m.inner.add(box.root);
  }

  // 怪物卡：立绘、等级、数量，确认再打
  private groupCard(gi: number, gr: MonsterGroup): void {
    const s = store.save;
    const mon = monsters[gr.monster];
    const m = new Modal(this, groupLabel(gr), { w: 300, h: 296, help: sweepReason(s, gr) ? '阵法' : '速战' });
    const fg = this.add.graphics();
    fg.fillStyle(0x3a2414).fillRect(m.cx, m.cy, 112, 128);
    fg.fillStyle(0x24160c).fillRect(m.cx + 2, m.cy + 2, 108, 124);
    m.inner.add(fg);
    m.inner.add(this.add.image(m.cx + 56, m.cy + 126, bustTex(this, mon.look)).setOrigin(0.5, 1).setScale(1.7));
    const x = m.cx + 122;
    const lv = gr.level[0] === gr.level[1] ? `${gr.level[0]}级` : `${gr.level[0]}～${gr.level[1]}级`;
    const cnt = gr.count[0] === gr.count[1] ? `${gr.count[0]}个` : `${gr.count[0]}～${gr.count[1]}个`;
    m.inner.add(text(this, x, m.cy + 4, mon.name, { color: C.darkRed, scale: 2 }));
    m.inner.add(text(this, x, m.cy + 36, `等级：${lv}`, { color: gr.level[0] > s.player.level + 3 ? C.red : C.darkBrown }));
    m.inner.add(text(this, x, m.cy + 54, `数量：${cnt}`, { color: C.darkBrown }));
    m.inner.add(text(this, x, m.cy + 72, `职业：${classes[mon.class]?.name ?? '—'}`, { color: C.darkBrown }));
    if (gr.escort) m.inner.add(text(this, x, m.cy + 90, `带着：${monsters[gr.escort.monster].name}`, { color: C.brown }));
    if (mon.boss) m.inner.add(text(this, x, m.cy + 108, '头目', { color: C.red }));
    // 阵法：对面列什么阵、我方克不克；能克就给个一键换阵
    const theirs = enemyFormation(gr);
    const mine = myFormation(s);
    const c = clash(mine, theirs);
    const fy = m.cy + 136;
    m.inner.add(text(this, m.cx, fy, theirs ? `列阵：${FORMS[theirs].name}（${FORMS[theirs].desc}）` : '列阵：没有列阵', { color: theirs ? C.darkRed : C.gray }));
    m.inner.add(text(this, m.cx, fy + 18, clashText(mine, theirs), { color: c === 1 ? C.green : c === -1 ? C.red : C.brown }));
    const best = bestFormation(s, theirs);
    const half = Math.floor((m.cw - 6) / 2);
    if (best !== mine && clash(best, theirs) === 1) {
      m.inner.add(new Button(this, m.cx, fy + 40, half, 26, `换${FORMS[best].name}`, () => {
        toast(this, setFormation(s, best), 1400);
        m.close();
        this.groupCard(gi, gr);
      }, { style: 'red' }));
    } else m.inner.add(text(this, m.cx + half / 2, fy + 46, c === 1 ? '已经克住它了' : '暂时没有能克它的阵', { align: 'center', color: C.gray }));
    m.inner.add(new Button(this, m.cx + half + 6, fy + 40, half, 26, '阵法…', () => {
      m.close();
      formationPanel(this);
    }, { style: 'tan' }));
    const by = m.py + m.ph - 40;
    if (sweepReason(s, gr)) {
      m.inner.add(new Button(this, m.cx, by, m.cw, 28, '战斗', () => {
        m.close();
        this.fight(gi);
      }, { style: 'red' }));
      return;
    }
    // 低级怪：可以跳过动画直接出结果，或者一口气连打几场
    const third = Math.floor((m.cw - 12) / 3);
    m.inner.add(new Button(this, m.cx, by, third, 28, '战斗', () => {
      m.close();
      this.fight(gi);
    }, { style: 'red' }));
    m.inner.add(new Button(this, m.cx + third + 6, by, third, 28, '速战', () => {
      m.close();
      this.quick(gi, 1);
    }));
    this.time.delayedCall(200, () => m.active && pointAt(this, m.cx + third + 6 + third / 2, m.y + by + 14, 'sweep', false, 0, m));
    m.inner.add(new Button(this, m.cx + (third + 6) * 2, by, m.cw - (third + 6) * 2, 28, `连战${balance.sweep.maxRun}场`, () => {
      m.close();
      this.quick(gi, balance.sweep.maxRun);
    }));
  }

  // 速战：不进战斗场景，算完弹一张战果
  quick(gi: number, n: number): void {
    const s = store.save;
    if (s.player.hp < playerStats(s).maxHp * balance.sweep.stopHpPct) {
      toast(this, '气血不多了，先吃药或去医馆治疗');
      return;
    }
    const lv = s.player.level;
    const at = s.location;
    const r = sweep(s, gi, n, randomSeed);
    store.commit();
    this.refresh();
    sfx('hit');
    if (r.lost) playJingle('lose');
    else if (s.player.level > lv) {
      playJingle('level');
      buzz('heavy');
    }
    const m = new Modal(this, '速战战果', { w: 300 });
    const big = (v: number) => (v >= 100000 ? `${(v / 10000).toFixed(1).replace(/\.0$/, '')}万` : `${v}`);
    let y = m.cy + 2;
    // 头一行：几场几胜；输了标红
    m.inner.add(text(this, m.cx, y, `速战${r.fights}场，赢${r.wins}场`, { color: r.lost ? C.red : C.darkRed, scale: 2 }));
    y += 30;
    if (r.stop) {
      m.inner.add(text(this, m.cx, y, `${r.stop}，停下了`, { color: C.gray }));
      y += 18;
    }
    // 经验、银两：和战果卷轴一样的小图标
    if (r.exp || r.silver) {
      const g = this.add.graphics();
      g.fillStyle(0xa88a5c).fillRect(m.cx, y, m.cw, 26);
      g.fillStyle(0xe8d6ae).fillRect(m.cx + 1, y + 1, m.cw - 2, 24);
      m.inner.add(g);
      m.inner.add(this.add.image(m.cx + 8, y + 7, uiIconTex(this, 'scroll')).setOrigin(0));
      m.inner.add(text(this, m.cx + 26, y + 6, `经验+${big(r.exp)}`, { color: 0x8a5a10 }));
      const sv = big(r.silver);
      m.inner.add(text(this, m.cx + m.cw - 8, y + 6, sv, { color: 0x5a5a6a, align: 'right' }));
      m.inner.add(this.add.image(m.cx + m.cw - 22 - textWidth(sv), y + 7, uiIconTex(this, 'coin')).setOrigin(0));
      y += 34;
    }
    // 缴获、吃掉的药：带物品图标，一行放不下就换行
    const iconRow = (label: string, list: [string, number][], color: number) => {
      if (!list.length) return;
      m.inner.add(text(this, m.cx, y + 2, label, { color: 0x8a6a40 }));
      let dx = m.cx + 36;
      for (const [id, k] of list) {
        const s2 = `${items[id]?.name ?? id}×${k}`;
        const iw = 20 + textWidth(s2) + 10;
        if (dx + iw > m.cx + m.cw) {
          dx = m.cx + 36;
          y += 20;
        }
        m.inner.add(this.add.image(dx, y + 8, iconTex(this, id)).setOrigin(0, 0.5));
        m.inner.add(text(this, dx + 20, y + 2, s2, { color }));
        dx += iw;
      }
      y += 24;
    };
    const idOf = (name: string) => Object.keys(items).find((k) => items[k].name === name) ?? name;
    iconRow('缴获', Object.entries(r.drops).filter(([, k]) => k > 0).map(([nm, k]) => [idOf(nm), k]), 0x1a3a90);
    iconRow('吃掉', Object.entries(r.used), 0x7a4a2a);
    // 升级、任务这些要紧的话
    for (const l of r.lines) {
      for (const ln of wrap(l, m.cw)) {
        if (y > m.py + m.ph - 64) break;
        m.inner.add(text(this, m.cx, y, ln, { color: l.includes('升到') ? C.red : C.darkBrown }));
        y += 16;
      }
      y += 2;
    }
    const gr = locations[s.location].groups[gi];
    const again = !r.lost && s.location === at && gr && !sweepReason(s, gr);
    const half = Math.floor((m.cw - 6) / 2);
    if (again) m.inner.add(new Button(this, m.cx, y + 8, half, 28, n > 1 ? `再连战${n}场` : '再速战一场', () => {
      m.close();
      this.quick(gi, n);
    }, { style: 'red' }));
    m.inner.add(new Button(this, again ? m.cx + half + 6 : m.cx, y + 8, again ? half : m.cw, 28, '收兵', () => m.close()));
  }

  private announceTreasure(): void {
    const s = store.save;
    const t = treasureNow(s);
    if (!t.open || !t.at) return;
    const key = `tr_${today(s)}_${t.hour}`;
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
    this.enterBattle(startBattle(s, groupIndex, randomSeed()));
  }

  private enterBattle(b: ReturnType<typeof startGroupBattle>): void {
    store.flush();
    sfx('hit');
    // 进战斗：白闪一下再黑场
    this.cameras.main.flash(120, 255, 255, 255);
    this.time.delayedCall(120, () => {
      this.cameras.main.fadeOut(180, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Battle', { battle: b }));
    });
  }

  // 换地点：黑场 → 换图 → 亮起来，中间浮出地名；野外可能碰上奇遇
  walkTo(to: string, direct = false): void {
    const s = store.save;
    const go = () => {
      if (direct) arrive(s, to);
      else if (!moveTo(s, to)) return false;
      return true;
    };
    this.cameras.main.fadeOut(160, 10, 6, 4);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      if (!go()) {
        this.cameras.main.fadeIn(160, 10, 6, 4);
        return;
      }
      sfx('step');
      this.refresh();
      this.cameras.main.fadeIn(240, 10, 6, 4);
      this.areaTitle();
      const ev = rollJourney(s);
      if (ev) this.time.delayedCall(900, () => this.journey(ev));
      store.commit();
    });
  }

  // 地名浮现：一道墨痕上写着地名，停一会儿淡出
  private areaTitle(): void {
    const loc = locations[store.save.location];
    const c = this.add.container(W / 2, STAGE_H * 0.4).setDepth(1500);
    const g = this.add.graphics();
    const w = Math.max(140, textWidth(loc.name) * 2 + 60);
    for (let k = 0; k < 30; k++) {
      const a = 0.65 * (1 - Math.abs(k - 15) / 15);
      g.fillStyle(0x0a0604, a).fillRect(-w / 2 + (k % 3), -22 + k * 1.5, w - (k % 3) * 2, 2);
    }
    g.fillStyle(UI.gold).fillRect(-w / 2 + 20, -24, w - 40, 1).fillRect(-w / 2 + 20, 23, w - 40, 1);
    c.add([g, text(this, 0, -12, loc.name, { align: 'center', color: 0xfff0c0, stroke: 0x2a0804, scale: 2 })]);
    c.setAlpha(0).setY(c.y + 8);
    this.tweens.add({ targets: c, alpha: 1, y: c.y - 8, duration: 300, ease: 'Quad.easeOut' });
    this.tweens.add({ targets: c, alpha: 0, delay: 1300, duration: 400, onComplete: () => c.destroy() });
  }

  private journey(ev: JourneyEvent): void {
    const s = store.save;
    sfx('magic');
    showDialog(this, ev.lines.map((t) => ({ who: ev.who, text: t })), ev.choices.map((c, i) => ({
      label: c.label,
      style: i === 0 ? 'red' as const : 'tan' as const,
      fn: () => {
        if (c.disabled) {
          toast(this, '做不到');
          return this.journey(ev);
        }
        const out = c.run(s);
        store.commit();
        this.refresh();
        showDialog(this, out.lines.map((t) => ({ who: out.who, text: t })), [], () => {
          if (out.fight) this.enterBattle(startGroupBattle(s, out.fight, randomSeed()));
        });
      },
    })));
  }

  // 开启寻路：一站一站自动走过去
  autoPath(dest: string): void {
    if (this.walking) return;
    const path = findPath(store.save.location, dest);
    if (!path) return toast(this, '找不到路');
    if (path.length === 1) {
      this.refresh();
      return toast(this, '已经在目的地了');
    }
    this.walking = true;
    let i = 1;
    const step = () => {
      this.cameras.main.fadeOut(120, 10, 6, 4);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        arrive(store.save, path[i]);
        sfx('step');
        this.refresh();
        this.cameras.main.fadeIn(160, 10, 6, 4);
        i++;
        if (i < path.length) {
          toast(this, `寻路中…… → ${locations[path[path.length - 1]].name}`, 400);
          this.time.delayedCall(520, step);
        } else {
          this.walking = false;
          this.areaTitle();
        }
      });
    };
    step();
  }
}
