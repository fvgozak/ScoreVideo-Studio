"""Cache the exact OSMD browser bundle for offline score/video rendering."""
from pathlib import Path
from urllib.request import Request, urlopen

VERSION = "2.2.1"
URL = f"https://cdn.jsdelivr.net/npm/opensheetmusicdisplay@{VERSION}/build/opensheetmusicdisplay.min.js"
TARGET = Path(__file__).resolve().parent / "static/vendor/opensheetmusicdisplay.min.js"


def main():
    if TARGET.exists() and TARGET.stat().st_size > 100_000:
        print(f"OSMD browser library ready: {TARGET}")
        return
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    print(f"Fetching OpenSheetMusicDisplay {VERSION}...")
    try:
        request = Request(URL, headers={"User-Agent": "ScoreVideoLocal/0.1"})
        with urlopen(request, timeout=45) as r:
            data = r.read(15_000_001)
        if len(data) < 100_000 or len(data) > 15_000_000:
            raise ValueError("Unexpected OSMD bundle size")
        TARGET.write_bytes(data)
        print(f"Cached {len(data):,} bytes. Rendering can now run offline.")
    except Exception as exc:
        print(f"Could not cache OSMD ({exc}). Browser will try the pinned CDN at runtime.")


if __name__ == "__main__":
    main()
