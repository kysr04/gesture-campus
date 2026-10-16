"""
把昌平校区的 OSM 数据烘成一份精简 JSON，供前端直接加载。

为什么构建期烘而不是运行时拉：Overpass 在国内不稳（实测 502 过），
不能让它变成页面打开时的依赖。

坐标系：以校区中心为原点的局部平面，单位米。经度按纬度做余弦收缩，
校区只有一公里量级，这个近似的误差远小于数据本身的精度。
"""
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from overpass import query  # noqa: E402

CAMPUS_WAY = 629215836
BBOX = "40.2455,116.1360,40.2595,116.1520"
LAT0, LON0 = 40.2527, 116.1438

M_PER_DEG_LAT = 110540.0
M_PER_DEG_LON = 111320.0 * math.cos(math.radians(LAT0))

DEFAULT_HEIGHT = 12.0
M_PER_LEVEL = 3.2

# 只保留这些道路等级，人行小径也要，但要剔掉纯标注线
ROAD_KINDS = {
    "motorway", "trunk", "primary", "secondary", "tertiary",
    "unclassified", "residential", "service", "footway", "path", "cycleway",
}


def to_local(lat, lon):
    return [round((lon - LON0) * M_PER_DEG_LON, 2), round((lat - LAT0) * M_PER_DEG_LAT, 2)]


def centroid(ring):
    n = len(ring)
    return sum(p[0] for p in ring) / n, sum(p[1] for p in ring) / n


def point_in_ring(x, y, ring):
    """射线法。ring 已经转成局部米坐标。"""
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / ((yj - yi) or 1e-9) + xi:
            inside = not inside
        j = i
    return inside


def build_height(tags):
    if tags.get("height"):
        try:
            return float(str(tags["height"]).replace("m", "").strip())
        except ValueError:
            pass
    if tags.get("building:levels"):
        try:
            return float(tags["building:levels"]) * M_PER_LEVEL
        except ValueError:
            pass
    return DEFAULT_HEIGHT


def geom_to_ring(geometry):
    return [to_local(p["lat"], p["lon"]) for p in geometry if "lat" in p]


def step(label, q):
    """一次只拉一类要素。混在一起导致整条查询超限，三个镜像全返回 5xx。"""
    print("  拉取 %s …" % label, file=sys.stderr)
    return query(q).get("elements", [])


def main():
    campus_els = step("校园边界", '[out:json][timeout:120];way(%d);out geom;' % CAMPUS_WAY)
    campus_ring = None
    for el in campus_els:
        geom = el.get("geometry") or []
        if el.get("id") == CAMPUS_WAY and len(geom) >= 3:
            campus_ring = geom_to_ring(geom)
    if campus_ring is None:
        raise SystemExit("没拿到校园边界，后面选择建筑就没法判断内外")

    build_els = step("建筑", '[out:json][timeout:180];way["building"](%s);out geom;' % BBOX)
    road_els = step("道路", '[out:json][timeout:180];way["highway"](%s);out geom;' % BBOX)
    green_els = step(
        "绿地水系",
        '[out:json][timeout:180];way["leisure"~"^(pitch|park|garden)$"](%s);out geom;' % BBOX)

    buildings, roads, greens = [], [], []

    for el in build_els + road_els + green_els:
        geom = el.get("geometry") or []
        if len(geom) < 3:
            continue
        tags = el.get("tags", {})
        ring = geom_to_ring(geom)

        if tags.get("building"):
            cx, cy = centroid(ring)
            if not point_in_ring(cx, cy, campus_ring):
                continue                          # 校外的楼不要
            buildings.append({
                "o": ring,
                "h": round(build_height(tags), 1),
                "n": tags.get("name", ""),
                "k": tags.get("building", "yes"),
            })
            continue
        if tags.get("highway") in ROAD_KINDS:
            roads.append({"o": ring, "w": tags.get("highway")})
            continue
        if tags.get("leisure"):
            greens.append({
                "o": ring,
                "k": tags.get("leisure"),
                "n": tags.get("name", ""),
            })

    out = {
        "name": "北京化工大学(昌平校区)",
        "origin": {"lat": LAT0, "lon": LON0},
        "campus": campus_ring,
        "buildings": buildings,
        "roads": roads,
        "greens": greens,
    }

    dest = os.path.join(os.path.dirname(os.path.abspath(__file__)), "campus.json")
    with open(dest, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))

    named = [b for b in buildings if b["n"]]
    print(json.dumps({
        "written": dest,
        "bytes": os.path.getsize(dest),
        "campus_ring_points": len(campus_ring or []),
        "buildings": len(buildings),
        "buildings_named": len(named),
        "roads": len(roads),
        "greens": len(greens),
        "height_range": [min(b["h"] for b in buildings), max(b["h"] for b in buildings)] if buildings else None,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
