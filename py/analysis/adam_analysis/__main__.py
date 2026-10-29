"""python -m adam_analysis run <projectDir> --video c01=<path> [--video ...] --steps edit,proxy [--fps 30] [--lang fr] [--force]
python -m adam_analysis legibility <spec.json> <out.json>"""
import argparse
import sys

from .errors import AnalysisError
from .runner import run


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m adam_analysis")
    sub = parser.add_subparsers(dest="command", required=True)
    r = sub.add_parser("run")
    r.add_argument("project_dir")
    r.add_argument("--video", action="append", required=True, help="assetId=path, repeatable")
    r.add_argument("--steps", required=True)
    r.add_argument("--fps", type=int, default=30)
    r.add_argument("--lang")
    r.add_argument("--force", action="store_true")
    acc = sub.add_parser("accent")
    acc.add_argument("spec")
    acc.add_argument("out")
    leg = sub.add_parser("legibility")
    leg.add_argument("spec")
    leg.add_argument("out")
    args = parser.parse_args(argv)
    if args.command == "accent":
        from .accent import run as accent
        accent(args.spec, args.out)
        return 0
    if args.command == "legibility":
        from .legibility import run as legibility
        legibility(args.spec, args.out)
        return 0
    try:
        videos = dict(v.split("=", 1) for v in args.video)
        run(args.project_dir, videos, [s for s in args.steps.split(",") if s], fps=args.fps, lang=args.lang, force=args.force)
    except (AnalysisError, ValueError) as e:
        print(e, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
