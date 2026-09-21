"""Convert a Tonghuashun ledger export (.xlsx) into the position snapshot the
dsh-ths-holdings plugin reads.

Usage:  python ths-export-positions.py <export.xlsx> [-o <positions.json>]

The export's 持仓数据 sheet carries one row per holding plus a trailing 汇总
row. Only each holding's quantity reaches the plugin: the day P&L there is
measured against the previous close the quote feed reports, so the exported cost
is carried for reference rather than used as a baseline.

The default output is positions.json next to this script - the one file the
plugin reads, and the one file to replace when the holdings change.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
from pathlib import Path

try:
    import openpyxl
except ImportError:  # pragma: no cover - environment guidance only
    sys.exit("openpyxl is required: run this through the DSH bundled Python, or pip install openpyxl")

SHEET = "持仓数据"
SUMMARY_LABEL = "汇总"
SNAPSHOT_NAME = "positions.json"


def default_output() -> Path:
    """The plugin's own snapshot file, resolved from this script's location."""
    return Path(__file__).resolve().parent / SNAPSHOT_NAME


def number(value) -> float | None:
    if value is None or value == "":
        return None
    return float(value)


def text(value) -> str:
    return "" if value is None else str(value).strip()


def convert(export: Path) -> dict:
    workbook = openpyxl.load_workbook(export, data_only=True, read_only=True)
    if SHEET not in workbook.sheetnames:
        sys.exit(f"{export} has no {SHEET!r} sheet; sheets are {workbook.sheetnames}")
    sheet = workbook[SHEET]
    rows = list(sheet.iter_rows(values_only=True))
    header = [text(cell) for cell in rows[0]]
    column = {name: index for index, name in enumerate(header)}

    missing = [name for name in ("代码", "名称", "持有数量", "单位成本") if name not in column]
    if missing:
        sys.exit(f"{SHEET!r} is missing the column(s) {missing}; header is {header}")

    exported_at = dt.datetime.fromtimestamp(export.stat().st_mtime).astimezone()
    export_date = exported_at.date()

    positions: list[dict] = []
    for row in rows[1:]:
        code = text(row[column["代码"]])
        if code == "" or code == SUMMARY_LABEL:
            continue
        quantity = number(row[column["持有数量"]])
        cost = number(row[column["单位成本"]])
        if not quantity or cost is None:
            print(f"skip {code}: no quantity/cost in the export", file=sys.stderr)
            continue
        positions.append({
            "code": code,
            "name": text(row[column["名称"]]),
            "qty": quantity,
            "cost": cost,
        })

    return {
        "exported_at": exported_at.isoformat(),
        "export_date": export_date.isoformat(),
        "source_file": str(export),
        "positions": positions,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("export", type=Path, help="the ledger .xlsx export")
    parser.add_argument("-o", "--out", type=Path, default=None, help="output JSON path")
    args = parser.parse_args()

    if not args.export.is_file():
        sys.exit(f"no such export: {args.export}")

    snapshot = convert(args.export)
    out = args.out or default_output()
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"positions: {len(snapshot['positions'])}  (exported {snapshot['exported_at'][:16]})")
    for position in snapshot["positions"]:
        print(f"  {position['code']}  {position['name']}  qty={position['qty']:g}  cost={position['cost']:g}")
    print(f"written: {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
