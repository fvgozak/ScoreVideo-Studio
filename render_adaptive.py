"""Portable, validated FFmpeg H.264 selection for ScoreVideo Studio.

Detection is not based on the OS name alone: each encoder must successfully
encode representative screenshots before it can be selected. Benchmarks are
per export because resolution / frame rate / scene complexity change costs.
"""
from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO
import os
import platform
import re
import subprocess
import time
from typing import Any

from PIL import Image, ImageChops, ImageStat


@dataclass(frozen=True)
class Pipeline:
    capture: str  # png or jpeg
    encoder: str  # ffmpeg video encoder
    bitrate: int
    quality: int = 96


ENCODER_ORDER = {
    'Darwin': ('h264_videotoolbox',),
    'Windows': ('h264_nvenc', 'h264_qsv', 'h264_amf'),
    'Linux': ('h264_nvenc', 'h264_qsv', 'h264_vaapi'),
}


def listed_encoders(ffmpeg: str = 'ffmpeg') -> set[str]:
    try:
        result = subprocess.run([ffmpeg, '-hide_banner', '-encoders'],
                                capture_output=True, text=True, timeout=8, check=True)
    except (OSError, subprocess.SubprocessError):
        return set()
    encoders = set()
    for line in result.stdout.splitlines():
        # FFmpeg uses 'V.....' flags; encoder names follow them.
        match = re.match(r'^\s*V[.A-Z]{5}\s+([\w]+)', line)
        if match:
            encoders.add(match.group(1))
    return encoders


def encoder_candidates(encoders: set[str], system: str | None = None) -> list[str]:
    system = system or platform.system()
    # libx264 remains the deterministic portable software fallback.
    priority = ENCODER_ORDER.get(system, ())
    selected = []
    for encoder in priority:
        if encoder not in encoders:
            continue
        if encoder == 'h264_vaapi' and not os.path.exists('/dev/dri/renderD128'):
            continue
        selected.append(encoder)
    selected.append('libx264' if 'libx264' in encoders else 'mpeg4')
    return selected


def target_bitrate(width: int, height: int, fps: int) -> int:
    # High enough to avoid harsh color gradients / thin-line artifacts with HW H.264.
    return max(3_000_000, min(55_000_000, int(10_000_000 * width * height / (1920 * 1080) * fps / 24)))


def ffmpeg_video_args(p: Pipeline) -> list[str]:
    if p.encoder == 'libx264':
        return ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19', '-pix_fmt', 'yuv420p']
    if p.encoder == 'mpeg4':
        return ['-c:v', 'mpeg4', '-q:v', '3', '-pix_fmt', 'yuv420p']
    bitrate = str(p.bitrate)
    if p.encoder == 'h264_vaapi':
        return ['-vf', 'format=nv12,hwupload', '-c:v', 'h264_vaapi', '-b:v', bitrate]
    return ['-c:v', p.encoder, '-b:v', bitrate, '-pix_fmt', 'yuv420p']


def ffmpeg_device_args(p: Pipeline) -> list[str]:
    if p.encoder == 'h264_vaapi':
        return ['-vaapi_device', '/dev/dri/renderD128']
    return []


def ffmpeg_input_args(p: Pipeline, fps: int) -> list[str]:
    return ['-f', 'image2pipe', '-framerate', str(fps),
            '-vcodec', 'png' if p.capture == 'png' else 'mjpeg', '-i', 'pipe:0']


def similarity_metrics(reference_png: bytes, candidate_jpeg: bytes) -> dict[str, float]:
    try:
        with Image.open(BytesIO(reference_png)) as baseline, Image.open(BytesIO(candidate_jpeg)) as encoded:
            a = baseline.convert('RGB')
            b = encoded.convert('RGB')
            if a.size != b.size:
                return {'mean_error': 255., 'bad_fraction': 1.}
            delta = ImageChops.difference(a, b)
            mean = sum(ImageStat.Stat(delta).mean) / 3
            # Sample to avoid scanning every pixel of a 4K frame.
            delta.thumbnail((300, 300), Image.Resampling.BOX)
            errors = list((delta.get_flattened_data() if hasattr(delta, 'get_flattened_data') else delta.getdata()))
            bad = sum(max(e) > 22 for e in errors) / max(1, len(errors))
            return {'mean_error': round(mean, 4), 'bad_fraction': round(bad, 5)}
    except (OSError, ValueError):
        return {'mean_error': 255., 'bad_fraction': 1.}


