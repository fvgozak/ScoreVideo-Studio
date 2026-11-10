"""Deterministic ScoreVideo MP4 export with runtime-adaptive capture/codec.

The scene remains the exact same ScoreStage used by preview. Only its transfer
encoding and video encoder adapt to the machine; playback timing never changes.
"""
from __future__ import annotations

import json
import math
import os
from pathlib import Path
import subprocess
import time
from typing import Callable

from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError

from render_adaptive import (
    Pipeline, ffmpeg_device_args, ffmpeg_input_args, ffmpeg_video_args,
    profile_pipeline, target_bitrate,
)


def ffmpeg_command(p: Pipeline, settings, audio: Path, seconds: float, output: Path) -> list[str]:
    return (["ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin", "-y"]
            + ffmpeg_device_args(p) + ffmpeg_input_args(p, settings.fps)
            + ["-i", str(audio), "-map", "0:v:0", "-map", "1:a:0", "-t", str(seconds)]
            + ffmpeg_video_args(p)
            + ["-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", str(output)])


def stream_frames(page, stage, p: Pipeline, settings, audio: Path,
                  seconds: float, pending: Path, callback, profile_seconds: float = 0.) -> dict:
    total = math.ceil(seconds * settings.fps)
    cmd = ffmpeg_command(p, settings, audio, seconds, pending)
    process = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL,
                               stderr=subprocess.PIPE)
    capture_total = 0.
    render_total = 0.
    start = time.perf_counter()
    try:
        for i in range(total):
            frame_t = i / settings.fps
            a = time.perf_counter()
            page.evaluate('(t) => window.renderAt(t)', frame_t)
            b = time.perf_counter()
            options = {'type': p.capture, 'animations': 'disabled',
                       'caret': 'hide', 'timeout': 60000}
            if p.capture == 'jpeg':
                options['quality'] = p.quality
            frame = page.screenshot(**options)
            c = time.perf_counter()
            render_total += b - a
            capture_total += c - b
            try:
                process.stdin.write(frame)
            except (BrokenPipeError, OSError) as exc:
                details = process.stderr.read().decode('utf-8', errors='replace')[-1400:]
                raise RuntimeError(f'FFmpeg encoder {p.encoder} stopped: {details}') from exc
            if i % max(1, settings.fps) == 0 or i == total - 1:
                elapsed = max(1e-6, time.perf_counter() - start)
                speed = (i + 1) / elapsed
                remaining = max(0, (total - i - 1) / max(.01, speed))
                callback(min(99, int(99 * (i + 1) / total)),
                         f'{p.encoder} · {p.capture.upper()} | {speed:.1f} fps · 남은 시간 약 {int(remaining // 60)}분 {int(remaining % 60)}초')
        process.stdin.close()
        try:
            code = process.wait(timeout=180)
        except subprocess.TimeoutExpired as exc:
            raise RuntimeError('FFmpeg did not finish writing the video') from exc
        if code:
            details = process.stderr.read().decode('utf-8', errors='replace')[-1400:]
            raise RuntimeError(f'FFmpeg encoder {p.encoder} failed (exit {code}): {details}')
        wall = time.perf_counter() - start
        return {'encoder': p.encoder, 'capture': p.capture, 'frames': total,
                'render_elapsed_sec': round(wall, 2), 'frame_processing_fps': round(total / max(.001, wall), 2),
                'js_time_sec': round(render_total, 2), 'screenshot_time_sec': round(capture_total, 2),
                'profile_time_sec': round(profile_seconds, 2)}
    finally:
        if process.stdin and not process.stdin.closed:
            try:
                process.stdin.close()
            except OSError:
                pass
        if process.poll() is None:
            process.kill()
            process.wait(timeout=10)
        if process.stderr:
            process.stderr.close()


def export_mp4(folder: Path, meta: dict, settings, on_progress: Callable[[int, str], None]):
    audio_path = folder / meta['audio_filename']
    seconds = float(meta['audio_duration_sec'])
    output = folder / 'output.mp4'
    pending = folder / 'output.pending.mp4'
    pending.unlink(missing_ok=True)

    url = (os.environ.get('SCOREVIDEO_BASE_URL', 'http://127.0.0.1:8765').rstrip('/')
           + '/render/' + meta['id'])
    report = {}
    try:
        with sync_playwright() as p:
            chromium_executable = os.environ.get('SCOREVIDEO_CHROMIUM_PATH')
            launch_options = {'headless': True}
            if chromium_executable:
                launch_options['executable_path'] = chromium_executable
            browser = p.chromium.launch(**launch_options)
            try:
                page = browser.new_page(viewport={'width': settings.width, 'height': settings.height},
                                        device_scale_factor=1, reduced_motion='reduce')
                page.goto(url, wait_until='domcontentloaded', timeout=30_000)
                try:
                    page.wait_for_function('window.__ready === true || !!window.__renderError', timeout=90_000)
                except PlaywrightTimeoutError as exc:
                    raise RuntimeError('Score renderer did not load (OSMD or local browser resources)') from exc
                problem = page.evaluate('window.__renderError || null')
                if problem:
                    raise RuntimeError(f'Score renderer failed: {problem}')

                stage = page.locator('#scoreViewport')
                started = time.perf_counter()
                choice, diagnostic = profile_pipeline(page, stage, seconds, settings, on_progress)
                benchmark_time = time.perf_counter() - started
                on_progress(0, f'자동 선택: {choice.encoder} + {choice.capture.upper()} · 프레임 처리 시작')
                # A runtime HW failure must not leave a broken MP4. Repeat the
                # deterministic frame generation using a working CPU fallback.
                try:
                    stats = stream_frames(page, stage, choice, settings, audio_path,
                                          seconds, pending, on_progress, benchmark_time)
                except RuntimeError as exc:
                    if choice.encoder in ('libx264', 'mpeg4'):
                        raise
                    fallback = 'libx264' if 'libx264' in diagnostic['encoder_benchmarks_sec'] else 'mpeg4'
                    pending.unlink(missing_ok=True)
                    on_progress(0, f'{choice.encoder} 중단 → {fallback} 소프트웨어 인코딩으로 재시도')
                    safe = Pipeline(choice.capture, fallback,
                                    target_bitrate(settings.width, settings.height, settings.fps))
                    stats = stream_frames(page, stage, safe, settings, audio_path,
                                          seconds, pending, on_progress, benchmark_time)
                    diagnostic['fallback_reason'] = str(exc)[-350:]
                    diagnostic['selected_encoder'] = fallback
                report = {**diagnostic, **stats}
            finally:
                browser.close()

        if not pending.exists() or pending.stat().st_size < 4096:
            raise RuntimeError('FFmpeg did not create a valid MP4')
        pending.replace(output)
        (folder / 'render-diagnostics.json').write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding='utf-8')
        on_progress(100, f"완료: {stats['encoder']} / {stats['capture'].upper()} · 평균 {stats['frame_processing_fps']:.1f} fps")
    finally:
        pending.unlink(missing_ok=True)
