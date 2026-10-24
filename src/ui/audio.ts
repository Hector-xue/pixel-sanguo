// 声音：音效（方波小芯片音）和背景音乐。曲子用 WebAudio 当场合成，不带音频文件：
// 五声音阶；筝、琵琶、阮是拨弦（Karplus-Strong 算法当场拨出来的弦音，比纯三角波像真弦），笛、箫带气声和颤音，
// 笙铺和声，编钟、大鼓、小鼓、木鱼、板、镲、锣几种打击乐；整体过一道混响（大殿里的那种余音）和压缩，手机外放也听得清。
// 按场景换曲，换的时候淡入淡出。浏览器要先有一次点按才肯出声，所以第一次点屏幕时才真正开始放；切到后台就停
import { MUSIC_GAIN, VOLUME_GAIN, onSettings, settings, trackFor } from './settings';

export type TrackId = 'title' | 'town' | 'field' | 'night' | 'cave' | 'battle' | 'guozhan' | 'boss';
type Voice = 'zheng' | 'pipa' | 'bass' | 'dizi' | 'xiao' | 'sheng' | 'bell' | 'drum';

interface Part {
  voice: Voice;
  // 简谱：1～7 是音，后面 ' 高八度、, 低八度；几个音用 + 连起来是同时弹（和弦）；- 是延长上一个音，. 是休止；
  // 鼓谱 D 大鼓、x 小鼓、o 木鱼、k 板、c 镲、G 锣。| 只是分小节好看
  notes: string;
  // 整体高低几个八度
  oct?: number;
  vol?: number;
  // 左右：-1 最左、1 最右
  pan?: number;
}

interface Track {
  bpm: number;
  // 「1」是哪个音（赫兹）
  root: number;
  parts: Part[];
  // 整首响度：按实测（压缩以后、手机喇叭听得到的那一段频率）拉齐，免得城镇、野外来回走忽大忽小
  gain?: number;
  // 混响送多少（宝洞里空，送得多；战斗紧，送得少）
  wet?: number;
}

const D4 = 293.66;
const C4 = 261.63;
const G4 = 392;
const A3 = 220;

