"""
db.py - SQLite & Cloud Storage Manager

Handles persistent storage for:
- User accounts (credentials, email verification OTP, password reset OTP)
- User sessions (auth tokens)
- User-saved strategies
- Chart drawings & annotations
- Backtest history & logs
- Cloud sync configurations (Supabase / REST / Local backup)
"""

import sqlite3
import json
import time
from pathlib import Path
from typing import Optional, Dict, Any, List

DB_PATH = Path(__file__).parent / "screener.db"


def get_db_connection() -> sqlite3.Connection:
    """Get a connection to the SQLite database with row factory enabled."""
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL;")
    return conn


def init_db():
    """Initialize all database tables if they do not exist."""
    conn = get_db_connection()
    cursor = conn.cursor()

    # Users table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        is_verified INTEGER DEFAULT 0,
        verification_otp TEXT,
        otp_expiry REAL,
        reset_otp TEXT,
        reset_otp_expiry REAL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # Auth sessions table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        created_at REAL,
        expires_at REAL,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    )
    """)

    # User custom strategies table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS user_strategies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        strategy_id TEXT NOT NULL,
        name TEXT NOT NULL,
        code TEXT NOT NULL,
        description TEXT,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, strategy_id)
    )
    """)

    # Chart drawings & annotations table (persists drawings on the web)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS chart_drawings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        symbol TEXT NOT NULL,
        drawing_data TEXT NOT NULL,
        notes TEXT DEFAULT '',
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, symbol),
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    )
    """)

    # Backtest simulation records table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS backtest_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        strategy_ids TEXT NOT NULL,
        universe TEXT NOT NULL,
        timeframe TEXT NOT NULL,
        metrics TEXT NOT NULL,
        trades TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    )
    """)

    # Cloud sync settings
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS cloud_sync (
        user_id INTEGER PRIMARY KEY,
        provider TEXT DEFAULT 'local',
        cloud_url TEXT DEFAULT '',
        cloud_key TEXT DEFAULT '',
        last_synced_at TEXT DEFAULT '',
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    )
    """)

    conn.commit()
    conn.close()


# Auto-initialize on import
init_db()


# ============================================================================
# User Account Operations
# ============================================================================

def create_user(username: str, email: str, password_hash: str, salt: str, otp: str, otp_expiry: float) -> Optional[int]:
    """Create a new unverified user."""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO users (username, email, password_hash, salt, is_verified, verification_otp, otp_expiry)
            VALUES (?, ?, ?, ?, 0, ?, ?)
            """,
            (username, email.strip().lower(), password_hash, salt, otp, otp_expiry)
        )
        conn.commit()
        return cursor.lastrowid
    except sqlite3.IntegrityError:
        return None
    finally:
        conn.close()


def get_user_by_email(email: str) -> Optional[dict]:
    """Fetch user record by email."""
    conn = get_db_connection()
    try:
        row = conn.execute("SELECT * FROM users WHERE email = ? COLLATE NOCASE", (email.strip().lower(),)).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def get_user_by_username(username: str) -> Optional[dict]:
    """Fetch user record by username."""
    conn = get_db_connection()
    try:
        row = conn.execute("SELECT * FROM users WHERE username = ?", (username.strip(),)).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def get_user_by_id(user_id: int) -> Optional[dict]:
    """Fetch user record by ID."""
    conn = get_db_connection()
    try:
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def set_verification_otp(user_id: int, otp: str, expiry: float):
    """Update user's verification OTP and expiry timestamp."""
    conn = get_db_connection()
    try:
        conn.execute(
            "UPDATE users SET verification_otp = ?, otp_expiry = ? WHERE id = ?",
            (otp, expiry, user_id)
        )
        conn.commit()
    finally:
        conn.close()


def verify_user_email(user_id: int):
    """Mark user as email verified."""
    conn = get_db_connection()
    try:
        conn.execute(
            "UPDATE users SET is_verified = 1, verification_otp = NULL, otp_expiry = NULL WHERE id = ?",
            (user_id,)
        )
        conn.commit()
    finally:
        conn.close()


def set_reset_otp(user_id: int, otp: str, expiry: float):
    """Set password reset OTP and expiry."""
    conn = get_db_connection()
    try:
        conn.execute(
            "UPDATE users SET reset_otp = ?, reset_otp_expiry = ? WHERE id = ?",
            (otp, expiry, user_id)
        )
        conn.commit()
    finally:
        conn.close()


def update_password(user_id: int, password_hash: str, salt: str):
    """Update user password and clear reset OTP."""
    conn = get_db_connection()
    try:
        conn.execute(
            """
            UPDATE users 
            SET password_hash = ?, salt = ?, reset_otp = NULL, reset_otp_expiry = NULL 
            WHERE id = ?
            """,
            (password_hash, salt, user_id)
        )
        conn.commit()
    finally:
        conn.close()


