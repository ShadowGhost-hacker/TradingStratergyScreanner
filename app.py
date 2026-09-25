"""
app.py - FastAPI Web Server

Serves the Trading Strategy Screener web application and provides
REST API endpoints for:
- Market scanning (multi-universe, multi-strategy)
- User Authentication (Registration, Email OTP Verification, Password Reset with OTP)
- Cloud Storage (Strategies, Chart Drawings, Backtests)
- Backtest Simulation Engine (Historical test with Equity Curve & KPIs)
- TradingView Chart Data & Signal Markers
- AI Strategy Generator (Gemini + Offline Parser)
- Settings & SMTP Configuration
"""

import os
import json
import asyncio
from pathlib import Path
from typing import Optional, List, Any
from concurrent.futures import ThreadPoolExecutor

from fastapi import FastAPI, Request, UploadFile, File, Form, Header
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse

import scanner_engine
import data_provider
import ai_generator
import db
import auth
import email_service
import backtest_engine

# ============================================================================
# App Configuration
# ============================================================================

app = FastAPI(title="Trading Strategy Screener & Backtester", version="2.0.0")

# Mount static files
STATIC_DIR = Path(__file__).parent / "static"
STATIC_DIR.mkdir(exist_ok=True)
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

# Thread pool for background tasks
_executor = ThreadPoolExecutor(max_workers=4)

# Settings storage
SETTINGS_FILE = Path(__file__).parent / ".settings.json"


def _load_settings() -> dict:
    """Load persisted settings."""
    if SETTINGS_FILE.exists():
        try:
            return json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {
        "gemini_api_key": "",
        "theme": "dark",
        "smtp_host": "",
        "smtp_port": 587,
        "smtp_user": "",
        "smtp_pass": "",
        "smtp_from": ""
    }


def _save_settings(settings: dict):
    """Persist settings to disk."""
    SETTINGS_FILE.write_text(json.dumps(settings, indent=2), encoding="utf-8")


def _get_auth_user(request: Request) -> Optional[dict]:
    """Helper to retrieve authenticated user from request Authorization header or token query."""
    auth_header = request.headers.get("Authorization", "")
    token = ""
    if auth_header.startswith("Bearer "):
        token = auth_header[7:].strip()
    elif "token" in request.query_params:
        token = request.query_params["token"].strip()
    
    return auth.get_current_user(token) if token else None


# ============================================================================
# Page Routes
# ============================================================================

@app.get("/", response_class=HTMLResponse)
async def serve_index():
    """Serve the main application page."""
    index_path = STATIC_DIR / "index.html"
    if index_path.exists():
        return HTMLResponse(content=index_path.read_text(encoding="utf-8"))
    return HTMLResponse(content="<h1>index.html not found. Please create static/index.html</h1>")


# ============================================================================
# User Authentication API (Registration, Email OTP, Login, Password Reset)
# ============================================================================

@app.post("/api/auth/register")
async def register(request: Request):
    """Register new user and dispatch email OTP."""
    data = await request.json()
    username = data.get("username", "")
    email = data.get("email", "")
    password = data.get("password", "")
    
    result = auth.register_user(username, email, password)
    if not result.get("success"):
        return JSONResponse(status_code=400, content=result)
    return result


@app.post("/api/auth/verify-otp")
async def verify_otp(request: Request):
    """Verify email verification OTP and activate user."""
    data = await request.json()
    email = data.get("email", "")
    otp = data.get("otp", "")
    
    result = auth.verify_email_otp(email, otp)
    if not result.get("success"):
        return JSONResponse(status_code=400, content=result)
    return result


@app.post("/api/auth/resend-otp")
async def resend_otp(request: Request):
    """Resend email verification OTP."""
    data = await request.json()
    email = data.get("email", "")
    
    result = auth.resend_verification_otp(email)
    if not result.get("success"):
        return JSONResponse(status_code=400, content=result)
    return result


@app.post("/api/auth/login")
async def login(request: Request):
    """Authenticate user with username or email."""
    data = await request.json()
    login_id = data.get("login_id", "")
    password = data.get("password", "")
    
    result = auth.login_user(login_id, password)
    if not result.get("success"):
        return JSONResponse(status_code=401, content=result)
    return result


