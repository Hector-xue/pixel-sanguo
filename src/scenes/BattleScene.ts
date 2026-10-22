// 横版战斗界面：敌人在左、我方在右；七个菱形指令；"角色名-出招(60)"倒计时；战果总结
import Phaser from 'phaser';
import { setChrome, syncHeight } from '../ui/screen';
import { C, hex } from '../art/palette';
import { sceneTex, unitTex } from '../art/textures';
import { BX, FEET_Y, UNIT_H, UNIT_W } from '../art/units';
import type { Pose } from '../art/units';
import { balance, items, locations, skills } from '../data';
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
import { ChatBox } from '../ui/chat';
import { Button, H, W, frame, goldFrame, hit, sfx, text } from '../ui/widgets';
import { UI, drawDiamond, groundTex, slateTex, stoneTex, vgrad } from '../art/chrome';

const FIELD_Y = 62;
const FIELD_H = 342;
const BACKDROP_H = 72;
const BAR_Y = FIELD_Y + FIELD_H;
const CHAT_Y = BAR_Y + 26;
const ENEMY_SLOTS: Record<0 | 1, [number, number][]> = {
  0: [[96, 232], [96, 304], [96, 376]],
  1: [[40, 268], [40, 340]],
};
// 主角、出战副将、雇来的队友
const ALLY_SLOTS: [number, number][] = [[306, 282], [262, 366], [270, 210]];

interface View {
  id: string;
  spr: Phaser.GameObjects.Image;
  bars: Phaser.GameObjects.Graphics;
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
}

const MENU: { type: CommandType; label: string; x: number; y: number }[] = [
  { type: 'attack', label: '攻击', x: 162, y: 176 },
  { type: 'capture', label: '招降', x: 162, y: 240 },
  { type: 'summon', label: '招将', x: 162, y: 304 },
  { type: 'defend', label: '防御', x: 162, y: 368 },
  { type: 'skill', label: '技能', x: 214, y: 208 },
  { type: 'item', label: '物品', x: 214, y: 272 },
  { type: 'flee', label: '逃跑', x: 214, y: 336 },
];

// 贴图中心和身体中线差几个像素，朝左朝右要往不同方向补
const OFF = BX - UNIT_W / 2;

const wait = (scene: Phaser.Scene, ms: number) => new Promise<void>((r) => scene.time.delayedCall(ms, r));

// 人物贴图按站位高度排前后（下面的盖住上面的），压在 100～199 之间：名字血条在 200，菜单在 250 以上
function spriteDepth(hy: number): number {
  return 100 + Math.min(99, hy / 5);
}

export class BattleScene extends Phaser.Scene {
  private b!: Battle;
  private views = new Map<string, View>();
  private banner!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private prompt!: Phaser.GameObjects.Text;
  private menu: Phaser.GameObjects.Container | null = null;
  private popup: Phaser.GameObjects.Container | null = null;
  private autoBtn!: Button;
  private backBtn!: Button;
  private auto = false;
  private queue: BUnit[] = [];
  private cmds: Command[] = [];
  private reserved: Record<string, number> = {};
  private countdown: Phaser.Time.TimerEvent | null = null;
  private seconds = 0;
  private selecting: ((id: string) => void) | null = null;
  private candidates = new Set<string>();
  private selected: string | null = null;
  private chat!: ChatBox;
  private lunged: View | null = null;
  private fx!: Phaser.GameObjects.Container;
  // 回放录像：按录下来的随机数状态和指令重算
  private replay: ReplayRecord | null = null;
  private replayAt = 0;
  private speed = 1;

  constructor() {
    super('Battle');
  }

  init(data: { battle?: Battle; replay?: ReplayRecord }): void {
    this.replay = data.replay ?? null;
    this.replayAt = 0;
    this.speed = 1;
    this.b = data.replay ? createBattle(JSON.parse(JSON.stringify(data.replay.init))) : data.battle!;
    this.views.clear();
    this.auto = false;
    this.menu = null;
    this.popup = null;
    this.lunged = null;
    this.selecting = null;
  }

