// 横版战斗界面：敌人在左、我方在右；七个菱形指令；"角色名-出招(60)"倒计时；战果总结
import Phaser from 'phaser';
import { C, hex } from '../art/palette';
import { sceneTex, unitTex } from '../art/textures';
import type { Pose } from '../art/units';
import { balance, items, locations, skills } from '../data';
import { skillMp } from '../core/formulas';
import {
  aiCommand, attackableFoes, autoCommand, availableCommands, canCast, controlOf, defaultCommand, foesOf, friendsOf, living,
  needsCommand, predictOrder, resolveRound, unit,
} from '../core/battle';
import type { BEvent, BUnit, Battle, Command, CommandType } from '../core/battle';
import { STATUS_NAMES } from '../core/types';
import { finishBattle } from '../game/encounter';
import type { BattleSummary } from '../game/encounter';
import { store } from '../game/store';
import { ChatBox } from '../ui/chat';
import { Button, H, W, drawBar, frame, hit, rect, sfx, text } from '../ui/widgets';

const FIELD_Y = 56;
const FIELD_H = 348;
const BAR_Y = FIELD_Y + FIELD_H;
const CHAT_Y = BAR_Y + 26;
const ENEMY_SLOTS: Record<0 | 1, [number, number][]> = {
  0: [[96, 232], [96, 304], [96, 376]],
  1: [[40, 268], [40, 340]],
};
const ALLY_SLOTS: [number, number][] = [[306, 282], [262, 366]];

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

