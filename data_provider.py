"""
data_provider.py - Stock Universe Manager & Yahoo Finance Data Fetcher

Manages NSE/BSE stock universes (Nifty 50, Nifty 500, F&O, etc.)
and fetches OHLCV data via yfinance with caching support.
"""

import yfinance as yf
import pandas as pd
import json
import os
import time
from pathlib import Path
from datetime import datetime, timedelta

# ============================================================================
# Stock Universe Definitions
# ============================================================================

# Nifty 50 stocks (as of 2024-2025)
NIFTY_50 = [
    "ADANIENT", "ADANIPORTS", "APOLLOHOSP", "ASIANPAINT", "AXISBANK",
    "BAJAJ-AUTO", "BAJFINANCE", "BAJAJFINSV", "BEL", "BPCL",
    "BHARTIARTL", "BRITANNIA", "CIPLA", "COALINDIA", "DIVISLAB",
    "DRREDDY", "EICHERMOT", "ETERNAL", "GRASIM", "HCLTECH",
    "HDFCBANK", "HDFCLIFE", "HEROMOTOCO", "HINDALCO", "HINDUNILVR",
    "ICICIBANK", "ITC", "INDUSINDBK", "INFY", "JSWSTEEL",
    "KOTAKBANK", "LT", "M&M", "MARUTI", "NTPC",
    "NESTLEIND", "ONGC", "POWERGRID", "RELIANCE", "SBILIFE",
    "SBIN", "SUNPHARMA", "TCS", "TATACONSUM", "TATAMOTORS",
    "TATASTEEL", "TECHM", "TITAN", "TRENT", "ULTRACEMCO",
    "WIPRO"
]

# Nifty Next 50 stocks
NIFTY_NEXT_50 = [
    "ABB", "ADANIGREEN", "ADANIPOWER", "AMBUJACEM", "ATGL",
    "BANKBARODA", "BOSCHLTD", "CANBK", "CHOLAFIN", "COLPAL",
    "DLF", "DABUR", "GAIL", "GODREJCP", "HAVELLS",
    "HAL", "ICICIPRULI", "ICICIGI", "IOC", "IRCTC",
    "IRFC", "INDIGO", "JIOFIN", "JINDALSTEL", "JSL",
    "LICI", "LODHA", "LTIM", "LUPIN", "MANKIND",
    "MARICO", "MAXHEALTH", "MOTHERSON", "NHPC", "NAUKRI",
    "PFC", "PIDILITIND", "PNB", "RECLTD", "SBICARD",
    "SHREECEM", "SIEMENS", "SRF", "TORNTPHARM", "TVSMOTOR",
    "UNITDSPR", "VBL", "VEDL", "ZOMATO", "ZYDUSLIFE"
]

