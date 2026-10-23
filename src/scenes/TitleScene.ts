// 标题 → 选分区 → 建角色（名称、性别、职业、头像三选一）→ 开场剧情
import Phaser from 'phaser';
import { C } from '../art/palette';
import { avatarTex, bustTex, heroLookKey, sceneTex, unitTex } from '../art/textures';
import { AVATARS, BX, FEET_Y, UNIT_H, UNIT_W, heroVariantOf } from '../art/units';
import { CLASS_IDS, classSkills, classes, locations, opening, skills } from '../data';
import { Rng, randomSeed } from '../core/rng';
import type { ClassId, Gender } from '../core/types';
import { aiName } from '../game/chatter';
import { acceptQuest, deserialize, log, newSave } from '../game/state';
import { SLOTS, store } from '../game/store';
import { setSceneBack } from '../ui/back';
import { canVibrate } from '../ui/haptics';
import { hasVibrateChoice, saveSettings } from '../ui/settings';
import { showDialog } from '../ui/dialog';
import { overlayInput } from '../ui/input';
import { cloudPanel } from '../ui/cloud';
import { maybeOfferUpdate } from '../ui/update';
import { forgetSlot, isApp } from '../game/cloud';
import { Button, H, SAFE_TOP, W, confirm, frame, goldFrame, hit, text, toast } from '../ui/widgets';
import { UI, paperTex, titlePlaque, woodFrame } from '../art/chrome';
import { playMusic } from '../ui/audio';
import { iconTitleTex, logoTex, titleBackdrop } from '../art/title';
import { vgrad } from '../art/chrome';
import { enterFullscreen, exitFullscreen, fullscreenSupported, isFullscreen, setChrome } from '../ui/screen';

const CLASS_TRAIT: Record<ClassId, string> = {
  warrior: '近身肉搏，天生20点抗物理，血厚能扛。',
  scholar: '控场辅助，让敌人中计：乱、封、围。',
  mystic: '法术输出，单体伤害极高，群体必中。',
};

export class TitleScene extends Phaser.Scene {
  private page: Phaser.GameObjects.Container | null = null;
  private onHome = false;
  // 进出全屏后要按新高度重排：记住当前在哪一页，重排完回到这一页
  private current: () => void = () => this.showHome();

  constructor() {
    super('Title');
  }

  // slots：从游戏里「设置 → 换存档位」过来，直接进存档位页
  create(data?: { relayout?: boolean; slots?: boolean }): void {
    this.page = null;
    // 返回键：存档位、建角色这些页回到首页；在首页就按两次退出
    setSceneBack(() => {
      if (this.onHome) return false;
      this.showHome();
      return true;
    });
    setChrome('#4a8fd8');
    playMusic('title');
    titleBackdrop(this, W, H);
    if (data?.relayout) this.current();
    else if (data?.slots) this.showSlots();
    else this.showHome();
    // 读档时主存档坏了、用备份顶上的：说一声
    if (store.restored) {
      const msg = store.restored;
      store.restored = '';
      this.time.delayedCall(400, () => toast(this, msg, 5000));
    }
    // 安卓 App：网站上有新版就提醒一次
    maybeOfferUpdate(this);
  }

  // 方形图标按钮（深蓝半透明底 + 金边），字在下面
  private iconButton(x: number, y: number, icon: string, label: string, onTap: () => void, size = 44): Phaser.GameObjects.Container {
    const c = this.add.container(x, y);
    const g = this.add.graphics();
    const draw = (down: boolean) => {
      g.clear();
      g.fillStyle(0x000000, 0.35).fillRect(1, 2, size, size);
      g.fillStyle(UI.goldLo).fillRect(1, 0, size - 2, size).fillRect(0, 1, size, size - 2);
      g.fillStyle(down ? 0x262c78 : 0x0c0e44, 0.82).fillRect(1, 1, size - 2, size - 2);
      g.fillStyle(UI.gold).fillRect(2, 1, size - 4, 1);
      g.fillStyle(UI.navyHi, 0.6).fillRect(2, 2, size - 4, 1);
    };
    draw(false);
    const k = size >= 40 ? 2 : 2;
    const img = this.add.image(size / 2, size / 2, iconTitleTex(this, icon)).setScale(k);
    c.add([g, img]);
    if (label) c.add(text(this, size / 2, size + 3, label, { align: 'center', color: UI.white, stroke: 0x1a2440 }));
    const z = this.add.zone(0, 0, size, size).setOrigin(0).setInteractive({ useHandCursor: true });
    let down = false;
    z.on('pointerdown', () => {
      down = true;
      draw(true);
      img.y = size / 2 + 1;
    });
    z.on('pointerout', () => {
      down = false;
      draw(false);
      img.y = size / 2;
    });
    z.on('pointerup', () => {
      draw(false);
      img.y = size / 2;
      if (down) onTap();
      down = false;
    });
    c.add(z);
    return c;
  }


