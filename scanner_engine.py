"""
scanner_engine.py - Multi-Strategy Stock Scanner Engine

Scans stock universes against selected strategies with configurable
candle tolerance (0-10 bars) and multi-threading for performance.
"""

import importlib.util
import importlib
import types
import pandas as pd
import numpy as np
import traceback
import os
import time
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from data_provider import fetch_ohlcv
import db as _db

# ============================================================================
# Strategy Loader
# ============================================================================

STRATEGIES_DIR = Path(__file__).parent / "strategies"
STRATEGIES_DIR.mkdir(exist_ok=True)


def load_strategy(filepath: str) -> dict:
    """
    Load a single strategy Python file and return its metadata.
    
    The strategy file must contain an `evaluate(df)` function that takes
    a DataFrame with OHLCV columns and returns a pd.Series of signals
    ('BUY', 'SELL', or None/NaN).
    
    Returns:
        dict with keys: id, name, description, filepath, module, error
    """
    path = Path(filepath)
    strategy_id = path.stem
    
    result = {
        "id": strategy_id,
        "name": strategy_id.replace("_", " ").title(),
        "description": "",
        "filepath": str(path),
        "module": None,
        "error": None
    }
    
    try:
        spec = importlib.util.spec_from_file_location(strategy_id, str(path))
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        
        if not hasattr(module, "evaluate"):
            result["error"] = "Strategy file must contain an 'evaluate(df)' function."
            return result
        
        result["module"] = module
        
        # Extract metadata from module docstring or attributes
        if hasattr(module, "STRATEGY_NAME"):
            result["name"] = module.STRATEGY_NAME
        if hasattr(module, "STRATEGY_DESCRIPTION"):
            result["description"] = module.STRATEGY_DESCRIPTION
        elif module.__doc__:
            result["description"] = module.__doc__.strip().split("\n")[0]
        
    except Exception as e:
        result["error"] = f"Failed to load: {str(e)}"
    
    return result


def load_strategy_from_code(strategy_id: str, code: str) -> dict:
    """
    Load a strategy from a code string (used when running on cloud with read-only filesystem).
    Compiles and executes the Python code into a dynamic module.

    Returns:
        dict with keys: id, name, description, filepath, module, error
    """
    result = {
        "id": strategy_id,
        "name": strategy_id.replace("_", " ").title(),
        "description": "",
        "filepath": f"<db:{strategy_id}>",
        "module": None,
        "error": None
    }

    try:
        # Create a blank module and exec the code into it
        module = types.ModuleType(strategy_id)
        exec(compile(code, f"<db:{strategy_id}>", "exec"), module.__dict__)

        if not hasattr(module, "evaluate"):
            result["error"] = "Strategy file must contain an 'evaluate(df)' function."
            return result

        result["module"] = module

        if hasattr(module, "STRATEGY_NAME"):
            result["name"] = module.STRATEGY_NAME
        if hasattr(module, "STRATEGY_DESCRIPTION"):
            result["description"] = module.STRATEGY_DESCRIPTION
        elif module.__doc__:
            result["description"] = module.__doc__.strip().split("\n")[0]

    except Exception as e:
        result["error"] = f"Failed to load from DB: {str(e)}"

    return result


def load_all_strategies() -> list:
    """
    Load all strategies from:
      1. The strategies/ directory (file-based, local)
      2. The shared DB pool (cloud-saved, works on Render)
    File-based strategies take priority if the same ID exists in both.

    Returns:
        List of strategy metadata dicts
    """
    strategies = {}

    # --- Load from DB shared pool first (lower priority) ---
    try:
        for s in _db.get_shared_strategies():
            sid = s["id"]
            loaded = load_strategy_from_code(sid, s["code"])
            strategies[sid] = loaded
    except Exception:
        pass

    # --- Load from files (higher priority, overrides DB) ---
    if STRATEGIES_DIR.exists():
        for py_file in sorted(STRATEGIES_DIR.glob("*.py")):
            if py_file.name.startswith("_"):
                continue
            strategy = load_strategy(str(py_file))
            strategies[strategy["id"]] = strategy  # overrides DB version if same ID

    return list(strategies.values())