// 笙的和弦：五声音阶里的空五度、四度叠起来（中国乐里很少用三度和弦）
const TRACKS: Record<TrackId, Track> = {
  // 标题：编钟领、筝分解和弦，笙垫底，慢
  title: {
    gain: 1.15, wet: 0.42,
    bpm: 66, root: D4,
    parts: [
      { voice: 'bell', vol: 1.1, notes: '3 - 5 - 6 - - - | 5 - 3 - 2 - - - | 1 - 2 - 3 - 5 - | 2 - - - - - - - | 3 - 5 - 6 - 1\' - | 6 - 5 - 3 - - - | 2 - 3 - 2 - 1 - | 6, - - - 1 - - - |' },
      { voice: 'zheng', oct: -1, vol: 0.7, pan: -0.3, notes: '1 5 1\' 5 3 5 1\' 5 | 6, 3 6 3 1 3 6 3 | 1 5 1\' 5 3 5 1\' 5 | 5, 2 5 2 6, 2 5 2 | 1 5 1\' 5 3 5 1\' 5 | 6, 3 6 3 1 3 6 3 | 2, 6, 2 6, 5, 6, 2 6, | 6, 3 6 3 1 5 1\' - |' },
      { voice: 'sheng', oct: -1, vol: 0.55, pan: 0.25, notes: '1+5+1\' - - - - - - - | 6,+3+6 - - - - - - - | 1+5+1\' - - - - - - - | 5,+2+5 - - - - - - - | 1+5+1\' - - - - - - - | 6,+3+6 - - - - - - - | 2+6+2\' - - - - - - - | 6,+3+6 - - - 1+5+1\' - - - |' },
      { voice: 'bass', oct: -2, vol: 0.7, notes: '1 - - - - - - - | 6, - - - - - - - | 1 - - - - - - - | 5, - - - - - - - | 1 - - - - - - - | 6, - - - - - - - | 2 - - - - - - - | 6, - - - 1 - - - |' },
    ],
  },
  // 城镇：筝领、轻快，琵琶点拍子，木鱼和板打拍
  town: {
    gain: 1.3, wet: 0.3,
    bpm: 100, root: C4,
    parts: [
      // A 段明快，B 段转到羽音上略带惆怅，再回 A
      { voice: 'zheng', pan: -0.15, notes: '5 6 1\' 6 5 3 2 3 | 5 - 3 2 1 - . . | 2 3 5 3 2 1 6, 1 | 2 - - - . . . . | 3 5 6 5 3 2 1 2 | 3 - 5 3 2 - . . | 1 2 3 5 2 3 2 1 | 1 - - - . . . . | 6 1\' 2\' 1\' 6 5 3 5 | 6 - 5 3 2 - . . | 3 5 6 1\' 6 5 3 2 | 3 - - - . . . . | 2 3 5 6 5 3 2 1 | 2 - 3 2 1 - . . | 6, 1 2 3 2 1 6, 5, | 6, - - - . . . . |' },
      { voice: 'pipa', oct: -1, vol: 0.5, pan: 0.35, notes: '. 1 . 5 . 1 . 5 | . 1 . 5 . 1 . 5 | . 6, . 3 . 6, . 3 | . 5, . 2 . 5, . 2 | . 1 . 5 . 1 . 5 | . 6, . 3 . 6, . 3 | . 2 . 6, . 5, . 2 | . 1 . 5 . 1 . . | . 6, . 3 . 6, . 3 | . 5, . 2 . 5, . 2 | . 6, . 3 . 6, . 3 | . 3 . 6 . 3 . 6 | . 2 . 6, . 2 . 6, | . 2 . 6, . 2 . 6, | . 6, . 3 . 6, . 3 | . 6, . 3 . 6, . . |' },
      { voice: 'sheng', oct: -1, vol: 0.32, pan: 0.2, notes: '1+5 - - - - - - - | 1+5 - - - - - - - | 6,+3 - - - - - - - | 5,+2 - - - - - - - | 1+5 - - - - - - - | 6,+3 - - - - - - - | 2+6 - - - - - - - | 1+5 - - - - - - - | 6,+3 - - - - - - - | 5,+2 - - - - - - - | 6,+3 - - - - - - - | 3+6 - - - - - - - | 2+6 - - - - - - - | 2+6 - - - - - - - | 6,+3 - - - - - - - | 6,+3 - - - - - - - |' },
      { voice: 'bass', oct: -2, vol: 0.75, notes: '1 . . . 5, . . . | 1 . . . 5, . . . | 6, . . . 3 . . . | 5, . . . 2 . . . | 1 . . . 5, . . . | 6, . . . 3 . . . | 2 . . . 5, . . . | 1 . . . 1 . . . | 6, . . . 3 . . . | 5, . . . 2 . . . | 6, . . . 3 . . . | 3 . . . 6, . . . | 2 . . . 6, . . . | 2 . . . 5, . . . | 6, . . . 3 . . . | 6, . . . 6, . . . |' },
      { voice: 'drum', vol: 0.55, notes: 'o . . o . . o . | o . . o . . o o | o . . o . . o . | k . . o . o o . |' },
    ],
  },
  // 野外：笛子领，羽调，悠长；筝分解和弦，笙铺底
  field: {
    gain: 0.72, wet: 0.4,
    bpm: 80, root: G4,
    parts: [
      { voice: 'dizi', pan: 0.15, notes: '6, - 1 2 3 - - - | 2 3 5 3 2 - 1 - | 6, - 1 2 3 - 5 - | 6 - - - - - . . | 5 6 1\' 6 5 - 3 - | 2 3 5 3 2 - 1 - | 6, 1 2 3 2 1 6, - | 6, - - - - - . . | 3 - 5 6 1\' - 6 - | 5 6 5 3 2 - 3 - | 5 - 3 2 1 - 2 - | 3 - - - - - . . | 6 - 5 3 5 - 6 - | 1\' - 6 5 3 - 2 - | 1 2 3 5 3 2 1 6, | 6, - - - - - . . |' },
      { voice: 'zheng', oct: -1, vol: 0.55, pan: -0.3, notes: '6, 3 6 3 1 3 6 3 | 2 6 2\' 6 3 6 2\' 6 | 6, 3 6 3 1 3 6 3 | 6, 3 6 1\' 6 3 6, - | 5, 2 5 2 6 2 5 2 | 2 6 2\' 6 3 6 2\' 6 | 3 6 1\' 6 3 6 1\' 6 | 6, 3 6 3 6, - - - | 3 6 1\' 6 3 6 1\' 6 | 5, 2 5 2 6 2 5 2 | 1 3 5 3 1 3 5 3 | 3 6 1\' 6 3 6 3 - | 6, 3 6 3 1 3 6 3 | 1 3 5 3 1 3 5 3 | 1 3 5 3 2 3 6, 3 | 6, 3 6 3 6, - - - |' },
      { voice: 'sheng', oct: -1, vol: 0.38, pan: 0.3, notes: '6,+3 - - - - - - - | 2+6 - - - - - - - | 6,+3 - - - - - - - | 6,+3 - - - - - - - | 5,+2 - - - - - - - | 2+6 - - - - - - - | 3+6 - - - - - - - | 6,+3 - - - - - - - | 3+6 - - - - - - - | 5,+2 - - - - - - - | 1+5 - - - - - - - | 3+6 - - - - - - - | 6,+3 - - - - - - - | 1+5 - - - - - - - | 1+5 - - - - - - - | 6,+3 - - - - - - - |' },
      { voice: 'bass', oct: -2, vol: 0.65, notes: '6, - - - - - - - | 2 - - - - - - - | 6, - - - - - - - | 6, - - - - - - - | 5, - - - - - - - | 2 - - - - - - - | 3 - - - - - - - | 6, - - - - - - - | 3 - - - - - - - | 5, - - - - - - - | 1 - - - - - - - | 3 - - - - - - - | 6, - - - - - - - | 1 - - - - - - - | 1 - - - - - - - | 6, - - - - - - - |' },
    ],
  },
  // 战斗：战鼓、琵琶的急促反复（长音轮指）、笛子在上面，笙压底
  battle: {
    gain: 0.95, wet: 0.2,
    bpm: 152, root: D4,
    parts: [
      { voice: 'pipa', oct: -1, vol: 0.7, pan: -0.3, notes: '6, 6, 1 6, 2 6, 3 2 | 6, 6, 1 6, 5, 6, 1 2 | 6, 6, 1 6, 2 6, 3 5 | 6 5 3 2 1 2 3 - |' },
      { voice: 'dizi', vol: 0.85, pan: 0.2, notes: '6 - - 5 6 - 1\' - | 6 - 5 3 2 - 3 - | 5 - - 3 5 - 6 - | 3 - - - - - . . | 6 - - 5 6 - 1\' 2\' | 1\' - 6 5 3 - 5 - | 6 5 3 2 1 2 3 5 | 6 - - - - - . . | 3\' - 2\' 1\' 6 - 5 - | 6 - 1\' - 6 5 3 - | 5 - 6 - 1\' - 2\' - | 3\' - - - - - . . | 2\' - 1\' 6 5 - 6 - | 1\' - 6 5 3 - 2 - | 3 5 6 1\' 6 5 3 2 | 6, - - - - - . . |' },
      { voice: 'sheng', oct: -1, vol: 0.3, pan: 0.3, notes: '6,+3 - - - - - - - | 6,+3 - - - 1+5 - - - | 6,+3 - - - - - - - | 3+6 - - - 2+6 - - - |' },
      { voice: 'bass', oct: -2, vol: 0.85, notes: '6, . 6, . 6, . 5, . | 6, . 6, . 1 . 2 . | 6, . 6, . 6, . 5, . | 3 . 3 . 2 . 3 . |' },
      { voice: 'drum', notes: 'D . x . D D x . | D . x . D D x x | D . x . D D x . | D . x . D x D x | D . x . D D x . | D . x . D D x x | D . x . D D x . | D x D x D D x x |' },
      { voice: 'drum', vol: 0.7, notes: 'c . . . . . . . | . . . . . . . . | . . . . . . . . | . . . . . . . . | c . . . . . . . | . . . . . . . . | . . . . . . . . | . . . . . . c . |' },
    ],
  },
  // 夜里的野外：箫放慢，筝稀稀落落，偶尔一声钟
  night: {
    gain: 0.72, wet: 0.5,
    bpm: 60, root: A3,
    parts: [
      { voice: 'xiao', oct: 1, vol: 0.85, pan: 0.15, notes: '3 - - - 2 - 1 - | 6, - - - - - - - | 1 - 2 - 3 - 5 - | 3 - - - - - - - | 6 - 5 - 3 - 2 - | 1 - - - 2 - - - | 3 - 2 - 1 - 6, - | 6, - - - - - - - |' },
      { voice: 'zheng', vol: 0.5, pan: -0.3, notes: '6, . . 3 . . 6 . | 6, . . 3 . . 6 . | 1 . . 5 . . 1\' . | 1 . . 5 . . 1\' . | 6, . . 3 . . 6 . | 1 . . 5 . . 1\' . | 2 . . 6 . . 2\' . | 6, . . 3 . . 6 . |' },
      { voice: 'sheng', vol: 0.25, notes: '6,+3 - - - - - - - | 6,+3 - - - - - - - | 1+5 - - - - - - - | 1+5 - - - - - - - | 6,+3 - - - - - - - | 1+5 - - - - - - - | 2+6 - - - - - - - | 6,+3 - - - - - - - |' },
      { voice: 'bell', oct: 1, vol: 0.35, notes: '3 . . . . . . . | . . . . . . . . | . . . . . . . . | . . . . . . . . |' },
    ],
  },
  // 宝洞、古墓：笙低低地长鸣，钟声和木鱼隔很久响一下，偶尔一声闷锣
  cave: {
    gain: 1.6, wet: 0.6,
    bpm: 66, root: D4,
    parts: [
      { voice: 'sheng', oct: -1, vol: 0.5, notes: '6,+3 - - - - - - - | 5,+2 - - - - - - - | 6,+3 - - - - - - - | 3,+6, - - - 2,+6, - - - |' },
      { voice: 'bass', oct: -2, vol: 0.6, notes: '6, - - - - - - - | 5, - - - - - - - | 6, - - - - - - - | 3, - - - 2, - - - |' },
      { voice: 'bell', vol: 0.5, notes: '3 . . . . . 6, . | . . 2 . . . . . | 1 . . . . . 6, . | . . . . . . . . |' },
      { voice: 'drum', vol: 0.6, notes: 'o . . . . . . . | . . . . o . . . | o . . . . . . . | . . . . o . . . | o . . . . . . . | . . . . o . . . | o . . . . . . . | G . . . . . . . |' },
    ],
  },
  // 国战：行军鼓点，笛子吹号，琵琶扫弦
  guozhan: {
    gain: 0.9, wet: 0.25,
    bpm: 112, root: C4,
    parts: [
      { voice: 'drum', notes: 'D . . . D . x . | D . D . D . x x | D . . . D . x . | D . D . D x x x |' },
      { voice: 'drum', vol: 0.6, notes: 'c . . . . . . . | . . . . . . . . | . . . . . . . . | . . . . . . . . |' },
      { voice: 'bass', oct: -2, vol: 0.85, notes: '1 . 1 . 5, . 5, . | 6, . 6, . 5, . 5, . |' },
      { voice: 'pipa', oct: -1, vol: 0.55, pan: -0.3, notes: '1 5 1\' 5 1 5 1\' 5 | 6, 3 6 3 5, 2 5 2 |' },
      { voice: 'sheng', oct: -1, vol: 0.3, pan: 0.3, notes: '1+5 - - - 5,+2 - - - | 6,+3 - - - 5,+2 - - - |' },
      { voice: 'dizi', vol: 0.8, pan: 0.2, notes: '1\' - 5 - 6 - 1\' - | 2\' - 1\' 6 5 - - - | 6 - 5 3 5 - 6 - | 1\' - - - - - . . | 3\' - 2\' 1\' 2\' - 1\' 6 | 5 - 6 - 1\' - 2\' - | 3\' 2\' 1\' 6 5 6 1\' 2\' | 1\' - - - - - . . |' },
    ],
  },
  // 名将、首领：低沉，锣开场，琵琶轮指
  boss: {
    gain: 0.95, wet: 0.28,
    bpm: 128, root: C4,
    parts: [
      { voice: 'bass', oct: -2, vol: 0.95, notes: '6, - 6, 6, 3 - 2 1 | 6, - 6, 6, 1 - 2 3 |' },
      { voice: 'pipa', oct: -1, vol: 0.7, pan: -0.3, notes: '6, . 6, . 3 . 2 1 | 6, . 6, . 5, . 6, . |' },
      { voice: 'sheng', oct: -1, vol: 0.35, pan: 0.3, notes: '6,+3 - - - - - - - | 6,+3 - - - 5,+2 - - - | 6,+3 - - - - - - - | 3+6 - - - 6,+3 - - - |' },
      { voice: 'dizi', vol: 0.8, pan: 0.2, notes: '6 - - - 5 - 3 - | 6 - - - 1\' - 6 - | 5 - 3 - 2 - 3 - | 6, - - - - - . . | 3 - 5 - 6 - 1\' - | 2\' - 1\' - 6 - 5 - | 6 - 5 - 3 - 2 - | 3 - - - - - . . |' },
      { voice: 'drum', notes: 'D . . D x . D . | D . D D x . x x |' },
      { voice: 'drum', vol: 0.8, notes: 'G . . . . . . . | . . . . . . . . | . . . . . . . . | . . . . . . c . |' },
    ],
  },
};

