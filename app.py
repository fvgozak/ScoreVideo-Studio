"""Local-only score-video web server. Run with run.command or .venv/bin/python."""
from __future__ import annotations

import io
import json
import os
import shutil
import subprocess
import sys
import threading
import uuid
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from PIL import Image, UnidentifiedImageError
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from midi_timing import read_timing
from score_alignment import align_score_to_midi, extract_score_ties
from score_repeats import unfold_musicxml
from sample_audio import render_salamander
from auto_sync import first_attack_sync
from image_palette import propose_score_palettes
from musical_salience import load_or_build as load_salience_features, reweight as reweight_salience

BASE = Path(__file__).resolve().parent
DATA = BASE / "data" / "projects"
STATIC = BASE / "static"
DATA.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="ScoreVideo Studio", docs_url=None, redoc_url=None)
app.mount("/static", StaticFiles(directory=STATIC), name="static")

# Rendering tasks are limited to one export at a time to avoid exhausting a laptop.
render_lock = threading.Lock()
state_lock = threading.Lock()
active_project: str | None = None
jobs: dict[str, dict] = {}


class RenderRequest(BaseModel):
    fps: int = Field(default=24)
    render_mode: str = Field(default="auto", pattern=r"^(auto|quality|speed)$")
    width: int = Field(default=1280)
    height: int = Field(default=720)
    zoom: float = Field(default=0.9, ge=0.5, le=2.0)
    offset_sec: float = Field(default=0.0, ge=-30, le=30)
    piano_offset_sec: float = Field(default=0.0, ge=-5, le=5)
    paper_color: str = Field(default="#fffdf6", pattern=r"^#[0-9a-fA-F]{6}$")
    ink_color: str = Field(default="#181b22", pattern=r"^#[0-9a-fA-F]{6}$")
    staff_color: str = Field(default="#323a43", pattern=r"^#[0-9a-fA-F]{6}$")
    glow_color: str = Field(default="#68ddfa", pattern=r"^#[0-9a-fA-F]{6}$")
    cursor_color: str = Field(default="#2ec9d3", pattern=r"^#[0-9a-fA-F]{6}$")
    cursor_visible: bool = True
    cursor_motion: str = Field(default="smooth", pattern=r"^(smooth|step)$")
    texture: str = Field(default="none", pattern=r"^(none|paper|parchment|grain|linen|dots)$")
    background_opacity: float = Field(default=0.5, ge=0, le=1)
    background_fit: str = Field(default="cover", pattern=r"^(cover|contain)$")
    background_position_x: float = Field(default=50.0, ge=0, le=100)
    background_position_y: float = Field(default=50.0, ge=0, le=100)
    accent_color: str = Field(default="#2ec9d3", pattern=r"^#[0-9a-fA-F]{6}$")
    inverted: bool = False
    glitter: bool = False
    sparkle: bool = True
    velocity_reactive: bool = True
    note_motion: bool = True
    draw_score: bool = False
    score_visible: bool = True
    motion_strength: float = Field(default=1.0, ge=0.0, le=2.0)
    piano_enabled: bool = True
    piano_key_style: str = Field(default="auto", pattern=r"^(auto|dark|classic|custom)$")
    piano_white_key_color: str = Field(default="#5a6576", pattern=r"^#[0-9a-fA-F]{6}$")
    piano_black_key_color: str = Field(default="#141b27", pattern=r"^#[0-9a-fA-F]{6}$")
    piano_light: bool = True
    piano_light_strength: float = Field(default=1.4, ge=0.0, le=4.0)
    piano_camera: bool = True
    layout_mode: str = Field(default="page", pattern=r"^(page|singleline|vertical|horizontal)$")
    scroll_mode: str = Field(default="vertical", pattern=r"^(vertical|horizontal|page)$")
    score_position_x: float = Field(default=38.0, ge=0, le=100)
    score_position_y: float = Field(default=0.0, ge=0, le=100)
    score_area_width: float = Field(default=94.0, ge=30, le=100)
    score_area_x: float = Field(default=50.0, ge=0, le=100)
    score_area_height: float = Field(default=50.0, ge=15, le=100)
    score_margin_top: float = Field(default=4.0, ge=0, le=45)
    score_margin_bottom: float = Field(default=9.0, ge=0, le=45)
    score_panel_color: str = Field(default="#0c1120", pattern=r"^#[0-9a-fA-F]{6}$")
    score_panel_opacity: float = Field(default=0.0, ge=0, le=1)
    camera_points: list[dict] = Field(default_factory=list, max_length=500)
    # Shared scene graph; validated in both client/renderer by ScoreStudio.normalize.
    scene: dict = Field(default_factory=dict)


