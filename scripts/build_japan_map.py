#!/usr/bin/env python3
"""都道府県の境界 GeoJSON を、フロー図の下敷きに使える軽い JS へ落とす。

フロー図は緯度経度を直に投影しているので、地図も緯度経度のまま渡せばよい。
ただし元データは 13MB あり、file:// で開く前提の構成には重すぎる。
Douglas-Peucker で間引き、小さすぎる島を落とし、座標を丸めて桁を削る。

下敷きとして必要なのは輪郭であって正確な面積ではない。1km 程度のずれは
画面上で 0.1px 未満にしかならないので、そこまでの精度は捨てる。

出典: https://github.com/dataofjapan/land (japan.geojson)
"""

from __future__ import annotations

import argparse
import json
import math
import urllib.request
from pathlib import Path

SOURCE = "https://raw.githubusercontent.com/dataofjapan/land/master/japan.geojson"

# 画面上の見え方から決めた値。県境の細かい出入りは下敷きには要らない。
TOLERANCE = 0.008        # 度。おおよそ 800m
MIN_ISLAND = 0.06        # 度。外接矩形の対角がこれ未満の島は落とす
DIGITS = 3               # 度。おおよそ 100m

# 描く窓。フロー図の投影は県庁所在地の外接矩形で決まるので、遠い島まで含めると
# 図全体が縮んで本土が小さくなる。下敷きとしての得より損が大きい。
# 輪郭が丸ごと窓に入るものだけ残す。北方領土・小笠原・大東・先島・奄美が落ちる。
#
# 沖縄だけ窓を分けている。フロー図は沖縄のノードを実際の位置より北西へ寄せており
# （そうしないと図が縦に伸びて本土が潰れる）、地図もそれに合わせて動かすためである。
# 動かす量は描く側が持つ。ここでは実際の位置のまま出す。
WINDOW = {"lat": (29.8, 46.0), "lon": (128.0, 146.0)}
OKINAWA_WINDOW = {"lat": (25.9, 27.2), "lon": (127.0, 128.5)}


def simplify(points: list[tuple[float, float]], tolerance: float) -> list[tuple[float, float]]:
    """Douglas-Peucker。再帰ではなく明示スタックで回す（島によっては深くなる）。"""
    if len(points) < 3:
        return points
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        start, end = stack.pop()
        ax, ay = points[start]
        bx, by = points[end]
        dx, dy = bx - ax, by - ay
        span = math.hypot(dx, dy)
        worst, worst_at = -1.0, -1
        for i in range(start + 1, end):
            px, py = points[i]
            if span == 0:
                distance = math.hypot(px - ax, py - ay)
            else:
                distance = abs(dy * px - dx * py + bx * ay - by * ax) / span
            if distance > worst:
                worst, worst_at = distance, i
        if worst > tolerance and worst_at > 0:
            keep[worst_at] = True
            stack.append((start, worst_at))
            stack.append((worst_at, end))
    return [point for point, flag in zip(points, keep) if flag]


def rings_of(geometry: dict) -> list[list[tuple[float, float]]]:
    """MultiPolygon / Polygon の外周だけを取り出す。穴（湖）は下敷きに要らない。"""
    if geometry["type"] == "Polygon":
        polygons = [geometry["coordinates"]]
    elif geometry["type"] == "MultiPolygon":
        polygons = geometry["coordinates"]
    else:
        raise ValueError(f"扱えない形状: {geometry['type']}")
    return [[(lon, lat) for lon, lat, *_ in polygon[0]] for polygon in polygons]


def diagonal(points: list[tuple[float, float]]) -> float:
    xs = [x for x, _ in points]
    ys = [y for _, y in points]
    return math.hypot(max(xs) - min(xs), max(ys) - min(ys))


def inside(points: list[tuple[float, float]], window: dict) -> bool:
    """輪郭が丸ごと窓に入るか。一部でもはみ出す島は落とす。"""
    lons = [x for x, _ in points]
    lats = [y for _, y in points]
    return (window["lon"][0] <= min(lons) and max(lons) <= window["lon"][1]
            and window["lat"][0] <= min(lats) and max(lats) <= window["lat"][1])


def build(source: dict, tolerance: float, min_island: float) -> list[dict]:
    out = []
    for feature in source["features"]:
        name = feature["properties"]["nam_ja"]
        window = OKINAWA_WINDOW if name == "沖縄県" else WINDOW
        rings = []
        for ring in rings_of(feature["geometry"]):
            if diagonal(ring) < min_island or not inside(ring, window):
                continue
            thinned = simplify(ring, tolerance)
            if len(thinned) < 4:
                continue
            # [lat, lon, lat, lon, ...] の平坦な配列にする。組で持つより2割ほど小さい。
            flat = []
            for lon, lat in thinned:
                flat.append(round(lat, DIGITS))
                flat.append(round(lon, DIGITS))
            rings.append(flat)
        if not rings:
            raise ValueError(f"輪郭が残らなかった: {name}")
        rings.sort(key=len, reverse=True)
        out.append({"name": name, "rings": rings})
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, help="japan.geojson。省略時は取得元から落とす")
    parser.add_argument("--output", type=Path, default=Path("viz/japan.js"))
    parser.add_argument("--tolerance", type=float, default=TOLERANCE)
    parser.add_argument("--min-island", type=float, default=MIN_ISLAND)
    args = parser.parse_args()

    if args.input:
        source = json.loads(args.input.read_text(encoding="utf-8"))
    else:
        print(f"取得中: {SOURCE}")
        with urllib.request.urlopen(SOURCE, timeout=180) as response:
            source = json.loads(response.read().decode("utf-8"))

    prefectures = build(source, args.tolerance, args.min_island)
    body = json.dumps({"prefectures": prefectures}, ensure_ascii=False, separators=(",", ":"))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(f"const JAPAN_MAP = {body};\n", encoding="utf-8")

    rings = sum(len(p["rings"]) for p in prefectures)
    points = sum(len(ring) // 2 for p in prefectures for ring in p["rings"])
    size_kb = args.output.stat().st_size / 1024
    print(f"{args.output}: {len(prefectures)}県 / {rings}輪郭 / {points:,}点 / {size_kb:.0f} KB")


if __name__ == "__main__":
    main()
