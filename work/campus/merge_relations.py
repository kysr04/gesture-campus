"""把 OSM 里用 relation 表示的建筑补进 campus.json。

为什么需要这一步：bake.py 当初只查了 way["building"]，而第一教学楼、
实验楼、工程训练中心这类楼是用 multipolygon relation 映射的，全被漏掉。
这是"模型不像校园"的主要原因之一。

关系里的多边形要把若干条 member way 拼成闭合环。楼体通常只有一两条边，
按端点匹配贪心拼接就够用；拼不成闭合环的退化情况取最大的一条边。
"""
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from overpass import query  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
TARGET = os.path.abspath(os.path.join(HERE, "..", "..", "campus", "campus.json"))

BBOX = "40.2455,116.1360,40.2595,116.1520"
LAT0, LON0 = 40.2527, 116.1438
M_LAT = 110540.0
M_LON = 111320.0 * math.cos(math.radians(LAT0))


def to_local(lat, lon):
    return [round((lon - LON0) * M_LON, 2), round((lat - LAT0) * M_LAT, 2)]


def point_in_ring(x, z, ring):
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, zi = ring[i]
        xj, zj = ring[j]
        if (zi > z) != (zj > z) and x < (xj - xi) * (z - zi) / ((zj - zi) or 1e-9) + xi:
            inside = not inside
        j = i
    return inside


def stitch(segments):
    """把若干条点序列按端点拼成环。拼不成就返回最长的那个。"""
    segs = [list(s) for s in segments if len(s) >= 2]
    if not segs:
        return None
    segs.sort(key=len, reverse=True)
    ring = segs.pop(0)
    for _ in range(len(segs) + 1):
        if len(ring) >= 3 and ring[0] == ring[-1]:
            return ring
        if not segs:
            break
        tail = ring[-1]
        for i, s in enumerate(segs):
            if s[0] == tail:
                ring.extend(s[1:])
                segs.pop(i)
                break
            if s[-1] == tail:
                ring.extend(list(reversed(s))[1:])
                segs.pop(i)
                break
    return ring if len(ring) >= 3 else None


def build_height(tags):
    if tags.get("height"):
        try:
            return float(str(tags["height"]).replace("m", "").strip())
        except ValueError:
            pass
    if tags.get("building:levels"):
        try:
            return float(tags["building:levels"]) * 3.2
        except ValueError:
            pass
    return 12.0


def main():
    with open(TARGET, encoding="utf-8") as fh:
        data = json.load(fh)
    have = {b["n"] for b in data["buildings"] if b["n"]}

    els = query('[out:json][timeout:150];relation["building"](%s);out geom;' % BBOX).get("elements", [])
    added = []
    for rel in els:
        tags = rel.get("tags", {})
        name = tags.get("name", "")
        if not name or name in have:
            continue
        outers = []
        for m in rel.get("members", []):
            if m.get("type") != "way" or m.get("role") not in ("outer", ""):
                continue
            g = m.get("geometry") or []
            if len(g) >= 2:
                outers.append([to_local(p["lat"], p["lon"]) for p in g if "lat" in p])
        if not outers:
            continue
        ring = stitch(outers)
        if not ring:
            continue
        xs = [p[0] for p in ring]
        zs = [p[1] for p in ring]
        ccx = sum(xs) / len(xs)
        ccz = sum(zs) / len(zs)
        if not point_in_ring(ccx, ccz, data["campus"]):
            continue
        added.append({"o": ring, "h": round(build_height(tags), 1), "n": name, "k": tags.get("building", "yes")})
        have.add(name)

    data["buildings"].extend(added)
    with open(TARGET, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, separators=(",", ":"))

    print(json.dumps({
        "relations_found": len(els),
        "buildings_added": len(added),
        "names": [b["n"] for b in added],
        "buildings_total": len(data["buildings"]),
        "named_total": sum(1 for b in data["buildings"] if b["n"]),
        "bytes": os.path.getsize(TARGET),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
