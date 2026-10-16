"""探一下昌平校区在 OSM 里的数据底子：有多少楼、有没有层数和名称。"""
import collections
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from overpass import query  # noqa: E402

# 昌平校区中心 40.2527, 116.1438，取一个略大的方框
BBOX = "40.2455,116.1360,40.2595,116.1520"


def main():
    q = '[out:json][timeout:120];way["building"](%s);out tags;' % BBOX
    els = query(q).get("elements", [])
    print("建筑轮廓数:", len(els))

    tags = [e.get("tags", {}) for e in els]
    print("有名称:", sum(1 for t in tags if t.get("name")))
    print("有层数:", sum(1 for t in tags if t.get("building:levels")))
    print("有高度:", sum(1 for t in tags if t.get("height")))
    print("类型分布:", dict(collections.Counter(t.get("building") for t in tags).most_common(8)))

    named = [(t.get("name"), t.get("building:levels")) for t in tags if t.get("name")]
    print("\n带名称的建筑（前 25 个）:")
    for name, lv in named[:25]:
        print("   %-28s 层数=%s" % (name, lv or "-"))

    q2 = '[out:json][timeout:60];way(629215836);out tags center;'
    way = query(q2).get("elements", [])
    if way:
        print("\n校园多边形标签:", way[0].get("tags"))


if __name__ == "__main__":
    main()
