"""Download names and completed-job gating."""
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException

import app


class DownloadTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.project = "d" * 32
        self.folder = Path(self.temp.name) / self.project
        self.folder.mkdir()
        (self.folder / "output.mp4").write_bytes(b"valid completed output")
        self.data_patch = patch.object(app, "DATA", Path(self.temp.name))
        self.data_patch.start()
        self.addCleanup(self.data_patch.stop)
        self.old_jobs = app.jobs.copy()
        self.addCleanup(lambda: (app.jobs.clear(), app.jobs.update(self.old_jobs)))
        app.jobs[self.project] = {"job_id": "current", "state": "done"}

    def response(self, score_name, custom=""):
        (self.folder / "meta.json").write_text(json.dumps({"score_name": score_name}, ensure_ascii=False))
        (self.folder / "render-config.json").write_text(json.dumps({"download_name": custom,
            "width": 1280, "height": 720, "fps": 30}, ensure_ascii=False))
        return app.download(self.project, "current")

    def test_score_filename_unicode_and_last_extension(self):
        for source, expected in (("Sunday Waltz.musicxml", "Sunday Waltz_16x9_1280x720_30fps.mp4"),
                                 ("물빛 왈츠.xml", "물빛 왈츠_16x9_1280x720_30fps.mp4"),
                                 ("Après la tonalité.mxl", "Après la tonalité_16x9_1280x720_30fps.mp4"),
                                 ("蛍、風に舞う.musicxml", "蛍、風に舞う_16x9_1280x720_30fps.mp4"),
                                 ("a.b.musicxml", "a.b_16x9_1280x720_30fps.mp4")):
            with self.subTest(source=source):
                response = self.response(source)
                self.assertEqual(response.filename, expected)
                if any(ord(char) > 127 for char in expected):
                    self.assertIn("filename*=utf-8''", response.headers["content-disposition"].lower())

    def test_custom_name_and_unsafe_characters(self):
        self.assertEqual(self.response("score.xml", "My: Song/Take?.mp4").filename, "Take__16x9_1280x720_30fps.mp4")
        self.assertEqual(self.response("score.xml", "CON").filename, "ScoreVideo_16x9_1280x720_30fps.mp4")
        self.assertEqual(self.response("", "").filename, "ScoreVideo_16x9_1280x720_30fps.mp4")
        self.assertEqual(app.export_filename({"score_name": "물빛 왈츠.xml"}, {}, "webm"), "물빛 왈츠.webm")
        self.assertEqual(app.export_filename({"midi_name": "My Song.mid"}, {}, "mp4"), "My Song_16x9_1280x720_30fps.mp4")
        self.assertEqual(app.export_filename({"score_name": "wide.xml"},
            {"width": 2560, "height": 1080, "fps": 60}, "mp4"), "wide_21x9_2560x1080_60fps.mp4")
        self.assertEqual(app.export_filename({"score_name": "wide.xml"},
            {"width": 2520, "height": 1080, "fps": 30}, "mp4"), "wide_21x9_2520x1080_30fps.mp4")
        self.assertEqual(app.export_filename({"score_name": "Dream Journey.musicxml"},
            {"width": 1080, "height": 1920, "fps": 30}, "mp4"), "Dream Journey_9x16_1080x1920_30fps.mp4")

    def test_old_or_cancelled_job_cannot_download_previous_output(self):
        self.response("song.xml")
        with self.assertRaises(HTTPException) as old:
            app.download(self.project, "previous")
        self.assertEqual(old.exception.status_code, 409)
        app.jobs[self.project]["state"] = "cancelled"
        with self.assertRaises(HTTPException) as cancelled:
            app.download(self.project, "current")
        self.assertEqual(cancelled.exception.status_code, 409)
        app.jobs[self.project]["state"] = "error"
        with self.assertRaises(HTTPException):
            app.download(self.project, "current")


if __name__ == "__main__":
    unittest.main()