const wait = (scene: Phaser.Scene, ms: number) => new Promise<void>((r) => scene.time.delayedCall(ms, r));

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

  constructor() {
    super('Battle');
  }

  init(data: { battle: Battle }): void {
    this.b = data.battle;
    this.views.clear();
    this.auto = false;
    this.menu = null;
    this.popup = null;
    this.lunged = null;
    this.selecting = null;
  }

  create(): void {
    const s = store.save;
    const loc = locations[s.location];
    const g = this.add.graphics();
    rect(g, 0, 0, W, 20, C.darkBrown);
    rect(g, 0, 20, W, 36, C.paper);
    rect(g, 0, 37, W, 1, C.tan);
    rect(g, 0, 55, W, 1, C.ink);
    this.add.text(0, 0, '');
    text(this, W / 2, 4, loc.name, { align: 'center', color: C.yellow });
    this.roundText = text(this, W - 6, 4, '', { align: 'right', color: C.tan });
    text(this, 8, 22, this.b.title, { color: C.darkRed });
    text(this, W / 2, 22, '对阵', { align: 'center', color: C.brown });
    text(this, W - 8, 22, s.player.name, { align: 'right', color: C.blue });
    this.banner = text(this, W / 2, 40, '◀══ 准备战斗 ══▶', { align: 'center', color: C.darkBrown });
    this.add.image(0, FIELD_Y, sceneTex(this, loc.art, 180, FIELD_H / 2, 0.36)).setOrigin(0).setScale(2);
    for (const u of this.b.units) this.makeView(u);
    this.fx = this.add.container(0, 0).setDepth(50);

    const bg = this.add.graphics();
    frame(bg, 0, BAR_Y, W, 26, 'dark');
    this.backBtn = new Button(this, 4, BAR_Y + 3, 52, 20, '返回', () => this.back());
    this.backBtn.setVisible(false);
    this.prompt = text(this, W / 2, BAR_Y + 7, '', { align: 'center', color: C.yellow });
    this.autoBtn = new Button(this, W - 56, BAR_Y + 3, 52, 20, '自动', () => this.toggleAuto());
    this.chat = new ChatBox(this, 0, CHAT_Y, W, H - CHAT_Y);
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
      [hx, hy] = ALLY_SLOTS[u.kind === 'player' ? 0 : 1];
    }
    const flip = u.side === 'enemy';
    const spr = this.add.image(hx + (flip ? 8 : -8), hy, unitTex(this, u.look, u.variant ?? 0, u.alive ? 'idle' : 'down')).setOrigin(0.5, 29 / 32).setScale(2).setFlipX(flip).setDepth(hy);
    const bars = this.add.graphics().setDepth(200);
    const name = text(this, hx, hy - 7, `${u.name}`, { align: 'center', color: u.side === 'enemy' ? C.lightPaper : C.yellow, stroke: C.ink }).setDepth(200);
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
    const x = v.hx - 16;
    const y = v.hy - 61;
    drawBar(v.bars, x, y, 32, 4, v.hp / v.maxHp, C.red, C.darkRed);
    const g2 = v.bars;
    g2.fillStyle(hex(C.ink)).fillRect(x, y + 4, 32, 3);
    g2.fillStyle(hex(C.navy)).fillRect(x + 1, y + 5, 30, 1);
    g2.fillStyle(hex(C.lightBlue)).fillRect(x + 1, y + 5, Math.round(30 * Math.max(0, Math.min(1, v.mp / Math.max(1, v.maxMp)))), 1);
    if (this.selected === v.id) {
      g2.fillStyle(hex(C.yellow)).fillRect(v.hx - 20, v.hy + 7, 40, 2);
    } else if (this.candidates.has(v.id)) {
      g2.fillStyle(hex(C.lightPaper)).fillRect(v.hx - 14, v.hy + 7, 28, 1);
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
    this.queue = living(this.b, 'ally').filter((u) => needsCommand(u)).sort((a, c) => (a.kind === 'player' ? -1 : 1) - (c.kind === 'player' ? -1 : 1));
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
      const d = this.diamond(m.x, m.y, m.label, enabled, () => this.choose(u, m.type));
      this.menu.add(d);
    }
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

  private diamond(x: number, y: number, label: string, enabled: boolean, fn: () => void): Phaser.GameObjects.Container {
    const c = this.add.container(x, y);
    const g = this.add.graphics();
    const r = 26;
    const draw = (down: boolean) => {
      g.clear();
      const pts = (k: number) => [new Phaser.Geom.Point(0, -k), new Phaser.Geom.Point(k, 0), new Phaser.Geom.Point(0, k), new Phaser.Geom.Point(-k, 0)];
      g.fillStyle(hex(C.ink)).fillPoints(pts(r), true);
      g.fillStyle(hex(!enabled ? C.gray : down ? C.darkRed : C.red)).fillPoints(pts(r - 2), true);
      g.fillStyle(hex(!enabled ? C.lightGray : down ? C.red : C.orange)).fillPoints(pts(r - 5), true);
      g.fillStyle(hex(!enabled ? C.gray : C.darkRed)).fillPoints(pts(r - 7), true);
    };
    draw(false);
    const t = text(this, 0, -7, label, { align: 'center', color: enabled ? C.lightPaper : C.lightGray });
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
    frame(g, x, y, w, h, 'paper');
    c.add([this.add.zone(x, y, w, h).setOrigin(0).setInteractive(), g]);
    c.add(text(this, x + w / 2, y + 7, rows.length ? '请选择' : '没有可用的', { align: 'center', color: C.brown }));
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
      frame(g, x, y, w, 76, 'paper');
      box.add(g);
      box.add(text(this, x + 8, y + 6, `招式：${label}`, { color: C.darkRed }));
      box.add(text(this, x + 8, y + 22, `目标：${t.name}（${t.level}级）`));
      box.add(text(this, x + 8, y + 38, `气血${t.hp}/${t.maxHp} 精力${t.mp}`, { color: C.brown }));
      box.add(text(this, x + 8, y + 54, `速度第${order}`, { color: C.blue }));
      box.add(new Button(this, x + w - 56, y + 48, 48, 22, '确定', () => {
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
    for (const e of living(this.b, 'enemy')) if (needsCommand(e)) this.cmds.push(aiCommand(this.b, e));
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
    this.tweens.add({ targets: v.spr, x: v.hx + (v.flip ? 8 : -8), duration: 120 });
    if (!v.dead) this.pose(v, 'idle');
  }

  private async play(events: BEvent[]): Promise<void> {
    const fast = this.auto ? 0.7 : 1;
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
            a.spr.setDepth(t.hy + 1);
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
            a.spr.x = a.hx + (a.flip ? 8 : -8);
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
          v.spr.setPosition(v.hx + (v.flip ? 8 : -8), v.hy);
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

  // ===== 战果总结 =====
  private finish(): void {
    this.clearMenu();
    const sum = finishBattle(store.save, this.b);
    store.flush();
    sfx(sum.outcome === 'win' ? 'win' : sum.outcome === 'lose' ? 'lose' : 'step');
    if (sum.lines.some((l) => l.includes('升到'))) this.time.delayedCall(700, () => sfx('level'));
    this.showSummary(sum);
  }

  private showSummary(sum: BattleSummary): void {
    const c = this.add.container(0, 0).setDepth(600);
    const w = 312;
    const lines = sum.lines;
    const h = Math.min(FIELD_H + 20, 120 + sum.rows.length * 18 + (sum.drops.length ? 20 : 0) + lines.length * 16);
    const x = (W - w) / 2;
    const y = FIELD_Y + Math.max(8, Math.floor((FIELD_H - h) / 2));
    const g = this.add.graphics();
    g.fillStyle(hex(C.ink), 0.45).fillRect(0, 0, W, CHAT_Y);
    frame(g, x, y, w, h, 'paper');
    c.add([this.add.zone(0, 0, W, H).setOrigin(0).setInteractive(), g]);
    const title = sum.outcome === 'win' ? '胜利' : sum.outcome === 'lose' ? '失败' : '逃跑成功';
    c.add(text(this, W / 2, y + 10, title, { align: 'center', color: sum.outcome === 'win' ? C.red : C.darkBrown, scale: 3 }));
    let yy = y + 56;
    if (sum.rows.length) {
      c.add(text(this, x + 14, yy, '单位', { color: C.brown }));
      c.add(text(this, x + 170, yy, '经验', { color: C.brown }));
      c.add(text(this, x + 240, yy, '银两', { color: C.brown }));
      yy += 18;
      for (const r of sum.rows) {
        c.add(text(this, x + 14, yy, r.name));
        c.add(text(this, x + 170, yy, `+${r.exp}`, { color: C.green }));
        c.add(text(this, x + 240, yy, r.silver ? `+${r.silver}` : '-', { color: C.darkRed }));
        yy += 18;
      }
    }
    if (sum.drops.length) {
      c.add(text(this, x + 14, yy, `获得：${sum.drops.map((d) => `${d.name}×${d.n}`).join('、')}`, { color: C.blue, wrap: w - 28 }));
      yy += 20;
    }
    for (const l of lines) {
      c.add(text(this, x + 14, yy, l, { color: l.includes('升到') ? C.red : C.darkBrown, wrap: w - 28 }));
      yy += 16;
    }
    c.add(new Button(this, W / 2 - 50, y + h - 34, 100, 26, '确定', () => this.scene.start('Main'), { style: 'red' }));
    this.chat.refresh();
    hit(this, 0, 0, 1, 1, () => {});
  }
}
