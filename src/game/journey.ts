// 野外奇遇：在野外换地点时有一定概率碰上一件事，几个选项，后果各不相同（有的会直接打起来）。
// 奖励按等级走；同一件事有冷却，不会接连碰上。
import { items, locations, npcs, skills } from '../data';
import type { MonsterGroup } from '../data';
import { daypart } from '../art/props';
import { FAVOR_MAX, favorOf, tierName } from './bond';
import { giveRandomRecruit } from './generals';
import { addItem, addProf, bagCount, grantPlayerExp, log, playerStats, removeItem, rollRng } from './state';
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

// 货郎卖的药：等级够得着的里面最贵的一种
function peddlerDrug(lv: number): string {
  const ds = Object.keys(items).filter((id) => items[id].cat === 'drug' && (items[id].hp ?? 0) > 0 && !items[id].quest && !items[id].cook && items[id].price > 0);
  ds.sort((a, b) => items[a].price - items[b].price);
  const fit = ds.filter((id) => items[id].price <= Math.max(30, lv * 15));
  return fit[fit.length - 1] ?? ds[0];
}

function events(s: Save): JourneyEvent[] {
  const lv = s.player.level;
  const out: JourneyEvent[] = [];
  const art = locations[s.location].art;
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
          return { who: 'strategist|算命先生', lines: ['中吉。前路虽有坎坷，贵人自来。这颗丹药拿着，危急时服下。', '（得到体力丹×1）'] };
        }
        return { who: 'strategist|算命先生', lines: ['小凶……近日出门，多带几瓶药。', '（你摸了摸药囊。）'] };
      } },
      { label: '不信这个', run: () => ({ who: 'strategist|算命先生', lines: ['命里有时终须有，命里无时莫强求啊。'] }) },
    ],
  });
  // ===== 第二批：货郎、难民、落难武人、夜里篝火、按地形的几件、熟人偶遇 =====
  const pd = peddlerDrug(lv);
  const price = Math.max(1, Math.floor(items[pd].price / 2)) * 3;
  out.push({
    id: 'peddler',
    who: 'gentry|行脚货郎',
    lines: ['走过路过别错过！刚从城里进的货，半价出手——', `（${items[pd].name}×3，${price}两）`],
    choices: [
      { label: `买下（${price}两）`, disabled: s.player.silver < price, run: (s2) => {
        s2.player.silver -= price;
        const lost = addItem(s2, pd, 3);
        return { who: 'gentry|行脚货郎', lines: ['爽快！下回还找我。', lost ? `（负重满了，只拿到${3 - lost}个${items[pd].name}。）` : `（得到${items[pd].name}×3。）`] };
      } },
      { label: '看看就走', run: () => ({ who: 'gentry|行脚货郎', lines: ['唉，生意难做啊……'] }) },
    ],
  });
  const alms = lv * 8;
  out.push({
    id: 'refugees',
    who: 'refugee|逃难的百姓',
    lines: ['（一家老小推着独轮车，孩子饿得直哭。）', '侠士……行行好，给口吃的吧。'],
    choices: [
      { label: `分他们${alms}两盘缠`, disabled: s.player.silver < alms, run: (s2) => {
        s2.player.silver -= alms;
        return { who: 'refugee|逃难的百姓', lines: ['恩公大恩，来世做牛做马也要报答！', `（${exp(s2, lv * 30)}）`] };
      } },
      { label: '护送他们一程', run: (s2) => {
        const g = groupHere(s2);
        if (g && rollRng(s2).chance(0.5)) return { who: 'refugee|逃难的百姓', lines: ['（没走多远，林子里钻出一伙歹人，直奔独轮车来！）'], fight: g };
        return { who: 'refugee|逃难的百姓', lines: ['（一路平安，到了岔口，老汉千恩万谢。）', `（${exp(s2, lv * 15)}）`] };
      } },
      { label: '爱莫能助', run: () => ({ who: '', lines: ['（你别过脸去，加快了脚步。）'] }) },
    ],
  });
  if (lv >= 20) {
    const d2 = cheapestDrug(s);
    out.push({
      id: 'fallen',
      who: 'cavalry|落难的武人',
      lines: ['（一个披甲的汉子倒在路边，战马早没了，刀还攥在手里。）', '某家……兵败至此。壮士若肯相救，此身任凭驱使。'],
      choices: [
        { label: d2 ? `给他敷药（${items[d2].name}）` : '给他敷药（身上没有药）', disabled: !d2, run: (s2) => {
          removeItem(s2, d2!, 1);
          if (rollRng(s2).chance(0.4)) {
            const line = giveRandomRecruit(s2, '英才');
            return { who: 'cavalry|落难的武人', lines: ['救命之恩，无以为报。某愿追随左右！', `（${line || '他说日后定来相投。'}）`] };
          }
          return { who: 'cavalry|落难的武人', lines: ['多谢壮士。某还有家小，就此别过——日后必报！', `（${exp(s2, lv * 20)}）`] };
        } },
        { label: '问他从哪来', run: (s2) => ({ who: 'cavalry|落难的武人', lines: ['前头的营寨守得紧，壮士若要过去，多带些人手。', `（${exp(s2, lv * 6)}）`] }) },
      ],
    });
  }
  if (daypart() === 'night') {
    out.push({
      id: 'campfire',
      who: 'elder|守夜的老兵',
      lines: ['（夜深了，路边一堆篝火，一个老兵在烤干粮。）', '坐下暖暖吧，夜里赶路不安生。'],
      choices: [
        { label: '坐下歇一宿', run: (s2) => {
          const st = playerStats(s2);
          s2.player.hp = st.maxHp;
          s2.player.mp = st.maxMp;
          return { who: 'elder|守夜的老兵', lines: ['（老兵讲了半宿当年的仗，你听着听着睡着了。）', '（气血、精力全满。）'] };
        } },
        { label: '听他讲讲打仗', run: (s2) => ({ who: 'elder|守夜的老兵', lines: ['打仗啊，先保命，再立功。冲在最前头的，坟头草都三尺了。', `（${exp(s2, lv * 18)}）`] }) },
      ],
    });
  }
  if (art === 'cave' || art === 'tomb') {
    out.push({
      id: 'cache',
      who: '',
      lines: ['（石壁上有一块砖颜色不太一样，敲上去是空的。）'],
      choices: [
        { label: '撬开暗格', run: (s2) => {
          const rng = rollRng(s2);
          if (rng.chance(0.25)) {
            const st = playerStats(s2);
            const dmg = Math.round(st.maxHp * 0.2);
            s2.player.hp = Math.max(1, s2.player.hp - dmg);
            return { who: '', lines: ['（咔哒一声，暗格里射出几枚毒针！）', `（气血-${dmg}）`] };
          }
          if (rng.chance(0.4)) {
            addItem(s2, 'zhenkuang', 1);
            return { who: '', lines: ['（暗格里裹着一块沉甸甸的石头——宝石珍矿！）'] };
          }
          const silver = rng.int(lv * 20, lv * 40);
          s2.player.silver += silver;
          return { who: '', lines: [`（一包发霉的布袋，里面是前人藏的银子。银两+${silver}。）`] };
        } },
        { label: '不动它', run: () => ({ who: '', lines: ['（墓里的东西，还是少碰为妙。）'] }) },
      ],
    });
  }
  if (art === 'river' || art === 'marsh') {
    out.push({
      id: 'fisher',
      who: 'elder|垂钓的渔翁',
      lines: ['（水边一位渔翁戴着斗笠，钓竿半天没动。）', '年轻人，这水里的鱼和江湖里的人一样，急不得。'],
      choices: [
        { label: '陪他钓一会儿', run: (s2) => {
          const st = playerStats(s2);
          s2.player.hp = Math.min(st.maxHp, s2.player.hp + Math.round(st.maxHp * 0.5));
          return { who: 'elder|垂钓的渔翁', lines: ['（钓上来一尾鲤鱼，渔翁就地烤了分你一半。）', '（气血回了五成。）', `（${exp(s2, lv * 10)}）`] };
        } },
        { label: '请教几句', run: (s2) => ({ who: 'elder|垂钓的渔翁', lines: ['打不过就退，退了再来。鱼咬钩也不是一回就咬实的。', `（${exp(s2, lv * 14)}）`] }) },
      ],
    });
  }
  if (art === 'camp' || art === 'gate' || art === 'pass') {
    const bounty = lv * 20;
    out.push({
      id: 'deserter',
      who: 'soldier|逃兵',
      lines: ['（草丛里蹲着一个小兵，号衣都扯破了，见了你直哆嗦。）', '别、别抓我！家里老娘病着，我是要回去看她……'],
      choices: [
        { label: '放他走', run: (s2) => ({ who: 'soldier|逃兵', lines: ['谢谢恩人！这块腰牌给你，营里认它。', `（${exp(s2, lv * 16)}）`] }) },
        { label: '押回营里', run: (s2) => {
          s2.player.silver += bounty;
          return { who: 'soldier|逃兵', lines: ['（军曹赏了你几两银子，那小兵被拖走时一直回头看你。）', `（银两+${bounty}）`] };
        } },
      ],
    });
  }
  if ((art === 'ruins' || art === 'altar' || art === 'manor') && s.player.skills.length) {
    out.push({
      id: 'stele',
      who: '',
      lines: ['（半截残碑倒在荒草里，上面刻着几行看不太清的字，像是兵法。）'],
      choices: [
        { label: '拓下来细看（20两买纸墨）', disabled: s.player.silver < 20, run: (s2) => {
          s2.player.silver -= 20;
          const rng = rollRng(s2);
          const st = rng.pick(s2.player.skills);
          const before = st.prof;
          addProf(st, 20 + lv * 2);
          return { who: '', lines: [`（琢磨了一下午，对「${skills[st.id].name}」有了新的体会。）`, `（熟练度+${st.prof - before}${st.prof === before ? '，已到本级上限' : ''}）`] };
        } },
        { label: '看两眼就走', run: (s2) => ({ who: '', lines: ['（字迹斑驳，你只认出「兵者，诡道也」几个字。）', `（${exp(s2, lv * 5)}）`] }) },
      ],
    });
  }
  // 熟人偶遇：交情到「熟络」的人，会在野外碰上你，送点东西，交情再涨一点
  const friends = Object.keys(s.p5.favor).filter((id) => npcs[id] && favorOf(s, id) >= 30);
  if (friends.length) {
    const fid = friends[Math.floor((s.player.level * 7 + s.battles) % friends.length)];
    const n = npcs[fid];
    out.push({
      id: 'friend',
      who: fid,
      lines: [`哎呀，这不是{name}吗？在这荒郊野外也能碰上！`, '正好，我这儿有点东西，你拿着路上用。'],
      choices: [
        { label: '多谢！', run: (s2) => {
          const rng = rollRng(s2);
          const silver = rng.int(lv * 15, lv * 30);
          s2.player.silver += silver;
          s2.p5.favor[fid] = Math.min(FAVOR_MAX, favorOf(s2, fid) + 3);
          const lines = [`（${n.name}塞给你${silver}两盘缠。交情+3，现在是「${tierName(s2, fid)}」。）`];
          if (rng.chance(0.4)) {
            addItem(s2, 'baoxiang', 1);
            lines.push('（还有一只宝箱。）');
          }
          return { who: fid, lines: ['客气什么，咱们谁跟谁。', ...lines] };
        } },
        { label: '一起走一段', run: (s2) => {
          s2.p5.favor[fid] = Math.min(FAVOR_MAX, favorOf(s2, fid) + 5);
          return { who: fid, lines: ['（你们边走边聊，说了好多城里的新鲜事。）', `（交情+5，现在是「${tierName(s2, fid)}」。${exp(s2, lv * 12)}）`] };
        } },
      ],
    });
  }
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
