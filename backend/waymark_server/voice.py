"""Speaker verification and spoken-digit checks.

An Engine turns one recorded clip into (voice embedding, digits heard). The real engine uses
SpeechBrain's ECAPA-TDNN speaker model and faster-whisper; tests swap in a stand-in.
"""
from __future__ import annotations

import os
import re
import secrets
import subprocess
from dataclasses import dataclass

import numpy as np

from .fbank import fbank

SAMPLE_RATE = 16000
DIGIT_WORDS = {
    "zero": "0", "oh": "0", "o": "0", "one": "1", "won": "1", "two": "2", "to": "2", "too": "2",
    "three": "3", "tree": "3", "four": "4", "for": "4", "five": "5", "six": "6", "seven": "7",
    "eight": "8", "ate": "8", "nine": "9",
}


@dataclass
class Analysis:
    embedding: np.ndarray
    digits: str
    transcript: str
    seconds: float


def new_challenge_digits(n: int = 5) -> str:
    """Random digits with no immediate repeats, so each one is said clearly."""
    out = []
    while len(out) < n:
        d = str(secrets.randbelow(10))
        if not out or out[-1] != d:
            out.append(d)
    return "".join(out)


def digits_in(text: str) -> str:
    out = []
    tokens = re.findall(r"[a-z]+|\d", text.lower())
    i = 0
    while i < len(tokens):
        t = tokens[i]
        rep = {"double": 2, "triple": 3}.get(t)
        nxt = tokens[i + 1] if i + 1 < len(tokens) else ""
        if rep and (nxt.isdigit() or nxt in DIGIT_WORDS):
            out.append((nxt if nxt.isdigit() else DIGIT_WORDS[nxt]) * rep)
            i += 2
            continue
        if t.isdigit():
            out.append(t)
        elif t in DIGIT_WORDS:
            out.append(DIGIT_WORDS[t])
        i += 1
    return "".join(out)


def edit_distance(a: str, b: str) -> int:
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def digits_match(expected: str, heard: str) -> bool:
    """Allow one slip in five digits: speech-to-text sometimes mishears a single digit."""
    return edit_distance(expected, heard) <= 1


def cosine(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-9))


def decode_audio(data: bytes) -> np.ndarray:
    """Any browser recording (webm/opus, mp4/aac, wav) to 16 kHz mono float32, via ffmpeg."""
    proc = subprocess.run(
        ["ffmpeg", "-loglevel", "error", "-i", "pipe:0", "-ac", "1", "-ar", str(SAMPLE_RATE), "-f", "f32le", "pipe:1"],
        input=data, capture_output=True, check=False, timeout=30,
    )
    if proc.returncode != 0:
        raise ValueError("Could not read the recording")
    return np.frombuffer(proc.stdout, dtype=np.float32).copy()


class SpeechEngine:
    def __init__(self, model_dir: str | None = None):
        import onnxruntime as ort
        from faster_whisper import WhisperModel

        model_dir = model_dir or os.environ.get("WAYMARK_MODEL_DIR", os.path.join(os.path.dirname(__file__), "..", "models"))
        onnx_path = os.path.join(model_dir, "ecapa.onnx")
        if not os.path.exists(onnx_path):
            raise RuntimeError(f"{onnx_path} is missing: run scripts/export_onnx.py {model_dir}")
        opts = ort.SessionOptions()
        opts.intra_op_num_threads = int(os.environ.get("WAYMARK_THREADS", "2"))
        opts.enable_cpu_mem_arena = False  # keeps peak memory inside small hosts (Render free: 512 MB)
        opts.enable_mem_pattern = False
        self.speaker = ort.InferenceSession(onnx_path, opts, providers=["CPUExecutionProvider"])
        self.mel_filters = np.load(os.path.join(model_dir, "mel_filters.npy"))
        self.asr = WhisperModel(os.environ.get("WAYMARK_WHISPER_MODEL", "base.en"), device="cpu", compute_type="int8",
                                cpu_threads=int(os.environ.get("WAYMARK_THREADS", "2")),
                                download_root=os.path.join(model_dir, "whisper"))

    def analyse(self, data: bytes) -> Analysis:
        wav = decode_audio(data)
        seconds = len(wav) / SAMPLE_RATE
        if seconds < 0.8:
            raise ValueError("The recording was too short")
        emb = self.speaker.run(None, {"feats": fbank(wav, self.mel_filters)[None]})[0]
        segments, _ = self.asr.transcribe(wav, language="en", beam_size=int(os.environ.get("WAYMARK_BEAM", "5")), vad_filter=True,
                                          initial_prompt="The speaker reads out single digits, for example: 4 7 2 9 1.")
        transcript = " ".join(s.text for s in segments).strip()
        return Analysis(embedding=emb.astype(np.float32), digits=digits_in(transcript), transcript=transcript, seconds=seconds)
