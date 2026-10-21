// 标题 → 选分区 → 建角色（名称、性别、职业、头像三选一）→ 开场剧情
import Phaser from 'phaser';
import { C } from '../art/palette';
import { avatarTex, heroLookKey, sceneTex, unitTex } from '../art/textures';
import { BX, FEET_Y, UNIT_H, UNIT_W } from '../art/units';
import { CLASS_IDS, classSkills, classes, opening, skills } from '../data';
import { Rng, randomSeed } from '../core/rng';
import type { ClassId, Gender } from '../core/types';
import { aiName } from '../game/chatter';
import { acceptQuest, deserialize, log, newSave } from '../game/state';
import { store } from '../game/store';
import { showDialog } from '../ui/dialog';
import { overlayInput } from '../ui/input';
import { cloudPanel } from '../ui/cloud';
import { isApp } from '../game/cloud';
import { Button, H, W, confirm, frame, goldFrame, hit, text, toast } from '../ui/widgets';
import { UI } from '../art/chrome';

const SERVERS = ['许昌', '洛阳', '长安', '邺城', '建业', '成都', '襄阳', '下邳', '宛城', '汝南', '北海', '陈留', '濮阳', '庐江', '江陵'];
const CLASS_TRAIT: Record<ClassId, string> = {
  warrior: '近身肉搏，天生20点抗物理，血厚能扛。',
  scholar: '控场辅助，让敌人中计：乱、封、围。',
  mystic: '法术输出，单体伤害极高，群体必中。',
};

export class TitleScene extends Phaser.Scene {
  private page: Phaser.GameObjects.Container | null = null;

  constructor() {
    super('Title');
  }

  create(): void {
    this.add.image(0, 0, sceneTex(this, 'village', 180, Math.ceil(H / 2), 0.5)).setOrigin(0).setScale(2);
    this.showHome();
  }

  private newPage(): Phaser.GameObjects.Container {
    this.page?.destroy();
    this.page = this.add.container(0, 0);
    return this.page;
  }

