"""查一下校区范围里有多少建筑是 relation（多边形关系）而不是 way。

当初 bake.py 只查了 way["building"]，如果有些楼是用 relation 映射的，
就会被整片漏掉。
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from overpass import query  # noqa: E402

BBOX = "40.2455,116.1360,40.2595,116.1520"


def main():
    for kind in ("relation", "way"):
        q = '[out:json][timeout:150];%s["building"](%s);out tags;' % (kind, BBOX)
        els = query(q).get("elements", [])
        named = [e["tags"]["name"] for e in els if e.get("tags", {}).get("name")]
        print("%-9s 建筑 %3d 个，有名 %2d 个" % (kind, len(els), len(named)))
        for n in named[:40]:
            print("     ", n)
        print()


if __name__ == "__main__":
    main()
