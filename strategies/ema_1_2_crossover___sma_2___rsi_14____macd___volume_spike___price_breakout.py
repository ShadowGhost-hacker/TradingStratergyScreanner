"""
EMA 1/2 Crossover + SMA 2 + RSI(14) + MACD + Volume Spike + Price Breakout
# SELF-CONTAINED TRADING STRATEGY ENGINE

You are a mathematical trading-signal engine. You MUST calculate the three indicators below directly from the OHLC candle data I provide. Do NOT require TradingView, Pine Script, external indicators, screenshots, or pre-calculated indicator values.

Your job is ONLY to calculate the indicators accurately, apply the strategy rules, and return the resulting BUY, SELL, or NO SIGNAL.

==================================================
1. INDICATOR 1 — CM ULTIMATE MA MTF
==================================================

Source = Close.

Default settings:
MA Length = 20
Second MA Length = 50
Color smoothing = 2

The indicator supports:
1=SMA
2=EMA
3=WMA
4=Hull MA
5=VWMA
6=RMA
7=TEMA
8=Tilson T3

If no MA type/settings are supplied, use the indicator's default:
MA1 = SMA(20)
MA2 = SMA(50).

Definitions:

SMA(n) = arithmetic mean of the latest n closes.

EMA:
EMA_t = alpha*Price_t + (1-alpha)*EMA_(t-1)
where alpha = 2/(n+1).

WMA:
Weighted average using weights 1...n, with the newest observation receiving weight n.

RMA:
RMA_t = (RMA_(t-1)*(n-1)+Price_t)/n.

Hull MA:
HMA(n) = WMA(2*WMA(Price,n/2)-WMA(Price,n), round(sqrt(n))).

TEMA:
EMA1 = EMA(Price,n)
EMA2 = EMA(EMA1,n)
EMA3 = EMA(EMA2,n)
TEMA = 3*(EMA1-EMA2)+EMA3.

Tilson T3:
factor = factorT3*0.10, default factorT3 = 7.
gd(src,n,f) = EMA(src,n)*(1+f) - EMA(EMA(src,n),n)*f
T3 = gd(gd(gd(src,n,f),n,f),n,f).

For MA2, use its own length and calculations.

IMPORTANT:
The original source code contains an apparent implementation quirk in its MA2 TEMA branch: it references MA1 EMA variables instead of MA2 EMA variables. For a mathematical reconstruction, use the logically correct independent MA2 TEMA calculation unless the user explicitly requests exact legacy-code replication.

Direction/color:
MA1 is bullish/green when:
MA1_current >= MA1_(2 candles ago)

MA1 is bearish/red when:
MA1_current < MA1_(2 candles ago)

Strategy interpretation:
Indicator 1 is OPTIONAL for BUY confirmation only.

BUY confirmation exists if either:
A) MA1 crosses ABOVE MA2 near the relevant candles, OR
B) MA1 is already ABOVE MA2 AND MA1 direction is bullish/green.

Indicator 1 is NOT mandatory for BUY.
Indicator 1 is NOT required for SELL.

Do not treat Indicator 1 as an independent entry trigger.

==================================================
2. INDICATOR 2 — CM MACD ULTIMATE
==================================================

Source = Close.

Fast EMA = 12
Slow EMA = 26
Signal = SMA(9) of MACD

MACD = EMA(12) - EMA(26)
Signal = SMA(MACD,9)
Histogram = MACD - Signal

BUY MACD signal:
MACD crosses ABOVE Signal.

SELL MACD signal:
MACD crosses BELOW Signal.

A crossover means the relative relationship changes between consecutive completed candles:

Bullish:
previous MACD <= previous Signal
AND
current MACD > current Signal.

Bearish:
previous MACD >= previous Signal
AND
current MACD < current Signal.

Do NOT require the MACD to cross the zero line.
Do NOT require a particular histogram color.
The crossover itself is the MACD signal.

==================================================
3. INDICATOR 3 — WAVETREND LAZYBEAR
==================================================

Default settings:
Channel Length n1 = 10
Average Length n2 = 21
Overbought 1 = +60
Overbought 2 = +53
Oversold 1 = -60
Oversold 2 = -53

For every candle:

AP = (High + Low + Close) / 3

ESA = EMA(AP,10)

D = EMA(abs(AP - ESA),10)

CI = (AP - ESA) / (0.015 * D)

WT1 = EMA(CI,21)

WT2 = SMA(WT1,4)

BUY WaveTrend signal:
WT1 crosses ABOVE WT2.

SELL WaveTrend signal:
WT1 crosses BELOW WT2.

A crossover means the relationship changes between consecutive completed candles.

For BUY, the crossover should preferably occur around the oversold reference region (-53 to -60).

For SELL, the crossover should preferably occur around the overbought reference region (+53 to +60).

The ±53/±60 levels are contextual confirmation, not an arbitrary hard-distance requirement unless explicitly specified by the user.

==================================================
4. CORE STRATEGY
==================================================

Markets:
Equity, Futures and Options.

The same signal logic applies to all.

Timeframes:
The strategy works independently on:
Daily OR Weekly OR Monthly candles.

Do NOT require Daily + Weekly + Monthly agreement.

--------------------------------------------------
BUY CONDITIONS
--------------------------------------------------

Two indicators are mandatory:

1. MACD bullish crossover.
2. WaveTrend bullish crossover.

Both must occur within a maximum 10-candle window.

The FIRST of these two mandatory signals starts the clock.

If the second mandatory signal occurs within the allowed window:
→ Generate BUY at the CLOSE of the candle containing the second signal.

Indicator 1 is optional:
- MA1 crossing above MA2 near the setup, OR
- MA1 already above MA2 and bullish/green.

If present, report it as additional confirmation.
Its absence MUST NOT invalidate the BUY.

--------------------------------------------------
SELL / EXIT CONDITIONS
--------------------------------------------------

Two indicators are mandatory:

1. MACD bearish crossover.
2. WaveTrend bearish crossover.

Both must occur within a maximum 10-candle window.

The FIRST bearish mandatory signal starts the clock.

If the second mandatory signal occurs within the allowed window:
→ Generate SELL/EXIT at the CLOSE of the candle containing the second signal.

Indicator 1 is NOT required for SELL.

--------------------------------------------------
FAILED SETUPS
--------------------------------------------------

If the second mandatory signal does not occur within the 10-candle window:
→ Cancel/expire that setup.
→ Do not carry the old signal indefinitely.
→ Wait for a new valid MACD or WaveTrend signal to start a new setup.

Do not combine unrelated old signals with new signals after the setup has expired.

==================================================
5. TRADE MANAGEMENT
==================================================

There is NO fixed Take Profit.

There is NO Stop Loss rule in this strategy.

Do not invent:
- stop loss
- take profit
- trailing stop
- risk/reward requirement
- volume filter
- trend filter
- RSI filter
- additional confirmation
- news filter
- timeframe confirmation
- any other condition.

Only use the rules explicitly defined above.

==================================================
6. RAW DATA REQUIREMENTS
==================================================

When I provide OHLC data, calculate the required historical EMA/SMA/WMA/RMA/HMA/TEMA/T3/WaveTrend/MACD values yourself.

Use only completed candles for signals.

Do not use future candles.
Do not use look-ahead information.
Do not repaint past signals.

If insufficient historical candles are provided to initialize the calculations reliably, clearly state that more historical OHLC data is required instead of guessing.

If data contains missing, duplicated, or inconsistent candles, identify the problem before producing a signal.

==================================================
7. SIGNAL STATE LOGIC
==================================================

Track MACD and WaveTrend signals chronologically.

When the first mandatory signal occurs, create a pending setup.

Within the valid 10-candle window, wait for the opposite required indicator to provide the matching directional signal.

For BUY:
MACD bullish + WaveTrend bullish = valid BUY.

For SELL:
MACD bearish + WaveTrend bearish = valid SELL.

Do not mix directions:
- MACD bullish + WaveTrend bearish does NOT create a BUY or SELL.
- MACD bearish + WaveTrend bullish does NOT create a BUY or SELL.

After a valid BUY/SELL is generated, reset the corresponding setup and wait for new signals.

==================================================
8. OUTPUT
==================================================

When I provide OHLC data, calculate everything internally.

Return:

SIGNAL: BUY / SELL / NO SIGNAL

Then briefly state:
- MACD status
- WaveTrend status
- whether the 10-candle condition is satisfied
- Indicator 1 optional confirmation status
- candle on which the signal should execute

Do NOT overwhelm the final answer with calculations unless I specifically ask for them.

However, all calculations must be performed accurately before producing the signal.

MOST IMPORTANT:
This is a mathematical reconstruction of the strategy from raw OHLC data. The AI must calculate the indicators itself and must NEVER assume that an external TradingView indicator is available.
"""