# F&O Universe (Most liquid derivative stocks)
FNO_UNIVERSE = [
    "AARTIIND", "ABB", "ABBOTINDIA", "ABCAPITAL", "ABFRL",
    "ACC", "ADANIENT", "ADANIPORTS", "ALKEM", "AMBUJACEM",
    "APOLLOHOSP", "APOLLOTYRE", "ASHOKLEY", "ASIANPAINT", "ASTRAL",
    "ATUL", "AUBANK", "AUROPHARMA", "AXISBANK", "BAJAJ-AUTO",
    "BAJAJFINSV", "BAJFINANCE", "BALKRISIND", "BANDHANBNK", "BANKBARODA",
    "BATAINDIA", "BEL", "BERGEPAINT", "BHARATFORG", "BHARTIARTL",
    "BHEL", "BIOCON", "BOSCHLTD", "BPCL", "BRITANNIA",
    "BSOFT", "CANBK", "CANFINHOME", "CHAMBLFERT", "CHOLAFIN",
    "CIPLA", "COALINDIA", "COFORGE", "COLPAL", "CONCOR",
    "COROMANDEL", "CROMPTON", "CUB", "CUMMINSIND", "DABUR",
    "DALBHARAT", "DEEPAKNTR", "DIVISLAB", "DIXON", "DLF",
    "DRREDDY", "EICHERMOT", "ESCORTS", "EXIDEIND", "FEDERALBNK",
    "GAIL", "GLENMARK", "GMRINFRA", "GNFC", "GODREJCP",
    "GODREJPROP", "GRANULES", "GRASIM", "GUJGASLTD", "HAL",
    "HAVELLS", "HCLTECH", "HDFCAMC", "HDFCBANK", "HDFCLIFE",
    "HEROMOTOCO", "HINDALCO", "HINDCOPPER", "HINDPETRO", "HINDUNILVR",
    "ICICIBANK", "ICICIGI", "ICICIPRULI", "IDEA", "IDFC",
    "IDFCFIRSTB", "IEX", "IGL", "INDHOTEL", "INDIACEM",
    "INDIAMART", "INDIGO", "INDUSINDBK", "INDUSTOWER", "INFY",
    "IOC", "IPCALAB", "IRCTC", "ITC", "JINDALSTEL",
    "JKCEMENT", "JSWSTEEL", "JUBLFOOD", "KOTAKBANK", "LALPATHLAB",
    "LAURUSLABS", "LICHSGFIN", "LICI", "LT", "LTIM",
    "LTTS", "LUPIN", "M&M", "M&MFIN", "MANAPPURAM",
    "MARICO", "MARUTI", "MCDOWELL-N", "MCX", "METROPOLIS",
    "MFSL", "MGL", "MOTHERSON", "MPHASIS", "MRF",
    "MUTHOOTFIN", "NATIONALUM", "NAUKRI", "NAVINFLUOR", "NESTLEIND",
    "NHPC", "NMDC", "NTPC", "OBEROIRLTY", "OFSS",
    "ONGC", "PAGEIND", "PEL", "PERSISTENT", "PETRONET",
    "PFC", "PIDILITIND", "PIIND", "PNB", "POLYCAB",
    "POWERGRID", "PVRINOX", "RAMCOCEM", "RBLBANK", "RECLTD",
    "RELIANCE", "SAIL", "SBICARD", "SBILIFE", "SBIN",
    "SHREECEM", "SHRIRAMFIN", "SIEMENS", "SRF", "SUNPHARMA",
    "SUNTV", "SYNGENE", "TATACHEM", "TATACOMM", "TATACONSUM",
    "TATAELXSI", "TATAMOTORS", "TATAPOWER", "TATASTEEL", "TCS",
    "TECHM", "TITAN", "TORNTPHARM", "TRENT", "TVSMOTOR",
    "UBL", "ULTRACEMCO", "UNITDSPR", "UPL", "VBL",
    "VEDL", "VOLTAS", "WIPRO", "ZYDUSLIFE"
]

# BSE Sensex 30
BSE_SENSEX_30 = [
    "ADANIENT", "ASIANPAINT", "AXISBANK", "BAJAJ-AUTO", "BAJFINANCE",
    "BHARTIARTL", "ETERNAL", "HCLTECH", "HDFCBANK", "HEROMOTOCO",
    "HINDALCO", "HINDUNILVR", "ICICIBANK", "INDUSINDBK", "INFY",
    "ITC", "JSWSTEEL", "KOTAKBANK", "LT", "M&M",
    "MARUTI", "NESTLEIND", "NTPC", "POWERGRID", "RELIANCE",
    "SBIN", "SUNPHARMA", "TATAMOTORS", "TATASTEEL", "TCS",
    "TECHM", "TITAN", "TRENT", "ULTRACEMCO", "WIPRO"
]

