// 声音：音效（方波小芯片音）和背景音乐。曲子用 WebAudio 当场合成，不带音频文件：
// 五声音阶，筝（拨弦）、笛（带颤音的长音）、编钟、低音和战鼓、小鼓、木鱼、锣几种音色；按场景换曲，换的时候淡入淡出。
// 浏览器要先有一次点按才肯出声，所以第一次点屏幕时才真正开始放；切到后台就停
import { VOLUME_GAIN, onSettings, settings } from './settings';

export type TrackId = 'title' | 'town' | 'field' | 'battle' | 'boss';
type Voice = 'zheng' | 'dizi' | 'bell' | 'bass' | 'drum';

interface Part {
  voice: Voice;
  // 简谱：1～7 是音，后面 ' 高八度、, 低八度；- 是延长上一个音，. 是休止；鼓谱 D 大鼓、x 小鼓、o 木鱼、G 锣。| 只是分小节好看
  notes: string;
  // 整体高低几个八度
  oct?: number;
  vol?: number;
}

interface Track {
  bpm: number;
  // 「1」是哪个音（赫兹）
  root: number;
  parts: Part[];
}

const D4 = 293.66;
const C4 = 261.63;
const G4 = 392;

const TRACKS: Record<TrackId, Track> = {
  // 标题：编钟领、筝分解和弦，慢
  title: {
    bpm: 66, root: D4,
    parts: [
      { voice: 'bell', notes: '3 - 5 - 6 - - - | 5 - 3 - 2 - - - | 1 - 2 - 3 - 5 - | 2 - - - - - - - | 3 - 5 - 6 - 1\' - | 6 - 5 - 3 - - - | 2 - 3 - 2 - 1 - | 6, - - - 1 - - - |' },
      { voice: 'zheng', oct: -1, vol: 0.7, notes: '1 5 1\' 5 3 5 1\' 5 | 6, 3 6 3 1 3 6 3 | 1 5 1\' 5 3 5 1\' 5 | 5, 2 5 2 6, 2 5 2 | 1 5 1\' 5 3 5 1\' 5 | 6, 3 6 3 1 3 6 3 | 2, 6, 2 6, 5, 6, 2 6, | 6, 3 6 3 1 5 1\' - |' },
      { voice: 'bass', oct: -2, vol: 0.6, notes: '1 - - - - - - - | 6, - - - - - - - | 1 - - - - - - - | 5, - - - - - - - | 1 - - - - - - - | 6, - - - - - - - | 2 - - - - - - - | 6, - - - 1 - - - |' },
    ],
  },
  // 城镇：筝领、轻快，木鱼打拍
  town: {
    bpm: 100, root: C4,
    parts: [
      { voice: 'zheng', notes: '5 6 1\' 6 5 3 2 3 | 5 - 3 2 1 - . . | 2 3 5 3 2 1 6, 1 | 2 - - - . . . . | 3 5 6 5 3 2 1 2 | 3 - 5 3 2 - . . | 1 2 3 5 2 3 2 1 | 1 - - - . . . . |' },
      { voice: 'zheng', oct: -1, vol: 0.45, notes: '. 1 . 5 . 1 . 5 | . 1 . 5 . 1 . 5 | . 6, . 3 . 6, . 3 | . 5, . 2 . 5, . 2 | . 1 . 5 . 1 . 5 | . 6, . 3 . 6, . 3 | . 2 . 6, . 5, . 2 | . 1 . 5 . 1 - - |' },
      { voice: 'bass', oct: -2, vol: 0.7, notes: '1 . . . 5, . . . | 1 . . . 5, . . . | 6, . . . 3 . . . | 5, . . . 2 . . . | 1 . . . 5, . . . | 6, . . . 3 . . . | 2 . . . 5, . . . | 1 . . . 1 . . . |' },
      { voice: 'drum', vol: 0.5, notes: 'o . . o . . o . |' },
    ],
  },
  // 野外：笛子领，羽调，悠长
  field: {
    bpm: 80, root: G4,
    parts: [
      { voice: 'dizi', notes: '6, - 1 2 3 - - - | 2 3 5 3 2 - 1 - | 6, - 1 2 3 - 5 - | 6 - - - - - . . | 5 6 1\' 6 5 - 3 - | 2 3 5 3 2 - 1 - | 6, 1 2 3 2 1 6, - | 6, - - - - - . . |' },
      { voice: 'zheng', oct: -1, vol: 0.55, notes: '6, 3 6 3 1 3 6 3 | 2 6 2\' 6 3 6 2\' 6 | 6, 3 6 3 1 3 6 3 | 6, 3 6 1\' 6 3 6, - | 5, 2 5 2 6 2 5 2 | 2 6 2\' 6 3 6 2\' 6 | 3 6 1\' 6 3 6 1\' 6 | 6, 3 6 3 6, - - - |' },
      { voice: 'bass', oct: -2, vol: 0.6, notes: '6, - - - - - - - | 2 - - - - - - - | 6, - - - - - - - | 6, - - - - - - - | 5, - - - - - - - | 2 - - - - - - - | 3 - - - - - - - | 6, - - - - - - - |' },
    ],
  },
  // 战斗：战鼓、筝的急促反复、笛子在上面
  battle: {
    bpm: 152, root: D4,
    parts: [
      { voice: 'zheng', oct: -1, vol: 0.75, notes: '6, 6, 1 6, 2 6, 3 2 | 6, 6, 1 6, 5, 6, 1 2 | 6, 6, 1 6, 2 6, 3 5 | 6 5 3 2 1 2 3 . |' },
      { voice: 'dizi', vol: 0.8, notes: '6 - - 5 6 - 1\' - | 6 - 5 3 2 - 3 - | 5 - - 3 5 - 6 - | 3 - - - - - . . | 6 - - 5 6 - 1\' 2\' | 1\' - 6 5 3 - 5 - | 6 5 3 2 1 2 3 5 | 6 - - - - - . . |' },
      { voice: 'bass', oct: -2, vol: 0.8, notes: '6, . 6, . 6, . 5, . | 6, . 6, . 1 . 2 . | 6, . 6, . 6, . 5, . | 3 . 3 . 2 . 3 . |' },
      { voice: 'drum', notes: 'D . x . D D x . | D . x . D D x x |' },
    ],
  },
  // 名将、首领：低沉，锣开场
  boss: {
    bpm: 128, root: C4,
    parts: [
      { voice: 'bass', oct: -2, vol: 0.9, notes: '6, - 6, 6, 3 - 2 1 | 6, - 6, 6, 1 - 2 3 |' },
      { voice: 'zheng', oct: -1, vol: 0.7, notes: '6, . 6, . 3 . 2 1 | 6, . 6, . 5, . 6, . |' },
      { voice: 'dizi', vol: 0.75, notes: '6 - - - 5 - 3 - | 6 - - - 1\' - 6 - | 5 - 3 - 2 - 3 - | 6, - - - - - . . | 3 - 5 - 6 - 1\' - | 2\' - 1\' - 6 - 5 - | 6 - 5 - 3 - 2 - | 3 - - - - - . . |' },
      { voice: 'drum', notes: 'D . . D x . D . | D . D D x . x x |' },
      { voice: 'drum', vol: 0.8, notes: 'G . . . . . . . | . . . . . . . . | . . . . . . . . | . . . . . . . . |' },
    ],
  },
};

