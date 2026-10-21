#!/usr/bin/env python3
"""P4 内容生成器：国战沙盘（魏、蜀、吴 + 群雄）的城池、各国兵种和守将、军团争霸、跨区大战，以及新增的成就。
可重复运行：每次先删掉上次生成的条目再重建。

全部【推定】：原版只查到「军团争霸」「国战（抢洛阳、虎牢关）」「教派战」「跨区大战」这几个名字。
单机版做成 AI 势力沙盘：城池、兵力、回合、战功、官职、赛季都是自己设计的。
用法：python3 scripts/gen-p4.py（在仓库根目录）
"""
import json
import os

ROOT = os.path.join(os.path.dirname(__file__), '..', 'src', 'data')


def load(name):
    with open(os.path.join(ROOT, name), encoding='utf-8') as f:
        return json.load(f)


def save(name, data):
    with open(os.path.join(ROOT, name), 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write('\n')


W = {
    'war': {'con': 1.3, 'str': 1.4, 'int': 0.5, 'agi': 1},
    'tank': {'con': 1.7, 'str': 1.4, 'int': 0.5, 'agi': 0.8},
    'agi': {'con': 1.0, 'str': 1.2, 'int': 0.5, 'agi': 1.6},
    'sch': {'con': 1.1, 'str': 0.6, 'int': 1.5, 'agi': 1.0},
    'mys': {'con': 1.0, 'str': 0.6, 'int': 1.6, 'agi': 1.1},
}

# 兵种：国战里按出战时的等级生成，所以只给外形、职业和技能
SOLDIERS = {
    'wei': [('weibu', '魏军步卒', 'warrior', 'gz_weibu', 'tank', [('gujin', 4, 0.12), ('lipi', 4, 0.18)]),
            ('weimou', '魏军谋士', 'scholar', 'gz_weimou', 'sch', [('huadi', 4, 0.22)]),
            ('weifang', '魏军方士', 'mystic', 'gz_weifang', 'mys', [('wulei', 4, 0.22)])],
    'shu': [('shubu', '蜀军步卒', 'warrior', 'gz_shubu', 'war', [('lipi', 4, 0.2)]),
            ('shumou', '蜀军谋士', 'scholar', 'gz_shumou', 'sch', [('chenhuo', 4, 0.22)]),
            ('shufang', '蜀军方士', 'mystic', 'gz_shufang', 'mys', [('hufeng', 4, 0.22)])],
    'wu': [('wubu', '吴军步卒', 'warrior', 'gz_wubu', 'agi', [('sheming', 4, 0.2)]),
           ('wumou', '吴军谋士', 'scholar', 'gz_wumou', 'sch', [('simian', 4, 0.22)]),
           ('wufang', '吴军方士', 'mystic', 'gz_wufang', 'mys', [('yaohuo', 4, 0.22)])],
    'qun': [('qunbu', '董卓余部', 'warrior', 'm_xlshoujun', 'tank', [('lipi', 4, 0.18)]),
            ('qunmou', '余部谋士', 'scholar', 'm_xlmoushi', 'sch', [('huadi', 4, 0.2)]),
            ('qunfang', '余部方士', 'mystic', 'm_shushi', 'mys', [('wugu', 4, 0.2)])],
}

# 守将：城破时出城单挑；城归哪国就由哪国的将领守。打的时候按主角同级的镜像（有装备、有加点）做，气血 × hpMul
GUARDS = {
    'wei': [('xiahoudun', '夏侯惇', 'warrior', 'tank', [('lipi', 5, 0.3), ('gujin', 5, 0.12)]),
            ('caoren', '曹仁', 'warrior', 'tank', [('gujin', 5, 0.2), ('lipi', 5, 0.25)]),
            ('zhangliao', '张辽', 'warrior', 'agi', [('sheming', 5, 0.25), ('lipi', 5, 0.2)]),
            ('xuchu', '许褚', 'warrior', 'tank', [('lipi', 5, 0.35)]),
            ('guojia', '郭嘉', 'scholar', 'sch', [('simian', 5, 0.3), ('chenhuo', 5, 0.2)]),
            ('simayi', '司马懿', 'scholar', 'sch', [('huadi', 5, 0.3), ('simian', 5, 0.2)])],
    'shu': [('guanyu', '关羽', 'warrior', 'war', [('lipi', 5, 0.35), ('sheming', 5, 0.15)]),
            ('zhangfei', '张飞', 'warrior', 'tank', [('lipi', 5, 0.3), ('gujin', 5, 0.12)]),
            ('machao', '马超', 'warrior', 'agi', [('sheming', 5, 0.3)]),
            ('huangzhong', '黄忠', 'warrior', 'war', [('sheming', 5, 0.25), ('lipi', 5, 0.2)]),
            ('zhugeliang', '诸葛亮', 'scholar', 'sch', [('simian', 5, 0.3), ('huadi', 5, 0.2)]),
            ('pangtong', '庞统', 'mystic', 'mys', [('yaohuo', 5, 0.3), ('hufeng', 5, 0.2)])],
    'wu': [('zhouyu', '周瑜', 'scholar', 'sch', [('chenhuo', 5, 0.3), ('simian', 5, 0.2)]),
           ('lvmeng', '吕蒙', 'warrior', 'war', [('lipi', 5, 0.3)]),
           ('ganning', '甘宁', 'warrior', 'agi', [('sheming', 5, 0.3)]),
           ('taishici', '太史慈', 'warrior', 'war', [('lipi', 5, 0.25), ('sheming', 5, 0.2)]),
           ('huanggai', '黄盖', 'warrior', 'tank', [('gujin', 5, 0.2), ('lipi', 5, 0.25)]),
           ('luxun', '陆逊', 'mystic', 'mys', [('yaohuo', 5, 0.3), ('wulei', 5, 0.2)])],
    'qun': [('xurong', '徐荣', 'warrior', 'tank', [('gujin', 5, 0.2), ('lipi', 5, 0.25)]),
            ('lijue', '李傕', 'warrior', 'war', [('lipi', 5, 0.3)]),
            ('guosi', '郭汜', 'warrior', 'war', [('sheming', 5, 0.25), ('lipi', 5, 0.2)]),
            ('zhangji', '张济', 'warrior', 'tank', [('gujin', 5, 0.15), ('lipi', 5, 0.25)]),
            ('zhangxiu', '张绣', 'warrior', 'agi', [('sheming', 5, 0.3)]),
            ('jiaxu', '贾诩', 'scholar', 'sch', [('simian', 5, 0.3), ('huadi', 5, 0.2)])],
}

NATIONS = [
    {'id': 'wei', 'name': '魏', 'full': '魏国', 'ruler': '曹操', 'color': 0x3a6ad0, 'joinable': True},
    {'id': 'shu', 'name': '蜀', 'full': '蜀国', 'ruler': '刘备', 'color': 0x3f9a3a, 'joinable': True},
    {'id': 'wu', 'name': '吴', 'full': '吴国', 'ruler': '孙权', 'color': 0xd03a2a, 'joinable': True},
    {'id': 'qun', 'name': '群', 'full': '董卓余部', 'ruler': '李傕', 'color': 0xa08850, 'joinable': False},
]

# (id, 名字, x, y, 类型, 开局归属)；坐标是沙盘上的百分比
CITIES = [
    ('xuchang', '许昌', 62, 44, 'capital', 'wei'),
    ('chenliu', '陈留', 68, 27, 'normal', 'wei'),
    ('puyang', '濮阳', 80, 13, 'normal', 'wei'),
    ('qiaojun', '谯郡', 84, 42, 'normal', 'wei'),
    ('chengdu', '成都', 8, 82, 'capital', 'shu'),
    ('hanzhong', '汉中', 12, 52, 'normal', 'shu'),
    ('shangyong', '上庸', 27, 56, 'normal', 'shu'),
    ('xiangyang', '襄阳', 38, 72, 'normal', 'shu'),
    ('jianye', '建业', 90, 76, 'capital', 'wu'),
    ('lujiang', '庐江', 70, 78, 'normal', 'wu'),
    ('shouchun', '寿春', 80, 60, 'normal', 'wu'),
    ('chaisang', '柴桑', 54, 88, 'normal', 'wu'),
    ('luoyang', '洛阳', 40, 28, 'key', 'qun'),
    ('hulaoguan', '虎牢关', 54, 22, 'pass', 'qun'),
    ('changan', '长安', 14, 26, 'key', 'qun'),
    ('wancheng', '宛城', 40, 50, 'normal', 'qun'),
    ('yingchuan', '颍川', 52, 40, 'normal', 'qun'),
]

LINKS = [
    ('changan', 'luoyang'), ('changan', 'hanzhong'), ('luoyang', 'hulaoguan'), ('hulaoguan', 'chenliu'), ('chenliu', 'puyang'),
    ('chenliu', 'xuchang'), ('luoyang', 'yingchuan'), ('yingchuan', 'xuchang'), ('xuchang', 'qiaojun'), ('puyang', 'qiaojun'),
    ('yingchuan', 'wancheng'), ('luoyang', 'wancheng'), ('wancheng', 'shangyong'), ('shangyong', 'hanzhong'), ('hanzhong', 'chengdu'),
    ('wancheng', 'xiangyang'), ('shangyong', 'xiangyang'), ('xiangyang', 'chaisang'), ('qiaojun', 'shouchun'), ('shouchun', 'lujiang'),
    ('lujiang', 'jianye'), ('lujiang', 'chaisang'), ('shouchun', 'jianye'), ('xuchang', 'shouchun'), ('chengdu', 'xiangyang'),
]

RANKS = [('士卒', 0), ('伍长', 50), ('什长', 150), ('百夫长', 400), ('校尉', 900), ('都尉', 1800), ('中郎将', 3500),
         ('偏将军', 6000), ('将军', 10000), ('大将军', 16000)]


def soldier_def(name, cls, look, w, sk):
    return {'name': name, 'class': cls, 'gender': 'male', 'look': look, 'weights': W[w],
            'skills': [{'id': i, 'level': l, 'rate': r} for i, l, r in sk],
            'drops': [{'item': 'dahuan', 'chance': 0.04}, {'item': 'yulu', 'chance': 0.04}],
            'expMul': 1.8, 'silverMul': 1.2, 'capturable': False, 'gz': True}


def guard_def(name, cls, look, w, sk):
    return {'name': name, 'class': cls, 'gender': 'male', 'look': look, 'weights': W[w],
            'skills': [{'id': i, 'level': l, 'rate': r} for i, l, r in sk],
            'drops': [{'item': 'gaojibaoxiang', 'chance': 0.4}],
            'expMul': 10, 'silverMul': 8, 'hpMul': 2.6, 'atkMul': 1.0,
            'historic': True, 'boss': True, 'capturable': False, 'noFlee': True, 'gz': True}


def main():
    monsters = load('monsters.json')
    systems = load('systems.json')
    for k in [k for k, v in monsters.items() if isinstance(v, dict) and v.get('gz')]:
        del monsters[k]
    soldiers, guards = {}, {}
    for nat, rows in SOLDIERS.items():
        soldiers[nat] = []
        for mid, name, cls, look, w, sk in rows:
            monsters['gz_' + mid] = soldier_def(name, cls, look, w, sk)
            soldiers[nat].append('gz_' + mid)
    for nat, rows in GUARDS.items():
        guards[nat] = []
        for mid, name, cls, w, sk in rows:
            monsters['gz_' + mid] = guard_def(name, cls, 'gz_' + mid, w, sk)
            guards[nat].append('gz_' + mid)
    monsters['_srcP4'] = 'P4 国战：魏蜀吴各国兵种、守将（三国名将）全部【推定】；原版只查到国战抢洛阳、虎牢关'

    kinds = {
        'capital': {'name': '都城', 'max': 6000, 'def': 2.0, 'yield': 150},
        'key': {'name': '重镇', 'max': 5000, 'def': 1.4, 'yield': 90},
        'pass': {'name': '关隘', 'max': 4500, 'def': 1.8, 'yield': 70},
        'normal': {'name': '城池', 'max': 3000, 'def': 1.15, 'yield': 60},
    }
    systems['guozhan'] = {
        '_src': '【实锤】原版有国战（抢洛阳、虎牢关）和军团争霸；【推定】单机版做成魏蜀吴 + 董卓余部的 AI 沙盘：每小时一回合、一周一赛季，城池、兵力、战功、官职、奖励全部自己设计',
        'minLevel': 60,
        'ordersPerDay': 8,
        'turnMinutes': 60,
        'seasonDays': 7,
        'nations': NATIONS,
        'kinds': kinds,
        'cities': [{'id': i, 'name': n, 'x': x, 'y': y, 'kind': k, 'owner': o} for i, n, x, y, k, o in CITIES],
        'links': [list(l) for l in LINKS],
        'soldiers': soldiers,
        'guards': guards,
        # AI 每回合：各城自己补兵；每国有一定概率从前线挑一座城去打邻城
        'ai': {'attackChance': 0.6, 'sendPct': 0.6, 'minRatio': 0.85, 'startPct': 0.7, 'qunStartPct': 0.45, 'qunYieldMul': 0.35,
               'reinforcePct': 0.25, 'bigNationDamp': 0.08, 'luck': [0.8, 1.2]},
        # 主角出征：打赢一场守军减 max×hitPct + 等级×hitPerLevel；驻守打赢补 max×defendPct
        'player': {'hitPct': 0.055, 'hitPerLevel': 2, 'defendPct': 0.06, 'captureTroopsPct': 0.35,
                   'meritAtk': 12, 'meritDef': 8, 'meritBoss': 80, 'guardControlResist': 120, 'guardLevel': 3, 'guardEscorts': 3, 'mirrorChance': 0.35, 'joinCooldownDays': 7},
        'ranks': [{'name': n, 'merit': m} for n, m in RANKS],
        # 官职加成：每级 × 人物等级
        'rankBonus': {'hp': 0.8, 'atk': 0.08, 'def': 0.08},
        'salaryPerRankLevel': 20,
        'buffs': {'luoyang': {'exp': 0.1, 'text': '经验+10%'}, 'hulaoguan': {'silver': 0.1, 'text': '战斗银两+10%'}},
        'seasonMinMerit': 50,
        'seasonRewards': [
            {'silverPerLevel': 600, 'items': {'gaojibaoxiang': 2, 'dajiangjunling': 1}, 'gold': 30},
            {'silverPerLevel': 350, 'items': {'gaojibaoxiang': 1, 'jiangjunling': 1}},
            {'silverPerLevel': 200, 'items': {'baoxiang': 2}},
        ],
        # 战功商店；@ore = 当前等级的矿石，@gem = 当前等级的宝石
        'shop': [
            {'id': 'jiangjunling', 'cost': 300}, {'id': 'dajiangjunling', 'cost': 1200}, {'id': 'gaojibaoxiang', 'cost': 200},
            {'id': 'jinengshu', 'cost': 800}, {'id': 'xinfa3', 'cost': 500}, {'id': 'tilidan', 'cost': 60},
            {'id': '@ore', 'cost': 40}, {'id': '@gem', 'cost': 150},
        ],
    }
    systems['league'] = {
        '_src': '【实锤】原版有军团争霸、教派战；【推定】单机版是四个教派一周循环赛，每天一轮，你替本教派打三阵',
        'fightsPerDay': 3,
        'winPoints': 3,
        'baseP': 0.3,
        'perWin': 0.22,
        'stageLevel': [-3, 0, 3],
        'rewards': [
            {'silverPerLevel': 400, 'items': {'gaojibaoxiang': 1}, 'rep': 300},
            {'silverPerLevel': 200, 'rep': 150},
            {'silverPerLevel': 120, 'rep': 80},
            {'silverPerLevel': 80, 'rep': 40},
        ],
        'title': '争霸盟主',
    }
    systems['kuaqu'] = {
        '_src': '【实锤】原版有跨区大战（只查到名字）；【推定】单机版是周六周日两天，和两个 AI 区比积分',
        'minLevel': 80,
        'fightsPerDay': 5,
        'servers': ['二区·烽火连城', '五区·逐鹿中原'],
        'base': 900,
        'spread': 0.15,
        'playerWeight': 2,
        'winPoints': 10,
        'levelDiffPoints': 2,
        'oppLevel': [3, 9],
        'rewards': [
            {'silverPerLevel': 500, 'items': {'gaojibaoxiang': 2}},
            {'silverPerLevel': 250, 'items': {'gaojibaoxiang': 1}},
            {'silverPerLevel': 120, 'items': {'baoxiang': 1}},
        ],
        'title': '跨区之王',
    }

    achv = [a for a in systems['achv'] if not a.get('p4')]
    achv += [
        {'id': 'gzJoin', 'name': '投身国战', 'desc': '加入一国参加国战', 'key': 'gzJoined', 'need': 1, 'reward': {'silver': 20000}, 'p4': True},
        {'id': 'gzCapture', 'name': '攻城拔寨', 'desc': '亲手攻下一座城', 'key': 'gzCaptures', 'need': 1, 'reward': {'items': {'gaojibaoxiang': 1}}, 'title': '攻城拔寨', 'p4': True},
        {'id': 'gzCapture10', 'name': '所向披靡', 'desc': '亲手攻下十座城', 'key': 'gzCaptures', 'need': 10, 'reward': {'gold': 50}, 'title': '所向披靡', 'p4': True},
        {'id': 'gzGeneral', 'name': '拜将封侯', 'desc': '官职升到将军', 'key': 'gzRank', 'need': 8, 'reward': {'items': {'dajiangjunling': 1}}, 'title': '将军', 'p4': True},
        {'id': 'gzMarshal', 'name': '大将军', 'desc': '官职升到大将军', 'key': 'gzRank', 'need': 9, 'reward': {'gold': 100}, 'title': '大将军', 'p4': True},
        {'id': 'gzSeason', 'name': '开国元勋', 'desc': '所在国拿下一个赛季的第一', 'key': 'gzSeasonWins', 'need': 1, 'reward': {'gold': 50}, 'title': '开国元勋', 'p4': True},
        {'id': 'leagueChamp', 'name': '争霸盟主', 'desc': '本教派拿下一周军团争霸第一', 'key': 'leagueChamps', 'need': 1, 'reward': {'gold': 30}, 'title': '争霸盟主', 'p4': True},
        {'id': 'kuaquChamp', 'name': '跨区之王', 'desc': '本区拿下跨区大战第一', 'key': 'kuaquChamps', 'need': 1, 'reward': {'gold': 30}, 'title': '跨区之王', 'p4': True},
    ]
    systems['achv'] = achv

    save('monsters.json', monsters)
    save('systems.json', systems)
    n_s = sum(len(v) for v in soldiers.values())
    n_g = sum(len(v) for v in guards.values())
    print('soldiers', n_s, 'guards', n_g, 'cities', len(CITIES), 'links', len(LINKS))


if __name__ == '__main__':
    main()
