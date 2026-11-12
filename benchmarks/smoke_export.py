"""Exercise export_mp4 end-to-end without overwriting an existing project."""
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
from types import SimpleNamespace

from render_video import export_mp4


def main():
    source = Path(__file__).resolve().parents[1] / "data/projects/00d6415ee2424b80b9bd064382189a02"
    meta = json.loads((source / "meta.json").read_text(encoding="utf-8"))
    meta["audio_duration_sec"] = 1.0
    settings = SimpleNamespace(width=1080, height=1920, fps=30, render_mode="speed")
    with tempfile.TemporaryDirectory(prefix="scorevideo-export-smoke-") as directory:
        folder = Path(directory)
        shutil.copyfile(source / meta["audio_filename"], folder / meta["audio_filename"])
        export_mp4(folder, meta, settings, lambda *_: None)
        diagnostic = json.loads((folder / "render-diagnostics.json").read_text(encoding="utf-8"))
        result = subprocess.run(["ffprobe", "-v", "error", "-count_frames", "-select_streams", "v:0",
                                 "-show_entries", "stream=nb_read_frames,duration", "-of", "json",
                                 str(folder / "output.mp4")], check=True, capture_output=True, text=True)
        video = json.loads(result.stdout)["streams"][0]
        assert int(video["nb_read_frames"]) == 30
        print(json.dumps({"capture": diagnostic["capture"], "frames": video["nb_read_frames"],
                          "duration": video["duration"], "fps": diagnostic["frame_processing_fps"],
                          "ffmpeg_child_cpu_sec": diagnostic["ffmpeg_child_cpu_sec"],
                          "fallback_reason": diagnostic.get("screencast_fallback_reason")}, indent=2))


if __name__ == "__main__":
    main()
