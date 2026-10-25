// 横版战斗：上面是当地的真实场景（地面摆设、晨昏光色），敌人在左、我方在右，顶上一条行动顺序；
// 下面一块宣纸指令盘——下令时是当前角色的立绘和指令，出招时滚战报；招式名用朱漆题签浮现；战果是一张盖了印的卷轴。
import Phaser from 'phaser';
import { setChrome, syncHeight } from '../ui/screen';
import { C, hex } from '../art/palette';
import { avatarTex, bustTex, iconTex, propTex, sceneTex, uiIconTex, unitTex } from '../art/textures';
import { BX, FEET_Y, UNIT_H, UNIT_W, lookFor } from '../art/units';
import type { Pose, Weapon } from '../art/units';
import { GLOW, OUTDOOR_DARK, daypart, layoutProps } from '../art/props';
import type { PropKind } from '../art/props';
import { balance, items, locations, monsters, skills } from '../data';
import { skillMp } from '../core/formulas';
import {
  aiCommand, attackableFoes, autoCommand, availableCommands, canCast, controlOf, defaultCommand, foesOf, friendsOf, living,
  needsCommand, predictOrder, resolveRound, unit,
} from '../core/battle';
import type { BEvent, BUnit, Battle, Command, CommandType } from '../core/battle';
import { createBattle } from '../core/battle';
import type { ReplayRecord } from '../game/state';
import { STATUS_NAMES } from '../core/types';
import { finishBattle } from '../game/encounter';
import type { BattleSummary } from '../game/encounter';
import { store } from '../game/store';
import { Button, H, SAFE_TOP, W, drawBar, sfx, text, textWidth, wrap } from '../ui/widgets';
import { fit } from '../ui/textfit';
import { PAPER, UI, paperTex, timeTint, titlePlaque, vgrad, woodFrame } from '../art/chrome';
import { FORMS, clashText } from '../game/formation';
import { playJingle, playMusic } from '../ui/audio';
import { saveSettings, settings } from '../ui/settings';
import { setSceneBack } from '../ui/back';
import { buzz } from '../ui/haptics';
import { passiveOf } from '../core/passives';
import type { FormId } from '../game/formation';

// 版面：战场从屏幕最顶铺到指令盘（顶上状态栏、挖孔那一截只露天空），对阵栏是压在天空上的一条墨色半透明带
const TOP_H = 30;
const FIELD_Y = 0;
const HORIZON = 0.3;
let PANEL_H = 160;
let PANEL_Y = 480;

// 战报里要紧的几样换个颜色（宣纸底上看得清）
const LOG_TONE = { capture: 0x1e6a1a, crit: 0xb00800, status: 0x6a2a8a, passive: 0x8a5a00, down: 0x5a5a6a };
function logTone(s: string): number | null {
  if (/愿意归顺/.test(s)) return LOG_TONE.capture;
  if (/（暴击）|（致命）/.test(s)) return LOG_TONE.crit;
  if (/中了「/.test(s)) return LOG_TONE.status;
  if (/倒下了$/.test(s)) return LOG_TONE.down;
  return null;
}
let FIELD_H = 446;
let G_TOP = 220;
let G_BOT = 450;
function layout(): void {
  PANEL_H = Math.max(150, Math.min(178, Math.round(H * 0.21)));
  PANEL_Y = H - PANEL_H;
  FIELD_H = PANEL_Y - FIELD_Y;
  G_TOP = Math.max(FIELD_Y + Math.round(FIELD_H * HORIZON) + 52, SAFE_TOP + TOP_H + 100);
  G_BOT = PANEL_Y - 26;
}
// 站位：敌人两列（前排 x=100、后排 x=44），我方站右边；纵向按人数在地面上均匀排开
// 横坐标按 360 宽写的，画面放大（宽 320）时等比收拢
const SX = W / 360;
const ROW_X: Record<0 | 1, number> = { 0: Math.round(120 * SX), 1: Math.round(50 * SX) };
const SPREAD: Record<number, number[]> = { 1: [0.5], 2: [0.22, 0.78], 3: [0, 0.5, 1] };
// 后排插在前排的空当里（两排名牌横着挨得近，站在同一高度会叠字）：按前排几个人选
const BACK_SPREAD: Record<number, Record<number, number[]>> = {
  0: SPREAD,
  1: { 1: [0.12], 2: [0.12, 0.88], 3: [0, 0.25, 1] },
  2: { 1: [0.5], 2: [0, 0.5], 3: [0, 0.5, 1] },
  3: { 1: [0.25], 2: [0.25, 0.75], 3: [0.25, 0.75, 0.75] },
};
// 我方和敌方一样分两列：主角站后列，副将（最多三个）和雇来的队友站前列，按人数排开；
// 两列上下错开（名牌横着挨得近，站在同一高度会叠字）。第四个人站回后列
const ALLY_X = { front: Math.round(236 * SX), back: Math.round(302 * SX) };
const ALLY_LAYOUT: Record<number, { hero: number; slots: [keyof typeof ALLY_X, number][] }> = {
  0: { hero: 0.5, slots: [] },
  1: { hero: 0.3, slots: [['front', 0.78]] },
  2: { hero: 0.5, slots: [['front', 0.04], ['front', 0.96]] },
  3: { hero: 0.25, slots: [['front', 0], ['front', 0.5], ['front', 1]] },
  4: { hero: 0.25, slots: [['front', 0], ['front', 0.5], ['front', 1], ['back', 0.78]] },
};
const gy = (v: number) => Math.round(G_TOP + v * (G_BOT - G_TOP));

interface View {
  id: string;
  spr: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Ellipse;
  bars: Phaser.GameObjects.Graphics;
  plate: Phaser.GameObjects.Graphics;
  name: Phaser.GameObjects.Text;
  badge: Phaser.GameObjects.Text;
  zone: Phaser.GameObjects.Zone;
  hx: number;
  hy: number;
  hp: number;
  mp: number;
  maxHp: number;
  maxMp: number;
  dead: boolean;
  look: string;
  variant: number;
  flip: boolean;
  weapon: Weapon;
}

// 指令盘：攻击一个大钮，其余六个小钮两行
const SMALL: { type: CommandType; label: string; icon: string }[] = [
  { type: 'skill', label: '技能', icon: 'scroll' },
  { type: 'item', label: '物品', icon: 'bag' },
  { type: 'defend', label: '防御', icon: 'helmet' },
  { type: 'capture', label: '招降', icon: 'flag' },
  { type: 'summon', label: '招将', icon: 'heart' },
  { type: 'flee', label: '逃跑', icon: 'map' },
];

// 战场上人物放大两倍（像素整倍放大，边缘还是硬的）
const SC = 2;
// 贴图中心和身体中线差几个像素，朝左朝右要往不同方向补
const OFF = (BX - UNIT_W / 2) * SC;

// 这几种兵器的普攻打远程，其余跑过去近身打
const RANGED = new Set<Weapon>(['staff', 'bow', 'feather']);
// 施法时脚下光圈的颜色
const SKILL_COLOR: Record<string, number> = {
  wulei: C.yellow, wugu: C.lime, hufeng: C.sky, yaohuo: C.orange, gujin: C.gold, andu: C.white, chenhuo: C.pink, simian: C.yellow, huadi: C.lightBrown,
  hengsao: C.white, fengwu: C.pink, wanfu: C.gold, yunchou: C.lime, miaoshou: C.green, bamen: C.yellow, xixing: C.purple, mihun: C.pink, tianbeng: C.yellow,
};
// 战场上不摆的大件（挡人）
const BIG = new Set<PropKind>(['house', 'hut', 'tent', 'stall', 'willow', 'tree', 'blossom', 'pine', 'bamboo', 'deadtree', 'banner', 'boat', 'cart', 'well', 'lion']);

const wait = (scene: Phaser.Scene, ms: number) => new Promise<void>((r) => scene.time.delayedCall(ms, r));

// 人物贴图按站位高度排前后（下面的盖住上面的），压在 100～199 之间：名字血条在 200，指令盘在 260 以上
function spriteDepth(hy: number): number {
  return 100 + Math.min(99, hy / 8);
}

type PanelMode = 'command' | 'target' | 'list' | 'log';

export class BattleScene extends Phaser.Scene {
  private b!: Battle;
  private views = new Map<string, View>();
  private roundText!: Phaser.GameObjects.Text;
  private banner: Phaser.GameObjects.Container | null = null;
  private panel!: Phaser.GameObjects.Container;
  private popup: Phaser.GameObjects.Container | null = null;
  private order!: Phaser.GameObjects.Container;
  private marker!: Phaser.GameObjects.Graphics;
  // 正在下令的人头顶的箭头（压在人上面）和脚下的光圈（压在人下面）
  private cueTop!: Phaser.GameObjects.Container;
  private cueGround!: Phaser.GameObjects.Container;
  private autoBtn!: Button;
  private auto = false;
  private current: BUnit | null = null;
  private queue: BUnit[] = [];
  private cmds: Command[] = [];
  private reserved: Record<string, number> = {};
  private countdown: Phaser.Time.TimerEvent | null = null;
  private seconds = 0;
  private secText: Phaser.GameObjects.Text | null = null;
  private selecting: ((id: string) => void) | null = null;
  private candidates = new Set<string>();
  private selected: string | null = null;
  private lunged: View | null = null;
  private fx!: Phaser.GameObjects.Container;
  private logLines: string[] = [];
  private logTones: (number | null)[] = [];
  private mode: PanelMode = 'log';
  // 回放录像：按录下来的随机数状态和指令重算
  private replay: ReplayRecord | null = null;
  private replayAt = 0;
  private speed = 1;
  // 我方各人占哪一格
  private allyCount = -1;
  private allySlot = new Map<string, number>();
  // 这一仗里已经亮过相的被动（只第一次放特写）
  private seenPassive = new Set<string>();
  // 正在放化境大招：这一下的伤害震得更狠
  private heavy = false;
  // 放技能时战场压黑（照原版：只剩人和招式），deco 是要跟着藏起来的花草、滤镜
  private curtain!: Phaser.GameObjects.Rectangle;
  private deco: (Phaser.GameObjects.GameObject & { alpha: number })[] = [];
  private lamps: Phaser.GameObjects.Arc[] = [];
  private staged: string | null = null;

  constructor() {
    super('Battle');
  }

  init(data: { battle?: Battle; replay?: ReplayRecord }): void {
    this.replay = data.replay ?? null;
    this.replayAt = 0;
    // 动画速度、要不要接着自动按本机设置
    const st = settings();
    this.speed = data.replay ? 1 : st.speed;
    this.b = data.replay ? createBattle(JSON.parse(JSON.stringify(data.replay.init))) : data.battle!;
    this.views.clear();
    this.allySlot = new Map();
    this.allyCount = -1;
    this.auto = !data.replay && st.keepAuto && st.lastAuto;
    this.popup = null;
    this.banner = null;
    this.lunged = null;
    this.selecting = null;
    this.current = null;
    this.logLines = [];
    this.logTones = [];
    this.mode = 'log';
    this.seenPassive = new Set();
    this.heavy = false;
    this.deco = [];
    this.lamps = [];
    this.staged = null;
  }

  create(): void {
    syncHeight(this.game);
    layout();
    setChrome('#160c06');
    const s = store.save;
    const loc = locations[s.location];
    this.drawField(loc.art, s.location);
    // 返回键：选目标、翻技能物品时退回指令盘；别的时候不动（不会误按退出战斗）
    setSceneBack(() => {
      if (this.popup || this.mode === 'target' || this.mode === 'list') this.back();
      return true;
    });
    this.drawTopBar(s.player.name);
    this.order = this.add.container(0, 0).setDepth(240);
    for (const u of this.b.units) this.makeView(u, true);
    this.curtain = this.add.rectangle(0, FIELD_Y, W, FIELD_H, 0x000000, 1).setOrigin(0).setDepth(99).setAlpha(0);
    // 地上的光圈、焦痕压在黑幕上面、人物下面
    this.fx = this.add.container(0, 0).setDepth(99.5);
    this.marker = this.add.graphics().setDepth(210).setVisible(false);
    this.cueTop = this.add.container(0, 0).setDepth(210);
    this.cueGround = this.add.container(0, 0).setDepth(60);
    this.tweens.add({ targets: this.marker, y: 3, duration: 260, yoyo: true, repeat: -1, ease: 'Stepped', easeParams: [2] });

    // 指令盘：漆木框 + 宣纸
    const pg = this.add.graphics().setDepth(258);
    pg.fillStyle(0x000000, 0.4).fillRect(0, PANEL_Y - 3, W, 3);
    woodFrame(pg, 0, PANEL_Y, W, PANEL_H);
    this.add.image(6, PANEL_Y + 6, paperTex(this, W - 12, PANEL_H - 12)).setOrigin(0).setDepth(259);
    this.panel = this.add.container(0, 0).setDepth(260);
    this.autoBtn = new Button(this, W - 68, H - 36, 56, 24, this.auto ? '手动' : '自动', () => this.toggleAuto(), { style: this.auto ? 'red' : 'tan' }).setDepth(270);
    // 名将、首领另换一首
    const boss = this.b.units.some((u) => u.side === 'enemy' && u.monsterId && (monsters[u.monsterId]?.boss || monsters[u.monsterId]?.historic));
    playMusic(boss ? 'boss' : this.b.tag?.startsWith('gz:') ? 'guozhan' : 'battle');
    if (this.replay) {
      this.autoBtn.setVisible(false);
      new Button(this, W - 132, H - 36, 56, 24, '退出', () => this.scene.start('Main'), { style: 'tan' }).setDepth(270);
      const sp = new Button(this, W - 68, H - 36, 56, 24, '快进', () => {
        this.speed = this.speed === 1 ? 2.5 : 1;
        sp.setCaption(this.speed === 1 ? '快进' : '正常');
      }, { style: 'red' }).setDepth(270);
      this.addLog('—— 战斗录像 ——');
    }
    this.addLog(`${loc.name}：遭遇${this.b.title}`);
    const fm = this.b.forms;
    if (fm) {
      this.drawForms(fm.ally as FormId, fm.enemy as FormId | null, fm.clash);
      this.addLog(clashText(fm.ally as FormId, fm.enemy as FormId | null));
    }
    this.renderLog();
    this.cameras.main.fadeIn(220, 10, 6, 4);
    // 头目、名将登场：先来一道大字特写
    const chief = this.b.units.find((u) => u.side === 'enemy' && u.monsterId && (monsters[u.monsterId]?.boss || monsters[u.monsterId]?.historic));
    const lead = chief ? (monsters[chief.monsterId!]?.historic ? 1200 : 900) : 0;
    if (chief) {
      sfx('crit');
      buzz('heavy');
      // 名将：带半身像的大特写；头目：原来的大字横条
      if (monsters[chief.monsterId!]?.historic) void this.bossIntro(chief, (n) => n / this.speed);
      else void this.cutIn(chief.name, '头目登场', C.red, (n) => n / this.speed);
    } else this.showBanner(`遭遇 ${this.b.title}`, 900);
    // 有克制关系的话，开打前再报一句
    const clashLine = fm && fm.clash ? (fm.clash > 0 ? `${FORMS[fm.ally as FormId].name} 克 ${FORMS[fm.enemy as FormId].name}` : `${FORMS[fm.ally as FormId].name} 被克`) : '';
    if (clashLine) this.time.delayedCall(900 + lead, () => this.showBanner(clashLine, 800));
    this.time.delayedCall((clashLine ? 1500 : 700) + lead, () => this.startRound());
  }

