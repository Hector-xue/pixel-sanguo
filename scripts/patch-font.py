# 字体补字：Fusion Pixel 12px 里缺「颍」「骢」，用字体里已有的部件拼出来，保持同一套像素风格。
# 用法：python3 scripts/patch-font.py public/fonts/fusion-pixel-12px.woff2
# 颍 = 颖的左上「匕」+ 手画的小「水」+ 颖的右半「页」；骢 = 驰的「马」字旁 + 聪的右半「总」
import sys
from fontTools.ttLib import TTFont
from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.pens.ttGlyphPen import TTGlyphPen

PATH = sys.argv[1]
f = TTFont(PATH)
cmap = f.getBestCmap()
gs = f.getGlyphSet()
U = 100  # 一个像素 = 100 单位（upem 1200 / 12）
YS = list(range(1050, -250, -100))
XS = list(range(50, 1200, 100))


def polys(ch):
    pen = DecomposingRecordingPen(gs)
    gs[cmap[ord(ch)]].draw(pen)
    out, cur = [], []
    for op, a in pen.value:
        if op == 'moveTo':
            cur = [a[0]]
        elif op == 'lineTo':
            cur.append(a[0])
        elif op in ('closePath', 'endPath'):
            out.append(cur)
            cur = []
    return out


def inside(x, y, ps):
    w = 0
    for p in ps:
        for i in range(len(p)):
            (x1, y1), (x2, y2) = p[i], p[(i + 1) % len(p)]
            if y1 <= y < y2 and (x2 - x1) * (y - y1) - (x - x1) * (y2 - y1) > 0:
                w += 1
            elif y2 <= y < y1 and (x2 - x1) * (y - y1) - (x - x1) * (y2 - y1) < 0:
                w -= 1
    return w != 0


def bitmap(ch):
    ps = polys(ch)
    return [[1 if inside(x, y, ps) else 0 for x in XS] for y in YS]


def row_of(y):
    return YS.index(y)


ying = bitmap('颖')
WATER = ['..#..', '###.#', '.###.', '#.##.', '..#.#', '.#...']
for k, line in enumerate(WATER):
    r = row_of(350 - k * 100)
    for x in range(5):
        ying[r][x] = 1 if line[x] == '#' else 0

chi = bitmap('驰')
cong = bitmap('聪')
cong2 = [[(chi[r][x] if x < 4 else 0) if x < 5 else cong[r][x] for x in range(12)] for r in range(len(YS))]


def glyph_from(bm):
    pen = TTGlyphPen(None)
    for r, row in enumerate(bm):
        y0 = YS[r] - 50
        x = 0
        while x < 12:
            if not row[x]:
                x += 1
                continue
            s = x
            while x < 12 and row[x]:
                x += 1
            pen.moveTo((s * U, y0))
            pen.lineTo((s * U, y0 + U))
            pen.lineTo((x * U, y0 + U))
            pen.lineTo((x * U, y0))
            pen.closePath()
    return pen.glyph()


def add(ch, bm, like):
    name = f'uni{ord(ch):04X}'
    if ord(ch) in cmap:
        print(ch, '已经有了，跳过')
        return
    f['glyf'][name] = glyph_from(bm)
    f['glyf'][name].recalcBounds(f['glyf'])
    order = f.getGlyphOrder()
    if name not in order:
        f.setGlyphOrder(order + [name])
    ref = cmap[ord(like)]
    f['hmtx'][name] = f['hmtx'][ref]
    if 'vmtx' in f:
        f['vmtx'][name] = f['vmtx'][ref]
    for t in f['cmap'].tables:
        if t.isUnicode():
            t.cmap[ord(ch)] = name
    print('补上', ch)
    for row in bm:
        print(''.join('#' if v else '.' for v in row))


add('颍', ying, '颖')
add('骢', cong2, '聪')
f['maxp'].numGlyphs = len(f.getGlyphOrder())
f.save(PATH)
