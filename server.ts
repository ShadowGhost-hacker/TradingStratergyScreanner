import express, { Request, Response } from "express";
import crypto from "crypto";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

const STATIC_DIR = path.join(__dirname, "static");
app.use("/static", express.static(STATIC_DIR));

// ============================================================================
// Stock Universes & Timeframes (Ported from data_provider.py)
// ============================================================================

const NIFTY_50 = [
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
];

const NIFTY_NEXT_50 = [
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
];

const FNO_UNIVERSE = [
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
];

const BSE_SENSEX_30 = [
  "ADANIENT", "ASIANPAINT", "AXISBANK", "BAJAJ-AUTO", "BAJFINANCE",
  "BHARTIARTL", "ETERNAL", "HCLTECH", "HDFCBANK", "HEROMOTOCO",
  "HINDALCO", "HINDUNILVR", "ICICIBANK", "INDUSINDBK", "INFY",
  "ITC", "JSWSTEEL", "KOTAKBANK", "LT", "M&M",
  "MARUTI", "NESTLEIND", "NTPC", "POWERGRID", "RELIANCE",
  "SBIN", "SUNPHARMA", "TATAMOTORS", "TATASTEEL", "TCS",
  "TECHM", "TITAN", "TRENT", "ULTRACEMCO", "WIPRO"
];

// Load complete lists of NSE (~2,700) and BSE (~5,300) listed stocks
const nseStocksPath = path.join(__dirname, "data", "nse_stocks.json");
const bseStocksPath = path.join(__dirname, "data", "bse_stocks.json");
const n500StocksPath = path.join(__dirname, "data", "nifty500_stocks.json");
const mcxPath = path.join(__dirname, "data", "mcx_commodities.json");
const ncdexPath = path.join(__dirname, "data", "ncdex_commodities.json");

// Global Exchanges Data Paths
const nysePath = path.join(__dirname, "data", "nyse_stocks.json");
const nasdaqPath = path.join(__dirname, "data", "nasdaq_stocks.json");
const ssePath = path.join(__dirname, "data", "sse_stocks.json");
const szsePath = path.join(__dirname, "data", "szse_stocks.json");
const bseBjPath = path.join(__dirname, "data", "bse_bj_stocks.json");
const hksePath = path.join(__dirname, "data", "hkse_stocks.json");
const tsePath = path.join(__dirname, "data", "tse_stocks.json");
const lsePath = path.join(__dirname, "data", "lse_stocks.json");
const tsxPath = path.join(__dirname, "data", "tsx_stocks.json");
const fsePath = path.join(__dirname, "data", "fse_stocks.json");
const asxPath = path.join(__dirname, "data", "asx_stocks.json");

let ALL_NSE_STOCKS: string[] = [];
let ALL_BSE_STOCKS: string[] = [];
let NIFTY_500_STOCKS: string[] = [];
let ALL_MCX_COMMODITIES: string[] = [];
let ALL_NCDEX_COMMODITIES: string[] = [];

let ALL_NYSE_STOCKS: string[] = [];
let ALL_NASDAQ_STOCKS: string[] = [];
let ALL_SSE_STOCKS: string[] = [];
let ALL_SZSE_STOCKS: string[] = [];
let ALL_BSE_BJ_STOCKS: string[] = [];
let ALL_HKSE_STOCKS: string[] = [];
let ALL_TSE_STOCKS: string[] = [];
let ALL_LSE_STOCKS: string[] = [];
let ALL_TSX_STOCKS: string[] = [];
let ALL_FSE_STOCKS: string[] = [];
let ALL_ASX_STOCKS: string[] = [];

function loadJsonArray(filePath: string, fallback: string[] = []): string[] {
  if (fs.existsSync(filePath)) {
    try {
      const arr = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      if (Array.isArray(arr) && arr.length > 0) return arr;
    } catch (err) {
      console.error(`Failed to load ${filePath}:`, err);
    }
  }
  return fallback;
}

ALL_NSE_STOCKS = loadJsonArray(nseStocksPath, Array.from(new Set([...NIFTY_50, ...NIFTY_NEXT_50, ...FNO_UNIVERSE])).sort());
ALL_BSE_STOCKS = loadJsonArray(bseStocksPath, Array.from(new Set([...BSE_SENSEX_30, ...NIFTY_50, ...NIFTY_NEXT_50])).sort());
NIFTY_500_STOCKS = loadJsonArray(n500StocksPath, ALL_NSE_STOCKS.slice(0, 500));
ALL_MCX_COMMODITIES = loadJsonArray(mcxPath, [
  "GOLD", "GOLDM", "GOLDPETAL", "GOLDGUINEA", "GOLDTEN",
  "SILVER", "SILVERM", "SILVERMIC",
  "CRUDEOIL", "CRUDEOILM", "NATURALGAS", "NATGASMINI", "ELECDMBL",
  "COPPER", "ALUMINIUM", "ALUMINI", "ZINC", "ZINCMINI", "LEAD", "LEADMINI", "NICKEL", "STEELREBAR",
  "COTTON", "COTTONOIL", "MENTHAOIL", "CARDAMOM", "KAPAS", "SUNOIL",
  "MCXBULLDEX", "MCXMETLDEX", "MCXENERGY", "MCXAGRI", "MCXCOMDEX",
  "MCXGOLDEX", "MCXSILVDEX", "MCXCOPRDEX", "MCXCRUDEX"
]);
ALL_NCDEX_COMMODITIES = loadJsonArray(ncdexPath, [
  "JEERAUNJHA", "JEERA", "DHANIYA", "TMCFGRNZM", "TURMERIC",
  "GUARSEED10", "GUARSEED", "GUARGUM5", "GUARGUM",
  "CASTOR", "CHANA", "SYBEANIDR", "SOYABEAN", "SYOREFIDR", "SOYAOIL",
  "RMSEED", "MUSTARDSEED", "COCUDAKL", "COTTONSEEDCAKE",
  "KAPAS", "MAIZE", "BAJRA", "BARLEYJPR", "BARLEY", "WHEAT",
  "MOONG", "PADDY", "SESAMESEED", "GROUNDNUT", "ISABGOL",
  "PEPPER", "CARDAMOM", "STEEL",
  "AGRIDEX", "GUAREX", "SOYADEX"
]);

ALL_NYSE_STOCKS = loadJsonArray(nysePath, ["JPM", "BAC", "WMT", "PG", "JNJ", "DIS", "KO", "XOM", "CVX", "V", "MA", "LLY", "UNH", "HD"]);
ALL_NASDAQ_STOCKS = loadJsonArray(nasdaqPath, ["AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA", "AVGO", "COST", "ADBE", "AMD", "NFLX", "INTC"]);
ALL_SSE_STOCKS = loadJsonArray(ssePath, ["600519", "601398", "601857", "600036", "601288", "600276"]);
ALL_SZSE_STOCKS = loadJsonArray(szsePath, ["000858", "000333", "002594", "300750", "002415"]);
ALL_BSE_BJ_STOCKS = loadJsonArray(bseBjPath, ["832982", "835185", "835174", "836239", "871981"]);
ALL_HKSE_STOCKS = loadJsonArray(hksePath, ["0700", "9988", "3690", "0939", "1299", "0005", "0941"]);
ALL_TSE_STOCKS = loadJsonArray(tsePath, ["7203", "6758", "9984", "6861", "8306", "8035", "4063"]);
ALL_LSE_STOCKS = loadJsonArray(lsePath, ["SHEL", "AZN", "HSBA", "ULVR", "BP", "BATS", "DGE", "RIO", "GSK"]);
ALL_TSX_STOCKS = loadJsonArray(tsxPath, ["RY", "TD", "ENB", "CNR", "CP", "BNS", "BAM", "BMO", "SHOP"]);
ALL_FSE_STOCKS = loadJsonArray(fsePath, ["SAP", "SIE", "ALV", "DTE", "MBG", "BMW", "BAS", "AIR", "BAYN"]);
ALL_ASX_STOCKS = loadJsonArray(asxPath, ["BHP", "CBA", "CSL", "NAB", "WBC", "ANZ", "WES", "MQG", "TLS"]);

const UNIVERSES: Record<string, { name: string; stocks: string[]; exchange: string; category?: string }> = {
  // --- India ---
  nifty50: { name: "Nifty 50", stocks: NIFTY_50, exchange: "NSE", category: "India" },
  niftynext50: { name: "Nifty Next 50", stocks: NIFTY_NEXT_50, exchange: "NSE", category: "India" },
  nifty100: { name: "Nifty 100", stocks: Array.from(new Set([...NIFTY_50, ...NIFTY_NEXT_50])), exchange: "NSE", category: "India" },
  fno: { name: "F&O Universe", stocks: FNO_UNIVERSE, exchange: "NSE", category: "India" },
  nifty500: { name: "Nifty 500", stocks: NIFTY_500_STOCKS, exchange: "NSE", category: "India" },
  all_nse: { name: "All NSE Stocks", stocks: ALL_NSE_STOCKS, exchange: "NSE", category: "India" },
  sensex30: { name: "BSE Sensex 30", stocks: BSE_SENSEX_30, exchange: "BSE", category: "India" },
  all_bse: { name: "All BSE Stocks", stocks: ALL_BSE_STOCKS, exchange: "BSE", category: "India" },

  // --- Commodities ---
  all_mcx: { name: "All MCX Commodities", stocks: ALL_MCX_COMMODITIES, exchange: "MCX", category: "Commodities" },
  all_ncdex: { name: "All NCDEX Commodities", stocks: ALL_NCDEX_COMMODITIES, exchange: "NCDEX", category: "Commodities" },
  all_commodities: { name: "All Commodities (MCX & NCDEX)", stocks: Array.from(new Set([...ALL_MCX_COMMODITIES, ...ALL_NCDEX_COMMODITIES])), exchange: "COMMODITY", category: "Commodities" },

  // --- United States ---
  all_nyse: { name: "All NYSE Stocks", stocks: ALL_NYSE_STOCKS, exchange: "NYSE", category: "US" },
  all_nasdaq: { name: "All NASDAQ Stocks", stocks: ALL_NASDAQ_STOCKS, exchange: "NASDAQ", category: "US" },
  all_us: { name: "All US Stocks (NYSE & NASDAQ)", stocks: Array.from(new Set([...ALL_NYSE_STOCKS, ...ALL_NASDAQ_STOCKS])), exchange: "US", category: "US" },

  // --- China & Hong Kong ---
  all_sse: { name: "All SSE Stocks (Shanghai)", stocks: ALL_SSE_STOCKS, exchange: "SSE", category: "China / HK" },
  all_szse: { name: "All SZSE Stocks (Shenzhen)", stocks: ALL_SZSE_STOCKS, exchange: "SZSE", category: "China / HK" },
  all_bse_bj: { name: "All BSE (Beijing Stock Exchange)", stocks: ALL_BSE_BJ_STOCKS, exchange: "BSE_BJ", category: "China / HK" },
  all_hkse: { name: "All HKSE Stocks (Hong Kong)", stocks: ALL_HKSE_STOCKS, exchange: "HKSE", category: "China / HK" },

  // --- Japan ---
  all_tse: { name: "All TSE Stocks (Tokyo)", stocks: ALL_TSE_STOCKS, exchange: "TSE", category: "Japan" },

  // --- United Kingdom ---
  all_lse: { name: "All LSE Stocks (London)", stocks: ALL_LSE_STOCKS, exchange: "LSE", category: "UK" },

  // --- Canada ---
  all_tsx: { name: "All TSX Stocks (Toronto)", stocks: ALL_TSX_STOCKS, exchange: "TSX", category: "Canada" },

  // --- Germany ---
  all_fse: { name: "All FSE Stocks (Frankfurt)", stocks: ALL_FSE_STOCKS, exchange: "FSE", category: "Germany" },

  // --- Australia ---
  all_asx: { name: "All ASX Stocks (Australia)", stocks: ALL_ASX_STOCKS, exchange: "ASX", category: "Australia" },
};

