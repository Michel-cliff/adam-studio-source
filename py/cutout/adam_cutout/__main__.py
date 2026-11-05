"""python -m adam_cutout <image> <out.png>: the image as a paper cut-out (background removed, cropped)."""
import sys

from .cutout import run

if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    run(sys.argv[1], sys.argv[2])
