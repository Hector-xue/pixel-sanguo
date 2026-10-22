// 野外奇遇：在野外换地点时有一定概率碰上一件事，几个选项，后果各不相同（有的会直接打起来）。
// 奖励按等级走；同一件事有冷却，不会接连碰上。
import { items, locations } from '../data';
import type { MonsterGroup } from '../data';
import { addItem, bagCount, grantPlayerExp, log, playerStats, removeItem, rollRng } from './state';
import type { Save } from './state';

export interface JourneyOutcome {
  who: string;
  lines: string[];
  fight?: MonsterGroup;
}

export interface JourneyChoice {
  label: string;
  disabled?: boolean;
  run: (s: Save) => JourneyOutcome;
}

export interface JourneyEvent {
  id: string;
  who: string;
  lines: string[];
  choices: JourneyChoice[];
}

const CHANCE = 0.2;
const COOLDOWN = 3;

function cheapestDrug(s: Save): string | null {
  const ds = Object.keys(s.bag).filter((id) => items[id]?.cat === 'drug' && (items[id].hp ?? 0) > 0);
  ds.sort((a, b) => (items[a].price ?? 0) - (items[b].price ?? 0));
  return ds[0] ?? null;
}

function exp(s: Save, n: number): string {
  const up = grantPlayerExp(s, n);
  return `经验+${n}${up.length ? '，' + up.join('，') : ''}`;
}

function groupHere(s: Save): MonsterGroup | undefined {
  const g = locations[s.location].groups;
  return g.length ? g[0] : undefined;
}