# ============================================================================
# Session Operations
# ============================================================================

def create_session(token: str, user_id: int, duration_seconds: int = 86400 * 30):
    """Store active user session token."""
    now = time.time()
    expires_at = now + duration_seconds
    conn = get_db_connection()
    try:
        conn.execute(
            "INSERT OR REPLACE INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
            (token, user_id, now, expires_at)
        )
        conn.commit()
    finally:
        conn.close()


def get_session_user(token: str) -> Optional[dict]:
    """Retrieve user dictionary associated with an active non-expired session token."""
    if not token:
        return None
    now = time.time()
    conn = get_db_connection()
    try:
        row = conn.execute(
            """
            SELECT u.id, u.username, u.email, u.is_verified, u.created_at
            FROM sessions s
            JOIN users u ON s.user_id = u.id
            WHERE s.token = ? AND s.expires_at > ?
            """,
            (token, now)
        ).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def delete_session(token: str):
    """Invalidate a session token on logout."""
    conn = get_db_connection()
    try:
        conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
        conn.commit()
    finally:
        conn.close()


# ============================================================================
# User Strategies Persistence (Cloud Storage for Strategies)
# ============================================================================

def save_user_strategy(user_id: int, strategy_id: str, name: str, code: str, description: str = "") -> dict:
    """Save or update a user's strategy."""
    conn = get_db_connection()
    try:
        conn.execute(
            """
            INSERT INTO user_strategies (user_id, strategy_id, name, code, description, updated_at)
            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(user_id, strategy_id) DO UPDATE SET
                name = excluded.name,
                code = excluded.code,
                description = excluded.description,
                updated_at = CURRENT_TIMESTAMP
            """,
            (user_id, strategy_id, name, code, description)
        )
        conn.commit()
        return {"success": True, "id": strategy_id, "name": name}
    finally:
        conn.close()


def get_user_strategies(user_id: int) -> List[dict]:
    """Get all saved strategies for a user."""
    conn = get_db_connection()
    try:
        rows = conn.execute(
            "SELECT strategy_id as id, name, code, description, updated_at FROM user_strategies WHERE user_id = ? ORDER BY updated_at DESC",
            (user_id,)
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def delete_user_strategy(user_id: int, strategy_id: str) -> bool:
    """Delete a user strategy."""
    conn = get_db_connection()
    try:
        cur = conn.execute("DELETE FROM user_strategies WHERE user_id = ? AND strategy_id = ?", (user_id, strategy_id))
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


# ============================================================================
# Shared Strategy Pool (user_id=0, available to all — used on cloud/Render)
# ============================================================================

SHARED_USER_ID = 0  # Sentinel user ID for globally shared strategies


def save_shared_strategy(strategy_id: str, name: str, code: str, description: str = "") -> dict:
    """Save a strategy to the shared pool (accessible without login)."""
    return save_user_strategy(SHARED_USER_ID, strategy_id, name, code, description)


def get_shared_strategies() -> List[dict]:
    """Get all strategies from the shared pool."""
    return get_user_strategies(SHARED_USER_ID)


def get_shared_strategy_code(strategy_id: str) -> str:
    """Get code for a specific shared strategy."""
    conn = get_db_connection()
    try:
        row = conn.execute(
            "SELECT code FROM user_strategies WHERE user_id = ? AND strategy_id = ?",
            (SHARED_USER_ID, strategy_id)
        ).fetchone()
        return row["code"] if row else ""
    finally:
        conn.close()


def delete_shared_strategy(strategy_id: str) -> bool:
    """Delete a strategy from the shared pool."""
    return delete_user_strategy(SHARED_USER_ID, strategy_id)


# ============================================================================
# Chart Drawings & Annotations Persistence (Cloud Storage for Drawings)
# ============================================================================

def save_chart_drawings(user_id: int, symbol: str, drawing_data: Any, notes: str = "") -> bool:
    """Save or update user's drawings and annotations for a specific ticker."""
    data_str = json.dumps(drawing_data) if not isinstance(drawing_data, str) else drawing_data
    conn = get_db_connection()
    try:
        conn.execute(
            """
            INSERT INTO chart_drawings (user_id, symbol, drawing_data, notes, updated_at)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(user_id, symbol) DO UPDATE SET
                drawing_data = excluded.drawing_data,
                notes = excluded.notes,
                updated_at = CURRENT_TIMESTAMP
            """,
            (user_id, symbol.upper(), data_str, notes)
        )
        conn.commit()
        return True
    finally:
        conn.close()


def get_chart_drawings(user_id: int, symbol: str) -> Optional[dict]:
    """Retrieve saved drawings and annotations for a ticker."""
    conn = get_db_connection()
    try:
        row = conn.execute(
            "SELECT symbol, drawing_data, notes, updated_at FROM chart_drawings WHERE user_id = ? AND symbol = ?",
            (user_id, symbol.upper())
        ).fetchone()
        if row:
            res = dict(row)
            try:
                res["drawing_data"] = json.loads(res["drawing_data"])
            except Exception:
                pass
            return res
        return None
    finally:
        conn.close()


def list_user_drawings(user_id: int) -> List[dict]:
    """List all symbols that have saved chart drawings."""
    conn = get_db_connection()
    try:
        rows = conn.execute(
            "SELECT symbol, notes, updated_at FROM chart_drawings WHERE user_id = ? ORDER BY updated_at DESC",
            (user_id,)
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


# ============================================================================
# Backtest Simulator Records Persistence
# ============================================================================

def save_backtest_record(user_id: int, title: str, strategy_ids: List[str], universe: str, timeframe: str, metrics: dict, trades: list) -> int:
    """Save completed backtest simulation results."""
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO backtest_records (user_id, title, strategy_ids, universe, timeframe, metrics, trades)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                user_id,
                title,
                json.dumps(strategy_ids),
                universe,
                timeframe,
                json.dumps(metrics),
                json.dumps(trades)
            )
        )
        conn.commit()
        return cur.lastrowid
    finally:
        conn.close()


