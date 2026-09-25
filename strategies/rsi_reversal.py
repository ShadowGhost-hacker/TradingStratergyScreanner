"""
RSI Reversal Strategy
Generates BUY signal when RSI crosses below oversold level (30),
and SELL signal when RSI crosses above overbought level (70).
"""

import pandas as pd
import numpy as np

STRATEGY_NAME = "RSI Reversal (14)"
STRATEGY_DESCRIPTION = "Buy when RSI(14) enters oversold zone (<30). Sell when RSI(14) enters overbought zone (>70)."


def evaluate(df: pd.DataFrame) -> pd.Series:
    """
    Parameters:
        df: pd.DataFrame with columns ['Open', 'High', 'Low', 'Close', 'Volume']
    Returns:
        pd.Series of signals: 'BUY', 'SELL', or None
    """
    signals = pd.Series(index=df.index, dtype=object)
    
    # RSI Calculation
    period = 14
    delta = df['Close'].diff()
    gain = delta.where(delta > 0, 0.0)
    loss = -delta.where(delta < 0, 0.0)
    avg_gain = gain.rolling(period).mean()
    avg_loss = loss.rolling(period).mean()
    rs = avg_gain / avg_loss
    rsi = 100 - (100 / (1 + rs))
    
    # BUY: RSI crosses into oversold zone
    buy_condition = (rsi < 30) & (rsi.shift(1) >= 30)
    signals[buy_condition] = 'BUY'
    
    # SELL: RSI crosses into overbought zone
    sell_condition = (rsi > 70) & (rsi.shift(1) <= 70)
    signals[sell_condition] = 'SELL'
    
    return signals
