"""WAYMARK API: phone-number accounts secured by voice.

Sign up: phone number (no code) -> say three sets of random digits -> voiceprint saved.
Sign in: phone number -> say random digits -> must match the voiceprint and the digits.
Pay: the server only moves money with a one-time approval earned by another voice check,
bound to that exact payee, amount and idempotency key.
"""
from __future__ import annotations

import hashlib
import json
import os
import secrets
import time
from pathlib import Path

import numpy as np
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import bank
from .seed import new_ledger
from .store import Store
from .voice import cosine, digits_match, new_challenge_digits

ENROLL_SAMPLES = 3
MAX_AUDIO_BYTES = 2_000_000
SESSION_TTL = 30 * 60
CHALLENGE_TTL = 120
APPROVAL_TTL = 120
MAX_LOGIN_FAILURES = 5
LOCK_SECONDS = 15 * 60


class PhoneIn(BaseModel):
    phone: str


class ChallengeIn(BaseModel):
    phone: str | None = None
    purpose: str
    idempotencyKey: str | None = None
    payee: dict | None = None
    amountKobo: int | None = None


class LookupIn(BaseModel):
    bankCode: str
    accountNumber: str


class QuoteIn(BaseModel):
    amountKobo: int


class TransferIn(BaseModel):
    idempotencyKey: str
    payee: dict
    amountKobo: int
    note: str = ""
    approvalToken: str | None = None
    behaviour: str = "normal"


def env_float(name, default):
    return float(os.environ.get(name, default))