class SalienceRequest(BaseModel):
    weights: dict[str, float] = Field(default_factory=dict)
    enabled: dict[str, bool] = Field(default_factory=dict)
    density: float = Field(default=.15, ge=.01, le=1)


def project_path(project_id: str) -> Path:
    # UUID hex only. No user-provided directory paths are ever accepted.
    if len(project_id) != 32 or any(c not in '0123456789abcdef' for c in project_id):
        raise HTTPException(404, "Unknown project")
    folder = DATA / project_id
    if not (folder / "meta.json").exists():
        raise HTTPException(404, "Unknown project")
    return folder


async def save_limited(upload: UploadFile, dest: Path, max_bytes: int):
    count = 0
    with dest.open("wb") as fh:
        while True:
            chunk = await upload.read(1024 * 1024)
            if not chunk:
                break
            count += len(chunk)
            if count > max_bytes:
                raise ValueError(f"File exceeds {max_bytes // (1024*1024)} MB limit")
            fh.write(chunk)
    if count == 0:
        raise ValueError("Empty input file")


def unpack_mxl(source: Path, dest: Path):
    with zipfile.ZipFile(source) as archive:
        xml_name = None
        try:
            container_xml = archive.read("META-INF/container.xml")
            container = ET.fromstring(container_xml)
            rootfile = container.find(".//{*}rootfile")
            if rootfile is not None:
                xml_name = rootfile.attrib.get("full-path")
        except (KeyError, ET.ParseError):
            pass
        if not xml_name:
            xml_name = next((x for x in archive.namelist()
                             if x.lower().endswith((".xml", ".musicxml"))
                             and not x.startswith("META-INF/")), None)
        if not xml_name or xml_name not in archive.namelist():
            raise ValueError("Compressed MusicXML (.mxl) has no score XML")
        entry = archive.getinfo(xml_name)
        if entry.file_size > 50 * 1024 * 1024:
            raise ValueError("Uncompressed MusicXML exceeds 50 MB")
        with archive.open(entry) as src, dest.open("wb") as target:
            shutil.copyfileobj(src, target)


def musicxml_title(path: Path) -> str:
    """Prefer the movement title; fall back to the work title and title credits."""
    root = ET.parse(path).getroot()
    def local_name(tag):
        return tag.rsplit('}', 1)[-1]
    direct = {local_name(c.tag): c for c in root}
    values = []
    for tag in ('movement-title',):
        node = direct.get(tag)
        if node is not None:
            values.append(' '.join(''.join(node.itertext()).split()))
    work = direct.get('work')
    if work is not None:
        for child in work:
            if local_name(child.tag) == 'work-title':
                values.append(' '.join(''.join(child.itertext()).split()))
    for credit in root:
        if local_name(credit.tag) != 'credit' or credit.attrib.get('page','1') not in ('1',''):
            continue
        if any(local_name(c.tag) == 'credit-type' and (c.text or '').strip() == 'title' for c in credit):
            for c in credit:
                if local_name(c.tag) == 'credit-words':
                    values.append(' '.join(''.join(c.itertext()).split()))
    for title in values:
        if title and title.casefold() not in {'untitled', 'untitled score', 'title'}:
            return title[:120]
    return ''


def check_musicxml(path: Path):
    try:
        doc = ET.parse(path)
    except ET.ParseError as exc:
        raise ValueError(f"Invalid MusicXML: {exc}") from exc
    tag = doc.getroot().tag.split("}")[-1]
    if tag not in ("score-partwise", "score-timewise"):
        raise ValueError("Expected a MusicXML score-partwise or score-timewise document")


