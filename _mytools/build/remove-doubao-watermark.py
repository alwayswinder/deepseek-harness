"""Remove the "豆包AI生成" watermark that Doubao bakes into generated images.

The watermark is part of the pixels, so there is no clean original to extract:
this recolours the covered area from the surrounding image instead. It works
well on even backgrounds (sky, ground, cloth) and produces a soft blur where the
watermark covers detailed subject matter.

Usage:
    python remove-doubao-watermark.py --path <file-or-dir> [--out DIR]
"""

import argparse
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

# Watermark bounding box measured on a 1536x1536 render, with a few pixels of
# clearance. Every other size scales linearly from this reference.
REFERENCE_SIZE = 1536
REFERENCE_BOX = (1244, 1432, 1518, 1515)

# Glyph outlines traced from a reference render; scaled onto other sizes.
MASK_TEMPLATE = Path(__file__).with_name("doubao-watermark-mask.png")

IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".bmp"}


def watermark_box(width: int, height: int) -> tuple[int, int, int, int]:
    """Scale the reference watermark box to the given image size."""
    x0, y0, x1, y1 = REFERENCE_BOX
    scale_x = width / REFERENCE_SIZE
    scale_y = height / REFERENCE_SIZE
    return (
        max(0, int(x0 * scale_x)),
        max(0, int(y0 * scale_y)),
        min(width, int(np.ceil(x1 * scale_x))),
        min(height, int(np.ceil(y1 * scale_y))),
    )


def grow(mask: np.ndarray, rounds: int) -> np.ndarray:
    """Dilate a boolean mask with a 4-neighbourhood."""
    for _ in range(rounds):
        out = mask.copy()
        out[1:, :] |= mask[:-1, :]
        out[:-1, :] |= mask[1:, :]
        out[:, 1:] |= mask[:, :-1]
        out[:, :-1] |= mask[:, 1:]
        mask = out
    return mask


def feather_weight(mask: np.ndarray, radius: int = 8) -> np.ndarray:
    """Blend weight: 1 inside the mask, ramping to 0 across `radius` pixels outside.

    Without the ramp the patched block meets the untouched image on a hard edge,
    which shows up as a visible rectangle on flat backgrounds.
    """
    weight = np.zeros(mask.shape, dtype=np.float64)
    weight[mask] = 1.0
    previous = mask
    for step in range(1, radius + 1):
        grown = grow(previous, 1)
        ring = grown & ~previous
        weight[ring] = 1.0 - step / (radius + 1.0)
        previous = grown
    return weight


def build_mask(patch: np.ndarray) -> np.ndarray:
    """Select the watermark glyphs inside the bounding box.

    The glyphs sit at a fixed position at a fixed size, but their colour follows
    the background (bright on dark renders, dark on light ones), so colour alone
    is unreliable. The stored template carries the glyph outlines; colour
    detection is only the fallback when the template is unavailable.
    """
    height, width = patch.shape[:2]
    if MASK_TEMPLATE.exists():
        template = Image.open(MASK_TEMPLATE).convert("L").resize((width, height), Image.LANCZOS)
        mask = np.asarray(template) > 96
        if mask.sum() > 0.05 * mask.size:
            return mask

    high = patch.max(axis=2).astype(np.int16)
    low = patch.min(axis=2).astype(np.int16)
    mask = (high > 175) & ((high - low) < 36)
    if mask.sum() < 300:
        mask = np.ones(mask.shape, dtype=bool)
    return grow(mask, 4)


def interpolate_rows(patch: np.ndarray, mask: np.ndarray) -> np.ndarray:
    """Seed the masked pixels by interpolating across each row."""
    height, width = mask.shape
    seeded = patch.astype(np.float64).copy()
    columns = np.arange(width)
    for row in range(height):
        known = np.where(~mask[row])[0]
        if len(known) < 2:
            continue
        for channel in range(3):
            seeded[row, :, channel] = np.interp(
                columns, known, patch[row, known, channel]
            )
    return seeded


def harmonic_fill(seeded: np.ndarray, mask: np.ndarray, iterations: int = 2500) -> np.ndarray:
    """Solve a Laplace equation over the masked pixels for a seamless gradient."""
    work = seeded
    interior = mask[1:-1, 1:-1]
    for _ in range(iterations):
        average = (
            work[:-2, 1:-1]
            + work[2:, 1:-1]
            + work[1:-1, :-2]
            + work[1:-1, 2:]
        ) / 4.0
        work[1:-1, 1:-1] = np.where(interior[..., None], average, work[1:-1, 1:-1])
    return work


def donor_detail(image: np.ndarray, box: tuple[int, int, int, int]) -> np.ndarray:
    """Sample high-frequency detail from clean image area above or below the box."""
    x0, y0, x1, y1 = box
    height, width = y1 - y0, x1 - x0
    gap = int(height * 2.2)
    if y0 - gap >= 0:
        patch = image[y0 - gap:y0 - gap + height, x0:x1]
    elif y1 + gap <= image.shape[0]:
        patch = image[y1:y1 + height, x0:x1]
    else:
        return np.zeros((height, width, 3), dtype=np.float64)

    smooth = Image.fromarray(patch.astype(np.uint8)).filter(ImageFilter.GaussianBlur(3))
    detail = patch.astype(np.float64) - np.asarray(smooth).astype(np.float64)
    return detail


def process_image(source: Path, destination: Path) -> str:
    """Remove the watermark from one image and report what was done."""
    image = Image.open(source).convert("RGB")
    pixels = np.asarray(image).astype(np.uint8).copy()
    box = watermark_box(*image.size)
    x0, y0, x1, y1 = box

    patch = pixels[y0:y1, x0:x1]
    mask = build_mask(patch)
    seeded = interpolate_rows(patch, mask)
    filled = harmonic_fill(seeded, mask)

    detail = donor_detail(pixels, box)
    if detail.shape[:2] == mask.shape:
        filled = filled + detail * mask[..., None] * 0.45

    weight = feather_weight(mask, 8)[..., None]
    original = pixels[y0:y1, x0:x1].astype(np.float64)
    blended = original * (1.0 - weight) + np.clip(filled, 0, 255) * weight
    pixels[y0:y1, x0:x1] = blended.astype(np.uint8)
    Image.fromarray(pixels).save(destination, format="PNG")

    coverage = 100.0 * mask.mean()
    return f"{destination.name}: box={box[2]-box[0]}x{box[3]-box[1]} mask={coverage:.0f}%"


def collect_sources(path: Path) -> list[Path]:
    """Resolve a file or directory argument into the image list to process."""
    if path.is_file():
        return [path]
    if path.is_dir():
        return sorted(
            item for item in path.iterdir()
            if item.is_file() and item.suffix.lower() in IMAGE_SUFFIXES
        )
    raise FileNotFoundError(f"no such file or directory: {path}")


def main() -> int:
    """Parse arguments, process every input, and print a one-line summary each."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--path", required=True, type=Path, help="image file or directory")
    parser.add_argument(
        "--out",
        type=Path,
        help="output directory (default: alongside the source, suffixed -nowm)",
    )
    args = parser.parse_args()

    sources = collect_sources(args.path)
    if not sources:
        print("no images found", file=sys.stderr)
        return 1

    if args.out:
        args.out.mkdir(parents=True, exist_ok=True)

    for source in sources:
        if args.out:
            destination = args.out / f"{source.stem}-nowm.png"
        else:
            destination = source.with_name(f"{source.stem}-nowm.png")
        print(process_image(source, destination))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
