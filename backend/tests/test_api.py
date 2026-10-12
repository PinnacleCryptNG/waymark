import io
import os

os.environ["WAYMARK_NO_AUTOAPP"] = "1"

import numpy as np
import pytest
from fastapi.testclient import TestClient


def db_target(tmp_path):
    """SQLite by default; set WAYMARK_TEST_DATABASE_URL to run the same tests against Postgres."""
    url = os.environ.get("WAYMARK_TEST_DATABASE_URL")
    if not url:
        return str(tmp_path / "t.db")
    import psycopg
    with psycopg.connect(url, autocommit=True) as c:
        c.execute("DROP TABLE IF EXISTS voice_samples, sessions, challenges, approvals, users")
    return url


from waymark_server.app import create_app
from waymark_server.voice import Analysis, digits_in, digits_match

VOICES = {"ada": np.array([1.0, 0.1, 0.0, 0.0]), "ada2": np.array([0.95, 0.15, 0.05, 0.0]), "bola": np.array([0.0, 0.1, 1.0, 0.2])}


class FakeEngine:
    """Clips are text like b'ada:47291' -> that speaker's vector and those digits."""
    def analyse(self, data):
        who, _, said = data.decode().partition(":")
        return Analysis(embedding=VOICES[who].astype(np.float32), digits=digits_in(said), transcript=said, seconds=2)


@pytest.fixture
def client(tmp_path):
    return TestClient(create_app(engine=FakeEngine(), db_path=db_target(tmp_path), static_dir=""))


def say(client, path, cid, clip, token=None):
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    return client.post(path, data={"challengeId": cid}, files={"audio": ("a.webm", io.BytesIO(clip), "audio/webm")}, headers=headers).json()


def enroll(client, phone="08031234567", voice="ada"):
    assert client.post("/api/auth/start", json={"phone": phone}).json()["status"] == "enrolling"
    for i in range(3):
        ch = client.post("/api/voice/challenge", json={"phone": phone, "purpose": "enroll"}).json()
        r = say(client, "/api/voice/enroll", ch["challengeId"], f"{voice}:{ch['digits']}".encode())
        assert r["ok"], r
    return r["token"]


def login(client, voice, phone="08031234567"):
    ch = client.post("/api/voice/challenge", json={"phone": phone, "purpose": "login"}).json()
    return say(client, "/api/voice/login", ch["challengeId"], f"{voice}:{ch['digits']}".encode())


PAYEE = {"name": "Musa Ibrahim", "bankCode": "SVN", "accountNumber": "2203918846"}


def approve(client, token, voice, key="k1", amount=500000):
    ch = client.post("/api/voice/challenge", json={"purpose": "approve", "idempotencyKey": key, "payee": PAYEE, "amountKobo": amount},
                     headers={"Authorization": f"Bearer {token}"}).json()
    return say(client, "/api/voice/approve", ch["challengeId"], f"{voice}:{ch['digits']}".encode(), token)


def test_digit_parsing():
    assert digits_in("Four, seven, two, nine, one.") == "47291"
    assert digits_in("4 7 2 9 1") == "47291"
    assert digits_in("double five, three oh") == "5530"
    assert digits_match("47291", "4729") and not digits_match("47291", "12345")


def test_rejects_bad_phone(client):
    assert client.post("/api/auth/start", json={"phone": "12345"}).json() == {"ok": False, "code": "invalid-phone"}


def test_enrol_then_login_with_same_voice(client):
    token = enroll(client)
    assert client.get("/api/account", headers={"Authorization": f"Bearer {token}"}).json()["balanceKobo"] == 24580000
    assert client.post("/api/auth/start", json={"phone": "+2348031234567"}).json()["status"] == "active"
    assert login(client, "ada2")["ok"]


def test_other_voice_cannot_login(client):
    enroll(client)
    assert login(client, "bola") == {"ok": False, "code": "voice-mismatch"}


def test_wrong_digits_rejected_even_with_right_voice(client):
    enroll(client)
    ch = client.post("/api/voice/challenge", json={"phone": "08031234567", "purpose": "login"}).json()
    wrong = "".join(str((int(d) + 5) % 10) for d in ch["digits"])
    assert say(client, "/api/voice/login", ch["challengeId"], f"ada:{wrong}".encode())["code"] == "wrong-digits"


def test_challenge_cannot_be_replayed(client):
    enroll(client)
    ch = client.post("/api/voice/challenge", json={"phone": "08031234567", "purpose": "login"}).json()
    clip = f"ada:{ch['digits']}".encode()
    assert say(client, "/api/voice/login", ch["challengeId"], clip)["ok"]
    assert say(client, "/api/voice/login", ch["challengeId"], clip)["code"] == "expired"


def test_enrolment_rejects_a_second_speaker(client):
    client.post("/api/auth/start", json={"phone": "08031234567"})
    ch = client.post("/api/voice/challenge", json={"phone": "08031234567", "purpose": "enroll"}).json()
    say(client, "/api/voice/enroll", ch["challengeId"], f"ada:{ch['digits']}".encode())
    ch = client.post("/api/voice/challenge", json={"phone": "08031234567", "purpose": "enroll"}).json()
    assert say(client, "/api/voice/enroll", ch["challengeId"], f"bola:{ch['digits']}".encode())["code"] == "different-voice"


def test_lockout_after_repeated_mismatches(client):
    enroll(client)
    for _ in range(5):
        login(client, "bola")
    assert client.post("/api/voice/challenge", json={"phone": "08031234567", "purpose": "login"}).json()["code"] == "locked"


def test_bank_needs_session(client):
    assert client.get("/api/account").status_code == 401


def test_transfer_needs_voice_approval_bound_to_payment(client):
    token = enroll(client)
    h = {"Authorization": f"Bearer {token}"}
    body = {"idempotencyKey": "k1", "payee": PAYEE, "amountKobo": 500000}
    assert client.post("/api/transfers", json=body, headers=h).json()["code"] == "not-approved"
    assert approve(client, token, "bola")["code"] == "voice-mismatch"
    ok = approve(client, token, "ada")
    tampered = {**body, "amountKobo": 9000000, "approvalToken": ok["approvalToken"]}
    assert client.post("/api/transfers", json=tampered, headers=h).json()["code"] == "not-approved"
    ok = approve(client, token, "ada")
    r = client.post("/api/transfers", json={**body, "approvalToken": ok["approvalToken"]}, headers=h).json()
    assert r["state"] == "completed"
    again = client.post("/api/transfers", json=body, headers=h).json()
    assert again["reference"] == r["reference"]
    assert client.get("/api/account", headers=h).json()["balanceKobo"] == 24580000 - 500000 - 1000


def test_accounts_are_separate(client):
    a = enroll(client, "08031234567", "ada")
    b = enroll(client, "08061234567", "bola")
    ok = approve(client, a, "ada")
    client.post("/api/transfers", json={"idempotencyKey": "k1", "payee": PAYEE, "amountKobo": 500000, "approvalToken": ok["approvalToken"]},
                headers={"Authorization": f"Bearer {a}"})
    assert client.get("/api/account", headers={"Authorization": f"Bearer {b}"}).json()["balanceKobo"] == 24580000
