// 舆图：一整张宣纸地图，按出口方向排好的所有地点，城镇画城墙、野外画当地的小景（树、帐篷、石头……），
// 中间墨线连着路；没去过的地方罩在云里，和去过的相邻的露个影子。拖动看全图，点一个地方看详情，「前往」自动寻路
import Phaser from 'phaser';
import { locations, npcs } from '../data';
import type { PropKind } from '../art/props';
import { avatarTex, heroLookKey, propTex } from '../art/textures';
import { PAPER, paperTex, sealBox, titlePlaque, woodFrame } from '../art/chrome';
import { findPath, heroVariant, questDestination } from '../game/state';
import { store } from '../game/store';
import { fogOf, levelRange, worldLayout, worldRoads, worldSize } from '../game/worldmap';
import { badgeCount, badgeTotal, hasBadge } from '../game/badges';
import { Button, H, SAFE_TOP, W, sfx, text, textWidth } from './widgets';

const CW = 66;
const CH = 60;
const PAD = 40;

// 野外的小景
const ICON: Record<string, PropKind> = {
  village: 'hut', manor: 'house', gate: 'pillar', hill: 'rock', river: 'reeds', forest: 'pine', grass: 'bush', road: 'sign', farm: 'hay',
  cave: 'stalagmite', pass: 'stakes', bamboo: 'bamboo', valley: 'tree', tomb: 'grave', ruins: 'pillar', marsh: 'reeds', altar: 'torch', camp: 'tent', city: 'lion',
};

// 城镇：一段城墙，中间朱红城门，上面一座城楼
function drawCity(g: Phaser.GameObjects.Graphics, x: number, y: number, big: boolean): void {
  const w = big ? 34 : 26;
  const h = big ? 14 : 11;
  const l = Math.round(x - w / 2);
  const t = Math.round(y - h);
  g.fillStyle(0x2a1a10).fillRect(l - 1, t - 1, w + 2, h + 2);
  g.fillStyle(0x9a8c78).fillRect(l, t, w, h);
  g.fillStyle(0xbcae96).fillRect(l, t, w, 2);
  for (let i = 0; i < w; i += 4) g.fillStyle(0x2a1a10).fillRect(l + i, t - 3, 3, 3).fillStyle(0x9a8c78).fillRect(l + i + 1, t - 2, 1, 2);
  g.fillStyle(0x6a1008).fillRect(x - 3, y - 7, 7, 7);
  g.fillStyle(0xb42c18).fillRect(x - 2, y - 6, 5, 6);
  // 城楼
  const rw = big ? 18 : 14;
  g.fillStyle(0x2a1a10).fillRect(x - rw / 2 - 2, t - 9, rw + 4, 3);
  g.fillStyle(0x8c1a0c).fillRect(x - rw / 2 - 1, t - 8, rw + 2, 1);
  g.fillStyle(0xc8b496).fillRect(x - rw / 2 + 2, t - 6, rw - 4, 3);
  g.fillStyle(0x2a1a10).fillRect(x - 1, t - 5, 2, 2);
}