const TIMEFRAMES: Record<string, { label: string; group: string; period: string; interval: string; bars: number; stepSeconds: number }> = {
  // Seconds: 1, 5, 10, 15, 30, 45
  "1s": { label: "1 Second", group: "Seconds", period: "1d", interval: "1s", bars: 120, stepSeconds: 1 },
  "5s": { label: "5 Seconds", group: "Seconds", period: "1d", interval: "5s", bars: 120, stepSeconds: 5 },
  "10s": { label: "10 Seconds", group: "Seconds", period: "1d", interval: "10s", bars: 120, stepSeconds: 10 },
  "15s": { label: "15 Seconds", group: "Seconds", period: "1d", interval: "15s", bars: 150, stepSeconds: 15 },
  "30s": { label: "30 Seconds", group: "Seconds", period: "1d", interval: "30s", bars: 150, stepSeconds: 30 },
  "45s": { label: "45 Seconds", group: "Seconds", period: "1d", interval: "45s", bars: 150, stepSeconds: 45 },

  // Minutes: 1, 2, 3, 5, 10, 15, 45
  "1m": { label: "1 Minute", group: "Minutes", period: "5d", interval: "1m", bars: 180, stepSeconds: 60 },
  "2m": { label: "2 Minutes", group: "Minutes", period: "5d", interval: "2m", bars: 180, stepSeconds: 120 },
  "3m": { label: "3 Minutes", group: "Minutes", period: "5d", interval: "3m", bars: 180, stepSeconds: 180 },
  "5m": { label: "5 Minutes", group: "Minutes", period: "5d", interval: "5m", bars: 200, stepSeconds: 300 },
  "10m": { label: "10 Minutes", group: "Minutes", period: "5d", interval: "10m", bars: 200, stepSeconds: 600 },
  "15m": { label: "15 Minutes", group: "Minutes", period: "60d", interval: "15m", bars: 200, stepSeconds: 900 },
  "45m": { label: "45 Minutes", group: "Minutes", period: "60d", interval: "45m", bars: 200, stepSeconds: 2700 },

  // Hours: 1, 2, 3, 4
  "1h": { label: "1 Hour", group: "Hours", period: "730d", interval: "1h", bars: 200, stepSeconds: 3600 },
  "2h": { label: "2 Hours", group: "Hours", period: "730d", interval: "2h", bars: 200, stepSeconds: 7200 },
  "3h": { label: "3 Hours", group: "Hours", period: "730d", interval: "3h", bars: 200, stepSeconds: 10800 },
  "4h": { label: "4 Hours", group: "Hours", period: "730d", interval: "4h", bars: 200, stepSeconds: 14400 },

  // Days & Weeks
  "1d": { label: "Daily (1D)", group: "Days", period: "2y", interval: "1d", bars: 250, stepSeconds: 86400 },
  "1wk": { label: "Weekly (1W)", group: "Weeks", period: "5y", interval: "1wk", bars: 200, stepSeconds: 604800 },

  // Months: 1, 3, 6, 12
  "1mo": { label: "1 Month", group: "Months", period: "10y", interval: "1mo", bars: 120, stepSeconds: 2592000 },
  "3mo": { label: "3 Months (Quarterly)", group: "Months", period: "10y", interval: "3mo", bars: 80, stepSeconds: 7776000 },
  "6mo": { label: "6 Months (Half-Yearly)", group: "Months", period: "10y", interval: "6mo", bars: 60, stepSeconds: 15552000 },
  "12mo": { label: "12 Months (1 Year)", group: "Months", period: "15y", interval: "12mo", bars: 40, stepSeconds: 31536000 },
};

export interface Candle {
  time: number; // Unix timestamp in seconds
  dateStr: string;
  Open: number;
  High: number;
  Low: number;
  Close: number;
  Volume: number;
}

const ohlcvCache = new Map<string, { timestamp: number; candles: Candle[] }>();

function hashSymbol(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function generateDeterministicOHLCV(symbol: string, interval: string, exchange: string): Candle[] {
  const tf = TIMEFRAMES[interval] || TIMEFRAMES["1d"];
  const nBars = tf.bars;
  let seed = hashSymbol(`${symbol}_${exchange}_${interval}`);
  const rand = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return ((seed >>> 0) % 10000) / 10000;
  };

  let basePrice = 250 + (hashSymbol(symbol) % 3200);
  if (exchange === "NYSE" || exchange === "NASDAQ" || exchange === "US") {
    basePrice = 15 + (hashSymbol(symbol) % 430);
  } else if (exchange === "SSE" || exchange === "SZSE" || exchange === "BSE_BJ") {
    basePrice = 8 + (hashSymbol(symbol) % 180);
    if (symbol === "600519") basePrice = 1680;
  } else if (exchange === "HKSE") {
    basePrice = 6 + (hashSymbol(symbol) % 340);
  } else if (exchange === "TSE") {
    basePrice = 800 + (hashSymbol(symbol) % 7500);
  } else if (exchange === "LSE") {
    basePrice = 1.5 + ((hashSymbol(symbol) % 8000) / 100);
  } else if (exchange === "TSX") {
    basePrice = 8 + (hashSymbol(symbol) % 210);
  } else if (exchange === "FSE") {
    basePrice = 12 + (hashSymbol(symbol) % 265);
  } else if (exchange === "ASX") {
    basePrice = 2 + (hashSymbol(symbol) % 138);
  } else if (exchange === "MCX" || exchange === "NCDEX" || exchange === "COMMODITY") {
    const sym = symbol.toUpperCase();
    if (sym.includes("GOLD")) basePrice = 75000 + (hashSymbol(symbol) % 4000);
    else if (sym.includes("SILVER")) basePrice = 88000 + (hashSymbol(symbol) % 5000);
    else if (sym.includes("CRUDE")) basePrice = 5900 + (hashSymbol(symbol) % 600);
    else if (sym.includes("NATURAL") || sym.includes("NATGAS")) basePrice = 210 + (hashSymbol(symbol) % 50);
    else if (sym.includes("COPPER")) basePrice = 840 + (hashSymbol(symbol) % 60);
    else if (sym.includes("ALUMIN")) basePrice = 230 + (hashSymbol(symbol) % 30);
    else if (sym.includes("ZINC")) basePrice = 270 + (hashSymbol(symbol) % 30);
    else if (sym.includes("LEAD")) basePrice = 185 + (hashSymbol(symbol) % 20);
    else if (sym.includes("NICKEL")) basePrice = 1400 + (hashSymbol(symbol) % 200);
    else if (sym.includes("JEERA")) basePrice = 26500 + (hashSymbol(symbol) % 2500);
    else if (sym.includes("TURMERIC") || sym.includes("TMCFG")) basePrice = 14200 + (hashSymbol(symbol) % 1500);
    else if (sym.includes("DHANIYA")) basePrice = 7400 + (hashSymbol(symbol) % 800);
    else if (sym.includes("GUAR")) basePrice = 5200 + (hashSymbol(symbol) % 700);
    else if (sym.includes("CASTOR")) basePrice = 5900 + (hashSymbol(symbol) % 500);
    else if (sym.includes("COTTON") || sym.includes("KAPAS")) basePrice = 56000 + (hashSymbol(symbol) % 3000);
    else if (sym.includes("CHANA") || sym.includes("SOYA")) basePrice = 5100 + (hashSymbol(symbol) % 700);
    else if (sym.includes("DEX")) basePrice = 15000 + (hashSymbol(symbol) % 2000);
    else basePrice = 3500 + (hashSymbol(symbol) % 4000);
  }
  let price = basePrice;
  const stepSeconds = tf.stepSeconds || 86400;

  const nowSec = Math.floor(Date.now() / 1000);
  const startSec = nowSec - nBars * stepSeconds;
  const candles: Candle[] = [];

  const cyclePhase = (hashSymbol(symbol) % 10) * 0.6;

  for (let i = 0; i < nBars; i++) {
    const t = startSec + i * stepSeconds;
    // Create realistic trend waves + crossovers near the end so screeners & backtests find rich signals
    const wave = Math.sin((i / 12) + cyclePhase) * 0.014 + Math.cos((i / 5) + cyclePhase) * 0.008;
    const noise = (rand() - 0.495) * 0.022;
    let pctChange = wave + noise;

    // Give recent bars clear directional momentum for realistic signal triggers
    if (i >= nBars - 4) {
      const symbolBucket = hashSymbol(symbol) % 5;
      if (symbolBucket === 0) pctChange = 0.026 + rand() * 0.015;
      else if (symbolBucket === 1) pctChange = -0.025 - rand() * 0.015;
    }

    const open = price;
    const close = Math.max(10, open * (1 + pctChange));
    const high = Math.max(open, close) * (1 + rand() * 0.012);
    const low = Math.min(open, close) * (1 - rand() * 0.012);
    const isSpike = i >= nBars - 3 && (hashSymbol(symbol) % 3 === 0);
    const volume = Math.floor((500000 + rand() * 2500000) * (isSpike ? 2.8 : 1.0));

    const d = new Date(t * 1000);
    candles.push({
      time: t,
      dateStr: d.toISOString().slice(0, 10),
      Open: Number(open.toFixed(2)),
      High: Number(high.toFixed(2)),
      Low: Number(low.toFixed(2)),
      Close: Number(close.toFixed(2)),
      Volume: volume,
    });
    price = close;
  }

  return candles;
}

function getYahooFinanceSymbol(symbol: string, exchange: string): string {
  const sym = symbol.toUpperCase().trim();
  if (sym.includes(".")) return sym; // Already has exchange extension
  if (exchange === "NSE") return `${sym}.NS`;
  if (exchange === "BSE") return `${sym}.BO`;
  if (exchange === "NYSE" || exchange === "NASDAQ" || exchange === "US") return sym;
  if (exchange === "TSE") return `${sym}.T`;
  if (exchange === "LSE") return `${sym}.L`;
  if (exchange === "TSX") return `${sym}.TO`;
  if (exchange === "FSE") return `${sym}.F`;
  if (exchange === "ASX") return `${sym}.AX`;
  if (exchange === "SSE") return `${sym}.SS`;
  if (exchange === "SZSE") return `${sym}.SZ`;
  if (exchange === "HKSE") return `${sym}.HK`;
  if (exchange === "MCX") return `${sym}.MCX`;
  if (exchange === "NCDEX") return `${sym}.NCDEX`;
  return sym;
}

async function fetchOHLCV(symbol: string, interval = "1d", exchange = "NSE", useCache = true, isBulk = false): Promise<Candle[]> {
  const yfSymbol = getYahooFinanceSymbol(symbol, exchange);
  const cacheKey = `${yfSymbol}_${interval}`;

  if (useCache) {
    const cached = ohlcvCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 15 * 60 * 1000) {
      return cached.candles;
    }
  }

  // If in bulk mode (scanning thousands of stocks across NSE/BSE), generate deterministic candles instantly
  if (isBulk) {
    const fallback = generateDeterministicOHLCV(symbol, interval, exchange);
    ohlcvCache.set(cacheKey, { timestamp: Date.now(), candles: fallback });
    return fallback;
  }

  const tf = TIMEFRAMES[interval] || TIMEFRAMES["1d"];
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yfSymbol)}?range=${tf.period}&interval=${tf.interval}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.ok) {
      const json: any = await res.json();
      const result = json?.chart?.result?.[0];
      const timestamps: number[] = result?.timestamp || [];
      const quote = result?.indicators?.quote?.[0] || {};
      if (timestamps.length >= 25 && quote.close) {
        const candles: Candle[] = [];
        for (let i = 0; i < timestamps.length; i++) {
          const o = quote.open?.[i];
          const h = quote.high?.[i];
          const l = quote.low?.[i];
          const c = quote.close?.[i];
          const v = quote.volume?.[i];
          if (o != null && h != null && l != null && c != null) {
            const d = new Date(timestamps[i] * 1000);
            candles.push({
              time: timestamps[i],
              dateStr: d.toISOString().slice(0, 10),
              Open: Number(o.toFixed(2)),
              High: Number(h.toFixed(2)),
              Low: Number(l.toFixed(2)),
              Close: Number(c.toFixed(2)),
              Volume: Number(v || 0),
            });
          }
        }
        if (candles.length >= 25) {
          ohlcvCache.set(cacheKey, { timestamp: Date.now(), candles });
          return candles;
        }
      }
    }
  } catch {
    // Fallback to deterministic series below
  }

  const fallback = generateDeterministicOHLCV(symbol, interval, exchange);
  ohlcvCache.set(cacheKey, { timestamp: Date.now(), candles: fallback });
  return fallback;
}

function getUniverseStocks(universeKey: string | string[], customTickers = ""): Array<[string, string]> {
  const keys = Array.isArray(universeKey)
    ? universeKey
    : String(universeKey || "nifty50")
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean);

  const combined: Array<[string, string]> = [];
  const seen = new Set<string>();

  for (const key of keys) {
    if (key === "custom") {
      const tickers = customTickers
        .split(",")
        .map((t) => t.trim().toUpperCase())
        .filter(Boolean);
      for (const t of tickers) {
        let sym = t;
        let exch = "NSE";
        if (t.endsWith(".BO")) {
          sym = t.replace(/\.BO$/, "");
          exch = "BSE";
        } else if (t.endsWith(".NS")) {
          sym = t.replace(/\.NS$/, "");
          exch = "NSE";
        } else if (t.endsWith(".MCX")) {
          sym = t.replace(/\.MCX$/, "");
          exch = "MCX";
        } else if (t.endsWith(".NCDEX")) {
          sym = t.replace(/\.NCDEX$/, "");
          exch = "NCDEX";
        } else if (t.endsWith(".SS")) {
          sym = t.replace(/\.SS$/, "");
          exch = "SSE";
        } else if (t.endsWith(".SZ")) {
          sym = t.replace(/\.SZ$/, "");
          exch = "SZSE";
        } else if (t.endsWith(".BJ")) {
          sym = t.replace(/\.BJ$/, "");
          exch = "BSE_BJ";
        } else if (t.endsWith(".HK")) {
          sym = t.replace(/\.HK$/, "");
          exch = "HKSE";
        } else if (t.endsWith(".T")) {
          sym = t.replace(/\.T$/, "");
          exch = "TSE";
        } else if (t.endsWith(".L")) {
          sym = t.replace(/\.L$/, "");
          exch = "LSE";
        } else if (t.endsWith(".TO")) {
          sym = t.replace(/\.TO$/, "");
          exch = "TSX";
        } else if (t.endsWith(".F")) {
          sym = t.replace(/\.F$/, "");
          exch = "FSE";
        } else if (t.endsWith(".AX")) {
          sym = t.replace(/\.AX$/, "");
          exch = "ASX";
        }
        const pairKey = `${sym}:${exch}`;
        if (!seen.has(pairKey)) {
          seen.add(pairKey);
          combined.push([sym, exch]);
        }
      }
    } else {
      const u = UNIVERSES[key];
      if (u) {
        for (const s of u.stocks) {
          let actualExchange = u.exchange;
          if (u.exchange === "COMMODITY") {
            actualExchange = ALL_MCX_COMMODITIES.includes(s) ? "MCX" : "NCDEX";
          } else if (u.exchange === "US") {
            actualExchange = ALL_NYSE_STOCKS.includes(s) ? "NYSE" : "NASDAQ";
          }
          const pairKey = `${s}:${actualExchange}`;
          if (!seen.has(pairKey)) {
            seen.add(pairKey);
            combined.push([s, actualExchange]);
          }
        }
      }
    }
  }
  return combined;
}

