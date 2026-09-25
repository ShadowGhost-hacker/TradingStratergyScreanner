"""
backtest_engine.py - Historical Backtest Simulator

Executes historical simulations for single or multi-strategy selections
across chosen stock universes (NSE/BSE) and generates comprehensive
performance metrics, trade logs, and equity curve data.
"""

import pandas as pd
import numpy as np
import time
from typing import List, Dict, Any, Optional
from concurrent.futures import ThreadPoolExecutor

import scanner_engine
import data_provider


class BacktestProgress:
    """Thread-safe progress tracker for backtest simulations."""

    def __init__(self, total_stocks: int):
        self.total = total_stocks
        self.completed = 0
        self.current_stock = ""
        self.total_trades = 0
        self.cancelled = False
        self.status = "running"
        self.start_time = time.time()

    def to_dict(self) -> dict:
        pct = round((self.completed / self.total) * 100, 1) if self.total > 0 else 0
        return {
            "total": self.total,
            "completed": self.completed,
            "percentage": min(pct, 100),
            "current_stock": self.current_stock,
            "total_trades": self.total_trades,
            "cancelled": self.cancelled,
            "status": self.status,
            "elapsed_seconds": round(time.time() - self.start_time, 1)
        }


_active_backtest: Optional[BacktestProgress] = None
_last_backtest_result: Optional[dict] = None


def get_backtest_progress() -> dict:
    """Return active backtest progress."""
    global _active_backtest
    if _active_backtest is None:
        return {"status": "idle", "percentage": 100, "completed": 0, "total": 0}
    return _active_backtest.to_dict()


def cancel_backtest():
    """Cancel currently running backtest."""
    global _active_backtest
    if _active_backtest:
        _active_backtest.cancelled = True
        _active_backtest.status = "cancelled"


def get_last_backtest_result() -> Optional[dict]:
    """Get the results of the last completed backtest."""
    global _last_backtest_result
    return _last_backtest_result


def _simulate_stock_trades(
    symbol: str,
    exchange: str,
    strategies: list,
    interval: str,
    tolerance: int,
    initial_capital: float,
    position_size_pct: float,
    stop_loss_pct: float,
    take_profit_pct: float,
    exit_on_opposite: bool,
    max_holding_bars: int
) -> List[dict]:
    """
    Simulate trades for a single stock across the historical candle series.
    """
    df = data_provider.fetch_ohlcv(symbol, interval, exchange, use_cache=True)
    if df.empty or len(df) < 30:
        return []

    # Calculate signals for all strategies
    strat_signals = {}
    for s in strategies:
        strat_signals[s["id"]] = scanner_engine.run_strategy_on_stock(s, df)

    trades = []
    in_trade = False
    entry_bar_idx = 0
    entry_price = 0.0
    entry_date = ""
    trade_direction = "BUY"
    position_size_cash = (initial_capital * (position_size_pct / 100.0))
    shares = 0

    n_bars = len(df)

    for i in range(20, n_bars):
        current_bar = df.iloc[i]
        current_date = str(df.index[i])[:10]
        current_close = float(current_bar["Close"])
        current_high = float(current_bar["High"])
        current_low = float(current_bar["Low"])

        if in_trade:
            holding_bars = i - entry_bar_idx
            exit_price = None
            exit_reason = ""

            # Check Stop Loss
            if stop_loss_pct > 0:
                sl_price = entry_price * (1 - stop_loss_pct / 100.0)
                if current_low <= sl_price:
                    exit_price = sl_price
                    exit_reason = f"Stop Loss (-{stop_loss_pct}%)"

            # Check Take Profit
            if not exit_price and take_profit_pct > 0:
                tp_price = entry_price * (1 + take_profit_pct / 100.0)
                if current_high >= tp_price:
                    exit_price = tp_price
                    exit_reason = f"Take Profit (+{take_profit_pct}%)"

            # Check Opposite Signal
            if not exit_price and exit_on_opposite:
                # Check if sell signal present across all strategies
                all_sell = True
                for strat_id, sig_series in strat_signals.items():
                    # check within tolerance bars
                    lookback_start = max(0, i - tolerance)
                    recent_slice = sig_series.iloc[lookback_start:i + 1]
                    if (recent_slice == "SELL").sum() == 0:
                        all_sell = False
                        break
                if all_sell:
                    exit_price = current_close
                    exit_reason = "Opposite Signal (SELL)"

            # Check Max Holding Period
            if not exit_price and max_holding_bars > 0 and holding_bars >= max_holding_bars:
                exit_price = current_close
                exit_reason = f"Max Holding Reached ({max_holding_bars} bars)"

            # If exit condition met or last bar
            if exit_price or i == n_bars - 1:
                if not exit_price:
                    exit_price = current_close
                    exit_reason = "End of Backtest Period"

                # Slippage & brokerage estimate (0.05% per leg)
                cost_factor = 0.0005
                realized_entry = entry_price * (1 + cost_factor)
                realized_exit = exit_price * (1 - cost_factor)

                pnl = (realized_exit - realized_entry) * shares
                ret_pct = ((realized_exit - realized_entry) / realized_entry) * 100.0

                trades.append({
                    "symbol": symbol,
                    "exchange": exchange,
                    "direction": trade_direction,
                    "entry_date": entry_date,
                    "entry_price": round(entry_price, 2),
                    "exit_date": current_date,
                    "exit_price": round(exit_price, 2),
                    "shares": shares,
                    "pnl": round(pnl, 2),
                    "return_pct": round(ret_pct, 2),
                    "holding_bars": holding_bars,
                    "exit_reason": exit_reason,
                    "is_win": pnl > 0
                })
                in_trade = False

        else:
            # Check for BUY signal entry
            all_buy = True
            for strat_id, sig_series in strat_signals.items():
                lookback_start = max(0, i - tolerance)
                recent_slice = sig_series.iloc[lookback_start:i + 1]
                if (recent_slice == "BUY").sum() == 0:
                    all_buy = False
                    break

            if all_buy and current_close > 0:
                in_trade = True
                entry_bar_idx = i
                entry_price = current_close
                entry_date = current_date
                trade_direction = "BUY"
                shares = max(1, int(position_size_cash / entry_price))

    return trades