def get_strategy_code(strategy_id: str) -> str:
    """Read the source code of a strategy — checks file first, then DB."""
    filepath = STRATEGIES_DIR / f"{strategy_id}.py"
    if filepath.exists():
        return filepath.read_text(encoding="utf-8")
    # Fall back to DB shared pool
    try:
        return _db.get_shared_strategy_code(strategy_id)
    except Exception:
        return ""


def save_strategy_code(strategy_id: str, code: str) -> dict:
    """
    Save strategy code.
    - Tries to write a .py file first (works locally).
    - If that fails (read-only filesystem on Render/cloud), falls back to DB shared pool.
    - Always validates the code by compiling it into a temporary module.

    Returns:
        dict with keys: success, error, strategy
    """
    # Always validate code first (before touching disk or DB)
    validation = load_strategy_from_code(strategy_id, code)
    if validation["error"]:
        return {"success": False, "error": validation["error"], "strategy": validation}

    # Try file-based save
    filepath = STRATEGIES_DIR / f"{strategy_id}.py"
    try:
        filepath.write_text(code, encoding="utf-8")
        # Reload from file to confirm
        strategy = load_strategy(str(filepath))
        if strategy["error"]:
            return {"success": False, "error": strategy["error"], "strategy": strategy}
        # Also sync to DB shared pool so cloud has it too
        try:
            _db.save_shared_strategy(strategy_id, strategy["name"], code, strategy["description"])
        except Exception:
            pass
        return {"success": True, "error": None, "strategy": strategy}
    except (OSError, PermissionError):
        # File system is read-only (e.g., Render cloud) — save to DB only
        pass
    except Exception as e:
        return {"success": False, "error": str(e), "strategy": None}

    # Fallback: DB-only save
    try:
        _db.save_shared_strategy(strategy_id, validation["name"], code, validation["description"])
        return {"success": True, "error": None, "strategy": validation}
    except Exception as e:
        return {"success": False, "error": f"Could not save to file or database: {str(e)}", "strategy": None}


def delete_strategy(strategy_id: str) -> bool:
    """Delete a strategy from file and DB shared pool."""
    deleted = False
    filepath = STRATEGIES_DIR / f"{strategy_id}.py"
    if filepath.exists():
        try:
            filepath.unlink()
            deleted = True
        except Exception:
            pass
    # Also remove from DB shared pool
    try:
        if _db.delete_shared_strategy(strategy_id):
            deleted = True
    except Exception:
        pass
    return deleted


# ============================================================================
# Signal Evaluation
# ============================================================================

def run_strategy_on_stock(strategy: dict, df: pd.DataFrame) -> pd.Series:
    """
    Run a single strategy's evaluate() function on OHLCV data.
    
    Returns:
        pd.Series of signals ('BUY', 'SELL', or None)
    """
    if strategy["module"] is None or strategy["error"]:
        return pd.Series(index=df.index, dtype=object)
    
    try:
        signals = strategy["module"].evaluate(df.copy())
        
        if not isinstance(signals, pd.Series):
            signals = pd.Series(signals, index=df.index)
        
        return signals
    except Exception as e:
        print(f"Error running strategy '{strategy['id']}': {e}")
        traceback.print_exc()
        return pd.Series(index=df.index, dtype=object)


