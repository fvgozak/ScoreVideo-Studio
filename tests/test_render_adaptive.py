"""Adaptive render selection uses validated capabilities and preserves quality."""
from io import BytesIO
from pathlib import Path
import sys
from types import SimpleNamespace

import pytest
from PIL import Image

sys.path.insert(0, str(Path(__file__).parents[1]))
from render_adaptive import (Pipeline, listed_encoders, encoder_candidates,
                             target_bitrate, ffmpeg_input_args, ffmpeg_video_args,
                             similarity_metrics, choose_capture, choose_encoder,
                             benchmark_encoder)
from app import RenderRequest


def png_image():
    image = Image.new('RGB', (160, 90), (12, 19, 25))
    for y in range(15, 75, 10):
        for x in range(10, 152):
            image.putpixel((x, y), (253, 254, 254))
    b = BytesIO()
    image.save(b, format='PNG')
    return b.getvalue()


def jpeg_image():
    with Image.open(BytesIO(png_image())) as image:
        b = BytesIO()
        image.save(b, format='JPEG', quality=96)
        return b.getvalue()


def test_candidates_platform_and_fallback():
    present = {'libx264', 'h264_videotoolbox', 'h264_nvenc', 'h264_qsv'}
    assert encoder_candidates(present, 'Darwin') == ['h264_videotoolbox', 'libx264']
    assert encoder_candidates(present, 'Windows') == ['h264_nvenc', 'h264_qsv', 'libx264']
    assert encoder_candidates({'libx264'}, 'Linux') == ['libx264']


def test_quality_protects_staff_lines():
    assert choose_capture(1, .2, {'mean_error': 7, 'bad_fraction': .09}) == 'png'
    assert choose_capture(1, .3, {'mean_error': 1, 'bad_fraction': .002}) == 'jpeg'
    assert choose_capture(1, .3, {'mean_error': 1, 'bad_fraction': .002}, 'quality') == 'png'
    assert choose_capture(1, .9, {'mean_error': 18, 'bad_fraction': .3}, 'speed') == 'jpeg'
    metrics = similarity_metrics(png_image(), jpeg_image())
    assert 0 <= metrics['bad_fraction'] <= 1
    assert metrics['mean_error'] >= 0


def test_encoder_selection_based_on_measured_speed():
    assert choose_encoder({'libx264': 5, 'h264_nvenc': 1}) == 'h264_nvenc'
    assert choose_encoder({'libx264': 5, 'h264_nvenc': 4.8}) == 'libx264'
    assert choose_encoder({'libx264': 5, 'h264_nvenc': 1}, 'quality') == 'libx264'
    assert choose_encoder({'libx264': 5}) == 'libx264'
    with pytest.raises(RuntimeError):
        choose_encoder({})


def test_fps_bitrate_and_commands():
    assert target_bitrate(1080, 1920, 24) == target_bitrate(1920, 1080, 24)
    assert target_bitrate(1920, 1080, 30) > target_bitrate(1920, 1080, 24)
    assert ffmpeg_input_args(Pipeline('jpeg', 'libx264', 8000000), 24)[-3:] == ['mjpeg', '-i', 'pipe:0']
    assert '-crf' in ffmpeg_video_args(Pipeline('png', 'libx264', 8000000))
    assert 'h264_videotoolbox' in ffmpeg_video_args(Pipeline('png', 'h264_videotoolbox', 8000000))
    req = RenderRequest(render_mode='auto')
    assert req.render_mode == 'auto'
    with pytest.raises(ValueError):
        RenderRequest(render_mode='unknown')


def test_real_ffmpeg_software_smoke():
    if 'libx264' not in listed_encoders():
        pytest.skip('FFmpeg libx264 unavailable')
    pipeline = Pipeline('png', 'libx264', 5000000)
    elapsed, error = benchmark_encoder(pipeline, png_image(), 24, frames=4, timeout=15)
    assert elapsed is not None, error
    assert elapsed >= 0


def test_unsupported_gpu_can_fail_and_is_not_selected():
    if 'h264_nvenc' not in listed_encoders():
        pytest.skip('NVENC not listed by FFmpeg')
    # On CPU-only CI environments, ffmpeg can list NVENC but cannot start it.
    elapsed, err = benchmark_encoder(Pipeline('png', 'h264_nvenc', 5000000),
                                    png_image(), 24, frames=4, timeout=15)
    if elapsed is None:
        assert err
        assert choose_encoder({'libx264': .3}) == 'libx264'


def test_real_ffmpeg_short_mp4_pipeline(tmp_path):
    import json
    import subprocess
    from render_video import stream_frames, ffmpeg_command

    if 'libx264' not in listed_encoders():
        pytest.skip('FFmpeg libx264 unavailable')
    audio = tmp_path / 'audio.wav'
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y',
                    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.6',
                    '-c:a', 'pcm_s16le', str(audio)], timeout=15, check=True)
    out = tmp_path / 'out.mp4'
    sample = png_image()

    class FakePage:
        def __init__(self):
            self.times = []
        def evaluate(self, _, t):
            self.times.append(t)
        def screenshot(self, **kwargs):
            assert kwargs['type'] == 'png'
            return sample

    settings = SimpleNamespace(fps=12, width=160, height=90)
    reports = []
    page = FakePage()
    stats = stream_frames(page, None, Pipeline('png', 'libx264', 4_000_000),
                          settings, audio, .5, out, lambda pct, msg: reports.append((pct, msg)))
    assert stats['frames'] == 6
    assert stats['frame_processing_fps'] > 0
    assert out.exists() and out.stat().st_size > 1000
    assert page.times[-1] == pytest.approx(5 / 12)
    result = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0',
                             '-show_entries', 'stream=width,height,codec_name',
                             '-of', 'json', str(out)], capture_output=True,
                            check=True, timeout=15)
    video = json.loads(result.stdout)['streams'][0]
    assert video['codec_name'] == 'h264'
    assert (video['width'], video['height']) == (160, 90)