const SEMI: Record<string, number> = { '1': 0, '2': 2, '3': 4, '4': 5, '5': 7, '6': 9, '7': 11 };

interface Step {
  // 音：半音数（相对「1」）；鼓：鼓名；null = 休止或延长
  tone: number | string | null;
  // 连上后面的延长一共几拍
  len: number;
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
    const semi = SEMI[tk[0]];
    if (semi === undefined) return;
    let oct = p.oct ?? 0;
    for (const ch of tk.slice(1)) oct += ch === "'" ? 1 : ch === ',' ? -1 : 0;
    let len = 1;
    while (toks[i + len] === '-') len++;
    out[i] = { tone: semi + oct * 12, len };
  });
  return out;
}

// ===== 底层 =====
let ctx: AudioContext | null = null;
let sfxBus: GainNode | null = null;
let musicBus: GainNode | null = null;
let noise: AudioBuffer | null = null;
let unlocked = false;

function ensure(): AudioContext | null {
  if (ctx) return ctx;
  try {
    ctx = new AudioContext();
  } catch {
    return null;
  }
  sfxBus = ctx.createGain();
  sfxBus.connect(ctx.destination);
  musicBus = ctx.createGain();
  musicBus.connect(ctx.destination);
  noise = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  applyVolumes();
  return ctx;
}