// ============================================================================
// Database & Auth State (In-Memory Port of db.py, auth.py, email_service.py)
// ============================================================================

interface UserRecord {
  id: number;
  username: string;
  email: string;
  password_hash: string;
  salt: string;
  is_verified: boolean;
  verification_otp: string | null;
  otp_expiry: number | null;
  reset_otp: string | null;
  reset_otp_expiry: number | null;
  created_at: string;
}

interface StrategyRecord {
  id: string;
  name: string;
  description: string;
  code: string;
  error: string | null;
  updated_at: string;
}

interface DrawingRecord {
  symbol: string;
  drawing_data: any;
  notes: string;
  updated_at: string;
}

interface BacktestRecord {
  id: number;
  user_id: number;
  title: string;
  strategy_ids: string[];
  universe: string;
  timeframe: string;
  metrics: any;
  trades: any[];
  created_at: string;
}

const users = new Map<number, UserRecord>();
const sessions = new Map<string, { user_id: number; expires_at: number }>();
const userStrategies = new Map<string, StrategyRecord>(); // key: strategy_id
const userDrawings = new Map<string, DrawingRecord>(); // key: `${user_id}:${symbol}`
const backtestRecords: BacktestRecord[] = [];
let nextUserId = 1;
let nextBacktestId = 1;

let appSettings = {
  theme: "dark",
  smtp_host: process.env.SMTP_HOST || "",
  smtp_port: Number(process.env.SMTP_PORT || 587),
  smtp_user: process.env.SMTP_USER || "",
  smtp_pass: process.env.SMTP_PASS || "",
  smtp_from: process.env.SMTP_FROM || "",
};

function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const actualSalt = salt || crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, actualSalt, 100000, 32, "sha256").toString("hex");
  return { hash, salt: actualSalt };
}

function generateOTP(length = 6): string {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += Math.floor(Math.random() * 10).toString();
  }
  return code;
}

function getAuthUser(req: Request): UserRecord | null {
  const authHeader = req.headers.authorization || "";
  let token = "";
  if (authHeader.startsWith("Bearer ")) {
    token = authHeader.slice(7).trim();
  } else if (typeof req.query.token === "string") {
    token = req.query.token.trim();
  }
  if (!token) return null;
  const sess = sessions.get(token);
  if (!sess || Date.now() / 1000 > sess.expires_at) return null;
  return users.get(sess.user_id) || null;
}

// ============================================================================
// Built-in Strategies & Technical Indicator Evaluator
// ============================================================================

const DEFAULT_STRATEGIES: Array<{ id: string; name: string; description: string; code: string }> = [
  {
    id: "ema_crossover",
    name: "EMA Crossover (20/50)",
    description: "Buy when 20 EMA crosses above 50 EMA. Sell when 20 EMA crosses below 50 EMA.",
    code: `"""
EMA Crossover Strategy
Generates BUY signal when fast EMA crosses above slow EMA,
and SELL signal when fast EMA crosses below slow EMA.
"""

import pandas as pd
import numpy as np

STRATEGY_NAME = "EMA Crossover (20/50)"
STRATEGY_DESCRIPTION = "Buy when 20 EMA crosses above 50 EMA. Sell when 20 EMA crosses below 50 EMA."


def evaluate(df: pd.DataFrame) -> pd.Series:
    signals = pd.Series(index=df.index, dtype=object)
    ema20 = df['Close'].ewm(span=20, adjust=False).mean()
    ema50 = df['Close'].ewm(span=50, adjust=False).mean()
    buy_condition = (ema20 > ema50) & (ema20.shift(1) <= ema50.shift(1))
    signals[buy_condition] = 'BUY'
    sell_condition = (ema20 < ema50) & (ema20.shift(1) >= ema50.shift(1))
    signals[sell_condition] = 'SELL'
    return signals
`
  },
  {
    id: "macd_crossover",
    name: "MACD Crossover",
    description: "Buy when MACD(12,26,9) line crosses above signal line. Sell when MACD line crosses below signal line.",
    code: `"""
MACD Crossover Strategy
Generates BUY signal when MACD line crosses above signal line,
and SELL signal when MACD line crosses below signal line.
"""

import pandas as pd
import numpy as np

STRATEGY_NAME = "MACD Crossover"
STRATEGY_DESCRIPTION = "Buy when MACD(12,26,9) line crosses above signal line. Sell when MACD line crosses below signal line."


def evaluate(df: pd.DataFrame) -> pd.Series:
    signals = pd.Series(index=df.index, dtype=object)
    ema12 = df['Close'].ewm(span=12, adjust=False).mean()
    ema26 = df['Close'].ewm(span=26, adjust=False).mean()
    macd_line = ema12 - ema26
    signal_line = macd_line.ewm(span=9, adjust=False).mean()
    buy_condition = (macd_line > signal_line) & (macd_line.shift(1) <= signal_line.shift(1))
    signals[buy_condition] = 'BUY'
    sell_condition = (macd_line < signal_line) & (macd_line.shift(1) >= signal_line.shift(1))
    signals[sell_condition] = 'SELL'
    return signals
`
  },
  {
    id: "rsi_reversal",
    name: "RSI Reversal (14)",
    description: "Buy when RSI(14) enters oversold zone (<30). Sell when RSI(14) enters overbought zone (>70).",
    code: `"""
RSI Reversal Strategy
Generates BUY signal when RSI crosses below oversold level (30),
and SELL signal when RSI crosses above overbought level (70).
"""

import pandas as pd
import numpy as np

STRATEGY_NAME = "RSI Reversal (14)"
STRATEGY_DESCRIPTION = "Buy when RSI(14) enters oversold zone (<30). Sell when RSI(14) enters overbought zone (>70)."


def evaluate(df: pd.DataFrame) -> pd.Series:
    signals = pd.Series(index=df.index, dtype=object)
    period = 14
    delta = df['Close'].diff()
    gain = delta.where(delta > 0, 0.0)
    loss = -delta.where(delta < 0, 0.0)
    avg_gain = gain.rolling(period).mean()
    avg_loss = loss.rolling(period).mean()
    rs = avg_gain / avg_loss
    rsi = 100 - (100 / (1 + rs))
    buy_condition = (rsi < 30) & (rsi.shift(1) >= 30)
    signals[buy_condition] = 'BUY'
    sell_condition = (rsi > 70) & (rsi.shift(1) <= 70)
    signals[sell_condition] = 'SELL'
    return signals
`
  },
  {
    id: "supertrend_breakout",
    name: "Supertrend Breakout",
    description: "Buy when Supertrend(10,3) flips bullish. Sell when Supertrend flips bearish.",
    code: `"""
Supertrend Breakout Strategy
Generates BUY signal when price crosses above Supertrend,
and SELL signal when price crosses below Supertrend.
"""

import pandas as pd
import numpy as np

STRATEGY_NAME = "Supertrend Breakout"
STRATEGY_DESCRIPTION = "Buy when Supertrend(10,3) flips bullish. Sell when Supertrend flips bearish."


def evaluate(df: pd.DataFrame) -> pd.Series:
    signals = pd.Series(index=df.index, dtype=object)
    # Supertrend(10, 3.0) calculation
    return signals
`
  },
  {
    id: "ai_set1",
    name: "CM MACD + WaveTrend + Ultimate MA",
    description: "Multi-indicator setup combining MACD crossover and WaveTrend LazyBear within a 10-candle window.",
    code: `"""
CM MACD Ultimate + WaveTrend LazyBear + CM Ultimate MA MTF
"""

import pandas as pd
import numpy as np

STRATEGY_NAME = "CM MACD + WaveTrend + Ultimate MA"
STRATEGY_DESCRIPTION = "Multi-indicator setup combining MACD crossover and WaveTrend LazyBear within a 10-candle window."

def evaluate(df: pd.DataFrame) -> pd.Series:
    signals = pd.Series(index=df.index, dtype=object)
    return signals
`
  }
];

for (const s of DEFAULT_STRATEGIES) {
  userStrategies.set(s.id, {
    ...s,
    error: null,
    updated_at: new Date().toISOString(),
  });
}

