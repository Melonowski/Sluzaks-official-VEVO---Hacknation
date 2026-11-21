import shutil
import sys
from pathlib import Path

EXT_DIR = Path(__file__).resolve().parent


def main() -> None:
    target = sys.argv[1].lower() if len(sys.argv) > 1 else ""

    if target in ("firefox", "ff"):
        src = EXT_DIR / "manifest.firefox.json"
    elif target in ("chrome", "chromium", "brave", "edge"):
        src = EXT_DIR / "manifest.chrome.json"
    else:
        print("Użycie: python select_manifest.py [firefox|chrome]")
        sys.exit(1)

    if not src.exists():
        print(f"Brak pliku źródłowego: {src}")
        sys.exit(1)

    dst = EXT_DIR / "manifest.json"
    shutil.copyfile(src, dst)
    print(f"Aktywowano {src.name} -> {dst.name}")


if __name__ == "__main__":
    main()