def choose_capture(png_seconds: float, jpeg_seconds: float, metrics: dict[str, float],
                   mode: str = 'auto') -> str:
    if mode == 'quality':
        return 'png'
    if mode == 'speed':
        return 'jpeg'
    # Prefer lossless whenever scores are likely to have visible JPEG artifacts.
    if (jpeg_seconds < png_seconds * .84 and metrics['mean_error'] <= 2.8
            and metrics['bad_fraction'] <= .04):
        return 'jpeg'
    return 'png'


def benchmark_capture(page: Any, stage: Any, length: float, mode: str) -> tuple[str, bytes, dict]:
    # Choose a real frame with engraved notes (not a blank loading screen).
    times = [min(length * .12, 3.), min(max(length * .32, .1), 20.)]
    shots: dict[str, list[bytes]] = {'png': [], 'jpeg': []}
    spent = {'png': 0., 'jpeg': 0.}
    for t in times:
        page.evaluate('(t) => window.renderAt(t)', t)
        for kind in ('png', 'jpeg'):
            args = {'type': kind, 'animations': 'disabled', 'caret': 'hide', 'timeout': 60000}
            if kind == 'jpeg':
                args['quality'] = 96
            start = time.perf_counter()
            image = page.screenshot(**args)
            spent[kind] += time.perf_counter() - start
            shots[kind].append(image)
    metrics = similarity_metrics(shots['png'][0], shots['jpeg'][0])
    chosen = choose_capture(spent['png'], spent['jpeg'], metrics, mode)
    return chosen, shots[chosen][0], {'png_capture_sec': round(spent['png'] / len(times), 3),
                                    'jpeg_capture_sec': round(spent['jpeg'] / len(times), 3),
                                    **metrics}


def benchmark_encoder(p: Pipeline, screenshot: bytes, fps: int, ffmpeg: str = 'ffmpeg',
                      frames: int = 12, timeout: int = 12) -> tuple[float | None, str]:
    # Probe the real screenshot input path, codec and device; a listed hardware
    # encoder might still fail without a driver, entitlements, or attached GPU.
    cmd = ([ffmpeg, '-hide_banner', '-loglevel', 'error', '-nostdin', '-y']
           + ffmpeg_device_args(p) + ffmpeg_input_args(p, fps)
           + ['-frames:v', str(frames), '-an'] + ffmpeg_video_args(p) + ['-f', 'null', '-'])
    start = time.perf_counter()
    try:
        result = subprocess.run(cmd, input=screenshot * frames,
                                capture_output=True, timeout=timeout)
    except (OSError, subprocess.SubprocessError) as exc:
        return None, str(exc)[-250:]
    if result.returncode:
        return None, result.stderr.decode('utf-8', errors='replace')[-350:]
    return time.perf_counter() - start, ''


def choose_encoder(results: dict[str, float], mode: str = 'auto') -> str:
    if not results:
        raise RuntimeError('FFmpeg could not encode H.264 or the software fallback')
    if mode == 'quality' and 'libx264' in results:
        return 'libx264'
    best = min(results, key=results.get)
    if 'libx264' in results and best != 'libx264':
        # Avoid switching to HW for negligible startup-only wins.
        if results[best] > .90 * results['libx264']:
            return 'libx264'
    return best


def profile_pipeline(page: Any, stage: Any, duration: float, settings: Any,
                     on_progress, ffmpeg: str = 'ffmpeg') -> tuple[Pipeline, dict]:
    mode = getattr(settings, 'render_mode', 'auto')
    on_progress(0, '환경 분석: 실제 악보 프레임 캡처 성능 측정 중')
    kind, sample, capture_report = benchmark_capture(page, stage, duration, mode)
    available = listed_encoders(ffmpeg)
    encoders = encoder_candidates(available)
    bitrate = target_bitrate(settings.width, settings.height, settings.fps)
    speeds: dict[str, float] = {}
    failures = {}
    for name in encoders:
        on_progress(0, f'환경 분석: {name} 인코더 작동·속도 측정 중')
        pipeline = Pipeline(kind, name, bitrate)
        seconds, reason = benchmark_encoder(pipeline, sample, settings.fps, ffmpeg=ffmpeg)
        if seconds is not None:
            speeds[name] = seconds
        else:
            failures[name] = reason
    chosen = choose_encoder(speeds, mode)
    p = Pipeline(kind, chosen, bitrate)
    return p, {'os': platform.platform(), 'capture': capture_report,
               'encoder_benchmarks_sec': {k: round(v, 3) for k, v in speeds.items()},
               'unavailable_encoders': failures, 'selected_encoder': chosen,
               'selected_capture': kind, 'mode': mode}