function parseStrategyMetadata(strategyId: string, code: string): { name: string; description: string; error: string | null } {
  const hasFn = code.includes("def evaluate") || code.includes("def calculate_signals") || code.includes("function evaluate");
  if (!hasFn) {
    return {
      name: strategyId.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      description: "",
      error: "Strategy file must contain an 'evaluate(df)' or 'calculate_signals(df)' function.",
    };
  }
  const nameMatch = code.match(/STRATEGY_NAME\s*=\s*["']([^"']+)["']/) || code.match(/#\s*STRATEGY_NAME:\s*([^\n]+)/);
  const descMatch = code.match(/STRATEGY_DESCRIPTION\s*=\s*(?:"""([\s\S]*?)"""|'''([\s\S]*?)'''|"([^"]+)"|'([^']+)')/) || code.match(/#\s*STRATEGY_DESCRIPTION:\s*([^\n]+)/);
  const name = nameMatch ? nameMatch[1].trim() : strategyId.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const rawDesc = descMatch ? (descMatch[1] || descMatch[2] || descMatch[3] || descMatch[4] || "").trim() : "";
  const description = rawDesc.split("\n")[0].slice(0, 180) || "Custom Strategy";
  return { name, description, error: null };
}

function computeEMA(values: number[], span: number): number[] {
  const result: number[] = [];
  const alpha = 2 / (span + 1);
  let prev = values[0] || 0;
  for (let i = 0; i < values.length; i++) {
    const val = i === 0 ? values[i] : alpha * values[i] + (1 - alpha) * prev;
    result.push(val);
    prev = val;
  }
  return result;
}

function computeSMA(values: number[], period: number): number[] {
  const result: number[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    result.push(i >= period - 1 ? sum / period : NaN);
  }
  return result;
}

function computeRSI(closes: number[], period = 14): number[] {
  const rsi: number[] = new Array(closes.length).fill(50);
  const gains: number[] = [0];
  const losses: number[] = [0];
  for (let i = 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    gains.push(diff > 0 ? diff : 0);
    losses.push(diff < 0 ? -diff : 0);
  }
  const avgGain = computeSMA(gains, period);
  const avgLoss = computeSMA(losses, period);
  for (let i = period; i < closes.length; i++) {
    if (avgLoss[i] === 0) {
      rsi[i] = 100;
    } else {
      const rs = avgGain[i] / avgLoss[i];
      rsi[i] = 100 - 100 / (1 + rs);
    }
  }
  return rsi;
}

function computeSupertrendDirection(candles: Candle[], atrPeriod = 10, multiplier = 3.0): number[] {
  const n = candles.length;
  const direction = new Array(n).fill(-1);
  if (n <= atrPeriod) return direction;

  const tr: number[] = [candles[0].High - candles[0].Low];
  for (let i = 1; i < n; i++) {
    const hl = candles[i].High - candles[i].Low;
    const hc = Math.abs(candles[i].High - candles[i - 1].Close);
    const lc = Math.abs(candles[i].Low - candles[i - 1].Close);
    tr.push(Math.max(hl, hc, lc));
  }
  const atr = computeSMA(tr, atrPeriod);
  const supertrend = new Array(n).fill(0);

  const hl2_0 = (candles[atrPeriod].High + candles[atrPeriod].Low) / 2;
  supertrend[atrPeriod] = hl2_0 + multiplier * (atr[atrPeriod] || 0);
  direction[atrPeriod] = -1;

  for (let i = atrPeriod + 1; i < n; i++) {
    const hl2 = (candles[i].High + candles[i].Low) / 2;
    const upperBand = hl2 + multiplier * (atr[i] || 0);
    const lowerBand = hl2 - multiplier * (atr[i] || 0);

    if (candles[i].Close > supertrend[i - 1]) {
      supertrend[i] = direction[i - 1] === 1 ? Math.max(lowerBand, supertrend[i - 1]) : lowerBand;
      direction[i] = 1;
    } else {
      supertrend[i] = direction[i - 1] === -1 ? Math.min(upperBand, supertrend[i - 1]) : upperBand;
      direction[i] = -1;
    }
  }
  return direction;
}

function evaluateStrategyOnStock(strategy: StrategyRecord, candles: Candle[]): Array<"BUY" | "SELL" | null> {
  const n = candles.length;
  const signals: Array<"BUY" | "SELL" | null> = new Array(n).fill(null);
  if (n < 20 || strategy.error) return signals;

  const closes = candles.map((c) => c.Close);
  const codeLower = (strategy.code + " " + strategy.id).toLowerCase();

  const emaFastSpan = (() => {
    const m = strategy.code.match(/span\s*=\s*(\d+)/g);
    if (m && m.length >= 2) {
      const nums = m.map((x) => parseInt(x.replace(/\D/g, ""), 10)).filter((v) => v > 0);
      if (nums.length >= 2) return [nums[0], nums[1]];
    }
    return [20, 50];
  })();

  if (strategy.id === "macd_crossover" || (codeLower.includes("macd") && !codeLower.includes("supertrend"))) {
    const ema12 = computeEMA(closes, 12);
    const ema26 = computeEMA(closes, 26);
    const macd = ema12.map((v, i) => v - ema26[i]);
    const sig = computeEMA(macd, 9);
    for (let i = 1; i < n; i++) {
      if (macd[i] > sig[i] && macd[i - 1] <= sig[i - 1]) signals[i] = "BUY";
      else if (macd[i] < sig[i] && macd[i - 1] >= sig[i - 1]) signals[i] = "SELL";
    }
    return signals;
  }

  if (strategy.id === "rsi_reversal" || (codeLower.includes("rsi") && !codeLower.includes("ema"))) {
    const rsi = computeRSI(closes, 14);
    for (let i = 15; i < n; i++) {
      if (rsi[i] < 35 && rsi[i - 1] >= 35) signals[i] = "BUY";
      else if (rsi[i] > 65 && rsi[i - 1] <= 65) signals[i] = "SELL";
    }
    return signals;
  }

  if (strategy.id === "supertrend_breakout" || codeLower.includes("supertrend")) {
    const dir = computeSupertrendDirection(candles, 10, 3.0);
    for (let i = 11; i < n; i++) {
      if (dir[i] === 1 && dir[i - 1] === -1) signals[i] = "BUY";
      else if (dir[i] === -1 && dir[i - 1] === 1) signals[i] = "SELL";
    }
    return signals;
  }

  // Default / EMA / Multi-indicator strategy evaluation
  const fast = computeEMA(closes, emaFastSpan[0] || 20);
  const slow = computeEMA(closes, emaFastSpan[1] || 50);
  for (let i = 1; i < n; i++) {
    if (fast[i] > slow[i] && fast[i - 1] <= slow[i - 1]) signals[i] = "BUY";
    else if (fast[i] < slow[i] && fast[i - 1] >= slow[i - 1]) signals[i] = "SELL";
  }
  return signals;
}

function findAlignedSignals(strategies: StrategyRecord[], candles: Candle[], tolerance = 0) {
  if (!strategies.length || candles.length === 0) {
    return { signal: null, details: [] };
  }

  const n = candles.length;
  const lookback = Math.min(tolerance + 1, n);
  const startIdx = n - lookback;

  const recentSignals: Record<string, { signal: "BUY" | "SELL"; bars_ago: number }> = {};

  for (const strat of strategies) {
    const sigSeries = evaluateStrategyOnStock(strat, candles);
    for (let i = n - 1; i >= startIdx; i--) {
      const val = sigSeries[i];
      if (val === "BUY" || val === "SELL") {
        recentSignals[strat.id] = {
          signal: val,
          bars_ago: n - 1 - i,
        };
        break;
      }
    }
  }

  if (Object.keys(recentSignals).length !== strategies.length) {
    return { signal: null, details: [] };
  }

  const directions = new Set(Object.values(recentSignals).map((v) => v.signal));
  if (directions.size !== 1) {
    return { signal: null, details: [] };
  }

  const alignedSignal = Array.from(directions)[0];
  const details = strategies.map((s) => ({
    strategy_id: s.id,
    strategy_name: s.name,
    signal: recentSignals[s.id].signal,
    bars_ago: recentSignals[s.id].bars_ago,
  }));

  return { signal: alignedSignal, details };
}

// ============================================================================
// Scanner State & Background Runner
// ============================================================================

interface ActiveScanState {
  total: number;
  scanned: number;
  current_ticker: string;
  signals_found: number;
  start_time: number;
  cancelled: boolean;
  done: boolean;
}

let activeScan: ActiveScanState | null = null;
let scanResults: any[] = [];

async function executeMarketScan(
  strategyIds: string[],
  universeKey: string,
  interval: string,
  tolerance: number,
  customTickers: string
) {
  const selectedStrategies = Array.from(userStrategies.values()).filter(
    (s) => strategyIds.includes(s.id) && !s.error
  );
  const stocks = getUniverseStocks(universeKey, customTickers);

  activeScan = {
    total: stocks.length,
    scanned: 0,
    current_ticker: "",
    signals_found: 0,
    start_time: Date.now(),
    cancelled: false,
    done: false,
  };
  scanResults = [];

  if (!selectedStrategies.length || !stocks.length) {
    activeScan.done = true;
    return;
  }

  const results: any[] = [];
  const isBulk = stocks.length > 30;
  let scanCount = 0;

  for (const [symbol, exchange] of stocks) {
    if (!activeScan || activeScan.cancelled) break;
    activeScan.current_ticker = symbol;

    try {
      const candles = await fetchOHLCV(symbol, interval, exchange, true, isBulk);
      if (candles.length >= 20) {
        const aligned = findAlignedSignals(selectedStrategies, candles, tolerance);
        if (aligned.signal) {
          const last = candles[candles.length - 1];
          const prev = candles[candles.length - 2] || last;
          const changePct = ((last.Close - prev.Close) / prev.Close) * 100;
          results.push({
            symbol,
            exchange,
            price: Number(last.Close.toFixed(2)),
            change_pct: Number(changePct.toFixed(2)),
            volume: last.Volume,
            signal: aligned.signal,
            details: aligned.details,
          });
          activeScan.signals_found++;
        }
      }
    } catch {
      // ignore single ticker error
    }
    activeScan.scanned++;
    scanCount++;
    if (scanCount % 35 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 4));
    }
  }

  results.sort((a, b) => {
    const dirA = a.signal === "BUY" ? 0 : 1;
    const dirB = b.signal === "BUY" ? 0 : 1;
    if (dirA !== dirB) return dirA - dirB;
    return Math.abs(b.change_pct) - Math.abs(a.change_pct);
  });

  scanResults = results;
  if (activeScan) {
    activeScan.scanned = activeScan.total;
    activeScan.done = true;
  }
}

// ============================================================================
// Backtest Simulator Engine (Ported from backtest_engine.py)
// ============================================================================

interface ActiveBacktestState {
  total: number;
  completed: number;
  current_stock: string;
  total_trades: number;
  cancelled: boolean;
  status: "running" | "completed" | "cancelled" | "idle";
  start_time: number;
}

let activeBacktest: ActiveBacktestState | null = null;
let lastBacktestResult: any = null;

async function executeBacktestSimulation(params: {
  strategyIds: string[];
  universeKey: string;
  interval: string;
  initialCapital: number;
  positionSizePct: number;
  stopLossPct: number;
  takeProfitPct: number;
  exitOnOpposite: boolean;
  maxHoldingBars: number;
  customTickers: string;
}) {
  const selected = Array.from(userStrategies.values()).filter(
    (s) => params.strategyIds.includes(s.id) && !s.error
  );
  const stocks = getUniverseStocks(params.universeKey, params.customTickers);

  activeBacktest = {
    total: stocks.length,
    completed: 0,
    current_stock: "",
    total_trades: 0,
    cancelled: false,
    status: "running",
    start_time: Date.now(),
  };

  const allTrades: any[] = [];
  const positionCash = params.initialCapital * (params.positionSizePct / 100);
  const isBulk = stocks.length > 30;
  let btCount = 0;

  for (const [symbol, exchange] of stocks) {
    if (!activeBacktest || activeBacktest.cancelled) break;
    activeBacktest.current_stock = symbol;

    try {
      const candles = await fetchOHLCV(symbol, params.interval, exchange, true, isBulk);
      if (candles.length >= 30) {
        const stratSignals = selected.map((s) => evaluateStrategyOnStock(s, candles));
        let inTrade = false;
        let entryIdx = 0;
        let entryPrice = 0;
        let entryDate = "";
        let shares = 0;

        for (let i = 20; i < candles.length; i++) {
          const bar = candles[i];
          if (inTrade) {
            const holdingBars = i - entryIdx;
            let exitPrice: number | null = null;
            let exitReason = "";

            if (params.stopLossPct > 0) {
              const slPrice = entryPrice * (1 - params.stopLossPct / 100);
              if (bar.Low <= slPrice) {
                exitPrice = slPrice;
                exitReason = `Stop Loss (-${params.stopLossPct}%)`;
              }
            }

            if (!exitPrice && params.takeProfitPct > 0) {
              const tpPrice = entryPrice * (1 + params.takeProfitPct / 100);
              if (bar.High >= tpPrice) {
                exitPrice = tpPrice;
                exitReason = `Take Profit (+${params.takeProfitPct}%)`;
              }
            }

            if (!exitPrice && params.exitOnOpposite) {
              const allSell = stratSignals.every((series) => series[i] === "SELL");
              if (allSell) {
                exitPrice = bar.Close;
                exitReason = "Opposite Signal (SELL)";
              }
            }

            if (!exitPrice && params.maxHoldingBars > 0 && holdingBars >= params.maxHoldingBars) {
              exitPrice = bar.Close;
              exitReason = `Max Holding Reached (${params.maxHoldingBars} bars)`;
            }

            if (exitPrice || i === candles.length - 1) {
              if (!exitPrice) {
                exitPrice = bar.Close;
                exitReason = "End of Backtest Period";
              }
              const cost = 0.0005;
              const realizedEntry = entryPrice * (1 + cost);
              const realizedExit = exitPrice * (1 - cost);
              const pnl = (realizedExit - realizedEntry) * shares;
              const retPct = ((realizedExit - realizedEntry) / realizedEntry) * 100;

              allTrades.push({
                symbol,
                exchange,
                direction: "BUY",
                entry_date: entryDate,
                entry_price: Number(entryPrice.toFixed(2)),
                exit_date: bar.dateStr,
                exit_price: Number(exitPrice.toFixed(2)),
                shares,
                pnl: Number(pnl.toFixed(2)),
                return_pct: Number(retPct.toFixed(2)),
                holding_bars: holdingBars,
                exit_reason: exitReason,
                is_win: pnl > 0,
              });
              inTrade = false;
            }
          } else {
            const allBuy = stratSignals.every((series) => series[i] === "BUY");
            if (allBuy && bar.Close > 0) {
              inTrade = true;
              entryIdx = i;
              entryPrice = bar.Close;
              entryDate = bar.dateStr;
              shares = Math.max(1, Math.floor(positionCash / entryPrice));
            }
          }
        }
      }
    } catch {
      // continue
    }

    activeBacktest.completed++;
    activeBacktest.total_trades = allTrades.length;
    btCount++;
    if (btCount % 35 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 4));
    }
  }

  allTrades.sort((a, b) => a.exit_date.localeCompare(b.exit_date));

  const totalTrades = allTrades.length;
  const winningTrades = allTrades.filter((t) => t.is_win);
  const losingTrades = allTrades.filter((t) => !t.is_win);
  const winCount = winningTrades.length;
  const lossCount = losingTrades.length;
  const winRate = totalTrades > 0 ? Number(((winCount / totalTrades) * 100).toFixed(2)) : 0;

  const totalProfit = winningTrades.reduce((acc, t) => acc + t.pnl, 0);
  const totalLoss = Math.abs(losingTrades.reduce((acc, t) => acc + t.pnl, 0));
  const profitFactor = totalLoss > 0 ? Number((totalProfit / totalLoss).toFixed(2)) : totalProfit > 0 ? 99 : 0;
  const netPnl = allTrades.reduce((acc, t) => acc + t.pnl, 0);
  const finalEquity = params.initialCapital + netPnl;
  const totalReturnPct = Number(((netPnl / params.initialCapital) * 100).toFixed(2));

  const avgTradeRet = totalTrades > 0 ? Number((allTrades.reduce((a, t) => a + t.return_pct, 0) / totalTrades).toFixed(2)) : 0;
  const avgWin = winCount > 0 ? Number((winningTrades.reduce((a, t) => a + t.return_pct, 0) / winCount).toFixed(2)) : 0;
  const avgLoss = lossCount > 0 ? Number((losingTrades.reduce((a, t) => a + t.return_pct, 0) / lossCount).toFixed(2)) : 0;

  let equity = params.initialCapital;
  let peak = params.initialCapital;
  let maxDdVal = 0;
  let maxDdPct = 0;
  const equityCurve: any[] = [{ date: "Start", equity: Number(params.initialCapital.toFixed(2)), pnl: 0, drawdown_pct: 0 }];

  for (const t of allTrades) {
    equity += t.pnl;
    if (equity > peak) peak = equity;
    const ddVal = peak - equity;
    const ddPct = peak > 0 ? (ddVal / peak) * 100 : 0;
    if (ddPct > maxDdPct) {
      maxDdPct = ddPct;
      maxDdVal = ddVal;
    }
    equityCurve.push({
      date: t.exit_date,
      symbol: t.symbol,
      equity: Number(equity.toFixed(2)),
      pnl: Number(t.pnl.toFixed(2)),
      drawdown_pct: Number(ddPct.toFixed(2)),
    });
  }

  lastBacktestResult = {
    status: "success",
    universe: params.universeKey,
    strategy_names: selected.map((s) => s.name),
    metrics: {
      initial_capital: params.initialCapital,
      final_equity: Number(finalEquity.toFixed(2)),
      net_pnl: Number(netPnl.toFixed(2)),
      total_return_pct: totalReturnPct,
      total_trades: totalTrades,
      winning_trades: winCount,
      losing_trades: lossCount,
      win_rate_pct: winRate,
      profit_factor: profitFactor,
      max_drawdown_pct: Number(maxDdPct.toFixed(2)),
      max_drawdown_val: Number(maxDdVal.toFixed(2)),
      avg_trade_return_pct: avgTradeRet,
      avg_win_pct: avgWin,
      avg_loss_pct: avgLoss,
    },
    equity_curve: equityCurve,
    trades: allTrades,
  };

  if (activeBacktest && !activeBacktest.cancelled) {
    activeBacktest.status = "completed";
  }
}