  private showHome(): void {
    const p = this.newPage();
    const g = this.add.graphics();
    goldFrame(g, 40, 70, 280, 110, 0x0c0e44);
    p.add(g);
    p.add(text(this, W / 2, 88, '像素三国', { align: 'center', color: UI.yellow, stroke: 0x6a2000, scale: 3 }));
    p.add(text(this, W / 2, 140, '回合制 · 三国像素单机', { align: 'center', color: C.brown }));
    p.add(text(this, W / 2, 158, '单机版 P4 · 天下', { align: 'center', color: C.gray }));
    let y = 360;
    if (store.has()) {
      const s = store.save;
      p.add(new Button(this, 90, y, 180, 32, `继续游戏`, () => this.scene.start('Main'), { style: 'red' }));
      p.add(text(this, W / 2, y + 36, `${s.server} · ${s.player.name} · ${s.player.level}级${classes[s.player.classId].name}`, { align: 'center', color: C.lightPaper, stroke: C.ink }));
      y += 64;
    }
    p.add(new Button(this, 90, y, 180, 32, '创建角色', () => {
      if (store.has()) confirm(this, '创建新角色会覆盖现在的存档。建议先在游戏里「功能 → 退出」导出存档。', () => this.showServers(0), '覆盖');
      else this.showServers(0);
    }));
    p.add(new Button(this, 90, y + 44, 180, 32, '导入存档', () => this.importSave()));
    p.add(new Button(this, 90, y + 88, 180, 32, '云存档', () => cloudPanel(this, false, () => this.showHome())));
    if (!isApp() && /Android/i.test(navigator.userAgent)) {
      p.add(new Button(this, 90, y + 132, 180, 28, '下载安卓版', () => window.open('./download/pixel-sanguo.apk', '_blank'), { style: 'blue' }));
    }
    p.add(text(this, W / 2, H - 24, '画面、剧情为原创；字体 Fusion Pixel（OFL）', { align: 'center', color: C.lightPaper, stroke: C.ink }));
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

  private showServers(pageNo: number): void {
    const p = this.newPage();
    const g = this.add.graphics();
    frame(g, 20, 60, 320, 380, 'paper');
    frame(g, 24, 64, 312, 22, 'dark');
    p.add(g);
    p.add(text(this, W / 2, 69, '选择分区', { align: 'center', color: C.paper }));
    const per = 5;
    const pages = Math.ceil(SERVERS.length / per);
    SERVERS.slice(pageNo * per, pageNo * per + per).forEach((name, i) => {
      const no = pageNo * per + i + 1;
      const y = 100 + i * 54;
      const label = `${no}区 ${name}`;
      p.add(new Button(this, 40, y, 280, 44, '', () => this.showCreate(label)));
      p.add(text(this, 56, y + 15, label, { color: C.darkBrown }));
      const hot = no <= 2 ? '火爆' : no === SERVERS.length ? '新区' : '流畅';
      p.add(text(this, 304, y + 15, hot, { align: 'right', color: hot === '火爆' ? C.red : hot === '新区' ? C.blue : C.green }));
    });
    p.add(text(this, W / 2, 378, `第 ${pageNo + 1}/${pages} 页`, { align: 'center', color: C.brown }));
    p.add(new Button(this, 40, 400, 80, 26, '上一页', () => this.showServers(pageNo - 1), { disabled: pageNo === 0 }));
    p.add(new Button(this, 140, 400, 80, 26, '返回', () => this.showHome()));
    p.add(new Button(this, 240, 400, 80, 26, '下一页', () => this.showServers(pageNo + 1), { disabled: pageNo >= pages - 1 }));
  }

  private showCreate(server: string): void {
    const rng = new Rng(randomSeed());
    const st = { gender: 'male' as Gender, classId: 'warrior' as ClassId, avatar: 0 };
    const p = this.newPage();
    const g = this.add.graphics();
    frame(g, 10, 30, 340, 590, 'paper');
    frame(g, 14, 34, 332, 22, 'dark');
    p.add(g);
    p.add(text(this, W / 2, 39, `创建角色 · ${server}`, { align: 'center', color: C.paper }));
    p.add(text(this, 24, 72, '名称', { color: C.brown }));
    const g2 = this.add.graphics();
    frame(g2, 70, 66, 180, 24, 'ink');
    p.add(g2);
    const input = overlayInput(this, 72, 68, 176, 20, aiName(rng), 6);
    p.add(new Button(this, 258, 66, 72, 24, '随机', () => (input.value = aiName(rng))));

    const dyn = this.add.container(0, 0);
    p.add(dyn);
    const render = () => {
      dyn.removeAll(true);
      dyn.add(text(this, 24, 108, '性别', { color: C.brown }));
      (['male', 'female'] as Gender[]).forEach((gd, i) => {
        dyn.add(new Button(this, 70 + i * 66, 102, 60, 24, gd === 'male' ? '男' : '女', () => {
          st.gender = gd;
          render();
        }, { style: st.gender === gd ? 'red' : 'tan' }));
      });
      dyn.add(text(this, 24, 144, '职业', { color: C.brown }));
      CLASS_IDS.forEach((c, i) => {
        dyn.add(new Button(this, 70 + i * 86, 138, 80, 24, classes[c].name, () => {
          st.classId = c;
          render();
        }, { style: st.classId === c ? 'red' : 'tan' }));
      });
      const sk = classSkills(st.classId, st.gender).map((id) => skills[id].name).join('、');
      dyn.add(text(this, 24, 172, `${CLASS_TRAIT[st.classId]}\n技能：${sk}`, { wrap: 310, color: C.darkBrown }));
      dyn.add(text(this, 24, 222, '头像', { color: C.brown }));
      const look = heroLookKey(st.classId, st.gender);
      for (let v = 0; v < 3; v++) {
        const x = 70 + v * 62;
        const fg = this.add.graphics();
        frame(fg, x, 216, 54, 54, st.avatar === v ? 'red' : 'tan');
        dyn.add(fg);
        dyn.add(this.add.image(x + 3, 219, avatarTex(this, look, v)).setOrigin(0).setScale(2));
        dyn.add(hit(this, x, 216, 54, 54, () => {
          st.avatar = v;
          render();
        }));
      }
      const pg = this.add.graphics();
      goldFrame(pg, 88, 288, 184, 214, null);
      dyn.add(pg);
      dyn.add(this.add.image(0, 0, sceneTex(this, 'grass', 88, 102, 0.45)).setOrigin(0).setScale(2).setPosition(92, 292));
      const hero = this.add.image(180 - (BX - UNIT_W / 2) * 3, 292 + 196, unitTex(this, look, st.avatar, 'idle')).setOrigin(0.5, FEET_Y / UNIT_H).setScale(3);
      dyn.add(hero);
      this.tweens.add({ targets: hero, y: hero.y - 4, duration: 600, yoyo: true, repeat: -1, ease: 'Stepped', easeParams: [2] });
    };
    render();

    p.add(new Button(this, 30, 560, 120, 32, '返回', () => {
      input.remove();
      this.showServers(0);
    }));
    p.add(new Button(this, 210, 560, 120, 32, '进入游戏', () => {
      const name = input.value.trim();
      if (!name) return toast(this, '请输入名称');
      if (name.length > 6) return toast(this, '名称最多6个字');
      input.remove();
      const s = newSave({ server, name, gender: st.gender, classId: st.classId, avatar: st.avatar, seed: randomSeed() });
      log(s, `欢迎来到${server}！`);
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
