"""
把已烘好的 campus.json 里的道路和绿地裁到校园多边形内。

建筑当初就按"质心在校园内"过滤过了，道路和绿地没做——结果周边城区的
路网全进来了，画面上全是穿出校园的线。这里补上，不用再拉一次 Overpass。

道路用的是简化裁剪：只保留两端都在校园内的线段。精确的多边形裁剪要复杂得多，
而校外的部分本来就要丢掉，简化版的结果是一样的。
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "campus.json")


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


def main():
    with open(SRC, encoding="utf-8") as fh:
        data = json.load(fh)

    ring = data.get("campus")
    if not ring:
        raise SystemExit("没有校园边界，无法裁剪")

    xs = [p[0] for p in ring]
    zs = [p[1] for p in ring]
    minx, maxx, minz, maxz = min(xs), max(xs), min(zs), max(zs)

    # 先过外接矩形快速排除，再对剩下的做精确判定
    def inside(pt):
        x, z = pt
        if not (minx <= x <= maxx and minz <= z <= maxz):
            return False
        return point_in_ring(x, z, ring)

    roads_before = len(data["roads"])
    kept_roads, dropped_segments = [], 0
    for road in data["roads"]:
        pts = road["o"]
        runs, run = [], []
        for i in range(len(pts) - 1):
            a, b = pts[i], pts[i + 1]
            if inside(a) and inside(b):
                if not run:
                    run = [a]
                run.append(b)
            else:
                dropped_segments += 1
                if len(run) >= 2:
                    runs.append(run)
                run = []
        if len(run) >= 2:
            runs.append(run)
        for r in runs:
            kept_roads.append({"o": r, "w": road.get("w", "")})

    greens_before = len(data["greens"])
    kept_greens = []
    for g in data["greens"]:
        pts = g["o"]
        cx = sum(p[0] for p in pts) / len(pts)
        cz = sum(p[1] for p in pts) / len(pts)
        if inside((cx, cz)):
            kept_greens.append(g)

    data["roads"] = kept_roads
    data["greens"] = kept_greens

    with open(SRC, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, separators=(",", ":"))

    print(json.dumps({
        "roads": [roads_before, len(kept_roads)],
        "dropped_segments": dropped_segments,
        "greens": [greens_before, len(kept_greens)],
        "buildings": len(data["buildings"]),
        "bytes": os.path.getsize(SRC),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
