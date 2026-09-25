"""
ai_generator.py - AI Strategy Generator

Converts natural language strategy descriptions to Python code using:
1. Google Gemini API (when API key is available)
2. Smart offline rule-based parser (always available as fallback)
"""

import re
import json
import os

# ============================================================================
# Strategy Code Template
# ============================================================================

STRATEGY_TEMPLATE = '''"""
{name}
{description}
"""

import pandas as pd
import numpy as np

STRATEGY_NAME = "{name}"
STRATEGY_DESCRIPTION = """{description}"""


def evaluate(df: pd.DataFrame) -> pd.Series:
    """
    Parameters:
        df: pd.DataFrame with columns ['Open', 'High', 'Low', 'Close', 'Volume']
    Returns:
        pd.Series of signals: 'BUY', 'SELL', or None
    """
    signals = pd.Series(index=df.index, dtype=object)
    
{logic}
    
    return signals
'''

BLANK_TEMPLATE = '''"""
Custom Strategy
Write your custom trading strategy here.
"""

import pandas as pd
import numpy as np

STRATEGY_NAME = "Custom Strategy"
STRATEGY_DESCRIPTION = "Describe your strategy here."


def evaluate(df: pd.DataFrame) -> pd.Series:
    """
    Parameters:
        df: pd.DataFrame with columns ['Open', 'High', 'Low', 'Close', 'Volume']
    Returns:
        pd.Series of signals: 'BUY', 'SELL', or None
    """
    signals = pd.Series(index=df.index, dtype=object)
    
    # === Your strategy logic here ===
    # Available columns: df['Open'], df['High'], df['Low'], df['Close'], df['Volume']
    #
    # Common indicators you can compute:
    # SMA:  sma20 = df['Close'].rolling(20).mean()
    # EMA:  ema20 = df['Close'].ewm(span=20, adjust=False).mean()
    # RSI:  (see helper below)
    # MACD: ema12 = df['Close'].ewm(span=12).mean()
    #       ema26 = df['Close'].ewm(span=26).mean()
    #       macd = ema12 - ema26
    #       signal_line = macd.ewm(span=9).mean()
    #
    # Set signals:
    # signals[buy_condition] = 'BUY'
    # signals[sell_condition] = 'SELL'
    
    return signals
'''


# ============================================================================
# Indicator Helper Code Snippets
# ============================================================================

INDICATOR_SNIPPETS = {
    "sma": "    sma{period} = df['Close'].rolling({period}).mean()",
    "ema": "    ema{period} = df['Close'].ewm(span={period}, adjust=False).mean()",
    "rsi": """    # RSI Calculation
    delta = df['Close'].diff()
    gain = delta.where(delta > 0, 0.0)
    loss = -delta.where(delta < 0, 0.0)
    avg_gain = gain.rolling({period}).mean()
    avg_loss = loss.rolling({period}).mean()
    rs = avg_gain / avg_loss
    rsi = 100 - (100 / (1 + rs))""",
    "macd": """    # MACD Calculation
    ema_fast = df['Close'].ewm(span={fast}, adjust=False).mean()
    ema_slow = df['Close'].ewm(span={slow}, adjust=False).mean()
    macd_line = ema_fast - ema_slow
    signal_line = macd_line.ewm(span={signal}, adjust=False).mean()
    macd_hist = macd_line - signal_line""",
    "bollinger": """    # Bollinger Bands
    bb_mid = df['Close'].rolling({period}).mean()
    bb_std = df['Close'].rolling({period}).std()
    bb_upper = bb_mid + ({std_dev} * bb_std)
    bb_lower = bb_mid - ({std_dev} * bb_std)""",
    "supertrend": """    # Supertrend Calculation
    atr_period = {period}
    multiplier = {multiplier}
    hl2 = (df['High'] + df['Low']) / 2
    tr = pd.concat([
        df['High'] - df['Low'],
        (df['High'] - df['Close'].shift()).abs(),
        (df['Low'] - df['Close'].shift()).abs()
    ], axis=1).max(axis=1)
    atr = tr.rolling(atr_period).mean()
    upper_band = hl2 + (multiplier * atr)
    lower_band = hl2 - (multiplier * atr)
    
    supertrend = pd.Series(index=df.index, dtype=float)
    direction = pd.Series(index=df.index, dtype=float)
    supertrend.iloc[atr_period] = upper_band.iloc[atr_period]
    direction.iloc[atr_period] = -1
    
    for i in range(atr_period + 1, len(df)):
        if df['Close'].iloc[i] > supertrend.iloc[i-1]:
            supertrend.iloc[i] = max(lower_band.iloc[i], supertrend.iloc[i-1]) if direction.iloc[i-1] == 1 else lower_band.iloc[i]
            direction.iloc[i] = 1
        else:
            supertrend.iloc[i] = min(upper_band.iloc[i], supertrend.iloc[i-1]) if direction.iloc[i-1] == -1 else upper_band.iloc[i]
            direction.iloc[i] = -1""",
    "atr": """    # ATR Calculation
    tr = pd.concat([
        df['High'] - df['Low'],
        (df['High'] - df['Close'].shift()).abs(),
        (df['Low'] - df['Close'].shift()).abs()
    ], axis=1).max(axis=1)
    atr = tr.rolling({period}).mean()""",
    "vwap": """    # VWAP Calculation
    typical_price = (df['High'] + df['Low'] + df['Close']) / 3
    vwap = (typical_price * df['Volume']).cumsum() / df['Volume'].cumsum()""",
    "volume_spike": """    # Volume Spike Detection
    avg_volume = df['Volume'].rolling({period}).mean()
    volume_ratio = df['Volume'] / avg_volume""",
    "stochastic": """    # Stochastic Oscillator
    lowest_low = df['Low'].rolling({period}).min()
    highest_high = df['High'].rolling({period}).max()
    stoch_k = 100 * (df['Close'] - lowest_low) / (highest_high - lowest_low)
    stoch_d = stoch_k.rolling(3).mean()""",
}