  // 名将出阵：更宽的墨色横条，左边半身像从下面升上来，右边大字名号、小字被动名
  private bossIntro(u: BUnit, ms: (n: number) => number): Promise<void> {
    const y = Math.round((SAFE_TOP + TOP_H + PANEL_Y) / 2) - 40;
    const c = this.add.container(W, y).setDepth(420);
    const g = this.add.graphics();
    g.fillStyle(0x0a0604, 0.86).fillRect(0, -46, W, 92);
    g.fillStyle(C.red).fillRect(0, -48, W, 2).fillRect(0, 46, W, 2);
    g.fillStyle(UI.gold, 0.55).fillRect(0, -44, W, 1).fillRect(0, 43, W, 1);
    // 半身像后面一团暗红光
    g.fillStyle(0x6a1008, 0.6).fillCircle(64, 0, 40);
    c.add(g);
    const bust = this.add.image(64, 44, bustTex(this, u.look, u.variant ?? 0)).setOrigin(0.5, 1).setScale(1.25);
    // 只露出横条里那一截
    const mask = this.make.graphics({}, false);
    mask.fillStyle(0xffffff).fillRect(0, y - 46, W, 92);
    bust.setMask(mask.createGeometryMask());
    c.add(bust);
    const pv = passiveOf(u.passive);
    c.add(text(this, W / 2 + 44, -24, u.name, { align: 'center', color: 0xfff0c0, stroke: 0x4a0804, scale: 2 }));
    c.add(text(this, W / 2 + 44, 10, pv ? `名将出阵 · ${pv.name}` : '名将出阵', { align: 'center', color: 0xff9a7a }));
    c.once(Phaser.GameObjects.Events.DESTROY, () => mask.destroy());
    return new Promise<void>((r) => {
      this.tweens.add({ targets: c, x: 0, duration: ms(160), ease: 'Quad.easeOut', onComplete: () => {
        this.shake(ms(140), 0.006);
        bust.setY(60);
        this.tweens.add({ targets: bust, y: 44, duration: ms(220), ease: 'Back.easeOut' });
        this.time.delayedCall(ms(760), () => {
          r();
          this.tweens.add({ targets: c, x: -W, alpha: 0, duration: ms(180), ease: 'Quad.easeIn', onComplete: () => c.destroy() });
        });
      } });
    });
  }

  // 大字特写：一道墨色长条横贯战场，金线压边，从左边抽进来、停一下、往右抽走（等到停稳就返回）
  private cutIn(label: string, sub: string, color: number, ms: (n: number) => number): Promise<void> {
    const y = Math.round((SAFE_TOP + TOP_H + PANEL_Y) / 2) - 40;
    const c = this.add.container(-W, y).setDepth(420);
    const g = this.add.graphics();
    g.fillStyle(0x0a0604, 0.8).fillRect(0, -28, W, 56);
    g.fillStyle(color).fillRect(0, -30, W, 2).fillRect(0, 28, W, 2);
    g.fillStyle(UI.gold, 0.5).fillRect(0, -26, W, 1).fillRect(0, 25, W, 1);
    c.add([g, text(this, W / 2, sub ? -22 : -12, label, { align: 'center', color: 0xfff0c0, stroke: 0x4a0804, scale: 2 })]);
    if (sub) c.add(text(this, W / 2, 8, sub, { align: 'center', color: hex(color) === hex(C.red) ? 0xff9a7a : 0xffe08a }));
    return new Promise<void>((r) => {
      this.tweens.add({ targets: c, x: 0, duration: ms(140), ease: 'Quad.easeOut', onComplete: () => {
        this.time.delayedCall(ms(520), () => {
          r();
          this.tweens.add({ targets: c, x: W, alpha: 0, duration: ms(160), ease: 'Quad.easeIn', onComplete: () => c.destroy() });
        });
      } });
    });
  }

  update(): void {
    // 影子跟着人走（冲上去打、逃跑时也一样）
    for (const v of this.views.values()) {
      v.shadow.setPosition(v.spr.x - (v.flip ? OFF : -OFF), v.spr.y + 1);
      v.shadow.setAlpha(v.spr.alpha * 0.3);
    }
  }

  // ===== 场景与顶栏 =====
  private drawField(art: string, key: string): void {
    const sh = Math.ceil(FIELD_H / 2);
    this.add.image(0, FIELD_Y, sceneTex(this, art, 180, sh, HORIZON)).setOrigin(0).setScale(2);
    const hz = FIELD_Y + Math.round(FIELD_H * HORIZON);
    // 站位附近不摆东西；大件只摆在人物后面（靠地平线），中间留给出招
    const keep: [number, number][] = [];
    for (const x of [ROW_X[0], ROW_X[1], ALLY_X.front, ALLY_X.back]) for (let v = 0; v <= 1; v += 0.25) keep.push([x, gy(v)]);
    const props = layoutProps(art, key, W, hz + 6, PANEL_Y - 4, keep).filter((p) => (BIG.has(p.kind) ? p.y < G_TOP - 18 : !(p.x > 130 && p.x < 230 && p.y > G_TOP)));
    const dp = daypart();
    const dark = OUTDOOR_DARK.has(art);
    const glows: [number, number][] = [];
    for (const p of props) {
      const img = this.add.image(p.x, p.y, propTex(this, p.kind, p.seed)).setOrigin(0.5, 1).setDepth(p.y < G_TOP ? 20 + p.y / 100 : spriteDepth(p.y));
      this.deco.push(img);
      if (p.x > W / 2 && p.kind !== 'sign') img.setFlipX(true);
      const gl = GLOW[p.kind];
      if (gl) for (const [gx0, gy0] of gl) glows.push([Math.round(p.x - img.width / 2 + (img.flipX ? img.width - gx0 : gx0)), Math.round(p.y - img.height + gy0)]);
    }
    // 时辰滤镜与暖光，和主界面一样
    const tint: Record<string, number | null> = { dawn: 0xffe4c8, day: null, dusk: 0xffccb0, night: 0x6a74b0 };
    const tt = dark ? null : tint[dp];
    if (tt) this.deco.push(timeTint(this, 0, FIELD_Y, W, FIELD_H, tt).setDepth(205));
    if (dark || dp === 'night' || dp === 'dusk') for (const [x, y] of glows) {
      const c = this.add.circle(x, y, 16, 0xffa040, 0.22).setBlendMode(Phaser.BlendModes.ADD).setDepth(206);
      this.tweens.add({ targets: c, alpha: { from: 0.6, to: 1 }, duration: 700 + Math.random() * 300, yoyo: true, repeat: -1 });
      // 灯火一直在闪，黑场时单独藏（visible，不和闪烁的 alpha 打架）
      this.lamps.push(c);
    }
    // 两边和下沿压暗一点，视线往中间收，也接住下面的指令盘
    const vg = this.add.graphics().setDepth(207);
    this.deco.push(vg);
    for (let k = 0; k < 6; k++) {
      vg.fillStyle(0x000000, 0.06).fillRect(0, FIELD_Y, 4 + k * 4, FIELD_H).fillRect(W - 4 - k * 4, FIELD_Y, 4 + k * 4, FIELD_H);
      vg.fillStyle(0x000000, 0.07).fillRect(0, PANEL_Y - 4 - k * 4, W, 4 + k * 4);
    }
  }

  private drawTopBar(me: string): void {
    const T = SAFE_TOP;
    const g = this.add.graphics().setDepth(250);
    // 墨色带上下两头渐淡，天空从后面透出来
    g.fillStyle(0x0a0604, 0.5).fillRect(0, T + 2, W, TOP_H - 4);
    g.fillStyle(0x0a0604, 0.3).fillRect(0, T, W, 2).fillRect(0, T + TOP_H - 2, W, 2);
    g.fillStyle(UI.gold, 0.5).fillRect(0, T + TOP_H - 1, W, 1);
    // 两边各一面小旗：敌方朱红、我方金
    const flag = (x: number, color: number, dir: 1 | -1) => {
      g.fillStyle(0x000000).fillRect(x - 1, T + 4, 3, 22);
      g.fillStyle(0xc8a060).fillRect(x, T + 5, 1, 20);
      for (let j = 0; j < 12; j++) g.fillStyle(color).fillRect(dir > 0 ? x + 2 : x - 2 - (12 - Math.abs(j - 6)), T + 6 + j, 12 - Math.abs(j - 6), 1);
    };
    flag(10, 0xc8301c, 1);
    flag(W - 11, UI.gold, -1);
    // 标题太长（国战带了助阵、率军的说明）就截短，完整的写在战报里
    let title = this.b.title;
    while (textWidth(title) > 104 && title.length > 2) title = title.slice(0, -1);
    if (title !== this.b.title) title = `${title.slice(0, -1)}…`;
    text(this, 30, T + 8, title, { color: 0xffb0a0, stroke: 0x000000 }).setDepth(251);
    text(this, W - 30, T + 8, me, { align: 'right', color: UI.cream, stroke: 0x000000 }).setDepth(251);
    const pg = this.add.graphics().setDepth(251);
    titlePlaque(pg, W / 2, T + 5, 76, 20);
    this.roundText = text(this, W / 2, T + 8, '', { align: 'center', color: 0xfff0c0, stroke: 0x4a0804 }).setDepth(252);
  }

  // 双方阵法：对阵栏下面两头各一块小牌，克住对面的那边加一枚「克」字印
  private drawForms(ally: FormId, enemy: FormId | null, c: number): void {
    const y = SAFE_TOP + TOP_H + 10;
    const tag = (x: number, align: 'left' | 'right', label: string, win: boolean, side: number) => {
      const w = textWidth(label) + 12;
      const lx = align === 'left' ? x : x - w;
      const g = this.add.graphics().setDepth(240);
      g.fillStyle(0x0a0604, 0.62).fillRect(lx, y, w, 18);
      g.fillStyle(side).fillRect(lx, y + 17, w, 1);
      text(this, lx + w / 2, y + 2, label, { align: 'center', color: win ? 0xffe070 : 0xfbefd0, stroke: 0x000000 }).setDepth(241);
      if (win) {
        const sx = align === 'left' ? lx + w + 3 : lx - 21;
        g.fillStyle(0x3a0804).fillRect(sx, y, 18, 18);
        g.fillStyle(0xc8301c).fillRect(sx + 1, y + 1, 16, 16);
        text(this, sx + 9, y + 2, '克', { align: 'center', color: 0xfff0c0 }).setDepth(241);
      }
    };
    tag(8, 'left', enemy ? FORMS[enemy].name : '未列阵', c === -1, 0xd8402a);
    tag(W - 8, 'right', FORMS[ally].name, c === 1, UI.gold);
  }

  // 行动顺序：按速度从快到慢一排头像（金框我方、红框敌方），正在出手的那个抬起来
  private drawOrder(active?: string): void {
    this.order.removeAll(true);
    const list = predictOrder(this.b).filter((u) => u.alive);
    const size = 24;
    const gap = 3;
    const total = list.length * (size + gap) - gap;
    let x = Math.round((W - total) / 2);
    const y = SAFE_TOP + TOP_H + 6;
    const bg = this.add.graphics();
    bg.fillStyle(0x0a0604, 0.55).fillRect(x - 6, y - 3, total + 12, size + 6);
    bg.fillStyle(0x0a0604, 0.55).fillRect(x - 5, y - 4, total + 10, 1).fillRect(x - 5, y + size + 3, total + 10, 1);
    this.order.add(bg);
    for (const u of list) {
      const on = u.id === active;
      const yy = on ? y - 3 : y;
      const fg = this.add.graphics();
      const edge = u.side === 'ally' ? UI.gold : 0xd8402a;
      fg.fillStyle(0x000000).fillRect(x - 1, yy - 1, size + 2, size + 2);
      fg.fillStyle(on ? 0xfff0a0 : edge).fillRect(x, yy, size, size);
      fg.fillStyle(u.side === 'ally' ? 0x3a2410 : 0x3a1410).fillRect(x + 1, yy + 1, size - 2, size - 2);
      const av = this.add.image(x, yy, avatarTex(this, u.look, u.variant ?? 0)).setOrigin(0).setCrop(1, 1, 22, 22);
      this.order.add([fg, av]);
      if (controlOf(u)) this.order.add(this.add.rectangle(x, yy + size - 6, size, 6, 0x000000, 0.6).setOrigin(0));
      x += size + gap;
    }
  }

  // 招式名：朱漆题签从战场上方浮出来
  private showBanner(label: string, hold = 0, big = false): void {
    this.banner?.destroy();
    // 技能横幅贴着顶栏，盖住出手顺序那一排（放招时用不上），不挡人头和伤害数字
    const c = this.add.container(W / 2, SAFE_TOP + TOP_H + (big ? 4 : 44)).setDepth(245);
    const g = this.add.graphics();
    if (big) {
      // 技能：一整条横幅贯穿战场上沿，两头箭尾，大字招式名（原版就是顶上一条紫色招式条）
      const hw = W / 2 - 6;
      g.fillStyle(0x000000, 0.5).fillRect(-hw, -1, hw * 2, 30);
      g.fillStyle(0x2a0c3c).fillRect(-hw + 10, -4, hw * 2 - 20, 30);
      g.fillStyle(0x4a1a68).fillRect(-hw + 10, -2, hw * 2 - 20, 12);
      for (let k = 0; k < 15; k++) {
        const w = 10 - Math.abs(k - 7) * 1.4;
        g.fillStyle(0x2a0c3c).fillRect(-hw + 10 - w, -4 + k * 2, w, 2).fillRect(hw - 10, -4 + k * 2, w, 2);
      }
      g.fillStyle(UI.gold).fillRect(-hw + 10, -4, hw * 2 - 20, 1).fillRect(-hw + 10, 25, hw * 2 - 20, 1);
      g.fillStyle(0xc89bff, 0.6).fillRect(-hw + 14, -2, hw * 2 - 28, 1);
      c.add([g, text(this, 0, -1, label, { align: 'center', color: 0xfff6d8, stroke: 0x1a0428, scale: 2 })]);
    } else {
      const tw = Math.max(80, textWidth(label) + 34);
      titlePlaque(g, 0, 0, tw, 22);
      c.add([g, text(this, 0, 4, label, { align: 'center', color: 0xfff0c0, stroke: 0x4a0804 })]);
    }
    c.setAlpha(0).setScale(0.9, 1);
    this.tweens.add({ targets: c, alpha: 1, scaleX: 1, duration: 120, ease: 'Quad.easeOut' });
    this.banner = c;
    if (hold) this.time.delayedCall(hold, () => {
      if (this.banner !== c) return;
      this.tweens.add({ targets: c, alpha: 0, duration: 200, onComplete: () => c.destroy() });
      this.banner = null;
    });
  }

  private hideBanner(): void {
    const c = this.banner;
    if (!c) return;
    this.banner = null;
    this.tweens.add({ targets: c, alpha: 0, duration: 160, onComplete: () => c.destroy() });
  }

  // ===== 单位显示 =====
  private slotOf(u: BUnit): [number, number] {
    if (u.side === 'enemy') {
      const same = this.b.units.filter((x) => x.side === 'enemy' && x.row === u.row);
      const front = this.b.units.filter((x) => x.side === 'enemy' && x.row === 0).length;
      const table = u.row === 1 ? BACK_SPREAD[Math.min(3, front)] : SPREAD;
      const sp = table[Math.min(3, same.length)] ?? SPREAD[3];
      return [ROW_X[u.row], gy(sp[Math.min(same.indexOf(u), sp.length - 1)])];
    }
    // 站法按开打时我方有几个人定（换人、倒下不重排）
    if (this.allyCount < 0) this.allyCount = Math.min(4, this.b.units.filter((x) => x.side === 'ally' && x.kind !== 'player').length);
    const lay = ALLY_LAYOUT[this.allyCount];
    if (u.kind === 'player') return [ALLY_X.back, gy(lay.hero)];
    // 第一次上场按顺序占一格；招将换上来的接替换下去那位的位置
    let k = this.allySlot.get(u.id);
    if (k === undefined) {
      const used = new Set(this.allySlot.values());
      k = lay.slots.findIndex((_, i) => !used.has(i));
      if (k < 0) k = Math.max(0, lay.slots.length - 1);
      this.allySlot.set(u.id, k);
    }
    const [col, v] = lay.slots[k] ?? ['front', 0.5];
    return [ALLY_X[col], gy(v)];
  }

