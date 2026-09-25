"""
Supertrend Breakout Strategy
Generates BUY signal when price crosses above Supertrend,
and SELL signal when price crosses below Supertrend.
"""

import pandas as pd
import numpy as np

STRATEGY_NAME = "Supertrend Breakout"
STRATEGY_DESCRIPTION = "Buy when Supertrend(10,3) flips bullish. Sell when Supertrend flips bearish."


def evaluate(df: pd.DataFrame) -> pd.Series:
    """
    Parameters:
        df: pd.DataFrame with columns ['Open', 'High', 'Low', 'Close', 'Volume']
    Returns:
        pd.Series of signals: 'BUY', 'SELL', or None
    """
    signals = pd.Series(index=df.index, dtype=object)
    
    atr_period = 10
    multiplier = 3.0
    
    # ATR Calculation
    hl2 = (df['High'] + df['Low']) / 2
    tr = pd.concat([
        df['High'] - df['Low'],
        (df['High'] - df['Close'].shift()).abs(),
        (df['Low'] - df['Close'].shift()).abs()
    ], axis=1).max(axis=1)
    atr = tr.rolling(atr_period).mean()
    
    # Supertrend Bands
    upper_band = hl2 + (multiplier * atr)
    lower_band = hl2 - (multiplier * atr)
    
    # Supertrend Direction
    supertrend = pd.Series(index=df.index, dtype=float)
    direction = pd.Series(index=df.index, dtype=float)
    
    if len(df) <= atr_period:
        return signals
    
    supertrend.iloc[atr_period] = upper_band.iloc[atr_period]
    direction.iloc[atr_period] = -1
    
    for i in range(atr_period + 1, len(df)):
        if df['Close'].iloc[i] > supertrend.iloc[i-1]:
            if direction.iloc[i-1] == 1:
                supertrend.iloc[i] = max(lower_band.iloc[i], supertrend.iloc[i-1])
            else:
                supertrend.iloc[i] = lower_band.iloc[i]
            direction.iloc[i] = 1
        else:
            if direction.iloc[i-1] == -1:
                supertrend.iloc[i] = min(upper_band.iloc[i], supertrend.iloc[i-1])
            else:
                supertrend.iloc[i] = upper_band.iloc[i]
            direction.iloc[i] = -1
    
    # BUY: Direction flips from bearish to bullish
    buy_condition = (direction == 1) & (direction.shift(1) == -1)
    signals[buy_condition] = 'BUY'
    
    # SELL: Direction flips from bullish to bearish
    sell_condition = (direction == -1) & (direction.shift(1) == 1)
    signals[sell_condition] = 'SELL'
    
    return signals