function events(s: Save): JourneyEvent[] {
  const lv = s.player.level;
  const out: JourneyEvent[] = [];
  const drug = cheapestDrug(s);
  out.push({
    id: 'oldman',
    who: 'elder|受伤的老者',
    lines: ['（路边坐着一位老人，腿上的伤还在渗血。）', '年轻人……能帮帮老朽吗？'],
    choices: [
      { label: drug ? `送他一瓶${items[drug].name}` : '送药（身上没有药）', disabled: !drug, run: (s2) => {
        removeItem(s2, drug!, 1);
        const rng = rollRng(s2);
        const lines = ['好人有好报。老朽年轻时也走过江湖，教你两手。', `（${exp(s2, lv * 25)}）`];
        if (rng.chance(0.5)) {
          addItem(s2, 'xinfa1', 1);
          lines.push('（老人塞给你一本常人心法。）');
        }
        return { who: 'elder|受伤的老者', lines };
      } },
      { label: '扶他到树下歇息', run: (s2) => ({ who: 'elder|受伤的老者', lines: ['多谢，多谢。乱世里还有你这样的人。', `（${exp(s2, lv * 8)}）`] }) },
      { label: '赶路要紧', run: () => ({ who: '', lines: ['（你没有停下脚步。身后传来一声叹息。）'] }) },
    ],
  });
  out.push({
    id: 'chest',
    who: '',
    lines: ['（草丛里露出一只破木箱，箱角包着铁皮，锁已经锈了。）'],
    choices: [
      { label: '撬开看看', run: (s2) => {
        const rng = rollRng(s2);
        const g = groupHere(s2);
        if (g && rng.chance(0.3)) return { who: '', lines: ['（箱子是空的——草丛里窜出一伙人，原来是个圈套！）'], fight: g };
        const silver = rng.int(lv * 10, lv * 30);
        s2.player.silver += silver;
        const lines = [`（箱底压着一包碎银，银两+${silver}。）`];
        if (rng.chance(0.35)) {
          addItem(s2, 'tiekuang', 2);
          lines.push('（还有两块铁矿石。）');
        }
        return { who: '', lines };
      } },
      { label: '不碰为妙', run: () => ({ who: '', lines: ['（来路不明的东西，还是别碰了。）'] }) },
    ],
  });
  const cost = lv * 5;
  out.push({
    id: 'doctor',
    who: 'pedant|游方郎中',
    lines: ['这位侠士，面有倦色啊。老夫游方行医，给你瞧瞧？', `（诊金${cost}两）`],
    choices: [
      { label: `请他看看（${cost}两）`, disabled: s.player.silver < cost, run: (s2) => {
        s2.player.silver -= cost;
        const st = playerStats(s2);
        s2.player.hp = st.maxHp;
        s2.player.mp = st.maxMp;
        return { who: 'pedant|游方郎中', lines: ['几针下去，气血精力都回来了。', '（气血、精力全满。）'] };
      } },
      { label: '不必了', run: () => ({ who: 'pedant|游方郎中', lines: ['好好，有缘再会。'] }) },
    ],
  });
  const g = groupHere(s);
  if (g) {
    const toll = lv * 15;
    out.push({
      id: 'robbers',
      who: 'bandit|拦路的山贼',
      lines: ['站住！此山是我开，此树是我栽——', `要想从此过，留下${toll}两买路钱！`],
      choices: [
        { label: `给他${toll}两`, disabled: s.player.silver < toll, run: (s2) => {
          s2.player.silver -= toll;
          return { who: 'bandit|拦路的山贼', lines: ['算你识相，走吧走吧。'] };
        } },
        { label: '动手', run: () => ({ who: 'bandit|拦路的山贼', lines: ['敬酒不吃吃罚酒！弟兄们，上！'], fight: g }) },
      ],
    });
  }
  out.push({
    id: 'traveler',
    who: 'refugee|迷路的旅人',
    lines: ['请问……往许昌是这条路吗？我在这山里转了一天了。'],
    choices: [
      { label: '给他指路', run: (s2) => ({ who: 'refugee|迷路的旅人', lines: ['原来如此！多谢恩公。', `（${exp(s2, lv * 12)}）`] }) },
      { label: '陪他走一段', run: (s2) => {
        const rng = rollRng(s2);
        const silver = rng.int(lv * 5, lv * 12);
        s2.player.silver += silver;
        return { who: 'refugee|迷路的旅人', lines: ['一路说说笑笑，到了岔口他硬塞给你一点盘缠。', `（银两+${silver}，${exp(s2, lv * 6)}）`] };
      } },
    ],
  });
  out.push({
    id: 'spring',
    who: '',
    lines: ['（山石缝里淌出一股清泉，水凉得刺骨。）'],
    choices: [
      { label: '喝几口', run: (s2) => {
        const st = playerStats(s2);
        s2.player.mp = st.maxMp;
        s2.player.hp = Math.min(st.maxHp, s2.player.hp + Math.round(st.maxHp * 0.3));
        return { who: '', lines: ['（一口下去，神清气爽。精力全满，气血回了三成。）'] };
      } },
      { label: '装一壶带走', run: (s2) => {
        addItem(s2, 'qingquan', 1);
        return { who: '', lines: ['（你装了一壶，得到清泉液×1。）'] };
      } },
    ],
  });
  out.push({
    id: 'herb',
    who: '',
    lines: ['（树根底下长着一丛止血草，叶子上还带着露水。）'],
    choices: [
      { label: '采下来', run: (s2) => {
        const n = rollRng(s2).int(1, 2);
        addItem(s2, 'zhixue', n);
        return { who: '', lines: [`（得到止血药×${n}。）`] };
      } },
      { label: '留给后来人', run: (s2) => ({ who: '', lines: ['（你没有动它。心里却踏实了些。）', `（${exp(s2, lv * 4)}）`] }) },
    ],
  });
  out.push({
    id: 'fortune',
    who: 'strategist|算命先生',
    lines: ['铁口直断，不准不要钱！侠士来一卦？', '（卦金10两）'],
    choices: [
      { label: '算一卦（10两）', disabled: s.player.silver < 10, run: (s2) => {
        s2.player.silver -= 10;
        const rng = rollRng(s2);
        const r = rng.next();
        if (r < 0.2) {
          s2.player.silver += 50;
          return { who: 'strategist|算命先生', lines: ['大吉！侠士财星高照——这卦金，老朽退你五倍！', '（银两+50）'] };
        }
        if (r < 0.6) {
          addItem(s2, 'tilidan', 1);
          return { who: 'strategist|算命先生', lines: ['中吉。前路虽有坎坷，贵人自来。这颗丹药拿着。', '（得到体力丹×1）'] };
        }
        return { who: 'strategist|算命先生', lines: ['小凶……近日出门，多带几瓶药。', '（你摸了摸药囊。）'] };
      } },
      { label: '不信这个', run: () => ({ who: 'strategist|算命先生', lines: ['命里有时终须有，命里无时莫强求啊。'] }) },
    ],
  });
  return out;
}

// 走到一个新地方时调用：城镇不触发；有冷却；按 seen 次数降低重复概率
export function rollJourney(s: Save): JourneyEvent | null {
  const loc = locations[s.location];
  if (!loc || loc.town) return null;
  const j = s.p5.journey;
  if (j.cooldown > 0) {
    j.cooldown--;
    return null;
  }
  const rng = rollRng(s);
  if (!rng.chance(CHANCE)) return null;
  const pool = events(s);
  const weights = pool.map((e) => 1 / (1 + (j.seen[e.id] ?? 0)));
  let r = rng.next() * weights.reduce((a, b) => a + b, 0);
  let ev = pool[0];
  for (let i = 0; i < pool.length; i++) if ((r -= weights[i]) < 0) {
    ev = pool[i];
    break;
  }
  j.seen[ev.id] = (j.seen[ev.id] ?? 0) + 1;
  j.cooldown = COOLDOWN;
  log(s, `【奇遇】在${loc.name}碰上了一件事`);
  return ev;
}

export function drugCount(s: Save): number {
  return Object.keys(s.bag).filter((id) => items[id]?.cat === 'drug').reduce((a, id) => a + bagCount(s, id), 0);
}
