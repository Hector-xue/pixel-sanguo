import Phaser from 'phaser';
import { store } from '../game/store';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    store.loadLocal();
    this.scene.start('Title');
  }
}
