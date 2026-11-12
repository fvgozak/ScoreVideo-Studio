"""MP4 export entry point for the bundled Playwright Python environment."""
from __future__ import annotations

import json
import sys
import traceback

from app import DATA, RenderRequest
from render_video import export_mp4


def main(project_id: str) -> None:
    folder = DATA / project_id
    meta = json.loads((folder / "meta.json").read_text(encoding="utf-8"))
    settings = RenderRequest.model_validate_json((folder / "render-config.json").read_text(encoding="utf-8"))

    def report(progress: float, message: str) -> None:
        print(json.dumps({"progress": progress, "message": message}), flush=True)

    export_mp4(folder=folder, meta=meta, settings=settings, on_progress=report)


if __name__ == "__main__":
    try:
        main(sys.argv[1])
    except Exception:
        traceback.print_exc()
        sys.exit(1)