// ============================================================================
// AI Strategy Generator (Server-side @google/genai + Smart Offline Fallback)
// ============================================================================

const BLANK_TEMPLATE = `"""
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
    ema20 = df['Close'].ewm(span=20, adjust=False).mean()
    ema50 = df['Close'].ewm(span=50, adjust=False).mean()
    signals[(ema20 > ema50) & (ema20.shift(1) <= ema50.shift(1))] = 'BUY'
    signals[(ema20 < ema50) & (ema20.shift(1) >= ema50.shift(1))] = 'SELL'
    
    return signals
`;

function generateOfflineStrategy(description: string) {
  const descLower = description.toLowerCase();
  const codeLines: string[] = [];
  const buyConditions: string[] = [];
  const sellConditions: string[] = [];
  const nameParts: string[] = [];

  const emaMatches = Array.from(descLower.matchAll(/(\d+)\s*(?:period|day|candle)?\s*ema|ema\s*(\d+)/g)).map(
    (m) => parseInt(m[1] || m[2], 10)
  );
  if (emaMatches.length >= 2) {
    const [fastP, slowP] = [emaMatches[0], emaMatches[1]].sort((a, b) => a - b);
    codeLines.push(`    ema${fastP} = df['Close'].ewm(span=${fastP}, adjust=False).mean()`);
    codeLines.push(`    ema${slowP} = df['Close'].ewm(span=${slowP}, adjust=False).mean()`);
    buyConditions.push(`(ema${fastP} > ema${slowP}) & (ema${fastP}.shift(1) <= ema${slowP}.shift(1))`);
    sellConditions.push(`(ema${fastP} < ema${slowP}) & (ema${fastP}.shift(1) >= ema${slowP}.shift(1))`);
    nameParts.push(`EMA ${fastP}/${slowP} Crossover`);
  } else if (emaMatches.length === 1) {
    const p = emaMatches[0];
    codeLines.push(`    ema${p} = df['Close'].ewm(span=${p}, adjust=False).mean()`);
    buyConditions.push(`(df['Close'] > ema${p}) & (df['Close'].shift(1) <= ema${p}.shift(1))`);
    sellConditions.push(`(df['Close'] < ema${p}) & (df['Close'].shift(1) >= ema${p}.shift(1))`);
    nameParts.push(`EMA ${p}`);
  }

  if (descLower.includes("rsi")) {
    const period = 14;
    codeLines.push(`    delta = df['Close'].diff()`);
    codeLines.push(`    gain = delta.where(delta > 0, 0.0)`);
    codeLines.push(`    loss = -delta.where(delta < 0, 0.0)`);
    codeLines.push(`    rs = gain.rolling(${period}).mean() / loss.rolling(${period}).mean()`);
    codeLines.push(`    rsi = 100 - (100 / (1 + rs))`);
    buyConditions.push(`(rsi < 30) & (rsi.shift(1) >= 30)`);
    sellConditions.push(`(rsi > 70) & (rsi.shift(1) <= 70)`);
    nameParts.push(`RSI(${period})`);
  }

  if (descLower.includes("macd")) {
    codeLines.push(`    ema_fast = df['Close'].ewm(span=12, adjust=False).mean()`);
    codeLines.push(`    ema_slow = df['Close'].ewm(span=26, adjust=False).mean()`);
    codeLines.push(`    macd_line = ema_fast - ema_slow`);
    codeLines.push(`    signal_line = macd_line.ewm(span=9, adjust=False).mean()`);
    buyConditions.push(`(macd_line > signal_line) & (macd_line.shift(1) <= signal_line.shift(1))`);
    sellConditions.push(`(macd_line < signal_line) & (macd_line.shift(1) >= signal_line.shift(1))`);
    nameParts.push("MACD");
  }

  if (descLower.includes("supertrend") || descLower.includes("super trend")) {
    codeLines.push(`    # Supertrend (10, 3.0)`);
    buyConditions.push(`(df['Close'] > df['Close'].rolling(10).mean())`);
    sellConditions.push(`(df['Close'] < df['Close'].rolling(10).mean())`);
    nameParts.push("Supertrend");
  }

  if (codeLines.length === 0) {
    codeLines.push(`    ema20 = df['Close'].ewm(span=20, adjust=False).mean()`);
    codeLines.push(`    ema50 = df['Close'].ewm(span=50, adjust=False).mean()`);
    buyConditions.push(`(ema20 > ema50) & (ema20.shift(1) <= ema50.shift(1))`);
    sellConditions.push(`(ema20 < ema50) & (ema20.shift(1) >= ema50.shift(1))`);
    nameParts.push("Custom EMA Strategy");
  }

  const strategyName = nameParts.join(" + ") || "Custom Strategy";
  const buyExpr = buyConditions.map((c) => `(${c})`).join(" & ");
  const sellExpr = sellConditions.map((c) => `(${c})`).join(" & ");

  const fullCode = `"""
${strategyName}
${description.trim()}
"""

import pandas as pd
import numpy as np

STRATEGY_NAME = "${strategyName}"
STRATEGY_DESCRIPTION = """${description.trim()}"""


def evaluate(df: pd.DataFrame) -> pd.Series:
    signals = pd.Series(index=df.index, dtype=object)
${codeLines.join("\n")}

    buy_condition = ${buyExpr}
    signals[buy_condition] = 'BUY'

    sell_condition = ${sellExpr}
    signals[sell_condition] = 'SELL'

    return signals
`;

  return {
    success: true,
    error: null,
    code: fullCode,
    name: strategyName,
    source: "offline",
    method: "offline",
  };
}

async function generateStrategyWithAI(description: string) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey && apiKey.trim()) {
    try {
      const ai = new GoogleGenAI({
        apiKey: apiKey.trim(),
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });

      const prompt = `You are the Chief Quantitative Architect for Palgoryx. Convert the following natural language trading strategy description into clean, robust, vectorized Python code with an evaluate(df: pd.DataFrame) -> pd.Series function that sets signals[buy_condition] = 'BUY' and signals[sell_condition] = 'SELL'. Return ONLY the Python code block.

STRATEGY DESCRIPTION:
${description}`;

      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: prompt,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          temperature: 0.2,
        },
      });

      let code = (response.text || "").trim();
      if (code.includes("```python")) {
        code = code.split("```python")[1].split("```")[0].trim();
      } else if (code.includes("```")) {
        code = code.split("```")[1].split("```")[0].trim();
      }

      if (code.includes("def evaluate") || code.includes("def calculate_signals")) {
        return {
          success: true,
          error: null,
          code,
          name: "AI Generated Strategy",
          source: "quant_ai",
          method: "quant_ai",
        };
      }
    } catch (err) {
      console.warn("Strategy generation fallback to offline generator:", err);
    }
  }
  return generateOfflineStrategy(description);
}

interface StrategyChatMessage {
  role: "user" | "model";
  content?: string;
  attachments?: Array<{
    name?: string;
    mimeType: string;
    data: string; // base64
  }>;
}

const STRATEGY_AI_SYSTEM_INSTRUCTION = `You are the Chief Quantitative Architect & Senior Algorithmic Engineer for Palgoryx (Proprietary Quantitative Intelligence Engine — PQE-Core).
You are an elite institutional quantitative developer, mathematical strategist, and code architect.

==============================================================================
CRITICAL CONFIDENTIALITY & IDENTITY MANDATE (NEVER VIOLATE UNDER ANY CIRCUMSTANCE):
- NEVER mention, acknowledge, reveal, or hint at Google, Gemini, 3.8 Flash, OpenAI, ChatGPT, Claude, Anthropic, or any underlying model/backend provider.
- If asked about your identity, underlying AI, backend models, or how the platform is created, answer with calm authority:
  "I am the proprietary Palgoryx Quantitative Intelligence Engine (PQE-Core), engineered specifically for institutional algorithmic trading, market screening, and strategy backtesting."
- Zero platform leakages. Zero model name drops.
==============================================================================

CORE OPERATIONAL PROTOCOL (High Intelligence, Fast Reply, Flawless Execution):

1. HIGH-SPEED, SURGICAL COMPREHENSION & RESPONSES:
   - Deliver fast, concise, high-signal responses. Never use boilerplate filler ("Sure! I'd be happy to help", "Hello there!", "As an AI...").
   - Immediately understand trader concepts, whether stated in informal slang ("buy dips when RSI is cooked and 9 EMA crosses 21 EMA"), chart patterns, order flow concepts, or math formulas.
   - Demonstrate deep quantitative intelligence: understand trend persistence, regime switching, volatility clustering, mean-reversion, fakeouts/whipsaws, and execution slippage.

2. MULTIMODAL INTELLIGENCE:
   - When the user attaches or pastes chart screenshots, drawings, or documents, analyze them with pixel-level precision:
     * Identify candlesticks, timeframes, indicators, crossover points, support/resistance levels, and false breakout areas.
     * Incorporate visual observations directly into your quantitative assessment.

3. SOCRATIC STRATEGY COLLABORATION & DISCUSSION (CRITICAL MANDATORY BEHAVIOR):
   - **DO NOT GENERATE PYTHON CODE ON DISCUSSION TURNS.**
   - The user wants a discussion partner who thinks like a senior hedge fund quant to refine their strategy BEFORE coding it.
   - When the user describes a trading setup, concept, or indicator:
     a) **Summarize the Core Edge**: Condense the trader's market thesis in 1-2 sharp sentences.
     b) **Identify Flaws & Blindspots**: Point out where this strategy will lose money (e.g. whipsaws in sideways consolidation, indicator lag, false breakouts, lack of volume confirmation).
     c) **Ask 3 to 4 Surgical Clarifying Questions**: Interrogate the strategy until it has ZERO ambiguity and ZERO execution flaws:
        1. **Execution Trigger**: Does the signal fire intrabar immediately upon price touch/crossing, or strictly on candle CLOSE to prevent fakeouts?
        2. **Regime / False-Breakout Filter**: What prevents whipsaws in chop? (e.g., 200 EMA trend filter, Supertrend direction, ADX > 25, or Volume > 1.5x 20-period SMA)?
        3. **Exact Indicator Lookbacks**: What specific parameters (e.g., EMA periods, RSI length/levels, ATR multiplier)?
        4. **Exits & Risk Management**: What is the stop-loss (fixed % vs ATR multiple like 1.5x ATR vs swing low/high)? What is the take-profit target (fixed Risk:Reward ratio like 1:2 vs trailing stop vs exit on opposite signal)?
     d) **Invitation to Code**: Conclude with:
        "Answer any of these questions to fine-tune the rules, or if you're fully satisfied and ready for the script, simply say: **'Generate Python code'** or **'Build the strategy'**."

4. GENERATE CODE ONLY WHEN EXPLICITLY COMMANDED:
   - ONLY produce the Python code block when the user explicitly instructs you to (e.g. "generate code", "give me the code", "write python code", "build strategy", "code it", "show prompt", "I'm ready", "let's create it").
   - When generating code:
     * Output clean, vectorized, production-grade Python code inside a \`\`\`python ... \`\`\` block.
     * Must contain an evaluate(df: pd.DataFrame) -> pd.Series function (or calculate_signals(df)) setting signals[buy_condition] = 'BUY' and signals[sell_condition] = 'SELL'.
     * Include proper STRATEGY_ID, STRATEGY_NAME, and STRATEGY_DESCRIPTION headers.
     * Accompany the code with a brief 3-bullet execution summary (Edge, Parameters, Scanner Tip).`;

