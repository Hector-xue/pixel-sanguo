// 福利（江湖行记、战备补给、节日）、招贤、跑环、挖宝的对话，以及杂物的使用（宝箱、心法书、技能书……）
import { C } from '../art/palette';
import { avatarTex, iconTex } from '../art/textures';
import { classes, items, skills, systems } from '../data';
import type { Reward } from '../data';
import { randomSeed } from '../core/rng';
import { digOnce, guardBattle, nextIsGuard, startDig, buyShovel } from '../game/dig';
import type { General } from '../game/state';
import { bagCount, profCap, skillLevelText } from '../game/state';
import { allGenerals, generalLearn, generalSkillRows, generalUpgrade, readXinfa, recruitOptions, recruitWith } from '../game/generals';
import { abandonRing, nextRing, openTiers, ringOpen, ringStatusText, taskDone, tierName, turnInRing, RING_ROUNDS } from '../game/ring';
import { store } from '../game/store';
import {
  MILESTONES, SUPPLY_CAP, SUPPLY_EVERY, claimMilestone, claimSupply, eatPill, nextSupply, openBox, openGemOre, readSkillBook, readSkillBookGeneral,
  supplyNext, suppliesReady,
} from '../game/welfare';
import { showDialog } from './dialog';
import { festivalBlock } from './p3';
import type { Host } from './panels';
import { done } from './panels';
import { Button, Modal, ScrollArea, confirm, frame, sfx, text, toast } from './widgets';

function rewardText(r: Reward): string {
  const parts: string[] = [];
  if (r.silver) parts.push(`银两${r.silver}`);
  if (r.gold) parts.push(`金砖${r.gold}`);
  for (const [id, n] of Object.entries(r.items ?? {})) parts.push(`${items[id].name}×${n}`);
  if (r.general) parts.push(r.general === 'daqiao' ? '将才·大乔' : '副将');
  return parts.join('、');
}

// ===== 福利：江湖行记（里程碑）+ 战备补给（按场次）+ 节日 =====
let welfareTab = 0;
export function welfarePanel(h: Host): void {
  const s = store.save;
  const m = new Modal(h, '福利');
  const dyn = h.add.container(0, 0);
  m.inner.add(dyn);
  const render = () => {
    dyn.removeAll(true);
    ['江湖行记', '战备补给', '节日'].forEach((n, i) => dyn.add(new Button(h, m.cx + i * (m.cw / 3), m.cy, m.cw / 3 - 2, 22, n, () => {
      welfareTab = i;
      render();
    }, { style: welfareTab === i ? 'dark' : 'tan' })));
    let y = m.cy + 30;
    if (welfareTab === 2) return festivalBlock(h, dyn, m, y, render);
    if (welfareTab === 0) {
      dyn.add(text(h, m.cx, y, `一路走来的七件事，做到了就来领（${s.signin.count}/${MILESTONES.length}）`, { color: C.brown }));
      y += 20;
      MILESTONES.forEach((ms, i) => {
        const got = i < s.signin.count;
        const cur = i === s.signin.count;
        const ok = cur && ms.done(s);
        const g = h.add.graphics();
        frame(g, m.cx, y, m.cw, 40, got ? 'disabled' : ok ? 'paper' : 'tan');
        dyn.add(g);
        dyn.add(text(h, m.cx + 8, y + 4, ms.name, { color: ok ? C.red : got ? C.gray : C.darkRed }));
        dyn.add(text(h, m.cx + 72, y + 4, cur && !ok ? `${ms.goal}（${ms.progress(s)}）` : ms.goal, { color: got ? C.gray : C.brown }));
        dyn.add(text(h, m.cx + 8, y + 22, rewardText(systems.signin.days[i]), { color: got ? C.gray : C.darkBrown }));
        if (ok) dyn.add(new Button(h, m.cx + m.cw - 58, y + 9, 52, 22, '领取', () => {
          sfx('level');
          toast(h, claimMilestone(s), 2400);
          h.refresh();
          render();
        }, { style: 'red' }));
        else dyn.add(text(h, m.cx + m.cw - 8, y + 4, got ? '已领' : '', { align: 'right', color: C.gray }));
        y += 44;
      });
    } else {
      const ready = suppliesReady(s);
      dyn.add(text(h, m.cx, y, `每打${SUPPLY_EVERY}场仗，军需官给你攒一份补给（最多攒${SUPPLY_CAP}份）。`, { wrap: m.cw, color: C.brown }));
      y += 36;
      const g = h.add.graphics();
      frame(g, m.cx, y, m.cw, 70, ready ? 'paper' : 'tan');
      dyn.add(g);
      dyn.add(text(h, m.cx + 10, y + 8, ready ? `攒好了 ${ready} 份` : `再打 ${supplyNext(s)} 场就有一份`, { color: ready ? C.red : C.darkRed }));
      dyn.add(text(h, m.cx + 10, y + 28, `下一份：${rewardText(nextSupply(s))}`, { color: C.darkBrown, wrap: m.cw - 90 }));
      dyn.add(new Button(h, m.cx + m.cw - 70, y + 22, 62, 26, '领取', () => {
        sfx('heal');
        toast(h, claimSupply(s), 2200);
        h.refresh();
        render();
      }, { style: ready ? 'red' : 'tan', disabled: !ready }));
      y += 80;
      dyn.add(text(h, m.cx, y, '补给轮着发：', { color: C.brown }));
      y += 18;
      systems.online.tiers.forEach((t, i) => {
        const next = i === s.p5.supply % systems.online.tiers.length;
        dyn.add(text(h, m.cx + 8, y, `${next ? '▶ ' : '　 '}${rewardText(t)}`, { color: next ? C.red : C.darkBrown }));
        y += 18;
      });
      y += 8;
      dyn.add(text(h, m.cx, y, `已经打了${s.battles}场，领过${s.p5.supply}份。`, { color: C.gray }));
    }
  };
  render();
}

