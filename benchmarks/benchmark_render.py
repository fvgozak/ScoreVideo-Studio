"""Repeat a fixed deterministic render segment without changing project files.

Run with the local ScoreVideo server active. The project render-config should
match --width/--height; --fps controls the sampled time grid independently.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import platform
import statistics
import subprocess
import tempfile
from types import SimpleNamespace

from playwright.sync_api import sync_playwright

from render_adaptive import Pipeline, target_bitrate
from render_video import stream_frames, stream_screencast_frames


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("project_id")
    parser.add_argument("--base-url", default="http://127.0.0.1:8765")
    parser.add_argument("--width", type=int, default=1080)
    parser.add_argument("--height", type=int, default=1920)
    parser.add_argument("--fps", type=int, default=30)
    parser.add_argument("--frames", type=int, default=300)
    parser.add_argument("--repeats", type=int, default=2)
    parser.add_argument("--path", choices=("legacy", "screencast"), default="legacy")
    args = parser.parse_args()
    folder = Path(__file__).resolve().parents[1] / "data" / "projects" / args.project_id
    meta = json.loads((folder / "meta.json").read_text(encoding="utf-8"))
    config = json.loads((folder / "render-config.json").read_text(encoding="utf-8"))
    if (config["width"], config["height"]) != (args.width, args.height):
        parser.error("project render-config dimensions differ from requested viewport")
    audio = folder / meta["audio_filename"]
    duration = args.frames / args.fps
    if duration > meta["audio_duration_sec"]:
        parser.error("requested segment is longer than the project's audio")
    settings = SimpleNamespace(width=args.width, height=args.height, fps=args.fps)
    pipeline = Pipeline("jpeg", "libx264", target_bitrate(args.width, args.height, args.fps))
    samples = []
    with tempfile.TemporaryDirectory(prefix="scorevideo-render-bench-") as temp, sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        try:
            page = browser.new_page(viewport={"width": args.width, "height": args.height},
                                    device_scale_factor=1, reduced_motion="reduce")
            page.goto(args.base_url.rstrip("/") + "/render/" + args.project_id,
                      wait_until="domcontentloaded", timeout=30_000)
            page.wait_for_function("window.__ready === true || !!window.__renderError", timeout=90_000)
            error = page.evaluate("window.__renderError || null")
            if error:
                raise RuntimeError(error)
            for repeat in range(args.repeats):
                output = Path(temp) / f"repeat-{repeat}.mp4"
                if args.path == "screencast":
                    stats = stream_screencast_frames(page, pipeline, settings, audio, duration,
                                                     output, lambda *_: None)
                else:
                    stats = stream_frames(page, None, pipeline, settings, audio, duration,
                                          output, lambda *_: None)
                probe = subprocess.run(["ffprobe", "-v", "error", "-count_frames",
                                        "-show_entries", "stream=codec_type,nb_read_frames,duration,r_frame_rate",
                                        "-of", "json", str(output)], capture_output=True,
                                       text=True, check=True, timeout=30)
                streams = json.loads(probe.stdout)["streams"]
                video = next(item for item in streams if item["codec_type"] == "video")
                audio_stream = next(item for item in streams if item["codec_type"] == "audio")
                stats["encoded_video_frames"] = int(video["nb_read_frames"])
                stats["encoded_video_duration_sec"] = float(video["duration"])
                stats["encoded_audio_duration_sec"] = float(audio_stream["duration"])
                if stats["encoded_video_frames"] != args.frames:
                    raise RuntimeError(f"MP4 has {stats['encoded_video_frames']} frames, expected {args.frames}")
                samples.append(stats)
        finally:
            browser.close()
    output = {
        "project_id": args.project_id, "score": bool(meta.get("has_score", True)),
        "platform": platform.platform(), "resolution": [args.width, args.height],
        "fps": args.fps, "segment_seconds": duration, "frames_per_repeat": args.frames,
        "repeats": args.repeats, "pipeline": ("CDP screencast JPEG + FFmpeg libx264"
                                             if args.path == "screencast" else "Playwright JPEG + FFmpeg libx264"),
        "samples": samples,
        "mean_fps": round(statistics.mean(s["frame_processing_fps"] for s in samples), 2),
        "mean_wall_sec": round(statistics.mean(s["render_elapsed_sec"] for s in samples), 2),
    }
    print(json.dumps(output, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