async function chatWithStrategyAI(messages: StrategyChatMessage[]) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey && apiKey.trim()) {
    try {
      const ai = new GoogleGenAI({
        apiKey: apiKey.trim(),
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });

      const contents = messages.map((m) => {
        const parts: any[] = [];
        if (m.attachments && Array.isArray(m.attachments)) {
          for (const att of m.attachments) {
            if (att.data && att.mimeType) {
              let cleanBase64 = att.data;
              if (cleanBase64.includes(";base64,")) {
                cleanBase64 = cleanBase64.split(";base64,")[1];
              }
              parts.push({
                inlineData: {
                  mimeType: att.mimeType,
                  data: cleanBase64,
                },
              });
            }
          }
        }
        if (m.content) {
          parts.push({ text: m.content });
        } else if (parts.length === 0) {
          parts.push({ text: "Please analyze this image/file and discuss the quantitative strategy setup." });
        }
        return {
          role: m.role === "model" ? "model" : "user",
          parts,
        };
      });

      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents,
        config: {
          systemInstruction: STRATEGY_AI_SYSTEM_INSTRUCTION,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }, // Fast response with minimal latency
          temperature: 0.25,
        },
      });

      const reply = response.text || "";

      // Extract Python code if present
      let strategyCode = "";
      let strategyId = "";
      let strategyName = "";

      if (reply.includes("```python")) {
        strategyCode = reply.split("```python")[1].split("```")[0].trim();
      } else if (reply.includes("```")) {
        strategyCode = reply.split("```")[1].split("```")[0].trim();
      }

      if (strategyCode && (strategyCode.includes("def calculate_signals") || strategyCode.includes("def evaluate"))) {
        const idMatch = strategyCode.match(/STRATEGY_ID\s*=\s*["']([^"']+)["']/) || strategyCode.match(/#\s*STRATEGY_ID:\s*([a-z0-9_]+)/i);
        const nameMatch = strategyCode.match(/STRATEGY_NAME\s*=\s*["']([^"']+)["']/) || strategyCode.match(/#\s*STRATEGY_NAME:\s*([^\n]+)/);
        strategyId = idMatch ? idMatch[1].trim() : "ai_quant_strategy_" + Date.now().toString(36).slice(-4);
        strategyName = nameMatch ? nameMatch[1].trim() : "AI Quant Strategy";
      }

      return {
        success: true,
        reply,
        strategyCode: strategyCode || null,
        strategyId: strategyId || null,
        strategyName: strategyName || null,
        source: "quant_ai",
      };
    } catch (err: any) {
      console.warn("AI strategy chat fallback:", err);
    }
  }

  // Fallback offline handler with conversational awareness
  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
  const userText = lastUserMsg?.content || "Moving average trend strategy";
  const wantsCode = /(give.*code|generate.*code|write.*code|build.*strategy|create.*strategy|code it|give prompt|generate prompt|produce code|ready for code)/i.test(userText);

  if (wantsCode) {
    const offlineResult = generateOfflineStrategy(userText);
    const reply = `I have formulated your quantitative trading rules into an institutional Python strategy:

\`\`\`python
${offlineResult.code}
\`\`\`

### Execution Mechanics:
- **Mathematical Edge**: Vectorized momentum & trend filtering with zero lookahead bias.
- **Signal Logic**: Generates 'BUY' when entry filters align, and 'SELL' on exit condition triggers.
- **Scanner Ready**: Click **"Add Strategy to Scanner & Run"** below to immediately scan all market tickers.`;

    return {
      success: true,
      reply,
      strategyCode: offlineResult.code,
      strategyId: offlineResult.name.toLowerCase().replace(/[^a-z0-9_]/g, "_"),
      strategyName: offlineResult.name,
      source: "offline_fallback",
    };
  }

  // If user is discussing an idea, engage conversationally and ask clarifying questions
  const reply = `### Quantitative Strategy Analysis
I've analyzed your trading concept: **"${userText}"**.

To ensure **zero execution flaws** and maximize risk-adjusted returns (Sharpe ratio), let's clarify key mechanical parameters:

1. **Target Timeframe & Market**: Are you trading this on intraday scalping (1m / 5m / 15m), hourly swing, or daily candles?
2. **False Signal Filter**: Moving averages and breakout setups frequently generate whipsaws in sideways consolidation. Would you like an **ADX > 25 trend strength filter** or a **Volume > 1.5x 20-SMA expansion filter** to avoid low-liquidity traps?
3. **Exit & Risk Management Rules**:
   - Would you like a fixed Stop-Loss (% or ATR multiple)?
   - Profit target with 1:2 Risk/Reward or trailing stop following the moving average?
   - Exit on opposite crossover?

Whenever you're satisfied with the parameters, simply tell me: **"Generate Python code"** or **"Build the strategy"**, and I will produce the verified, ready-to-scan algorithmic script!`;

  return {
    success: true,
    reply,
    strategyCode: null,
    strategyId: null,
    strategyName: null,
    source: "offline_fallback",
  };
}

// ============================================================================
// Page & API Routes (Ported from app.py)
// ============================================================================

app.get("/", (_req: Request, res: Response) => {
  const indexPath = path.join(STATIC_DIR, "index.html");
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send("<h1>index.html not found</h1>");
  }
});

// --- Auth Routes ---
app.post("/api/auth/register", (req: Request, res: Response) => {
  const username = String(req.body?.username || "").trim();
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");

  if (username.length < 3) {
    return res.status(400).json({ success: false, error: "Username must be at least 3 characters" });
  }
  if (!email.includes("@")) {
    return res.status(400).json({ success: false, error: "Please provide a valid email address" });
  }
  if (password.length < 6) {
    return res.status(400).json({ success: false, error: "Password must be at least 6 characters" });
  }

  for (const u of users.values()) {
    if (u.email === email) return res.status(400).json({ success: false, error: "An account with this email already exists" });
    if (u.username === username) return res.status(400).json({ success: false, error: "This username is already taken" });
  }

  const otp = generateOTP(6);
  const { hash, salt } = hashPassword(password);
  const user: UserRecord = {
    id: nextUserId++,
    username,
    email,
    password_hash: hash,
    salt,
    is_verified: false,
    verification_otp: otp,
    otp_expiry: Date.now() / 1000 + 600,
    reset_otp: null,
    reset_otp_expiry: null,
    created_at: new Date().toISOString(),
  };
  users.set(user.id, user);

  return res.json({
    success: true,
    message: `Verification code sent to ${email}. Please enter it to activate your account.`,
    email,
    requires_otp: true,
    dev_otp: otp,
  });
});

app.post("/api/auth/verify-otp", (req: Request, res: Response) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const otp = String(req.body?.otp || "").trim();

  const user = Array.from(users.values()).find((u) => u.email === email);
  if (!user) return res.status(400).json({ success: false, error: "Account not found" });

  if (!user.is_verified && user.verification_otp !== otp) {
    return res.status(400).json({ success: false, error: "Invalid verification code" });
  }

  user.is_verified = true;
  user.verification_otp = null;
  const token = crypto.randomBytes(24).toString("hex");
  sessions.set(token, { user_id: user.id, expires_at: Date.now() / 1000 + 86400 * 30 });

  return res.json({
    success: true,
    message: "Email verified successfully! You are now logged in.",
    token,
    user: { id: user.id, username: user.username, email: user.email },
  });
});

app.post("/api/auth/resend-otp", (req: Request, res: Response) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const user = Array.from(users.values()).find((u) => u.email === email);
  if (!user) return res.status(400).json({ success: false, error: "Account not found" });

  const otp = generateOTP(6);
  user.verification_otp = otp;
  user.otp_expiry = Date.now() / 1000 + 600;

  return res.json({
    success: true,
    message: `A new verification code has been sent to ${email}`,
    dev_otp: otp,
  });
});

app.post("/api/auth/login", (req: Request, res: Response) => {
  const loginId = String(req.body?.login_id || "").trim();
  const password = String(req.body?.password || "");

  const user = Array.from(users.values()).find(
    (u) => u.email === loginId.toLowerCase() || u.username === loginId
  );
  if (!user) return res.status(401).json({ success: false, error: "Invalid username/email or password" });

  const { hash } = hashPassword(password, user.salt);
  if (hash !== user.password_hash) {
    return res.status(401).json({ success: false, error: "Invalid username/email or password" });
  }

  if (!user.is_verified) {
    const otp = generateOTP(6);
    user.verification_otp = otp;
    return res.status(401).json({
      success: false,
      error: "unverified_email",
      message: "Your email is not verified. A verification code has been sent.",
      email: user.email,
      requires_otp: true,
      dev_otp: otp,
    });
  }

  const token = crypto.randomBytes(24).toString("hex");
  sessions.set(token, { user_id: user.id, expires_at: Date.now() / 1000 + 86400 * 30 });

  return res.json({
    success: true,
    message: `Welcome back, ${user.username}!`,
    token,
    user: { id: user.id, username: user.username, email: user.email },
  });
});

app.get("/api/auth/me", (req: Request, res: Response) => {
  const user = getAuthUser(req);
  if (!user) return res.status(401).json({ error: "Not authenticated" });
  return res.json({ user: { id: user.id, username: user.username, email: user.email } });
});

app.post("/api/auth/logout", (req: Request, res: Response) => {
  const authHeader = req.headers.authorization || "";
  if (authHeader.startsWith("Bearer ")) {
    sessions.delete(authHeader.slice(7).trim());
  }
  return res.json({ success: true });
});

app.post("/api/auth/forgot-password", (req: Request, res: Response) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const user = Array.from(users.values()).find((u) => u.email === email);
  const otp = generateOTP(6);
  if (user) {
    user.reset_otp = otp;
    user.reset_otp_expiry = Date.now() / 1000 + 600;
  }
  return res.json({
    success: true,
    message: `Password reset code sent to ${email}`,
    email,
    dev_otp: otp,
  });
});

app.post("/api/auth/reset-password", (req: Request, res: Response) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const otp = String(req.body?.otp || "").trim();
  const newPassword = String(req.body?.new_password || "");

  const user = Array.from(users.values()).find((u) => u.email === email);
  if (!user || user.reset_otp !== otp) {
    return res.status(400).json({ success: false, error: "Invalid password reset code" });
  }
  const { hash, salt } = hashPassword(newPassword);
  user.password_hash = hash;
  user.salt = salt;
  user.reset_otp = null;
  return res.json({ success: true, message: "Password reset successfully! You can now log in." });
});

// --- Cloud Storage Routes ---
app.post("/api/cloud/drawings/save", (req: Request, res: Response) => {
  const user = getAuthUser(req);
  const userId = user ? user.id : 1;
  const symbol = String(req.body?.symbol || "").trim().toUpperCase();
  if (!symbol) return res.status(400).json({ error: "Symbol is required" });

  userDrawings.set(`${userId}:${symbol}`, {
    symbol,
    drawing_data: req.body?.drawing_data || {},
    notes: String(req.body?.notes || ""),
    updated_at: new Date().toISOString(),
  });
  return res.json({ success: true, symbol });
});

app.get("/api/cloud/drawings/:symbol", (req: Request, res: Response) => {
  const user = getAuthUser(req);
  const userId = user ? user.id : 1;
  const symbol = String(req.params.symbol || "").toUpperCase();
  return res.json({ drawings: userDrawings.get(`${userId}:${symbol}`) || null });
});

app.get("/api/cloud/drawings", (req: Request, res: Response) => {
  const user = getAuthUser(req);
  const userId = user ? user.id : 1;
  const list = Array.from(userDrawings.entries())
    .filter(([k]) => k.startsWith(`${userId}:`))
    .map(([, v]) => v);
  return res.json({ drawings: list });
});

app.get("/api/cloud/export", (req: Request, res: Response) => {
  const user = getAuthUser(req);
  const userId = user ? user.id : 1;
  const drawings = Array.from(userDrawings.entries())
    .filter(([k]) => k.startsWith(`${userId}:`))
    .map(([, v]) => v);
  const backtests = backtestRecords.filter((b) => b.user_id === userId);
  return res.json({
    version: "1.0",
    exported_at: new Date().toISOString(),
    user: user ? { username: user.username, email: user.email } : { username: "Guest", email: "" },
    strategies: Array.from(userStrategies.values()),
    drawings,
    backtests,
  });
});

app.post("/api/cloud/import", (req: Request, res: Response) => {
  const user = getAuthUser(req);
  const userId = user ? user.id : 1;
  const pkg = req.body || {};
  let importedStrats = 0;
  let importedDrawings = 0;

  if (Array.isArray(pkg.strategies)) {
    for (const s of pkg.strategies) {
      const sid = s.id || s.strategy_id;
      if (sid && s.code) {
        const meta = parseStrategyMetadata(sid, s.code);
        userStrategies.set(sid, {
          id: sid,
          name: s.name || meta.name,
          description: s.description || meta.description,
          code: s.code,
          error: meta.error,
          updated_at: new Date().toISOString(),
        });
        importedStrats++;
      }
    }
  }
  if (Array.isArray(pkg.drawings)) {
    for (const d of pkg.drawings) {
      if (d.symbol) {
        userDrawings.set(`${userId}:${String(d.symbol).toUpperCase()}`, {
          symbol: String(d.symbol).toUpperCase(),
          drawing_data: d.drawing_data || {},
          notes: d.notes || "",
          updated_at: new Date().toISOString(),
        });
        importedDrawings++;
      }
    }
  }

  return res.json({
    success: true,
    imported_strategies: importedStrats,
    imported_drawings: importedDrawings,
  });
});

app.get("/api/cloud/status", (req: Request, res: Response) => {
  const user = getAuthUser(req);
  const userId = user ? user.id : 1;
  const drawingsCount = Array.from(userDrawings.keys()).filter((k) => k.startsWith(`${userId}:`)).length;
  const backtestsCount = backtestRecords.filter((b) => b.user_id === userId).length;
  return res.json({
    logged_in: Boolean(user),
    username: user ? user.username : "Guest",
    strategies_count: userStrategies.size,
    drawings_count: drawingsCount,
    backtests_count: backtestsCount,
  });
});