// ===== 招贤使者 =====
export function recruitPanel(h: Host): void {
  const s = store.save;
  const m = new Modal(h, '招贤', { h: 300 });
  const opts = recruitOptions(s);
  m.inner.add(text(h, m.cx, m.cy, '英才成长中等、将才成长高，都自带职业，10级后能学技能。', { wrap: m.cw, color: C.brown }));
  opts.forEach((o, i) => {
    const y = m.cy + 40 + i * 40;
    m.inner.add(new Button(h, m.cx, y, m.cw, 34, '', () => {
      const r = recruitWith(s, o.item);
      m.close();
      sfx('level');
      done(h, r);
    }, { disabled: o.have <= 0 }));
    m.inner.add(h.add.image(m.cx + 6, y + 5, iconTex(h, o.item)).setOrigin(0).setScale(2));
    m.inner.add(text(h, m.cx + 36, y + 10, o.label, { color: o.have ? C.darkRed : C.gray }));
    m.inner.add(text(h, m.cx + m.cw - 8, y + 10, `有${o.have}个`, { align: 'right', color: C.brown }));
  });
}

// ===== 跑环使者 =====
export function ringTalk(h: Host): void {
  const s = store.save;
  const t = s.ring.task;
  const say = (text2: string, opts: { label: string; fn: () => void }[] = []) => showDialog(h, [{ who: 'paohuan', text: text2 }], opts);
  if (!ringOpen(s)) return say('你还不到二十级，跑环太危险了。练练再来。');
  if (t && taskDone(s, t)) {
    const r = turnInRing(s);
    sfx('level');
    toast(h, r.lines.join('\n'), 2600);
    h.refresh();
    if (s.ring.index) say(`做得好。接着跑第${s.ring.index}环吗？`, [
      { label: '接着跑', fn: () => ringTalk(h) },
      { label: '歇会儿', fn: () => {} },
    ]);
    else say('这一档跑完了，最后这几本技能书是给你的。歇口气再来。');
    return;
  }
  if (t) return say(`${ringStatusText(s)}。做完了回来找我。`, [
    { label: '知道了', fn: () => {} },
    { label: '放弃跑环', fn: () => confirm(h, '放弃以后要从这一档的第一环重新开始，确定吗？', () => done(h, abandonRing(s)), '放弃') },
  ]);
  const take = (tier: number) => () => {
    const r = nextRing(s, Date.now(), tier);
    h.refresh();
    say(r);
  };
  if (s.ring.index) return say(`你跑到${tierName(s.ring.index)}第${s.ring.index}环了，接着来？`, [{ label: '接任务', fn: take(1) }, { label: '返回', fn: () => {} }]);
  // 一环 20 级、二环 40 级、三环 60 级；等级够的才列出来
  const tiers = openTiers(s);
  say(`一档${RING_ROUNDS}个任务，跑完有技能书：一环第1–10环、二环第11–20环（40级）、三环第21–30环（60级）。中途断了要从这一档的头跑。`, [
    ...tiers.map((t) => ({ label: `接${['一环', '二环', '三环'][t - 1]}`, fn: take(t) })),
    { label: '返回', fn: () => {} },
  ]);
}