# ============================================================================
# Offline Rule-Based Strategy Generator (Always Available)
# ============================================================================

def _parse_number(text: str, default: int = 14) -> int:
    """Extract a number from text."""
    nums = re.findall(r'\d+', text)
    return int(nums[0]) if nums else default


def _generate_offline(description: str) -> dict:
    """
    Parse a natural language strategy description and generate Python code
    using rule-based pattern matching. Works without any API key.
    
    Supports: EMA, SMA, RSI, MACD, Bollinger Bands, Supertrend, Volume,
    Stochastic, VWAP, ATR, and common candlestick patterns.
    """
    desc_lower = description.lower()
    code_lines = []
    buy_conditions = []
    sell_conditions = []
    name_parts = []
    
    # ---- EMA Crossover Detection ----
    ema_matches = re.findall(r'(\d+)\s*(?:period|day|candle)?\s*ema', desc_lower)
    if not ema_matches:
        ema_matches = re.findall(r'ema\s*(\d+)', desc_lower)
    
    if len(ema_matches) >= 2:
        fast_p, slow_p = sorted([int(x) for x in ema_matches[:2]])
        code_lines.append(f"    ema{fast_p} = df['Close'].ewm(span={fast_p}, adjust=False).mean()")
        code_lines.append(f"    ema{slow_p} = df['Close'].ewm(span={slow_p}, adjust=False).mean()")
        
        if "cross" in desc_lower or "above" in desc_lower:
            buy_conditions.append(f"(ema{fast_p} > ema{slow_p}) & (ema{fast_p}.shift(1) <= ema{slow_p}.shift(1))")
            sell_conditions.append(f"(ema{fast_p} < ema{slow_p}) & (ema{fast_p}.shift(1) >= ema{slow_p}.shift(1))")
        else:
            buy_conditions.append(f"(ema{fast_p} > ema{slow_p}) & (ema{fast_p}.shift(1) <= ema{slow_p}.shift(1))")
            sell_conditions.append(f"(ema{fast_p} < ema{slow_p}) & (ema{fast_p}.shift(1) >= ema{slow_p}.shift(1))")
        
        name_parts.append(f"EMA {fast_p}/{slow_p} Crossover")
    
    elif len(ema_matches) == 1:
        period = int(ema_matches[0])
        code_lines.append(f"    ema{period} = df['Close'].ewm(span={period}, adjust=False).mean()")
        
        if "above" in desc_lower or "over" in desc_lower:
            buy_conditions.append(f"(df['Close'] > ema{period}) & (df['Close'].shift(1) <= ema{period}.shift(1))")
            sell_conditions.append(f"(df['Close'] < ema{period}) & (df['Close'].shift(1) >= ema{period}.shift(1))")
        elif "below" in desc_lower or "under" in desc_lower:
            buy_conditions.append(f"(df['Close'] < ema{period})")
            sell_conditions.append(f"(df['Close'] > ema{period})")
        else:
            buy_conditions.append(f"(df['Close'] > ema{period}) & (df['Close'].shift(1) <= ema{period}.shift(1))")
            sell_conditions.append(f"(df['Close'] < ema{period}) & (df['Close'].shift(1) >= ema{period}.shift(1))")
        
        name_parts.append(f"EMA {period}")
    
    # ---- SMA Crossover Detection ----
    sma_matches = re.findall(r'(\d+)\s*(?:period|day|candle)?\s*sma', desc_lower)
    if not sma_matches:
        sma_matches = re.findall(r'sma\s*(\d+)', desc_lower)
    
    if len(sma_matches) >= 2:
        fast_p, slow_p = sorted([int(x) for x in sma_matches[:2]])
        code_lines.append(f"    sma{fast_p} = df['Close'].rolling({fast_p}).mean()")
        code_lines.append(f"    sma{slow_p} = df['Close'].rolling({slow_p}).mean()")
        buy_conditions.append(f"(sma{fast_p} > sma{slow_p}) & (sma{fast_p}.shift(1) <= sma{slow_p}.shift(1))")
        sell_conditions.append(f"(sma{fast_p} < sma{slow_p}) & (sma{fast_p}.shift(1) >= sma{slow_p}.shift(1))")
        name_parts.append(f"SMA {fast_p}/{slow_p} Crossover")
    
    elif len(sma_matches) == 1:
        period = int(sma_matches[0])
        code_lines.append(f"    sma{period} = df['Close'].rolling({period}).mean()")
        buy_conditions.append(f"(df['Close'] > sma{period}) & (df['Close'].shift(1) <= sma{period}.shift(1))")
        sell_conditions.append(f"(df['Close'] < sma{period}) & (df['Close'].shift(1) >= sma{period}.shift(1))")
        name_parts.append(f"SMA {period}")
    
    # ---- RSI Detection ----
    if "rsi" in desc_lower:
        rsi_period = 14
        rsi_p_match = re.findall(r'rsi\s*(?:\(?\s*(\d+)\s*\)?)?', desc_lower)
        if rsi_p_match and rsi_p_match[0]:
            rsi_period = int(rsi_p_match[0])
        
        code_lines.append(f"    # RSI Calculation")
        code_lines.append(f"    delta = df['Close'].diff()")
        code_lines.append(f"    gain = delta.where(delta > 0, 0.0)")
        code_lines.append(f"    loss = -delta.where(delta < 0, 0.0)")
        code_lines.append(f"    avg_gain = gain.rolling({rsi_period}).mean()")
        code_lines.append(f"    avg_loss = loss.rolling({rsi_period}).mean()")
        code_lines.append(f"    rs = avg_gain / avg_loss")
        code_lines.append(f"    rsi = 100 - (100 / (1 + rs))")
        
        # Extract thresholds
        ob_level = 70
        os_level = 30
        ob_match = re.findall(r'(?:overbought|above|over|greater)\s*(?:than\s*)?(\d+)', desc_lower)
        os_match = re.findall(r'(?:oversold|below|under|less)\s*(?:than\s*)?(\d+)', desc_lower)
        if ob_match:
            ob_level = int(ob_match[0])
        if os_match:
            os_level = int(os_match[0])
        
        buy_conditions.append(f"(rsi < {os_level}) & (rsi.shift(1) >= {os_level})")
        sell_conditions.append(f"(rsi > {ob_level}) & (rsi.shift(1) <= {ob_level})")
        name_parts.append(f"RSI({rsi_period})")
    
    # ---- MACD Detection ----
    if "macd" in desc_lower:
        fast, slow, sig = 12, 26, 9
        code_lines.append(f"    # MACD Calculation")
        code_lines.append(f"    ema_fast = df['Close'].ewm(span={fast}, adjust=False).mean()")
        code_lines.append(f"    ema_slow = df['Close'].ewm(span={slow}, adjust=False).mean()")
        code_lines.append(f"    macd_line = ema_fast - ema_slow")
        code_lines.append(f"    signal_line = macd_line.ewm(span={sig}, adjust=False).mean()")
        code_lines.append(f"    macd_hist = macd_line - signal_line")
        
        buy_conditions.append(f"(macd_line > signal_line) & (macd_line.shift(1) <= signal_line.shift(1))")
        sell_conditions.append(f"(macd_line < signal_line) & (macd_line.shift(1) >= signal_line.shift(1))")
        name_parts.append("MACD")
    
    # ---- Bollinger Bands Detection ----
    if "bollinger" in desc_lower or "bb" in desc_lower:
        bb_period = 20
        bb_std = 2
        code_lines.append(f"    # Bollinger Bands")
        code_lines.append(f"    bb_mid = df['Close'].rolling({bb_period}).mean()")
        code_lines.append(f"    bb_std = df['Close'].rolling({bb_period}).std()")
        code_lines.append(f"    bb_upper = bb_mid + ({bb_std} * bb_std)")
        code_lines.append(f"    bb_lower = bb_mid - ({bb_std} * bb_std)")
        
        buy_conditions.append(f"(df['Close'] < bb_lower) & (df['Close'].shift(1) >= bb_lower.shift(1))")
        sell_conditions.append(f"(df['Close'] > bb_upper) & (df['Close'].shift(1) <= bb_upper.shift(1))")
        name_parts.append("Bollinger Bands")
    
    # ---- Supertrend Detection ----
    if "supertrend" in desc_lower or "super trend" in desc_lower:
        st_period = 10
        st_mult = 3.0
        code_lines.append(f"    # Supertrend Calculation")
        code_lines.append(f"    atr_period = {st_period}")
        code_lines.append(f"    multiplier = {st_mult}")
        code_lines.append(f"    hl2 = (df['High'] + df['Low']) / 2")
        code_lines.append(f"    tr = pd.concat([")
        code_lines.append(f"        df['High'] - df['Low'],")
        code_lines.append(f"        (df['High'] - df['Close'].shift()).abs(),")
        code_lines.append(f"        (df['Low'] - df['Close'].shift()).abs()")
        code_lines.append(f"    ], axis=1).max(axis=1)")
        code_lines.append(f"    atr = tr.rolling(atr_period).mean()")
        code_lines.append(f"    upper_band = hl2 + (multiplier * atr)")
        code_lines.append(f"    lower_band = hl2 - (multiplier * atr)")
        code_lines.append(f"    ")
        code_lines.append(f"    supertrend = pd.Series(index=df.index, dtype=float)")
        code_lines.append(f"    direction = pd.Series(index=df.index, dtype=float)")
        code_lines.append(f"    supertrend.iloc[atr_period] = upper_band.iloc[atr_period]")
        code_lines.append(f"    direction.iloc[atr_period] = -1")
        code_lines.append(f"    ")
        code_lines.append(f"    for i in range(atr_period + 1, len(df)):")
        code_lines.append(f"        if df['Close'].iloc[i] > supertrend.iloc[i-1]:")
        code_lines.append(f"            supertrend.iloc[i] = max(lower_band.iloc[i], supertrend.iloc[i-1]) if direction.iloc[i-1] == 1 else lower_band.iloc[i]")
        code_lines.append(f"            direction.iloc[i] = 1")
        code_lines.append(f"        else:")
        code_lines.append(f"            supertrend.iloc[i] = min(upper_band.iloc[i], supertrend.iloc[i-1]) if direction.iloc[i-1] == -1 else upper_band.iloc[i]")
        code_lines.append(f"            direction.iloc[i] = -1")
        
        buy_conditions.append(f"(direction == 1) & (direction.shift(1) == -1)")
        sell_conditions.append(f"(direction == -1) & (direction.shift(1) == 1)")
        name_parts.append("Supertrend")
    
    # ---- Volume Spike Detection ----
    if "volume" in desc_lower and ("spike" in desc_lower or "breakout" in desc_lower or "high" in desc_lower):
        vol_period = 20
        vol_mult = 2
        code_lines.append(f"    # Volume Spike Detection")
        code_lines.append(f"    avg_volume = df['Volume'].rolling({vol_period}).mean()")
        code_lines.append(f"    volume_spike = df['Volume'] > ({vol_mult} * avg_volume)")
        
        if buy_conditions:
            buy_conditions[-1] = f"({buy_conditions[-1]}) & volume_spike"
        else:
            buy_conditions.append(f"volume_spike & (df['Close'] > df['Open'])")
        
        if sell_conditions:
            sell_conditions[-1] = f"({sell_conditions[-1]}) & volume_spike"
        else:
            sell_conditions.append(f"volume_spike & (df['Close'] < df['Open'])")
        
        name_parts.append("Volume Spike")
    
    # ---- Price Breakout (52-week high/low or N-day high/low) ----
    if "breakout" in desc_lower or "52" in desc_lower or "high" in desc_lower and "week" in desc_lower:
        breakout_period = 252 if "52" in desc_lower else 20
        code_lines.append(f"    # Price Breakout")
        code_lines.append(f"    highest = df['High'].rolling({breakout_period}).max()")
        code_lines.append(f"    lowest = df['Low'].rolling({breakout_period}).min()")
        
        buy_conditions.append(f"(df['Close'] >= highest)")
        sell_conditions.append(f"(df['Close'] <= lowest)")
        name_parts.append("Price Breakout")
    
    # ---- Stochastic Oscillator ----
    if "stochastic" in desc_lower or "stoch" in desc_lower:
        stoch_period = 14
        code_lines.append(f"    # Stochastic Oscillator")
        code_lines.append(f"    lowest_low = df['Low'].rolling({stoch_period}).min()")
        code_lines.append(f"    highest_high = df['High'].rolling({stoch_period}).max()")
        code_lines.append(f"    stoch_k = 100 * (df['Close'] - lowest_low) / (highest_high - lowest_low)")
        code_lines.append(f"    stoch_d = stoch_k.rolling(3).mean()")
        
        buy_conditions.append(f"(stoch_k < 20) & (stoch_k > stoch_d) & (stoch_k.shift(1) <= stoch_d.shift(1))")
        sell_conditions.append(f"(stoch_k > 80) & (stoch_k < stoch_d) & (stoch_k.shift(1) >= stoch_d.shift(1))")
        name_parts.append("Stochastic")
    
    # ---- Candlestick: Hammer ----
    if "hammer" in desc_lower:
        code_lines.append(f"    # Hammer Candlestick Pattern")
        code_lines.append(f"    body = (df['Close'] - df['Open']).abs()")
        code_lines.append(f"    lower_shadow = pd.concat([df['Open'], df['Close']], axis=1).min(axis=1) - df['Low']")
        code_lines.append(f"    upper_shadow = df['High'] - pd.concat([df['Open'], df['Close']], axis=1).max(axis=1)")
        code_lines.append(f"    is_hammer = (lower_shadow > 2 * body) & (upper_shadow < body * 0.3)")
        
        buy_conditions.append(f"is_hammer & (df['Close'] > df['Open'])")
        name_parts.append("Hammer")
    
    # ---- Candlestick: Engulfing ----
    if "engulfing" in desc_lower:
        code_lines.append(f"    # Engulfing Candlestick Pattern")
        code_lines.append(f"    bullish_engulfing = (df['Close'].shift(1) < df['Open'].shift(1)) & (df['Close'] > df['Open']) & (df['Open'] <= df['Close'].shift(1)) & (df['Close'] >= df['Open'].shift(1))")
        code_lines.append(f"    bearish_engulfing = (df['Close'].shift(1) > df['Open'].shift(1)) & (df['Close'] < df['Open']) & (df['Open'] >= df['Close'].shift(1)) & (df['Close'] <= df['Open'].shift(1))")
        
        buy_conditions.append(f"bullish_engulfing")
        sell_conditions.append(f"bearish_engulfing")
        name_parts.append("Engulfing")
    
    # ---- Fallback: if nothing detected ----
    if not code_lines and not buy_conditions:
        return {
            "success": False,
            "error": "Could not parse the strategy description. Please try using keywords like: EMA, SMA, RSI, MACD, Bollinger Bands, Supertrend, Volume, Stochastic, Hammer, Engulfing, Breakout.",
            "code": "",
            "method": "offline"
        }
    
    # Build the final code
    code_lines.append("")
    
    if buy_conditions:
        combined_buy = " & ".join([f"({c})" for c in buy_conditions]) if len(buy_conditions) > 1 else buy_conditions[0]
        code_lines.append(f"    buy_condition = {combined_buy}")
        code_lines.append(f"    signals[buy_condition] = 'BUY'")
    
    code_lines.append("")
    
    if sell_conditions:
        combined_sell = " & ".join([f"({c})" for c in sell_conditions]) if len(sell_conditions) > 1 else sell_conditions[0]
        code_lines.append(f"    sell_condition = {combined_sell}")
        code_lines.append(f"    signals[sell_condition] = 'SELL'")
    
    logic_code = "\n".join(code_lines)
    strategy_name = " + ".join(name_parts) if name_parts else "Custom Strategy"
    
    full_code = STRATEGY_TEMPLATE.format(
        name=strategy_name,
        description=description.strip(),
        logic=logic_code
    )
    
    return {
        "success": True,
        "error": None,
        "code": full_code,
        "name": strategy_name,
        "method": "offline"
    }