const SEMI: Record<string, number> = { '1': 0, '2': 2, '3': 4, '4': 5, '5': 7, '6': 9, '7': 11 };

interface Step {
  // 音：半音数（相对「1」），和弦是几个半音数；鼓：鼓名；null = 休止或延长
  tone: number | number[] | string | null;
  // 连上后面的延长一共几拍
  len: number;
}

function semitone(tk: string, base: number): number | null {
  const semi = SEMI[tk[0]];
  if (semi === undefined) return null;
  let oct = base;
  for (const ch of tk.slice(1)) oct += ch === "'" ? 1 : ch === ',' ? -1 : 0;
  return semi + oct * 12;
}

function parse(p: Part): Step[] {
  const toks = p.notes.split(/\s+/).filter((x) => x && x !== '|');
  const out: Step[] = toks.map(() => ({ tone: null, len: 1 }));
  toks.forEach((tk, i) => {
    if (tk === '-' || tk === '.') return;
    if (p.voice === 'drum') {
      out[i].tone = tk;
      return;
    }
    const tones = tk.split('+').map((x) => semitone(x, p.oct ?? 0));
    if (tones.some((x) => x === null)) return;
    let len = 1;
    while (toks[i + len] === '-') len++;
    out[i] = { tone: tones.length === 1 ? tones[0] : (tones as number[]), len };
  });
  return out;
}