  private makeView(u: BUnit, entering = false): View {
    const [hx, hy] = this.slotOf(u);
    const flip = u.side === 'enemy';
    // 脚下影子带一圈颜色：我方蓝、敌方红，一眼分得清哪边是自己人
    const ally = u.side !== 'enemy';
    const shadow = this.add.ellipse(hx, hy + 1, 46, 10, 0x000000, 0.3).setStrokeStyle(1, ally ? 0x7fb0e0 : 0xe05030, 0.7).setDepth(spriteDepth(hy) - 0.5);
    // 自己的副将和对面的怪长一个样时，换一身蓝的
    const look = ally && u.kind === 'general' && this.b.units.some((e) => e.side === 'enemy' && e.look === u.look) ? `ally:${u.look}` : u.look;
    const spr = this.add.image(hx + (flip ? OFF : -OFF), hy, unitTex(this, look, u.variant ?? 0, u.alive ? 'idle' : 'down')).setOrigin(0.5, FEET_Y / UNIT_H).setScale(SC).setFlipX(flip).setDepth(spriteDepth(hy));
    const bars = this.add.graphics().setDepth(200);
    // 名牌：脚下一块暗色小牌，写名字和等级
    const general = u.kind === 'general';
    const label = `${general ? '将 ' : ''}${u.name} ${u.level}级`;
    const nw = textWidth(label) + 10;
    const plate = this.add.graphics().setDepth(199);
    plate.fillStyle(ally ? 0x0e2238 : 0x2a0a06, 0.8).fillRect(hx - nw / 2, hy + 5, nw, 14).fillRect(hx - nw / 2 + 1, hy + 4, nw - 2, 16);
    plate.fillStyle(ally ? 0x5f8fc0 : 0xb42c18).fillRect(hx - nw / 2 + 1, hy + 19, nw - 2, 1);
    // 副将名牌打头的「将」字垫一枚朱红小印
    if (general) plate.fillStyle(0xb8322a).fillRect(hx - nw / 2 + 3, hy + 5, 15, 14);
    const name = text(this, hx, hy + 5, label, { align: 'center', color: u.side === 'enemy' ? (u.historic ? UI.yellow : 0xfbe0d0) : UI.cream, stroke: 0x000000 }).setDepth(200);
    const badge = text(this, hx, hy - 122, '', { align: 'center', color: C.yellow, stroke: C.ink }).setDepth(201);
    const zone = this.add.zone(hx - 30, hy - 104, 60, 128).setOrigin(0).setInteractive().setDepth(230);
    zone.on('pointerup', () => this.selecting && this.candidates.has(u.id) && this.selecting(u.id));
    const v: View = { id: u.id, spr, shadow, bars, plate, name, badge, zone, hx, hy, hp: u.hp, mp: u.mp, maxHp: u.maxHp, maxMp: u.maxMp, dead: !u.alive, look, variant: u.variant ?? 0, flip, weapon: lookFor(u.look, u.variant ?? 0).weapon };
    this.views.set(u.id, v);
    if (v.dead) spr.setAlpha(0.6);
    else {
      // 待机：两帧交替，各人节奏不同
      let f = false;
      this.time.addEvent({ delay: 480 + Math.random() * 260, loop: true, callback: () => {
        if (v.dead || this.lunged === v || !spr.active) return;
        const k = spr.texture.key;
        if (!k.endsWith('idle') && !k.endsWith('idle2')) return;
        f = !f;
        this.pose(v, f ? 'idle2' : 'idle');
      } });
    }
    if (entering) {
      // 开场：两边从画外走进来
      const home = spr.x;
      spr.x += flip ? -140 : 140;
      this.tweens.add({ targets: spr, x: home, duration: 420, delay: Math.random() * 120, ease: 'Quad.easeOut' });
    }
    this.drawBars(v);
    return v;
  }

  private drawBars(v: View): void {
    const g = v.bars;
    g.clear();
    if (v.dead) return;
    // 头顶血条：墨框，上红下蓝
    const x = v.hx - 18;
    const y = v.hy - 106;
    const hp = Math.max(0, Math.min(1, v.hp / Math.max(1, v.maxHp)));
    const mp = Math.max(0, Math.min(1, v.mp / Math.max(1, v.maxMp)));
    g.fillStyle(0x0a0604, 0.9).fillRect(x - 1, y - 1, 38, 9);
    g.fillStyle(0x4a0806).fillRect(x, y, 36, 4);
    g.fillStyle(hp < 0.3 ? 0xff5030 : 0xe82818).fillRect(x, y, Math.round(36 * hp), 4);
    g.fillStyle(0xffffff, 0.35).fillRect(x, y, Math.round(36 * hp), 1);
    g.fillStyle(0x0a1050).fillRect(x, y + 5, 36, 2);
    g.fillStyle(0x4a80ff).fillRect(x, y + 5, Math.round(36 * mp), 2);
    // 可选的目标：脚下一圈金线；选中的：朱红圈
    if (this.selected === v.id) {
      g.lineStyle(2, 0xf04020, 1).strokeEllipse(v.hx, v.hy + 1, 56, 14);
    } else if (this.candidates.has(v.id)) {
      g.lineStyle(1, 0xffe080, 0.9).strokeEllipse(v.hx, v.hy + 1, 52, 12);
    }
  }

  private pose(v: View, p: Pose): void {
    v.spr.setTexture(unitTex(this, v.look, v.variant, p));
  }

  private syncBadge(u: BUnit): void {
    const v = this.views.get(u.id);
    if (!v) return;
    const c = controlOf(u);
    const parts = [c ? STATUS_NAMES[c] : '', u.status.poison.length ? `毒${u.status.poison.length > 1 ? '×' + u.status.poison.length : ''}` : '', u.status.guard ? '固' : ''].filter(Boolean);
    v.badge.setText(u.alive ? parts.join(' ') : '');
  }

  // 飘字：照原版一个字一个字依次往上蹦一下（"-2"“2”“7”像波浪一样跳出来），停一会儿再往上飘走；暴击更大
  private float(v: View, s: string, color: number, big = false): void {
    const sc = big ? 3 : 2;
    const y = Math.max(SAFE_TOP + TOP_H + 64, v.hy - 120);
    const chars = [...s].map((ch) => text(this, 0, y, ch, { color, stroke: C.ink, scale: sc }).setDepth(400).setAlpha(0));
    const total = chars.reduce((w, t) => w + t.displayWidth, 0);
    let x = v.hx - total / 2;
    const step = big ? 55 : 45;
    chars.forEach((t, i) => {
      t.setX(Math.round(x));
      x += t.displayWidth;
      this.tweens.add({ targets: t, alpha: 1, delay: i * step, duration: 1 });
      this.tweens.add({ targets: t, y: y - (big ? 14 : 10), delay: i * step, duration: 90, ease: 'Quad.easeOut', yoyo: true });
      this.tweens.add({ targets: t, y: y - 18, delay: 520 + i * step, duration: 360, ease: 'Quad.easeIn' });
      this.tweens.add({ targets: t, alpha: 0, delay: 700 + i * step, duration: 200, onComplete: () => t.destroy() });
    });
  }

  private setBanner(label: string, big = false): void {
    this.showBanner(label, 0, big);
  }

  // ===== 战报 =====
  private nameOf(id?: string): string {
    if (!id) return '';
    return (unit(this.b, id) ?? this.b.reserve.find((r) => r.id === id))?.name ?? '';
  }

  private addLog(s: string, tone?: number): void {
    this.logLines.push(s);
    this.logTones.push(tone ?? logTone(s));
    if (this.logLines.length > 60) {
      this.logLines.shift();
      this.logTones.shift();
    }
    if (this.mode === 'log') this.renderLog();
  }

  private appendLog(s: string): void {
    if (!this.logLines.length) return this.addLog(s);
    const i = this.logLines.length - 1;
    this.logLines[i] += s;
    // 追加进来的暴击、中计也要让整行换色（已经有颜色的不降级）
    this.logTones[i] = this.logTones[i] ?? logTone(this.logLines[i]);
    if (this.mode === 'log') this.renderLog();
  }

  private renderLog(): void {
    this.mode = 'log';
    this.panel.removeAll(true);
    const x = 16;
    const top = PANEL_Y + 12;
    const maxW = W - 32;
    const room = Math.floor((H - 42 - top) / 16);
    // 从最新一条往上排，放不下的就不显示；越旧越淡
    const rows: { s: string; tone: number | null }[] = [];
    for (let i = this.logLines.length - 1; i >= 0 && rows.length < room; i--) {
      const ls = wrap(this.logLines[i], maxW);
      for (let k = ls.length - 1; k >= 0 && rows.length < room; k--) rows.unshift({ s: ls[k], tone: this.logTones[i] });
    }
    rows.forEach((r, i) => {
      const age = rows.length - 1 - i;
      // 要紧的（暴击、招降、中计、被动）用自己的颜色，旧了就淡一点；其余越旧越淡
      const color = r.tone ?? (age === 0 ? PAPER.ink : age < 3 ? 0x6a5236 : 0x9a8460);
      this.panel.add(text(this, x, top + i * 16, r.s, { color }).setAlpha(r.tone && age >= 3 ? 0.65 : 1));
    });
    this.panel.add(text(this, 16, H - 32, this.replay ? '' : this.auto ? '自动战斗中……' : '', { color: 0xa0301c }));
  }

  // ===== 指令阶段 =====
  private startRound(): void {
    if (this.b.outcome) return void this.finish();
    this.roundText.setText(`第${this.b.round + 1}回合`);
    this.drawOrder();
    this.cmds = [];
    this.reserved = {};
    if (this.replay) return void this.replayRound();
    // 雇来的队友（镜像）由 AI 指挥
    this.queue = living(this.b, 'ally').filter((u) => needsCommand(u) && u.kind !== 'mirror').sort((a, c) => (a.kind === 'player' ? -1 : 1) - (c.kind === 'player' ? -1 : 1));
    for (const u of this.b.units) this.syncBadge(u);
    this.nextCommander();
  }

  private nextCommander(): void {
    this.clearMenu();
    const u = this.queue.shift();
    this.current = u ?? null;
    if (!u) return void this.resolve();
    if (this.auto) {
      this.cmds.push(autoCommand(this.b, u));
      this.time.delayedCall(120, () => this.nextCommander());
      return;
    }
    this.showMenu(u);
  }

  private issue(c: Command): void {
    if (c.type === 'item' && c.item) this.reserved[c.item] = (this.reserved[c.item] ?? 0) + 1;
    this.cmds.push(c);
    this.nextCommander();
  }

  private itemsLeft(): string[] {
    return Object.keys(this.b.items).filter((k) => items[k]?.cat === 'drug' && this.b.items[k] - (this.reserved[k] ?? 0) > 0);
  }

  // 立绘小框：左边一块，下面写名字、血、蓝
  private portrait(u: BUnit, x: number, y: number): void {
    const g = this.add.graphics();
    g.fillStyle(0x24140a).fillRect(x, y, 70, 78);
    g.fillStyle(UI.gold).fillRect(x + 1, y + 1, 68, 76);
    vgrad(g, x + 2, y + 2, 66, 74, u.side === 'ally' ? [0x6a4a2c, 0x3a2414] : [0x6a2c1c, 0x3a1410]);
    this.panel.add(g);
    const img = this.add.image(x + 3, y + 3, bustTex(this, u.look, u.variant ?? 0)).setOrigin(0);
    if (u.side === 'enemy') img.setFlipX(true);
    this.panel.add(img);
    const st = controlOf(u);
    // 名字占满框宽，等级挪到立绘右下角一块小牌上（四个字的名字加等级挤一行会叠在一起）
    this.panel.add(text(this, x, y + 82, fit(u.name, 70), { color: PAPER.ink }));
    const lv = `${u.level}级`;
    const lw = textWidth(lv) + 6;
    const lg = this.add.graphics();
    lg.fillStyle(0x0a0604, 0.78).fillRect(x + 68 - lw, y + 61, lw, 15);
    this.panel.add([lg, text(this, x + 65, y + 61, lv, { align: 'right', color: UI.cream })]);
    const bg = this.add.graphics();
    drawBar(bg, x, y + 98, 70, 7, u.hp / Math.max(1, u.maxHp), C.red, C.darkRed);
    const mg = this.add.graphics();
    drawBar(mg, x, y + 106, 70, 5, u.mp / Math.max(1, u.maxMp), C.lightBlue, C.navy);
    this.panel.add([bg, mg]);
    if (st) this.panel.add(text(this, x + 35, y + 44, STATUS_NAMES[st], { align: 'center', color: UI.yellow, stroke: 0x000000 }));
  }

  // 指令钮：上面小图标，下面两个字
  private cmdButton(x: number, y: number, w: number, h: number, label: string, icon: string, enabled: boolean, fn: () => void): void {
    const b = new Button(this, x, y, w, h, '', fn, { style: 'tan', disabled: !enabled });
    this.panel.add(b);
    this.panel.add(this.add.image(x + w / 2, y + 5, uiIconTex(this, icon)).setOrigin(0.5, 0).setAlpha(enabled ? 1 : 0.4));
    this.panel.add(text(this, x + w / 2, y + 18, label, { align: 'center', color: enabled ? 0xfbefd0 : 0x6c6456 }));
  }

  private showMenu(u: BUnit): void {
    this.clearMenu();
    this.mode = 'command';
    this.panel.removeAll(true);
    const avail = availableCommands(this.b, u);
    avail.item = this.itemsLeft().length > 0;
    const top = PANEL_Y + 12;
    this.portrait(u, 14, top);
    // 攻击：一块朱漆大钮
    const atk = new Button(this, 92, top, 84, 74, '', () => this.choose(u, 'attack'), { style: 'red', disabled: !avail.attack });
    this.panel.add(atk);
    this.panel.add(this.add.image(134, top + 12, uiIconTex(this, 'sword')).setOrigin(0.5, 0).setScale(2));
    this.panel.add(text(this, 134, top + 44, '攻击', { align: 'center', color: 0xfff0c0, stroke: 0x4a0804, scale: 2 }));
    SMALL.forEach((m, i) => {
      const cx = 182 + (i % 3) * 56;
      const cy = top + Math.floor(i / 3) * 38;
      this.cmdButton(cx, cy, 52, 36, m.label, m.icon, avail[m.type], () => this.choose(u, m.type));
    });
    // 倒计时：一枚圆印
    this.seconds = balance.commandSeconds;
    const sg = this.add.graphics();
    sg.fillStyle(0x3a0804).fillCircle(78, top + 6, 11);
    sg.fillStyle(0xb42c18).fillCircle(78, top + 6, 10);
    sg.lineStyle(1, 0xfff0c0, 0.9).strokeCircle(78, top + 6, 8);
    this.panel.add(sg);
    this.secText = text(this, 78, top, `${this.seconds}`, { align: 'center', color: 0xfff0c0 });
    this.panel.add(this.secText);
    const last = this.b.lastCmd[u.id];
    const hint = last?.skill ? `上回合：${skills[last.skill]?.name ?? ''}` : '';
    this.panel.add(text(this, 92, top + 84, `${u.name}，请下令`, { color: PAPER.ink }));
    if (hint) this.panel.add(text(this, 92, top + 100, hint, { color: 0x9a8460 }));
    this.countdown = this.time.addEvent({
      delay: 1000, loop: true, callback: () => {
        this.seconds--;
        this.secText?.setText(`${Math.max(0, this.seconds)}`);
        if (this.seconds <= 5) this.secText?.setColor('#ffe040');
        if (this.seconds <= 0) {
          this.clearSelect();
          this.issue(defaultCommand(this.b, u));
        }
      },
    });
    this.highlightActor(u);
    this.drawOrder(u.id);
  }

  private highlightActor(u: BUnit): void {
    const v = this.views.get(u.id);
    if (!v) return;
    // 正在下令的人：头顶一枚金箭头，脚下一圈光
    const g = this.add.graphics();
    g.fillStyle(0x3a2004).fillTriangle(v.hx - 7, v.hy - 128, v.hx + 7, v.hy - 128, v.hx, v.hy - 118);
    g.fillStyle(0xffd040).fillTriangle(v.hx - 5, v.hy - 127, v.hx + 5, v.hy - 127, v.hx, v.hy - 120);
    const ring = this.add.ellipse(v.hx, v.hy + 1, 56, 14).setStrokeStyle(1, 0xffe080, 0.9);
    this.cueTop.add(g);
    this.cueGround.add(ring);
    this.tweens.add({ targets: g, y: 3, duration: 260, yoyo: true, repeat: -1, ease: 'Stepped', easeParams: [2] });
    this.tweens.add({ targets: ring, scaleX: 1.15, scaleY: 1.15, alpha: 0.5, duration: 500, yoyo: true, repeat: -1 });
  }

  private clearMenu(): void {
    this.cueTop?.removeAll(true);
    this.cueGround?.removeAll(true);
    this.popup?.destroy();
    this.popup = null;
    this.countdown?.remove();
    this.countdown = null;
    this.secText = null;
    this.clearSelect();
  }

