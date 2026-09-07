# -*- coding: utf-8 -*-
"""Persistent storage for analyzed document batches (SQLite, stdlib only).

We store the *analysis payload* (goals, evidence excerpts, summaries, counts)
- not the raw uploaded files. Each batch is one row holding a JSON blob.
"""
import json
import os
import sqlite3
import threading
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

_DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
_DB_PATH = os.path.join(_DATA_DIR, "lots.db")

_lock = threading.Lock()


def _conn() -> sqlite3.Connection:
    os.makedirs(_DATA_DIR, exist_ok=True)
    conn = sqlite3.connect(_DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS batches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            lang TEXT NOT NULL DEFAULT 'en',
            created_at TEXT NOT NULL,
            total_documents INTEGER NOT NULL DEFAULT 0,
            payload TEXT NOT NULL
        )
        """
    )
    return conn


def save_batch(name: str, lang: str, payload: Dict[str, Any]) -> int:
    """Persist a batch; returns its new id."""
    created_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    total = len(payload.get("documents", []))
    with _lock:
        conn = _conn()
        try:
            cur = conn.execute(
                "INSERT INTO batches (name, lang, created_at, total_documents, payload) VALUES (?, ?, ?, ?, ?)",
                (name, lang, created_at, total, json.dumps(payload, ensure_ascii=False)),
            )
            conn.commit()
            return int(cur.lastrowid)
        finally:
            conn.close()


def list_batches() -> List[Dict[str, Any]]:
    """Return lightweight metadata for every saved batch (newest first)."""
    with _lock:
        conn = _conn()
        try:
            rows = conn.execute(
                "SELECT id, name, lang, created_at, total_documents FROM batches ORDER BY created_at DESC, id DESC"
            ).fetchall()
            return [
                {"id": r["id"], "name": r["name"], "lang": r["lang"],
                 "created_at": r["created_at"], "total_documents": r["total_documents"]}
                for r in rows
            ]
        finally:
            conn.close()


def get_batch(batch_id: int) -> Optional[Dict[str, Any]]:
    """Return the stored payload + metadata for one batch, or None."""
    with _lock:
        conn = _conn()
        try:
            row = conn.execute("SELECT * FROM batches WHERE id = ?", (batch_id,)).fetchone()
            if row is None:
                return None
            payload = json.loads(row["payload"])
            payload["_meta"] = {
                "id": row["id"],
                "name": row["name"],
                "lang": row["lang"],
                "created_at": row["created_at"],
                "total_documents": row["total_documents"],
            }
            return payload
        finally:
            conn.close()


def delete_batch(batch_id: int) -> bool:
    """Delete a batch. Returns True if a row was removed."""
    with _lock:
        conn = _conn()
        try:
            cur = conn.execute("DELETE FROM batches WHERE id = ?", (batch_id,))
            conn.commit()
            return cur.rowcount > 0
        finally:
            conn.close()