// ===== 底层 =====
let ctx: AudioContext | null = null;
let chain: Chain | null = null;
let unlocked = false;

// 一套出声的线路：音乐 → 压缩 → 补音量 → 音乐音量；音效 → 音效音量；两路一起过限幅器出去。混响挂在压缩前面
interface Chain {
  musicIn: GainNode;
  reverbIn: AudioNode;
  musicVol: GainNode;
  sfxVol: GainNode;
}

// 压缩以后补多少（按实测：大音量时整首的响度落在 -16 dB 左右，手机外放开一半也听得清）
const MAKEUP = 1.4;

function buildChain(c: BaseAudioContext): Chain {
  const limiter = c.createDynamicsCompressor();
  limiter.threshold.value = -4;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.12;
  // 限幅器起效要一两毫秒，鼓点、拨弦的头一下会冒过去：最后再过一道软削波，冒过去的那点圆滑地压住，不硬切出爆音
  const clip = c.createWaveShaper();
  clip.curve = softClip();
  limiter.connect(clip).connect(c.destination);
  const musicVol = c.createGain();
  musicVol.connect(limiter);
  const sfxVol = c.createGain();
  sfxVol.connect(limiter);
  const glue = c.createDynamicsCompressor();
  glue.threshold.value = -24;
  glue.knee.value = 12;
  glue.ratio.value = 3;
  glue.attack.value = 0.012;
  glue.release.value = 0.3;
  const makeup = c.createGain();
  makeup.gain.value = MAKEUP;
  glue.connect(makeup).connect(musicVol);
  const musicIn = c.createGain();
  musicIn.connect(glue);
  const pre = c.createDelay(0.1);
  pre.delayTime.value = 0.02;
  const rev = c.createConvolver();
  rev.buffer = impulse(c, 2.6);
  pre.connect(rev).connect(glue);
  return { musicIn, reverbIn: pre, musicVol, sfxVol };
}

function softClip(): Float32Array {
  const n = 2048;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const a = Math.abs(x);
    curve[i] = Math.sign(x) * (a <= 0.8 ? a : 0.8 + 0.18 * Math.tanh((a - 0.8) / 0.18));
  }
  return curve;
}

// 混响的回声：两声道各一段越来越暗、越来越轻的噪声
function impulse(c: BaseAudioContext, secs: number): AudioBuffer {
  const sr = c.sampleRate;
  const len = Math.floor(sr * secs);
  const buf = c.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      lp += (Math.random() * 2 - 1 - lp) * (0.7 - 0.6 * t);
      d[i] = lp * Math.pow(1 - t, 2.4) * 0.6;
    }
  }
  return buf;
}

function ensure(): AudioContext | null {
  if (ctx) return ctx;
  try {
    ctx = new AudioContext();
  } catch {
    return null;
  }
  chain = buildChain(ctx);
  applyVolumes();
  return ctx;
}

function applyVolumes(): void {
  if (!ctx || !chain) return;
  const st = settings();
  chain.sfxVol.gain.setTargetAtTime(VOLUME_GAIN[st.sfx], ctx.currentTime, 0.02);
  chain.musicVol.gain.setTargetAtTime(MUSIC_GAIN[st.music], ctx.currentTime, 0.05);
}

// 一个包络：从几乎没声起，attack 秒升到 peak，再按指数衰减到 end 秒
function env(g: GainNode, t: number, peak: number, attack: number, end: number): void {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, end);
}

function tone(out: AudioNode, type: OscillatorType, f: number, t: number, peak: number, attack: number, end: number): OscillatorNode {
  const c = out.context;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  env(g, t, peak, attack, end);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(end + 0.02);
  return o;
}

// ===== 拨弦：Karplus-Strong。一段噪声在一圈延迟里来回滤，高频先没，剩下的就是弦音 =====
// 每把乐器每个音拨一次存起来（22050 采样率、单声道，省内存），以后照着放；音准靠 playbackRate 补齐
interface Pluck {
  bright: number;
  // 余音大约多少秒落到听不见
  t60: number;
  // 存多长
  secs: number;
  // 拨在弦上哪儿（越靠近一头越亮越薄）
  pick: number;
}
const PLUCKS: Record<'zheng' | 'pipa' | 'bass', Pluck> = {
  zheng: { bright: 0.55, t60: 3.2, secs: 2.6, pick: 0.13 },
  pipa: { bright: 0.85, t60: 1.3, secs: 1.3, pick: 0.09 },
  bass: { bright: 0.32, t60: 2.4, secs: 2.2, pick: 0.22 },
};
const PLUCK_SR = 22050;
const pluckCache = new WeakMap<BaseAudioContext, Map<string, { buf: AudioBuffer; f0: number }>>();

function pluckBuf(c: BaseAudioContext, kind: keyof typeof PLUCKS, f: number): { buf: AudioBuffer; rate: number } {
  const midi = Math.round(69 + 12 * Math.log2(f / 440));
  let cache = pluckCache.get(c);
  if (!cache) pluckCache.set(c, (cache = new Map()));
  const key = `${kind}:${midi}`;
  let hit = cache.get(key);
  if (!hit) {
    const P = PLUCKS[kind];
    const fm = 440 * Math.pow(2, (midi - 69) / 12);
    const n = Math.max(2, Math.round(PLUCK_SR / fm - 0.5));
    const len = Math.floor(P.secs * PLUCK_SR);
    const buf = c.createBuffer(1, len, PLUCK_SR);
    const d = buf.getChannelData(0);
    // 激励：滤过的噪声，减去错开一点的自己（拨弦位置的梳状效果）
    const ex = new Float32Array(n);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      lp += (Math.random() * 2 - 1 - lp) * P.bright;
      ex[i] = lp;
    }
    const off = Math.max(1, Math.round(n * P.pick));
    for (let i = 0; i < n; i++) d[i] = ex[i] - 0.6 * ex[(i + off) % n];
    // 每过一圈乘一点衰减，让低音也会停（只靠平均的话低音拖得太长）
    const g = Math.pow(0.001, 1 / (fm * P.t60));
    for (let i = n; i < len; i++) d[i] = g * 0.5 * (d[i - n] + d[i - n - 1 < 0 ? 0 : i - n - 1]);
    let peak = 0;
    for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(d[i]));
    if (peak > 0) for (let i = 0; i < len; i++) d[i] /= peak;
    // 平均那一步多出半个采样的延迟，实际音高是 采样率 ÷ (n + 0.5)
    hit = { buf, f0: PLUCK_SR / (n + 0.5) };
    cache.set(key, hit);
  }
  return { buf: hit.buf, rate: f / hit.f0 };
}

