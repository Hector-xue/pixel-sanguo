#!/usr/bin/env python3
"""排版巡检：用无头 Chrome 打开开发版（npx vite），注入一个固定的后期存档，
把所有面板连同分页、69 个地点的主界面挨个打开，量文字有没有出框、出按钮、叠在一起。
两种屏高（640 普通手机、783 长屏）各跑一遍，再按「画面放大」（逻辑宽 320，要 18:9 以上的屏，用 740 高）跑一遍；有问题就打印出来并以 1 退出。

用法：npx vite --port 5173 &  然后  python3 tools/layout-probe/run.py [http://127.0.0.1:5173/]
依赖：google-chrome、pip install websocket-client
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request

import websocket

HERE = os.path.dirname(os.path.abspath(__file__))
URL = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:5173/'
CHROME = os.environ.get('CHROME', 'google-chrome')


class Page:
    def __init__(self, port: int):
        for _ in range(100):
            try:
                tabs = json.load(urllib.request.urlopen(f'http://127.0.0.1:{port}/json'))
                page = [t for t in tabs if t['type'] == 'page'][0]
                break
            except Exception:
                time.sleep(0.2)
        self.ws = websocket.create_connection(page['webSocketDebuggerUrl'], timeout=300)
        self.mid = 0
        self.errors: list[str] = []

    def call(self, method: str, **params):
        self.mid += 1
        self.ws.send(json.dumps({'id': self.mid, 'method': method, 'params': params}))
        while True:
            m = json.loads(self.ws.recv())
            if m.get('method') == 'Runtime.exceptionThrown':
                d = m['params']['exceptionDetails']
                self.errors.append((d.get('exception', {}).get('description') or d.get('text') or '')[:300])
            if m.get('id') == self.mid:
                return m.get('result', {})

    def ev(self, js: str):
        r = self.call('Runtime.evaluate', expression=js, awaitPromise=True, returnByValue=True)
        if 'exceptionDetails' in r:
            raise RuntimeError(json.dumps(r['exceptionDetails'])[:500])
        return r.get('result', {}).get('value')

    def wait(self, js: str, secs: float) -> bool:
        end = time.time() + secs
        while time.time() < end:
            try:
                if self.ev(js):
                    return True
            except Exception:
                pass
            time.sleep(0.25)
        return False


def run_height(height: int, big: bool = False) -> list[str]:
    tag = f'{height}{"·放大" if big else ""}'
    prof = tempfile.mkdtemp(prefix='probe-')
    port = 9400 + height % 500 + (7 if big else 0)
    proc = subprocess.Popen([CHROME, '--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--remote-allow-origins=*',
                             f'--remote-debugging-port={port}', f'--user-data-dir={prof}', 'about:blank'],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        p = Page(port)
        p.call('Runtime.enable')
        p.call('Emulation.setDeviceMetricsOverride', width=360, height=height, deviceScaleFactor=2, mobile=True)
        p.call('Emulation.setTouchEmulationEnabled', enabled=True)
        fixture = open(os.path.join(HERE, 'fixture.json'), encoding='utf-8').read()
        settings = json.dumps({'music': 0, 'sfx': 0, 'big': big})
        ver = json.load(open(os.path.join(HERE, '..', '..', 'package.json')))['version']
        # 开发版按模块一个个加载，偶尔加载失败卡在「加载中」：重载几次
        for attempt in range(4):
            p.call('Page.navigate', url=URL)
            if not p.wait('!!window.__game', 30):
                continue
            p.ev(f"localStorage.setItem('pxsg.save.v1', {json.dumps(fixture)});"
                 f"localStorage.setItem('pxsg.settings.v1', {json.dumps(settings)});"
                 f"localStorage.setItem('pxsg.seenVersion', {json.dumps(ver)}); window.__old = 1; 1")
            p.call('Page.reload')
            # 等新页面（旧页面上有 __old 记号）把存档读进来、标题页起来
            if p.wait("!window.__old && !!window.__game && __game.scene.isActive('Title')", 30):
                break
        else:
            return [f'[{tag}] 开发版页面载不起来']
        # 入国（国战几页要有国家才打得开），再进主界面
        p.ev("(async()=>{const gz=await import('/src/game/guozhan.ts');const {store}=await import('/src/game/store.ts');if(!store.save.p4.nation)gz.joinNation(store.save,'wei');store.flush();__game.scene.getScene('Title').scene.start('Main');return 1})()")
        if not p.wait("!!window.__main && __main.scene.isActive()", 20):
            return [f'[{tag}] 进不了主界面']
        time.sleep(2.5)
        p.ev(open(os.path.join(HERE, 'probe.js'), encoding='utf-8').read() + '\n1')
        panels = p.ev('window.__probePanels()')
        main = p.ev('window.__probeMain()')
        p.ev("__main.scene.restart(); 1")
        time.sleep(1.5)
        field = p.ev('window.__probeBattle()')
        print(f'[{tag}] 面板 {panels["opened"]} 页，地点 {main["places"]} 处（{main["texts"]} 段字），战场 {field["fields"]} 种站法')
        out = [f'[{tag}] {x}' for x in panels['issues'] + main['issues'] + field['issues']]
        out += [f'[{tag}] 页面报错 {e}' for e in p.errors]
        return out
    finally:
        proc.terminate()
        try:
            proc.wait(5)
        except Exception:
            proc.kill()
        shutil.rmtree(prof, ignore_errors=True)


def main() -> int:
    issues: list[str] = []
    # 标准画面两种屏高；画面放大（逻辑宽 320）要够长的屏才生效
    for h, big in ((640, False), (783, False), (740, True)):
        issues += run_height(h, big)
    if issues:
        print('\n'.join(issues))
        print(f'发现 {len(issues)} 处排版问题')
        return 1
    print('排版巡检通过')
    return 0


if __name__ == '__main__':
    sys.exit(main())