export function worldMap(scene: Phaser.Scene, onGo: (dest: string) => void): void {
  const s = store.save;
  const pos = worldLayout();
  const { cols, rows } = worldSize();
  const fog = fogOf(s);
  const dest = questDestination(s);
  const mw = cols * CW + PAD * 2;
  const mh = rows * CH + PAD * 2;
  const at = (id: string) => ({ x: PAD + pos[id].x * CW + CW / 2, y: PAD + pos[id].y * CH + CH / 2 });

  const root = scene.add.container(0, 0).setDepth(700);
  const block = scene.add.zone(0, 0, W, H).setOrigin(0).setInteractive();
  const back = scene.add.graphics();
  back.fillStyle(0x0a0604).fillRect(0, 0, W, H);
  root.add([block, back]);
  // 视窗：顶上题签，底下图例和详情
  const top = SAFE_TOP + 40;
  const bottom = H - 92;
  const vh = bottom - top;
  const map = scene.add.container(0, 0);
  const maskG = scene.make.graphics({}, false);
  maskG.fillStyle(0xffffff).fillRect(6, top, W - 12, vh);
  map.setMask(maskG.createGeometryMask());
  root.add(map);
  map.add(scene.add.image(0, 0, paperTex(scene, mw, mh)).setOrigin(0));

  // 空格子里零星画几笔淡墨远山、水纹，像一张古地图
  const deco = scene.add.graphics();
  const taken = new Set(Object.values(pos).map((c) => `${c.x},${c.y}`));
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let cy = -1; cy <= rows; cy++) for (let cx = -1; cx <= cols; cx++) {
    const r = rnd();
    if (taken.has(`${cx},${cy}`) || r > 0.32) continue;
    const x = PAD + cx * CW + CW / 2 + Math.round((rnd() - 0.5) * 20);
    const y = PAD + cy * CH + CH / 2 + Math.round((rnd() - 0.5) * 16);
    if (r < 0.2) {
      // 两座山：只描边，左亮右暗
      for (const [ox, hh] of [[-8, 12], [6, 9]]) {
        for (let k = 0; k < hh; k++) {
          deco.fillStyle(0xc4ab82).fillRect(x + ox - k, y - hh + k, 1, 1);
          deco.fillStyle(0xb09670).fillRect(x + ox + k, y - hh + k, 1, 1);
        }
      }
    } else {
      // 三道水纹
      for (let row = 0; row < 3; row++) for (let k = 0; k < 14; k++) {
        if ((k + row) % 5 === 4) continue;
        deco.fillStyle(0xc8b48c).fillRect(x - 7 + k + row * 2, y + row * 4 + (k % 4 < 2 ? 0 : 1), 1, 1);
      }
    }
  }
  map.add(deco);

  // 路：墨线，两头都露出来才画；有一头是「未至」就画成虚线
  const rg = scene.add.graphics();
  for (const [a, b] of worldRoads()) {
    if (fog[a] === 'hidden' || fog[b] === 'hidden') continue;
    const p = at(a);
    const q = at(b);
    const dashed = fog[a] !== 'seen' || fog[b] !== 'seen';
    const len = Math.hypot(q.x - p.x, q.y - p.y);
    const steps = Math.floor(len / 3);
    for (let k = 0; k <= steps; k++) {
      if (dashed && k % 3 === 2) continue;
      const x = Math.round(p.x + ((q.x - p.x) * k) / steps);
      const y = Math.round(p.y + ((q.y - p.y) * k) / steps);
      rg.fillStyle(dashed ? 0xb8a07c : 0x7a5a38).fillRect(x - 1, y - 1, 2, 2);
    }
  }
  map.add(rg);

  // 雾：没去过也不相邻的格子盖一团云
  const cloud = scene.add.graphics();
  for (const [id, f] of Object.entries(fog)) {
    if (f !== 'hidden') continue;
    const { x, y } = at(id);
    cloud.fillStyle(0xe4d4b0, 1).fillEllipse(x, y, CW + 14, CH - 6).fillEllipse(x - 18, y + 8, CW * 0.7, CH * 0.6).fillEllipse(x + 20, y - 6, CW * 0.7, CH * 0.6);
    cloud.fillStyle(0xd2bf98, 1).fillEllipse(x + 4, y + 12, CW * 0.8, 10);
  }
  map.add(cloud);

  // 地点
  for (const [id, f] of Object.entries(fog)) {
    if (f === 'hidden') continue;
    const loc = locations[id];
    const { x, y } = at(id);
    const dim = f === 'near';
    if (loc.town) {
      const g = scene.add.graphics();
      drawCity(g, x, y + 6, loc.facilities ? loc.facilities.length >= 4 : false);
      if (dim) g.setAlpha(0.35);
      map.add(g);
    } else {
      const img = scene.add.image(x, y + 8, propTex(scene, ICON[loc.art] ?? 'bush', id.length)).setOrigin(0.5, 1);
      if (img.height > 34) img.setCrop(0, img.height - 34, img.width, 34);
      if (dim) img.setAlpha(0.3).setTint(0x8a7a60);
      map.add(img);
    }
    const label = dim ? '未至' : loc.name;
    const lc = dim ? 0xa8946c : loc.town ? 0x8c1a0c : PAPER.ink;
    const lv = dim ? null : levelRange(id);
    // 字底下垫一块纸色，路的墨线不压字
    const bg = scene.add.graphics();
    const lw = textWidth(label) + 6;
    bg.fillStyle(PAPER.base, 0.92).fillRect(Math.round(x - lw / 2), y + 10, lw, 15);
    if (lv) {
      const vw = textWidth(`${lv[0]}级`) + 6;
      bg.fillRect(Math.round(x - vw / 2), y + 25, vw, 13);
    }
    map.add(bg);
    map.add(text(scene, x, y + 10, label, { align: 'center', color: lc }));
    // 这里的印：找到了是一枚朱红小印，没找到是一圈空框
    if (!dim) {
      const sg = scene.add.graphics();
      const bx = Math.round(x - lw / 2 - 9);
      if (hasBadge(s, id)) {
        sg.fillStyle(0x3a0804).fillRect(bx, y + 12, 8, 8);
        sg.fillStyle(0xc8301c).fillRect(bx + 1, y + 13, 6, 6);
        sg.fillStyle(0xfff0c0).fillRect(bx + 3, y + 15, 2, 2);
      } else {
        sg.lineStyle(1, 0xb8a07c).strokeRect(bx + 0.5, y + 12.5, 7, 7);
      }
      map.add(sg);
    }
    if (lv) map.add(text(scene, x, y + 24, `${lv[0]}级`, { align: 'center', color: lv[0] > s.player.level + 3 ? 0xb42c18 : 0x9a8460 }));
  }

  // 任务地点：一面金旗；当前位置：主角头像 + 一圈朱红
  if (dest && fog[dest] !== 'hidden') {
    const { x, y } = at(dest);
    const fg = scene.add.graphics();
    fg.fillStyle(0x2a1a10).fillRect(x - 16, y - 26, 2, 22);
    fg.fillStyle(0xffc020).fillTriangle(x - 16, y - 26, x - 30, y - 21, x - 16, y - 16);
    fg.fillStyle(0xfff0a0).fillRect(x - 21, y - 24, 4, 1);
    map.add(fg);
    scene.tweens.add({ targets: fg, y: -2, duration: 420, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }
  const here = at(s.location);
  const ring = scene.add.ellipse(here.x, here.y + 8, 46, 14).setStrokeStyle(2, 0xd8402a, 1);
  map.add(ring);
  scene.tweens.add({ targets: ring, scaleX: 1.2, scaleY: 1.2, alpha: 0.4, duration: 600, yoyo: true, repeat: -1 });
  const p = s.player;
  // 头像挂在图标右上角，不压上一格的地名
  const ax = here.x + 12;
  const ay = here.y - 30;
  const ag = scene.add.graphics();
  ag.fillStyle(0x2a1a10).fillRect(ax - 1, ay - 1, 26, 26);
  ag.fillStyle(0xe0a830).fillRect(ax, ay, 24, 24);
  ag.fillStyle(0x2a1a10).fillTriangle(ax + 2, ay + 24, ax + 9, ay + 24, ax + 1, ay + 30);
  map.add(ag);
  map.add(scene.add.image(ax, ay, avatarTex(scene, heroLookKey(p.classId, p.gender), heroVariant(s))).setOrigin(0).setCrop(1, 1, 22, 22));

  // 平移：初始把当前位置放在视窗中间
  const minX = Math.min(6, W - 6 - mw);
  const minY = Math.min(top, bottom - mh);
  const clamp = (x: number, y: number) => {
    map.setPosition(Math.round(Phaser.Math.Clamp(x, minX, mw < W - 12 ? (W - mw) / 2 : 6)), Math.round(Phaser.Math.Clamp(y, minY, mh < vh ? top + (vh - mh) / 2 : top)));
  };
  clamp(W / 2 - here.x, top + vh / 2 - here.y);

  // 外框、题签、关闭
  const fr = scene.add.graphics();
  woodFrame(fr, 0, top - 6, W, vh + 12);
  // 木框只要边，中间挖空：用四条把内部重画成透明不行，所以框画在下面一层、地图压在上面
  root.addAt(fr, 2);
  const tg = scene.add.graphics();
  titlePlaque(tg, W / 2, SAFE_TOP + 10, 90, 22);
  root.add([tg, text(scene, W / 2, SAFE_TOP + 14, '舆图', { align: 'center', color: 0xfff0c0, stroke: 0x4a0804 })]);
  const cg = scene.add.graphics();
  sealBox(cg, W - 36, SAFE_TOP + 8, 26);
  root.add([cg, text(scene, W - 23, SAFE_TOP + 14, '×', { align: 'center', color: 0xfff0c0 })]);
  const seenN = Object.values(fog).filter((f) => f === 'seen').length;
  root.add(text(scene, 10, SAFE_TOP + 6, `已到 ${seenN}/${Object.keys(fog).length}`, { color: 0xc8b08a }));
  root.add(text(scene, 10, SAFE_TOP + 22, `印 ${badgeCount(s)}/${badgeTotal()}`, { color: 0xe07050 }));

  // 底部：详情卡（默认显示当前位置）
  const info = scene.add.container(0, 0);
  root.add(info);
  const close = () => {
    scene.tweens.add({ targets: root, alpha: 0, duration: 140, onComplete: () => {
      root.destroy();
      maskG.destroy();
    } });
  };
  const showInfo = (id: string) => {
    info.removeAll(true);
    const loc = locations[id];
    const f = fog[id];
    const y = bottom + 10;
    const g = scene.add.graphics();
    woodFrame(g, 4, y, W - 8, H - y - 6);
    info.add([g, scene.add.image(10, y + 6, paperTex(scene, W - 20, H - y - 18)).setOrigin(0)]);
    const name = f === 'near' ? '未至之地' : loc.name;
    info.add(text(scene, 18, y + 12, name, { color: loc.town && f === 'seen' ? 0x8c1a0c : PAPER.ink, scale: 1 }));
    const lv = levelRange(id);
    const kind = loc.town ? '城镇' : lv ? `野外 · ${lv[0]}–${lv[1]}级` : '野外';
    info.add(text(scene, 18 + textWidth(name) + 10, y + 12, f === 'near' ? '还没去过' : kind, { color: 0x8a6a40 }));
    const who = f === 'seen' ? loc.npcs.map((n) => npcs[n]?.name).filter(Boolean).slice(0, 4).join('、') : '';
    const line2 = id === s.location ? '你就在这里' : f === 'near' ? '去过的地方旁边，走过去看看' : who ? `这里有：${who}` : '';
    info.add(text(scene, 18, y + 32, line2, { color: 0x6a5236 }));
    if (f === 'seen') info.add(text(scene, 18, y + 50, hasBadge(s, id) ? '这里的印已经找到了' : '这里的印还没找到——地上留神看', { color: hasBadge(s, id) ? 0x8c1a0c : 0x9a8460 }));
    if (id === dest) info.add(text(scene, W - 18, y + 58, '任务地点', { align: 'right', color: 0xb07800 }));
    if (id !== s.location) {
      const path = findPath(s.location, id);
      if (path) info.add(new Button(scene, W - 96, y + 22, 80, 30, `前往 ${path.length - 1}步`, () => {
        close();
        onGo(id);
      }, { style: 'red' }));
      else info.add(text(scene, W - 18, y + 30, '路不通', { align: 'right', color: 0x9a8460 }));
    }
  };
  showInfo(s.location);

  // 拖动看图；没怎么动就算点了一下，点到哪个地方就显示它
  let drag: { x: number; y: number; mx: number; my: number; moved: boolean } | null = null;
  block.on('pointerdown', (pt: Phaser.Input.Pointer) => {
    drag = { x: pt.x, y: pt.y, mx: map.x, my: map.y, moved: false };
  });
  block.on('pointermove', (pt: Phaser.Input.Pointer) => {
    if (!drag || !pt.isDown) return;
    const dx = pt.x - drag.x;
    const dy = pt.y - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 6) drag.moved = true;
    if (drag.moved) clamp(drag.mx + dx, drag.my + dy);
  });
  block.on('pointerup', (pt: Phaser.Input.Pointer) => {
    const d = drag;
    drag = null;
    if (!d || d.moved) return;
    if (pt.y < top) {
      if (pt.x > W - 44) close();
      return;
    }
    if (pt.y > bottom) return;
    const mx = pt.x - map.x;
    const my = pt.y - map.y;
    let best: string | null = null;
    let bd = 30;
    for (const [id, f] of Object.entries(fog)) {
      if (f === 'hidden') continue;
      const c = at(id);
      const dd = Math.hypot(c.x - mx, c.y - my);
      if (dd < bd) {
        bd = dd;
        best = id;
      }
    }
    if (best) {
      sfx('click');
      showInfo(best);
    }
  });
  root.setAlpha(0);
  scene.tweens.add({ targets: root, alpha: 1, duration: 160 });
}
