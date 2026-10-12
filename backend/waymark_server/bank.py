"""The bank, server side: one ledger per user. Mirrors app/domain/ledger.js and app/bank/demo-bank.js."""
from __future__ import annotations

import re
from datetime import datetime, timezone

from .seed import BENEFICIARIES, DIRECTORY, FEE_KOBO

PHONE = re.compile(r"^0[789][01]\d{8}$")


def normalise_phone(text: str) -> str | None:
    raw = re.sub(r"[\s\-()]", "", str(text or ""))
    local = re.sub(r"^\+?234(?=[789])", "0", raw)
    return local if PHONE.match(local) else None


def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def reference(seq: int) -> str:
    n = 0x7F3A + seq
    digits = "0123456789abcdefghijklmnopqrstuvwxyz"
    out = ""
    while n:
        n, r = divmod(n, 36)
        out = digits[r] + out
    return "WM-" + out.upper().rjust(4, "0")


def account(ledger):
    return {"id": "acc-1", "nickname": "WAYMARK savings", "currency": "NGN", "balanceKobo": ledger["balanceKobo"]}


def activity(ledger):
    return list(reversed(ledger["transactions"]))


def beneficiaries():
    return [dict(b) for b in BENEFICIARIES]


def lookup(bank_code, account_number):
    for e in DIRECTORY:
        if e["bankCode"] == bank_code and e["accountNumber"] == account_number:
            return {"ok": True, "name": e["name"], "bankCode": bank_code, "accountNumber": account_number}
    return {"ok": False, "code": "not-found"}


def quote(ledger, amount_kobo):
    if not isinstance(amount_kobo, int) or amount_kobo <= 0:
        return {"ok": False, "code": "invalid-amount"}
    total = amount_kobo + FEE_KOBO
    if total > ledger["balanceKobo"]:
        return {"ok": False, "code": "insufficient-funds", "balanceKobo": ledger["balanceKobo"], "feeKobo": FEE_KOBO}
    return {"ok": True, "amountKobo": amount_kobo, "feeKobo": FEE_KOBO, "totalKobo": total}


def status_of(t):
    return {"ok": True, "transferId": t["operationId"], "state": t["state"], "reference": t["reference"],
            "payee": dict(t["payee"]), "amountKobo": t["amountKobo"], "feeKobo": t["feeKobo"],
            "totalKobo": t["totalKobo"], "note": t["note"], "failureReason": t.get("failureReason"),
            "updatedAt": t["updatedAt"]}


def submit(ledger, key, payee, amount_kobo, note, behaviour="normal"):
    """Idempotent: the same key returns the stored transfer and moves no money."""
    if key in ledger["transfers"]:
        return ledger, ledger["transfers"][key]
    total = amount_kobo + FEE_KOBO
    insufficient = total > ledger["balanceKobo"]
    state = "failed" if insufficient or behaviour == "decline" else "pending" if behaviour == "hold" else "completed"
    seq = ledger["seq"] + 1
    ts = now_iso()
    t = {"operationId": key, "payee": {k: payee[k] for k in ("name", "bankCode", "accountNumber")},
         "amountKobo": amount_kobo, "feeKobo": FEE_KOBO, "totalKobo": total, "note": note, "state": state,
         "reference": reference(seq), "failureReason": "insufficient-funds" if insufficient else None,
         "createdAt": ts, "updatedAt": ts}
    ledger["seq"] = seq
    ledger["transfers"][key] = t
    ledger["transactions"].append({"id": f"tx-{key}", "transferId": key, "description": f"Transfer to {payee['name']}",
                                   "direction": "debit", "amountKobo": amount_kobo, "feeKobo": FEE_KOBO,
                                   "status": state, "occurredAt": ts, "reference": t["reference"]})
    if state == "completed":
        ledger["balanceKobo"] -= total
    return ledger, t


def check(ledger, key):
    """A held transfer completes by the next status check (time has passed)."""
    t = ledger["transfers"].get(key)
    if t and t["state"] == "pending":
        t["state"] = "completed"
        t["updatedAt"] = now_iso()
        ledger["balanceKobo"] -= t["totalKobo"]
        for tx in ledger["transactions"]:
            if tx.get("transferId") == key:
                tx["status"] = "completed"
    return ledger, t
