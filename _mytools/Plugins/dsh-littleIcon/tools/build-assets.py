"""从 IconImage/transparent 的精灵表切出桌宠用的逐帧 PNG。

源图是同一张 2048x2048 上排布多个角色的精灵表，但排版并不统一：多数表情是 2x2 共
4 个角色，`干活中` 是 3 列 2 行共 6 个。因此脚本不假设四宫格，而是按透明投影自动
找角色：

1. 行投影里找足够宽的空行，把整张表分成若干"行带"（空行少于 20 像素不算分隔）；
2. 每条行带内按列投影找角色段（列投影低于峰值 12% 视为人物之间的浅谷）；
3. 每段内再按实际不透明像素收紧包围盒；
4. 所有角色按自上而下、自左而右排序成帧序列。

帧按底部居中放进统一画布，并按"所有表情里最大的角色"算一个全局缩放，因此同一表情
内不跳帧、表情之间角色大小一致。输出 assets/<name>/1.png … N.png，N 由版面决定，
同时写 assets/frames.json 记录每个表情的帧数；另有 assets/tray.ico。

用法（用 DSH 自带 Python，已含 Pillow）：
    python tools/build-assets.py
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

import numpy as np
from PIL import Image

# 输出目录名 -> 源图名（中文名，与 IconImage/transparent 下一致）。目录名与宿主
# index.js 里的状态名一一对应。
EXPRESSIONS: dict[str, str] = {
    "idle": "待机",
    "working": "干活中",
    "bored": "无聊",
    "sleep": "打盹",
    "happy": "开心",
    "alert": "偷窥",
}

# 判定分隔用的常数，跟素材尺寸绑定：空行带至少 8 像素（最小的真实分隔是 14 像素），
# 列谷低于峰值 12%，角色至少 200 像素宽、300 像素高（更小的段是气泡、齿轮之类的装饰，
# 并入相邻角色）。
MIN_ROW_GAP = 8
COLUMN_VALLEY_RATIO = 0.12
MIN_FIGURE_WIDTH = 200
MIN_FIGURE_HEIGHT = 300
MIN_FIGURES = 4

Box = tuple[int, int, int, int]


def _alpha_mask(sheet: Image.Image) -> "np.ndarray":
    """不透明像素的布尔掩码。"""
    return np.asarray(sheet.getchannel("A"), dtype=np.uint8) > 0


def _runs(flags: "np.ndarray", min_gap: int) -> list[tuple[int, int]]:
    """把布尔序列切成连续为真的区间（闭区间），间隔小于 min_gap 的两段合并。"""
    indexes = np.flatnonzero(flags)
    if indexes.size == 0:
        return []
    spans: list[tuple[int, int]] = []
    start = previous = int(indexes[0])
    for value in indexes[1:]:
        current = int(value)
        if current - previous - 1 >= min_gap:
            spans.append((start, previous))
            start = current
        previous = current
    spans.append((start, previous))
    return spans


def _absorb_short_runs(spans: list[tuple[int, int]], min_size: int) -> list[tuple[int, int]]:
    """把过短的段并入相邻段：装饰（Zzz 气泡、齿轮）不能当成独立角色。"""
    if len(spans) <= 1:
        return spans
    kept: list[list[int]] = [list(spans[0])]
    for start, end in spans[1:]:
        previous = kept[-1]
        if (end - start + 1) < min_size and (start - previous[1]) <= (end - start + 1):
            previous[1] = end
        else:
            kept.append([start, end])
    if (kept[0][1] - kept[0][0] + 1) < min_size and len(kept) > 1:
        kept[1][0] = kept[0][0]
        kept.pop(0)
    return [(start, end) for start, end in kept]


def figure_boxes(sheet: Image.Image) -> list[Box]:
    """按透明投影找出表里每个角色的包围盒，顺序为自上而下、自左而右。"""
    mask = _alpha_mask(sheet)
    row_bands = _absorb_short_runs(_runs(mask.any(axis=1), MIN_ROW_GAP), MIN_FIGURE_HEIGHT)

    boxes: list[Box] = []
    for top, bottom in row_bands:
        band = mask[top:bottom + 1]
        columns = band.sum(axis=0)
        valley = max(1.0, columns.max() * COLUMN_VALLEY_RATIO)
        for left, right in _runs(columns > valley, 1):
            if right - left + 1 < MIN_FIGURE_WIDTH:
                continue
            piece = band[:, left:right + 1]
            rows = np.flatnonzero(piece.any(axis=1))
            cols = np.flatnonzero(piece.any(axis=0))
            boxes.append((left + int(cols[0]), top + int(rows[0]),
                          left + int(cols[-1]) + 1, top + int(rows[-1]) + 1))

    if len(boxes) < MIN_FIGURES:
        raise SystemExit(
            f"found {len(boxes)} figures in the sheet, expected at least {MIN_FIGURES}; "
            f"adjust the projection constants for this artwork")
    return boxes


def assert_single_figure(sprite: Image.Image, label: str) -> None:
    """拒绝"一帧里塞了整张表"：那样裁剪框中段会横贯一条透明带。"""
    alpha = sprite.getchannel("A")
    middle = alpha.crop((0, alpha.height // 2, alpha.width, alpha.height // 2 + 1))
    if middle.getbbox() is None:
        raise SystemExit(
            f"{label} looks like a whole sheet rather than one figure "
            f"(transparent band across the middle of its crop)")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", default=str(Path(__file__).resolve().parent.parent / "IconImage" / "transparent"))
    parser.add_argument("--out", default=str(Path(__file__).resolve().parent.parent / "assets"))
    parser.add_argument("--size", type=int, default=256, help="输出画布边长（像素）")
    parser.add_argument("--limit", type=int, default=0, help="只处理前 N 个表达式（调试用）")
    args = parser.parse_args()

    source = Path(args.source)
    out = Path(args.out)
    names = list(EXPRESSIONS.items())
    if args.limit:
        names = names[: args.limit]

    sheets: dict[str, tuple[list[Image.Image], tuple[int, int]]] = {}
    for name, label in names:
        path = source / f"{label}.png"
        if not path.is_file():
            raise SystemExit(f"missing source sheet: {path}")
        sheet = Image.open(path).convert("RGBA")
        sprites = []
        for index, box in enumerate(figure_boxes(sheet), start=1):
            sprite = sheet.crop(box)
            assert_single_figure(sprite, f"{label} frame {index}")
            sprites.append(sprite)
        canvas = (max(s.width for s in sprites), max(s.height for s in sprites))
        sheets[name] = (sprites, canvas)

    # 一个全局缩放：所有表情里最大的角色映射到 size，角色大小因此一致。
    widest = max(canvas[0] for _, canvas in sheets.values())
    tallest = max(canvas[1] for _, canvas in sheets.values())
    scale = args.size / max(widest, tallest)

    counts: dict[str, int] = {}
    for name, (sprites, canvas) in sheets.items():
        target = out / name
        target.mkdir(parents=True, exist_ok=True)
        for index, sprite in enumerate(sprites, start=1):
            frame_w = max(1, round(sprite.width * scale))
            frame_h = max(1, round(sprite.height * scale))
            frame = sprite.resize((frame_w, frame_h), Image.LANCZOS)
            # 底部居中：角色"站"在同一水平线上，切帧时不上下跳。
            page = Image.new("RGBA", (args.size, args.size), (0, 0, 0, 0))
            page.alpha_composite(frame, ((args.size - frame_w) // 2, args.size - frame_h))
            page.save(target / f"{index}.png", optimize=True)
        counts[name] = len(sprites)
        print(f"{name}: canvas {canvas[0]}x{canvas[1]} -> {len(sprites)} frames on {args.size}x{args.size}")

    # newline="\n" 让 Windows 上生成的文件也是 LF，git 不会报告行尾改写。
    (out / "frames.json").write_text(json.dumps(counts, indent=2) + "\n", encoding="utf-8", newline="\n")

    # 托盘图标单独出一个多尺寸 .ico：PowerShell 用文件名构造 System.Drawing.Icon
    # 没有重载歧义，比拿 HICON 句柄再转换可靠。
    icon = Image.open(out / "idle" / "1.png")
    icon.save(out / "tray.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (256, 256)])
    print("wrote tray.ico from idle/1.png")

    total = sum(os.path.getsize(out / name / f"{index + 1}.png")
                for name, count in counts.items() for index in range(count))
    print(f"wrote {sum(counts.values())} frames under {out} ({total / 1024:.0f} KB total); frames.json: {counts}")


if __name__ == "__main__":
    main()