@app.get("/api/auth/me")
async def get_me(request: Request):
    """Get active authenticated user profile."""
    user = _get_auth_user(request)
    if not user:
        return JSONResponse(status_code=401, content={"error": "Not authenticated"})
    return {"user": user}


@app.post("/api/auth/logout")
async def logout(request: Request):
    """Invalidate session token."""
    auth_header = request.headers.get("Authorization", "")
    token = auth_header[7:].strip() if auth_header.startswith("Bearer ") else ""
    if token:
        auth.logout_user(token)
    return {"success": True}


@app.post("/api/auth/forgot-password")
async def forgot_password(request: Request):
    """Request password reset OTP."""
    data = await request.json()
    email = data.get("email", "")
    return auth.request_password_reset(email)


@app.post("/api/auth/reset-password")
async def reset_password(request: Request):
    """Reset password using OTP."""
    data = await request.json()
    email = data.get("email", "")
    otp = data.get("otp", "")
    new_password = data.get("new_password", "")
    
    result = auth.reset_password_with_otp(email, otp, new_password)
    if not result.get("success"):
        return JSONResponse(status_code=400, content=result)
    return result


# ============================================================================
# Cloud Storage API (Drawings, User Strategies, Cloud Sync)
# ============================================================================

@app.post("/api/cloud/drawings/save")
async def save_chart_drawing(request: Request):
    """Save chart drawings, lines, and indicators for a stock."""
    user = _get_auth_user(request)
    user_id = user["id"] if user else 1  # Default to guest user 1 if not logged in
    
    data = await request.json()
    symbol = data.get("symbol", "").strip()
    drawing_data = data.get("drawing_data", {})
    notes = data.get("notes", "")
    
    if not symbol:
        return JSONResponse(status_code=400, content={"error": "Symbol is required"})
    
    success = db.save_chart_drawings(user_id, symbol, drawing_data, notes)
    return {"success": success, "symbol": symbol}


@app.get("/api/cloud/drawings/{symbol}")
async def get_chart_drawing(symbol: str, request: Request):
    """Get saved chart drawings and annotations for a stock."""
    user = _get_auth_user(request)
    user_id = user["id"] if user else 1
    
    drawings = db.get_chart_drawings(user_id, symbol)
    return {"drawings": drawings}


@app.get("/api/cloud/drawings")
async def list_chart_drawings(request: Request):
    """List all stock symbols with saved chart drawings."""
    user = _get_auth_user(request)
    user_id = user["id"] if user else 1
    
    items = db.list_user_drawings(user_id)
    return {"drawings": items}


@app.get("/api/cloud/export")
async def export_cloud_data(request: Request):
    """Export all user data as a portable JSON cloud package."""
    user = _get_auth_user(request)
    user_id = user["id"] if user else 1
    
    data = db.export_user_cloud_data(user_id)
    return data


@app.post("/api/cloud/import")
async def import_cloud_data(request: Request):
    """Import strategies and drawings from a cloud package."""
    user = _get_auth_user(request)
    user_id = user["id"] if user else 1
    
    package = await request.json()
    result = db.import_user_cloud_data(user_id, package)
    return result


@app.get("/api/cloud/status")
async def cloud_status(request: Request):
    """Get summary of cloud synced items."""
    user = _get_auth_user(request)
    user_id = user["id"] if user else 1
    
    strats = db.get_user_strategies(user_id)
    drawings = db.list_user_drawings(user_id)
    backtests = db.get_user_backtests(user_id)
    
    return {
        "logged_in": bool(user),
        "username": user["username"] if user else "Guest",
        "strategies_count": len(strats),
        "drawings_count": len(drawings),
        "backtests_count": len(backtests)
    }


# ============================================================================
# Backtest Simulator API
# ============================================================================

