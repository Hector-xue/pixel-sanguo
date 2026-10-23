import { it } from 'vitest';
import { newSave, gzRank } from '../src/game/state';
import { systems } from '../src/data';
import { calTick, weekIndex } from '../src/game/calendar';
import { autoplay } from '../src/sim/autoplay';
// 后期玩法节奏：npm run sim:endgame（不在 npm test 里跑，一次要一两分钟）
it('后期玩法节奏', () => {
  for (const c of ['warrior', 'scholar', 'mystic'] as const) for (const g of ['male', 'female'] as const) {
    const s = newSave({ server: '1', name: 't', gender: g, classId: c, avatar: 0, seed: 7 });
    const r = autoplay(s, 11, 20000, undefined, { endgame: true });
    const e = r.endgame!;
    const L = s.p5.life.lv;
    console.log('EG', c, g, 'lv', r.level, 'battles', r.battles, 'losses', r.losses, 'step', s.main.step,
      '| 国战', `${e.gzWins}/${e.gzFights}`, '夺城', e.captures, '官职', systems.guozhan.ranks[gzRank(s.p4.meritTotal)].name, '赛季奖', JSON.stringify(e.seasonRewards), '季数', weekIndex(calTick(s)),
      '| 争霸', `${e.leagueWins}/${e.league}`, JSON.stringify(e.leagueRewards), '| 会武', `${e.kuaquWins}/${e.kuaqu}`, JSON.stringify(e.kuaquRewards),
      '| 采集', e.gathers, '烹饪', e.cooks, `钓${L.fish} 矿${L.mine} 药${L.herb} 厨${L.cook}`);
  }
}, 1800000);