function applyVolumes(): void {
  if (!ctx || !sfxBus || !musicBus) return;
  const st = settings();
  sfxBus.gain.setTargetAtTime(VOLUME_GAIN[st.sfx], ctx.currentTime, 0.02);
  musicBus.gain.setTargetAtTime(VOLUME_GAIN[st.music] * 0.3, ctx.currentTime, 0.05);
}

// 一个包络：从几乎没声起，attack 秒升到 peak，再按指数衰减到 end 秒
function env(g: GainNode, t: number, peak: number, attack: number, end: number): void {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, end);
}

function tone(out: AudioNode, type: OscillatorType, f: number, t: number, peak: number, attack: number, end: number): OscillatorNode {
  const c = ctx!;
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

function play(out: AudioNode, voice: Voice, t: number, f: number, dur: number, vol: number): void {
  const c = ctx!;
  if (voice === 'zheng') {
    tone(out, 'triangle', f, t, 0.22 * vol, 0.005, t + Math.max(0.5, dur * 1.3));
    tone(out, 'sine', f * 2, t, 0.06 * vol, 0.004, t + 0.25);
  } else if (voice === 'dizi') {
    const end = t + dur;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(f, t);
    // 颤音：长一点的音过一会儿再抖
    const lfo = c.createOscillator();
    const depth = c.createGain();
    lfo.frequency.value = 5.5;
    depth.gain.setValueAtTime(0, t);
    depth.gain.linearRampToValueAtTime(f * 0.008, t + Math.min(0.4, dur * 0.6));
    lfo.connect(depth).connect(o.frequency);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16 * vol, t + 0.06);
    g.gain.setValueAtTime(0.16 * vol, Math.max(t + 0.06, end - 0.08));
    g.gain.exponentialRampToValueAtTime(0.0001, end + 0.05);
    o.connect(g).connect(out);
    o.start(t);
    lfo.start(t);
    o.stop(end + 0.1);
    lfo.stop(end + 0.1);
    tone(out, 'triangle', f * 2, t, 0.025 * vol, 0.06, end);
  } else if (voice === 'bell') {
    tone(out, 'sine', f, t, 0.2 * vol, 0.004, t + 2.4);
    tone(out, 'sine', f * 2.76, t, 0.05 * vol, 0.003, t + 0.7);
    tone(out, 'sine', f * 5.4, t, 0.02 * vol, 0.002, t + 0.3);
  } else if (voice === 'bass') {
    tone(out, 'triangle', f, t, 0.24 * vol, 0.01, t + dur * 0.95 + 0.12);
  }
}