  private back(): void {
    this.popup?.destroy();
    this.popup = null;
    this.clearSelect();
    const u = this.current;
    if (!u) return;
    // 回到指令盘，倒计时接着走
    const left = this.seconds;
    this.showMenu(u);
    this.seconds = left;
    this.secText?.setText(`${left}`);
  }

  private choose(u: BUnit, type: CommandType): void {
    switch (type) {
      case 'attack':
        return this.pickTarget(u, '普通攻击', attackableFoes(this.b, u), (t) => this.issue({ actor: u.id, type, target: t }));
      case 'capture':
        return this.pickTarget(u, '招降', foesOf(this.b, u).filter((f) => f.kind === 'monster'), (t) => this.issue({ actor: u.id, type, target: t }));
      case 'defend':
      case 'flee':
        return this.issue({ actor: u.id, type });
      case 'skill':
        return this.listPopup('技能', u.skills.map((st) => {
          const def = skills[st.id];
          const cost = skillMp(def.mp, st.level);
          return { label: `${def.name}`, sub: `${st.level}级`, right: `精力${cost}`, desc: def.desc, enabled: canCast(u, st.id), fn: () => {
            if (def.target === 'enemy') this.pickTarget(u, def.name, foesOf(this.b, u), (t) => this.issue({ actor: u.id, type, skill: st.id, target: t }));
            else this.issue({ actor: u.id, type, skill: st.id });
          } };
        }));
      case 'item':
        return this.listPopup('物品', this.itemsLeft().map((id) => ({
          label: items[id].name, sub: '', right: `×${this.b.items[id] - (this.reserved[id] ?? 0)}`, desc: items[id].desc ?? [items[id].hp ? `回复气血${items[id].hp}` : '', items[id].mp ? `回复精力${items[id].mp}` : ''].filter(Boolean).join('，'), enabled: true, icon: id,
          fn: () => this.pickTarget(u, items[id].name, friendsOf(this.b, u), (t) => this.issue({ actor: u.id, type, item: id, target: t })),
        })));
      case 'summon':
        return this.listPopup('招将', this.b.reserve.map((r) => ({
          label: r.name, sub: `${r.level}级`, right: `${r.hp}/${r.maxHp}`, desc: r.hp > 0 ? '换他上场' : '已经没力气了', enabled: r.hp > 0, look: r.look,
          fn: () => this.issue({ actor: u.id, type, summon: r.id }),
        })));
    }
  }

  // 指令盘上半变成一张列表卡（技能、物品、招将），指令盘只留一个返回
  private listPopup(title: string, rows: { label: string; sub: string; right: string; desc: string; enabled: boolean; fn: () => void; icon?: string; look?: string }[]): void {
    this.popup?.destroy();
    this.mode = 'list';
    // 倒计时还在走，只是指令盘上那枚圆印被换掉了
    this.secText = null;
    this.panel.removeAll(true);
    const c = this.add.container(0, 0).setDepth(320);
    const rh = 40;
    const w = W - 24;
    const h = 40 + Math.max(1, rows.length) * rh;
    const x = 12;
    const y = Math.max(SAFE_TOP + TOP_H + 40, PANEL_Y + PANEL_H - 50 - h);
    const g = this.add.graphics();
    woodFrame(g, x, y, w, h);
    c.add([this.add.zone(x, y, w, h).setOrigin(0).setInteractive(), g, this.add.image(x + 6, y + 6, paperTex(this, w - 12, h - 12)).setOrigin(0)]);
    const tg = this.add.graphics();
    titlePlaque(tg, W / 2, y - 6, 72, 18);
    c.add([tg, text(this, W / 2, y - 4, title, { align: 'center', color: 0xfff0c0, stroke: 0x4a0804 })]);
    if (!rows.length) c.add(text(this, W / 2, y + 22, '没有可用的', { align: 'center', color: 0x9a8460 }));
    rows.forEach((r, i) => {
      const ry = y + 18 + i * rh;
      c.add(new Button(this, x + 10, ry, w - 20, rh - 4, '', () => r.fn(), { disabled: !r.enabled }));
      let tx = x + 18;
      if (r.icon) {
        c.add(this.add.image(tx, ry + 18, iconTex(this, r.icon)).setOrigin(0, 0.5));
        tx += 22;
      } else if (r.look) {
        c.add(this.add.image(tx, ry + 2, avatarTex(this, r.look)).setOrigin(0).setCrop(1, 1, 22, 30));
        tx += 28;
      }
      const ink = r.enabled ? PAPER.ink : 0xa89a80;
      c.add(text(this, tx, ry + 3, r.label, { color: ink }));
      if (r.sub) c.add(text(this, tx + textWidth(r.label) + 6, ry + 3, r.sub, { color: r.enabled ? 0x8a6a40 : 0xb8aa90 }));
      c.add(text(this, x + w - 20, ry + 3, r.right, { align: 'right', color: r.enabled ? 0x2c50b0 : 0xa89a80 }));
      // 说明只放一行，放不下就截断加省略号
      const d = fit(r.desc, w - 40 - (tx - x - 18));
      c.add(text(this, tx, ry + 19, d, { color: r.enabled ? 0x8a7458 : 0xb8aa90 }));
    });
    this.popup = c;
    c.setAlpha(0).setY(8);
    this.tweens.add({ targets: c, alpha: 1, y: 0, duration: 140, ease: 'Quad.easeOut' });
    this.panel.add(text(this, 16, H - 32, `选择${title}`, { color: PAPER.ink }));
    this.panel.add(new Button(this, W - 132, H - 36, 56, 24, '返回', () => this.back(), { style: 'tan' }));
  }

  // 选目标：点场上的人切换目标，再点一次或点"出手"出招；指令盘上显示目标的立绘和血量
  private pickTarget(u: BUnit, label: string, pool: BUnit[], done: (id: string) => void): void {
    if (!pool.length) return;
    this.popup?.destroy();
    this.popup = null;
    this.mode = 'target';
    this.candidates = new Set(pool.map((p) => p.id));
    const lastTarget = this.b.lastCmd[u.id]?.target;
    this.selected = pool.find((p) => p.id === lastTarget)?.id ?? pool[0].id;
    const render = () => {
      this.secText = null;
      this.panel.removeAll(true);
      const t = unit(this.b, this.selected!)!;
      const order = predictOrder(this.b).findIndex((x) => x.id === t.id) + 1;
      const top = PANEL_Y + 12;
      this.portrait(t, 14, top);
      const tg = this.add.graphics();
      titlePlaque(tg, 152, top, 100, 18);
      this.panel.add([tg, text(this, 152, top + 2, label, { align: 'center', color: 0xfff0c0, stroke: 0x4a0804 })]);
      this.panel.add(text(this, 96, top + 26, `目标：${t.name}`, { color: PAPER.ink }));
      this.panel.add(text(this, 96, top + 44, `气血 ${t.hp}/${t.maxHp}`, { color: 0xb42c18 }));
      this.panel.add(text(this, 96, top + 60, `精力 ${t.mp}/${t.maxMp}`, { color: 0x2c50b0 }));
      this.panel.add(text(this, 96, top + 76, `出手顺序 第${order}`, { color: 0x8a5aa0 }));
      const tp = passiveOf(t.passive);
      this.panel.add(text(this, 96, top + 96, tp ? fit(`「${tp.name}」${tp.desc}`, W - 96 - 12) : '点场上的人换目标', { color: tp ? 0xb07800 : 0x9a8460 }));
      this.panel.add(new Button(this, W - 100, top + 22, 86, 40, '出手', () => {
        const id = this.selected!;
        this.clearSelect();
        done(id);
      }, { style: 'red' }));
      this.panel.add(new Button(this, W - 132, H - 36, 56, 24, '返回', () => this.back(), { style: 'tan' }));
      // 选中的人头顶一枚朱红箭头
      const v = this.views.get(t.id);
      if (v) {
        this.marker.clear().setVisible(true);
        this.marker.fillStyle(0x3a0804).fillTriangle(v.hx - 8, v.hy - 130, v.hx + 8, v.hy - 130, v.hx, v.hy - 118);
        this.marker.fillStyle(0xf04424).fillTriangle(v.hx - 6, v.hy - 129, v.hx + 6, v.hy - 129, v.hx, v.hy - 121);
      }
      for (const vv of this.views.values()) this.drawBars(vv);
    };
    this.selecting = (id) => {
      if (id === this.selected) {
        this.clearSelect();
        done(id);
      } else {
        sfx('click');
        this.selected = id;
        render();
      }
    };
    render();
  }

  private clearSelect(): void {
    this.selecting = null;
    this.candidates.clear();
    this.selected = null;
    this.marker?.setVisible(false);
    for (const v of this.views.values()) this.drawBars(v);
  }

  // 镜头抖一下（设置里能关）
  private shake(ms: number, intensity: number): void {
    if (settings().shake) this.cameras.main.shake(ms, intensity);
  }

  private toggleAuto(): void {
    this.auto = !this.auto;
    if (!this.replay) saveSettings({ lastAuto: this.auto });
    this.autoBtn.setCaption(this.auto ? '手动' : '自动');
    this.autoBtn.setStyle(this.auto ? 'red' : 'tan');
    if (this.auto && this.current && this.mode !== 'log') {
      // 正在等指令的这个人也交给自动
      const u = this.current;
      this.clearMenu();
      this.cmds.push(autoCommand(this.b, u));
      this.nextCommander();
    } else if (this.mode === 'log') this.renderLog();
  }

  // ===== 结算与动画 =====
  private async resolve(): Promise<void> {
    this.clearMenu();
    this.current = null;
    this.renderLog();
    if (!this.replay) {
      for (const e of living(this.b, 'enemy')) if (needsCommand(e)) this.cmds.push(aiCommand(this.b, e));
      for (const a of living(this.b, 'ally')) if (a.kind === 'mirror' && needsCommand(a)) this.cmds.push(aiCommand(this.b, a));
    }
    this.addLog(`—— 第${this.b.round + 1}回合 ——`);
    const before = new Map(this.b.units.map((u) => [u.id, u.mp]));
    const events = resolveRound(this.b, this.cmds);
    await this.play(events);
    await this.stageOff((n) => n / this.speed);
    this.returnHome();
    this.hideBanner();
    // 精力变化不在事件里，回合结束统一同步
    for (const u of [...this.b.units, ...this.b.reserve]) {
      const v = this.views.get(u.id);
      if (!v) continue;
      if (before.has(u.id) || v.mp !== u.mp) v.mp = u.mp;
      v.hp = u.hp;
      this.drawBars(v);
      this.syncBadge(u);
    }
    if (this.b.outcome) {
      await wait(this, 400);
      this.finish();
    } else {
      this.startRound();
    }
  }

  private returnHome(): void {
    const v = this.lunged;
    if (!v) return;
    this.lunged = null;
    this.tweens.add({ targets: v.spr, x: v.hx + (v.flip ? OFF : -OFF), y: v.hy, duration: 140, onComplete: () => v.spr.setDepth(spriteDepth(v.hy)) });
    if (!v.dead) this.pose(v, 'idle');
  }