function pluck(out: AudioNode, kind: keyof typeof PLUCKS, t: number, f: number, dur: number, peak: number, vibrato = false): void {
  const c = out.context;
  const { buf, rate } = pluckBuf(c, kind, f);
  const src = c.createBufferSource();
  src.buffer = buf;
  src.playbackRate.setValueAtTime(rate, t);
  const g = c.createGain();
  // 弹完不按住就让它自己响完；后面紧跟着音的话收得快一点，免得糊成一片
  const ring = Math.min(buf.duration / rate, Math.max(0.35, dur * 1.6 + 0.3));
  g.gain.setValueAtTime(peak, t);
  g.gain.setValueAtTime(peak, t + ring - 0.08);
  g.gain.linearRampToValueAtTime(0, t + ring);
  src.connect(g).connect(out);
  // 长音揉弦：过一会儿音高轻轻上下晃
  if (vibrato && dur > 0.55) {
    const lfo = c.createOscillator();
    const depth = c.createGain();
    lfo.frequency.value = 5.2;
    depth.gain.setValueAtTime(0, t);
    depth.gain.linearRampToValueAtTime(rate * 0.007, t + 0.45);
    lfo.connect(depth).connect(src.playbackRate);
    lfo.start(t);
    lfo.stop(t + ring);
  }
  src.start(t);
  src.stop(t + ring + 0.02);
}

// 吹管：正弦打底 + 滤过的锯齿波（管子的泛音）+ 一点气声；起音略低半分再滑到音上，长音带颤音
function wind(out: AudioNode, t: number, f: number, dur: number, vol: number, o: { cutoff: number; breath: number; reed: number }): void {
  const c = out.context;
  const end = t + dur;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.05);
  g.gain.setValueAtTime(vol, Math.max(t + 0.05, end - 0.06));
  g.gain.exponentialRampToValueAtTime(0.0001, end + 0.08);
  g.connect(out);
  const lfo = c.createOscillator();
  const depth = c.createGain();
  lfo.frequency.value = 5.4;
  depth.gain.setValueAtTime(0, t);
  depth.gain.setValueAtTime(0, t + Math.min(0.25, dur * 0.4));
  depth.gain.linearRampToValueAtTime(dur > 0.5 ? 16 : 4, t + Math.min(0.6, dur * 0.8));
  lfo.connect(depth);
  const oscs: OscillatorNode[] = [];
  const voice = (type: OscillatorType, amp: number, filter?: number) => {
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f * 0.985, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.05);
    depth.connect(o.detune);
    const a = c.createGain();
    a.gain.value = amp;
    if (filter) {
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = filter;
      lp.Q.value = 0.6;
      o.connect(lp).connect(a);
    } else o.connect(a);
    a.connect(g);
    oscs.push(o);
  };
  voice('sine', 1);
  voice('sawtooth', o.reed, Math.min(9000, f * o.cutoff));
  for (const x of [...oscs, lfo]) {
    x.start(t);
    x.stop(end + 0.12);
  }
  // 气声：带通噪声，起音那一下重一点
  const src = c.createBufferSource();
  src.buffer = noiseBuf(c);
  src.loop = true;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = Math.min(8000, f * 2);
  bp.Q.value = 1.2;
  const ng = c.createGain();
  ng.gain.setValueAtTime(0.0001, t);
  ng.gain.exponentialRampToValueAtTime(o.breath * 2.5, t + 0.02);
  ng.gain.exponentialRampToValueAtTime(o.breath, t + 0.12);
  ng.gain.setValueAtTime(o.breath, Math.max(t + 0.12, end - 0.06));
  ng.gain.exponentialRampToValueAtTime(0.0001, end + 0.08);
  src.connect(bp).connect(ng).connect(g);
  src.start(t);
  src.stop(end + 0.12);
}

// 笙：几根簧一起响，略微走音（有一点「合唱」的厚度），慢起慢收
function sheng(out: AudioNode, t: number, f: number, dur: number, vol: number): void {
  const c = out.context;
  const end = t + dur;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.18);
  g.gain.setValueAtTime(vol, Math.max(t + 0.18, end - 0.1));
  g.gain.exponentialRampToValueAtTime(0.0001, end + 0.4);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = Math.min(2400, f * 5);
  lp.Q.value = 0.5;
  lp.connect(g).connect(out);
  for (const cents of [-7, 0, 6]) {
    const o = c.createOscillator();
    o.type = cents === 0 ? 'square' : 'sawtooth';
    o.frequency.value = f;
    o.detune.value = cents;
    const a = c.createGain();
    a.gain.value = cents === 0 ? 0.5 : 0.7;
    o.connect(a).connect(lp);
    o.start(t);
    o.stop(end + 0.45);
  }
}