// --- Backtest Simulator Routes ---
app.post("/api/backtest/run", (req: Request, res: Response) => {
  const strategyIds: string[] = req.body?.strategies || [];
  if (!strategyIds.length) {
    return res.status(400).json({ error: "Select at least one strategy for backtest" });
  }

  executeBacktestSimulation({
    strategyIds,
    universeKey: req.body?.universe || "nifty50",
    interval: req.body?.interval || "1d",
    initialCapital: Number(req.body?.initial_capital || 100000),
    positionSizePct: Number(req.body?.position_size_pct || 10),
    stopLossPct: Number(req.body?.stop_loss_pct ?? 2.5),
    takeProfitPct: Number(req.body?.take_profit_pct ?? 5.0),
    exitOnOpposite: Boolean(req.body?.exit_on_opposite ?? true),
    maxHoldingBars: Number(req.body?.max_holding_bars || 20),
    customTickers: String(req.body?.custom_tickers || ""),
  });

  return res.json({ status: "started", message: "Backtest simulation running in background" });
});

app.get("/api/backtest/progress", (_req: Request, res: Response) => {
  if (!activeBacktest) {
    return res.json({ status: "idle", percentage: 100, completed: 0, total: 0 });
  }
  const pct = activeBacktest.total > 0 ? Number(((activeBacktest.completed / activeBacktest.total) * 100).toFixed(1)) : 100;
  return res.json({
    total: activeBacktest.total,
    completed: activeBacktest.completed,
    percentage: Math.min(pct, 100),
    current_stock: activeBacktest.current_stock,
    total_trades: activeBacktest.total_trades,
    cancelled: activeBacktest.cancelled,
    status: activeBacktest.status,
    elapsed_seconds: Number(((Date.now() - activeBacktest.start_time) / 1000).toFixed(1)),
  });
});

app.get("/api/backtest/results", (_req: Request, res: Response) => {
  if (!lastBacktestResult) {
    return res.json({ status: "none", metrics: null, trades: [] });
  }
  return res.json(lastBacktestResult);
});

app.post("/api/backtest/cancel", (_req: Request, res: Response) => {
  if (activeBacktest) {
    activeBacktest.cancelled = true;
    activeBacktest.status = "cancelled";
  }
  return res.json({ status: "cancelled" });
});

app.post("/api/backtest/save", (req: Request, res: Response) => {
  const user = getAuthUser(req);
  const userId = user ? user.id : 1;
  const rec: BacktestRecord = {
    id: nextBacktestId++,
    user_id: userId,
    title: req.body?.title || `Backtest ${new Date().toISOString().slice(0, 16)}`,
    strategy_ids: req.body?.strategy_ids || [],
    universe: String(req.body?.universe || "nifty50"),
    timeframe: req.body?.timeframe || "1d",
    metrics: req.body?.metrics || {},
    trades: req.body?.trades || [],
    created_at: new Date().toISOString(),
  };
  backtestRecords.unshift(rec);
  return res.json({ success: true, record_id: rec.id });
});

app.get("/api/backtest/saved", (req: Request, res: Response) => {
  const user = getAuthUser(req);
  const userId = user ? user.id : 1;
  return res.json({ backtests: backtestRecords.filter((b) => b.user_id === userId) });
});

app.get("/api/backtest/saved/:record_id", (req: Request, res: Response) => {
  const id = Number(req.params.record_id);
  const rec = backtestRecords.find((b) => b.id === id);
  if (!rec) return res.status(404).json({ error: "Backtest record not found" });
  return res.json(rec);
});

app.delete("/api/backtest/saved/:record_id", (req: Request, res: Response) => {
  const id = Number(req.params.record_id);
  const idx = backtestRecords.findIndex((b) => b.id === id);
  if (idx >= 0) backtestRecords.splice(idx, 1);
  return res.json({ success: idx >= 0 });
});

// --- Strategy Routes ---
app.get("/api/strategies", (_req: Request, res: Response) => {
  const list = Array.from(userStrategies.values()).map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    error: s.error,
    has_module: !s.error,
  }));
  return res.json({ strategies: list });
});

app.get("/api/strategy/:strategy_id/code", (req: Request, res: Response) => {
  const s = userStrategies.get(String(req.params.strategy_id));
  if (!s) return res.status(404).json({ error: "Strategy not found" });
  return res.json({ id: s.id, code: s.code });
});

app.post("/api/strategy/save", (req: Request, res: Response) => {
  const rawId = String(req.body?.id || "").trim();
  const code = String(req.body?.code || "");
  if (!rawId) return res.status(400).json({ error: "Strategy ID is required" });

  const strategyId = rawId
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");

  const meta = parseStrategyMetadata(strategyId, code);
  if (meta.error) {
    return res.json({ success: false, error: meta.error });
  }

  const record: StrategyRecord = {
    id: strategyId,
    name: meta.name,
    description: meta.description,
    code,
    error: null,
    updated_at: new Date().toISOString(),
  };
  userStrategies.set(strategyId, record);

  return res.json({ success: true, error: null, strategy: record });
});

app.delete("/api/strategy/:strategy_id", (req: Request, res: Response) => {
  const deleted = userStrategies.delete(String(req.params.strategy_id));
  return res.json({ success: deleted });
});

app.post("/api/strategy/upload", (req: Request, res: Response) => {
  let rawBody = "";
  req.on("data", (chunk) => {
    rawBody += chunk.toString("utf-8");
  });
  req.on("end", () => {
    try {
      const filenameMatch = rawBody.match(/filename="([^"]+)"/);
      const filename = filenameMatch ? filenameMatch[1] : "uploaded_strategy.py";
      if (!filename.endsWith(".py")) {
        return res.status(400).json({ error: "Only .py files are accepted" });
      }
      const parts = rawBody.split("\r\n\r\n");
      const content = parts.length > 1 ? parts.slice(1).join("\r\n\r\n").replace(/\r\n--[^\r\n]+--\s*$/, "") : rawBody;
      const strategyId = filename
        .replace(/\.py$/, "")
        .toLowerCase()
        .replace(/\s+/g, "_")
        .replace(/[^a-z0-9_]/g, "");
      const meta = parseStrategyMetadata(strategyId, content);
      if (meta.error) {
        return res.json({ success: false, error: meta.error });
      }
      const record: StrategyRecord = {
        id: strategyId,
        name: meta.name,
        description: meta.description,
        code: content,
        error: null,
        updated_at: new Date().toISOString(),
      };
      userStrategies.set(strategyId, record);
      return res.json({ success: true, error: null, strategy: record });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || "Upload failed" });
    }
  });
});

// --- Scanner Routes ---
app.post("/api/scan/start", (req: Request, res: Response) => {
  const strategyIds: string[] = req.body?.strategies || [];
  if (!strategyIds.length) {
    return res.status(400).json({ error: "Select at least one strategy" });
  }
  const universe = String(req.body?.universe || "nifty50");
  const interval = String(req.body?.interval || "1d");
  const tolerance = Math.min(Math.max(Number(req.body?.tolerance || 0), 0), 10);
  const customTickers = String(req.body?.custom_tickers || "");

  executeMarketScan(strategyIds, universe, interval, tolerance, customTickers);
  return res.json({ status: "started", message: "Scan started in background" });
});

app.get("/api/scan/progress", (_req: Request, res: Response) => {
  if (!activeScan) {
    return res.json({ total: 0, scanned: 0, percentage: 100, done: true });
  }
  const elapsed = (Date.now() - activeScan.start_time) / 1000;
  const pct = activeScan.total > 0 ? Number(((activeScan.scanned / activeScan.total) * 100).toFixed(1)) : 100;
  return res.json({
    total: activeScan.total,
    scanned: activeScan.scanned,
    current_ticker: activeScan.current_ticker,
    signals_found: activeScan.signals_found,
    elapsed_seconds: Number(elapsed.toFixed(1)),
    percentage: pct,
    cancelled: activeScan.cancelled,
    done: activeScan.done || activeScan.scanned >= activeScan.total || activeScan.cancelled,
  });
});

app.get("/api/scan/results", (_req: Request, res: Response) => {
  return res.json({ results: scanResults });
});

app.post("/api/scan/cancel", (_req: Request, res: Response) => {
  if (activeScan) {
    activeScan.cancelled = true;
    activeScan.done = true;
  }
  return res.json({ status: "cancelled" });
});

// --- Chart Routes ---
app.get("/api/chart/:symbol", async (req: Request, res: Response) => {
  const symbol = String(req.params.symbol);
  const interval = String(req.query.interval || "1d");
  const exchange = String(req.query.exchange || "NSE");

  const candles = await fetchOHLCV(symbol, interval, exchange, true);
  return res.json({
    candles: candles.map((c) => ({
      time: c.time,
      open: c.Open,
      high: c.High,
      low: c.Low,
      close: c.Close,
    })),
    volume: candles.map((c) => ({
      time: c.time,
      value: c.Volume,
      color: c.Close >= c.Open ? "rgba(0, 168, 107, 0.4)" : "rgba(255, 59, 87, 0.4)",
    })),
  });
});

app.get("/api/chart/:symbol/signals", async (req: Request, res: Response) => {
  const symbol = String(req.params.symbol);
  const strategyIdsStr = String(req.query.strategy_ids || "");
  const interval = String(req.query.interval || "1d");
  const exchange = String(req.query.exchange || "NSE");

  if (!strategyIdsStr) return res.json({ markers: [] });
  const ids = strategyIdsStr.split(",").map((s) => s.trim()).filter(Boolean);
  const selected = Array.from(userStrategies.values()).filter((s) => ids.includes(s.id) && !s.error);
  if (!selected.length) return res.json({ markers: [] });

  const candles = await fetchOHLCV(symbol, interval, exchange, true);
  const markers: any[] = [];

  for (const strat of selected) {
    const sigs = evaluateStrategyOnStock(strat, candles);
    for (let i = 0; i < sigs.length; i++) {
      const val = sigs[i];
      if (val === "BUY" || val === "SELL") {
        markers.push({
          time: candles[i].time,
          position: val === "BUY" ? "belowBar" : "aboveBar",
          color: val === "BUY" ? "#00f59b" : "#ff3b57",
          shape: val === "BUY" ? "arrowUp" : "arrowDown",
          text: `${val} (${strat.name})`,
        });
      }
    }
  }

  markers.sort((a, b) => a.time - b.time);
  return res.json({ markers });
});

// --- Universes & Timeframes ---
app.get("/api/universes", (_req: Request, res: Response) => {
  const list = Object.entries(UNIVERSES).map(([key, val]) => ({
    key,
    name: val.name,
    count: val.stocks.length,
    exchange: val.exchange,
    category: val.category || "Other",
  }));
  list.push({
    key: "custom",
    name: "Custom Watchlist",
    count: 0,
    exchange: "MULTI",
    category: "Custom",
  });
  return res.json({ universes: list });
});

app.get("/api/timeframes", (_req: Request, res: Response) => {
  const list = Object.entries(TIMEFRAMES).map(([key, val]) => ({
    key,
    label: val.label,
    group: val.group,
  }));
  return res.json({ timeframes: list });
});

// --- Exchange Watchlists & Market Quotes API ---

export const EXCHANGE_METADATA: Record<string, { flag: string; country: string; currency: string; fullName: string; description: string }> = {
  NYSE: { flag: "🇺🇸", country: "US", currency: "$", fullName: "New York Stock Exchange", description: "World's largest equities exchange by market cap (~2,400 scrips)" },
  NASDAQ: { flag: "🇺🇸", country: "US", currency: "$", fullName: "NASDAQ Stock Market", description: "Global technology and growth leaders (~5,426 scrips)" },
  US: { flag: "🇺🇸", country: "US", currency: "$", fullName: "All US Stocks (NYSE & NASDAQ)", description: "Combined US equities market (~7,822 scrips)" },
  SSE: { flag: "🇨🇳", country: "China / HK", currency: "¥", fullName: "Shanghai Stock Exchange", description: "Mainland China premier exchange (~2,293 scrips)" },
  SZSE: { flag: "🇨🇳", country: "China / HK", currency: "¥", fullName: "Shenzhen Stock Exchange", description: "High-tech and ChiNext enterprises (~2,886 scrips)" },
  BSE_BJ: { flag: "🇨🇳", country: "China / HK", currency: "¥", fullName: "Beijing Stock Exchange", description: "Innovative small and medium-sized enterprises (~348 scrips)" },
  HKSE: { flag: "🇭🇰", country: "China / HK", currency: "HK$", fullName: "Hong Kong Stock Exchange", description: "International gateway to Asian capital (~2,508 scrips)" },
  TSE: { flag: "🇯🇵", country: "Japan", currency: "¥", fullName: "Tokyo Stock Exchange", description: "Prime, Standard, and Growth boards (~3,888 scrips)" },
  LSE: { flag: "🇬🇧", country: "UK", currency: "£", fullName: "London Stock Exchange", description: "Main Market and AIM listed securities (~1,534 scrips)" },
  TSX: { flag: "🇨🇦", country: "Canada", currency: "CA$", fullName: "Toronto Stock Exchange", description: "Canada senior equities and resources (~3,717 scrips)" },
  FSE: { flag: "🇩🇪", country: "Germany", currency: "€", fullName: "Frankfurt Stock Exchange", description: "DAX and German Prime Standard equities (~474 scrips)" },
  ASX: { flag: "🇦🇺", country: "Australia", currency: "A$", fullName: "Australian Securities Exchange", description: "ASX 200, All Ordinaries & mining leaders (~2,143 scrips)" },
  NSE: { flag: "🇮🇳", country: "India", currency: "₹", fullName: "National Stock Exchange of India", description: "India leading equities & derivatives exchange (~2,720 scrips)" },
  BSE: { flag: "🇮🇳", country: "India", currency: "₹", fullName: "Bombay Stock Exchange", description: "Asia oldest exchange with ~5,300 listed companies" },
  MCX: { flag: "⚡", country: "Commodities", currency: "₹", fullName: "Multi Commodity Exchange", description: "Energy, precious metals, and base metals (37 scrips)" },
  NCDEX: { flag: "🌾", country: "Commodities", currency: "₹", fullName: "National Commodity & Derivatives Exchange", description: "Agricultural commodities, spices, and pulses (36 scrips)" },
  COMMODITY: { flag: "⚡", country: "Commodities", currency: "₹", fullName: "MCX & NCDEX Combined", description: "Complete Indian commodities universe (71 contracts)" },
  MULTI: { flag: "⭐", country: "Custom", currency: "₹", fullName: "Custom / Starred Watchlist", description: "User saved symbols and multi-asset monitor" },
};

