"""云存档服务的接口测试：起一个临时库、随机端口的服务，从注册一路测到冲突、限流、锁号。
用法：python3 -m unittest discover -s server
"""
import json
import os
import tempfile
import threading
import unittest
import urllib.error
import urllib.request

TMP = tempfile.mkdtemp()
os.environ["CLOUD_DB"] = os.path.join(TMP, "cloud.db")
os.environ["CLOUD_PBKDF2_ROUNDS"] = "1000"
os.environ["CLOUD_MIN_FREE_MB"] = "0"

import cloud_api  # noqa: E402

SAVE = json.dumps({"v": 1, "server": "许昌", "player": {"name": "测试", "level": 66, "classId": "warrior"}, "p3": {"reborn": 0}, "battles": 9})


class CloudTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.srv = cloud_api.make_server("127.0.0.1:0")
        cls.port = cls.srv.server_address[1]
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()

    def setUp(self):
        cloud_api._hits.clear()

    def call(self, name, body=None, token=None, origin=None, ip="1.1.1.1"):
        req = urllib.request.Request(f"http://127.0.0.1:{self.port}/api/cloud/{name}", data=json.dumps(body or {}).encode(), method="POST")
        req.add_header("Content-Type", "application/json")
        req.add_header("X-Real-IP", ip)
        if token:
            req.add_header("Authorization", f"Bearer {token}")
        if origin:
            req.add_header("Origin", origin)
        try:
            with urllib.request.urlopen(req) as r:
                return r.status, json.loads(r.read()), dict(r.headers)
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read()), dict(e.headers)

    def test_flow(self):
        st, out, _ = self.call("register", {"account": "曹孟德", "password": "123456"})
        self.assertEqual(st, 200, out)
        tok = out["token"]
        self.assertEqual(out["rev"], 0)
        st, out, _ = self.call("register", {"account": "曹孟德", "password": "abcdef"})
        self.assertEqual(st, 409)
        # 没存档时下载
        self.assertEqual(self.call("download", {}, tok)[0], 404)
        st, out, _ = self.call("upload", {"save": SAVE, "base": 0}, tok)
        self.assertEqual((st, out["rev"], out["summary"]["level"]), (200, 1, 66))
        # 另一台设备登录，上传基于旧版本 → 冲突
        st, out, _ = self.call("login", {"account": "曹孟德", "password": "123456"})
        tok2 = out["token"]
        self.assertEqual(out["rev"], 1)
        st, out, _ = self.call("upload", {"save": SAVE, "base": 0}, tok2)
        self.assertEqual((st, out["error"], out["rev"]), (409, "conflict", 1))
        st, out, _ = self.call("upload", {"save": SAVE, "base": 0, "force": True}, tok2)
        self.assertEqual((st, out["rev"]), (200, 2))
        # 只留最近 3 个版本
        for base in (2, 3, 4):
            self.call("upload", {"save": SAVE, "base": base}, tok)
        st, out, _ = self.call("info", {}, tok)
        self.assertEqual([h["rev"] for h in out["history"]], [5, 4, 3])
        st, out, _ = self.call("download", {"rev": 4}, tok)
        self.assertEqual((st, out["rev"], json.loads(out["save"])["player"]["name"]), (200, 4, "测试"))
        # 退出登录后令牌作废
        self.call("logout", {}, tok)
        self.assertEqual(self.call("info", {}, tok)[0], 401)
        # 改密码：别的设备的登录全部作废
        st, out, _ = self.call("password", {"old": "123456", "password": "654321"}, tok2)
        self.assertEqual(st, 200)
        self.assertEqual(self.call("info", {}, tok2)[0], 401)
        self.assertEqual(self.call("info", {}, out["token"])[0], 200)

    def test_validation(self):
        self.assertEqual(self.call("register", {"account": "ab", "password": "123456"})[1]["error"], "bad_account")
        self.assertEqual(self.call("register", {"account": "abc", "password": "123"})[1]["error"], "bad_password")
        tok = self.call("register", {"account": "validate1", "password": "123456"})[1]["token"]
        self.assertEqual(self.call("upload", {"save": "{\"v\":2}", "base": 0}, tok)[1]["error"], "bad_save")
        self.assertEqual(self.call("upload", {"save": "not json", "base": 0}, tok)[1]["error"], "bad_save")
        self.assertEqual(self.call("info", {}, "nope")[0], 401)
        self.assertEqual(self.call("info", {})[0], 401)

    def test_lock_and_rate(self):
        self.call("register", {"account": "locktest", "password": "123456"}, ip="2.2.2.2")
        for i in range(cloud_api.LOCK_FAILS):
            st, out, _ = self.call("login", {"account": "locktest", "password": "wrong!"}, ip=f"3.3.3.{i}")
            self.assertEqual(st, 401)
        # 锁住后密码对了也进不去
        st, out, _ = self.call("login", {"account": "locktest", "password": "123456"}, ip="4.4.4.4")
        self.assertEqual((st, out["error"]), (429, "locked"))
        # 同一 IP 注册每小时 5 次
        codes = [self.call("register", {"account": f"rate{i}", "password": "123456"}, ip="5.5.5.5")[0] for i in range(7)]
        self.assertEqual(codes[:5], [200] * 5)
        self.assertEqual(codes[5:], [429, 429])

    def test_read_does_not_hold_lock(self):
        import sqlite3
        tok = self.call("register", {"account": "locker", "password": "123456"})[1]["token"]
        self.call("info", {}, tok)
        # 另开一个连接能马上写：说明服务那边没有留着没提交的事务
        c = sqlite3.connect(os.environ["CLOUD_DB"], timeout=0.2)
        c.execute("UPDATE accounts SET fails=0 WHERE account='locker'")
        c.commit()
        c.close()

    def test_cors(self):
        st, out, h = self.call("login", {"account": "nobody", "password": "x"}, origin="https://localhost")
        self.assertEqual(h.get("Access-Control-Allow-Origin"), "https://localhost")
        st, out, h = self.call("login", {"account": "nobody", "password": "x"}, origin="https://evil.example")
        self.assertIsNone(h.get("Access-Control-Allow-Origin"))


if __name__ == "__main__":
    unittest.main()
