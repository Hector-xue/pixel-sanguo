// 把程序生成的像素图注册成 Phaser 贴图，按需生成并缓存
import Phaser from 'phaser';
import { drawAvatar, drawUnit, lookFor } from './units';
import type { Pose } from './units';
import { drawScene } from './scenes';
import type { SceneArt } from './scenes';
import { drawItemIcon } from './icons';
import type { Grid } from './pixel';

function ensure(scene: Phaser.Scene, key: string, make: () => Grid): string {
  if (!scene.textures.exists(key)) scene.textures.addCanvas(key, make().toCanvas(1));
  return key;
}

export function unitTex(scene: Phaser.Scene, look: string, variant: number, pose: Pose): string {
  return ensure(scene, `u:${look}:${variant}:${pose}`, () => drawUnit(lookFor(look, variant), pose));
}

export function avatarTex(scene: Phaser.Scene, look: string, variant = 0): string {
  return ensure(scene, `a:${look}:${variant}`, () => drawAvatar(lookFor(look, variant)));
}

export function sceneTex(scene: Phaser.Scene, art: string, w: number, h: number, horizon: number): string {
  return ensure(scene, `s:${art}:${w}x${h}`, () => drawScene(art as SceneArt, w, h, horizon));
}

export function iconTex(scene: Phaser.Scene, item: string): string {
  return ensure(scene, `i:${item}`, () => drawItemIcon(item));
}

export function heroLookKey(classId: string, gender: string): string {
  return `hero_${classId}_${gender}`;
}
