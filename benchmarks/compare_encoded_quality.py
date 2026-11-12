"""Compare decoded MP4 frames from the old and screenshot-free paths."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
from types import SimpleNamespace

from playwright.sync_api import sync_playwright

from render_adaptive import Pipeline, similarity_metrics, target_bitrate
from render_video import stream_frames, stream_screencast_frames


def decoded_samples(video, folder, frames):
    expression = "+".join(f"eq(n\\,{index})" for index in frames)
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(video),
                    "-vf", f"select={expression}", "-vsync", "0", str(folder / "frame-%03d.png")],
                   capture_output=True, check=True, timeout=60)
    return [path.read_bytes() for path in sorted(folder.glob("frame-*.png"))]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("project_id")
    parser.add_argument("--width", type=int, required=True)
    parser.add_argument("--height", type=int, required=True)
    parser.add_argument("--fps", type=int, default=30)
    parser.add_argument("--frames", type=int, default=300)
    args = parser.parse_args()
    folder = Path(__file__).resolve().parents[1] / "data/projects" / args.project_id
    meta = json.loads((folder / "meta.json").read_text())
    config = json.loads((folder / "render-config.json").read_text())
    assert (config["width"], config["height"]) == (args.width, args.height)
    settings = SimpleNamespace(width=args.width, height=args.height, fps=args.fps)
    pipeline = Pipeline("jpeg", "libx264", target_bitrate(args.width, args.height, args.fps))
    samples = [0, args.frames//3, 2*args.frames//3, args.frames-1]
    with tempfile.TemporaryDirectory(prefix="scorevideo-quality-") as temporary, sync_playwright() as playwright:
        root = Path(temporary)
        browser = playwright.chromium.launch(headless=True)
        try:
            page = browser.new_page(viewport={"width": args.width, "height": args.height}, device_scale_factor=1,
                                    reduced_motion="reduce")
            page.goto("http://127.0.0.1:8765/render/" + args.project_id, wait_until="domcontentloaded")
            page.wait_for_function("window.__ready === true || !!window.__renderError", timeout=90000)
            error = page.evaluate("window.__renderError || null")
            if error:
                raise RuntimeError(error)
            legacy, modern = root/"legacy.mp4", root/"screencast.mp4"
            stream_frames(page, None, pipeline, settings, folder/meta["audio_filename"],
                          args.frames/args.fps, legacy, lambda *_: None)
            stream_screencast_frames(page, pipeline, settings, folder/meta["audio_filename"],
                                     args.frames/args.fps, modern, lambda *_: None)
            old_dir, new_dir = root/"old", root/"new"
            old_dir.mkdir(); new_dir.mkdir()
            old = decoded_samples(legacy, old_dir, samples)
            new = decoded_samples(modern, new_dir, samples)
            if len(old) != len(samples) or len(new) != len(samples):
                raise RuntimeError(f"sample count mismatch: {len(old)} vs {len(new)}")
            comparisons = [{"frame": frame, "legacy_sha256": hashlib.sha256(a).hexdigest()[:12],
                            "screencast_sha256": hashlib.sha256(b).hexdigest()[:12],
                            **similarity_metrics(a, b)}
                           for frame, a, b in zip(samples, old, new)]
            print(json.dumps({"resolution": [args.width, args.height], "frames": args.frames,
                              "comparisons": comparisons}, indent=2))
        finally:
            browser.close()


if __name__ == "__main__":
    main()