  private newPage(): Phaser.GameObjects.Container {
    this.onHome = false;
    this.page?.destroy();
    this.page = this.add.container(0, 0);
    return this.page;
  }

  private showHome(): void {
    this.current = () => this.showHome();
    const p = this.newPage();
    this.onHome = true;
    // 招牌字直接立在天上，下面一条红绸带
    p.add(this.add.image(W / 2, 112, logoTex(this, '像素三国')).setScale(2));
    const rg = this.add.graphics();
    const ry = 152;
    const rh = 22;
    // 绸带两头的燕尾（每行一段矩形，像素干净）
    for (let j = 0; j < rh; j++) {
      const notch = Math.max(0, 7 - Math.abs(j - (rh - 1) / 2));
      rg.fillStyle(j < 2 ? 0xb02418 : 0x7a1008).fillRect(46 + Math.round(notch), ry + 5 + j, 24 - Math.round(notch), 1);
      rg.fillStyle(j < 2 ? 0xb02418 : 0x7a1008).fillRect(290, ry + 5 + j, 24 - Math.round(notch), 1);
    }
    rg.fillStyle(0x4a0000).fillRect(62, ry + 5, 8, rh).fillRect(290, ry + 5, 8, rh);
    rg.fillStyle(0x4a0000).fillRect(62, ry - 1, 236, rh + 2);
    vgrad(rg, 63, ry, 234, rh, [0xf06040, 0xd03420, 0xa81a0e, 0x8a1008]);
    rg.fillStyle(0xff9a78).fillRect(63, ry, 234, 1);
    rg.fillStyle(UI.gold).fillRect(66, ry + 3, 228, 1).fillRect(66, ry + rh - 4, 228, 1);
    p.add(rg);
    p.add(text(this, W / 2, ry + 4, '回合制 · 三国像素单机', { align: 'center', color: UI.white, stroke: 0x4a0000 }));
    p.add(text(this, W / 2, ry + rh + 8, '单机版 P4 · 天下', { align: 'center', color: UI.cream, stroke: 0x3a2a10 }));

    // 右上角留给桃花，左上角是全屏开关
    if (fullscreenSupported()) {
      p.add(this.iconButton(8, SAFE_TOP + 8, isFullscreen() ? 'unfull' : 'full', '', () => void (isFullscreen() ? exitFullscreen() : enterFullscreen()), 30));
    }

    // 底部压暗一点，署名才看得清
    const bg = this.add.graphics();
    for (let k = 0; k < 6; k++) bg.fillStyle(0x0a1a08, 0.07 * (k + 1)).fillRect(0, H - 72 + k * 12, W, 12);
    p.add(bg);

    // 主按钮：有存档就继续，没有就开始；下面一排小图标是次要功能
    const has = store.has();
    const by = H - 206;
    if (has) {
      const s = store.save;
      const pill = this.add.graphics();
      const info = `${s.player.name} · ${s.player.level}级${classes[s.player.classId].name}`;
      pill.fillStyle(0x0c0e44, 0.6).fillRect(60, by - 30, 240, 22);
      pill.fillStyle(0xffffff, 0.25).fillRect(60, by - 30, 240, 1);
      p.add(pill);
      p.add(text(this, W / 2, by - 26, info, { align: 'center', color: UI.cream }));
    }
    const glow = this.add.graphics();
    glow.fillStyle(0xfff0a0, 1).fillRect(76, by - 4, 208, 54).fillRect(74, by - 2, 212, 50);
    glow.setAlpha(0);
    p.add(glow);
    this.tweens.add({ targets: glow, alpha: { from: 0, to: 0.45 }, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    const start = () => (has ? this.scene.start('Main') : this.showCreate());
    p.add(new Button(this, 80, by, 200, 46, '', start, { style: 'red' }));
    p.add(text(this, W / 2, by + 9, has ? '继续游戏' : '开始游戏', { align: 'center', color: 0xfff0c0, stroke: 0x4a0804, scale: 2 }));

    const icons: [string, string, () => void][] = [];
    if (has || [0, 1, 2].some((i) => store.peek(i))) icons.push(['slots', '存档位', () => this.showSlots()]);
    icons.push(['import', '导入存档', () => this.importSave()]);
    icons.push(['cloud', '云存档', () => cloudPanel(this, false, () => this.showHome())]);
    if (!isApp() && /Android/i.test(navigator.userAgent)) icons.push(['phone', '安卓版', () => window.open('./download/pixel-sanguo.apk', '_blank')]);
    const gap = 30;
    const x0 = Math.round((W - (icons.length * 44 + (icons.length - 1) * gap)) / 2);
    icons.forEach(([ic, label, fn], i) => p.add(this.iconButton(x0 + i * (44 + gap), H - 132, ic, label, fn)));

    p.add(text(this, W / 2, H - 20, '画面、剧情为原创 · 字体 Fusion Pixel（OFL）', { align: 'center', color: 0xa8b8a0, stroke: 0x1a2a10 }));
  }

  // 三个存档位：读取、删除，空位上新建角色
  private showSlots(): void {
    this.current = () => this.showSlots();
    const p = this.newPage();
    const top = SAFE_TOP + 10 + Math.max(0, Math.round((H - SAFE_TOP - 20 - 330) / 2));
    const g = this.add.graphics();
    frame(g, 10, top, W - 20, 330, 'paper');
    frame(g, 14, top + 4, W - 28, 22, 'dark');
    p.add(g);
    p.add(text(this, W / 2, top + 9, '存档位', { align: 'center', color: C.paper }));
    const names = ['一', '二', '三'];
    for (let i = 0; i < SLOTS; i++) {
      const info = store.peek(i);
      const y = top + 36 + i * 84;
      const rg = this.add.graphics();
      frame(rg, 20, y, W - 40, 76, i === store.slot ? 'red' : 'tan');
      p.add(rg);
      p.add(text(this, 30, y + 8, `存档${names[i]}${i === store.slot ? '（当前）' : ''}`, { color: i === store.slot ? 0xfff0c0 : C.darkBrown }));
      if (info) {
        const d = info.savedAt ? new Date(info.savedAt) : null;
        const when = d ? `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '';
        p.add(text(this, 30, y + 28, `${info.name} · ${info.level}级${classes[info.classId as ClassId]?.name ?? ''}`, { color: i === store.slot ? UI.cream : C.darkRed }));
        p.add(text(this, 30, y + 48, `${locations[info.location]?.name ?? ''}${when ? ` · ${when}` : ''}`, { color: i === store.slot ? 0xe8c8a0 : C.brown }));
        p.add(new Button(this, W - 146, y + 14, 56, 24, '读取', () => {
          store.useSlot(i);
          this.scene.start('Main');
        }, { style: 'red' }));
        p.add(new Button(this, W - 84, y + 14, 56, 24, '删除', () => confirm(this, `删除存档${names[i]}（${info.name} ${info.level}级）？删了找不回来，建议先进游戏在「功能 → 设置」导出。`, () => {
          store.removeSlot(i);
          forgetSlot(i);
          if (i === store.slot) store.useSlot(i);
          this.showSlots();
        }, '删除')));
      } else {
        p.add(text(this, 30, y + 34, '空', { color: i === store.slot ? UI.cream : C.gray }));
        p.add(new Button(this, W - 146, y + 26, 118, 24, '在这里新建角色', () => {
          const prev = store.slot;
          store.useSlot(i);
          this.showCreate(() => store.useSlot(prev));
        }, { style: 'red' }));
      }
    }
    p.add(new Button(this, W / 2 - 60, top + 294, 120, 28, '返回', () => this.showHome()));
  }

  private importSave(): void {
    const el = document.createElement('input');
    el.type = 'file';
    el.accept = '.json,application/json';
    el.onchange = async () => {
      const f = el.files?.[0];
      if (!f) return;
      try {
        store.set(deserialize(await f.text()));
        toast(this, '存档已导入');
        this.showHome();
      } catch (e) {
        toast(this, `导入失败：${(e as Error).message}`);
      }
    };
    el.click();
  }

  private showCreate(onBack?: () => void): void {
    this.current = () => this.showCreate(onBack);
    const rng = new Rng(randomSeed());
    const st = { gender: 'male' as Gender, classId: 'warrior' as ClassId, avatar: 0 };
    const p = this.newPage();
    // 面板 560 高（和游戏里的弹窗一样：漆木框、宣纸、朱漆题签），放在刘海、摄像头那条下面，长屏手机上居中
    const PH = 560;
    const top = SAFE_TOP + 16 + Math.max(0, Math.round((H - SAFE_TOP - 26 - PH) / 2));
    const oy = top - 30;
    p.setY(oy);
    const g = this.add.graphics();
    woodFrame(g, 10, 30, W - 20, PH);
    p.add(g);
    p.add(this.add.image(16, 36, paperTex(this, W - 32, PH - 12)).setOrigin(0));
    const tg = this.add.graphics();
    titlePlaque(tg, W / 2, 24, 92, 20);
    p.add(tg);
    p.add(text(this, W / 2, 28, '创建角色', { align: 'center', color: 0xfff0c0, stroke: 0x4a0804 }));
    p.add(text(this, 28, 66, '名称', { color: C.brown }));
    const g2 = this.add.graphics();
    frame(g2, 70, 60, W - 180, 24, 'ink');
    p.add(g2);
    const input = overlayInput(this, 72, 62 + oy, W - 184, 20, aiName(rng), 6);
    p.add(new Button(this, W - 102, 60, 72, 24, '随机', () => (input.value = aiName(rng))));

    const dyn = this.add.container(0, 0);
    p.add(dyn);
    const render = () => {
      dyn.removeAll(true);
      dyn.add(text(this, 28, 102, '性别', { color: C.brown }));
      (['male', 'female'] as Gender[]).forEach((gd, i) => {
        dyn.add(new Button(this, 70 + i * 66, 96, 60, 24, gd === 'male' ? '男' : '女', () => {
          st.gender = gd;
          render();
        }, { style: st.gender === gd ? 'red' : 'tan' }));
      });
      dyn.add(text(this, 28, 138, '职业', { color: C.brown }));
      // 三个职业按钮铺到右边（画面放大时窄一点）
      const cw = Math.min(80, Math.floor((W - 102) / 3));
      CLASS_IDS.forEach((c, i) => {
        dyn.add(new Button(this, 70 + i * (cw + 6), 132, cw, 24, classes[c].name, () => {
          st.classId = c;
          render();
        }, { style: st.classId === c ? 'red' : 'tan' }));
      });
      const sk = classSkills(st.classId, st.gender).map((id) => skills[id].name).join('、');
      dyn.add(text(this, 28, 166, `${CLASS_TRAIT[st.classId]}\n技能：${sk}`, { wrap: W - 56, color: C.darkBrown }));
      // 六个头像两排（后三个是 0.1.4 加的，胡子、伤疤、眼罩、老相这些差得更远）
      dyn.add(text(this, 28, 216, '头像', { color: C.brown }));
      const look = heroLookKey(st.classId, st.gender);
      for (let v = 0; v < AVATARS; v++) {
        const x = 70 + (v % 3) * 60;
        const y = 210 + Math.floor(v / 3) * 58;
        const fg = this.add.graphics();
        frame(fg, x, y, 54, 54, st.avatar === v ? 'red' : 'tan');
        dyn.add(fg);
        dyn.add(this.add.image(x + 3, y + 3, avatarTex(this, look, heroVariantOf(v, 0))).setOrigin(0).setScale(2));
        dyn.add(hit(this, x, y, 54, 54, () => {
          st.avatar = v;
          render();
        }));
      }
      // 右边一格全身像，选哪个头像就换哪个
      const px = 70 + 3 * 60 + 2;
      const pw = W - 26 - px;
      const pg = this.add.graphics();
      goldFrame(pg, px, 210, pw, 112, null);
      dyn.add(pg);
      dyn.add(this.add.image(px + 4, 214, sceneTex(this, 'grass', Math.floor((pw - 8) / 2), 52, 0.45)).setOrigin(0).setScale(2));
      const hero = this.add.image(px + pw / 2 - (BX - UNIT_W / 2) * 2, 214 + 100, unitTex(this, look, heroVariantOf(st.avatar, 0), 'idle')).setOrigin(0.5, FEET_Y / UNIT_H).setScale(2);
      dyn.add(hero);
      this.tweens.add({ targets: hero, y: hero.y - 3, duration: 600, yoyo: true, repeat: -1, ease: 'Stepped', easeParams: [2] });
      // 底下一张大的半身像
      const bg = this.add.graphics();
      goldFrame(bg, W / 2 - 92, 336, 184, 176, null);
      dyn.add(bg);
      dyn.add(this.add.image(W / 2 - 88, 340, sceneTex(this, 'grass', 88, 84, 0.45)).setOrigin(0).setScale(2));
      dyn.add(this.add.image(W / 2, 340 + 168, bustTex(this, look, heroVariantOf(st.avatar, 0))).setOrigin(0.5, 1).setScale(2));
    };
    render();

    p.add(new Button(this, 30, 30 + PH - 46, 120, 32, '返回', () => {
      input.remove();
      onBack?.();
      this.showHome();
    }));
    p.add(new Button(this, W - 150, 30 + PH - 46, 120, 32, '进入游戏', () => {
      const name = input.value.trim();
      if (!name) return toast(this, '请输入名称');
      if (name.length > 6) return toast(this, '名称最多6个字');
      input.remove();
      const s = newSave({ server: '豫州', name, gender: st.gender, classId: st.classId, avatar: st.avatar, seed: randomSeed() });
      // 新角色默认开振动（老玩家不动，免得更新后手机突然震起来；设置里能开关）
      if (!hasVibrateChoice()) saveSettings({ vibrate: canVibrate() });
      log(s, `${name}踏上了江湖路。`);
      store.set(s);
      this.newPage();
      showDialog(this, opening, [], () => {
        acceptQuest(store.save);
        store.commit();
        this.scene.start('Main');
      });
    }, { style: 'red' }));
  }
}