def audio_duration(path: Path) -> float:
    try:
        proc = subprocess.run(
            ["ffprobe", "-v", "error", "-select_streams", "a:0",
             "-show_entries", "stream=duration:format=duration", "-of", "json", str(path)],
            capture_output=True, text=True, timeout=30, check=True,
        )
        d = json.loads(proc.stdout)
        duration = d.get("streams", [{}])[0].get("duration") or d.get("format", {}).get("duration")
        seconds = float(duration)
        if not (0 < seconds <= 3600):
            raise ValueError("Audio must be longer than zero and at most 60 minutes")
        return round(seconds, 4)
    except (OSError, subprocess.SubprocessError, ValueError, IndexError, KeyError, TypeError) as exc:
        raise ValueError(f"Cannot read audio duration (ffprobe/FFmpeg required): {exc}") from exc



def choose_performance_score(folder: Path, timing: dict) -> tuple[dict, dict]:
    """Use playback-order MusicXML only when it explains *more MIDI notes*.

    Existing projects and the uploaded source remain unchanged. If a repeated
    notated score is paired with a MIDI that does not unfold the repeat, select
    the original source and explicitly report that choice.
    """
    original = folder / "score.musicxml"
    original_alignment = align_score_to_midi(original, folder / "score.mid", timing)
    expanded = folder / "score-playback.musicxml"
    repeat = {"mode": "written", "source_measures": None, "playback_measures": None,
              "warning": "", "expanded": False}
    try:
        expanded_meta = unfold_musicxml(original, expanded)
        repeat["source_measures"] = max(expanded_meta["order"]) + 1
        repeat["playback_measures"] = len(expanded_meta["order"])
        repeat["spans"] = expanded_meta["spans"]
        repeat["has_endings"] = expanded_meta["has_endings"]
        if expanded_meta["changed"]:
            unfolded_alignment = align_score_to_midi(expanded, folder / "score.mid", timing)
            original_matches = original_alignment.get("matched_notes", 0)
            new_matches = unfolded_alignment.get("matched_notes", 0)
            original_ratio = original_matches / max(1, timing.get("note_count", 1))
            new_ratio = new_matches / max(1, timing.get("note_count", 1))
            # Require a material gain in absolute explained MIDI events, not
            # just a score-coverage percentage (original may score 100%).
            if (new_matches >= original_matches + 2 and
                new_matches >= original_matches * 1.12 and
                new_ratio >= max(.68, original_ratio + .08) and
                unfolded_alignment.get("coverage", 0) >= .68):
                repeat.update(mode="unfolded", expanded=True,
                              warning="되돌이표를 실제 MIDI 연주 순서로 전개했습니다.")
                return unfolded_alignment, repeat
            repeat["warning"] = "되돌이표는 있으나 MIDI 반복 연주가 확인되지 않아 원본 순서를 사용합니다."
            expanded.unlink(missing_ok=True)
    except ValueError as exc:
        repeat["warning"] = "반복기호 자동 전개 제한: " + str(exc)
        expanded.unlink(missing_ok=True)
    return original_alignment, repeat


@app.get("/", response_class=HTMLResponse)
def index():
    return (STATIC / "index.html").read_text(encoding="utf-8")


@app.get("/api/examples/dream-journey/{asset}")
def dream_journey_example(asset: str):
    """Serve only the curated demo files bundled with the application."""
    allowed = {
        "dream-journey.musicxml": "application/vnd.recordare.musicxml+xml",
        "dream-journey.mid": "audio/midi",
        "dream-journey.mp3": "audio/mpeg",
        "cover.png": "image/png",
    }
    if asset not in allowed:
        raise HTTPException(404, "Example asset not found")
    path = BASE / "examples" / "dream-journey" / asset
    if not path.is_file():
        raise HTTPException(404, "Example asset not installed")
    return FileResponse(path, media_type=allowed[asset], filename=asset)