function drum(out: AudioNode, kind: string, t: number, vol: number): void {
  const c = ctx!;
  if (kind === 'D' || kind === 'G') {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(kind === 'D' ? 110 : 190, t);
    o.frequency.exponentialRampToValueAtTime(kind === 'D' ? 45 : 150, t + (kind === 'D' ? 0.18 : 1.2));
    env(g, t, (kind === 'D' ? 0.5 : 0.22) * vol, 0.004, t + (kind === 'D' ? 0.3 : 1.8));
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 2);
  }
  if (kind === 'x' || kind === 'G') {
    const src = c.createBufferSource();
    src.buffer = noise;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = kind === 'x' ? 1800 : 600;
    bp.Q.value = 0.8;
    const g = c.createGain();
    env(g, t, (kind === 'x' ? 0.18 : 0.12) * vol, 0.002, t + (kind === 'x' ? 0.08 : 1.4));
    src.connect(bp).connect(g).connect(out);
    src.start(t);
    src.stop(t + (kind === 'x' ? 0.1 : 0.5));
  }
  if (kind === 'o') {
    tone(out, 'sine', 760, t, 0.15 * vol, 0.002, t + 0.07);
    tone(out, 'triangle', 1520, t, 0.04 * vol, 0.002, t + 0.04);
  }
}

// ===== 背景音乐 =====
interface Playing {
  id: TrackId;
  track: Track;
  steps: Step[][];
  gain: GainNode;
  next: number;
  i: number;
}

let want: TrackId | null = null;
let now: Playing | null = null;
let timer: number | null = null;

function startTrack(id: TrackId): void {
  const c = ensure();
  if (!c || !musicBus) return;
  if (now) {
    const old = now;
    old.gain.gain.setTargetAtTime(0, c.currentTime, 0.25);
    setTimeout(() => old.gain.disconnect(), 1500);
  }
  const track = TRACKS[id];
  const gain = c.createGain();
  gain.gain.setValueAtTime(0, c.currentTime);
  gain.gain.setTargetAtTime(1, c.currentTime + 0.1, 0.3);
  gain.connect(musicBus);
  now = { id, track, steps: track.parts.map(parse), gain, next: c.currentTime + 0.15, i: 0 };
  timer ??= window.setInterval(tick, 50);
}

// 往前排 0.25 秒的音
function tick(): void {
  if (!ctx || !now || ctx.state !== 'running') return;
  const p = now;
  const step = 60 / p.track.bpm / 2;
  while (p.next < ctx.currentTime + 0.25) {
    p.track.parts.forEach((part, k) => {
      const st = p.steps[k][p.i % p.steps[k].length];
      if (st.tone === null) return;
      const vol = part.vol ?? 1;
      if (typeof st.tone === 'string') drum(p.gain, st.tone, p.next, vol);
      else play(p.gain, part.voice, p.next, p.track.root * Math.pow(2, st.tone / 12), st.len * step, vol);
    });
    p.next += step;
    p.i++;
  }
}

// 场景里调用：换到这首（同一首就接着放）
export function playMusic(id: TrackId): void {
  want = id;
  if (!unlocked || settings().music === 0) return;
  if (now?.id === id) return;
  startTrack(id);
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
export type SfxKind = 'click' | 'hit' | 'crit' | 'magic' | 'heal' | 'win' | 'lose' | 'step' | 'miss' | 'level';

const NOTES: Record<SfxKind, [number, number, OscillatorType][]> = {
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
};

export function sfx(kind: SfxKind): void {
  if (settings().sfx === 0) return;
  try {
    const c = ensure();
    if (!c || !sfxBus) return;
    let t = c.currentTime;
    for (const [f, d, type] of NOTES[kind]) {
      const o = c.createOscillator();
      const gn = c.createGain();
      o.type = type;
      o.frequency.value = f;
      gn.gain.setValueAtTime(0.06, t);
      gn.gain.exponentialRampToValueAtTime(0.001, t + d);
      o.connect(gn).connect(sfxBus);
      o.start(t);
      o.stop(t + d);
      t += d;
    }
  } catch {
    // 浏览器不让放声音就算了，不影响游戏
  }
}

// 测试用：曲谱解析
export const _test = { parse, TRACKS };

// 开发时在浏览器里量音量用
if (typeof window !== 'undefined' && import.meta.env?.DEV) {
  Object.assign(window, { __audio: { ctx: () => ctx, bus: () => musicBus, track: () => now?.id ?? null, play: (id: TrackId) => playMusic(id) } });
}