def run_backtest_simulation(
    strategy_ids: List[str],
    universe_key: Any,
    interval: str = "1d",
    initial_capital: float = 100000.0,
    position_size_pct: float = 10.0,
    stop_loss_pct: float = 2.5,
    take_profit_pct: float = 5.0,
    exit_on_opposite: bool = True,
    max_holding_bars: int = 20,
    custom_tickers: str = ""
) -> dict:
    """
    Execute full historical backtest across selected universe and strategies.
    """
    global _active_backtest, _last_backtest_result

    all_strategies = scanner_engine.load_all_strategies()
    selected = [s for s in all_strategies if s["id"] in strategy_ids and s["module"]]

    if not selected:
        return {"error": "No valid strategies selected for backtest"}

    stocks = data_provider.get_universe_stocks(universe_key, custom_tickers)
    if not stocks:
        return {"error": "Selected universe contains no stocks"}

    _active_backtest = BacktestProgress(len(stocks))

    all_trades = []

    # Run in parallel thread pool
    with ThreadPoolExecutor(max_workers=6) as executor:
        futures = {}
        for sym, exch in stocks:
            if _active_backtest.cancelled:
                break
            futures[executor.submit(
                _simulate_stock_trades,
                sym, exch, selected, interval, 0,
                initial_capital, position_size_pct,
                stop_loss_pct, take_profit_pct,
                exit_on_opposite, max_holding_bars
            )] = sym

        for fut in futures:
            if _active_backtest.cancelled:
                break
            sym = futures[fut]
            _active_backtest.current_stock = sym
            try:
                stock_trades = fut.result()
                if stock_trades:
                    all_trades.extend(stock_trades)
                    _active_backtest.total_trades += len(stock_trades)
            except Exception as e:
                print(f"Error backtesting {sym}: {e}")
            finally:
                _active_backtest.completed += 1

    _active_backtest.status = "completed"

    # Sort trades chronologically by exit date
    all_trades.sort(key=lambda t: t["exit_date"])

    # Compute comprehensive metrics
    total_trades = len(all_trades)
    winning_trades = [t for t in all_trades if t["is_win"]]
    losing_trades = [t for t in all_trades if not t["is_win"]]

    win_count = len(winning_trades)
    loss_count = len(losing_trades)
    win_rate = round((win_count / total_trades) * 100, 2) if total_trades > 0 else 0.0

    total_profit = sum(t["pnl"] for t in winning_trades)
    total_loss = abs(sum(t["pnl"] for t in losing_trades))

    profit_factor = round(total_profit / total_loss, 2) if total_loss > 0 else (99.0 if total_profit > 0 else 0.0)
    net_pnl = sum(t["pnl"] for t in all_trades)
    final_equity = initial_capital + net_pnl
    total_return_pct = round((net_pnl / initial_capital) * 100, 2)

    avg_trade_ret = round(np.mean([t["return_pct"] for t in all_trades]), 2) if all_trades else 0.0
    avg_win = round(np.mean([t["return_pct"] for t in winning_trades]), 2) if winning_trades else 0.0
    avg_loss = round(np.mean([t["return_pct"] for t in losing_trades]), 2) if losing_trades else 0.0

    # Build Equity Curve and compute Maximum Drawdown
    equity = initial_capital
    peak = initial_capital
    max_dd_val = 0.0
    max_dd_pct = 0.0
    equity_curve = [{"date": "Start", "equity": round(initial_capital, 2), "pnl": 0.0, "drawdown_pct": 0.0}]

    for t in all_trades:
        equity += t["pnl"]
        if equity > peak:
            peak = equity
        dd_val = peak - equity
        dd_pct = (dd_val / peak) * 100.0 if peak > 0 else 0.0

        if dd_pct > max_dd_pct:
            max_dd_pct = dd_pct
            max_dd_val = dd_val

        equity_curve.append({
            "date": t["exit_date"],
            "symbol": t["symbol"],
            "equity": round(equity, 2),
            "pnl": round(t["pnl"], 2),
            "drawdown_pct": round(dd_pct, 2)
        })

    best_trade = max(all_trades, key=lambda t: t["pnl"]) if all_trades else None
    worst_trade = min(all_trades, key=lambda t: t["pnl"]) if all_trades else None

    result = {
        "status": "success",
        "universe": universe_key,
        "strategy_names": [s["name"] for s in selected],
        "metrics": {
            "initial_capital": initial_capital,
            "final_equity": round(final_equity, 2),
            "net_pnl": round(net_pnl, 2),
            "total_return_pct": total_return_pct,
            "total_trades": total_trades,
            "winning_trades": win_count,
            "losing_trades": loss_count,
            "win_rate_pct": win_rate,
            "profit_factor": profit_factor,
            "max_drawdown_pct": round(max_dd_pct, 2),
            "max_drawdown_val": round(max_dd_val, 2),
            "avg_trade_return_pct": avg_trade_ret,
            "avg_win_pct": avg_win,
            "avg_loss_pct": avg_loss,
            "best_trade": best_trade,
            "worst_trade": worst_trade,
        },
        "equity_curve": equity_curve,
        "trades": all_trades
    }

    _last_backtest_result = result
    return result