def find_aligned_signals(
    strategies: list,
    df: pd.DataFrame,
    tolerance: int = 0
) -> dict:
    """
    Find signals where ALL selected strategies agree (same direction)
    within a candle tolerance window.
    
    Parameters:
        strategies: List of loaded strategy dicts (with 'module' key)
        df: OHLCV DataFrame
        tolerance: Number of candles to look back (0 = exact current bar only)
    
    Returns:
        dict with keys:
            signal: 'BUY', 'SELL', or None
            details: list of {strategy_id, signal, bars_ago} for each strategy
            trigger_bar: index of the trigger bar
    """
    if not strategies or df.empty:
        return {"signal": None, "details": [], "trigger_bar": None}
    
    # Run all strategies
    all_signals = {}
    for strat in strategies:
        signals = run_strategy_on_stock(strat, df)
        all_signals[strat["id"]] = signals
    
    # Look at the last `tolerance + 1` bars
    lookback = min(tolerance + 1, len(df))
    recent_indices = df.index[-lookback:]
    
    # For each strategy, find the most recent signal within the lookback window
    strategy_recent_signals = {}
    for strat_id, signals in all_signals.items():
        recent = signals.loc[recent_indices]
        
        # Find the last valid signal (BUY or SELL) in the window
        for i in range(len(recent) - 1, -1, -1):
            val = recent.iloc[i]
            if val in ("BUY", "SELL"):
                bars_ago = len(recent) - 1 - i
                strategy_recent_signals[strat_id] = {
                    "signal": val,
                    "bars_ago": bars_ago,
                    "bar_index": recent.index[i]
                }
                break
    
    # Check if ALL strategies produced a signal
    if len(strategy_recent_signals) != len(strategies):
        return {"signal": None, "details": [], "trigger_bar": None}
    
    # Check if ALL signals are the same direction
    signal_directions = set(v["signal"] for v in strategy_recent_signals.values())
    if len(signal_directions) != 1:
        return {"signal": None, "details": [], "trigger_bar": None}
    
    aligned_signal = signal_directions.pop()
    
    details = []
    for strat in strategies:
        info = strategy_recent_signals[strat["id"]]
        details.append({
            "strategy_id": strat["id"],
            "strategy_name": strat["name"],
            "signal": info["signal"],
            "bars_ago": info["bars_ago"]
        })
    
    return {
        "signal": aligned_signal,
        "details": details,
        "trigger_bar": df.index[-1]
    }


# ============================================================================
# Full Market Scanner
# ============================================================================

class ScanProgress:
    """Thread-safe scan progress tracker."""
    
    def __init__(self, total: int):
        self.total = total
        self.scanned = 0
        self.current_ticker = ""
        self.signals_found = 0
        self.results = []
        self.errors = []
        self.start_time = time.time()
        self.cancelled = False
    
    def to_dict(self):
        elapsed = time.time() - self.start_time
        return {
            "total": self.total,
            "scanned": self.scanned,
            "current_ticker": self.current_ticker,
            "signals_found": self.signals_found,
            "elapsed_seconds": round(elapsed, 1),
            "percentage": round((self.scanned / max(self.total, 1)) * 100, 1),
            "cancelled": self.cancelled,
            "done": self.scanned >= self.total or self.cancelled
        }


# Global scan state
_active_scan: ScanProgress = None
_scan_results: list = []


def get_scan_progress() -> dict:
    """Get current scan progress."""
    global _active_scan
    if _active_scan is None:
        return {"total": 0, "scanned": 0, "percentage": 100, "done": True}
    return _active_scan.to_dict()


def cancel_scan():
    """Cancel the active scan."""
    global _active_scan
    if _active_scan:
        _active_scan.cancelled = True


def get_scan_results() -> list:
    """Get the results from the last completed scan."""
    global _scan_results
    return _scan_results


def _scan_single_stock(
    symbol: str,
    exchange: str,
    strategies: list,
    interval: str,
    tolerance: int,
    progress: ScanProgress
) -> dict:
    """Scan a single stock against all selected strategies."""
    if progress.cancelled:
        return None
    
    progress.current_ticker = symbol
    
    try:
        df = fetch_ohlcv(symbol, interval, exchange)
        
        if df.empty or len(df) < 20:
            progress.scanned += 1
            return None
        
        result = find_aligned_signals(strategies, df, tolerance)
        
        if result["signal"]:
            last_row = df.iloc[-1]
            prev_close = df.iloc[-2]["Close"] if len(df) >= 2 else last_row["Close"]
            change_pct = ((last_row["Close"] - prev_close) / prev_close) * 100
            
            scan_result = {
                "symbol": symbol,
                "exchange": exchange,
                "price": round(float(last_row["Close"]), 2),
                "change_pct": round(change_pct, 2),
                "volume": int(last_row["Volume"]),
                "signal": result["signal"],
                "details": result["details"],
            }
            
            progress.signals_found += 1
            progress.scanned += 1
            return scan_result
        
        progress.scanned += 1
        return None
    
    except Exception as e:
        progress.errors.append(f"{symbol}: {str(e)}")
        progress.scanned += 1
        return None


