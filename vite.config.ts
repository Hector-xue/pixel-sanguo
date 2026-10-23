import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 2000 },
  // 平常只跑 tests；SIM=1 时跑 sims 里的长模拟（npm run sim:endgame）
  test: { include: [process.env.SIM ? 'sims/**/*.test.ts' : 'tests/**/*.test.ts'] },
} as never);
