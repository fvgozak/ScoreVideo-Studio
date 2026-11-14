"""Cancellation boundaries without a browser or a running web server."""
import io
import os
import signal
import sys
import tempfile
import threading
import time
import unittest
import wave
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import app
from render_adaptive import Pipeline
from render_cancel import RenderCancelled
from render_video import stream_frames


class CancellationTests(unittest.TestCase):
    def test_cancelled_job_cleans_up_and_can_render_again(self):
        project = "c" * 32
        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp) / project
            folder.mkdir()
            (folder / "meta.json").write_text('{"id":"' + project + '"}')
            (folder / "score.mid").write_bytes(b"original MIDI")
            started = threading.Event()
            calls = []

            def fake_export(*, folder, cancel_check, **_kwargs):
                calls.append(1)
                if len(calls) == 1:
                    (folder / "output.pending.mp4").write_bytes(b"partial")
                    started.set()
                    while not cancel_check():
                        time.sleep(.005)
                    raise RenderCancelled()

            old_active, old_jobs = app.active_project, app.jobs.copy()
            old_events, old_processes = app.cancel_events.copy(), app.render_processes.copy()
            self.addCleanup(lambda: setattr(app, "active_project", old_active))
            self.addCleanup(lambda: (app.jobs.clear(), app.jobs.update(old_jobs),
                                     app.cancel_events.clear(), app.cancel_events.update(old_events),
                                     app.render_processes.clear(), app.render_processes.update(old_processes)))
            with patch.object(app, "DATA", Path(temp)), patch.object(app, "project_path", return_value=folder), \
                 patch.object(app, "render_python", return_value=sys.executable), \
                 patch("render_video.export_mp4", side_effect=fake_export):
                app.start_render(project, app.RenderRequest())
                self.assertTrue(started.wait(2))
                self.assertEqual(app.cancel_render(project)["state"], "cancelling")
                deadline = time.monotonic() + 2
                while app.render_status(project)["state"] != "cancelled" and time.monotonic() < deadline:
                    time.sleep(.01)
                self.assertEqual(app.render_status(project)["state"], "cancelled")
                self.assertFalse((folder / "output.pending.mp4").exists())
                self.assertEqual((folder / "score.mid").read_bytes(), b"original MIDI")
                self.assertTrue((folder / "render-config.json").exists())
                app.start_render(project, app.RenderRequest())
                deadline = time.monotonic() + 2
                while app.render_status(project)["state"] != "done" and time.monotonic() < deadline:
                    time.sleep(.01)
                self.assertEqual(app.render_status(project)["state"], "done")

    @unittest.skipIf(os.name == "nt", "POSIX process-group check")
    def test_worker_cancel_signals_its_process_group(self):
        class Worker:
            pid = 12345
            def poll(self):
                return None
            def wait(self, timeout=None):
                return 0
        with patch.object(app.os, "killpg") as kill_group:
            app.stop_render_process(Worker(), tree=True)
        kill_group.assert_called_once_with(12345, signal.SIGTERM)

    def test_cancel_interrupts_blocked_ffmpeg_write(self):
        cancel = threading.Event()
        writing = threading.Event()
        released = threading.Event()

        class Stdin:
            closed = False
            def write(self, _frame):
                writing.set()
                self.assert_released()
                raise BrokenPipeError()
            def assert_released(self):
                if not released.wait(2):
                    raise AssertionError("blocked write was not interrupted")
            def close(self):
                self.closed = True

        class Process:
            stdin = Stdin()
            stderr = io.BytesIO()
            stopped = False
            def poll(self):
                return 1 if self.stopped else None
            def terminate(self):
                self.stopped = True; released.set()
            def kill(self):
                self.terminate()
            def wait(self, timeout=None):
                return 1

        process = Process()
        class Page:
            def evaluate(self, *_args):
                return .1
            def screenshot(self, **_kwargs):
                return b"frame"

        def register(proc):
            def cancel_during_write():
                if writing.wait(2):
                    cancel.set(); proc.terminate()
            threading.Thread(target=cancel_during_write, daemon=True).start()

        with patch("render_video.subprocess.Popen", return_value=process):
            with self.assertRaises(RenderCancelled):
                stream_frames(Page(), None, Pipeline("jpeg", "libx264", 3_000_000),
                              SimpleNamespace(fps=12, width=16, height=16), Path("unused.wav"),
                              1/12, Path("unused.mp4"), lambda *_: None,
                              cancel_check=cancel.is_set, on_process=register)
        self.assertTrue(process.stopped)

    def test_early_and_late_frame_cancellation_closes_ffmpeg(self):
        for cancel_at in (0, 3, 9):
            with self.subTest(cancel_at=cancel_at), tempfile.TemporaryDirectory() as temp:
                folder = Path(temp)
                audio = folder / "audio.wav"
                with wave.open(str(audio), "wb") as wav:
                    wav.setnchannels(1); wav.setsampwidth(2); wav.setframerate(8000)
                    wav.writeframes(b"\x00\x00" * 8000)
                event = threading.Event()
                processes = []

                class Page:
                    calls = 0
                    def evaluate(self, _script, _time):
                        self.calls += 1
                        if self.calls == cancel_at:
                            event.set()
                        return 0.1
                    def screenshot(self, **_kwargs):
                        return b""  # never reached after cancellation at the chosen boundary

                page = Page()
                if cancel_at == 0:
                    event.set()
                with self.assertRaises(RenderCancelled):
                    stream_frames(page, None, Pipeline("png", "libx264", 3_000_000),
                                  SimpleNamespace(fps=12, width=16, height=16), audio,
                                  10/12, folder / "output.pending.mp4", lambda *_: None,
                                  cancel_check=event.is_set, on_process=processes.append)
                self.assertLessEqual(page.calls, cancel_at)
                self.assertTrue(all(process.poll() is not None for process in processes))

    def test_cancel_endpoint_is_idempotent_and_does_not_cancel_done_job(self):
        project = "a" * 32
        event = threading.Event()
        old_active, old_jobs = app.active_project, app.jobs.copy()
        old_events, old_processes = app.cancel_events.copy(), app.render_processes.copy()
        self.addCleanup(lambda: setattr(app, "active_project", old_active))
        self.addCleanup(lambda: (app.jobs.clear(), app.jobs.update(old_jobs),
                                 app.cancel_events.clear(), app.cancel_events.update(old_events),
                                 app.render_processes.clear(), app.render_processes.update(old_processes)))
        app.active_project = project
        app.jobs[project] = {"state": "rendering", "progress": 90}
        app.cancel_events[project] = event
        with patch.object(app, "project_path", return_value=Path("/tmp")):
            self.assertEqual(app.cancel_render(project)["state"], "cancelling")
            self.assertTrue(event.is_set())
            self.assertEqual(app.cancel_render(project)["state"], "cancelling")
            app.jobs[project]["state"] = "done"
            self.assertEqual(app.cancel_render(project)["state"], "done")

    def test_queued_cancel_releases_lock_and_preserves_project_files(self):
        project = "b" * 32
        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp) / project
            folder.mkdir()
            (folder / "meta.json").write_text('{"id":"' + project + '"}')
            (folder / "score.mid").write_bytes(b"original MIDI")
            (folder / "output.pending.mp4").write_bytes(b"partial")
            event = threading.Event(); event.set()
            old_active, old_jobs = app.active_project, app.jobs.copy()
            old_events = app.cancel_events.copy()
            self.addCleanup(lambda: setattr(app, "active_project", old_active))
            self.addCleanup(lambda: (app.jobs.clear(), app.jobs.update(old_jobs),
                                     app.cancel_events.clear(), app.cancel_events.update(old_events)))
            app.active_project = project
            app.jobs[project] = {"state": "cancelling", "progress": 0}
            app.cancel_events[project] = event
            self.assertTrue(app.render_lock.acquire(blocking=False))
            with patch.object(app, "DATA", Path(temp)):
                app.run_render(project, app.RenderRequest(), "unused", event)
            self.assertEqual(app.jobs[project]["state"], "cancelled")
            self.assertFalse((folder / "output.pending.mp4").exists())
            self.assertEqual((folder / "score.mid").read_bytes(), b"original MIDI")
            self.assertTrue(app.render_lock.acquire(blocking=False))
            app.render_lock.release()


if __name__ == "__main__":
    unittest.main()
