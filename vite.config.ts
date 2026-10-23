import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    chunkSizeWarningLimit: 2000,
    // Phaser 单独一个文件：引擎很少变，发新版时文件名（内容哈希）不变，浏览器缓存接着用，只重新下游戏本身
    rollupOptions: { output: { manualChunks: { phaser: ['phaser'] } } },
  },
  // 平常只跑 tests；SIM=1 时跑 sims 里的长模拟（npm run sim:endgame）
  test: { include: [process.env.SIM ? 'sims/**/*.test.ts' : 'tests/**/*.test.ts'] },
} as never);
