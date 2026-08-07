#!/usr/bin/env python3
"""processed CSV を、ヒートマップが読み込む単一の JS ファイルにまとめる。

file:// で開けるよう、JSON を fetch させずに `const OD_DATA = {...}` として吐く。
行列は 47x47 で、対角は県内進学者数（prefectures_*.csv の local_entrants）を入れる。
"""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

from build_od import PREFECTURES

# 軸ラベル用の短縮名。都府県の接尾辞を落とす（北海道はそのまま）。
SHORT_NAMES = tuple(p if p == "北海道" else p[:-1] for p in PREFECTURES)

# 地方ブロックの区切り。ヒートマップに区切り線と地方名を引くために使う。
REGIONS = (
    ("北海道", 1), ("東北", 6), ("関東", 7), ("中部", 9),
    ("近畿", 7), ("中国", 5), ("四国", 4), ("九州沖縄", 8),
)


def load_rows(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--processed-dir", type=Path, default=Path("data/processed"))
    parser.add_argument("--output", type=Path, default=Path("viz/data.js"))
    args = parser.parse_args()

    edges = load_rows(args.processed_dir / "od_edges_all.csv")
    nodes = load_rows(args.processed_dir / "prefectures_all.csv")
    capacity_rows = load_rows(args.processed_dir / "capacity_all.csv")
    schools_path = args.processed_dir / "schools_2025.csv"
    schools_rows = load_rows(schools_path) if schools_path.exists() else []
    paths_path = args.processed_dir / "paths_all.csv"
    paths_rows = load_rows(paths_path) if paths_path.exists() else []
    if sum(int(r["entrants_from_prefecture"]) for r in nodes) == 0:
        raise SystemExit("入力が空。先に build_od.py を実行すること")

    index = {name: i for i, name in enumerate(PREFECTURES)}
    years = sorted({int(row["year"]) for row in nodes})

    matrices = {year: [[0] * len(PREFECTURES) for _ in PREFECTURES] for year in years}
    for row in edges:
        year = int(row["year"])
        origin = index[row["origin_prefecture"]]
        destination = index[row["destination_prefecture"]]
        matrices[year][origin][destination] = int(row["movers"])

    fields = ("local_entrants", "outbound_entrants", "inbound_entrants", "net_inflow")
    totals = {field: {year: [0] * len(PREFECTURES) for year in years} for field in fields}
    for row in nodes:
        year = int(row["year"])
        position = index[row["prefecture"]]
        for field in fields:
            totals[field][year][position] = int(row[field])
        matrices[year][position][position] = int(row["local_entrants"])

    # 大学所在地から見た受け入れ規模。設置者別で、県外・海外出身も含む総入学者数。
    capacity_fields = ("entrants_total", "national", "public", "private")
    capacity = {field: {year: [0] * len(PREFECTURES) for year in years} for field in capacity_fields}
    for row in capacity_rows:
        year = int(row["year"])
        position = index[row["prefecture"]]
        for field in capacity_fields:
            capacity[field][year][position] = int(row[field])

    payload = {
        "years": years,
        "prefectures": list(PREFECTURES),
        "shortNames": list(SHORT_NAMES),
        "regions": [{"name": name, "size": size} for name, size in REGIONS],
        # matrix[年][出身高校所在地][大学所在地] = 入学者数。対角は県内進学。
        "matrix": [matrices[year] for year in years],
        "local": [totals["local_entrants"][year] for year in years],
        "outbound": [totals["outbound_entrants"][year] for year in years],
        "inbound": [totals["inbound_entrants"][year] for year in years],
        "netInflow": [totals["net_inflow"][year] for year in years],
        "capacity": {
            "total": [capacity["entrants_total"][year] for year in years],
            "national": [capacity["national"][year] for year in years],
            "public": [capacity["public"][year] for year in years],
            "private": [capacity["private"][year] for year in years],
        },
    }

    # 出身高校所在地から見た進路の内訳。matrix の行方向と同じ主語で、その分母にあたる。
    if paths_rows:
        path_fields = (
            "graduates", "university", "senmon", "senshu_general",
            "training", "employed", "other", "unknown",
        )
        paths = {field: {year: [0] * len(PREFECTURES) for year in years} for field in path_fields}
        path_years = sorted({int(row["year"]) for row in paths_rows})
        if path_years != years:
            raise SystemExit(f"進路データの年度が OD と揃わない: {path_years} vs {years}")
        for row in paths_rows:
            year = int(row["year"])
            position = index[row["prefecture"]]
            for field in path_fields:
                paths[field][year][position] = int(row[field])
        payload["paths"] = {
            field: [paths[field][year] for year in years] for field in path_fields
        }

    # 学校数は単年度（令和7年度）のみ。年次の入れ替わりがないので配列1本で持つ。
    if schools_rows:
        school_fields = (
            "high_schools", "high_national", "high_public", "high_private",
            "universities", "university_national", "university_public", "university_private",
        )
        schools = {field: [0] * len(PREFECTURES) for field in school_fields}
        for row in schools_rows:
            position = index[row["prefecture"]]
            for field in school_fields:
                schools[field][position] = int(row[field])
        payload["schools"] = {"year": int(schools_rows[0]["year"]), **schools}

    if sum(size for _, size in REGIONS) != len(PREFECTURES):
        raise SystemExit("地方ブロックの合計が47県にならない")

    args.output.parent.mkdir(parents=True, exist_ok=True)
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    args.output.write_text(f"const OD_DATA = {body};\n", encoding="utf-8")
    size_kb = args.output.stat().st_size / 1024
    print(f"{args.output}: {len(years)}年分 / {size_kb:.0f} KB")


if __name__ == "__main__":
    main()