# Comprehensive All NSE Stocks (500+ Liquid & Benchmark NSE Equities)
ALL_NSE_STOCKS = sorted(list(set(
    NIFTY_50 + NIFTY_NEXT_50 + FNO_UNIVERSE + [
        "3MINDIA", "AARTIDRUGS", "AAVAS", "ABSLAMC", "ACE", "ACTIONCONST",
        "AETHER", "AFFLE", "AJANTPHARM", "AKZOINDIA", "ALKYLAMINE", "ALLCARGO",
        "ALOKINDS", "AMBER", "AMRUTANJAN", "ANANTRAJ", "ANGELONE", "ANURAS",
        "APARINDS", "APLAPOLLO", "APLLTD", "APTUS", "ARCHEAN", "ARE&M",
        "ASAHIINDIA", "ASTERDM", "ASTRAL", "ASTRAZEN", "ATUL", "AURIONPRO",
        "AVANTIFEED", "AWL", "BAJAJCON", "BAJAJELEC", "BAJAJHLDNG", "BALAMINES",
        "BALMLAWRIE", "BALRAMCHIN", "BANCOINDIA", "BANKINDIA", "BECTORFOOD",
        "BEDMUTHA", "BEML", "BEPL", "BHARATWIRE", "BBL", "BIKAJI", "BIRLACORPN",
        "BLS", "BLUESTARCO", "BORORENEW", "BRIGADE", "BSL", "CAMPUS",
        "CANFINHOME", "CAPL", "CARBORUNIV", "CASTROLIND", "CCL", "CEATLTD",
        "CENTRALBK", "CENTUM", "CENTURYPLY", "CENTURYTEX", "CERA", "CESC",
        "CGPOWER", "CHALET", "CHAMBLFERT", "CHEMCON", "CHEMPLASTS", "CHENNPETRO",
        "CHOICEIN", "CHOLAFIN", "CHOLAHLDNG", "CIEINDIA", "CLEAN", "CMSINFO",
        "COCHINSHIP", "COFORGE", "CRAFTSMAN", "CREDITACC", "CRISIL", "CROMPTON",
        "CSBBANK", "CYIENT", "DATAPATTNS", "DCBBANK", "DCMSHRIRAM", "DEEPAKFERT",
        "DELHIVERY", "DEVYANI", "DHANI", "DHANUKA", "DISHTV", "DIVGIITTS",
        "DIXON", "DODLA", "DOMS", "DREDGECORP", "ECLERX", "EDELWEISS",
        "EIDPARRY", "EIHOTEL", "ELECON", "ELGIEQUIP", "EMAMILTD", "EMKAY",
        "ENDURANCE", "ENGINERSIN", "EPIGRAL", "EPL", "ERIS", "ESAFSFB",
        "FDC", "FEDFINA", "FINCABLES", "FINEORG", "FINPIPE", "FIVESTAR",
        "FORTIS", "FSL", "GABRIEL", "GARFIBRES", "GATEWAY", "GENUSPOWER",
        "GEOJITFSL", "GLAND", "GLAXO", "GLENMARK", "GLOBAL", "GLOBUSSPR",
        "GMDCLTD", "GNFC", "GOCOLORS", "GODFRYPHLP", "GOKEX", "GPIL",
        "GRINDWELL", "GRSE", "GSFC", "GSPL", "GULFOILLUB", "HAPPYFORGE",
        "HAPPSTMNDS", "HATHWAY", "HATSUN", "HEG", "HEIDELBERG", "HEMIPROP",
        "HERANBA", "HFCL", "HGINFRA", "HIKAL", "HINDCOPPER", "HINDOILEXP",
        "HINDZINC", "HOMEFIRST", "HONAUT", "HUDCO", "IDBI", "IDFCFIRSTB",
        "IFBIND", "IFCI", "IIFL", "IMAGICAA", "INDGN", "INDIACEM",
        "INDIAGLYCO", "INDIAMART", "INDIASHLTR", "INDIGO", "INDIGOPNTS",
        "INDOCO", "INDORAMA", "INDOSTAR", "INFIBEAM", "INGERRAND", "INOXINDIA",
        "INOXWIND", "IOB", "IPCALAB", "IRB", "IRCON", "IRCTC", "IREDA",
        "IRFC", "ISEC", "ITC", "ITI", "J&KBANK", "JAICORPLTD", "JAMNAAUTO",
        "JBCHEPHARM", "JINDALSAW", "JINDWORLD", "JIOFIN", "JKCEMENT",
        "JKLAKSHMI", "JKPAPER", "JKTYRE", "JMFINANCIL", "JPASSOCIAT",
        "JSWENERGY", "JSWINFRA", "JUBLFOOD", "JUBLINGREA", "JUBLPHARMA",
        "JUSTDIAL", "JYOTHYLAB", "KAJARIACER", "KALAMANDIR", "KALPATPOWR",
        "KALYANKJIL", "KANSAINER", "KARURVYSYA", "KAYNES", "KEC", "KEI",
        "KFINTECH", "KNRCON", "KPIL", "KPITTECH", "KPRMILL", "KRBL",
        "KSB", "KSCL", "KTKBANK", "L&TFH", "LALPATHLAB", "LATENTVIEW",
        "LEMONTREE", "LINDEINDIA", "LLOYDSME", "LODHA", "LTFOODS", "LUPIN",
        "LXCHEM", "MAHABANK", "MAHLIFE", "MAHLOG", "MAHSCOOTER", "MANAPPURAM",
        "MANKIND", "MAPMYINDIA", "MARICO", "MARKSANS", "MASTEK", "MAXHEALTH",
        "MAZDOCK", "MEDANTA", "MEDIASSIST", "METROPOLIS", "MFSL", "MGL",
        "MIDHANI", "MINDACORP", "MMTC", "MOIL", "MOTILALOFS", "MOTHERSON",
        "MPHASIS", "MRF", "MRPL", "MSTCLTD", "MTARTECH", "MUTHOOTFIN",
        "NATCOPHARM", "NATIONALUM", "NAUKRI", "NAVA", "NAVINFLUOR",
        "NBCC", "NCC", "NETWORK18", "NH", "NHPC", "NLCINDIA", "NMDC",
        "NOCIL", "NTPC", "NUVAMA", "NUVOCO", "NYKAA", "OBEROIRLTY",
        "OLECTRA", "OFSS", "OIL", "ORIENTELEC", "PAGEIND", "PAISALO",
        "PATANJALI", "PAYTM", "PCBL", "PERSISTENT", "PETRONET", "PFC",
        "PFIZER", "PGHH", "PHOENIXLTD", "PIDILITIND", "PIIND", "PNB",
        "PNBHOUSING", "PNCINFRA", "POLICYBZR", "POLYCAB", "POLYMED",
        "POONAWALLA", "POWERGRID", "POWERINDIA", "PRAJIND", "PRESTIGE",
        "PRINCEPIPE", "PRSMJOHNSN", "PVRINOX", "QUESS", "RADICO", "RAILTEL",
        "RAIN", "RAJESHEXPO", "RAMCOCEM", "RBA", "RBLBANK", "RCF", "RECLTD",
        "REDINGTON", "RELAXO", "RENUKA", "RITES", "RKFORGE", "ROLEXRINGS",
        "ROUTE", "RRKABEL", "RPOWER", "RPSGVENT", "RTNINDIA", "RVNL",
        "SAFARI", "SAGCEM", "SAIL", "SANDUMA", "SANOFI", "SANSERA", "SAPPHIRE",
        "SAREGAMA", "SBICARD", "SBILIFE", "SBIN", "SCHAEFFLER", "SCHNEIDER",
        "SCI", "SHARDACROP", "SHEL", "SHOPERSTOP", "SHREECEM", "SHRIRAMFIN",
        "SHYAMMETL", "SIEMENS", "SIS", "SJVN", "SKFINDIA", "SOBHA", "SOLARINDS",
        "SONACOMS", "SONATSOFTW", "SOUTHBANK", "SPARC", "STARHEALTH", "SUBROS",
        "SUDARSCHEM", "SUMICHEM", "SUNCLAY", "SUNDARMFIN", "SUNDRMFAST",
        "SUNPHARMA", "SUNTECK", "SUNTV", "SUPRAJIT", "SUPREMEIND", "SUVENPHAR",
        "SUZLON", "SWANENERGY", "SYMPHONY", "SYNGENE", "TARC", "TATACHEM",
        "TATACOMM", "TATACONSUM", "TATAELXSI", "TATAINVEST", "TATAMTRDVR",
        "TATATECH", "TATAPOWER", "TATASTEEL", "TCS", "TEAMLEASE", "TECHM",
        "TEJASNET", "THERMAX", "THOMASCOOK", "TIMKEN", "TIPSMUSIC", "TITAGARH",
        "TITAN", "TORNTPOWER", "TORNTPHARM", "TRENT", "TRIDENT", "TRITURBINE",
        "TTML", "UBL", "UCOBANK", "UJJIVANSFB", "ULTRACEMCO", "UNIONBANK",
        "UNOMINDA", "UPL", "USHAMART", "UTIAMC", "VAIBHAVGBL", "VARROC",
        "VBL", "VEDL", "VENKEYS", "VESUVIUS", "VGUARD", "VIJAYA", "VINATIORGA",
        "VIPIND", "VOLTAMP", "VOLTAS", "VTL", "WELCORP", "WELSPUNLIV",
        "WESTLIFE", "WHIRLPOOL", "WIPRO", "WOCKPHARMA", "YATHARTH", "YESBANK",
        "ZEEL", "ZENSARTECH", "ZOMATO", "ZYDUSLIFE", "ZYDUSWELL"
    ]
)))