const noiseBufs = new WeakMap<BaseAudioContext, AudioBuffer>();
function noiseBuf(c: BaseAudioContext): AudioBuffer {
  let b = noiseBufs.get(c);
  if (!b) {
    b = c.createBuffer(1, Math.floor(c.sampleRate * 0.6), c.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noiseBufs.set(c, b);
  }
  return b;
}

function play(out: AudioNode, voice: Voice, t: number, f: number, dur: number, vol: number): void {
  if (voice === 'zheng') {
    pluck(out, 'zheng', t, f, dur, 0.34 * vol, true);
  } else if (voice === 'pipa') {
    // 长音轮指：一串急促的轻拨
    if (dur >= 0.45) {
      const n = Math.floor(dur * 13);
      for (let k = 0; k < n; k++) pluck(out, 'pipa', t + k / 13, f, 1 / 13, 0.3 * vol * (k === 0 ? 1 : 0.62 + 0.1 * Math.sin(k)));
    } else pluck(out, 'pipa', t, f, dur, 0.32 * vol);
  } else if (voice === 'bass') {
    // 阮：低音拨弦；再垫一点正弦基音，耳机里听得到低音、手机喇叭里靠拨弦的泛音听得到
    pluck(out, 'bass', t, f, dur, 0.42 * vol);
    tone(out, 'sine', f, t, 0.16 * vol, 0.01, t + dur * 0.95 + 0.15);
  } else if (voice === 'dizi') {
    wind(out, t, f, dur, 0.15 * vol, { cutoff: 3.5, breath: 0.012, reed: 0.22 });
  } else if (voice === 'xiao') {
    wind(out, t, f, dur, 0.15 * vol, { cutoff: 2, breath: 0.02, reed: 0.12 });
  } else if (voice === 'sheng') {
    sheng(out, t, f, dur, 0.05 * vol);
  } else if (voice === 'bell') {
    // 编钟：几个不成整数倍的泛音，各自衰减得不一样快
    tone(out, 'sine', f, t, 0.22 * vol, 0.004, t + 2.8);
    tone(out, 'sine', f * 2.76, t, 0.07 * vol, 0.003, t + 0.9);
    tone(out, 'sine', f * 5.4, t, 0.03 * vol, 0.002, t + 0.35);
    tone(out, 'sine', f * 0.5, t, 0.05 * vol, 0.02, t + 2.2);
  }
}

function noiseHit(out: AudioNode, t: number, type: BiquadFilterType, freq: number, q: number, peak: number, decay: number): void {
  const c = out.context;
  const src = c.createBufferSource();
  src.buffer = noiseBuf(c);
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  env(g, t, peak, 0.002, t + decay);
  src.connect(f).connect(g).connect(out);
  src.start(t);
  src.stop(t + Math.min(0.59, decay + 0.02));
}

function drum(out: AudioNode, kind: string, t: number, vol: number): void {
  const c = out.context;
  if (kind === 'D') {
    // 大鼓：鼓腔的低音往下沉，加上鼓槌打在皮上那一下（手机喇叭里靠它听到鼓点）
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.2);
    env(g, t, 0.6 * vol, 0.003, t + 0.38);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.4);
    tone(out, 'triangle', 190, t, 0.18 * vol, 0.002, t + 0.09);
    noiseHit(out, t, 'lowpass', 1400, 0.7, 0.22 * vol, 0.06);
  } else if (kind === 'x') {
    noiseHit(out, t, 'bandpass', 2200, 0.9, 0.22 * vol, 0.09);
    tone(out, 'triangle', 330, t, 0.08 * vol, 0.002, t + 0.06);
  } else if (kind === 'k') {
    // 板：两块硬木一敲，又短又脆
    noiseHit(out, t, 'bandpass', 3200, 3, 0.3 * vol, 0.035);
    tone(out, 'sine', 1900, t, 0.08 * vol, 0.001, t + 0.03);
  } else if (kind === 'c') {
    // 镲：亮的噪声，慢慢散掉
    noiseHit(out, t, 'highpass', 5000, 0.5, 0.12 * vol, 0.55);
    noiseHit(out, t, 'bandpass', 7500, 1, 0.06 * vol, 0.3);
  } else if (kind === 'o') {
    tone(out, 'sine', 760, t, 0.18 * vol, 0.002, t + 0.08);
    tone(out, 'triangle', 1520, t, 0.05 * vol, 0.002, t + 0.04);
  } else if (kind === 'G') {
    // 锣：几个互相打架的泛音，起得慢一点、拖得很长
    for (const [r, a, d] of [[1, 0.2, 3.2], [1.47, 0.09, 2.4], [1.98, 0.06, 1.8], [2.6, 0.04, 1.2]] as const) tone(out, 'sine', 150 * r, t, a * vol, 0.03, t + d);
    noiseHit(out, t, 'bandpass', 700, 0.8, 0.08 * vol, 0.5);
  }
}

// 排一步的音：轻微错开一点时间、音量有点起伏（不像机器那样一板一眼），每小节第一拍重一点
function scheduleStep(outs: AudioNode[], track: Track, steps: Step[][], i: number, t: number, step: number): void {
  track.parts.forEach((part, k) => {
    const st = steps[k][i % steps[k].length];
    if (st.tone === null) return;
    const human = (Math.random() - 0.5) * 0.012;
    const vel = (part.vol ?? 1) * (0.9 + Math.random() * 0.1) * (i % 8 === 0 ? 1.08 : 1);
    const at = Math.max(t, t + human);
    if (typeof st.tone === 'string') return drum(outs[k], st.tone, at, vel);
    const tones = typeof st.tone === 'number' ? [st.tone] : st.tone;
    // 和弦里的音一个比一个稍晚一点点（像一下扫过去）
    tones.forEach((tn, j) => play(outs[k], part.voice, at + j * 0.012, track.root * Math.pow(2, tn / 12), st.len * step, vel / Math.sqrt(tones.length)));
  });
}

// 每个声部一路：左右声像，再分一份去混响
function partOuts(c: BaseAudioContext, track: Track, gain: GainNode): AudioNode[] {
  return track.parts.map((p) => {
    if (!p.pan || !c.createStereoPanner) return gain;
    const pn = c.createStereoPanner();
    pn.pan.value = p.pan;
    pn.connect(gain);
    return pn;
  });
}

// ===== 背景音乐 =====
interface Playing {
  id: TrackId;
  track: Track;
  steps: Step[][];
  gain: GainNode;
  outs: AudioNode[];
  next: number;
  i: number;
}

let want: TrackId | null = null;
let now: Playing | null = null;
let timer: number | null = null;

function trackGain(c: BaseAudioContext, ch: Chain, track: Track): GainNode {
  const gain = c.createGain();
  gain.connect(ch.musicIn);
  const send = c.createGain();
  send.gain.value = track.wet ?? 0.3;
  gain.connect(send).connect(ch.reverbIn);
  return gain;
}

function startTrack(id: TrackId): void {
  const c = ensure();
  if (!c || !chain) return;
  if (now) {
    const old = now;
    old.gain.gain.setTargetAtTime(0, c.currentTime, 0.25);
    setTimeout(() => old.gain.disconnect(), 1500);
  }
  const track = TRACKS[id];
  const gain = trackGain(c, chain, track);
  gain.gain.setValueAtTime(0, c.currentTime);
  gain.gain.setTargetAtTime(track.gain ?? 1, c.currentTime + 0.1, 0.3);
  now = { id, track, steps: track.parts.map(parse), gain, outs: partOuts(c, track, gain), next: c.currentTime + 0.15, i: 0 };
  timer ??= window.setInterval(tick, 50);
}

