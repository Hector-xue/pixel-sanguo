// 文字量宽和折行（不碰 Phaser，测试里也能跑）
export const FONT = 'FusionPixel';

// 点阵字的宽：中文 12 像素，ASCII 6 像素；箭头、★、①、▲ 这类符号实际也是 12。
// 字体加载好以后按真实字形量一次记下来（折行和按钮都靠它，量错了字就出框），没加载好先按规则估
const widths = new Map<string, number>();
let measure: CanvasRenderingContext2D | null = null;
function guessWidth(ch: string): number {
  return ch.charCodeAt(0) < 0x2e80 && !/[—‘-”…·→←↑↓★☆①-⑳▲△▼▽◆●○■□‰]/.test(ch) ? 6 : 12;
}
export function charWidth(ch: string): number {
  const got = widths.get(ch);
  if (got !== undefined) return got;
  if (typeof document === 'undefined' || !document.fonts?.check?.(`12px ${FONT}`)) return guessWidth(ch);
  measure ??= document.createElement('canvas').getContext('2d');
  if (!measure) return guessWidth(ch);
  measure.font = `12px ${FONT}`;
  const w = Math.round(measure.measureText(ch).width) || guessWidth(ch);
  widths.set(ch, w);
  return w;
}

export function textWidth(s: string): number {
  let w = 0;
  for (const ch of s) w += charWidth(ch);
  return w;
}

// 不放行首的标点、不放行尾的开括号
const NO_START = '，。！？、；：）」』”’》〉%…—·';
const NO_END = '（「『“‘《〈【';

// 折行：不超过 max 像素。要折的地方碰上不放行首的标点，就把上一个字一起带到下一行（标点不再挂到框外）；
// 开括号也不留在行尾
export function wrap(s: string, max: number): string[] {
  const out: string[] = [];
  const width = (t: string) => textWidth(t);
  for (const para of s.split('\n')) {
    let line = '';
    for (const ch of para) {
      if (!line || width(line) + charWidth(ch) <= max) {
        line += ch;
        continue;
      }
      // 从行尾往回挪：下一行不能以标点开头、这一行不能以开括号结尾
      const chars = [...line];
      let cut = chars.length;
      let next = ch;
      while (cut > 1 && (NO_START.includes(next[0]) || NO_END.includes(chars[cut - 1]))) {
        cut--;
        next = chars[cut] + next;
      }
      if (cut <= 1 && NO_START.includes(next[0])) {
        // 实在挪不动（一整行都是标点之类），就照原样断开
        out.push(line);
        line = ch;
        continue;
      }
      out.push(chars.slice(0, cut).join(''));
      line = next;
    }
    out.push(line);
  }
  return out;
}

// 单行放不下就截断，末尾加省略号
export function fit(s: string, max: number): string {
  if (textWidth(s) <= max) return s;
  let out = '';
  for (const ch of s) {
    if (textWidth(out + ch) + charWidth('…') > max) break;
    out += ch;
  }
  return out.replace(/[，、；：（「]+$/, '') + '…';
}