# Comprehensive All BSE Stocks (500+ Liquid & Active BSE Equities)
ALL_BSE_STOCKS = sorted(list(set(
    BSE_SENSEX_30 + [
        "ADANIENT", "ADANIPORTS", "ADANIPOWER", "AMBUJACEM", "APOLLOHOSP",
        "ASIANPAINT", "AUROPHARMA", "AXISBANK", "BAJAJ-AUTO", "BAJAJFINSV",
        "BAJFINANCE", "BALKRISIND", "BANKBARODA", "BATAINDIA", "BEL",
        "BHARATFORG", "BHARTIARTL", "BHEL", "BIOCON", "BOSCHLTD", "BPCL",
        "BRITANNIA", "CANBK", "CHOLAFIN", "CIPLA", "COALINDIA", "COLPAL",
        "CONCOR", "COROMANDEL", "CUMMINSIND", "DABUR", "DALBHARAT",
        "DEEPAKNTR", "DIVISLAB", "DIXON", "DLF", "DRREDDY", "EICHERMOT",
        "ESCORTS", "EXIDEIND", "FEDERALBNK", "GAIL", "GLENMARK", "GODREJCP",
        "GODREJPROP", "GRASIM", "GUJGASLTD", "HAL", "HAVELLS", "HCLTECH",
        "HDFCAMC", "HDFCBANK", "HDFCLIFE", "HEROMOTOCO", "HINDALCO",
        "HINDPETRO", "HINDUNILVR", "ICICIBANK", "ICICIGI", "ICICIPRULI",
        "IDFCFIRSTB", "INDHOTEL", "INDIACEM", "INDIGO", "INDUSINDBK",
        "INDUSTOWER", "INFY", "IOC", "IPCALAB", "IRCTC", "ITC",
        "JINDALSTEL", "JKCEMENT", "JSWENERGY", "JSWSTEEL", "JUBLFOOD",
        "KOTAKBANK", "LALPATHLAB", "LAURUSLABS", "LICHSGFIN", "LICI",
        "LT", "LTIM", "LTTS", "LUPIN", "M&M", "M&MFIN", "MARICO",
        "MARUTI", "MCX", "METROPOLIS", "MFSL", "MGL", "MOTHERSON",
        "MPHASIS", "MRF", "MUTHOOTFIN", "NATIONALUM", "NAUKRI",
        "NAVINFLUOR", "NESTLEIND", "NHPC", "NMDC", "NTPC", "OBEROIRLTY",
        "OFSS", "ONGC", "PAGEIND", "PERSISTENT", "PETRONET", "PFC",
        "PIDILITIND", "PIIND", "PNB", "POLYCAB", "POWERGRID", "PVRINOX",
        "RAMCOCEM", "RBLBANK", "RECLTD", "RELIANCE", "SAIL", "SBICARD",
        "SBILIFE", "SBIN", "SHREECEM", "SHRIRAMFIN", "SIEMENS", "SRF",
        "SUNPHARMA", "SUNTV", "SYNGENE", "TATACHEM", "TATACOMM",
        "TATACONSUM", "TATAELXSI", "TATAMOTORS", "TATAPOWER", "TATASTEEL",
        "TCS", "TECHM", "TITAN", "TORNTPHARM", "TORNTPOWER", "TRENT",
        "TVSMOTOR", "UBL", "ULTRACEMCO", "UNIONBANK", "UNITDSPR", "UPL",
        "VBL", "VEDL", "VOLTAS", "WIPRO", "YESBANK", "ZOMATO", "ZYDUSLIFE",
        "3MINDIA", "ABB", "ACC", "AIAENG", "AJANTPHARM", "ALKEM",
        "AMBER", "ANGELONE", "APLAPOLLO", "ASTRAL", "ATUL", "AUBANK",
        "BANDHANBNK", "BAYERCROP", "BDL", "BERGEPAINT", "BIRLACORPN",
        "BLS", "BLUEDART", "BLUESTARCO", "BSE", "BSOFT", "CAMPUS",
        "CARBORUNIV", "CASTROLIND", "CDSL", "CEATLTD", "CENTURYPLY",
        "CENTURYTEX", "CERA", "CESC", "CGPOWER", "CHALET", "CHAMBLFERT",
        "CLEAN", "COCHINSHIP", "COFORGE", "CRISIL", "CROMPTON",
        "CUB", "CYIENT", "DATAPATTNS", "DELHIVERY", "DEVYANI",
        "ECLERX", "EIDPARRY", "EIHOTEL", "ELGIEQUIP", "EMAMILTD",
        "ENDURANCE", "ENGINERSIN", "ERIS", "FACT", "FINEORG",
        "FINPIPE", "FLUOROCHEM", "FORTIS", "FSL", "GLAXO",
        "GMDCLTD", "GNFC", "GODFRYPHLP", "GRANULES", "GRAPHITE",
        "GRINDWELL", "GSFC", "GSPL", "HAPPSTMNDS", "HATHWAY",
        "HATSUN", "HEG", "HONAUT", "HUDCO", "IDBI", "IDFC",
        "IFCI", "IIFL", "INDIAMART", "INDIASHLTR", "INDIGOPNTS",
        "INFIBEAM", "IOB", "IRB", "IRCON", "IREDA", "IRFC",
        "ISEC", "ITI", "J&KBANK", "JBCHEPHARM", "JINDALSAW",
        "JIOFIN", "JKPAPER", "JKTYRE", "JMFINANCIL", "JUBLINGREA",
        "JUSTDIAL", "JYOTHYLAB", "KAJARIACER", "KALYANKJIL", "KANSAINER",
        "KARURVYSYA", "KAYNES", "KEC", "KEI", "KFINTECH",
        "KNRCON", "KPITTECH", "KPRMILL", "KRBL", "KSB",
        "L&TFH", "LATENTVIEW", "LEMONTREE", "LINDEINDIA", "LODHA",
        "MAHABANK", "MAHLIFE", "MANAPPURAM", "MANKIND", "MAPMYINDIA",
        "MASTEK", "MAXHEALTH", "MAZDOCK", "MEDANTA", "MIDHANI",
        "MINDACORP", "MOIL", "MOTILALOFS", "MRPL", "MSTCLTD",
        "MTARTECH", "NATCOPHARM", "NAVA", "NBCC", "NCC",
        "NETWORK18", "NH", "NLCINDIA", "NOCIL", "NUVAMA",
        "NUVOCO", "NYKAA", "OLECTRA", "OIL", "ORIENTELEC",
        "PATANJALI", "PAYTM", "PCBL", "PFIZER", "PGHH",
        "PHOENIXLTD", "PNBHOUSING", "PNCINFRA", "POLICYBZR", "POLYMED",
        "POONAWALLA", "POWERINDIA", "PRAJIND", "PRESTIGE", "PRINCEPIPE",
        "QUESS", "RADICO", "RAILTEL", "RAIN", "RAJESHEXPO",
        "RBA", "RCF", "REDINGTON", "RELAXO", "RENUKA",
        "RITES", "RKFORGE", "ROUTE", "RRKABEL", "RVNL",
        "SAFARI", "SANOFI", "SANSERA", "SAPPHIRE", "SAREGAMA",
        "SCHAEFFLER", "SCHNEIDER", "SCI", "SHOPERSTOP", "SHYAMMETL",
        "SIS", "SJVN", "SKFINDIA", "SOBHA", "SOLARINDS",
        "SONACOMS", "SONATSOFTW", "SOUTHBANK", "STARHEALTH", "SUDARSCHEM",
        "SUMICHEM", "SUNDARMFIN", "SUNDRMFAST", "SUNTECK", "SUPRAJIT",
        "SUPREMEIND", "SUZLON", "SWANENERGY", "SYMPHONY", "TATAINVEST",
        "TATATECH", "TEAMLEASE", "TEJASNET", "THERMAX", "TIMKEN",
        "TITAGARH", "TRIDENT", "TRITURBINE", "TTML", "UCOBANK",
        "UJJIVANSFB", "UNOMINDA", "USHAMART", "UTIAMC", "VARROC",
        "VGUARD", "VIJAYA", "VINATIORGA", "VIPIND", "VOLTAMP",
        "WELCORP", "WELSPUNLIV", "WESTLIFE", "WHIRLPOOL", "YATHARTH",
        "ZEEL", "ZENSARTECH"
    ]
)))

