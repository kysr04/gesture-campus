"""
Overpass 查询小工具。

注意两点，都是踩过的坑：
  - 必须带 User-Agent，否则 overpass-api.de 直接返回 406。
  - 出错时它返回的是 HTML 错误页而不是 JSON，直接解析会崩。
"""
import json
import time
import sys
import urllib.parse
import urllib.request

ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://overpass.osm.jp/api/interpreter",
]
UA = "codex-campus-research/1.0 (contact: local dev)"


def query(q, timeout=180):
    data = urllib.parse.urlencode({"data": q}).encode()
    raw = None
    last = None
    # 服务端经常过载，同一个镜像也要多试几次
    for attempt in range(2):
        for ep in ENDPOINTS:
            req = urllib.request.Request(ep, data=data, headers={
                "User-Agent": UA,
                "Accept": "application/json",
            })
            try:
                with urllib.request.urlopen(req, timeout=timeout) as resp:
                    raw = resp.read().decode("utf-8", "replace")
                break
            except Exception as exc:  # noqa: BLE001
                last = exc
                print("  镜像失败 %s: %s" % (ep, exc), file=sys.stderr)
        if raw is not None:
            break
        print("  全部镜像失败，等 8 秒重试…", file=sys.stderr)
        time.sleep(8)
    if raw is None:
        raise SystemExit("所有 Overpass 镜像都失败：%s" % last)
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        raise SystemExit("Overpass 没有返回 JSON，前 400 字符:\n" + raw[:400])


def find_named(pattern, bbox=None):
    # 名字模糊搜不限定范围会全库扫描，Overpass 直接 502。用地理范围框住。
    scope = "(%s)" % bbox if bbox else ""
    q = '[out:json][timeout:120];nwr["name"~"%s"]%s;out tags center;' % (pattern, scope)
    data = query(q)
    for el in data.get("elements", []):
        t = el.get("tags", {})
        c = el.get("center") or {}
        print("type=%-8s id=%-12s name=%s%s  center=%s,%s" % (
            el.get("type"), el.get("id"), t.get("name", ""),
            ("  [" + t.get("amenity", t.get("landuse", "")) + "]") if (t.get("amenity") or t.get("landuse")) else "",
            c.get("lat"), c.get("lon")))


if __name__ == "__main__":
    find_named(sys.argv[1] if len(sys.argv) > 1 else "北京化工大学")
