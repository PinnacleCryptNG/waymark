"""SQLite or Postgres storage: users, voiceprints, sessions, challenges and each user's ledger (as JSON)."""
from __future__ import annotations

import json
import sqlite3
import threading
import time

import numpy as np

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL,              -- 'enrolling' or 'active'
  created_at REAL NOT NULL,
  failed_logins INTEGER NOT NULL DEFAULT 0,
  locked_until REAL NOT NULL DEFAULT 0,
  ledger TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS voice_samples (
  user_id INTEGER NOT NULL REFERENCES users(id),
  embedding BLOB NOT NULL,
  created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS challenges (
  id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, purpose TEXT NOT NULL, digits TEXT NOT NULL,
  binding TEXT, expires_at REAL NOT NULL, used INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS approvals (
  token TEXT PRIMARY KEY, user_id INTEGER NOT NULL, binding TEXT NOT NULL, expires_at REAL NOT NULL, used INTEGER NOT NULL DEFAULT 0
);
"""


SCHEMA_PG = (SCHEMA.replace("INTEGER PRIMARY KEY AUTOINCREMENT", "SERIAL PRIMARY KEY")
             .replace("BLOB", "BYTEA").replace("REAL", "DOUBLE PRECISION"))


class Store:
    """`target` is a SQLite file path or a postgres:// URL (e.g. a free Neon database)."""

    def __init__(self, target: str):
        self.target = target
        self.pg = target.startswith(("postgres://", "postgresql://"))
        self.lock = threading.RLock()
        self._connect()

    def _connect(self):
        if self.pg:
            import psycopg
            from psycopg.rows import dict_row
            self.db = psycopg.connect(self.target, row_factory=dict_row, autocommit=True)
            self.db.execute(SCHEMA_PG)
        else:
            self.db = sqlite3.connect(self.target, check_same_thread=False)
            self.db.row_factory = sqlite3.Row
            self.db.executescript(SCHEMA)

    def q(self, sql, args=()):
        with self.lock:
            if not self.pg:
                cur = self.db.execute(sql, args)
                self.db.commit()
                return cur
            import psycopg
            for attempt in (0, 1):
                try:
                    return self.db.execute(sql.replace("?", "%s"), args)
                except psycopg.OperationalError:  # hosted Postgres drops idle connections
                    if attempt:
                        raise
                    self._connect()

    def one(self, sql, args=()):
        return self.q(sql, args).fetchone()

    # users
    def user_by_phone(self, phone):
        return self.one("SELECT * FROM users WHERE phone = ?", (phone,))

    def user(self, user_id):
        return self.one("SELECT * FROM users WHERE id = ?", (user_id,))

    def create_user(self, phone, ledger):
        sql = "INSERT INTO users (phone, status, created_at, ledger) VALUES (?, 'enrolling', ?, ?)"
        args = (phone, time.time(), json.dumps(ledger))
        if self.pg:
            return self.one(sql + " RETURNING id", args)["id"]
        return self.q(sql, args).lastrowid

    def set_status(self, user_id, status):
        self.q("UPDATE users SET status = ? WHERE id = ?", (status, user_id))

    def ledger(self, user_id):
        return json.loads(self.user(user_id)["ledger"])

    def save_ledger(self, user_id, ledger):
        self.q("UPDATE users SET ledger = ? WHERE id = ?", (json.dumps(ledger), user_id))

    def record_login_failure(self, user_id, max_failures, lock_seconds):
        u = self.user(user_id)
        n = u["failed_logins"] + 1
        locked = time.time() + lock_seconds if n >= max_failures else 0
        self.q("UPDATE users SET failed_logins = ?, locked_until = ? WHERE id = ?", (0 if locked else n, locked, user_id))

    def clear_login_failures(self, user_id):
        self.q("UPDATE users SET failed_logins = 0, locked_until = 0 WHERE id = ?", (user_id,))

    # voice
    def add_sample(self, user_id, emb: np.ndarray):
        self.q("INSERT INTO voice_samples VALUES (?, ?, ?)", (user_id, emb.astype(np.float32).tobytes(), time.time()))

    def samples(self, user_id):
        rows = self.q("SELECT embedding FROM voice_samples WHERE user_id = ?", (user_id,)).fetchall()
        return [np.frombuffer(r["embedding"], dtype=np.float32) for r in rows]

    def clear_samples(self, user_id):
        self.q("DELETE FROM voice_samples WHERE user_id = ?", (user_id,))

    # sessions, challenges, approvals
    def add_session(self, token, user_id, ttl):
        self.q("INSERT INTO sessions VALUES (?, ?, ?)", (token, user_id, time.time() + ttl))

    def session_user(self, token):
        r = self.one("SELECT user_id FROM sessions WHERE token = ? AND expires_at > ?", (token, time.time()))
        return r["user_id"] if r else None

    def end_session(self, token):
        self.q("DELETE FROM sessions WHERE token = ?", (token,))

    def add_challenge(self, cid, user_id, purpose, digits, binding, ttl):
        self.q("INSERT INTO challenges (id, user_id, purpose, digits, binding, expires_at) VALUES (?, ?, ?, ?, ?, ?)",
               (cid, user_id, purpose, digits, binding, time.time() + ttl))

    def take_challenge(self, cid, purpose):
        """A challenge can be answered once, before it expires."""
        with self.lock:
            r = self.one("SELECT * FROM challenges WHERE id = ? AND purpose = ? AND used = 0 AND expires_at > ?",
                         (cid, purpose, time.time()))
            if r:
                self.q("UPDATE challenges SET used = 1 WHERE id = ?", (cid,))
            return r

    def add_approval(self, token, user_id, binding, ttl):
        self.q("INSERT INTO approvals VALUES (?, ?, ?, ?, 0)", (token, user_id, binding, time.time() + ttl))

    def take_approval(self, token, user_id, binding):
        with self.lock:
            r = self.one("SELECT * FROM approvals WHERE token = ? AND user_id = ? AND binding = ? AND used = 0 AND expires_at > ?",
                         (token, user_id, binding, time.time()))
            if r:
                self.q("UPDATE approvals SET used = 1 WHERE token = ?", (token,))
            return bool(r)