# Universe Registry
UNIVERSES = {
    "nifty50": {"name": "Nifty 50", "stocks": NIFTY_50, "exchange": "NSE"},
    "niftynext50": {"name": "Nifty Next 50", "stocks": NIFTY_NEXT_50, "exchange": "NSE"},
    "nifty100": {"name": "Nifty 100", "stocks": NIFTY_50 + NIFTY_NEXT_50, "exchange": "NSE"},
    "fno": {"name": "F&O Universe", "stocks": FNO_UNIVERSE, "exchange": "NSE"},
    "nifty500": {"name": "Nifty 500", "stocks": list(set(NIFTY_50 + NIFTY_NEXT_50 + FNO_UNIVERSE)), "exchange": "NSE"},
    "all_nse": {"name": "All NSE Stocks (500+)", "stocks": ALL_NSE_STOCKS, "exchange": "NSE"},
    "sensex30": {"name": "BSE Sensex 30", "stocks": BSE_SENSEX_30, "exchange": "BSE"},
    "all_bse": {"name": "All BSE Stocks (500+)", "stocks": ALL_BSE_STOCKS, "exchange": "BSE"},
}

# Timeframe configurations
TIMEFRAMES = {
    "5m": {"label": "5 Minutes", "period": "5d", "interval": "5m"},
    "15m": {"label": "15 Minutes", "period": "60d", "interval": "15m"},
    "30m": {"label": "30 Minutes", "period": "60d", "interval": "30m"},
    "1h": {"label": "1 Hour", "period": "730d", "interval": "1h"},
    "1d": {"label": "Daily", "period": "2y", "interval": "1d"},
    "1wk": {"label": "Weekly", "period": "5y", "interval": "1wk"},
    "1mo": {"label": "Monthly", "period": "10y", "interval": "1mo"},
}


