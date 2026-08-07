#!/usr/bin/env python3
"""viz/*.html が読む自前の js/css に、中身から作った版を付ける。

GitHub Pages は `cache-control: max-age=600` を返す。ブラウザは10分のあいだ
再検証せずに手元のものを使うので、配信直後の再訪者には古い js が渡る。
data.js だけ古いと進路のないデータで動くことになり、画面が壊れる。

URL が変われば別の資源として取りに行くので、`?v=<中身のハッシュ>` を付ける。
中身が変わらなければ版も変わらず、キャッシュはそのまま効く。

`build_viz_data.py` の最後から呼ばれる。css や shared/*.js だけを直したときは、
このスクリプトを単体で実行する。
"""

from __future__ import annotations

import argparse
import hashlib
import re
from pathlib import Path

# src="..." / href="..." のうち、同じ場所に置いた js と css だけを対象にする。
REFERENCE = re.compile(r'((?:src|href)=")([^"?:]+\.(?:js|css))(?:\?v=[0-9a-f]+)?(")')


def version_of(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()[:8]


def stamp(html: Path) -> int:
    text = html.read_text(encoding="utf-8")
    changed = 0

    def replace(match: re.Match[str]) -> str:
        nonlocal changed
        target = html.parent / match.group(2)
        if not target.exists():
            raise SystemExit(f"参照先がない: {match.group(2)} ({html.name})")
        changed += 1
        return f"{match.group(1)}{match.group(2)}?v={version_of(target)}{match.group(3)}"

    updated = REFERENCE.sub(replace, text)
    if updated != text:
        html.write_text(updated, encoding="utf-8")
    return changed


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--viz-dir", type=Path, default=Path("viz"))
    args = parser.parse_args()

    pages = sorted(args.viz_dir.glob("*.html"))
    if not pages:
        raise SystemExit(f"HTML がない: {args.viz_dir}")
    for page in pages:
        print(f"{page}: {stamp(page)}件に版を付けた")


if __name__ == "__main__":
    main()