  create(): void {
    syncHeight(this.game);
    setChrome('#0a0604');
    const s = store.save;
    const loc = locations[s.location];
    // 顶栏远景条 + 地点名（与主界面一致）
    this.add.image(0, -36, sceneTex(this, loc.art, 180, 40, 0.62)).setOrigin(0).setScale(2).setCrop(0, 18, 180, 12);
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.35).fillRect(0, 0, W, 24);
    // 对阵栏：原版那条青色渐变
    g.fillStyle(0x000000).fillRect(0, 23, W, 1);
    vgrad(g, 0, 24, W, 22, [UI.tealHi, UI.teal, UI.tealLo]);
    g.fillStyle(0xc8f0f0).fillRect(0, 24, W, 1);
    // 招式条：深紫渐变
    vgrad(g, 0, 46, W, 16, [0x3a2a6a, 0x221640, 0x140c28]);
    g.fillStyle(0x000000).fillRect(0, 61, W, 1);
    text(this, W / 2, 5, loc.name, { align: 'center', color: UI.white, stroke: 0x000000 });
    this.roundText = text(this, W - 6, 5, '', { align: 'right', color: UI.cream, stroke: 0x000000 });
    text(this, 8, 29, this.b.title, { color: UI.red, stroke: 0xffffff });
    text(this, W / 2, 29, '对阵', { align: 'center', color: 0x2850ff, stroke: 0xffffff });
    text(this, W - 8, 29, s.player.name, { align: 'right', color: UI.red, stroke: 0xffffff });
    this.banner = text(this, W / 2, 48, '◀══ 准备战斗 ══▶', { align: 'center', color: UI.white, stroke: 0x000000 });
    // 战场：上面一条远景画，下面整片沙地
    this.add.image(0, FIELD_Y, sceneTex(this, loc.art, 180, BACKDROP_H / 2, 0.86)).setOrigin(0).setScale(2);
    this.add.image(0, FIELD_Y + BACKDROP_H - 4, groundTex(this, W, FIELD_H - BACKDROP_H + 4, loc.art.length)).setOrigin(0);
    for (const u of this.b.units) this.makeView(u);
    this.fx = this.add.container(0, 0).setDepth(50);