  private async play(events: BEvent[]): Promise<void> {
    const fast = (this.auto ? 0.7 : 1) / this.speed;
    const ms = (n: number) => Math.round(n * fast);
    for (const [ei, e] of events.entries()) {
      switch (e.t) {
        case 'round':
          break;
        case 'act': {
          this.returnHome();
          await this.stageOff(ms);
          await wait(this, ms(60));
          const a = this.views.get(e.actor);
          const t = e.target ? this.views.get(e.target) : undefined;
          // 化境的技能先亮个相
          const st = e.skill ? unit(this.b, e.actor)?.skills.find((x) => x.id === e.skill) : undefined;
          this.heavy = !!st && st.level > balance.skill.maxLevel;
          if (this.heavy && a) {
            sfx('magic');
            await this.cutIn(`${e.label}·化境`, this.nameOf(e.actor), C.yellow, ms);
          }
          // 原版普攻要是打出暴击，横幅直接写「致命攻击」：往后看这一下的伤害
          const nxt = events.slice(ei + 1).findIndex((x) => x.t === 'act' || x.t === 'round');
          const mine = events.slice(ei + 1, nxt < 0 ? undefined : ei + 1 + nxt);
          const critHit = !e.skill && mine.some((x) => x.t === 'damage' && (x.crit || x.fatal));
          this.setBanner(critHit && e.label === '普通攻击' ? '致命攻击' : e.label, !!e.skill);
          this.drawOrder(e.actor);
          this.addLog(`${this.nameOf(e.actor)}：${e.label}${e.target && e.target !== e.actor && e.kind !== 'cast' ? ` → ${this.nameOf(e.target)}` : ''}`);
          if (!a) break;
          if (e.skill) await this.stageOn(e.skill, a, ms);
          if (e.kind === 'melee' && t && t !== a && !e.skill && RANGED.has(a.weapon)) {
            // 拿法杖、弓、羽扇的普攻站在原地打远程：法球 / 箭 / 风刃飞过去
            await this.shoot(a, t, ms);
            this.lunged = a;
          } else if (e.kind === 'melee' && t && t !== a) {
            const dir = a.flip ? -1 : 1;
            const tx = t.hx + (t.flip ? 52 : -52) + (a.flip === t.flip ? -dir * 14 : 0);
            if (e.skill === 'sheming') await this.bloodAura(a, ms);
            a.spr.setDepth(spriteDepth(t.hy) + 0.5);
            // 原版是跑过去的：一路踢起小团尘土
            const kick = this.time.addEvent({ delay: ms(45), loop: true, callback: () => {
              this.kickDust(a.spr.x, a.spr.y, dir);
              this.pose(a, kick.getRepeatCount() % 2 ? 'idle2' : 'idle');
            } });
            await new Promise<void>((r) => this.tweens.add({ targets: a.spr, x: tx, y: t.hy + 2, duration: ms(e.skill ? 180 : 240), ease: 'Quad.easeOut', onComplete: () => r() }));
            kick.remove();
            this.pose(a, 'atk');
            this.lunged = a;
            if (e.skill) await this.bigSlash(a, t, e.skill === 'sheming' ? C.red : SKILL_COLOR[e.skill] ?? C.white, ms);
            else await this.swing(a, t, critHit, ms);
          } else if (e.kind === 'cast') {
            // 横扫、凤舞是刀法：摆出出刀的架势，不念咒
            const blade = !!e.skill && skills[e.skill]?.kind !== undefined && ['sweep', 'multi'].includes(skills[e.skill].kind);
            this.pose(a, blade ? 'atk' : 'cast');
            if (!blade) sfx('magic');
            if (!e.skill) {
              const ring = this.add.circle(a.hx, a.hy - 50, 8, hex(C.yellow), 0.5).setDepth(390);
              this.tweens.add({ targets: ring, radius: 46, alpha: 0, duration: ms(350), onComplete: () => ring.destroy() });
              await wait(this, ms(260));
            }
            await this.skillFx(e.skill, a, t, ms);
            this.lunged = a;
            a.spr.x = a.hx + (a.flip ? OFF : -OFF);
          } else {
            this.tweens.add({ targets: a.spr, y: a.hy - 10, duration: ms(100), yoyo: true });
            await wait(this, ms(220));
          }
          break;
        }
        case 'damage':
        case 'poison': {
          const v = this.views.get(e.target);
          if (!v) break;
          v.hp = Math.max(0, v.hp - e.amount);
          if (e.t === 'damage' && e.mp) v.mp = Math.max(0, v.mp - e.mp);
          const crit = e.t === 'damage' && (e.crit || e.fatal);
          sfx(crit ? 'crit' : 'hit');
          if (!v.dead) this.pose(v, 'hurt');
          const sx = this.lunged === v ? v.spr.x : v.hx + (v.flip ? OFF : -OFF);
          // 原版受击：往后一仰、兵器垂下，定住一小会儿再站回来（不抖）；暴击、化境仰得更狠，画面顿一下
          const kb = crit || this.heavy ? 10 : 6;
          this.tweens.killTweensOf(v.spr);
          this.tweens.add({ targets: v.spr, x: sx + (v.flip ? -kb : kb), duration: 50, ease: 'Quad.easeOut', hold: ms(crit ? 280 : 200), yoyo: true, onComplete: () => !v.dead && this.lunged !== v && this.pose(v, 'idle') });
          if (crit || this.heavy) this.hitStop(this.heavy ? 90 : 60);
          if (this.heavy && settings().shake) this.cameras.main.flash(110, 255, 240, 200);
          if (crit || this.heavy) {
            v.spr.setTint(0xffffff);
            this.time.delayedCall(80, () => v.spr.clearTint());
          }
          // 原版：打中溅一蓬血；致命一击整片战场红一下
          if (e.t === 'damage' && !this.staged && this.lunged?.weapon !== 'staff') this.blood(v, crit ? 28 : 20, ms);
          if (crit && !this.staged) this.whiteOut(ms, 0.75, 0xe01808);
          // 暴击只放大数字、不再写字（横幅已经是「致命攻击」，原版也只跳数字）
          const label = e.t === 'poison' ? `毒-${e.amount}` : `-${e.amount}`;
          if (crit || this.heavy) this.shake(this.heavy ? 160 : 110, this.heavy ? 0.01 : 0.006);
          if (crit || this.heavy) buzz(this.heavy ? 'medium' : 'light');
          if (e.t === 'poison') this.addLog(`${this.nameOf(e.target)}毒发 -${e.amount}`);
          else this.appendLog(`，${this.nameOf(e.target)}${e.crit ? '（暴击）' : e.fatal ? '（致命）' : ''}-${e.amount}`);
          // 数字比血晚两帧冒出来
          this.time.delayedCall(ms(60), () => this.float(v, label, e.t === 'poison' ? C.lilac : crit ? C.red : C.orange, crit));
          if (e.t === 'damage' && e.mp) this.time.delayedCall(200, () => this.float(v, `精力-${e.mp}`, C.lightBlue));
          this.drawBars(v);
          if (this.staged && e.t === 'damage') {
            this.puff(v, SKILL_COLOR[this.staged] ?? C.white, ms);
            await wait(this, ms(130));
          } else await wait(this, ms(e.t === 'poison' ? 380 : 300));
          break;
        }
        case 'miss': {
          const v = this.views.get(e.target);
          if (v) this.float(v, '未中', C.lightPaper);
          this.appendLog(`，${this.nameOf(e.target)}闪开了`);
          sfx('miss');
          await wait(this, ms(260));
          break;
        }
        case 'heal': {
          const v = this.views.get(e.target);
          if (!v) break;
          v.hp = Math.min(v.maxHp, v.hp + e.hp);
          v.mp = Math.min(v.maxMp, v.mp + e.mp);
          sfx('heal');
          this.float(v, e.hp ? `+${e.hp}` : `精力+${e.mp}`, C.lime);
          this.appendLog(`，${this.nameOf(e.target)}${e.hp ? `气血+${e.hp}` : `精力+${e.mp}`}`);
          this.spark(v, C.lime);
          this.drawBars(v);
          await wait(this, ms(320));
          break;
        }
        case 'status': {
          const v = this.views.get(e.target);
          const u = unit(this.b, e.target);
          if (v && e.ok) this.statusFx(v, e.status, ms);
          if (v) this.float(v, e.ok ? `中计·${STATUS_NAMES[e.status]}` : '抵抗', e.ok ? C.yellow : C.lightPaper);
          if (u && e.ok) v?.badge.setText(STATUS_NAMES[e.status]);
          this.appendLog(e.ok ? `，${this.nameOf(e.target)}中了「${STATUS_NAMES[e.status]}」` : `，${this.nameOf(e.target)}抵抗住了`);
          await wait(this, ms(300));
          break;
        }
        case 'statusEnd': {
          const v = this.views.get(e.target);
          if (v) {
            this.pillar(v, C.white, ms);
            this.float(v, '清醒', C.lime);
            this.addLog(`${this.nameOf(e.target)}清醒过来`);
            v.badge.setText('');
          }
          await wait(this, ms(220));
          break;
        }
        case 'buff': {
          const v = this.views.get(e.target);
          if (v) {
            this.float(v, e.label, C.sky);
            this.shield(v, ms);
            v.badge.setText('固');
          }
          await wait(this, ms(180));
          break;
        }
        case 'die': {
          const v = this.views.get(e.target);
          if (!v) break;
          v.dead = true;
          v.hp = 0;
          this.addLog(`${this.nameOf(e.target)}倒下了`);
          this.tweens.add({ targets: [v.plate, v.name], alpha: 0.4, duration: 300 });
          this.tweens.killTweensOf(v.spr);
          this.pose(v, 'down');
          v.spr.setPosition(v.hx + (v.flip ? OFF : -OFF), v.hy);
          this.dust(v.hx, v.hy);
          if (this.lunged === v) this.lunged = null;
          this.tweens.add({ targets: v.spr, alpha: 0.6, duration: 300 });
          v.name.setColor('#8c8c90');
          v.badge.setText('');
          this.drawBars(v);
          await wait(this, ms(320));
          break;
        }
        case 'capture': {
          const v = this.views.get(e.target);
          if (!v) break;
          if (e.ok) {
            v.dead = true;
            this.tweens.killTweensOf(v.spr);
            this.float(v, '招降成功', C.yellow, true);
            buzz('medium');
            this.addLog(`${this.nameOf(e.target)}愿意归顺！`);
            this.drawBars(v);
            await new Promise<void>((r) => this.tweens.add({ targets: [v.spr, v.name, v.plate], alpha: 0, duration: ms(500), onComplete: () => r() }));
          } else {
            this.float(v, '招降失败', C.lightPaper);
            this.addLog(`${this.nameOf(e.target)}不肯归顺`);
            await wait(this, ms(320));
          }
          break;
        }
        case 'summon': {
          if (e.out && this.allySlot.has(e.out)) {
            this.allySlot.set(e.in, this.allySlot.get(e.out)!);
            this.allySlot.delete(e.out);
          }
          if (e.out) {
            const o = this.views.get(e.out);
            if (o) {
              this.tweens.killTweensOf(o.spr);
              await new Promise<void>((r) => this.tweens.add({ targets: [o.spr, o.name, o.bars, o.badge, o.plate], alpha: 0, duration: ms(250), onComplete: () => r() }));
              o.spr.destroy();
              o.shadow.destroy();
              o.plate.destroy();
              o.name.destroy();
              o.bars.destroy();
              o.badge.destroy();
              o.zone.destroy();
              this.views.delete(e.out);
            }
          }
          const u = unit(this.b, e.in);
          if (u) {
            const v = this.makeView(u);
            v.spr.setAlpha(0);
            this.tweens.add({ targets: v.spr, alpha: 1, duration: ms(250) });
            this.float(v, '上场', C.yellow);
            this.addLog(`${u.name}上场`);
          }
          await wait(this, ms(300));
          break;
        }
        case 'flee': {
          if (e.ok) {
            sfx('step');
            this.addLog('撤出了战斗');
            const allies = [...this.views.values()].filter((v) => !v.flip && !v.dead);
            await new Promise<void>((r) => this.tweens.add({ targets: allies.map((v) => v.spr), x: W + 40, duration: ms(450), onComplete: () => r() }));
          } else {
            this.setBanner('逃跑失败');
            this.addLog('没跑掉');
            await wait(this, ms(300));
          }
          break;
        }
        case 'defend': {
          const v = this.views.get(e.actor);
          if (v) this.float(v, '防御', C.sky);
          this.setBanner('防御');
          await wait(this, ms(200));
          break;
        }
        case 'text':
          this.setBanner(e.text);
          this.addLog(e.text);
          await wait(this, ms(500));
          break;
        case 'passive': {
          // 专属被动：头顶飘一行金字，战报记一笔
          const v = this.views.get(e.actor);
          const key = `${e.actor}:${e.label}`;
          if (v && !this.seenPassive.has(key)) {
            // 这一仗里第一次发动：特写一下，之后就只飘字
            this.seenPassive.add(key);
            this.spark(v, C.yellow);
            await this.cutIn(e.label, this.nameOf(e.actor), C.yellow, ms);
          } else if (v) {
            this.float(v, `「${e.label}」`, C.yellow);
            this.spark(v, C.yellow);
          }
          this.addLog(`${this.nameOf(e.actor)}·${e.label}`, LOG_TONE.passive);
          await wait(this, ms(260));
          break;
        }
        case 'end':
          break;
      }
    }
  }

  // 打击停顿：补间几乎停住一小会儿（用真实时间恢复，不受补间自己的速度影响）
  private hitStop(ms: number): void {
    this.tweens.timeScale = 0.05;
    window.setTimeout(() => {
      if (this.scene.isActive()) this.tweens.timeScale = 1;
    }, ms);
  }

  // 倒下：脚边扬起一小团土
  private dust(x: number, y: number): void {
    for (let i = 0; i < 7; i++) {
      const p = this.add.rectangle(x + (Math.random() - 0.5) * 20, y - 2, 3, 3, i % 2 ? 0xb8a080 : 0x8a7458, 0.9).setDepth(spriteDepth(y) + 1);
      this.tweens.add({ targets: p, x: p.x + (Math.random() - 0.5) * 36, y: y - 6 - Math.random() * 14, alpha: 0, scale: 1.8, duration: 420 + Math.random() * 200, ease: 'Quad.easeOut', onComplete: () => p.destroy() });
    }
  }

  // ===== 技能特效（都用整数坐标的小方块和线条画，保持像素感） =====
  private px(x: number, y: number, w: number, h: number, color: number, alpha = 1): Phaser.GameObjects.Rectangle {
    // 粒子压在人物上面（以前塞进了地面那层，被人挡住，看不清）
    return this.add.rectangle(Math.round(x), Math.round(y), w, h, hex(color), alpha).setOrigin(0).setDepth(390);
  }

  // 从 (sx,sy) 飞到 (ex,ey)，返回飞到时的 Promise；trail 是拖尾颜色
  private fly(obj: Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject, ex: number, ey: number, dur: number, trail?: number, tsz = 4): Promise<void> {
    const tick = trail === undefined ? null : this.time.addEvent({
      delay: 28, loop: true, callback: () => {
        const j = tsz > 4 ? (Math.random() - 0.5) * tsz : 0;
        const p = this.px((obj as unknown as { x: number }).x - tsz / 2 + j, (obj as unknown as { y: number }).y - tsz / 2 + j, tsz, tsz, trail, 0.8);
        this.tweens.add({ targets: p, alpha: 0, scale: 0.3, duration: 260, onComplete: () => p.destroy() });
      },
    });
    return new Promise<void>((r) => this.tweens.add({ targets: obj, x: ex, y: ey, duration: dur, onComplete: () => {
      tick?.remove();
      obj.destroy();
      r();
    } }));
  }

  private orb(x: number, y: number, core: number, glow: number): Phaser.GameObjects.Container {
    const c = this.add.container(Math.round(x), Math.round(y)).setDepth(391);
    c.add(this.add.rectangle(-7, -5, 14, 10, hex(glow), 0.45).setOrigin(0));
    c.add(this.add.rectangle(-5, -7, 10, 14, hex(glow), 0.45).setOrigin(0));
    c.add(this.add.rectangle(-5, -4, 10, 8, hex(glow)).setOrigin(0));
    c.add(this.add.rectangle(-4, -5, 8, 10, hex(glow)).setOrigin(0));
    c.add(this.add.rectangle(-2, -3, 4, 6, hex(core)).setOrigin(0));
    c.add(this.add.rectangle(-3, -2, 6, 4, hex(core)).setOrigin(0));
    return c;
  }

  private async shoot(a: View, t: View, ms: (n: number) => number): Promise<void> {
    const dir = a.flip ? 1 : -1;
    const ex = t.hx - dir * 16;
    const ey = t.hy - 60;
    if (a.weapon === 'bow') {
      this.pose(a, 'atk');
      sfx('step');
      const sx = a.hx + dir * 28;
      const sy = a.hy - 60;
      const g = this.add.graphics().setDepth(391);
      // 箭朝 +x 画，再转到飞行方向
      g.fillStyle(hex(C.lightBrown)).fillRect(-12, -1, 18, 2);
      g.fillStyle(hex(C.lightGray)).fillRect(6, -3, 3, 6).fillRect(9, -2, 2, 4).fillRect(11, -1, 1, 2);
      g.fillStyle(hex(C.white)).fillRect(-14, -3, 4, 2).fillRect(-14, 1, 4, 2);
      g.setPosition(sx, sy).setRotation(Math.atan2(ey - sy, ex - sx));
      await wait(this, ms(120));
      await this.fly(g, ex, ey, ms(200));
      this.burst(ex, ey, C.white, 4);
      return;
    }
    this.pose(a, 'cast');
    sfx('magic');
    const wind = a.weapon === 'feather';
    const sx = a.hx + dir * 20;
    const sy = a.hy - (wind ? 34 : 46);
    await wait(this, ms(140));
    if (wind) {
      // 羽扇：一道弯弯的风刃
      const g = this.add.graphics().setDepth(391);
      g.lineStyle(4, hex(C.sky), 0.6).beginPath().arc(-2, 0, 14, -1.1, 1.1).strokePath();
      g.lineStyle(2, hex(C.white)).beginPath().arc(0, 0, 14, -1.0, 1.0).strokePath();
      g.setPosition(sx, sy).setRotation(Math.atan2(ey - sy, ex - sx));
      await this.fly(g, ex, ey, ms(240), C.sky);
      this.burst(ex, ey, C.sky, 6);
      return;
    }
    // 法杖：原版普攻是天上劈下一道细雷，打中处腾一团火
    const color = a.flip ? C.orange : C.sky;
    this.burst(sx, sy, color, 8);
    await wait(this, ms(120));
    this.zap(t, color, ms);
    await wait(this, ms(120));
  }