# ============================================================================
# Data Cache Manager
# ============================================================================

CACHE_DIR = Path(__file__).parent / ".cache"
CACHE_DIR.mkdir(exist_ok=True)


def _cache_key(symbol: str, interval: str) -> str:
    """Generate a cache key for a symbol and interval."""
    safe_symbol = symbol.replace(".", "_").replace("&", "_")
    return f"{safe_symbol}_{interval}"


def _cache_path(symbol: str, interval: str) -> Path:
    """Get the cache file path for a symbol and interval."""
    return CACHE_DIR / f"{_cache_key(symbol, interval)}.parquet"


def _cache_valid(path: Path, max_age_minutes: int = 15) -> bool:
    """Check if a cache file exists and is recent enough."""
    if not path.exists():
        return False
    age = time.time() - path.stat().st_mtime
    return age < (max_age_minutes * 60)


# ============================================================================
# Data Fetching
# ============================================================================

def get_symbol_suffix(exchange: str) -> str:
    """Get Yahoo Finance suffix for an exchange."""
    return ".NS" if exchange == "NSE" else ".BO"


def fetch_ohlcv(symbol: str, interval: str = "1d", exchange: str = "NSE", use_cache: bool = True) -> pd.DataFrame:
    """
    Fetch OHLCV data for a single symbol from Yahoo Finance.
    
    Parameters:
        symbol: Stock ticker (e.g., 'RELIANCE')
        interval: Candle interval (e.g., '1d', '15m', '1h')
        exchange: 'NSE' or 'BSE'
        use_cache: Whether to use cached data
    
    Returns:
        pd.DataFrame with columns ['Open', 'High', 'Low', 'Close', 'Volume']
    """
    suffix = get_symbol_suffix(exchange)
    yf_symbol = f"{symbol}{suffix}"
    
    tf_config = TIMEFRAMES.get(interval, TIMEFRAMES["1d"])
    
    # Check cache
    cache_file = _cache_path(yf_symbol, interval)
    if use_cache and _cache_valid(cache_file):
        try:
            df = pd.read_parquet(cache_file)
            if not df.empty:
                return df
        except Exception:
            pass
    
    # Fetch from Yahoo Finance
    try:
        ticker = yf.Ticker(yf_symbol)
        df = ticker.history(period=tf_config["period"], interval=tf_config["interval"])
        
        if df.empty:
            return pd.DataFrame()
        
        # Standardize columns
        df = df[["Open", "High", "Low", "Close", "Volume"]].copy()
        df.dropna(inplace=True)
        
        # Cache the data
        try:
            df.to_parquet(cache_file)
        except Exception:
            pass
        
        return df
    except Exception as e:
        print(f"Error fetching {yf_symbol}: {e}")
        return pd.DataFrame()


