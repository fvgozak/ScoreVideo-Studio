"""MIDI is required; MusicXML and a finished soundtrack remain optional."""
import asyncio
import io
import json
import tempfile
import unittest
import wave
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException, UploadFile

import app


BASE = Path(__file__).resolve().parents[1]


class OptionalInputTests(unittest.TestCase):
    def test_score_zoom_reaches_200_percent_for_export(self):
        self.assertEqual(app.RenderRequest(zoom=2).zoom, 2)

    def upload(self, name: str) -> UploadFile:
        return UploadFile(file=io.BytesIO((BASE / "examples" / name).read_bytes()), filename=name)

    def test_portrait_camera_setting_is_kept_for_mp4(self):
        self.assertTrue(app.RenderRequest(width=1080, height=1920).piano_camera)
        self.assertFalse(app.RenderRequest(width=1080, height=1920,
                                           piano_camera=False).model_dump()["piano_camera"])

    def test_score_and_midi_generates_piano_audio(self):
        with tempfile.TemporaryDirectory() as root, patch.object(app, "DATA", Path(root)):
            meta = asyncio.run(app.create_project(score=self.upload("small_morning.musicxml"),
                                                  midi=self.upload("small_morning.mid"), audio=None))
            self.assertTrue(meta["has_score"])
            self.assertFalse(meta["generated_midi"])
            self.assertTrue(meta["generated_audio"])
            self.assertEqual(meta["note_count"], 15)
            self.assertEqual(meta["score_alignment"]["status"], "ok")
            folder = Path(root) / meta["id"]
            self.assertTrue((folder / "score.mid").is_file())
            with wave.open(str(folder / "audio.wav")) as audio:
                self.assertEqual(audio.getnchannels(), 2)
                self.assertGreater(audio.getnframes(), 0)
            self.assertEqual(json.loads((folder / "meta.json").read_text())["has_score"], True)

    def test_midi_only_disables_score_and_generates_audio(self):
        with tempfile.TemporaryDirectory() as root, patch.object(app, "DATA", Path(root)):
            meta = asyncio.run(app.create_project(score=None, midi=self.upload("small_morning.mid"), audio=None))
            self.assertFalse(meta["has_score"])
            self.assertIsNone(meta["score_alignment"])
            self.assertTrue(meta["generated_audio"])
            self.assertEqual(meta["note_count"], 15)
            self.assertTrue((Path(root) / meta["id"] / "audio.wav").is_file())
            with self.assertRaises(HTTPException) as error:
                app.get_score(meta["id"])
            self.assertEqual(error.exception.status_code, 404)

    def test_xml_only_is_rejected_before_creating_project(self):
        with tempfile.TemporaryDirectory() as root, patch.object(app, "DATA", Path(root)):
            with self.assertRaises(HTTPException) as error:
                asyncio.run(app.create_project(score=self.upload("small_morning.musicxml"), midi=None, audio=None))
            self.assertEqual(error.exception.status_code, 400)
            self.assertIn("MIDI file is required", error.exception.detail)
            self.assertEqual(list(Path(root).iterdir()), [])

    def test_rejects_audio_without_score_or_midi(self):
        with self.assertRaises(HTTPException) as error:
            asyncio.run(app.create_project(score=None, midi=None, audio=None))
        self.assertEqual(error.exception.status_code, 400)


if __name__ == "__main__":
    unittest.main()
