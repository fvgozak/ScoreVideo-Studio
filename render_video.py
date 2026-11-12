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
import base64
from io import BytesIO

from PIL import Image

from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError

from render_adaptive import (
    Pipeline, ffmpeg_device_args, ffmpeg_input_args, ffmpeg_video_args,
    profile_pipeline, similarity_metrics, target_bitrate,
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
    ffmpeg_cpu_start = os.times()
    process = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL,
                               stderr=subprocess.PIPE)
    capture_total = 0.
    evaluate_total = 0.
    js_total = 0.
    write_total = 0.
    bytes_written = 0
    close_total = 0.
    wait_total = 0.
    start = time.perf_counter()
    ffmpeg_started = start
    try:
        for i in range(total):
            frame_t = i / settings.fps
            a = time.perf_counter()
            js_ms = page.evaluate('(t) => { const start = performance.now(); window.renderAt(t); return performance.now() - start; }', frame_t)
            b = time.perf_counter()
            options = {'type': p.capture, 'animations': 'disabled',
                       'caret': 'hide', 'timeout': 60000}
            if p.capture == 'jpeg':
                options['quality'] = p.quality
            frame = page.screenshot(**options)
            c = time.perf_counter()
            evaluate_total += b - a
            if isinstance(js_ms, (int, float)) and math.isfinite(js_ms):
                js_total += max(0, js_ms) / 1000
            capture_total += c - b
            try:
                process.stdin.write(frame)
            except (BrokenPipeError, OSError) as exc:
                details = process.stderr.read().decode('utf-8', errors='replace')[-1400:]
                raise RuntimeError(f'FFmpeg encoder {p.encoder} stopped: {details}') from exc
            write_total += time.perf_counter() - c
            bytes_written += len(frame)
            if i % max(1, settings.fps) == 0 or i == total - 1:
                elapsed = max(1e-6, time.perf_counter() - start)
                speed = (i + 1) / elapsed
                remaining = max(0, (total - i - 1) / max(.01, speed))
                callback(min(99, int(99 * (i + 1) / total)),
                         f'{p.encoder} · {p.capture.upper()} | {speed:.1f} fps · 남은 시간 약 {int(remaining // 60)}분 {int(remaining % 60)}초')
        finalize_started = time.perf_counter()
        process.stdin.close()
        close_total = time.perf_counter() - finalize_started
        wait_started = time.perf_counter()
        try:
            code = process.wait(timeout=180)
        except subprocess.TimeoutExpired as exc:
            raise RuntimeError('FFmpeg did not finish writing the video') from exc
        if code:
            details = process.stderr.read().decode('utf-8', errors='replace')[-1400:]
            raise RuntimeError(f'FFmpeg encoder {p.encoder} failed (exit {code}): {details}')
        wait_total = time.perf_counter() - wait_started
        ffmpeg_cpu_end = os.times()
        wall = time.perf_counter() - start
        return {'encoder': p.encoder, 'capture': p.capture, 'frames': total,
                'render_elapsed_sec': round(wall, 2), 'frame_processing_fps': round(total / max(.001, wall), 2),
                'js_time_sec': round(js_total, 3),
                'evaluate_wall_sec': round(evaluate_total, 3),
                'evaluate_bridge_sec': round(max(0, evaluate_total - js_total), 3),
                'screenshot_time_sec': round(capture_total, 3),
                'stdin_write_time_sec': round(write_total, 3),
                'ffmpeg_close_sec': round(close_total, 3),
                'ffmpeg_wait_sec': round(wait_total, 3),
                'ffmpeg_process_wall_sec': round(time.perf_counter() - ffmpeg_started, 3),
                'ffmpeg_child_cpu_sec': round(max(0, ffmpeg_cpu_end.children_user + ffmpeg_cpu_end.children_system
                                                    - ffmpeg_cpu_start.children_user - ffmpeg_cpu_start.children_system), 3),
                'frame_bytes': bytes_written,
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


def stream_screencast_frames(page, p: Pipeline, settings, audio: Path,
                             seconds: float, pending: Path, callback, profile_seconds: float = 0.) -> dict:
    """Capture the existing DOM/SVG/canvas stage via CDP paint events.

    Holding each screencast frame unacknowledged while seeking the next exact
    timestamp ensures one painted frame per renderAt(t), with no page.screenshot
    call in the frame loop. The browser still JPEG-encodes the painted scene.
    """
    total = math.ceil(seconds * settings.fps)
    capture_pipeline = Pipeline('jpeg', p.encoder, p.bitrate, p.quality)
    session = page.context.new_cdp_session(page)
    ffmpeg_cpu_start = os.times()
    try:
        process = subprocess.Popen(ffmpeg_command(capture_pipeline, settings, audio, seconds, pending),
                                   stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    except Exception:
        session.detach()
        raise
    received = []
    session.on('Page.screencastFrame', lambda frame: received.append(frame))
    started = time.perf_counter()
    evaluate_total = js_total = event_wait_total = write_total = 0.
    bytes_written = 0
    comparisons = []
    close_total = wait_total = 0.
    screencast_started = False
    held = None
    try:
        page.evaluate('(t) => window.renderAt(t)', 0)
        first_reference = page.screenshot(type='png', animations='disabled', caret='hide')
        session.send('Page.startScreencast', {'format': 'jpeg', 'quality': p.quality,
                                             'maxWidth': settings.width, 'maxHeight': settings.height,
                                             'everyNthFrame': 1})
        screencast_started = True
        deadline = time.perf_counter() + 10
        while not received and time.perf_counter() < deadline:
            page.wait_for_timeout(5)
        if not received:
            raise RuntimeError('Chromium screencast did not provide an initial frame')
        held = received.pop(0)
        for i in range(total):
            if received:
                raise RuntimeError(f'Chromium screencast queued an unsolicited frame before timestamp {i/settings.fps}')
            before = time.perf_counter()
            js_ms = page.evaluate('(t) => { const start = performance.now(); window.renderAt(t); return performance.now() - start; }', i / settings.fps)
            evaluate_total += time.perf_counter() - before
            if isinstance(js_ms, (int, float)) and math.isfinite(js_ms):
                js_total += max(0, js_ms) / 1000
            session.send('Page.screencastFrameAck', {'sessionId': held['sessionId']})
            wait_started = time.perf_counter()
            deadline = wait_started + 10
            while not received and time.perf_counter() < deadline:
                page.wait_for_timeout(2)
            event_wait_total += time.perf_counter() - wait_started
            if not received:
                raise RuntimeError(f'Chromium screencast omitted deterministic frame {i}')
            if len(received) != 1:
                raise RuntimeError(f'Chromium screencast returned {len(received)} frames at timestamp {i/settings.fps}')
            held = received.pop(0)
            frame = base64.b64decode(held['data'])
            if i == 0:
                with Image.open(BytesIO(frame)) as image:
                    if image.size != (settings.width, settings.height):
                        raise RuntimeError(f'Chromium screencast returned wrong size: {image.size}')
            if i in {0, total - 1}:
                reference = first_reference if i == 0 else page.screenshot(type='png', animations='disabled', caret='hide')
                metrics = similarity_metrics(reference, frame)
                comparisons.append({'frame': i, **metrics})
                if metrics['mean_error'] > 2.8 or metrics['bad_fraction'] > .04:
                    raise RuntimeError(f'Screencast visual mismatch at frame {i}: {metrics}')
            write_started = time.perf_counter()
            try:
                process.stdin.write(frame)
            except (BrokenPipeError, OSError) as exc:
                details = process.stderr.read().decode('utf-8', errors='replace')[-1400:]
                raise RuntimeError(f'FFmpeg encoder {p.encoder} stopped: {details}') from exc
            write_total += time.perf_counter() - write_started
            bytes_written += len(frame)
            if i % max(1, settings.fps) == 0 or i == total - 1:
                elapsed = max(1e-6, time.perf_counter() - started)
                speed = (i + 1) / elapsed
                remaining = max(0, (total - i - 1) / max(.01, speed))
                callback(min(99, int(99 * (i + 1) / total)),
                         f'{p.encoder} · CDP JPEG | {speed:.1f} fps · 남은 시간 약 {int(remaining // 60)}분 {int(remaining % 60)}초')
        close_started = time.perf_counter()
        process.stdin.close()
        close_total = time.perf_counter() - close_started
        wait_started = time.perf_counter()
        try:
            code = process.wait(timeout=180)
        except subprocess.TimeoutExpired as exc:
            raise RuntimeError('FFmpeg did not finish writing the screencast video') from exc
        wait_total = time.perf_counter() - wait_started
        ffmpeg_cpu_end = os.times()
        if code:
            details = process.stderr.read().decode('utf-8', errors='replace')[-1400:]
            raise RuntimeError(f'FFmpeg encoder {p.encoder} failed (exit {code}): {details}')
        wall = time.perf_counter() - started
        return {'encoder': p.encoder, 'capture': 'cdp-screencast-jpeg', 'frames': total,
                'render_elapsed_sec': round(wall, 2), 'frame_processing_fps': round(total / max(.001, wall), 2),
                'js_time_sec': round(js_total, 3), 'evaluate_wall_sec': round(evaluate_total, 3),
                'evaluate_bridge_sec': round(max(0, evaluate_total-js_total), 3),
                'screencast_event_wait_sec': round(event_wait_total, 3),
                'stdin_write_time_sec': round(write_total, 3),
                'ffmpeg_close_sec': round(close_total, 3), 'ffmpeg_wait_sec': round(wait_total, 3),
                'ffmpeg_child_cpu_sec': round(max(0, ffmpeg_cpu_end.children_user + ffmpeg_cpu_end.children_system
                                                    - ffmpeg_cpu_start.children_user - ffmpeg_cpu_start.children_system), 3),
                'frame_bytes': bytes_written, 'visual_comparisons': comparisons,
                'profile_time_sec': round(profile_seconds, 2)}
    finally:
        if screencast_started:
            try:
                if held is not None:
                    session.send('Page.screencastFrameAck', {'sessionId': held['sessionId']})
                session.send('Page.stopScreencast')
            except Exception:
                pass
        try:
            session.detach()
        except Exception:
            pass
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
                capture_preference = os.environ.get('SCOREVIDEO_CAPTURE', 'auto').lower()
                use_screencast = (capture_preference != 'legacy' and
                                  (capture_preference == 'screencast' or settings.render_mode != 'quality'))

                def capture_with_fallback(pipeline):
                    nonlocal use_screencast
                    if use_screencast:
                        try:
                            return stream_screencast_frames(page, pipeline, settings, audio_path,
                                                            seconds, pending, on_progress, benchmark_time)
                        except Exception as exc:
                            # A failed or visually mismatched CDP stream is never
                            # published; regenerate every timestamp via the
                            # original screenshot path instead.
                            diagnostic['screencast_fallback_reason'] = str(exc)[-350:]
                            use_screencast = False
                            pending.unlink(missing_ok=True)
                            on_progress(0, 'CDP 캡처 불일치/실패 → 기존 스크린샷 경로로 전체 재시도')
                    return stream_frames(page, stage, pipeline, settings, audio_path,
                                         seconds, pending, on_progress, benchmark_time)

                # A runtime HW failure must not leave a broken MP4. Repeat the
                # deterministic frame generation using a working CPU fallback.
                try:
                    stats = capture_with_fallback(choice)
                except RuntimeError as exc:
                    if choice.encoder in ('libx264', 'mpeg4'):
                        raise
                    fallback = 'libx264' if 'libx264' in diagnostic['encoder_benchmarks_sec'] else 'mpeg4'
                    pending.unlink(missing_ok=True)
                    on_progress(0, f'{choice.encoder} 중단 → {fallback} 소프트웨어 인코딩으로 재시도')
                    safe = Pipeline(choice.capture, fallback,
                                    target_bitrate(settings.width, settings.height, settings.fps))
                    stats = capture_with_fallback(safe)
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