@app.post("/api/projects")
async def create_project(score: UploadFile | None = File(None), midi: UploadFile | None = File(None),
                         audio: UploadFile | None = File(None)):
    if midi is None:
        raise HTTPException(400, "MIDI file is required; MusicXML alone is not supported")
    score_ext = Path(score.filename or "").suffix.lower() if score else ""
    midi_ext = Path(midi.filename or "").suffix.lower() if midi else ""
    audio_ext = Path(audio.filename or "").suffix.lower() if audio else ""
    if score and score_ext not in {".xml", ".musicxml", ".mxl"}:
        raise HTTPException(400, "MusicXML must be .xml, .musicxml, or .mxl")
    if midi and midi_ext not in {".mid", ".midi"}:
        raise HTTPException(400, "MIDI must be .mid or .midi")
    if audio and audio_ext not in {".wav", ".mp3", ".m4a", ".aac", ".flac", ".ogg"}:
        raise HTTPException(400, "Audio must be WAV, MP3, M4A, AAC, FLAC, or OGG")

    project_id = uuid.uuid4().hex
    folder = DATA / project_id
    folder.mkdir(parents=True, exist_ok=False)
    score_raw = folder / f"source{score_ext}" if score else None
    score_xml = folder / "score.musicxml"
    midi_file = folder / "score.mid"
    audio_file = folder / f"audio{audio_ext or '.wav'}"
    try:
        if score:
            await save_limited(score, score_raw, 50 * 1024 * 1024)
            if score_ext == ".mxl":
                unpack_mxl(score_raw, score_xml)
            else:
                shutil.copyfile(score_raw, score_xml)
            check_musicxml(score_xml)
            document_title = musicxml_title(score_xml) or Path(score.filename or 'score.musicxml').stem
        else:
            document_title = Path(midi.filename or "piano.mid").stem
        await save_limited(midi, midi_file, 20 * 1024 * 1024)
        timing = read_timing(midi_file)
        if audio:
            await save_limited(audio, audio_file, 250 * 1024 * 1024)
            duration = audio_duration(audio_file)
        else:
            duration = render_salamander(timing, audio_file)
        if score:
            alignment, repeat_info = choose_performance_score(folder, timing)
            selected_score = folder / ("score-playback.musicxml" if repeat_info.get("mode")=="unfolded" else "score.musicxml")
            tie_continuations = extract_score_ties(selected_score)
        else:
            alignment, repeat_info, tie_continuations = None, {"mode": "none", "warning": ""}, []
        meta = {
            "id": project_id,
            "has_score": bool(score),
            "generated_midi": False,
            "generated_audio": audio is None,
            "score_name": Path(score.filename or "").name if score else "",
            "musicxml_title": document_title,
            "midi_name": Path(midi.filename or "").name,
            "audio_name": Path(audio.filename or "").name if audio else "Salamander Grand Piano",
            "audio_filename": audio_file.name,
            "audio_duration_sec": duration,
            "sync": None,
            "background_filename": None,
            "score_alignment": alignment,
            "tie_continuations": tie_continuations,
            "repeat_info": repeat_info,
            **timing,
        }
        (folder / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
        return meta
    except Exception as exc:
        shutil.rmtree(folder, ignore_errors=True)
        raise HTTPException(400, str(exc)) from exc
    finally:
        for upload in (score, midi, audio):
            if upload is not None:
                await upload.close()


@app.get("/api/projects/{project_id}")
def get_project(project_id: str):
    folder = project_path(project_id)
    file = folder / "meta.json"
    meta = json.loads(file.read_text(encoding="utf-8"))
    if meta.get("has_score", True) and ("tie_continuations" not in meta or meta.get("repeat_info") is None or "musicxml_title" not in meta or
            meta.get("score_alignment", {}).get("method") != "pitch-onset-anchors-v1"):
        # Upgrade old projects atomically, building a new repeat-aware
        # playback file without touching the original uploaded XML.
        with state_lock:
            meta = json.loads(file.read_text(encoding="utf-8"))
            meta["musicxml_title"] = (musicxml_title(folder / "score.musicxml")
                                       or Path(meta.get("score_name") or "score.musicxml").stem)
            # Backfill exact MIDI note endings on old projects as well.
            meta.update(read_timing(folder / "score.mid"))
            meta["score_alignment"], meta["repeat_info"] = choose_performance_score(folder, meta)
            selected_score=folder / ("score-playback.musicxml" if meta["repeat_info"].get("mode")=="unfolded" else "score.musicxml")
            meta["tie_continuations"] = extract_score_ties(selected_score)
            pending = folder / "meta-repeat.pending.json"
            pending.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
            pending.replace(file)
    return meta


def _salience_cache(project_id: str):
    folder = project_path(project_id)
    meta = get_project(project_id)
    score = None
    if meta.get("has_score", True):
        selected = "score-playback.musicxml" if meta.get("repeat_info", {}).get("mode") == "unfolded" else "score.musicxml"
        score = folder / selected
    with state_lock:
        return load_salience_features(folder, score, meta)


@app.get("/api/projects/{project_id}/salience")
def get_salience(project_id: str, density: float = Query(default=.15, ge=.01, le=1)):
    """Get cached note features, default salience scores, and soft highlights."""
    return reweight_salience(_salience_cache(project_id), density=density)


@app.post("/api/projects/{project_id}/salience/reweight")
def recalculate_salience(project_id: str, settings: SalienceRequest):
    """Change weights/toggles/density without parsing MusicXML or MIDI again."""
    return reweight_salience(_salience_cache(project_id), settings.weights, settings.enabled, settings.density)


@app.post("/api/projects/{project_id}/auto-sync")
def calculate_sync(project_id: str):
    folder = project_path(project_id)
    meta_file = folder / "meta.json"
    meta = json.loads(meta_file.read_text(encoding="utf-8"))
    try:
        result = first_attack_sync(folder / "score.mid", folder / meta["audio_filename"],
                           float(meta["audio_duration_sec"]))
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    meta["sync"] = result
    # Atomic replacement prevents corruption if loading the project during sync.
    temp = folder / "meta.pending.json"
    temp.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    temp.replace(meta_file)
    return result


@app.delete("/api/projects/{project_id}/auto-sync")
def reset_sync(project_id: str):
    folder = project_path(project_id)
    meta_file = folder / "meta.json"
    meta = json.loads(meta_file.read_text(encoding="utf-8"))
    meta["sync"] = None
    temp = folder / "meta.pending.json"
    temp.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    temp.replace(meta_file)
    return {"sync": None}


@app.post("/api/palette/extract")
async def extract_image_palette(image: UploadFile = File(...)):
    """Analyze cover art without requiring a project or storing the uploaded image."""
    allowed={".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif"}
    extension=Path(image.filename or "").suffix.lower()
    if extension not in allowed:
        raise HTTPException(400,"이미지는 PNG, JPG, WebP, BMP 또는 GIF여야 합니다.")
    try:
        raw=await image.read(20*1024*1024+1)
        if not raw or len(raw)>20*1024*1024:
            raise HTTPException(413,"이미지는 20MB 이하로 업로드해 주세요.")
        with Image.open(io.BytesIO(raw)) as artwork:
            if artwork.width*artwork.height>80_000_000:
                raise HTTPException(413,"이미지 해상도가 너무 큽니다.")
            if artwork.format not in {"PNG","JPEG","WEBP","BMP","GIF"}:
                raise HTTPException(400,"지원하지 않는 이미지 형식입니다.")
            artwork.load()
            return propose_score_palettes(artwork)
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        raise HTTPException(400,f"이미지를 읽지 못했습니다: {exc}") from exc
    finally:
        await image.close()


@app.post("/api/projects/{project_id}/background")
async def upload_background(project_id: str, background: UploadFile = File(...)):
    """Validate and store a local image. A single file per project avoids stale assets."""
    folder = project_path(project_id)
    extension = Path(background.filename or "").suffix.lower()
    if extension not in {".png", ".jpg", ".jpeg", ".webp"}:
        raise HTTPException(400, "Background must be PNG, JPEG or WebP")
    candidate = folder / "background.pending"
    try:
        await save_limited(background, candidate, 20 * 1024 * 1024)
        try:
            with Image.open(candidate) as im:
                if im.format not in {"PNG", "JPEG", "WEBP"} or im.width > 8000 or im.height > 8000:
                    raise ValueError("Unsupported background image or dimensions over 8000px")
                im.verify()
        except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as exc:
            raise ValueError(f"Invalid background image: {exc}") from exc
        # Keep a canonical validated extension according to PIL's detected image type.
        with Image.open(candidate) as im:
            actual = {"PNG": ".png", "JPEG": ".jpg", "WEBP": ".webp"}[im.format]
        for old in folder.glob("background.*"):
            if old.name != "background.pending":
                old.unlink(missing_ok=True)
        image_file = folder / ("background" + actual)
        candidate.replace(image_file)
        metadata = folder / "meta.json"
        meta = json.loads(metadata.read_text(encoding="utf-8"))
        meta["background_filename"] = image_file.name
        meta["background_version"] = image_file.stat().st_mtime_ns
        meta["background_original_name"] = Path(background.filename or image_file.name).name
        tmp = folder / "meta.pending.json"
        tmp.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
        tmp.replace(metadata)
        return {"background_filename": image_file.name,
                "background_version": meta["background_version"],
                "background_original_name": meta["background_original_name"],
                "url": f"/api/projects/{project_id}/background?version={meta['background_version']}"}
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    finally:
        await background.close()
        candidate.unlink(missing_ok=True)


@app.get("/api/projects/{project_id}/background")
def get_background(project_id: str):
    folder = project_path(project_id)
    meta = json.loads((folder / "meta.json").read_text(encoding="utf-8"))
    filename = meta.get("background_filename")
    if not filename or filename not in {"background.png", "background.jpg", "background.webp"}:
        raise HTTPException(404, "No background")
    path = folder / filename
    if not path.exists():
        raise HTTPException(404, "No background")
    return FileResponse(path, media_type={".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp"}[path.suffix])


@app.delete("/api/projects/{project_id}/background")
def delete_background(project_id: str):
    folder = project_path(project_id)
    meta_path = folder / "meta.json"
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    name = meta.get("background_filename")
    if name in {"background.png", "background.jpg", "background.webp"}:
        (folder / name).unlink(missing_ok=True)
    meta["background_filename"] = None
    meta["background_version"] = None
    meta["background_original_name"] = None
    temp = folder / "meta.pending.json"
    temp.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    temp.replace(meta_path)
    return {"background_filename": None}


@app.get("/api/projects/{project_id}/score")
def get_score(project_id: str):
    folder = project_path(project_id)
    meta = get_project(project_id)
    if meta.get("has_score") is False:
        raise HTTPException(404, "This MIDI-only project has no MusicXML score")
    selected = "score-playback.musicxml" if meta.get("repeat_info", {}).get("mode") == "unfolded" else "score.musicxml"
    if not (folder / selected).exists():
        selected = "score.musicxml"
    return FileResponse(folder / selected, media_type="application/xml")


@app.get("/api/projects/{project_id}/audio")
def get_audio(project_id: str):
    folder = project_path(project_id)
    meta = json.loads((folder / "meta.json").read_text(encoding="utf-8"))
    # HTML audio can play most formats; FLAC/AAC browser support differs by browser.
    media = {".mp3": "audio/mpeg", ".wav": "audio/wav", ".flac": "audio/flac",
             ".ogg": "audio/ogg", ".m4a": "audio/mp4", ".aac": "audio/aac"}
    path = folder / meta["audio_filename"]
    return FileResponse(path, media_type=media.get(path.suffix, "application/octet-stream"))


@app.get("/render/{project_id}", response_class=HTMLResponse)
def render_page(project_id: str):
    project_path(project_id)
    return (STATIC / "render.html").read_text(encoding="utf-8")


def update_job(project_id: str, **fields):
    with state_lock:
        jobs.setdefault(project_id, {}).update(fields)


def render_python() -> str | None:
    """Find a Playwright-capable interpreter even when the web server is global Python."""
    candidates = [Path(sys.executable), BASE / ".venv" / "bin" / "python",
                  BASE / ".venv" / "Scripts" / "python.exe"]
    seen = set()
    for candidate in candidates:
        if not candidate.is_file() or str(candidate.resolve()) in seen:
            continue
        seen.add(str(candidate.resolve()))
        result = subprocess.run([str(candidate), "-c", "import playwright.sync_api"],
                                capture_output=True, timeout=15, check=False)
        if result.returncode == 0:
            return str(candidate)
    return None


def run_render(project_id: str, settings: RenderRequest, python: str):
    global active_project
    try:
        folder = DATA / project_id
        meta = json.loads((folder / "meta.json").read_text(encoding="utf-8"))
        # Freeze the settings as a per-export snapshot. The render-only page
        # uses this exact JSON, rather than reconstructing options from a URL.
        settings_file = folder / "render-config.json"
        pending_settings = folder / "render-config.pending.json"
        pending_settings.write_text(settings.model_dump_json(), encoding="utf-8")
        pending_settings.replace(settings_file)
        update_job(project_id, state="rendering", progress=0, message="Starting Chromium")
        if Path(python).resolve() == Path(sys.executable).resolve():
            from render_video import export_mp4
            export_mp4(folder=folder, meta=meta, settings=settings,
                       on_progress=lambda p, msg: update_job(project_id, progress=p, message=msg))
        else:
            process = subprocess.Popen([python, str(BASE / "render_worker.py"), project_id],
                                       stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
                                       env=os.environ.copy())
            assert process.stdout is not None and process.stderr is not None
            for line in process.stdout:
                try:
                    event = json.loads(line)
                    update_job(project_id, progress=event["progress"], message=event["message"])
                except (ValueError, KeyError, TypeError):
                    continue
            error = process.stderr.read()
            if process.wait():
                raise RuntimeError(error.strip()[-1200:] or "MP4 render worker failed")
        update_job(project_id, state="done", progress=100)
    except Exception as exc:
        update_job(project_id, state="error", message=str(exc))
    finally:
        with state_lock:
            active_project = None
        render_lock.release()


@app.post("/api/projects/{project_id}/render")
def start_render(project_id: str, options: RenderRequest):
    global active_project
    project_path(project_id)
    python = render_python()
    if python is None:
        raise HTTPException(503, "Playwright is missing. Run ./run.command to install the project environment and Chromium, then retry MP4 export.")
    if (options.width, options.height) not in {(1280, 720), (1920, 1080), (1080, 1920), (1080, 1080), (1080, 1350), (1080, 1440), (1440, 1080), (2560, 1080)}:
        raise HTTPException(400, "Unsupported video aspect ratio/resolution preset")
    if options.fps not in (12, 24, 30):
        raise HTTPException(400, "FPS must be 12, 24, or 30")
    if not render_lock.acquire(blocking=False):
        raise HTTPException(409, f"Another export is running: {active_project}")
    with state_lock:
        active_project = project_id
        jobs[project_id] = {"state": "queued", "progress": 0, "message": "Queued"}
    try:
        threading.Thread(target=run_render, args=(project_id, options, python), daemon=True).start()
    except Exception:
        with state_lock:
            active_project = None
        render_lock.release()
        raise
    return jobs[project_id]


@app.get("/api/projects/{project_id}/render-config")
def get_render_config(project_id: str):
    folder = project_path(project_id)
    path = folder / "render-config.json"
    if not path.exists():
        raise HTTPException(404, "No video render settings have been submitted")
    return json.loads(path.read_text(encoding="utf-8"))


@app.get("/api/projects/{project_id}/status")
def render_status(project_id: str):
    project_path(project_id)
    with state_lock:
        return dict(jobs.get(project_id, {"state": "idle", "progress": 0, "message": ""}))


@app.get("/api/projects/{project_id}/render-diagnostics")
def render_diagnostics(project_id: str):
    path = project_path(project_id) / "render-diagnostics.json"
    if not path.exists():
        raise HTTPException(404, "Render diagnostics not available")
    return json.loads(path.read_text(encoding="utf-8"))


@app.get("/api/projects/{project_id}/download")
def download(project_id: str):
    path = project_path(project_id) / "output.mp4"
    if not path.exists():
        raise HTTPException(404, "Export is not ready")
    return FileResponse(path, media_type="video/mp4", filename="scorevideo.mp4")