@app.post("/api/backtest/run")
async def start_backtest(request: Request):
    """Run a historical backtest simulation across selected universe and strategies."""
    data = await request.json()
    strategy_ids = data.get("strategies", [])
    universe = data.get("universe", "nifty50")
    interval = data.get("interval", "1d")
    initial_capital = float(data.get("initial_capital", 100000.0))
    position_size_pct = float(data.get("position_size_pct", 10.0))
    stop_loss_pct = float(data.get("stop_loss_pct", 2.5))
    take_profit_pct = float(data.get("take_profit_pct", 5.0))
    exit_on_opposite = bool(data.get("exit_on_opposite", True))
    max_holding_bars = int(data.get("max_holding_bars", 20))
    custom_tickers = data.get("custom_tickers", "")
    
    if not strategy_ids:
        return JSONResponse(status_code=400, content={"error": "Select at least one strategy for backtest"})
    
    loop = asyncio.get_event_loop()
    loop.run_in_executor(
        _executor,
        backtest_engine.run_backtest_simulation,
        strategy_ids, universe, interval, initial_capital, position_size_pct,
        stop_loss_pct, take_profit_pct, exit_on_opposite, max_holding_bars, custom_tickers
    )
    
    return {"status": "started", "message": "Backtest simulation running in background"}


@app.get("/api/backtest/progress")
async def backtest_progress():
    """Get active backtest progress."""
    return backtest_engine.get_backtest_progress()


@app.get("/api/backtest/results")
async def backtest_results():
    """Get latest completed backtest results."""
    result = backtest_engine.get_last_backtest_result()
    if not result:
        return {"status": "none", "metrics": None, "trades": []}
    return result


@app.post("/api/backtest/cancel")
async def cancel_backtest():
    """Cancel active backtest."""
    backtest_engine.cancel_backtest()
    return {"status": "cancelled"}


@app.post("/api/backtest/save")
async def save_backtest(request: Request):
    """Save backtest result to user cloud account."""
    user = _get_auth_user(request)
    user_id = user["id"] if user else 1
    
    data = await request.json()
    title = data.get("title", f"Backtest {time.strftime('%Y-%m-%d %H:%M')}")
    strategy_ids = data.get("strategy_ids", [])
    universe = str(data.get("universe", "nifty50"))
    timeframe = data.get("timeframe", "1d")
    metrics = data.get("metrics", {})
    trades = data.get("trades", [])
    
    record_id = db.save_backtest_record(user_id, title, strategy_ids, universe, timeframe, metrics, trades)
    return {"success": True, "record_id": record_id}


@app.get("/api/backtest/saved")
async def list_saved_backtests(request: Request):
    """List saved backtest simulations."""
    user = _get_auth_user(request)
    user_id = user["id"] if user else 1
    
    records = db.get_user_backtests(user_id)
    return {"backtests": records}


@app.get("/api/backtest/saved/{record_id}")
async def get_saved_backtest(record_id: int, request: Request):
    """Get full details of a saved backtest."""
    user = _get_auth_user(request)
    user_id = user["id"] if user else 1
    
    detail = db.get_backtest_detail(user_id, record_id)
    if not detail:
        return JSONResponse(status_code=404, content={"error": "Backtest record not found"})
    return detail


@app.delete("/api/backtest/saved/{record_id}")
async def delete_saved_backtest(record_id: int, request: Request):
    """Delete a saved backtest."""
    user = _get_auth_user(request)
    user_id = user["id"] if user else 1
    
    success = db.delete_backtest_record(user_id, record_id)
    return {"success": success}


# ============================================================================
# Strategy API
# ============================================================================

@app.get("/api/strategies")
async def list_strategies():
    """List all available strategies."""
    strategies = scanner_engine.load_all_strategies()
    result = []
    for s in strategies:
        result.append({
            "id": s["id"],
            "name": s["name"],
            "description": s["description"],
            "error": s["error"],
            "has_module": s["module"] is not None
        })
    return {"strategies": result}


@app.get("/api/strategy/{strategy_id}/code")
async def get_strategy_code(strategy_id: str):
    """Get the source code of a strategy."""
    code = scanner_engine.get_strategy_code(strategy_id)
    if not code:
        return JSONResponse(status_code=404, content={"error": "Strategy not found"})
    return {"id": strategy_id, "code": code}