def create_app(engine=None, db_path=None, static_dir=None) -> FastAPI:
    app = FastAPI(title="WAYMARK API")
    store = Store(db_path or os.environ.get("DATABASE_URL") or os.environ.get("WAYMARK_DB", str(Path(__file__).parent.parent / "waymark.db")))
    match_threshold = env_float("WAYMARK_VOICE_THRESHOLD", 0.45)
    enroll_threshold = env_float("WAYMARK_ENROLL_THRESHOLD", 0.40)

    origins = [o for o in os.environ.get("WAYMARK_CORS_ORIGINS", "").split(",") if o]
    if origins:
        app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["*"], allow_headers=["*"])

    def get_engine():
        nonlocal engine
        if engine is None:
            from .voice import SpeechEngine
            engine = SpeechEngine()
        return engine

    def voiceprint(user_id):
        samples = store.samples(user_id)
        if not samples:
            return None
        normed = [s / (np.linalg.norm(s) + 1e-9) for s in samples]
        return np.mean(normed, axis=0)

    def current_user(authorization: str = Header(default="")) -> int:
        token = authorization.removeprefix("Bearer ").strip()
        user_id = store.session_user(token) if token else None
        if not user_id:
            raise HTTPException(401, {"code": "signed-out"})
        return user_id

    def new_session(user_id):
        token = secrets.token_urlsafe(32)
        store.add_session(token, user_id, SESSION_TTL)
        return token

    async def analyse(audio: UploadFile):
        data = await audio.read(MAX_AUDIO_BYTES + 1)
        if not data or len(data) > MAX_AUDIO_BYTES:
            return None, {"ok": False, "code": "bad-audio"}
        try:
            return get_engine().analyse(data), None
        except ValueError:
            return None, {"ok": False, "code": "bad-audio"}

    def binding_of(key, payee, amount_kobo):
        blob = json.dumps([key, payee.get("bankCode"), payee.get("accountNumber"), amount_kobo], separators=(",", ":"))
        return hashlib.sha256(blob.encode()).hexdigest()

    # ---- accounts ------------------------------------------------------------


    @app.post("/api/auth/start")
    def start(body: PhoneIn):
        """Register a new number, or say whether it already has a voiceprint."""
        phone = bank.normalise_phone(body.phone)
        if not phone:
            return {"ok": False, "code": "invalid-phone"}
        user = store.user_by_phone(phone)
        if user and user["status"] == "active":
            return {"ok": True, "phone": phone, "status": "active"}
        if user:
            store.clear_samples(user["id"])  # an unfinished sign-up starts again
        else:
            store.create_user(phone, new_ledger())
        return {"ok": True, "phone": phone, "status": "enrolling", "samplesNeeded": ENROLL_SAMPLES}


    @app.post("/api/voice/challenge")
    def challenge(body: ChallengeIn, authorization: str = Header(default="")):
        """Random digits to read aloud. Fresh each time, so a recording of last time won't do."""
        binding = None
        if body.purpose == "approve":
            user_id = current_user(authorization)
            if not (body.idempotencyKey and body.payee and isinstance(body.amountKobo, int)):
                return {"ok": False, "code": "missing-transfer"}
            binding = binding_of(body.idempotencyKey, body.payee, body.amountKobo)
        elif body.purpose in ("enroll", "login"):
            phone = bank.normalise_phone(body.phone or "")
            user = store.user_by_phone(phone) if phone else None
            want = "enrolling" if body.purpose == "enroll" else "active"
            if not user or user["status"] != want:
                return {"ok": False, "code": "no-account" if body.purpose == "login" else "not-enrolling"}
            if body.purpose == "login" and user["locked_until"] > time.time():
                return {"ok": False, "code": "locked"}
            user_id = user["id"]
        else:
            raise HTTPException(400, {"code": "bad-purpose"})
        cid = secrets.token_urlsafe(16)
        digits = new_challenge_digits()
        store.add_challenge(cid, user_id, body.purpose, digits, binding, CHALLENGE_TTL)
        return {"ok": True, "challengeId": cid, "digits": digits}

    @app.post("/api/voice/enroll")
    async def enroll(challengeId: str = Form(...), audio: UploadFile = File(...)):
        ch = store.take_challenge(challengeId, "enroll")
        if not ch:
            return {"ok": False, "code": "expired"}
        result, err = await analyse(audio)
        if err:
            return err
        if not digits_match(ch["digits"], result.digits):
            return {"ok": False, "code": "wrong-digits", "heard": result.digits}
        existing = voiceprint(ch["user_id"])
        if existing is not None and cosine(existing, result.embedding) < enroll_threshold:
            return {"ok": False, "code": "different-voice"}
        store.add_sample(ch["user_id"], result.embedding)
        count = len(store.samples(ch["user_id"]))
        if count < ENROLL_SAMPLES:
            return {"ok": True, "done": False, "samples": count, "samplesNeeded": ENROLL_SAMPLES}
        store.set_status(ch["user_id"], "active")
        return {"ok": True, "done": True, "samples": count, "token": new_session(ch["user_id"])}

    @app.post("/api/voice/login")
    async def login(challengeId: str = Form(...), audio: UploadFile = File(...)):
        ch = store.take_challenge(challengeId, "login")
        if not ch:
            return {"ok": False, "code": "expired"}
        result, err = await analyse(audio)
        if err:
            return err
        if not digits_match(ch["digits"], result.digits):
            return {"ok": False, "code": "wrong-digits", "heard": result.digits}
        score = cosine(voiceprint(ch["user_id"]), result.embedding)
        if score < match_threshold:
            store.record_login_failure(ch["user_id"], MAX_LOGIN_FAILURES, LOCK_SECONDS)
            return {"ok": False, "code": "voice-mismatch"}
        store.clear_login_failures(ch["user_id"])
        return {"ok": True, "token": new_session(ch["user_id"])}

    @app.post("/api/voice/approve")
    async def approve(challengeId: str = Form(...), audio: UploadFile = File(...), user_id: int = Depends(current_user)):
        ch = store.take_challenge(challengeId, "approve")
        if not ch or ch["user_id"] != user_id:
            return {"ok": False, "code": "expired"}
        result, err = await analyse(audio)
        if err:
            return err
        if not digits_match(ch["digits"], result.digits):
            return {"ok": False, "code": "wrong-digits", "heard": result.digits}
        if cosine(voiceprint(user_id), result.embedding) < match_threshold:
            return {"ok": False, "code": "voice-mismatch"}
        token = secrets.token_urlsafe(24)
        store.add_approval(token, user_id, ch["binding"], APPROVAL_TTL)
        return {"ok": True, "approvalToken": token}

    @app.post("/api/auth/logout")
    def logout(authorization: str = Header(default="")):
        store.end_session(authorization.removeprefix("Bearer ").strip())
        return {"ok": True}

    # ---- bank ------------------------------------------------------------------

    @app.get("/api/account")
    def get_account(user_id: int = Depends(current_user)):
        return bank.account(store.ledger(user_id))

    @app.get("/api/activity")
    def list_activity(user_id: int = Depends(current_user)):
        return bank.activity(store.ledger(user_id))

    @app.get("/api/beneficiaries")
    def list_beneficiaries(user_id: int = Depends(current_user)):
        return bank.beneficiaries()


    @app.post("/api/name-enquiry")
    def name_enquiry(body: LookupIn, user_id: int = Depends(current_user)):
        return bank.lookup(body.bankCode, body.accountNumber)


    @app.post("/api/quote")
    def quote(body: QuoteIn, user_id: int = Depends(current_user)):
        return bank.quote(store.ledger(user_id), body.amountKobo)


    @app.post("/api/transfers")
    def submit_transfer(body: TransferIn, user_id: int = Depends(current_user)):
        with store.lock:
            ledger = store.ledger(user_id)
            existing = ledger["transfers"].get(body.idempotencyKey)
            if existing:
                return bank.status_of(existing)
            if not body.approvalToken or not store.take_approval(
                    body.approvalToken, user_id, binding_of(body.idempotencyKey, body.payee, body.amountKobo)):
                return {"ok": False, "code": "not-approved"}
            if not bank.lookup(body.payee.get("bankCode"), body.payee.get("accountNumber"))["ok"]:
                return {"ok": False, "code": "not-found"}
            behaviour = body.behaviour if body.behaviour in ("normal", "decline", "hold") else "normal"
            ledger, t = bank.submit(ledger, body.idempotencyKey, body.payee, body.amountKobo, body.note[:140], behaviour)
            store.save_ledger(user_id, ledger)
            return bank.status_of(t)

    @app.get("/api/transfers/{key}")
    def transfer_status(key: str, user_id: int = Depends(current_user)):
        with store.lock:
            ledger, t = bank.check(store.ledger(user_id), key)
            if not t:
                return {"ok": True, "transferId": key, "state": "not-found"}
            store.save_ledger(user_id, ledger)
            return bank.status_of(t)

    @app.get("/api/health")
    def health():
        return {"ok": True}

    static = static_dir if static_dir is not None else os.environ.get("WAYMARK_STATIC", str(Path(__file__).parents[2] / "app"))
    if static and Path(static).is_dir():
        app.mount("/", StaticFiles(directory=static, html=True), name="app")
    return app


app = create_app() if os.environ.get("WAYMARK_NO_AUTOAPP") != "1" else None