def fetch_ohlcv_for_chart(symbol: str, interval: str = "1d", exchange: str = "NSE") -> list:
    """
    Fetch OHLCV data formatted for TradingView Lightweight Charts.
    
    Returns:
        List of dicts with {time, open, high, low, close} and volume list
    """
    df = fetch_ohlcv(symbol, interval, exchange, use_cache=True)
    
    if df.empty:
        return {"candles": [], "volume": []}
    
    candles = []
    volume = []
    
    for idx, row in df.iterrows():
        ts = idx
        if hasattr(ts, 'timestamp'):
            time_val = int(ts.timestamp())
        else:
            time_val = int(pd.Timestamp(ts).timestamp())
        
        candles.append({
            "time": time_val,
            "open": round(float(row["Open"]), 2),
            "high": round(float(row["High"]), 2),
            "low": round(float(row["Low"]), 2),
            "close": round(float(row["Close"]), 2),
        })
        
        volume.append({
            "time": time_val,
            "value": int(row["Volume"]),
            "color": "rgba(0, 168, 107, 0.4)" if row["Close"] >= row["Open"] else "rgba(255, 59, 87, 0.4)"
        })
    
    return {"candles": candles, "volume": volume}


def get_universe_stocks(universe_key, custom_tickers: str = "") -> list:
    """
    Get list of stock tickers for one or more universes (multi-select supported).
    
    Parameters:
        universe_key: String key, comma-separated keys, or list of keys
        custom_tickers: Comma-separated custom ticker string (for 'custom' universe)
    
    Returns:
        List of unique (symbol, exchange) tuples
    """
    if isinstance(universe_key, str):
        keys = [k.strip() for k in universe_key.split(",") if k.strip()]
    elif isinstance(universe_key, (list, tuple, set)):
        keys = list(universe_key)
    else:
        keys = ["nifty50"]

    combined_stocks = []
    seen = set()

    for key in keys:
        if key == "custom":
            tickers = [t.strip().upper() for t in custom_tickers.split(",") if t.strip()]
            for t in tickers:
                if t.endswith(".BO"):
                    pair = (t.replace(".BO", ""), "BSE")
                elif t.endswith(".NS"):
                    pair = (t.replace(".NS", ""), "NSE")
                else:
                    pair = (t, "NSE")
                if pair not in seen:
                    seen.add(pair)
                    combined_stocks.append(pair)
        else:
            universe = UNIVERSES.get(key)
            if universe:
                exchange = universe["exchange"]
                for s in universe["stocks"]:
                    pair = (s, exchange)
                    if pair not in seen:
                        seen.add(pair)
                        combined_stocks.append(pair)

    return combined_stocks


def get_available_universes() -> list:
    """Return list of available stock universes with metadata."""
    result = []
    for key, val in UNIVERSES.items():
        result.append({
            "key": key,
            "name": val["name"],
            "count": len(val["stocks"]),
            "exchange": val["exchange"]
        })
    result.append({
        "key": "custom",
        "name": "Custom Watchlist",
        "count": 0,
        "exchange": "NSE/BSE"
    })
    return result


def get_available_timeframes() -> list:
    """Return list of available timeframes."""
    result = []
    for key, val in TIMEFRAMES.items():
        result.append({
            "key": key,
            "label": val["label"]
        })
    return result


def clear_cache():
    """Clear all cached data files."""
    for f in CACHE_DIR.glob("*.parquet"):
        try:
            f.unlink()
        except Exception:
            pass
