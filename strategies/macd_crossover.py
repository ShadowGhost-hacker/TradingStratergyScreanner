"""
MACD Crossover Strategy
Generates BUY signal when MACD line crosses above signal line,
and SELL signal when MACD line crosses below signal line.
"""

import pandas as pd
import numpy as np

STRATEGY_NAME = "MACD Crossover"
STRATEGY_DESCRIPTION = "Buy when MACD(12,26,9) line crosses above signal line. Sell when MACD line crosses below signal line."


def evaluate(df: pd.DataFrame) -> pd.Series:
    """
    Parameters:
        df: pd.DataFrame with columns ['Open', 'High', 'Low', 'Close', 'Volume']
    Returns:
        pd.Series of signals: 'BUY', 'SELL', or None
    """
    signals = pd.Series(index=df.index, dtype=object)
    
    # MACD Calculation
    ema12 = df['Close'].ewm(span=12, adjust=False).mean()
    ema26 = df['Close'].ewm(span=26, adjust=False).mean()
    macd_line = ema12 - ema26
    signal_line = macd_line.ewm(span=9, adjust=False).mean()
    
    # BUY: MACD line crosses above Signal line
    buy_condition = (macd_line > signal_line) & (macd_line.shift(1) <= signal_line.shift(1))
    signals[buy_condition] = 'BUY'
    
    # SELL: MACD line crosses below Signal line
    sell_condition = (macd_line < signal_line) & (macd_line.shift(1) >= signal_line.shift(1))
    signals[sell_condition] = 'SELL'
    
    return signals
