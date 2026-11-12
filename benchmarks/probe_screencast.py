"""Probe CDP screencast's frame accuracy against the canonical screenshot path."""
import argparse
import base64
from io import BytesIO
import json
import time

from PIL import Image
from playwright.sync_api import sync_playwright

from render_adaptive import similarity_metrics


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("project_id")
    parser.add_argument("--width", type=int, default=1080)
    parser.add_argument("--height", type=int, default=1920)
    parser.add_argument("--frames", type=int, default=60)
    parser.add_argument("--fps", type=int, default=30)
    args = parser.parse_args()
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        try:
            page = browser.new_page(viewport={"width": args.width, "height": args.height},
                                    device_scale_factor=1, reduced_motion="reduce")
            page.goto("http://127.0.0.1:8765/render/" + args.project_id,
                      wait_until="domcontentloaded")
            page.wait_for_function("window.__ready === true || !!window.__renderError", timeout=90000)
            error = page.evaluate("window.__renderError || null")
            if error:
                raise RuntimeError(error)
            session = page.context.new_cdp_session(page)
            frames = []
            session.on("Page.screencastFrame", lambda frame: frames.append(frame))
            session.send("Page.startScreencast", {"format": "jpeg", "quality": 96,
                                                   "maxWidth": args.width, "maxHeight": args.height,
                                                   "everyNthFrame": 1})
            deadline = time.perf_counter() + 10
            while not frames and time.perf_counter() < deadline:
                page.wait_for_timeout(5)
            if not frames:
                raise RuntimeError("No initial screencast frame")
            held = frames.pop(0)
            samples = []
            start = time.perf_counter()
            for index in range(args.frames):
                page.evaluate("(t) => window.renderAt(t)", index / args.fps)
                session.send("Page.screencastFrameAck", {"sessionId": held["sessionId"]})
                deadline = time.perf_counter() + 5
                while not frames and time.perf_counter() < deadline:
                    page.wait_for_timeout(5)
                if not frames:
                    raise RuntimeError(f"No screencast frame at index {index}")
                held = frames.pop(0)
                if index in {0, args.frames//3, 2*args.frames//3, args.frames-1}:
                    data = base64.b64decode(held["data"])
                    png = page.screenshot(type="png", animations="disabled")
                    with Image.open(BytesIO(data)) as image:
                        size = image.size
                    samples.append({"frame": index, "size": size, **similarity_metrics(png, data)})
            elapsed = time.perf_counter()-start
            session.send("Page.screencastFrameAck", {"sessionId": held["sessionId"]})
            session.send("Page.stopScreencast")
            print(json.dumps({"frames": args.frames, "elapsed_sec": round(elapsed, 3),
                              "fps": round(args.frames/elapsed, 2), "comparison": samples}, indent=2))
        finally:
            browser.close()


if __name__ == "__main__":
    main()