def run_scan(
    strategy_ids: list,
    universe_key: str,
    interval: str = "1d",
    tolerance: int = 0,
    custom_tickers: str = "",
    max_workers: int = 5
) -> list:
    """
    Run a full market scan across a stock universe.
    
    Parameters:
        strategy_ids: List of strategy IDs to use
        universe_key: Stock universe key (e.g., 'nifty50', 'fno', 'custom')
        interval: Candle timeframe
        tolerance: Candle tolerance (0-10)
        custom_tickers: Comma-separated tickers for custom universe
        max_workers: Thread pool size
    
    Returns:
        List of scan result dicts
    """
    global _active_scan, _scan_results
    
    # Load selected strategies
    all_strategies = load_all_strategies()
    selected_strategies = [s for s in all_strategies if s["id"] in strategy_ids and s["module"]]
    
    if not selected_strategies:
        return []
    
    # Get stock list
    from data_provider import get_universe_stocks
    stocks = get_universe_stocks(universe_key, custom_tickers)
    
    if not stocks:
        return []
    
    # Initialize progress
    _active_scan = ScanProgress(len(stocks))
    _scan_results = []
    
    results = []
    
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {}
        for symbol, exchange in stocks:
            if _active_scan.cancelled:
                break
            future = executor.submit(
                _scan_single_stock,
                symbol, exchange, selected_strategies,
                interval, tolerance, _active_scan
            )
            futures[future] = symbol
        
        for future in as_completed(futures):
            if _active_scan.cancelled:
                break
            try:
                result = future.result()
                if result:
                    results.append(result)
            except Exception as e:
                _active_scan.errors.append(str(e))
    
    # Sort by signal type (BUY first) then by change_pct
    results.sort(key=lambda x: (0 if x["signal"] == "BUY" else 1, -abs(x["change_pct"])))
    
    _scan_results = results
    _active_scan.scanned = _active_scan.total  # Mark as complete
    
    return results


def test_strategy_on_sample(strategy_id: str, symbol: str = "RELIANCE", exchange: str = "NSE") -> dict:
    """
    Test a strategy on a sample stock to validate it works.
    
    Returns:
        dict with keys: success, error, buy_count, sell_count, sample_signals
    """
    try:
        strategy = None
        for s in load_all_strategies():
            if s["id"] == strategy_id:
                strategy = s
                break
        
        if not strategy:
            return {"success": False, "error": f"Strategy '{strategy_id}' not found."}
        
        if strategy["error"]:
            return {"success": False, "error": strategy["error"]}
        
        df = fetch_ohlcv(symbol, "1d", exchange)
        
        if df.empty:
            return {"success": False, "error": f"No data available for {symbol}.{exchange}"}
        
        signals = run_strategy_on_stock(strategy, df)
        
        buy_count = (signals == "BUY").sum()
        sell_count = (signals == "SELL").sum()
        
        # Get last 5 signals
        recent_signals = []
        signal_mask = signals.isin(["BUY", "SELL"])
        if signal_mask.any():
            last_signals = signals[signal_mask].tail(5)
            for idx, val in last_signals.items():
                ts = idx
                if hasattr(ts, 'strftime'):
                    date_str = ts.strftime("%Y-%m-%d")
                else:
                    date_str = str(ts)
                recent_signals.append({"date": date_str, "signal": val})
        
        return {
            "success": True,
            "error": None,
            "buy_count": int(buy_count),
            "sell_count": int(sell_count),
            "total_bars": len(df),
            "sample_signals": recent_signals,
            "tested_on": f"{symbol}.{exchange}"
        }
    
    except Exception as e:
        return {"success": False, "error": str(e)}