  // 一圈往外散的小方块
  private burst(x: number, y: number, color: number, n: number): void {
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + Math.random() * 0.4;
      const p = this.px(x - 2, y - 2, 4, 4, color);
      this.tweens.add({ targets: p, x: p.x + Math.cos(ang) * 20, y: p.y + Math.sin(ang) * 20, scale: 0.4, alpha: 0, duration: 320, onComplete: () => p.destroy() });
    }
  }

  // 跑动时脚后跟扬起的一小团土（往身后飘）
  private kickDust(x: number, y: number, dir: number): void {
    for (let i = 0; i < 2; i++) {
      const p = this.add.rectangle(Math.round(x - dir * 8 + (Math.random() - 0.5) * 6), Math.round(y - 3), 3, 3, i ? 0xd8c8a8 : 0xb8a080, 0.9).setDepth(spriteDepth(y) - 0.2);
      this.tweens.add({ targets: p, x: p.x - dir * (8 + Math.random() * 8), y: p.y - 4 - Math.random() * 6, scale: 2, alpha: 0, duration: 300, onComplete: () => p.destroy() });
    }
  }

  // 普攻出手：兵器划一道弧光（刀剑白、枪戟一道直刺），致命一击更大更亮
  private async swing(a: View, t: View, big: boolean, ms: (n: number) => number): Promise<void> {
    const dir = a.flip ? -1 : 1;
    const cx = t.hx - dir * 6;
    const cy = t.hy - 52;
    const k = big ? 1.5 : 1;
    const g = this.add.graphics().setDepth(392);
    if (a.weapon === 'spear') {
      // 一道直刺：长条带尖，后面拖两条残影
      g.fillStyle(hex(C.lightBlue), 0.5).fillRect(-44 * k, -5, 56 * k, 10);
      g.fillStyle(0xffffff).fillRect(-40 * k, -2, 52 * k, 4).fillRect(12 * k, -4, 4, 8).fillRect(16 * k, -2, 4, 4);
      g.fillStyle(0xffffff, 0.5).fillRect(-60 * k, -8, 20 * k, 1).fillRect(-56 * k, 7, 18 * k, 1);
      g.setPosition(cx - dir * 24, cy + 6).setScale(dir * 0.3, 1);
      this.tweens.add({ targets: g, x: cx, scaleX: dir, duration: ms(70), ease: 'Quad.easeOut' });
    } else {
      // 弧光：从后上方劈到前下方的一弯月牙
      const r = 30 * k;
      g.lineStyle(10 * k, hex(C.lightBlue), 0.35).beginPath().arc(0, 0, r, -1.9, 0.9).strokePath();
      g.lineStyle(5 * k, 0xffffff, 0.95).beginPath().arc(0, 0, r - 2, -1.7, 0.7).strokePath();
      g.lineStyle(2, 0xffffff, 0.6).beginPath().arc(0, 0, r - 9 * k, -1.3, 0.4).strokePath();
      g.setPosition(cx, cy).setScale(dir, 1).setAngle(-50 * dir);
      this.tweens.add({ targets: g, angle: 10 * dir, duration: ms(90), ease: 'Quad.easeOut' });
    }
    sfx('step');
    this.tweens.add({ targets: g, alpha: 0, delay: ms(90), duration: ms(140), onComplete: () => g.destroy() });
    if (big) this.burst(cx, cy, C.yellow, 10);
    await wait(this, ms(big ? 120 : 80));
  }

  // 打中溅血（照原版）：从伤口朝出手那一侧喷——先几道横着的血线，再散成血点往下落
  private blood(v: View, n: number, ms: (n: number) => number): void {
    const out = v.flip ? 1 : -1;
    const fx = v.hx + out * 6;
    for (let i = 0; i < 4; i++) {
      const w = 12 + Math.random() * 10;
      const p = this.px(out > 0 ? fx : fx - w, v.hy - 60 + i * 5 + Math.random() * 3, w, 3, i % 2 ? C.darkRed : C.red);
      this.tweens.add({ targets: p, x: p.x + out * 12, scaleX: 0.3, alpha: 0, duration: ms(140), onComplete: () => p.destroy() });
    }
    for (let i = 0; i < n; i++) {
      const s = i % 3 ? 3 : 4;
      const p = this.px(fx + (Math.random() - 0.5) * 6, v.hy - 58 + Math.random() * 18, s, s, i % 2 ? C.red : C.darkRed);
      const dx = out * (8 + Math.random() * 30);
      const t0 = ms(30 + Math.random() * 60);
      this.tweens.add({ targets: p, x: p.x + dx, delay: t0, duration: ms(320) });
      this.tweens.add({ targets: p, y: p.y - 4 - Math.random() * 8, delay: t0, duration: ms(110), ease: 'Quad.easeOut', onComplete: () => this.tweens.add({ targets: p, y: p.y + 16 + Math.random() * 12, duration: ms(210), ease: 'Quad.easeIn' }) });
      this.tweens.add({ targets: p, alpha: 0, delay: t0 + ms(240), duration: ms(90), onComplete: () => p.destroy() });
    }
  }

  // 一道细雷劈下来（术士的普攻，原版是蓝白一道闪电，接着脚下一团蓝火、散开一片星点）
  private zap(v: View, color: number, ms: (n: number) => number): void {
    const g = this.add.graphics().setDepth(392);
    const pts: Phaser.Math.Vector2[] = [];
    let x = v.hx + (Math.random() - 0.5) * 10;
    for (let y = v.hy - 150; y < v.hy - 60; y += 12) {
      pts.push(new Phaser.Math.Vector2(Math.round(x), y));
      x += (Math.random() - 0.5) * 18;
    }
    pts.push(new Phaser.Math.Vector2(v.hx, v.hy - 4));
    g.lineStyle(8, hex(color), 0.35).strokePoints(pts);
    g.lineStyle(3, hex(color)).strokePoints(pts);
    g.lineStyle(1, 0xffffff).strokePoints(pts);
    this.tweens.add({ targets: g, alpha: 0, delay: ms(90), duration: ms(120), onComplete: () => g.destroy() });
    this.puff(v, color, ms, 0.6);
    for (let i = 0; i < 10; i++) {
      const p = this.px(v.hx - 3, v.hy - 12, 3, 3, i % 3 ? color : C.white);
      const ang = -Math.PI * (0.1 + Math.random() * 0.8);
      const d = 14 + Math.random() * 22;
      this.tweens.add({ targets: p, x: p.x + Math.cos(ang) * d, y: p.y + Math.sin(ang) * d * 0.6, alpha: 0, delay: ms(200), duration: ms(420), onComplete: () => p.destroy() });
    }
  }

  private foesView(a: View): View[] {
    return [...this.views.values()].filter((v) => v.flip !== a.flip && !v.dead);
  }

  private friendsView(a: View): View[] {
    return [...this.views.values()].filter((v) => v.flip === a.flip && !v.dead);
  }

  // 脚下一圈光（鼓舞、回血、八门金锁）：画成像素八角，往外扩一下再淡掉
  private groundRing(v: View, color: number, ms: (n: number) => number, octagon = false): void {
    const g = this.add.graphics().setDepth(spriteDepth(v.hy) - 0.6);
    g.lineStyle(2, hex(color), 0.9);
    if (octagon) {
      const pts = Array.from({ length: 9 }, (_, i) => new Phaser.Math.Vector2(Math.cos((i / 8) * Math.PI * 2) * 30, Math.sin((i / 8) * Math.PI * 2) * 9));
      g.strokePoints(pts);
      g.lineStyle(1, hex(color), 0.6).lineBetween(-30, 0, 30, 0).lineBetween(-21, -6, 21, 6).lineBetween(-21, 6, 21, -6);
    } else g.strokeEllipse(0, 0, 56, 16);
    g.setPosition(v.hx, v.hy).setScale(0.5);
    this.fx.add(g);
    this.tweens.add({ targets: g, scale: 1.1, duration: ms(220), ease: 'Quad.easeOut' });
    this.tweens.add({ targets: g, alpha: 0, delay: ms(380), duration: ms(240), onComplete: () => g.destroy() });
  }

  // 往上飘的小光点（回血绿、鼓舞金）
  private rise(v: View, color: number, n = 10): void {
    for (let i = 0; i < n; i++) {
      const p = this.px(v.hx - 16 + Math.random() * 32, v.hy - 6 - Math.random() * 20, 2, 2 + (i % 2), color);
      this.tweens.add({ targets: p, y: p.y - 30 - Math.random() * 20, alpha: 0, duration: 520 + Math.random() * 200, delay: i * 25, onComplete: () => p.destroy() });
    }
  }

  // ===== 黑场：照原版，放技能时战场整片压黑，只剩人和招式；顶上挂大横幅招式名 =====
  private decoAlpha: number[] = [];
  private async stageOn(id: string, a: View, ms: (n: number) => number): Promise<void> {
    if (this.staged) return;
    this.staged = id;
    this.decoAlpha = this.deco.map((d) => d.alpha);
    this.tweens.killTweensOf(this.curtain);
    this.tweens.add({ targets: this.curtain, alpha: 0.97, duration: ms(140) });
    this.tweens.add({ targets: this.deco, alpha: 0, duration: ms(140) });
    for (const l of this.lamps) l.setVisible(false);
    await wait(this, ms(160));
    // 出招人身上先爆一团星芒（原版那一下蓝白星光）
    sfx('whoosh');
    this.starburst(a.hx, a.hy - 56, SKILL_COLOR[id] ?? C.sky, ms);
    await wait(this, ms(240));
  }

  private async stageOff(ms: (n: number) => number): Promise<void> {
    if (!this.staged) return;
    this.staged = null;
    this.tweens.killTweensOf(this.curtain);
    this.tweens.add({ targets: this.curtain, alpha: 0, duration: ms(200) });
    this.deco.forEach((d, i) => this.tweens.add({ targets: d, alpha: this.decoAlpha[i] ?? 1, duration: ms(200) }));
    for (const l of this.lamps) l.setVisible(true);
    await wait(this, ms(200));
  }

  // 整片战场白一下（压在人物下面，人还看得见）；关了震屏就不闪
  private whiteOut(ms: (n: number) => number, alpha = 0.6, color = 0xffffff): void {
    if (!settings().shake) return;
    const f = this.add.rectangle(0, FIELD_Y, W, FIELD_H, color, alpha).setOrigin(0).setDepth(99.2);
    this.tweens.add({ targets: f, alpha: 0, duration: ms(180), onComplete: () => f.destroy() });
  }

  // 星芒：一圈长短相间的光芒，中间十字白芯，转着胀开
  private starburst(x: number, y: number, color: number, ms: (n: number) => number, size = 1): void {
    const g = this.add.graphics().setDepth(393);
    const n = 16;
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + Math.random() * 0.15;
      const len = (i % 2 ? 20 + Math.random() * 10 : 42 + Math.random() * 18) * size;
      g.lineStyle(4, hex(color), 0.55).lineBetween(0, 0, Math.cos(ang) * len, Math.sin(ang) * len);
      g.lineStyle(1, hex(C.white)).lineBetween(0, 0, Math.cos(ang) * len * 0.85, Math.sin(ang) * len * 0.85);
    }
    g.fillStyle(hex(color), 0.5).fillCircle(0, 0, 14 * size);
    g.fillStyle(hex(C.white)).fillRect(-7, -2, 14, 4).fillRect(-2, -7, 4, 14).fillRect(-4, -4, 8, 8);
    g.setPosition(Math.round(x), Math.round(y)).setScale(0.2);
    this.tweens.add({ targets: g, scale: 1.15, angle: 25, duration: ms(180), ease: 'Quad.easeOut' });
    this.tweens.add({ targets: g, alpha: 0, scale: 1.5, delay: ms(220), duration: ms(180), onComplete: () => g.destroy() });
    this.whiteOut(ms, 0.45);
  }

  // 命中：脚下腾起一团像素火（原版呼风唤雨打中是一团蓝白火），每种招式按自己的颜色
  private puff(v: View, color: number, ms: (n: number) => number, size = 1): void {
    const g = this.add.graphics().setDepth(spriteDepth(v.hy) + 0.8);
    const flame = (cx: number, h: number) => {
      // 从下往上一行行：下圆上尖，主色外圈、白芯
      for (let r = 0; r < h; r += 2) {
        const k = r / h;
        const hw = Math.round((k < 0.35 ? Math.sqrt(k / 0.35) : 1 - (k - 0.35) / 0.65) * (h * 0.32) + 1);
        const sway = Math.round(Math.sin(k * 5) * k * 3);
        g.fillStyle(hex(color)).fillRect(cx - hw + sway, -r - 2, hw * 2, 2);
        if (hw > 5 && k < 0.6) g.fillStyle(0xffffff, 0.85).fillRect(cx - hw + 5 + sway, -r - 2, hw * 2 - 10, 2);
      }
    };
    flame(-12, 28);
    flame(11, 24);
    flame(0, 40);
    g.setPosition(v.hx, v.hy - 2).setScale(size, 0.2 * size);
    this.tweens.add({ targets: g, scaleY: size, duration: ms(140), ease: 'Back.easeOut' });
    this.tweens.add({ targets: g, scaleX: 0.85 * size, duration: ms(90), delay: ms(140), yoyo: true, repeat: 2 });
    this.tweens.add({ targets: g, y: v.hy - 16, alpha: 0, delay: ms(560), duration: ms(260), onComplete: () => g.destroy() });
    for (let i = 0; i < 6; i++) {
      const p = this.px(v.hx - 12 + Math.random() * 24, v.hy - 10 - Math.random() * 20, 2, 2, i % 2 ? color : C.white);
      this.tweens.add({ targets: p, y: p.y - 26 - Math.random() * 16, alpha: 0, duration: ms(520), delay: ms(i * 40), onComplete: () => p.destroy() });
    }
  }

  // 卷风：满场斜线从出招那边扫向对面，夹着翻飞的叶子，挨打的人身上溅血点
  private windSweep(vs: View[], dir: number, ms: (n: number) => number, dur: number): Promise<void> {
    if (!vs.length) return wait(this, ms(dur));
    const x0 = Math.min(...vs.map((v) => v.hx)) - 56;
    const x1 = Math.max(...vs.map((v) => v.hx)) + 56;
    const y0 = Math.min(...vs.map((v) => v.hy)) - 120;
    const y1 = Math.max(...vs.map((v) => v.hy)) + 8;
    const ang = -0.42;
    const dx = Math.cos(ang) * 48 * dir;
    const dy = Math.sin(ang) * 48 * dir;
    let k = 0;
    const ev = this.time.addEvent({ delay: 20, loop: true, callback: () => {
      k++;
      const len = 24 + Math.random() * 44;
      const x = x0 + Math.random() * (x1 - x0);
      const y = y0 + Math.random() * (y1 - y0);
      const g = this.add.graphics().setDepth(392);
      g.lineStyle(k % 3 ? 1 : 2, hex(C.white), 0.95).lineBetween(0, 0, len, 0);
      g.lineStyle(1, hex(C.sky), 0.6).lineBetween(4, 2, len * 0.7, 2);
      g.setPosition(Math.round(x), Math.round(y)).setRotation(ang).setAlpha(0);
      this.tweens.add({ targets: g, alpha: 1, duration: ms(60) });
      this.tweens.add({ targets: g, x: x + dx, y: y + dy, duration: ms(300) });
      this.tweens.add({ targets: g, alpha: 0, delay: ms(200), duration: ms(100), onComplete: () => g.destroy() });
      if (k % 3 === 0) {
        const lf = this.px(x, y, 6, 3, k % 2 ? C.lime : C.green);
        this.tweens.add({ targets: lf, x: x + dx * 2.4, y: y + dy * 2.4 + 10, angle: 540 * dir, alpha: 0, duration: ms(520), onComplete: () => lf.destroy() });
      }
      if (k % 7 === 0) {
        const v = vs[Math.floor(Math.random() * vs.length)];
        for (let j = 0; j < 3; j++) {
          const p = this.px(v.hx - 10 + Math.random() * 20, v.hy - 70 + Math.random() * 40, 2, 2, j % 2 ? C.red : C.darkRed);
          this.tweens.add({ targets: p, x: p.x + dx * 0.3, y: p.y + 6, alpha: 0, duration: ms(300), onComplete: () => p.destroy() });
        }
      }
    } });
    return wait(this, ms(dur)).then(() => ev.remove());
  }

  // 一道粗雷（比 bolt 更粗更亮），落地炸开、四下窜电
  private bigBolt(v: View, color: number, ms: (n: number) => number): void {
    const g = this.add.graphics().setDepth(392);
    const pts: Phaser.Math.Vector2[] = [];
    let x = v.hx + (Math.random() - 0.5) * 20;
    for (let y = FIELD_Y + 2; y < v.hy - 70; y += 14) {
      pts.push(new Phaser.Math.Vector2(Math.round(x), y));
      x += (Math.random() - 0.5) * 24;
    }
    pts.push(new Phaser.Math.Vector2(v.hx, v.hy - 70));
    pts.push(new Phaser.Math.Vector2(v.hx + (Math.random() - 0.5) * 8, v.hy - 4));
    g.lineStyle(18, hex(color), 0.25).strokePoints(pts);
    g.lineStyle(8, hex(color)).strokePoints(pts);
    g.lineStyle(3, hex(C.white)).strokePoints(pts);
    for (let f = 2; f < pts.length - 1; f += 3) {
      const p = pts[f];
      const fx = p.x + (Math.random() < 0.5 ? -1 : 1) * (14 + Math.random() * 10);
      g.lineStyle(2, hex(color)).lineBetween(p.x, p.y, fx, p.y + 14).lineBetween(fx, p.y + 14, fx + (fx - p.x) * 0.5, p.y + 24);
    }
    this.tweens.add({ targets: g, alpha: 0, delay: ms(110), duration: ms(160), onComplete: () => g.destroy() });
    // 落点窜几道小电弧
    for (let i = 0; i < 6; i++) {
      const e = this.add.graphics().setDepth(392);
      const a0 = Math.random() * Math.PI * 2;
      const r = 10 + Math.random() * 18;
      e.lineStyle(2, hex(i % 2 ? C.white : color)).lineBetween(0, 0, Math.cos(a0) * r * 0.5 + 4, Math.sin(a0) * r * 0.5).lineBetween(Math.cos(a0) * r * 0.5 + 4, Math.sin(a0) * r * 0.5, Math.cos(a0) * r, Math.sin(a0) * r);
      e.setPosition(v.hx, v.hy - 50).setAlpha(0);
      this.tweens.add({ targets: e, alpha: 1, delay: ms(80 + i * 40), duration: ms(40), yoyo: true, hold: ms(60), onComplete: () => e.destroy() });
    }
  }

  // 一根光柱从天而降罩住 v（固若金汤、回血、解计、万夫莫敌）
  private beam(v: View, color: number, ms: (n: number) => number): void {
    const top = SAFE_TOP + TOP_H;
    const o = this.add.rectangle(v.hx, top, 40, v.hy - top, hex(color), 0.35).setOrigin(0.5, 0).setDepth(391);
    const i = this.add.rectangle(v.hx, top, 12, v.hy - top, 0xffffff, 0.75).setOrigin(0.5, 0).setDepth(391);
    o.setScale(0.1, 1);
    i.setScale(0.1, 1);
    this.tweens.add({ targets: [o, i], scaleX: 1, duration: ms(140), ease: 'Quad.easeOut' });
    this.tweens.add({ targets: [o, i], scaleX: 0, alpha: 0, delay: ms(420), duration: ms(240), onComplete: () => {
      o.destroy();
      i.destroy();
    } });
  }

  // 飞在头顶转的一圈符文小方块（计策中招前）
  private runeRing(v: View, color: number, ms: (n: number) => number): void {
    const bits = Array.from({ length: 12 }, (_, i) => this.px(v.hx, v.hy - 60, 6, 6, i % 2 ? color : C.white));
    const o = { a: 0, r: 60 };
    this.tweens.add({
      targets: o, a: Math.PI * 3, r: 14, duration: ms(520), ease: 'Quad.easeIn',
      onUpdate: () => bits.forEach((b, i) => b.setPosition(Math.round(v.hx + Math.cos(o.a + i * 0.524) * o.r - 3), Math.round(v.hy - 60 + Math.sin(o.a + i * 0.524) * o.r * 0.45 - 3))),
      onComplete: () => {
        bits.forEach((b) => b.destroy());
        this.starburst(v.hx, v.hy - 60, color, ms, 0.6);
      },
    });
  }

  private async skillFx(id: string | undefined, a: View, t: View | undefined, ms: (n: number) => number): Promise<void> {
    const dir = a.flip ? 1 : -1;
    switch (id) {
      case 'wulei': {
        if (!t) return;
        // 头顶乌云一压，三道粗雷连劈，每劈一下全场一白、镜头一抖，落点电弧乱窜
        sfx('thunder');
        const cloud = this.add.graphics().setDepth(391);
        cloud.fillStyle(0x30304a, 0.9).fillEllipse(0, 0, 120, 26).fillEllipse(-30, 6, 70, 20).fillEllipse(34, 6, 70, 22);
        cloud.fillStyle(0x50507a, 0.8).fillEllipse(-10, -4, 70, 12);
        cloud.setPosition(t.hx, t.hy - 150).setAlpha(0);
        this.tweens.add({ targets: cloud, alpha: 1, duration: ms(160) });
        await wait(this, ms(200));
        for (let k = 0; k < 3; k++) {
          this.bigBolt(t, C.yellow, ms);
          this.whiteOut(ms, 0.7);
          this.shake(ms(160), 0.009);
          if (k) sfx('boom');
          await wait(this, ms(190));
        }
        this.burst(t.hx, t.hy - 72, C.yellow, 16);
        this.burst(t.hx, t.hy - 10, C.white, 10);
        this.scorch(t, ms);
        this.tweens.add({ targets: cloud, alpha: 0, duration: ms(200), onComplete: () => cloud.destroy() });
        await wait(this, ms(120));
        return;
      }
      case 'wugu': {
        if (!t) return;
        // 一团大毒球拖着绿烟飞过去，炸成一大片毒雾
        const orb = this.orb(a.hx + dir * 20, a.hy - 92, C.lime, C.purple).setScale(2.6);
        this.tweens.add({ targets: orb, angle: 360, duration: ms(420) });
        await this.fly(orb, t.hx, t.hy - 60, ms(420), C.green, 8);
        sfx('boom');
        this.starburst(t.hx, t.hy - 60, C.lime, ms, 0.8);
        this.bubbles(t, ms);
        await wait(this, ms(160));
        this.bubbles(t, ms);
        await wait(this, ms(300));
        return;
      }
      case 'hufeng': {
        // 原版就是这样：满场斜风夹着树叶扫过敌阵，人身上溅血点，最后每人脚下一团蓝白火
        const foes = this.foesView(a);
        sfx('wind');
        this.rain(ms);
        await this.windSweep(foes, -dir, ms, 1000);
        return;
      }
      case 'yaohuo': {
        // 地上先烧红一圈，火苗一波波往上蹿，敌阵变成一片火海
        const foes = this.foesView(a);
        sfx('fire');
        for (let k = 0; k < 3; k++) {
          for (const v of foes) {
            this.flames(v, ms);
            this.puff(v, k % 2 ? C.red : C.orange, ms, 1.5 + k * 0.3);
          }
          if (k === 1) {
            sfx('fire');
            this.whiteOut(ms, 0.35, 0xff8030);
          }
          await wait(this, ms(300));
        }
        await wait(this, ms(120));
        return;
      }
      case 'chenhuo':
      case 'simian':
      case 'huadi': {
        if (!t) return;
        // 计策：一道光飞过去，符文绕头顶收拢，中计与否在 status 事件里再画
        const orb = this.orb(a.hx + dir * 20, a.hy - 72, C.white, SKILL_COLOR[id]).setScale(2.4);
        await this.fly(orb, t.hx, t.hy - 72, ms(340), SKILL_COLOR[id], 7);
        sfx('chime');
        this.runeRing(t, SKILL_COLOR[id], ms);
        await wait(this, ms(600));
        return;
      }
      case 'gujin':
      case 'andu': {
        // 固若金汤：每人一道金光柱；暗渡陈仓：白光柱
        sfx('chime');
        for (const v of this.friendsView(a)) {
          this.beam(v, id === 'gujin' ? C.gold : C.white, ms);
          this.groundRing(v, id === 'gujin' ? C.gold : C.white, ms, id === 'gujin');
        }
        await wait(this, ms(560));
        return;
      }
      // ===== 进阶招式 =====
      case 'hengsao': {
        // 一刀横扫：一道巨大的白弧从前排扫到后排，个个挨一道
        sfx('whoosh');
        const foes = this.foesView(a);
        for (const [k, v] of foes.entries()) {
          this.time.delayedCall(ms(k * 70), () => {
            sfx('slash');
            this.slash(a, v, C.white, false);
            this.burst(v.hx, v.hy - 60, C.white, 8);
          });
        }
        this.shake(ms(220), 0.008);
        this.whiteOut(ms, 0.4);
        await wait(this, ms(200 + foes.length * 70));
        return;
      }
      case 'fengwu': {
        // 凤舞九天：粉红刀光连闪五下，最后一下最大
        if (!t) return;
        for (let k = 0; k < 5; k++) {
          sfx('slash');
          this.slash(a, t, k % 2 ? C.pink : C.red, k % 2 === 0);
          this.burst(t.hx + (Math.random() - 0.5) * 20, t.hy - 60, k % 2 ? C.pink : C.red, 6);
          await wait(this, ms(90));
        }
        this.starburst(t.hx, t.hy - 60, C.pink, ms, 0.8);
        await wait(this, ms(160));
        return;
      }
      case 'wanfu': {
        // 万夫莫敌：战鼓三通，全军脚下金光、头顶金柱、身上冒金点
        sfx('drum');
        for (const v of this.friendsView(a)) {
          this.groundRing(v, C.gold, ms);
          this.beam(v, C.gold, ms);
          this.rise(v, C.gold, 14);
        }
        this.whiteOut(ms, 0.4, 0xffe090);
        await wait(this, ms(300));
        sfx('drum');
        await wait(this, ms(300));
        return;
      }
      case 'yunchou':
      case 'miaoshou': {
        // 回血：清铃一声，全队脚下绿光、身上一道柔光柱、光点往上飘
        sfx('chime');
        const c = id === 'miaoshou' ? C.green : C.lime;
        for (const v of this.friendsView(a)) {
          this.groundRing(v, c, ms);
          this.beam(v, c, ms);
          this.rise(v, c, 16);
        }
        await wait(this, ms(560));
        return;
      }
      case 'bamen': {
        // 八门金锁：敌阵脚下八角金锁两圈套下去
        sfx('chime');
        for (const v of this.foesView(a)) this.groundRing(v, C.yellow, ms, true);
        await wait(this, ms(220));
        sfx('chime');
        for (const v of this.foesView(a)) {
          this.groundRing(v, C.gold, ms, true);
          this.runeRing(v, C.yellow, ms);
        }
        await wait(this, ms(520));
        return;
      }
      case 'mihun': {
        // 迷魂大法：几团粉紫的魂火分头飞向敌阵，打中炸成星芒
        const foes = this.foesView(a).slice(0, 4);
        await Promise.all(foes.map((v, k) => wait(this, ms(k * 80)).then(() => this.fly(this.orb(a.hx + dir * 20, a.hy - 80, C.pink, C.purple).setScale(2.2), v.hx, v.hy - 64, ms(340), C.purple, 6)).then(() => this.starburst(v.hx, v.hy - 64, C.purple, ms, 0.6))));
        await wait(this, ms(260));
        return;
      }
      case 'xixing': {
        // 吸星大法：一道紫雷落下，再从对方身上抽回一长串紫光
        if (!t) return;
        sfx('thunder');
        this.bigBolt(t, C.purple, ms);
        this.whiteOut(ms, 0.5, 0xc080ff);
        this.shake(ms(140), 0.006);
        await wait(this, ms(220));
        for (let k = 0; k < 14; k++) {
          const p = this.px(t.hx - 2, t.hy - 60 + (Math.random() - 0.5) * 30, 3, 3, k % 2 ? C.purple : C.pink);
          this.tweens.add({ targets: p, x: a.hx, y: a.hy - 50, duration: ms(340), delay: ms(k * 30), ease: 'Quad.easeIn', onComplete: () => p.destroy() });
        }
        await wait(this, ms(500));
        this.starburst(a.hx, a.hy - 50, C.purple, ms, 0.6);
        return;
      }
      case 'tianbeng': {
        // 天崩地裂：敌阵每人三道粗雷、天上砸下乱石、地面焦黑
        sfx('thunder');
        const foes = this.foesView(a);
        for (let k = 0; k < 3; k++) {
          for (const v of foes) this.bigBolt(v, C.yellow, ms);
          this.whiteOut(ms, 0.7);
          this.shake(ms(180), 0.01);
          sfx('boom');
          for (const v of foes) {
            const r = this.px(v.hx - 6 + (Math.random() - 0.5) * 30, FIELD_Y + 20, 8 + Math.random() * 6, 8, k % 2 ? C.darkBrown : C.gray);
            this.tweens.add({ targets: r, y: v.hy - 12, angle: 180, duration: ms(200), ease: 'Quad.easeIn', onComplete: () => {
              this.burst(r.x, r.y, C.lightBrown, 6);
              r.destroy();
            } });
          }
          await wait(this, ms(180));
        }
        for (const v of foes) {
          this.burst(v.hx, v.hy - 70, C.yellow, 10);
          this.scorch(v, ms);
        }
        await wait(this, ms(120));
        return;
      }
      default:
        if (t && t !== a) this.starburst(t.hx, t.hy - 60, C.lilac, ms, 0.7);
        await wait(this, ms(300));
    }
  }

  // 大刀光：力劈华山、排山倒海是白金色的巨大竖劈，舍命一击是血红的，劈完十字星芒
  private async bigSlash(a: View, t: View, color: number, ms: (n: number) => number): Promise<void> {
    sfx('slash');
    const dir = a.flip ? 1 : -1;
    const g = this.add.graphics().setDepth(392);
    g.lineStyle(18, hex(color), 0.3).beginPath().arc(0, 0, 66, -1.3, 1.3).strokePath();
    g.lineStyle(9, hex(color), 0.85).beginPath().arc(0, 0, 62, -1.2, 1.2).strokePath();
    g.lineStyle(3, hex(C.white)).beginPath().arc(0, 0, 58, -1.1, 1.1).strokePath();
    g.setPosition(t.hx - dir * 28, t.hy - 58).setRotation(dir > 0 ? 0.3 : Math.PI - 0.3).setScale(0.5).setAlpha(0);
    this.tweens.add({ targets: g, alpha: 1, scale: 1.05, duration: ms(110), ease: 'Quad.easeOut' });
    this.tweens.add({ targets: g, alpha: 0, scale: 1.35, delay: ms(170), duration: ms(200), onComplete: () => g.destroy() });
    await wait(this, ms(110));
    this.whiteOut(ms, 0.55);
    this.shake(ms(180), 0.009);
    this.starburst(t.hx, t.hy - 60, color, ms, 0.7);
    this.burst(t.hx, t.hy - 60, color, 14);
    await wait(this, ms(220));
  }

  // 刀光：一道月牙弧（力劈华山是白的竖劈，舍命一击是红的）
  private slash(a: View, t: View, color: number, vertical: boolean): void {
    const g = this.add.graphics().setDepth(392);
    const cx = t.hx;
    const cy = t.hy - 60;
    g.lineStyle(8, hex(color), 0.45).beginPath().arc(0, 0, 40, -1.2, 1.2).strokePath();
    g.lineStyle(3, hex(C.white)).beginPath().arc(0, 0, 37, -1.0, 1.0).strokePath();
    const dir = a.flip ? 1 : -1;
    g.setPosition(cx - dir * 20, cy).setRotation(vertical ? (dir > 0 ? 0.3 : Math.PI - 0.3) : dir > 0 ? 0 : Math.PI);
    if (vertical) this.shake(120, 0.005);
    this.tweens.add({ targets: g, alpha: 0, scale: 1.3, duration: 260, onComplete: () => g.destroy() });
  }

  private async bloodAura(a: View, ms: (n: number) => number): Promise<void> {
    a.spr.setTint(0xff6060);
    for (let i = 0; i < 10; i++) {
      const p = this.px(a.hx - 14 + Math.random() * 28, a.hy - 8 - Math.random() * 40, 2, 3, i % 2 ? C.red : C.darkRed);
      this.tweens.add({ targets: p, y: p.y - 16, alpha: 0, duration: 380, delay: i * 20, onComplete: () => p.destroy() });
    }
    await wait(this, ms(240));
    a.spr.clearTint();
  }

  // 雷劈完脚下一圈焦黑和火星
  private scorch(v: View, ms: (n: number) => number): void {
    const e = this.add.ellipse(v.hx, v.hy, 56, 14, 0x201810, 0.6).setDepth(389);
    this.fx.add(e);
    this.tweens.add({ targets: e, alpha: 0, delay: ms(300), duration: ms(300), onComplete: () => e.destroy() });
  }

  private bubbles(v: View, ms: (n: number) => number): void {
    // 一团紫绿毒雾罩住，再冒一串泡
    const cloud = this.add.graphics().setDepth(391);
    cloud.fillStyle(hex(C.purple), 0.7).fillEllipse(0, 0, 86, 60).fillEllipse(-24, 16, 48, 34).fillEllipse(24, 16, 48, 34);
    cloud.fillStyle(hex(C.lime), 0.55).fillEllipse(0, 8, 60, 34);
    cloud.setPosition(v.hx, v.hy - 60).setScale(0.4);
    this.tweens.add({ targets: cloud, scale: 1, duration: ms(200), ease: 'Quad.easeOut' });
    this.tweens.add({ targets: cloud, alpha: 0, delay: ms(420), duration: ms(240), onComplete: () => cloud.destroy() });
    for (let i = 0; i < 16; i++) {
      const sz = 3 + (i % 3);
      const p = this.px(v.hx - 16 + Math.random() * 32, v.hy - 16 - Math.random() * 40, sz, sz, i % 3 ? C.lime : C.lilac, 0.95);
      this.tweens.add({ targets: p, y: p.y - 18 - Math.random() * 14, alpha: 0, duration: ms(560), delay: ms(i * 26), onComplete: () => p.destroy() });
    }
  }

  // 呼风唤雨：满场斜雨
  private rain(ms: (n: number) => number): void {
    for (let i = 0; i < 40; i++) {
      const x = Math.random() * W;
      const y = FIELD_Y + Math.random() * 60;
      const p = this.px(x, y, 2, 10, i % 3 ? C.sky : C.white, 0.8);
      this.tweens.add({ targets: p, x: x - 30, y: y + 140 + Math.random() * 80, alpha: 0, duration: ms(560), delay: ms(Math.random() * 160), onComplete: () => p.destroy() });
    }
  }

  // 妖火燎原：脚下一圈火光，火苗一团团往上蹿
  private flames(v: View, ms: (n: number) => number): void {
    const glow = this.add.ellipse(v.hx, v.hy, 76, 18, hex(C.orange), 0.55).setDepth(389);
    this.fx.add(glow);
    this.tweens.add({ targets: glow, alpha: 0, delay: ms(300), duration: ms(240), onComplete: () => glow.destroy() });
    const cols = [C.yellow, C.orange, C.red, C.orange];
    for (let i = 0; i < 28; i++) {
      const sz = 4 + (i % 4);
      const p = this.px(v.hx - 28 + Math.random() * 56, v.hy - 12 - Math.random() * 30, sz, sz + 2, cols[i % 4]);
      this.tweens.add({ targets: p, y: p.y - 24 - Math.random() * 30, scaleX: 0.3, scaleY: 0.3, alpha: 0, duration: ms(460), delay: ms(i * 12), onComplete: () => p.destroy() });
    }
  }

  // 固若金汤：一层金色护罩
  private shield(v: View, ms: (n: number) => number): void {
    const g = this.add.graphics().setDepth(392);
    g.fillStyle(hex(C.yellow), 0.18).fillEllipse(0, 0, 70, 110);
    g.lineStyle(3, hex(C.gold)).strokeEllipse(0, 0, 70, 110);
    g.lineStyle(1, hex(C.yellow), 0.6).strokeEllipse(0, 0, 58, 98);
    g.setPosition(v.hx, v.hy - 56).setScale(0.6);
    this.tweens.add({ targets: g, scale: 1, duration: ms(180), ease: 'Back.easeOut' });
    this.tweens.add({ targets: g, alpha: 0, delay: ms(380), duration: ms(200), onComplete: () => g.destroy() });
    for (let i = 0; i < 5; i++) {
      const p = this.px(v.hx - 14 + i * 7, v.hy - 8, 2, 2, C.yellow);
      this.tweens.add({ targets: p, y: p.y - 40, alpha: 0, duration: ms(460), delay: ms(i * 40), onComplete: () => p.destroy() });
    }
  }

  // 暗渡陈仓解开计策：一道白光从天而降
  private pillar(v: View, color: number, ms: (n: number) => number): void {
    const r = this.px(v.hx - 14, FIELD_Y, 28, v.hy - FIELD_Y, color, 0.5);
    const c = this.px(v.hx - 3, FIELD_Y, 6, v.hy - FIELD_Y, C.white, 0.8);
    this.tweens.add({ targets: [r, c], alpha: 0, scaleX: 0.2, x: v.hx, duration: ms(420), onComplete: () => {
      r.destroy();
      c.destroy();
    } });
  }

  // 中计：乱=头顶转圈的星星；封=额前一张黄符加两道锁链；围=地上一圈牢笼栅栏
  private statusFx(v: View, st: string, ms: (n: number) => number): void {
    if (st === 'chaos') {
      const stars = [0, 1, 2].map(() => {
        const c = this.add.container(v.hx, v.hy - 100).setDepth(392);
        c.add(this.add.rectangle(-1, -4, 3, 9, hex(C.yellow)).setOrigin(0));
        c.add(this.add.rectangle(-4, -1, 9, 3, hex(C.yellow)).setOrigin(0));
        c.add(this.add.rectangle(0, 0, 1, 1, hex(C.white)).setOrigin(0));
        return c;
      });
      const o = { a: 0 };
      this.tweens.add({
        targets: o, a: Math.PI * 4, duration: ms(900),
        onUpdate: () => stars.forEach((c, i) => c.setPosition(Math.round(v.hx + Math.cos(o.a + i * 2.1) * 16), Math.round(v.hy - 100 + Math.sin(o.a + i * 2.1) * 5))),
        onComplete: () => stars.forEach((c) => c.destroy()),
      });
    } else if (st === 'seal') {
      const g = this.add.graphics().setDepth(392);
      g.fillStyle(hex(C.darkBrown)).fillRect(-8, -13, 16, 26);
      g.fillStyle(hex(C.yellow)).fillRect(-7, -12, 14, 24);
      g.fillStyle(hex(C.red)).fillRect(-1, -10, 3, 20).fillRect(-5, -6, 11, 2).fillRect(-5, 1, 11, 2).fillRect(-4, 6, 9, 2);
      g.setPosition(v.hx, v.hy - 180);
      this.tweens.add({ targets: g, y: v.hy - 92, duration: ms(180), ease: 'Quad.easeIn' });
      const chain = this.add.graphics().setDepth(391);
      for (let i = -16; i <= 16; i += 4) {
        chain.fillStyle(hex(C.darkGray)).fillRect(v.hx + i - 1, v.hy - 60 + i * 0.6 - 1, 5, 4).fillRect(v.hx + i - 1, v.hy - 60 - i * 0.6 - 1, 5, 4);
        chain.fillStyle(hex(C.lightGray)).fillRect(v.hx + i, v.hy - 60 + i * 0.6, 3, 2).fillRect(v.hx + i, v.hy - 60 - i * 0.6, 3, 2);
      }
      chain.setAlpha(0);
      this.tweens.add({ targets: chain, alpha: 1, delay: ms(160), duration: ms(100) });
      this.tweens.add({ targets: [g, chain], alpha: 0, delay: ms(620), duration: ms(200), onComplete: () => {
        g.destroy();
        chain.destroy();
      } });
    } else if (st === 'trap') {
      const g = this.add.graphics().setDepth(392);
      g.lineStyle(2, hex(C.gold)).strokeEllipse(v.hx, v.hy, 64, 16);
      for (let i = -28; i <= 28; i += 8) g.fillStyle(hex(C.darkBrown)).fillRect(v.hx + i - 1, v.hy - 116, 4, 58).fillStyle(hex(C.lightBrown)).fillRect(v.hx + i, v.hy - 116, 2, 58);
      g.fillStyle(hex(C.lightBrown)).fillRect(v.hx - 30, v.hy - 116, 62, 2);
      g.setScale(1, 0);
      g.y = v.hy;
      this.tweens.add({ targets: g, scaleY: 1, y: 0, duration: ms(200), ease: 'Quad.easeOut' });
      this.tweens.add({ targets: g, alpha: 0, delay: ms(640), duration: ms(200), onComplete: () => g.destroy() });
    }
  }

  private spark(v: View, color: number): void {
    for (let i = 0; i < 6; i++) {
      const p = this.add.rectangle(v.hx + (Math.random() - 0.5) * 44, v.hy - 60 + (Math.random() - 0.5) * 50, 2, 2, hex(color)).setDepth(390);
      this.tweens.add({ targets: p, y: p.y - 12, alpha: 0, duration: 400 + Math.random() * 200, onComplete: () => p.destroy() });
    }
  }

  // ===== 录像回放 =====
  private replayRound(): void {
    const rp = this.replay!;
    this.roundText.setText(`录像 ${Math.min(this.replayAt + 1, rp.rounds.length)}/${rp.rounds.length}`);
    const r = rp.rounds[this.replayAt++];
    if (!r) return this.replayEnd();
    this.b.rng.state = r.s;
    this.cmds = r.c.map((c) => ({ ...c }));
    this.time.delayedCall(200 / this.speed, () => this.resolve());
  }

  private replayEnd(): void {
    const out = this.b.outcome === 'win' ? '胜利' : this.b.outcome === 'lose' ? '失败' : '结束';
    const c = this.scroll(220, '录像');
    const y = this.scrollY(220);
    c.add(text(this, W / 2, y + 60, `录像播完了（${out}）`, { align: 'center', color: PAPER.ink, scale: 2 }));
    c.add(new Button(this, W / 2 - 50, y + 220 - 56, 100, 28, '返回', () => this.scene.start('Main'), { style: 'red' }));
  }

  // ===== 战果总结 =====
  private finish(): void {
    this.clearMenu();
    this.hideBanner();
    if (this.replay) return this.replayEnd();
    const sum = finishBattle(store.save, this.b);
    store.flush();
    if (sum.outcome === 'win' || sum.outcome === 'lose') playJingle(sum.outcome);
    else sfx('step');
    if (sum.lines.some((l) => l.includes('升到'))) this.time.delayedCall(1400, () => {
      playJingle('level');
      buzz('heavy');
    });
    // 胜利：活着的我方举起兵器
    if (sum.outcome === 'win') for (const v of this.views.values()) if (!v.flip && !v.dead) this.pose(v, 'cast');
    this.time.delayedCall(sum.outcome === 'win' ? 500 : 200, () => this.showSummary(sum));
  }

  private scrollY(h: number): number {
    return Math.max(24, Math.floor((H - h) / 2) - 10);
  }

  // 卷轴：压暗整屏，漆木框宣纸，题签写标题
  private scroll(h: number, title: string): Phaser.GameObjects.Container {
    const c = this.add.container(0, 0).setDepth(600);
    const w = Math.min(320, W - 16);
    const x = (W - w) / 2;
    const y = this.scrollY(h);
    const dim = this.add.graphics();
    dim.fillStyle(0x0a0604, 0.62).fillRect(0, 0, W, H);
    c.add([this.add.zone(0, 0, W, H).setOrigin(0).setInteractive(), dim]);
    const g = this.add.graphics();
    woodFrame(g, x, y, w, h);
    c.add([g, this.add.image(x + 6, y + 6, paperTex(this, w - 12, h - 12)).setOrigin(0)]);
    const tg = this.add.graphics();
    titlePlaque(tg, W / 2, y - 8, 96, 20);
    c.add([tg, text(this, W / 2, y - 5, title, { align: 'center', color: 0xfff0c0, stroke: 0x4a0804 })]);
    c.setAlpha(0).setY(10);
    this.tweens.add({ targets: c, alpha: 1, y: 0, duration: 180, ease: 'Quad.easeOut' });
    return c;
  }

  private showSummary(sum: BattleSummary): void {
    const big = (n: number) => (n >= 100000 ? `${(n / 10000).toFixed(1).replace(/\.0$/, '')}万` : `${n}`);
    const win = sum.outcome === 'win';
    const lines = sum.lines;
    const w = Math.min(320, W - 16);
    const x = (W - w) / 2;
    // 缴获按宽度排成几行（原来只排一行，多出来的就不见了）
    const dropRows: { id?: string; label: string; w: number }[][] = [];
    for (const d of sum.drops) {
      const id = Object.keys(items).find((k) => items[k].name === d.name);
      const label = `${d.name}×${d.n}`;
      const iw = (id ? 20 : 0) + textWidth(label) + 10;
      const row = dropRows[dropRows.length - 1];
      if (row && row.reduce((a, r) => a + r.w, 0) + iw <= w - 66) row.push({ id, label, w: iw });
      else dropRows.push([{ id, label, w: iw }]);
    }
    const dropH = dropRows.length ? dropRows.length * 20 + 8 : 0;
    const linesH = lines.reduce((a, l) => a + wrap(l, w - 40).length * 16, 0);
    const h = Math.min(H - 60, 124 + sum.rows.length * 34 + dropH + linesH + 50);
    const c = this.scroll(h, '战果');
    const y = this.scrollY(h);
    // 一枚大印：胜 / 败 / 走，从上面盖下来
    const seal = this.add.container(W / 2, y + 52);
    const sg = this.add.graphics();
    const col = win ? [0xd4442a, 0xa8240e] : sum.outcome === 'lose' ? [0x6a6258, 0x4a443c] : [0x8a6a40, 0x6a4a28];
    sg.fillStyle(0x2a0402).fillRect(-30, -30, 60, 60);
    vgrad(sg, -29, -29, 58, 58, col);
    sg.fillStyle(0xfff0c0, 0.9).fillRect(-26, -26, 52, 2).fillRect(-26, 24, 52, 2).fillRect(-26, -26, 2, 52).fillRect(24, -26, 2, 52);
    // 印泥不匀：几个缺口
    sg.fillStyle(PAPER.base, 0.55).fillRect(-29, 10, 3, 5).fillRect(20, -29, 6, 2).fillRect(26, 18, 3, 4);
    const ch = win ? '胜' : sum.outcome === 'lose' ? '败' : '走';
    seal.add([sg, text(this, 0, -19, ch, { align: 'center', color: 0xfff0c0, scale: 3 })]);
    seal.setAngle(-6).setScale(2.4).setAlpha(0);
    c.add(seal);
    this.tweens.add({ targets: seal, scale: 1, alpha: 1, duration: 220, delay: 200, ease: 'Quad.easeIn', onComplete: () => this.shake(120, 0.004) });
    // 连胜几场（三场起写出来，破了纪录再加一句）
    const streak = win && (sum.streak ?? 0) >= 3 ? `　连胜${sum.streak}场${sum.record ? '·新纪录' : ''}` : '';
    const caption = (win ? '大获全胜' : sum.outcome === 'lose' ? '败下阵来' : '全身而退') + streak;
    c.add(text(this, W / 2, y + 90, caption, { align: 'center', color: win ? 0xa8240e : 0x6a5236 }));
    // 评价：大印右边再盖一方小印（甲朱红、乙赭石、丙灰）
    if (win && sum.grade) {
      const gs = this.add.container(W / 2 + 62, y + 46);
      const gg = this.add.graphics();
      const gc = sum.grade === '甲' ? [0xd4442a, 0xa8240e] : sum.grade === '乙' ? [0xb07a3a, 0x8a5a20] : [0x8a8478, 0x6a6458];
      gg.fillStyle(0x2a0402).fillRect(-15, -15, 30, 30);
      vgrad(gg, -14, -14, 28, 28, gc);
      gg.fillStyle(0xfff0c0, 0.85).fillRect(-12, -12, 24, 1).fillRect(-12, 11, 24, 1).fillRect(-12, -12, 1, 24).fillRect(11, -12, 1, 24);
      gs.add([gg, text(this, 0, -7, sum.grade, { align: 'center', color: 0xfff0c0 }), text(this, 0, 18, '评价', { align: 'center', color: 0x8a6a40 })]);
      gs.setAngle(5).setScale(2).setAlpha(0);
      c.add(gs);
      this.tweens.add({ targets: gs, scale: 1, alpha: 1, duration: 180, delay: 520, ease: 'Quad.easeIn', onComplete: () => sum.grade === '甲' && sfx('crit') });
    }
    let yy = y + 112;
    for (const r of sum.rows) {
      const rg = this.add.graphics();
      rg.fillStyle(0xa88a5c).fillRect(x + 16, yy, w - 32, 30);
      rg.fillStyle(0xe8d6ae).fillRect(x + 17, yy + 1, w - 34, 28);
      c.add(rg);
      c.add(text(this, x + 26, yy + 8, r.name, { color: PAPER.ink }));
      // 从右往左排：银两、经验，按字宽算位置，大数写成「万」，不会叠在一起
      let rx = x + w - 26;
      if (r.silver) {
        const sv = big(r.silver);
        c.add(text(this, rx, yy + 8, sv, { color: 0x5a5a6a, align: 'right' }));
        rx -= textWidth(sv) + 12;
        c.add(this.add.image(rx, yy + 9, uiIconTex(this, 'coin')).setOrigin(0));
        rx -= 10;
      }
      const ex = `经验+${big(r.exp)}`;
      c.add(text(this, rx, yy + 8, ex, { color: 0x8a5a10, align: 'right' }));
      c.add(this.add.image(rx - textWidth(ex) - 16, yy + 9, uiIconTex(this, 'scroll')).setOrigin(0));
      yy += 34;
    }
    if (dropRows.length) {
      c.add(text(this, x + 18, yy, '缴获', { color: 0x8a6a40 }));
      dropRows.forEach((row, k) => {
        let dx = x + 50;
        for (const d of row) {
          if (d.id) c.add(this.add.image(dx, yy + k * 20 + 7, iconTex(this, d.id)).setOrigin(0, 0.5));
          c.add(text(this, dx + (d.id ? 20 : 0), yy + k * 20, d.label, { color: 0x1a3a90 }));
          dx += d.w;
        }
      });
      yy += dropH;
    }
    for (const l of lines) {
      for (const ln of wrap(l, w - 40)) {
        if (yy > y + h - 66) break;
        c.add(text(this, x + 20, yy, ln, { color: l.includes('升到') ? 0xb00800 : 0x5a4028 }));
        yy += 16;
      }
    }
    const done = () => this.time.delayedCall(0, () => {
      if (!this.scene.isActive()) return;
      this.cameras.main.fadeOut(180, 10, 6, 4);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Main'));
    });
    c.add(new Button(this, W / 2 - 54, y + h - 40, 108, 28, '收兵', done, { style: 'red' }));
    c.add(this.add.zone(0, 0, W, y).setOrigin(0).setInteractive().on('pointerup', done));
    c.add(this.add.zone(0, y + h, W, H - y - h).setOrigin(0).setInteractive().on('pointerup', done));
  }
}