# ============================================================================
# Google Gemini API Integration
# ============================================================================

def _generate_with_gemini(description: str, api_key: str) -> dict:
    """
    Generate strategy code using Google Gemini API.
    """
    try:
        from google import genai
        
        client = genai.Client(api_key=api_key)
        
        prompt = f"""You are an expert quantitative trading strategy developer. Convert the following natural language trading strategy description into clean, working Python code.

STRICT RULES:
1. The code must follow this EXACT format - a function called `evaluate` that takes a pandas DataFrame and returns a pd.Series of signals:

```python
import pandas as pd
import numpy as np

STRATEGY_NAME = "Strategy Name Here"
STRATEGY_DESCRIPTION = "Brief description"

def evaluate(df: pd.DataFrame) -> pd.Series:
    signals = pd.Series(index=df.index, dtype=object)
    
    # Your indicator calculations here...
    # Available columns: df['Open'], df['High'], df['Low'], df['Close'], df['Volume']
    
    # Set signals:
    # signals[buy_condition] = 'BUY'
    # signals[sell_condition] = 'SELL'
    
    return signals
```

2. Only use pandas and numpy (no external libraries like ta-lib or pandas-ta).
3. Calculate ALL indicators manually from OHLCV data.
4. Use proper vectorized pandas operations (no loops unless absolutely necessary).
5. Handle edge cases (NaN from rolling windows, division by zero).
6. Return ONLY the Python code, no explanations or markdown.

STRATEGY DESCRIPTION:
{description}

Generate the complete Python code:"""
        
        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=prompt
        )
        
        code = response.text.strip()
        
        # Clean up markdown code blocks if present
        if "```python" in code:
            code = code.split("```python")[1].split("```")[0].strip()
        elif "```" in code:
            code = code.split("```")[1].split("```")[0].strip()
        
        # Add docstring if missing
        if '"""' not in code[:50]:
            code = f'"""\n{description}\n"""\n\n' + code
        
        # Validate the code has the required structure
        if "def evaluate" not in code:
            return {
                "success": False,
                "error": "AI generated code without the required 'evaluate' function. Falling back to offline generator.",
                "code": code,
                "method": "gemini"
            }
        
        return {
            "success": True,
            "error": None,
            "code": code,
            "name": "AI Generated Strategy",
            "method": "gemini"
        }
    
    except ImportError:
        return {
            "success": False,
            "error": "google-genai package not installed. Using offline generator.",
            "code": "",
            "method": "gemini"
        }
    except Exception as e:
        return {
            "success": False,
            "error": f"Gemini API error: {str(e)}. Falling back to offline generator.",
            "code": "",
            "method": "gemini"
        }


# ============================================================================
# Public API
# ============================================================================

def generate_strategy(description: str, api_key: str = "") -> dict:
    """
    Generate a trading strategy from natural language description.
    
    Tries Gemini API first (if api_key provided), falls back to offline parser.
    
    Parameters:
        description: Natural language strategy description
        api_key: Optional Google Gemini API key
    
    Returns:
        dict with keys: success, error, code, name, method
    """
    # Try Gemini first if API key is available
    if api_key and api_key.strip():
        result = _generate_with_gemini(description, api_key.strip())
        if result["success"]:
            return result
        # Fall through to offline if Gemini fails
    
    # Offline fallback
    return _generate_offline(description)


def get_blank_template() -> str:
    """Return a blank strategy template for the editor."""
    return BLANK_TEMPLATE