    // 底栏：返回 / 黑底出招框 / 自动（原版都是灰色金属钮）
    this.add.image(0, BAR_Y, slateTex(this, W, 26)).setOrigin(0);
    const bg = this.add.graphics();
    bg.fillStyle(0x000000).fillRect(0, BAR_Y, W, 1);
    bg.fillStyle(0xa0a0a8).fillRect(62, BAR_Y + 3, W - 124, 20);
    bg.fillStyle(0x16161c).fillRect(63, BAR_Y + 4, W - 126, 18);
    this.backBtn = new Button(this, 4, BAR_Y + 3, 52, 20, '返回', () => this.back(), { style: 'steel' });
    this.backBtn.setVisible(false);
    this.prompt = text(this, W / 2, BAR_Y + 7, '', { align: 'center', color: UI.white });
    this.autoBtn = new Button(this, W - 56, BAR_Y + 3, 52, 20, '自动', () => this.toggleAuto(), { style: 'steel' });
    this.chat = new ChatBox(this, 0, CHAT_Y, W, H - CHAT_Y);
    if (this.replay) {
      this.autoBtn.setVisible(false);
      this.prompt.setText('战斗录像');
      new Button(this, 4, BAR_Y + 3, 52, 20, '退出', () => this.scene.start('Main'), { style: 'steel' });
      const sp = new Button(this, W - 56, BAR_Y + 3, 52, 20, '快进', () => {
        this.speed = this.speed === 1 ? 2.5 : 1;
        sp.setCaption(this.speed === 1 ? '快进' : '正常');
      }, { style: 'steel' });
    }
    this.time.delayedCall(300, () => this.startRound());
  }

  // ===== 单位显示 =====
  private makeView(u: BUnit): View {
    let hx: number;
    let hy: number;
    if (u.side === 'enemy') {
      const same = this.b.units.filter((x) => x.side === 'enemy' && x.row === u.row);
      [hx, hy] = ENEMY_SLOTS[u.row][Math.min(same.indexOf(u), ENEMY_SLOTS[u.row].length - 1)];
    } else {
      [hx, hy] = ALLY_SLOTS[u.kind === 'player' ? 0 : u.kind === 'mirror' ? 2 : 1];
    }
    const flip = u.side === 'enemy';
    const spr = this.add.image(hx + (flip ? OFF : -OFF), hy, unitTex(this, u.look, u.variant ?? 0, u.alive ? 'idle' : 'down')).setOrigin(0.5, FEET_Y / UNIT_H).setFlipX(flip).setDepth(spriteDepth(hy));
    const bars = this.add.graphics().setDepth(200);
    // 原版战场上不写名字，名字在选目标框里
    const name = text(this, hx, hy - 7, `${u.name}`, { align: 'center', color: u.side === 'enemy' ? C.lightPaper : C.yellow, stroke: C.ink }).setDepth(200).setVisible(false);
    const badge = text(this, hx, hy - 76, '', { align: 'center', color: C.yellow, stroke: C.ink }).setDepth(201);
    const zone = this.add.zone(hx - 24, hy - 60, 48, 76).setOrigin(0).setInteractive().setDepth(300);
    zone.on('pointerup', () => this.selecting && this.candidates.has(u.id) && this.selecting(u.id));
    const v: View = { id: u.id, spr, bars, name, badge, zone, hx, hy, hp: u.hp, mp: u.mp, maxHp: u.maxHp, maxMp: u.maxMp, dead: !u.alive, look: u.look, variant: u.variant ?? 0, flip };
    this.views.set(u.id, v);
    if (v.dead) spr.setAlpha(0.6);
    else this.tweens.add({ targets: spr, y: hy + 1, duration: 500 + Math.random() * 200, yoyo: true, repeat: -1, ease: 'Stepped', easeParams: [1] });
    this.drawBars(v);
    return v;
  }

  private drawBars(v: View): void {
    v.bars.clear();
    if (v.dead) return;
    // 原版血条：白边框，上红下蓝两根
    const x = v.hx - 21;
    const y = v.hy - 60;
    const g2 = v.bars;
    const hp = Math.max(0, Math.min(1, v.hp / Math.max(1, v.maxHp)));
    const mp = Math.max(0, Math.min(1, v.mp / Math.max(1, v.maxMp)));
    g2.fillStyle(0xffffff).fillRect(x, y, 42, 11);
    g2.fillStyle(0x000000).fillRect(x + 1, y + 1, 40, 9);
    g2.fillStyle(0x500808).fillRect(x + 1, y + 1, 40, 4);
    g2.fillStyle(0xf01818).fillRect(x + 1, y + 1, Math.round(40 * hp), 4);
    g2.fillStyle(0x0a1050).fillRect(x + 1, y + 6, 40, 4);
    g2.fillStyle(0x2c50ff).fillRect(x + 1, y + 6, Math.round(40 * mp), 4);
    if (this.selected === v.id) {
      // 原版选中目标：旁边一枚白边红三角指着他
      const tx = v.flip ? v.hx + 20 : v.hx - 20;
      const d = v.flip ? -1 : 1;
      g2.fillStyle(0xffffff).fillTriangle(tx - d * 9, v.hy - 36, tx - d * 9, v.hy - 18, tx + d * 2, v.hy - 27);
      g2.fillStyle(0xf01010).fillTriangle(tx - d * 7, v.hy - 33, tx - d * 7, v.hy - 21, tx, v.hy - 27);
    } else if (this.candidates.has(v.id)) {
      g2.fillStyle(0xffffff, 0.7).fillRect(v.hx - 12, v.hy + 2, 24, 1);
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

  private float(v: View, s: string, color: number, big = false): void {
    const t = text(this, v.hx, v.hy - 72, s, { align: 'center', color, stroke: C.ink, scale: big ? 2 : 1 }).setDepth(400);
    this.tweens.add({ targets: t, y: t.y - 18, duration: 600, ease: 'Quad.easeOut' });
    this.tweens.add({ targets: t, alpha: 0, delay: 650, duration: 250, onComplete: () => t.destroy() });
  }

  private setBanner(label: string): void {
    this.banner.setText(`◀══ ${label} ══▶`);
  }

  // ===== 指令阶段 =====
  private startRound(): void {
    if (this.b.outcome) return void this.finish();
    this.roundText.setText(`第${this.b.round + 1}回合`);
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

  private showMenu(u: BUnit): void {
    this.clearMenu();
    const avail = availableCommands(this.b, u);
    avail.item = this.itemsLeft().length > 0;
    this.menu = this.add.container(0, 0).setDepth(250);
    for (const m of MENU) {
      const enabled = avail[m.type];
      const d = this.diamond(m.x, m.y, m.label, enabled, () => this.choose(u, m.type), m.type === 'attack');
      this.menu.add(d);
    }
    // 光标：一枚橙色大箭头指着"攻击"
    const ag = this.add.graphics();
    const ax = MENU[0].x - 20;
    const ay = MENU[0].y + 18;
    const arrow: [number, number][] = [[0, -14], [14, 0], [6, 0], [6, 12], [-6, 12], [-6, 0], [-14, 0]];
    const rot = (p: [number, number]) => new Phaser.Math.Vector2(ax + (p[0] - p[1]) * 0.7071, ay + (p[0] + p[1]) * 0.7071);
    ag.fillStyle(0x801000).fillPoints(arrow.map((p) => rot([p[0] * 1.15, p[1] * 1.15 + 1])), true);
    ag.fillStyle(0xf06010).fillPoints(arrow.map(rot), true);
    ag.fillStyle(0xffd040).fillPoints(arrow.map((p) => rot([p[0] * 0.6, p[1] * 0.6 - 2])), true);
    this.menu.add(ag);
    this.tweens.add({ targets: ag, x: -3, y: 3, duration: 280, yoyo: true, repeat: -1, ease: 'Stepped', easeParams: [2] });
    this.seconds = balance.commandSeconds;
    this.updatePrompt(u);
    this.countdown = this.time.addEvent({
      delay: 1000, loop: true, callback: () => {
        this.seconds--;
        this.updatePrompt(u);
        if (this.seconds <= 0) {
          this.clearSelect();
          this.issue(defaultCommand(this.b, u));
        }
      },
    });
    this.highlightActor(u);
  }

  private highlightActor(u: BUnit): void {
    const v = this.views.get(u.id);
    if (!v) return;
    const arrow = text(this, v.hx, v.hy - 88, '▼', { align: 'center', color: C.yellow, stroke: C.ink });
    this.menu?.add(arrow);
    this.tweens.add({ targets: arrow, y: arrow.y + 3, duration: 250, yoyo: true, repeat: -1, ease: 'Stepped', easeParams: [2] });
  }

  private updatePrompt(u: BUnit): void {
    this.prompt.setText(`${u.name}-出招(${Math.max(0, this.seconds)})`);
  }

  private diamond(x: number, y: number, label: string, enabled: boolean, fn: () => void, focus = false): Phaser.GameObjects.Container {
    const c = this.add.container(x, y);
    const g = this.add.graphics();
    const r = 26;
    const draw = (down: boolean) => {
      g.clear();
      drawDiamond(g, r, enabled, down);
    };
    draw(false);
    // 原版：普通是黑字，光标停的那个是白边红字
    const t = text(this, 0, -7, label, { align: 'center', raw: true, color: !enabled ? 0x505058 : focus ? 0xe81000 : 0x100800, stroke: enabled ? 0xffffff : undefined });
    const z = this.add.zone(-r, -r, r * 2, r * 2).setOrigin(0).setInteractive({ useHandCursor: true });
    let down = false;
    z.on('pointerdown', () => {
      if (!enabled) return;
      down = true;
      draw(true);
    });
    z.on('pointerout', () => {
      down = false;
      draw(false);
    });
    z.on('pointerup', () => {
      if (!down) return;
      down = false;
      draw(false);
      sfx('click');
      fn();
    });
    c.add([g, t, z]);
    return c;
  }

  private clearMenu(): void {
    this.menu?.destroy();
    this.menu = null;
    this.popup?.destroy();
    this.popup = null;
    this.countdown?.remove();
    this.countdown = null;
    this.clearSelect();
    this.backBtn.setVisible(false);
    this.prompt.setText(this.auto ? '自动战斗中' : '');
  }

  private back(): void {
    this.popup?.destroy();
    this.popup = null;
    this.clearSelect();
    this.menu?.setVisible(true);
    this.backBtn.setVisible(false);
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
        return this.listPopup(u, u.skills.map((st) => {
          const def = skills[st.id];
          const cost = skillMp(def.mp, st.level);
          return { label: `${def.name} ${st.level}级`, right: `精力${cost}`, enabled: canCast(u, st.id), fn: () => {
            if (def.target === 'enemy') this.pickTarget(u, def.name, foesOf(this.b, u), (t) => this.issue({ actor: u.id, type, skill: st.id, target: t }));
            else this.issue({ actor: u.id, type, skill: st.id });
          } };
        }));
      case 'item':
        return this.listPopup(u, this.itemsLeft().map((id) => ({
          label: items[id].name, right: `×${this.b.items[id] - (this.reserved[id] ?? 0)}`, enabled: true,
          fn: () => this.pickTarget(u, items[id].name, friendsOf(this.b, u), (t) => this.issue({ actor: u.id, type, item: id, target: t })),
        })));
      case 'summon':
        return this.listPopup(u, this.b.reserve.map((r) => ({
          label: `（${r.level}）${r.name}`, right: `${r.hp}/${r.maxHp}`, enabled: r.hp > 0,
          fn: () => this.issue({ actor: u.id, type, summon: r.id }),
        })));
    }
  }

  private listPopup(_u: BUnit, rows: { label: string; right: string; enabled: boolean; fn: () => void }[]): void {
    this.menu?.setVisible(false);
    this.backBtn.setVisible(true);
    this.popup?.destroy();
    const c = this.add.container(0, 0).setDepth(320);
    const w = 220;
    const h = 30 + rows.length * 30;
    const x = (W - w) / 2;
    const y = FIELD_Y + 40;
    const g = this.add.graphics();
    frame(g, x, y, w, h, 'ink');
    c.add([this.add.zone(x, y, w, h).setOrigin(0).setInteractive(), g]);
    c.add(text(this, x + w / 2, y + 7, rows.length ? '请选择' : '没有可用的', { align: 'center', color: UI.white }));
    rows.forEach((r, i) => {
      const b = new Button(this, x + 8, y + 26 + i * 30, w - 16, 26, '', () => r.fn(), { disabled: !r.enabled });
      c.add(b);
      c.add(text(this, x + 16, y + 32 + i * 30, r.label, { color: r.enabled ? C.darkBrown : C.gray }));
      c.add(text(this, x + w - 16, y + 32 + i * 30, r.right, { align: 'right', color: r.enabled ? C.blue : C.gray }));
    });
    this.popup = c;
  }

  // 选目标：点单位切换目标，再点一次或点"确定"出招
  private pickTarget(u: BUnit, label: string, pool: BUnit[], done: (id: string) => void): void {
    if (!pool.length) return;
    this.menu?.setVisible(false);
    this.popup?.destroy();
    this.popup = null;
    this.backBtn.setVisible(true);
    this.candidates = new Set(pool.map((p) => p.id));
    const lastTarget = this.b.lastCmd[u.id]?.target;
    this.selected = pool.find((p) => p.id === lastTarget)?.id ?? pool[0].id;
    const box = this.add.container(0, 0).setDepth(320);
    this.popup = box;
    const render = () => {
      box.removeAll(true);
      const t = unit(this.b, this.selected!)!;
      const order = predictOrder(this.b).findIndex((x) => x.id === t.id) + 1;
      const w = 172;
      const x = (W - w) / 2;
      const y = FIELD_Y + 4;
      const g = this.add.graphics();
      // 原版选目标框：黑底，招式名一条、目标名白条，下面红蓝紫三行
      frame(g, x, y, w, 80, 'ink');
      g.fillStyle(0xe8e8f0).fillRect(x + 4, y + 22, w - 8, 16);
      box.add(g);
      box.add(text(this, x + w / 2, y + 5, label, { align: 'center', color: UI.cream }));
      box.add(text(this, x + 8, y + 24, `${t.name}（${t.level}级）`, { raw: true, color: 0x101030 }));
      box.add(text(this, x + 8, y + 41, `■ ${t.hp}/${t.maxHp}`, { color: 0xff3020 }));
      box.add(text(this, x + 8, y + 56, `■ ${t.mp}`, { color: 0x4a70ff }));
      box.add(text(this, x + 80, y + 56, `速度第${order}`, { color: UI.magenta }));
      box.add(new Button(this, x + w - 56, y + 41, 48, 22, '确定', () => {
        const id = this.selected!;
        this.clearSelect();
        done(id);
      }, { style: 'red' }));
      for (const v of this.views.values()) this.drawBars(v);
    };
    this.selecting = (id) => {
      if (id === this.selected) {
        this.clearSelect();
        done(id);
      } else {
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
    for (const v of this.views.values()) this.drawBars(v);
  }

  private toggleAuto(): void {
    this.auto = !this.auto;
    this.autoBtn.setCaption(this.auto ? '取消' : '自动');
    this.autoBtn.setStyle(this.auto ? 'red' : 'tan');
    if (this.auto && this.menu) {
      // 正在等指令的这个人也交给自动
      const pending = this.prompt.text.split('-出招')[0];
      const u = living(this.b, 'ally').find((x) => x.name === pending && !this.cmds.some((c) => c.actor === x.id));
      this.clearMenu();
      if (u) this.cmds.push(autoCommand(this.b, u));
      this.nextCommander();
    }
  }

  // ===== 结算与动画 =====
  private async resolve(): Promise<void> {
    this.clearMenu();
    this.prompt.setText('');
    if (!this.replay) {
      for (const e of living(this.b, 'enemy')) if (needsCommand(e)) this.cmds.push(aiCommand(this.b, e));
      for (const a of living(this.b, 'ally')) if (a.kind === 'mirror' && needsCommand(a)) this.cmds.push(aiCommand(this.b, a));
    }
    const before = new Map(this.b.units.map((u) => [u.id, u.mp]));
    const events = resolveRound(this.b, this.cmds);
    await this.play(events);
    this.returnHome();
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
    this.tweens.add({ targets: v.spr, x: v.hx + (v.flip ? OFF : -OFF), duration: 120, onComplete: () => v.spr.setDepth(spriteDepth(v.hy)) });
    if (!v.dead) this.pose(v, 'idle');
  }

  private async play(events: BEvent[]): Promise<void> {
    const fast = (this.auto ? 0.7 : 1) / this.speed;
    const ms = (n: number) => Math.round(n * fast);
    for (const e of events) {
      switch (e.t) {
        case 'round':
          break;
        case 'act': {
          this.returnHome();
          await wait(this, ms(60));
          const a = this.views.get(e.actor);
          const t = e.target ? this.views.get(e.target) : undefined;
          this.setBanner(e.label);
          if (!a) break;
          if (e.kind === 'melee' && t && t !== a) {
            const dir = a.flip ? -1 : 1;
            const tx = t.hx + (t.flip ? 34 : -34) * 1 + (a.flip === t.flip ? -dir * 10 : 0);
            this.pose(a, 'atk');
            a.spr.setDepth(spriteDepth(t.hy) + 0.5);
            await new Promise<void>((r) => this.tweens.add({ targets: a.spr, x: tx, duration: ms(180), ease: 'Quad.easeOut', onComplete: () => r() }));
            this.lunged = a;
          } else if (e.kind === 'cast') {
            this.pose(a, 'cast');
            sfx('magic');
            const ring = this.add.circle(a.hx, a.hy - 30, 6, hex(C.yellow), 0.5).setDepth(390);
            this.tweens.add({ targets: ring, radius: 30, alpha: 0, duration: ms(350), onComplete: () => ring.destroy() });
            await wait(this, ms(300));
            if (t && t !== a) this.spark(t, C.lilac);
            this.lunged = a;
            a.spr.x = a.hx + (a.flip ? OFF : -OFF);
          } else {
            this.tweens.add({ targets: a.spr, y: a.hy - 6, duration: ms(100), yoyo: true });
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
          const sx = v.spr.x;
          this.tweens.add({ targets: v.spr, x: sx + (v.flip ? -3 : 3), duration: 50, yoyo: true, repeat: 1, onComplete: () => !v.dead && this.lunged !== v && this.pose(v, 'idle') });
          v.spr.setTint(0xffffff);
          this.time.delayedCall(80, () => v.spr.clearTint());
          const label = e.t === 'poison' ? `毒-${e.amount}` : `${e.crit ? '暴击 ' : e.fatal ? '致命 ' : ''}-${e.amount}`;
          this.float(v, label, e.t === 'poison' ? C.lilac : crit ? C.red : C.orange, crit);
          if (e.t === 'damage' && e.mp) this.time.delayedCall(200, () => this.float(v, `精力-${e.mp}`, C.lightBlue));
          this.drawBars(v);
          await wait(this, ms(e.t === 'poison' ? 380 : 300));
          break;
        }
        case 'miss': {
          const v = this.views.get(e.target);
          if (v) this.float(v, '未中', C.lightPaper);
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
          this.spark(v, C.lime);
          this.drawBars(v);
          await wait(this, ms(320));
          break;
        }
        case 'status': {
          const v = this.views.get(e.target);
          const u = unit(this.b, e.target);
          if (v) this.float(v, e.ok ? `中计·${STATUS_NAMES[e.status]}` : '抵抗', e.ok ? C.yellow : C.lightPaper);
          if (u && e.ok) v?.badge.setText(STATUS_NAMES[e.status]);
          await wait(this, ms(300));
          break;
        }
        case 'statusEnd': {
          const v = this.views.get(e.target);
          if (v) {
            this.float(v, '清醒', C.lime);
            v.badge.setText('');
          }
          await wait(this, ms(220));
          break;
        }
        case 'buff': {
          const v = this.views.get(e.target);
          if (v) {
            this.float(v, e.label, C.sky);
            this.spark(v, C.sky);
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
          this.tweens.killTweensOf(v.spr);
          this.pose(v, 'down');
          v.spr.setPosition(v.hx + (v.flip ? OFF : -OFF), v.hy);
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
            this.drawBars(v);
            await new Promise<void>((r) => this.tweens.add({ targets: [v.spr, v.name], alpha: 0, duration: ms(500), onComplete: () => r() }));
          } else {
            this.float(v, '招降失败', C.lightPaper);
            await wait(this, ms(320));
          }
          break;
        }
        case 'summon': {
          if (e.out) {
            const o = this.views.get(e.out);
            if (o) {
              this.tweens.killTweensOf(o.spr);
              await new Promise<void>((r) => this.tweens.add({ targets: [o.spr, o.name, o.bars, o.badge], alpha: 0, duration: ms(250), onComplete: () => r() }));
              o.spr.destroy();
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
          }
          await wait(this, ms(300));
          break;
        }
        case 'flee': {
          if (e.ok) {
            sfx('step');
            const allies = [...this.views.values()].filter((v) => !v.flip && !v.dead);
            await new Promise<void>((r) => this.tweens.add({ targets: allies.map((v) => v.spr), x: W + 40, duration: ms(450), onComplete: () => r() }));
          } else {
            this.setBanner('逃跑失败');
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
          await wait(this, ms(500));
          break;
        case 'end':
          break;
      }
    }
  }

  private spark(v: View, color: number): void {
    for (let i = 0; i < 6; i++) {
      const p = this.add.rectangle(v.hx + (Math.random() - 0.5) * 30, v.hy - 30 + (Math.random() - 0.5) * 30, 2, 2, hex(color)).setDepth(390);
      this.fx.add(p);
      this.tweens.add({ targets: p, y: p.y - 12, alpha: 0, duration: 400 + Math.random() * 200, onComplete: () => p.destroy() });
    }
  }

  // ===== 录像回放 =====
  private replayRound(): void {
    const rp = this.replay!;
    this.roundText.setText(`录像 第${Math.min(this.replayAt + 1, rp.rounds.length)}/${rp.rounds.length}回合`);
    const r = rp.rounds[this.replayAt++];
    if (!r) return this.replayEnd();
    this.b.rng.state = r.s;
    this.cmds = r.c.map((c) => ({ ...c }));
    this.time.delayedCall(200 / this.speed, () => this.resolve());
  }

  private replayEnd(): void {
    const c = this.add.container(0, 0).setDepth(600);
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.5).fillRect(0, 0, W, CHAT_Y);
    c.add([this.add.zone(0, 0, W, H).setOrigin(0).setInteractive(), g]);
    const out = this.b.outcome === 'win' ? '胜利' : this.b.outcome === 'lose' ? '失败' : '结束';
    c.add(text(this, W / 2, 180, `录像播完了（${out}）`, { align: 'center', color: UI.yellow, stroke: 0x000000, scale: 2 }));
    c.add(new Button(this, W / 2 - 50, 230, 100, 26, '返回', () => this.scene.start('Main'), { style: 'red' }));
  }

  // ===== 战果总结 =====
  private finish(): void {
    this.clearMenu();
    if (this.replay) return this.replayEnd();
    const sum = finishBattle(store.save, this.b);
    store.flush();
    sfx(sum.outcome === 'win' ? 'win' : sum.outcome === 'lose' ? 'lose' : 'step');
    if (sum.lines.some((l) => l.includes('升到'))) this.time.delayedCall(700, () => sfx('level'));
    this.showSummary(sum);
  }

  private showSummary(sum: BattleSummary): void {
    const c = this.add.container(0, 0).setDepth(600);
    const w = 320;
    const lines = sum.lines;
    const rowsH = sum.rows.length * 30;
    const h = Math.min(CHAT_Y - 40, 176 + rowsH + (sum.drops.length ? 20 : 0) + lines.length * 16);
    const x = (W - w) / 2;
    const y = Math.max(24, Math.floor((CHAT_Y - h) / 2));
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.5).fillRect(0, 0, W, CHAT_Y);
    c.add([this.add.zone(0, 0, W, H).setOrigin(0).setInteractive(), g]);
    // 原版：灰石牌头"战果总结"，金边橙底，中间一块红漆"胜利"牌
    c.add(this.add.image(x, y, stoneTex(this, w, 34)).setOrigin(0));
    const fg = this.add.graphics();
    fg.fillStyle(0x000000).fillRect(x, y + 33, w, 1);
    goldFrame(fg, x + 6, y + 34, w - 12, h - 34, null);
    vgrad(fg, x + 10, y + 38, w - 20, h - 42, [0xf8c860, 0xe8a040, 0xd08028]);
    c.add(fg);
    c.add(text(this, W / 2, y + 5, '战果总结', { align: 'center', color: 0xffe8a0, stroke: 0x5a2800, scale: 2 }));
    const title = sum.outcome === 'win' ? '胜利' : sum.outcome === 'lose' ? '失败' : '逃跑成功';
    const pg = this.add.graphics();
    const pw = 200;
    pg.fillStyle(0x3a0800).fillRect(W / 2 - pw / 2, y + 46, pw, 52);
    pg.fillStyle(UI.gold).fillRect(W / 2 - pw / 2 + 2, y + 48, pw - 4, 48);
    vgrad(pg, W / 2 - pw / 2 + 5, y + 51, pw - 10, 42, [0xb01810, 0x801008, 0x600804]);
    c.add(pg);
    c.add(text(this, W / 2, y + 54, title, { align: 'center', color: sum.outcome === 'win' ? 0xffd040 : 0xd8d8e0, stroke: 0x401000, scale: title.length > 2 ? 2 : 3 }));
    let yy = y + 108;
    for (const r of sum.rows) {
      const rg = this.add.graphics();
      rg.fillStyle(0x6a3000).fillRect(x + 16, yy, w - 32, 26);
      vgrad(rg, x + 17, yy + 1, w - 34, 24, [0xffc850, 0xf09020, 0xd06810]);
      c.add(rg);
      c.add(text(this, x + 30, yy + 7, r.name, { raw: true, color: 0xffffff, stroke: 0x6a2000 }));
      c.add(text(this, x + w - 112, yy + 1, `经验+${r.exp}`, { raw: true, color: 0xfff0a0, stroke: 0x6a2000 }));
      c.add(text(this, x + w - 112, yy + 13, r.silver ? `银两+${r.silver}` : '', { raw: true, color: 0xffffff, stroke: 0x6a2000 }));
      yy += 30;
    }
    if (sum.drops.length) {
      c.add(text(this, x + 18, yy, `获得：${sum.drops.map((d) => `${d.name}×${d.n}`).join('、')}`, { raw: true, color: 0x1a2a90, wrap: w - 36 }));
      yy += 20;
    }
    for (const l of lines) {
      c.add(text(this, x + 18, yy, l, { raw: true, color: l.includes('升到') ? 0xb00800 : 0x3a1400, wrap: w - 36 }));
      yy += 16;
    }
    c.add(text(this, W / 2, y + h - 52, '点击任意处继续', { align: 'center', raw: true, color: 0xc01000 }));
    c.add(new Button(this, W / 2 - 50, y + h - 34, 100, 24, '确定', () => this.scene.start('Main'), { style: 'red' }));
    c.add(this.add.zone(0, 0, W, CHAT_Y).setOrigin(0).setInteractive().on('pointerup', () => this.time.delayedCall(0, () => this.scene.isActive() && this.scene.start('Main'))));
    this.chat.refresh();
    hit(this, 0, 0, 1, 1, () => {});
  }
}
