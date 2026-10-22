"""Cross-platform entry point: rebuild the catalog and open the browser."""
import argparse
import importlib.util
import json
import webbrowser
from pathlib import Path

BASE = Path(__file__).resolve().parent


def main():
    parser = argparse.ArgumentParser(description='Build and open SkillShelf.')
    parser.add_argument('--no-open', action='store_true', help='Build without opening a browser.')
    args = parser.parse_args()
    spec = importlib.util.spec_from_file_location('builder', BASE / 'build-tool.py')
    builder = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(builder)
    print(json.dumps(builder.build(), ensure_ascii=True))
    if not args.no_open:
        webbrowser.open((BASE / 'Skills查詢工具.html').as_uri())


if __name__ == '__main__':
    main()