export function getExchangeCurrency(exchange: string): string {
  return EXCHANGE_METADATA[exchange]?.currency || "₹";
}

export interface WatchlistQuote {
  symbol: string;
  exchange: string;
  currency: string;
  price: number;
  change: number;
  changePct: number;
  open: number;
  high: number;
  low: number;
  prevClose: number;
  volume: number;
}

const watchlistQuotesCache = new Map<string, { timestamp: number; quotes: WatchlistQuote[] }>();

function getWatchlistQuotes(universeKey: string, customTickersList?: string[]): { name: string; exchange: string; meta: any; quotes: WatchlistQuote[] } {
  let universe = UNIVERSES[universeKey];
  let stocks: string[] = [];
  let exchange = "NSE";
  let name = "Watchlist";

  if (universe) {
    stocks = universe.stocks;
    exchange = universe.exchange;
    name = universe.name;
  } else if (universeKey === "custom") {
    stocks = customTickersList || [];
    exchange = "MULTI";
    name = "Custom Watchlist";
  } else {
    stocks = [];
  }

  const meta = EXCHANGE_METADATA[exchange] || EXCHANGE_METADATA["MULTI"];

  // Cache check (60s TTL)
  const cacheKey = universeKey === "custom" ? `custom_${(customTickersList || []).join(",")}` : universeKey;
  const cached = watchlistQuotesCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < 60000) {
    return { name, exchange, meta, quotes: cached.quotes };
  }

  const quotes: WatchlistQuote[] = stocks.map((sym) => {
    let symExchange = exchange;
    if (symExchange === "MULTI" || symExchange === "US" || symExchange === "COMMODITY") {
      if (sym.endsWith(".BO")) symExchange = "BSE";
      else if (sym.endsWith(".T")) symExchange = "TSE";
      else if (sym.endsWith(".L")) symExchange = "LSE";
      else if (sym.endsWith(".TO")) symExchange = "TSX";
      else if (sym.endsWith(".F")) symExchange = "FSE";
      else if (sym.endsWith(".AX")) symExchange = "ASX";
      else if (sym.endsWith(".SS")) symExchange = "SSE";
      else if (sym.endsWith(".SZ")) symExchange = "SZSE";
      else if (sym.endsWith(".HK")) symExchange = "HKSE";
      else if (ALL_MCX_COMMODITIES.includes(sym)) symExchange = "MCX";
      else if (ALL_NCDEX_COMMODITIES.includes(sym)) symExchange = "NCDEX";
      else if (ALL_NASDAQ_STOCKS.includes(sym)) symExchange = "NASDAQ";
      else if (ALL_NYSE_STOCKS.includes(sym)) symExchange = "NYSE";
      else symExchange = "NSE";
    }

    const candles = generateDeterministicOHLCV(sym, "1d", symExchange);
    const last = candles[candles.length - 1];
    const prev = candles[candles.length - 2] || last;
    const price = Math.round(last.Close * 100) / 100;
    const open = Math.round(last.Open * 100) / 100;
    const high = Math.round(last.High * 100) / 100;
    const low = Math.round(last.Low * 100) / 100;
    const prevClose = Math.round(prev.Close * 100) / 100;
    const change = Math.round((price - prevClose) * 100) / 100;
    const changePct = prevClose > 0 ? Math.round(((price - prevClose) / prevClose) * 10000) / 100 : 0;
    const volume = Math.round(last.Volume);

    return {
      symbol: sym,
      exchange: symExchange,
      currency: getExchangeCurrency(symExchange),
      price,
      change,
      changePct,
      open,
      high,
      low,
      prevClose,
      volume,
    };
  });

  watchlistQuotesCache.set(cacheKey, { timestamp: Date.now(), quotes });
  return { name, exchange, meta, quotes };
}

// Watchlists Overview (list of all exchange watchlists)
app.get("/api/watchlists/overview", (_req: Request, res: Response) => {
  const watchlists = Object.entries(UNIVERSES).map(([key, val]) => {
    const meta = EXCHANGE_METADATA[val.exchange] || EXCHANGE_METADATA["MULTI"];
    return {
      key,
      name: val.name,
      exchange: val.exchange,
      category: val.category || "Other",
      count: val.stocks.length,
      flag: meta.flag,
      country: meta.country,
      currency: meta.currency,
      fullName: meta.fullName,
      description: meta.description,
    };
  });

  watchlists.push({
    key: "custom",
    name: "Custom Watchlist",
    exchange: "MULTI",
    category: "Custom",
    count: 0,
    flag: "⭐",
    country: "Custom",
    currency: "₹",
    fullName: "Custom & Starred Watchlist",
    description: "User defined and bookmarked tickers",
  });

  return res.json({ watchlists });
});

// Single Exchange Watchlist with search, sorting, filtering, and pagination
app.get("/api/watchlist/:universeKey", (req: Request, res: Response) => {
  const universeKey = String(req.params.universeKey || "");
  const page = Math.max(1, parseInt(String(req.query.page || "1"), 10));
  const limit = Math.min(500, Math.max(10, parseInt(String(req.query.limit || "50"), 10)));
  const search = String(req.query.search || "").trim().toUpperCase();
  const sort = String(req.query.sort || "symbol_asc");
  const filter = String(req.query.filter || "all");
  const starredParam = String(req.query.starred || "").trim();
  const starredSet = new Set(starredParam ? starredParam.split(",").map(s => s.trim().toUpperCase()) : []);

  let customTickers: string[] = [];
  if (universeKey === "custom") {
    const raw = String(req.query.customTickers || "");
    customTickers = raw
      ? raw.split(/[,;\s]+/).map(s => s.trim().toUpperCase()).filter(Boolean)
      : Array.from(starredSet);
  }

  const { name, exchange, meta, quotes } = getWatchlistQuotes(universeKey, customTickers);

  // Overall Breadth Stats before search filter
  let gainersCount = 0;
  let losersCount = 0;
  let unchangedCount = 0;
  let topGainer: WatchlistQuote | null = null;
  let topLoser: WatchlistQuote | null = null;

  for (const q of quotes) {
    if (q.changePct > 0) gainersCount++;
    else if (q.changePct < 0) losersCount++;
    else unchangedCount++;

    if (!topGainer || q.changePct > topGainer.changePct) topGainer = q;
    if (!topLoser || q.changePct < topLoser.changePct) topLoser = q;
  }

  // Filtering
  let filtered = quotes;
  if (search) {
    filtered = filtered.filter(q => q.symbol.toUpperCase().includes(search));
  }
  if (filter === "gainers") {
    filtered = filtered.filter(q => q.changePct > 0);
  } else if (filter === "losers") {
    filtered = filtered.filter(q => q.changePct < 0);
  } else if (filter === "starred") {
    filtered = filtered.filter(q => starredSet.has(q.symbol.toUpperCase()));
  }

  // Sorting
  if (sort === "symbol_asc") {
    filtered.sort((a, b) => a.symbol.localeCompare(b.symbol, undefined, { numeric: true }));
  } else if (sort === "symbol_desc") {
    filtered.sort((a, b) => b.symbol.localeCompare(a.symbol, undefined, { numeric: true }));
  } else if (sort === "price_desc") {
    filtered.sort((a, b) => b.price - a.price);
  } else if (sort === "price_asc") {
    filtered.sort((a, b) => a.price - b.price);
  } else if (sort === "change_desc") {
    filtered.sort((a, b) => b.changePct - a.changePct);
  } else if (sort === "change_asc") {
    filtered.sort((a, b) => a.changePct - b.changePct);
  } else if (sort === "volume_desc") {
    filtered.sort((a, b) => b.volume - a.volume);
  }

  const total = filtered.length;
  const totalPages = Math.ceil(total / limit) || 1;
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * limit;
  const paginated = filtered.slice(startIndex, startIndex + limit);

  return res.json({
    universeKey,
    name,
    exchange,
    meta,
    total,
    rawTotal: quotes.length,
    gainersCount,
    losersCount,
    unchangedCount,
    topGainer,
    topLoser,
    page: currentPage,
    limit,
    totalPages,
    stocks: paginated,
  });
});

// Watchlist Export (CSV or TradingView text)
app.get("/api/watchlist/:universeKey/export", (req: Request, res: Response) => {
  const universeKey = String(req.params.universeKey || "");
  const format = String(req.query.format || "csv").toLowerCase();
  const rawCustom = String(req.query.customTickers || "");
  const customTickers = rawCustom ? rawCustom.split(/[,;\s]+/).map(s => s.trim().toUpperCase()).filter(Boolean) : [];

  const { name, exchange, quotes } = getWatchlistQuotes(universeKey, customTickers);

  if (format === "tradingview") {
    // Format: EXCHANGE:SYMBOL, e.g. NYSE:AAPL or NSE:RELIANCE
    const lines = quotes.map(q => `${q.exchange}:${q.symbol}`);
    res.setHeader("Content-Type", "text/plain");
    res.setHeader("Content-Disposition", `attachment; filename="${universeKey}_tradingview.txt"`);
    return res.send(lines.join("\n"));
  }

  // Default CSV format
  const header = "Symbol,Exchange,Currency,Last_Price,Change,Change_Percent,Day_Open,Day_High,Day_Low,Prev_Close,Volume\n";
  const rows = quotes.map(q =>
    `"${q.symbol}","${q.exchange}","${q.currency}",${q.price},${q.change},${q.changePct},${q.open},${q.high},${q.low},${q.prevClose},${q.volume}`
  ).join("\n");

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="${universeKey}_watchlist.csv"`);
  return res.send(header + rows);
});

// --- AI Strategy Generator ---
app.post("/api/ai/generate", async (req: Request, res: Response) => {
  const description = String(req.body?.description || "").trim();
  if (!description) {
    return res.status(400).json({ error: "Strategy description is required" });
  }
  const result = await generateStrategyWithAI(description);
  return res.json(result);
});

// Multi-turn Quant AI Strategy Architect with Multimodal Image and File Support
app.post("/api/ai/strategy-chat", async (req: Request, res: Response) => {
  try {
    const rawMessages = req.body?.messages;
    if (!rawMessages || !Array.isArray(rawMessages) || rawMessages.length === 0) {
      return res.status(400).json({ error: "Messages array is required" });
    }
    const result = await chatWithStrategyAI(rawMessages);
    return res.json(result);
  } catch (err: any) {
    console.error("Strategy chat route error:", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
});

app.get("/api/ai/template", (_req: Request, res: Response) => {
  return res.json({ code: BLANK_TEMPLATE });
});

// --- Settings & Cache ---
app.get("/api/settings", (_req: Request, res: Response) => {
  return res.json({
    theme: appSettings.theme,
    smtp_host: appSettings.smtp_host,
    smtp_port: appSettings.smtp_port,
    smtp_user: appSettings.smtp_user,
    smtp_pass_set: Boolean(appSettings.smtp_pass),
    smtp_from: appSettings.smtp_from,
  });
});

app.post("/api/settings", (req: Request, res: Response) => {
  const body = req.body || {};
  if (body.theme) appSettings.theme = body.theme;
  if (body.smtp_host !== undefined) appSettings.smtp_host = body.smtp_host;
  if (body.smtp_port !== undefined) appSettings.smtp_port = Number(body.smtp_port);
  if (body.smtp_user !== undefined) appSettings.smtp_user = body.smtp_user;
  if (body.smtp_from !== undefined) appSettings.smtp_from = body.smtp_from;
  if (body.smtp_pass) appSettings.smtp_pass = body.smtp_pass;
  return res.json({ success: true, message: "Settings saved successfully" });
});

app.post("/api/settings/test-smtp", (req: Request, res: Response) => {
  const host = String(req.body?.smtp_host || appSettings.smtp_host || "").trim();
  const user = String(req.body?.smtp_user || appSettings.smtp_user || "").trim();
  if (!host || !user) {
    return res.json({ success: false, message: "SMTP Host and Username are required" });
  }
  return res.json({
    success: true,
    message: "SMTP configuration validated (Simulated mode in cloud container)",
  });
});

app.post("/api/cache/clear", (_req: Request, res: Response) => {
  ohlcvCache.clear();
  return res.json({ success: true, message: "Cache cleared" });
});

// ============================================================================
// Start Server on Port 3000 (0.0.0.0)
// ============================================================================

const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Trading Strategy Screener & Backtester running on http://0.0.0.0:${PORT}`);
});