// 往前排 0.3 秒的音
function tick(): void {
  if (!ctx || !now || ctx.state !== 'running') return;
  const p = now;
  const step = 60 / p.track.bpm / 2;
  // 切回前台、卡了一下：落下太多就从现在接着排，不一口气补一大串
  if (p.next < ctx.currentTime - 0.5) p.next = ctx.currentTime + 0.05;
  while (p.next < ctx.currentTime + 0.3) {
    scheduleStep(p.outs, p.track, p.steps, p.i, p.next, step);
    p.next += step;
    p.i++;
  }
}

// 场景里调用：换到这个场合的曲子（同一首就接着放；设置里可以给场合换曲或关掉）
let preview: TrackId | null = null;
export function playMusic(id: TrackId): void {
  want = id;
  if (preview) return;
  if (!unlocked || settings().music === 0) return;
  const t = trackFor(id);
  if (!t) return stopMusic();
  if (now?.id === t) return;
  startTrack(t);
}

// 设置里试听：先放这首（null = 停），previewMusic(null, true) 结束试听、回到当前场合
export function previewMusic(id: TrackId | null, done = false): void {
  if (done) {
    preview = null;
    if (want) playMusic(want);
    else stopMusic();
    return;
  }
  preview = id;
  if (!unlocked || settings().music === 0) return;
  if (!id) return stopMusic();
  if (now?.id !== id) startTrack(id);
}

function stopMusic(): void {
  if (!now || !ctx) return;
  const old = now;
  now = null;
  old.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
  setTimeout(() => old.gain.disconnect(), 1200);
}

function unlock(): void {
  const c = ensure();
  if (!c) return;
  if (c.state === 'suspended') void c.resume();
  if (unlocked) return;
  unlocked = true;
  if (want) playMusic(want);
}

if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) void ctx.suspend();
    else if (unlocked) void ctx.resume();
  });
  onSettings(() => {
    applyVolumes();
    if (settings().music === 0) stopMusic();
    else if (want && unlocked) playMusic(want);
  });
}

// ===== 音效 =====
// slash 刀风、thunder 闷雷、drum 战鼓、chime 清铃（进阶招式各配一种）
type ToneKind = 'click' | 'hit' | 'crit' | 'magic' | 'heal' | 'win' | 'lose' | 'step' | 'miss' | 'level' | 'slash' | 'thunder' | 'drum' | 'chime';
// 技能用的噪声音：wind 卷风、fire 烧起来的呼呼声、boom 炸开、whoosh 一下刀风/气浪
type NoiseKind = 'wind' | 'fire' | 'boom' | 'whoosh';
export type SfxKind = ToneKind | NoiseKind;

const NOTES: Record<ToneKind, [number, number, OscillatorType][]> = {
  click: [[880, 0.03, 'square']],
  step: [[330, 0.04, 'triangle']],
  hit: [[180, 0.05, 'square'], [90, 0.06, 'square']],
  crit: [[260, 0.04, 'sawtooth'], [130, 0.05, 'square'], [65, 0.08, 'square']],
  miss: [[600, 0.03, 'triangle'], [500, 0.03, 'triangle']],
  magic: [[660, 0.05, 'triangle'], [990, 0.05, 'triangle'], [1320, 0.08, 'triangle']],
  heal: [[523, 0.06, 'triangle'], [784, 0.1, 'triangle']],
  win: [[523, 0.1, 'square'], [659, 0.1, 'square'], [784, 0.1, 'square'], [1046, 0.25, 'square']],
  lose: [[392, 0.15, 'triangle'], [330, 0.15, 'triangle'], [262, 0.3, 'triangle']],
  level: [[784, 0.08, 'square'], [988, 0.08, 'square'], [1175, 0.2, 'square']],
  slash: [[1400, 0.02, 'sawtooth'], [700, 0.03, 'sawtooth'], [350, 0.05, 'sawtooth'], [175, 0.06, 'square']],
  thunder: [[110, 0.08, 'sawtooth'], [70, 0.12, 'square'], [55, 0.25, 'sawtooth']],
  drum: [[98, 0.07, 'square'], [0, 0.05, 'square'], [98, 0.07, 'square'], [131, 0.12, 'square']],
  chime: [[1046, 0.06, 'triangle'], [1318, 0.06, 'triangle'], [1568, 0.06, 'triangle'], [2093, 0.14, 'triangle']],
};

// [时长秒, 滤波, 起始频率, 结束频率, Q, 音量]：白噪声过一道扫频滤波
const NOISES: Record<NoiseKind, [number, BiquadFilterType, number, number, number, number]> = {
  wind: [1.0, 'bandpass', 400, 1600, 1.4, 1.5],
  fire: [0.8, 'lowpass', 2600, 500, 0.7, 1.0],
  boom: [0.7, 'lowpass', 1200, 60, 0.9, 1.8],
  whoosh: [0.28, 'bandpass', 2800, 600, 1.6, 1.3],
};

function noise(c: AudioContext, out: AudioNode, kind: NoiseKind): void {
  const [d, type, f0, f1, q, vol] = NOISES[kind];
  const t = c.currentTime;
  const src = c.createBufferSource();
  src.buffer = noiseBuf(c);
  src.loop = true;
  const flt = c.createBiquadFilter();
  flt.type = type;
  flt.Q.value = q;
  flt.frequency.setValueAtTime(f0, t);
  flt.frequency.exponentialRampToValueAtTime(f1, t + d);
  const gn = c.createGain();
  const peak = SFX_PEAK * vol;
  gn.gain.setValueAtTime(0.001, t);
  gn.gain.exponentialRampToValueAtTime(peak, t + Math.min(0.06, d * 0.25));
  // 火声一跳一跳的（噼啪）
  if (kind === 'fire') for (let k = 0.08; k < d - 0.1; k += 0.05) gn.gain.setValueAtTime(peak * (0.5 + Math.random() * 0.6), t + k);
  gn.gain.exponentialRampToValueAtTime(0.001, t + d);
  src.connect(flt).connect(gn).connect(out);
  src.start(t, Math.random() * 0.3);
  src.stop(t + d + 0.02);
}

// 小芯片音的响度（背景音乐加了压缩变响以后跟着抬，两边还是差不多）
const SFX_PEAK = 0.3;

