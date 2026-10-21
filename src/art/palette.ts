// 全游戏统一的 32 色调色板（偏古风暖色）。0 号是透明。
export const PALETTE: string[] = [
  'rgba(0,0,0,0)', // 0 透明
  '#1a1210', // 1 墨（描边）
  '#3b2a1a', // 2 深褐（正文）
  '#5c3f26', // 3 褐
  '#8a5f38', // 4 浅褐
  '#b88a55', // 5 土黄
  '#e0bf86', // 6 沙
  '#f3e3c0', // 7 宣纸
  '#fff6e0', // 8 亮纸
  '#f2c9a0', // 9 肤
  '#d39a74', // 10 肤影
  '#7a1f1a', // 11 深红
  '#b8322a', // 12 朱红
  '#e0603c', // 13 橘红
  '#f0a040', // 14 金
  '#f6d36a', // 15 明黄
  '#2e4a2a', // 16 墨绿
  '#4f7a3a', // 17 绿
  '#86a94a', // 18 草绿
  '#c4d67a', // 19 嫩绿
  '#1f2f4f', // 20 藏青
  '#34588a', // 21 蓝
  '#5f8fc0', // 22 浅蓝
  '#a9cfe6', // 23 天青
  '#3d2a4f', // 24 深紫
  '#6b4a8a', // 25 紫
  '#a07ac0', // 26 丁香
  '#5a5a62', // 27 深灰
  '#8c8c90', // 28 灰
  '#c6c2b8', // 29 浅灰
  '#f8f8f0', // 30 白
  '#e48ca0', // 31 粉
];

export const C = {
  clear: 0, ink: 1, darkBrown: 2, brown: 3, lightBrown: 4, tan: 5, sand: 6, paper: 7, lightPaper: 8,
  skin: 9, skinShade: 10, darkRed: 11, red: 12, orange: 13, gold: 14, yellow: 15,
  darkGreen: 16, green: 17, grass: 18, lime: 19, navy: 20, blue: 21, lightBlue: 22, sky: 23,
  darkPurple: 24, purple: 25, lilac: 26, darkGray: 27, gray: 28, lightGray: 29, white: 30, pink: 31,
} as const;

// 界面用的颜色（十六进制数值，给 Phaser Graphics 用）
export const hex = (i: number): number => parseInt(PALETTE[i].slice(1), 16);
export const css = (i: number): string => PALETTE[i];
