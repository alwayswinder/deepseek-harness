#!/usr/bin/env python3
"""带登录态下载 B 站视频，供素材库使用。

登录态来自 bili_login.py 生成的 cookies.txt；没有 cookies 时按游客档位下载。
ffmpeg 自动从 PATH 或 imageio_ffmpeg 定位，找不到时退回单文件格式。

示例:
    python bili_dl.py "https://www.bilibili.com/video/BV1xx411c7xx" -o D:\\素材\\Video
"""
from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys

DEFAULT_COOKIES = os.path.join(os.path.expanduser("~"), ".bili", "cookies.txt")

# 默认偏好 H.264：剪辑软件与 3ds Max / UE 的贴图播放兼容性最好。
CODEC_FORMATS = {
    "avc1": "bv*[vcodec^=avc1]+ba/bv*[vcodec^=avc1]/bv*+ba/b",
    "hevc": "bv*[vcodec^=hev]+ba/bv*[vcodec^=hev]/bv*+ba/b",
    "any": "bv*+ba/b",
}


def find_ffmpeg() -> str | None:
    exe = shutil.which("ffmpeg")
    if exe:
        return exe
    try:
        import imageio_ffmpeg

        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:  # noqa: BLE001 - 没有 ffmpeg 也能下单流格式，只是不能合并
        return None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("url", help="视频地址或 BV 号")
    ap.add_argument("-o", "--out", default=os.environ.get("BILI_OUT", os.path.join(os.getcwd(), "downloads")))
    ap.add_argument("--cookies", default=DEFAULT_COOKIES, help="bili_login.py 生成的 cookies.txt")
    ap.add_argument("--codec", choices=sorted(CODEC_FORMATS), default="avc1")
    ap.add_argument("--extra", nargs=argparse.REMAINDER, help="追加给 yt-dlp 的参数")
    args = ap.parse_args()

    os.makedirs(args.out, exist_ok=True)

    cmd = [
        sys.executable,
        "-m",
        "yt_dlp",
        "-f",
        CODEC_FORMATS[args.codec],
        "--merge-output-format",
        "mp4",
        "--no-playlist",
        "--newline",
        "-o",
        os.path.join(args.out, "%(title)s [%(id)s].%(ext)s"),
    ]

    ffmpeg = find_ffmpeg()
    if ffmpeg:
        cmd += ["--ffmpeg-location", ffmpeg]
    else:
        print("提示: 未找到 ffmpeg，将退化为单流下载（可能无音轨或画质档位受限）", flush=True)

    if os.path.exists(args.cookies):
        cmd += ["--cookies", args.cookies]
        print(f"登录态: {args.cookies}", flush=True)
    else:
        print(f"提示: 未找到 {args.cookies}，按游客档位下载（最高 720P）", flush=True)

    if args.extra:
        cmd += [a for a in args.extra if a]

    cmd.append(args.url)
    return subprocess.call(cmd)


if __name__ == "__main__":
    raise SystemExit(main())