export function sfx(kind: SfxKind): void {
  if (settings().sfx === 0) return;
  try {
    const c = ensure();
    if (!c || !chain) return;
    if (kind in NOISES) return noise(c, chain.sfxVol, kind as NoiseKind);
    let t = c.currentTime;
    for (const [f, d, type] of NOTES[kind as ToneKind]) {
      const o = c.createOscillator();
      const gn = c.createGain();
      o.type = type;
      o.frequency.value = f;
      gn.gain.setValueAtTime(SFX_PEAK, t);
      gn.gain.exponentialRampToValueAtTime(0.001, t + d);
      o.connect(gn).connect(chain.sfxVol);
      o.start(t);
      o.stop(t + d);
      t += d;
    }
  } catch {
    // 浏览器不让放声音就算了，不影响游戏
  }
}

// ===== 短乐句：打赢、升级、打输。放一遍就停，放的时候背景音乐压低一点；走音效的音量 =====
export type JingleId = 'win' | 'level' | 'lose';
const JINGLES: Record<JingleId, Track> = {
  win: { bpm: 168, root: C4, gain: 1.3, parts: [
    { voice: 'zheng', notes: "1 3 5 6 5 - 1' - - - - -" },
    { voice: 'bell', vol: 0.8, notes: ". . . . . . 1' - - - - -" },
    { voice: 'sheng', oct: -1, vol: 0.5, notes: ". . . . . . 1+5+1' - - - - -" },
    { voice: 'bass', oct: -2, vol: 0.7, notes: '1 - - - 5, - 1 - - - - -' },
    { voice: 'drum', vol: 0.7, notes: 'D . . . D . D . . . c .' },
  ] },
  level: { bpm: 180, root: D4, parts: [
    { voice: 'bell', notes: "5 6 1' 2' 3' - 5' - - - - -" },
    { voice: 'zheng', oct: -1, vol: 0.6, notes: "1 . 5 . 1' . 3' - - - - -" },
  ] },
  lose: { bpm: 84, root: A3, gain: 0.55, parts: [
    { voice: 'xiao', oct: 1, notes: '3 - 2 - 1 - 6, - - - - -' },
    { voice: 'bass', oct: -1, vol: 0.6, notes: '6, - - - 5, - 6, - - - - -' },
  ] },
};
// 乐句不过压缩，音量另配（每句再乘自己的 gain）：和背景音乐的大小差不多
const JINGLE_GAIN = 2.5;

export function playJingle(id: JingleId): void {
  if (settings().sfx === 0) return;
  const c = ensure();
  if (!c || !chain || c.state !== 'running') return;
  const tr = JINGLES[id];
  const step = 60 / tr.bpm / 2;
  const t0 = c.currentTime + 0.05;
  const out = c.createGain();
  out.gain.value = JINGLE_GAIN * (tr.gain ?? 1);
  out.connect(chain.sfxVol);
  const send = c.createGain();
  send.gain.value = 0.25;
  out.connect(send).connect(chain.reverbIn);
  const steps = tr.parts.map(parse);
  const len = Math.max(...steps.map((x) => x.length));
  const outs = tr.parts.map(() => out);
  for (let i = 0; i < len; i++) scheduleStep(outs, tr, steps, i, t0 + i * step, step);
  // 背景音乐让一让
  if (now) {
    const g = now.track.gain ?? 1;
    now.gain.gain.setTargetAtTime(0.3 * g, c.currentTime, 0.05);
    now.gain.gain.setTargetAtTime(g, t0 + len * step + 0.3, 0.4);
  }
  setTimeout(() => {
    out.disconnect();
    send.disconnect();
  }, (len * step + 4) * 1000);
}

// 离线把一首曲子渲染若干秒，量响度（开发时调各首音量用；也是曲子能不能正常合成出声的检查）
// rms / peak 是整段，phone 是 300 赫兹以上那一段的均方根（手机喇叭基本只出这一段）；单位都是 dB
export async function measureTrack(id: TrackId | JingleId, secs = 20, jingle = false): Promise<{ rms: number; peak: number; phone: number }> {
  const sr = 44100;
  const c = new OfflineAudioContext(2, sr * secs, sr);
  const ch = buildChain(c);
  ch.musicVol.gain.value = 1;
  ch.sfxVol.gain.value = 1;
  const track = jingle ? JINGLES[id as JingleId] : TRACKS[id as TrackId];
  const gain = jingle ? c.createGain() : trackGain(c, ch, track);
  if (jingle) {
    gain.gain.value = JINGLE_GAIN * (track.gain ?? 1);
    gain.connect(ch.sfxVol);
  } else gain.gain.value = track.gain ?? 1;
  const steps = track.parts.map(parse);
  const outs = partOuts(c, track, gain);
  const step = 60 / track.bpm / 2;
  const n = jingle ? Math.max(...steps.map((x) => x.length)) : Math.floor((secs - 1) / step);
  for (let i = 0; i < n; i++) scheduleStep(outs, track, steps, i, 0.05 + i * step, step);
  const buf = await c.startRendering();
  const l = buf.getChannelData(0);
  const r = buf.getChannelData(1);
  let sum = 0;
  let hsum = 0;
  let peak = 0;
  let lp = 0;
  const k = 1 - Math.exp((-2 * Math.PI * 300) / sr);
  // 前一秒不算（淡入、混响还没起来）
  const from = jingle ? 0 : sr;
  for (let i = 0; i < l.length; i++) {
    const x = (l[i] + r[i]) / 2;
    lp += (x - lp) * k;
    if (i < from) continue;
    sum += x * x;
    hsum += (x - lp) * (x - lp);
    peak = Math.max(peak, Math.abs(l[i]), Math.abs(r[i]));
  }
  const cnt = l.length - from;
  const db = (v: number) => Math.round(10 * Math.log10(Math.max(1e-12, v)) * 10) / 10;
  return { rms: db(sum / cnt), peak: db(peak * peak), phone: db(hsum / cnt) };
}

// 测试用：曲谱解析
export const _test = { parse, TRACKS, JINGLES };

// 开发时在浏览器里量音量用
if (typeof window !== 'undefined' && import.meta.env?.DEV) {
  Object.assign(window, { __audio: { ctx: () => ctx, track: () => now?.id ?? null, play: (id: TrackId) => playMusic(id), measure: measureTrack } });
}