def get_user_backtests(user_id: int) -> List[dict]:
    """Get summarized backtest history for user."""
    conn = get_db_connection()
    try:
        rows = conn.execute(
            "SELECT id, title, strategy_ids, universe, timeframe, metrics, created_at FROM backtest_records WHERE user_id = ? ORDER BY id DESC LIMIT 50",
            (user_id,)
        ).fetchall()
        result = []
        for r in rows:
            d = dict(r)
            try:
                d["metrics"] = json.loads(d["metrics"])
                d["strategy_ids"] = json.loads(d["strategy_ids"])
            except Exception:
                pass
            result.append(d)
        return result
    finally:
        conn.close()


def get_backtest_detail(user_id: int, record_id: int) -> Optional[dict]:
    """Get full details of a saved backtest including all trades."""
    conn = get_db_connection()
    try:
        row = conn.execute(
            "SELECT * FROM backtest_records WHERE id = ? AND user_id = ?",
            (record_id, user_id)
        ).fetchone()
        if row:
            d = dict(row)
            d["metrics"] = json.loads(d["metrics"])
            d["trades"] = json.loads(d["trades"])
            d["strategy_ids"] = json.loads(d["strategy_ids"])
            return d
        return None
    finally:
        conn.close()


def delete_backtest_record(user_id: int, record_id: int) -> bool:
    """Delete a saved backtest record."""
    conn = get_db_connection()
    try:
        cur = conn.execute("DELETE FROM backtest_records WHERE id = ? AND user_id = ?", (record_id, user_id))
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


# ============================================================================
# Cloud Backup, Export & Cloud Sync Operations
# ============================================================================

def export_user_cloud_data(user_id: int) -> dict:
    """
    Export all user strategies, drawings, and backtests as a portable cloud package.
    Can be downloaded or synced to any free cloud service (Supabase, Firebase, GitHub Gist, Webhook).
    """
    user = get_user_by_id(user_id)
    if not user:
        return {}

    strategies = get_user_strategies(user_id)
    drawings = []
    conn = get_db_connection()
    try:
        rows = conn.execute("SELECT symbol, drawing_data, notes, updated_at FROM chart_drawings WHERE user_id = ?", (user_id,)).fetchall()
        for r in rows:
            d = dict(r)
            try:
                d["drawing_data"] = json.loads(d["drawing_data"])
            except Exception:
                pass
            drawings.append(d)
    finally:
        conn.close()

    backtests = get_user_backtests(user_id)

    return {
        "version": "1.0",
        "exported_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "user": {
            "username": user["username"],
            "email": user["email"]
        },
        "strategies": strategies,
        "drawings": drawings,
        "backtests": backtests
    }


def import_user_cloud_data(user_id: int, package: dict) -> dict:
    """
    Restore or merge user strategies and drawings from an exported cloud package.
    """
    imported_strats = 0
    imported_drawings = 0

    # Import strategies
    for s in package.get("strategies", []):
        sid = s.get("id") or s.get("strategy_id")
        if sid and s.get("code"):
            save_user_strategy(user_id, sid, s.get("name", sid), s.get("code"), s.get("description", ""))
            imported_strats += 1

    # Import drawings
    for d in package.get("drawings", []):
        sym = d.get("symbol")
        if sym and "drawing_data" in d:
            save_chart_drawings(user_id, sym, d.get("drawing_data"), d.get("notes", ""))
            imported_drawings += 1

    return {
        "success": True,
        "imported_strategies": imported_strats,
        "imported_drawings": imported_drawings
    }