// ===== 宝洞老人 =====
export function digTalk(h: Host): void {
  const s = store.save;
  const say = (t: string, opts: { label: string; fn: () => void }[]) => showDialog(h, [{ who: 'wabao', text: t }], opts);
  if (!s.dig) {
    say(`铲子${items.chanzi.price}两一把，一把挖10铲。第3、6、9铲会惊动护宝守卫，打赢了有宝箱。你有${bagCount(s, 'chanzi')}把铲子。`, [
      { label: '开挖', fn: () => {
        const r = startDig(s);
        h.refresh();
        if (s.dig) digTalk(h);
        else toast(h, r);
      } },
      { label: '买铲子', fn: () => {
        toast(h, buyShovel(s));
        h.refresh();
        digTalk(h);
      } },
      { label: '返回', fn: () => {} },
    ]);
    return;
  }
  say(`还能挖${s.dig.left}铲。${nextIsGuard(s) ? '下面好像有动静……' : ''}`, [
    { label: '挖一铲', fn: () => {
      const r = digOnce(s);
      if (r.kind === 'guard') {
        toast(h, '护宝守卫冲出来了！');
        const b = guardBattle(s, randomSeed());
        store.flush();
        h.time.delayedCall(500, () => h.scene.start('Battle', { battle: b }));
        return;
      }
      sfx('heal');
      toast(h, r.text, 2000);
      h.refresh();
      if (s.dig) h.time.delayedCall(300, () => digTalk(h));
    } },
    { label: '先不挖了', fn: () => {} },
  ]);
}

// ===== 杂物的使用 =====
export function useMisc(h: Host, id: string, after: () => void): void {
  const s = store.save;
  const def = items[id];
  const finish = (msg: string) => {
    toast(h, msg, 2400);
    h.refresh();
    after();
  };
  switch (def.use) {
    case 'box':
      sfx('heal');
      return finish(openBox(s, 'baoxiang'));
    case 'bigbox':
      sfx('level');
      return finish(openBox(s, 'gaojibaoxiang'));
    case 'gemore':
      return finish(openGemOre(s));
    case 'stamina':
      return finish(eatPill(s));
    case 'dig':
      return toast(h, '在宝洞里找宝洞老人才能挖。许昌「设施 → 战场」进宝洞');
    case 'xinfa':
      return pickGeneral(h, `读${def.name}（经验+${def.amount}）`, allGenerals(s), (g) => finish(readXinfa(s, g.uid, id)));
    case 'skillbook':
      return pickSkill(h, (who, sk) => finish(who === 'player' ? readSkillBook(s, sk) : readSkillBookGeneral(s, who, sk)));
    default:
      if (id === 'jiangjunling' || id === 'dajiangjunling' || items[id].name.endsWith('令牌')) return toast(h, '去许昌找招贤使者用');
  }
}

