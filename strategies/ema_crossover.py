"""
EMA Crossover Strategy
Generates BUY signal when fast EMA crosses above slow EMA,
and SELL signal when fast EMA crosses below slow EMA.
"""

import pandas as pd
import numpy as np

STRATEGY_NAME = "EMA Crossover (20/50)"
STRATEGY_DESCRIPTION = "Buy when 20 EMA crosses above 50 EMA. Sell when 20 EMA crosses below 50 EMA."


def evaluate(df: pd.DataFrame) -> pd.Series:
    """
    Parameters:
        df: pd.DataFrame with columns ['Open', 'High', 'Low', 'Close', 'Volume']
    Returns:
        pd.Series of signals: 'BUY', 'SELL', or None
    """
    signals = pd.Series(index=df.index, dtype=object)
    
    ema20 = df['Close'].ewm(span=20, adjust=False).mean()
    ema50 = df['Close'].ewm(span=50, adjust=False).mean()
    
    # BUY: Fast EMA crosses above Slow EMA
    buy_condition = (ema20 > ema50) & (ema20.shift(1) <= ema50.shift(1))
    signals[buy_condition] = 'BUY'
    
    # SELL: Fast EMA crosses below Slow EMA
    sell_condition = (ema20 < ema50) & (ema20.shift(1) >= ema50.shift(1))
    signals[sell_condition] = 'SELL'
    
    return signals
