"""Create alpha-enabled sprite sheets from the supplied checkerboard previews."""
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'IconImage'
TARGET = SOURCE / 'transparent'


def checkerboard_mask(pixels: np.ndarray) -> np.ndarray:
    """Select the near-neutral pale preview background, not white clothing."""
    rgb = pixels[..., :3]
    return (rgb.min(axis=2) >= 220) & ((rgb.max(axis=2) - rgb.min(axis=2)) <= 28)


def edge_connected(mask: np.ndarray) -> np.ndarray:
    """Keep only pale pixels connected to a canvas edge through four neighbors."""
    labels, _ = ndimage.label(mask, structure=np.array([[0, 1, 0], [1, 1, 1], [0, 1, 0]], dtype=np.uint8))
    edge_labels = np.unique(np.concatenate((labels[0], labels[-1], labels[:, 0], labels[:, -1])))
    return (labels != 0) & np.isin(labels, edge_labels)


def convert(source: Path, target: Path) -> None:
    """Write one preview sheet with only its surrounding checkerboard made transparent."""
    pixels = np.asarray(Image.open(source).convert('RGBA')).copy()
    transparent = edge_connected(checkerboard_mask(pixels))
    pixels[transparent] = (0, 0, 0, 0)
    Image.fromarray(pixels, 'RGBA').save(target, optimize=True, compress_level=9)


def main() -> None:
    """Regenerate every transparent sprite sheet from the immutable preview images."""
    TARGET.mkdir(exist_ok=True)
    for source in sorted(SOURCE.glob('*.png')):
        convert(source, TARGET / source.name)


if __name__ == '__main__':
    main()