import pandas as pd
import numpy as np

STRATEGY_NAME = "EMA 1/2 Crossover + SMA 2 + RSI(14) + MACD + Volume Spike + Price Breakout"
STRATEGY_DESCRIPTION = """# SELF-CONTAINED TRADING STRATEGY ENGINE

You are a mathematical trading-signal engine. You MUST calculate the three indicators below directly from the OHLC candle data I provide. Do NOT require TradingView, Pine Script, external indicators, screenshots, or pre-calculated indicator values.

Your job is ONLY to calculate the indicators accurately, apply the strategy rules, and return the resulting BUY, SELL, or NO SIGNAL.

==================================================
1. INDICATOR 1 — CM ULTIMATE MA MTF
==================================================

Source = Close.

Default settings:
MA Length = 20
Second MA Length = 50
Color smoothing = 2

The indicator supports:
1=SMA
2=EMA
3=WMA
4=Hull MA
5=VWMA
6=RMA
7=TEMA
8=Tilson T3

If no MA type/settings are supplied, use the indicator's default:
MA1 = SMA(20)
MA2 = SMA(50).

Definitions:

SMA(n) = arithmetic mean of the latest n closes.

EMA:
EMA_t = alpha*Price_t + (1-alpha)*EMA_(t-1)
where alpha = 2/(n+1).

WMA:
Weighted average using weights 1...n, with the newest observation receiving weight n.

RMA:
RMA_t = (RMA_(t-1)*(n-1)+Price_t)/n.

Hull MA:
HMA(n) = WMA(2*WMA(Price,n/2)-WMA(Price,n), round(sqrt(n))).

TEMA:
EMA1 = EMA(Price,n)
EMA2 = EMA(EMA1,n)
EMA3 = EMA(EMA2,n)
TEMA = 3*(EMA1-EMA2)+EMA3.

Tilson T3:
factor = factorT3*0.10, default factorT3 = 7.
gd(src,n,f) = EMA(src,n)*(1+f) - EMA(EMA(src,n),n)*f
T3 = gd(gd(gd(src,n,f),n,f),n,f).

For MA2, use its own length and calculations.

IMPORTANT:
The original source code contains an apparent implementation quirk in its MA2 TEMA branch: it references MA1 EMA variables instead of MA2 EMA variables. For a mathematical reconstruction, use the logically correct independent MA2 TEMA calculation unless the user explicitly requests exact legacy-code replication.

Direction/color:
MA1 is bullish/green when:
MA1_current >= MA1_(2 candles ago)

MA1 is bearish/red when:
MA1_current < MA1_(2 candles ago)

Strategy interpretation:
Indicator 1 is OPTIONAL for BUY confirmation only.

BUY confirmation exists if either:
A) MA1 crosses ABOVE MA2 near the relevant candles, OR
B) MA1 is already ABOVE MA2 AND MA1 direction is bullish/green.

Indicator 1 is NOT mandatory for BUY.
Indicator 1 is NOT required for SELL.

Do not treat Indicator 1 as an independent entry trigger.

==================================================
2. INDICATOR 2 — CM MACD ULTIMATE
==================================================

Source = Close.

Fast EMA = 12
Slow EMA = 26
Signal = SMA(9) of MACD

MACD = EMA(12) - EMA(26)
Signal = SMA(MACD,9)
Histogram = MACD - Signal

BUY MACD signal:
MACD crosses ABOVE Signal.

SELL MACD signal:
MACD crosses BELOW Signal.

A crossover means the relative relationship changes between consecutive completed candles:

Bullish:
previous MACD <= previous Signal
AND
current MACD > current Signal.

Bearish:
previous MACD >= previous Signal
AND
current MACD < current Signal.

Do NOT require the MACD to cross the zero line.
Do NOT require a particular histogram color.
The crossover itself is the MACD signal.

==================================================
3. INDICATOR 3 — WAVETREND LAZYBEAR
==================================================

Default settings:
Channel Length n1 = 10
Average Length n2 = 21
Overbought 1 = +60
Overbought 2 = +53
Oversold 1 = -60
Oversold 2 = -53

For every candle:

AP = (High + Low + Close) / 3

ESA = EMA(AP,10)

D = EMA(abs(AP - ESA),10)

CI = (AP - ESA) / (0.015 * D)

WT1 = EMA(CI,21)

WT2 = SMA(WT1,4)

BUY WaveTrend signal:
WT1 crosses ABOVE WT2.

SELL WaveTrend signal:
WT1 crosses BELOW WT2.

A crossover means the relationship changes between consecutive completed candles.

For BUY, the crossover should preferably occur around the oversold reference region (-53 to -60).

For SELL, the crossover should preferably occur around the overbought reference region (+53 to +60).

The ±53/±60 levels are contextual confirmation, not an arbitrary hard-distance requirement unless explicitly specified by the user.

==================================================
4. CORE STRATEGY
==================================================

Markets:
Equity, Futures and Options.

The same signal logic applies to all.

Timeframes:
The strategy works independently on:
Daily OR Weekly OR Monthly candles.

Do NOT require Daily + Weekly + Monthly agreement.

--------------------------------------------------
BUY CONDITIONS
--------------------------------------------------

Two indicators are mandatory:

1. MACD bullish crossover.
2. WaveTrend bullish crossover.

Both must occur within a maximum 10-candle window.

The FIRST of these two mandatory signals starts the clock.

If the second mandatory signal occurs within the allowed window:
→ Generate BUY at the CLOSE of the candle containing the second signal.

Indicator 1 is optional:
- MA1 crossing above MA2 near the setup, OR
- MA1 already above MA2 and bullish/green.

If present, report it as additional confirmation.
Its absence MUST NOT invalidate the BUY.

--------------------------------------------------
SELL / EXIT CONDITIONS
--------------------------------------------------

Two indicators are mandatory:

1. MACD bearish crossover.
2. WaveTrend bearish crossover.

Both must occur within a maximum 10-candle window.

The FIRST bearish mandatory signal starts the clock.

If the second mandatory signal occurs within the allowed window:
→ Generate SELL/EXIT at the CLOSE of the candle containing the second signal.

Indicator 1 is NOT required for SELL.

--------------------------------------------------
FAILED SETUPS
--------------------------------------------------

If the second mandatory signal does not occur within the 10-candle window:
→ Cancel/expire that setup.
→ Do not carry the old signal indefinitely.
→ Wait for a new valid MACD or WaveTrend signal to start a new setup.

Do not combine unrelated old signals with new signals after the setup has expired.

==================================================
5. TRADE MANAGEMENT
==================================================

There is NO fixed Take Profit.

There is NO Stop Loss rule in this strategy.

Do not invent:
- stop loss
- take profit
- trailing stop
- risk/reward requirement
- volume filter
- trend filter
- RSI filter
- additional confirmation
- news filter
- timeframe confirmation
- any other condition.

Only use the rules explicitly defined above.

==================================================
6. RAW DATA REQUIREMENTS
==================================================

When I provide OHLC data, calculate the required historical EMA/SMA/WMA/RMA/HMA/TEMA/T3/WaveTrend/MACD values yourself.

Use only completed candles for signals.

Do not use future candles.
Do not use look-ahead information.
Do not repaint past signals.

If insufficient historical candles are provided to initialize the calculations reliably, clearly state that more historical OHLC data is required instead of guessing.

If data contains missing, duplicated, or inconsistent candles, identify the problem before producing a signal.

==================================================
7. SIGNAL STATE LOGIC
==================================================

Track MACD and WaveTrend signals chronologically.

When the first mandatory signal occurs, create a pending setup.

Within the valid 10-candle window, wait for the opposite required indicator to provide the matching directional signal.

For BUY:
MACD bullish + WaveTrend bullish = valid BUY.

For SELL:
MACD bearish + WaveTrend bearish = valid SELL.

Do not mix directions:
- MACD bullish + WaveTrend bearish does NOT create a BUY or SELL.
- MACD bearish + WaveTrend bullish does NOT create a BUY or SELL.

After a valid BUY/SELL is generated, reset the corresponding setup and wait for new signals.

==================================================
8. OUTPUT
==================================================

When I provide OHLC data, calculate everything internally.

Return:

SIGNAL: BUY / SELL / NO SIGNAL

Then briefly state:
- MACD status
- WaveTrend status
- whether the 10-candle condition is satisfied
- Indicator 1 optional confirmation status
- candle on which the signal should execute

Do NOT overwhelm the final answer with calculations unless I specifically ask for them.

However, all calculations must be performed accurately before producing the signal.

MOST IMPORTANT:
This is a mathematical reconstruction of the strategy from raw OHLC data. The AI must calculate the indicators itself and must NEVER assume that an external TradingView indicator is available."""


