// NPC 好感：每天能闲聊一次（听点江湖传闻），能送礼（每人每天三次）；好感到一档，对方回一份谢礼。
// 每个 NPC 偏好一类东西（药 / 矿 / 杂物），送对了好感翻倍。
import { items, locations, npcs } from '../data';
import { currentQuest, addItem, log, removeItem, rollRng } from './state';
import { today, tomorrowHint } from './calendar';
import type { Save } from './state';
import { lifeDefaults } from './life';
import type { LifeState } from './life';

export interface P5State {
  favor: Record<string, number>;
  chatDay: Record<string, string>;
  gifts: Record<string, string>;
  tierGot: Record<string, number>;
  journey: { cooldown: number; seen: Record<string, number> };
  // 已领的战备补给份数
  supply: number;
  // 生活技能
  life: LifeState;
  // 阵法
  formation: string;
  // 找到的徽章（地点 → 1）
  badges: Record<string, number>;
}

export function p5Defaults(): P5State {
  return { favor: {}, chatDay: {}, gifts: {}, tierGot: {}, journey: { cooldown: 1, seen: {} }, supply: 0, life: lifeDefaults(), formation: 'changshe', badges: {} };
}

export const TIERS: { at: number; name: string }[] = [
  { at: 0, name: '陌生' }, { at: 10, name: '相识' }, { at: 30, name: '熟络' }, { at: 60, name: '知己' }, { at: 100, name: '莫逆' },
];
export const FAVOR_MAX = 120;
export const GIFTS_PER_DAY = 3;

export function favorOf(s: Save, id: string): number {
  return s.p5.favor[id] ?? 0;
}

export function tierOf(v: number): number {
  let t = 0;
  TIERS.forEach((x, i) => {
    if (v >= x.at) t = i;
  });
  return t;
}

export function tierName(s: Save, id: string): string {
  return TIERS[tierOf(favorOf(s, id))].name;
}

function hash(s: string): number {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

const CATS = ['drug', 'ore', 'misc'] as const;
const CAT_NAME: Record<string, string> = { drug: '药材丹药', ore: '矿石', misc: '稀罕物件' };
export function likedCat(id: string): string {
  return CATS[hash(id) % CATS.length];
}
export function likedText(id: string): string {
  return CAT_NAME[likedCat(id)];
}

// 送一件东西能涨多少好感：按价钱取对数，没有标价的稀罕物另算
const SPECIAL: Record<string, number> = {
  baoxiang: 6, gaojibaoxiang: 10, tilidan: 4, xinfa1: 3, xinfa2: 6, xinfa3: 9, jiangjunling: 10, dajiangjunling: 15, jinengshu: 8, zhusun: 2, junzi: 3,
  // 亲手做的菜：送人最见心意
  cai_yaozhou: 2, cai_kaoyu: 3, cai_yutang: 5, cai_yaoshan: 5, cai_guiyu: 7, cai_shentang: 8, cai_ligeng: 9, cai_jinlin: 12,
};
export function giftValue(itemId: string): number {
  const it = items[itemId];
  if (!it || it.quest) return 0;
  const base = SPECIAL[itemId] ?? Math.max(1, Math.min(10, Math.round(Math.log2((it.price ?? 0) + 1))));
  return base;
}

export function giftable(s: Save): string[] {
  return Object.keys(s.bag).filter((id) => giftValue(id) > 0 && (s.bag[id] ?? 0) > 0);
}

export function giftsLeftToday(s: Save, id: string): number {
  const [day, n] = (s.p5.gifts[id] ?? '').split(':');
  return day === today(s) ? Math.max(0, GIFTS_PER_DAY - Number(n || 0)) : GIFTS_PER_DAY;
}

// 好感跨过新的一档：第一次到才给谢礼
function addFavor(s: Save, id: string, n: number): string[] {
  const before = favorOf(s, id);
  const after = Math.min(FAVOR_MAX, before + n);
  s.p5.favor[id] = after;
  const out: string[] = [];
  const t = tierOf(after);
  const got = s.p5.tierGot[id] ?? 0;
  for (let k = got + 1; k <= t; k++) {
    out.push(...tierReward(s, id, k));
    s.p5.tierGot[id] = k;
  }
  return out;
}

function tierReward(s: Save, id: string, tier: number): string[] {
  const name = npcs[id]?.name ?? '对方';
  const lv = s.player.level;
  const rewards: [number, Record<string, number>][] = [
    [0, {}],
    [100 + lv * 10, {}],
    [300 + lv * 20, { baoxiang: 1 }],
    [600 + lv * 30, { xinfa2: 1, gaojibaoxiang: 1 }],
    [2000 + lv * 50, { jiangjunling: 1 }],
  ];
  const [silver, its] = rewards[tier];
  s.player.silver += silver;
  const got = [`银两${silver}`];
  for (const [it, n] of Object.entries(its)) {
    addItem(s, it, n);
    got.push(`${items[it].name}×${n}`);
  }
  const line = `和${name}的交情到了「${TIERS[tier].name}」，${name}回赠${got.join('、')}`;
  log(s, line);
  return [line];
}

export interface GiftResult {
  ok: boolean;
  gain: number;
  liked: boolean;
  lines: string[];
}

export function giveGift(s: Save, npcId: string, itemId: string): GiftResult {
  if (giftsLeftToday(s, npcId) <= 0) return { ok: false, gain: 0, liked: false, lines: [`今天已经送过好几回了（${tomorrowHint(s)}）`] };
  const v = giftValue(itemId);
  if (!v || !removeItem(s, itemId, 1)) return { ok: false, gain: 0, liked: false, lines: ['这个送不出手'] };
  const liked = items[itemId].cat === likedCat(npcId);
  const gain = liked ? v * 2 : v;
  const [day, n] = (s.p5.gifts[npcId] ?? '').split(':');
  s.p5.gifts[npcId] = `${today(s)}:${day === today(s) ? Number(n || 0) + 1 : 1}`;
  const lines = addFavor(s, npcId, gain);
  return { ok: true, gain, liked, lines };
}

// 江湖传闻：一半是闲话，一半在提示下一步去哪儿
const RUMORS = [
  '听说跑环使者那儿的活儿，做满一轮能拿技能书。',
  '钱庄的存款每天都有利息，闲钱别揣在身上。',
  '野外打残了的怪物，用「招降」就能收成副将。',
  '医馆十级以前不收钱，受了伤赶紧去治。',
  '军马场的好马能加速度，打仗先出手。',
  '宝库里能买将军令，拿去招贤使者那儿换个英才。',
  '赶路的时候多留神，路上常有奇遇，好事坏事都有。',
  '这几天夜里，营寨那边的火光一直不灭。',
  '孔庙的夫子收徒，拜了师打仗经验多一成。',
  '副将的忠诚要天天赏，低了打仗不听话。',
];

export interface ChatResult {
  first: boolean;
  gain: number;
  text: string;
  lines: string[];
}

export function chatWith(s: Save, npcId: string): ChatResult {
  const rng = rollRng(s);
  const q = currentQuest(s);
  let text = rng.pick(RUMORS);
  if (q && rng.chance(0.4)) {
    const at = q.target?.at ? locations[q.target.at]?.name : undefined;
    text = at ? `你要办的事？往${at}那边去看看。${q.hint}` : `你要办的事？${q.hint}`;
  }
  const day = today(s);
  if (s.p5.chatDay[npcId] === day) return { first: false, gain: 0, text, lines: [] };
  s.p5.chatDay[npcId] = day;
  const gain = rng.int(2, 4);
  const lines = addFavor(s, npcId, gain);
  return { first: true, gain, text, lines };
}