@app.post("/api/strategy/save")
async def save_strategy(request: Request):
    """Save or update a strategy."""
    data = await request.json()
    strategy_id = data.get("id", "").strip()
    code = data.get("code", "")
    
    if not strategy_id:
        return JSONResponse(status_code=400, content={"error": "Strategy ID is required"})
    
    # Sanitize ID
    strategy_id = strategy_id.replace(" ", "_").lower()
    strategy_id = "".join(c for c in strategy_id if c.isalnum() or c == "_")
    
    result = scanner_engine.save_strategy_code(strategy_id, code)
    
    # Also save to user DB if authenticated
    user = _get_auth_user(request)
    if user:
        name = strategy_id.replace("_", " ").title()
        db.save_user_strategy(user["id"], strategy_id, name, code, "")
        
    return result


@app.delete("/api/strategy/{strategy_id}")
async def delete_strategy(strategy_id: str, request: Request):
    """Delete a strategy."""
    success = scanner_engine.delete_strategy(strategy_id)
    user = _get_auth_user(request)
    if user:
        db.delete_user_strategy(user["id"], strategy_id)
    return {"success": success}


@app.post("/api/strategy/upload")
async def upload_strategy(file: UploadFile = File(...)):
    """Upload a strategy .py file."""
    if not file.filename.endswith(".py"):
        return JSONResponse(status_code=400, content={"error": "Only .py files are accepted"})
    
    content = await file.read()
    strategy_id = file.filename.replace(".py", "").replace(" ", "_").lower()
    
    result = scanner_engine.save_strategy_code(strategy_id, content.decode("utf-8"))
    return result


# ============================================================================
# Scanner API (Multi-Universe Supported)
# ============================================================================

@app.post("/api/scan/start")
async def start_scan(request: Request):
    """Start a market scan across single or multiple stock universes."""
    data = await request.json()
    
    strategy_ids = data.get("strategies", [])
    universe = data.get("universe", "nifty50")
    interval = data.get("interval", "1d")
    tolerance = min(max(int(data.get("tolerance", 0)), 0), 10)
    custom_tickers = data.get("custom_tickers", "")
    
    if not strategy_ids:
        return JSONResponse(status_code=400, content={"error": "Select at least one strategy"})
    
    # Run scan in background thread
    loop = asyncio.get_event_loop()
    loop.run_in_executor(
        _executor,
        scanner_engine.run_scan,
        strategy_ids, universe, interval, tolerance, custom_tickers
    )
    
    return {"status": "started", "message": "Scan started in background"}


@app.get("/api/scan/progress")
async def scan_progress():
    """Get current scan progress."""
    return scanner_engine.get_scan_progress()


@app.get("/api/scan/results")
async def scan_results():
    """Get scan results."""
    return {"results": scanner_engine.get_scan_results()}


@app.post("/api/scan/cancel")
async def cancel_scan():
    """Cancel active scan."""
    scanner_engine.cancel_scan()
    return {"status": "cancelled"}


# ============================================================================
# Chart Data API
# ============================================================================

@app.get("/api/chart/{symbol}")
async def get_chart_data(symbol: str, interval: str = "1d", exchange: str = "NSE"):
    """Get OHLCV data for TradingView Lightweight charts."""
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        _executor,
        data_provider.fetch_ohlcv_for_chart,
        symbol, interval, exchange
    )
    return result


@app.get("/api/chart/{symbol}/signals")
async def get_chart_signals(symbol: str, strategy_ids: str = "", interval: str = "1d", exchange: str = "NSE"):
    """Get signal markers for a chart."""
    if not strategy_ids:
        return {"markers": []}
    
    ids = [s.strip() for s in strategy_ids.split(",")]
    strategies = scanner_engine.load_all_strategies()
    selected = [s for s in strategies if s["id"] in ids and s["module"]]
    
    if not selected:
        return {"markers": []}
    
    import pandas as pd
    
    loop = asyncio.get_event_loop()
    df = await loop.run_in_executor(
        _executor,
        data_provider.fetch_ohlcv,
        symbol, interval, exchange, True
    )
    
    if df.empty:
        return {"markers": []}
    
    markers = []
    for strat in selected:
        signals = scanner_engine.run_strategy_on_stock(strat, df)
        
        for idx, val in signals.items():
            if val in ("BUY", "SELL"):
                ts = idx
                if hasattr(ts, 'timestamp'):
                    time_val = int(ts.timestamp())
                else:
                    time_val = int(pd.Timestamp(ts).timestamp())
                
                markers.append({
                    "time": time_val,
                    "position": "belowBar" if val == "BUY" else "aboveBar",
                    "color": "#00f59b" if val == "BUY" else "#ff3b57",
                    "shape": "arrowUp" if val == "BUY" else "arrowDown",
                    "text": f"{val} ({strat['name']})"
                })
    
    # Sort by time
    markers.sort(key=lambda m: m["time"])
    
    return {"markers": markers}


