import Phaser from 'phaser';
import { store } from '../game/store';
import { seedChatter } from '../game/chatter';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    store.loadLocal();
    seedChatter(6);
    this.scene.start('Title');
  }
}