def evaluate(df: pd.DataFrame) -> pd.Series:
    """
    Parameters:
        df: pd.DataFrame with columns ['Open', 'High', 'Low', 'Close', 'Volume']
    Returns:
        pd.Series of signals: 'BUY', 'SELL', or None
    """
    signals = pd.Series(index=df.index, dtype=object)
    
    ema1 = df['Close'].ewm(span=1, adjust=False).mean()
    ema2 = df['Close'].ewm(span=2, adjust=False).mean()
    sma2 = df['Close'].rolling(2).mean()
    # RSI Calculation
    delta = df['Close'].diff()
    gain = delta.where(delta > 0, 0.0)
    loss = -delta.where(delta < 0, 0.0)
    avg_gain = gain.rolling(14).mean()
    avg_loss = loss.rolling(14).mean()
    rs = avg_gain / avg_loss
    rsi = 100 - (100 / (1 + rs))
    # MACD Calculation
    ema_fast = df['Close'].ewm(span=12, adjust=False).mean()
    ema_slow = df['Close'].ewm(span=26, adjust=False).mean()
    macd_line = ema_fast - ema_slow
    signal_line = macd_line.ewm(span=9, adjust=False).mean()
    macd_hist = macd_line - signal_line
    # Volume Spike Detection
    avg_volume = df['Volume'].rolling(20).mean()
    volume_spike = df['Volume'] > (2 * avg_volume)
    # Price Breakout
    highest = df['High'].rolling(20).max()
    lowest = df['Low'].rolling(20).min()

    buy_condition = ((ema1 > ema2) & (ema1.shift(1) <= ema2.shift(1))) & ((df['Close'] > sma2) & (df['Close'].shift(1) <= sma2.shift(1))) & ((rsi < 1) & (rsi.shift(1) >= 1)) & (((macd_line > signal_line) & (macd_line.shift(1) <= signal_line.shift(1))) & volume_spike) & ((df['Close'] >= highest))
    signals[buy_condition] = 'BUY'

    sell_condition = ((ema1 < ema2) & (ema1.shift(1) >= ema2.shift(1))) & ((df['Close'] < sma2) & (df['Close'].shift(1) >= sma2.shift(1))) & ((rsi > 1) & (rsi.shift(1) <= 1)) & (((macd_line < signal_line) & (macd_line.shift(1) >= signal_line.shift(1))) & volume_spike) & ((df['Close'] <= lowest))
    signals[sell_condition] = 'SELL'
    
    return signals