# ============================================================================
# Universe & Config API
# ============================================================================

@app.get("/api/universes")
async def get_universes():
    """Get available stock universes."""
    return {"universes": data_provider.get_available_universes()}


@app.get("/api/timeframes")
async def get_timeframes():
    """Get available timeframes."""
    return {"timeframes": data_provider.get_available_timeframes()}


# ============================================================================
# AI Generator API
# ============================================================================

@app.post("/api/ai/generate")
async def generate_ai_strategy(request: Request):
    """Generate a strategy from natural language using AI."""
    data = await request.json()
    description = data.get("description", "")
    
    if not description.strip():
        return JSONResponse(status_code=400, content={"error": "Strategy description is required"})
    
    settings = _load_settings()
    api_key = data.get("api_key", settings.get("gemini_api_key", ""))
    
    result = ai_generator.generate_strategy(description, api_key)
    return result


@app.get("/api/ai/template")
async def get_blank_template():
    """Get a blank strategy template."""
    return {"code": ai_generator.get_blank_template()}


# ============================================================================
# Settings & SMTP Configuration API
# ============================================================================

@app.get("/api/settings")
async def get_settings():
    """Get application settings."""
    settings = _load_settings()
    masked_key = ""
    if settings.get("gemini_api_key"):
        key = settings["gemini_api_key"]
        masked_key = key[:4] + "..." + key[-4:] if len(key) > 8 else "****"
    
    masked_smtp_pass = "****" if settings.get("smtp_pass") else ""
    
    return {
        "gemini_api_key_set": bool(settings.get("gemini_api_key")),
        "gemini_api_key_masked": masked_key,
        "theme": settings.get("theme", "dark"),
        "smtp_host": settings.get("smtp_host", ""),
        "smtp_port": settings.get("smtp_port", 587),
        "smtp_user": settings.get("smtp_user", ""),
        "smtp_pass_set": bool(settings.get("smtp_pass")),
        "smtp_from": settings.get("smtp_from", "")
    }


@app.post("/api/settings")
async def update_settings(request: Request):
    """Update application settings."""
    data = await request.json()
    settings = _load_settings()
    
    for field in ["gemini_api_key", "theme", "smtp_host", "smtp_port", "smtp_user", "smtp_from"]:
        if field in data:
            settings[field] = data[field]
    
    if "smtp_pass" in data and data["smtp_pass"]:
        settings["smtp_pass"] = data["smtp_pass"]
    
    _save_settings(settings)
    return {"success": True, "message": "Settings saved successfully"}


@app.post("/api/settings/test-smtp")
async def test_smtp(request: Request):
    """Test SMTP connection credentials."""
    data = await request.json()
    host = data.get("smtp_host", "")
    port = int(data.get("smtp_port", 587))
    user = data.get("smtp_user", "")
    password = data.get("smtp_pass", "")
    
    if not password:
        settings = _load_settings()
        password = settings.get("smtp_pass", "")
    
    ok, msg = email_service.test_smtp_connection(host, port, user, password)
    return {"success": ok, "message": msg}


# ============================================================================
# Cache Management
# ============================================================================

@app.post("/api/cache/clear")
async def clear_cache():
    """Clear all cached market data."""
    data_provider.clear_cache()
    return {"success": True, "message": "Cache cleared"}


# ============================================================================
# Main Entry Point
# ============================================================================

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    print("\n" + "="*60)
    print("  Trading Strategy Screener & Backtester")
    print(f"  Open: http://localhost:{port}")
    print("="*60 + "\n")
    uvicorn.run(app, host="0.0.0.0", port=port, reload=False)