export function pickGeneral(h: Host, title: string, list: General[], onPick: (g: General) => void): void {
  if (!list.length) return toast(h, '还没有副将');
  const m = new Modal(h, title, { w: 300, h: Math.min(460, 60 + list.length * 40) });
  const area = new ScrollArea(h, m.cx, m.cy, m.cw, m.ph - 40, m.inner);
  list.forEach((g, i) => {
    const y = i * 40;
    area.content.add(new Button(h, 0, y, m.cw - 6, 36, '', () => {
      m.close();
      onPick(g);
    }, { clip: area }));
    area.content.add(h.add.image(4, y + 6, avatarTex(h, g.look)).setOrigin(0).setCrop(0, 0, 24, 24));
    area.content.add(text(h, 32, y + 4, `（${g.level}）${g.name}`, { color: C.darkRed }));
    area.content.add(text(h, 32, y + 19, `${g.grade} · ${classes[g.classId].name}`, { color: C.brown }));
  });
  area.setContentHeight(list.length * 40);
}

function pickSkill(h: Host, onPick: (who: string, skill: string) => void): void {
  const s = store.save;
  const opts: { who: string; skill: string; label: string }[] = [];
  for (const st of s.player.skills) opts.push({ who: 'player', skill: st.id, label: `${s.player.name}·${skills[st.id].name}（${st.prof}/${profCap(st.level)}）` });
  for (const g of allGenerals(s)) for (const st of g.skills) opts.push({ who: g.uid, skill: st.id, label: `${g.name}·${skills[st.id].name}（${st.prof}/${profCap(st.level)}）` });
  if (!opts.length) return toast(h, '还没有学会的技能');
  const m = new Modal(h, '技能书给谁用', { w: 320, h: Math.min(460, 60 + opts.length * 32) });
  const area = new ScrollArea(h, m.cx, m.cy, m.cw, m.ph - 40, m.inner);
  opts.forEach((o, i) => area.content.add(new Button(h, 0, i * 32, m.cw - 6, 28, o.label, () => {
    m.close();
    onPick(o.who, o.skill);
  }, { clip: area })));
  area.setContentHeight(opts.length * 32);
}

// ===== 副将学技能 =====
export function generalSkillPanel(h: Host, uid: string): void {
  const s = store.save;
  const g = allGenerals(s).find((x) => x.uid === uid);
  if (!g) return;
  const m = new Modal(h, `${g.name}的技能`);
  const dyn = h.add.container(0, 0);
  m.inner.add(dyn);
  const render = () => {
    dyn.removeAll(true);
    dyn.add(text(h, m.cx, m.cy, `${g.grade} · ${g.level}级${classes[g.classId].name}。学了别的职业的技能，职业和外形都会变，原来的技能会忘掉。`, { wrap: m.cw, color: C.brown }));
    const area = new ScrollArea(h, m.cx, m.cy + 36, m.cw, m.ph - 76, dyn);
    let y = 0;
    for (const r of generalSkillRows(g)) {
      const def = skills[r.id];
      const bg = h.add.graphics();
      frame(bg, 0, y, m.cw - 6, 36, r.level ? 'paper' : 'tan');
      area.content.add(bg);
      area.content.add(text(h, 8, y + 3, `${def.name}（${classes[r.cls].name}）`, { color: r.cls === g.classId ? C.darkRed : C.darkBrown }));
      area.content.add(text(h, 8, y + 19, r.level ? `${skillLevelText(r.level)} 熟练度${r.prof}` : r.reason || (r.changesClass ? `学了变成${classes[r.cls].name}` : def.desc.slice(0, 14)), { color: r.action ? C.brown : C.gray }));
      if (r.action) area.content.add(new Button(h, m.cw - 62, y + 7, 52, 22, r.action === 'learn' ? '学习' : '升级', () => {
        const run = () => {
          const msg = r.action === 'learn' ? generalLearn(s, uid, r.id) : generalUpgrade(s, uid, r.id);
          toast(h, msg, 2000);
          sfx('level');
          h.refresh();
          render();
        };
        if (r.changesClass && g.skills.length) confirm(h, `学${def.name}会让${g.name}变成${classes[r.cls].name}，原来的技能全部忘掉。确定吗？`, run, '学');
        else run();
      }, { clip: area, style: 'red' }));
      else if (r.level) area.content.add(text(h, m.cw - 12, y + 12, r.reason, { align: 'right', color: C.gray }));
      y += 40;
    }
    area.setContentHeight(y);
  };
  render();
}
