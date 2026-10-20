/**
 * chart.js - Interactive TradingView Candlestick & Signal Radar Engine
 * 
 * Features:
 * 1. Direct Native Lightweight Candlestick Chart (zero popups, zero notifications, instant load, never resets to Apple).
 * 2. Real-time Multi-Timeframe support (Seconds, Minutes, Hours, Daily, Weekly, Monthly).
 * 3. Technical Indicator Overlays: SMA 20, SMA 50, EMA 20, Volume Histogram, Strategy BUY/SELL Signal Markers.
 * 4. Dynamic Symbol Switcher with auto exchange detection and Quick-Select Pills.
 * 5. Interactive Crosshair Hover Legend with O/H/L/C/Vol/Change% and indicator values.
 * 6. Cloud Drawing & Annotation Persistence.
 */

let chartInstance = null;
let candleSeries = null;
let volumeSeries = null;
let sma20Series = null;
let sma50Series = null;
let ema20Series = null;

// Direct Chart is active by default (Zero popups, zero 'OK/cross' modals, never resets to Apple)
let currentChartMode = 'signals'; // 'signals' (Direct Native Chart) | 'active' (TradingView External Widget)
let currentActiveSymbol = 'RELIANCE';
let currentActiveExchange = 'NSE';
let currentActiveInterval = '1d';
let currentStrategyIds = '';

// Indicator active toggles
const activeIndicators = {
    ma: true,      // SMA 20 & SMA 50
    ema: true,     // EMA 20
    volume: true,  // Volume Histogram
    signals: true  // Strategy BUY/SELL signal markers
};

/**
 * Common exchange detection helper for arbitrary stock symbols
 */
function detectExchangeForSymbol(symbol, fallbackExchange = 'NSE') {
    if (!symbol) return fallbackExchange;
    const s = symbol.trim().toUpperCase();

    // Prominent US Tech & Blue chips
    const usNasdaq = ['AAPL', 'MSFT', 'GOOGL', 'GOOG', 'AMZN', 'NVDA', 'META', 'TSLA', 'NFLX', 'AMD', 'INTC', 'QCOM', 'CSCO', 'AVGO', 'TXN', 'PYPL', 'ADBE', 'AMAT', 'MU', 'COST', 'PEP', 'SBUX', 'BKNG', 'MDLZ', 'GILD', 'PANW', 'SNPS', 'CDNS', 'KLAC', 'ASML', 'ARM', 'CRWD', 'TEAM'];
    const usNyse = ['JPM', 'UNH', 'V', 'JNJ', 'WMT', 'PG', 'MA', 'HD', 'CVX', 'MRK', 'ABBV', 'KO', 'PEP', 'BAC', 'PFE', 'TMO', 'DIS', 'ABT', 'LIN', 'MCD', 'ACN', 'VZ', 'DHR', 'NEE', 'PM', 'TXN', 'NKE', 'BMY', 'ORCL', 'UPS', 'CAT', 'GE', 'RTX', 'LOW', 'SPGI', 'IBM', 'BA', 'HON', 'GS', 'MS', 'BLK', 'DE', 'PLD', 'AXP', 'ISRG', 'SYK', 'MDLZ', 'T', 'TJX', 'C', 'MMC', 'CB', 'LMT', 'ELV', 'AMT', 'SCHW', 'BKNG'];
    
    // Prominent Indian Stocks
    const inNse = ['RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK', 'HINDUNILVR', 'SBIN', 'BHARTIARTL', 'ITC', 'KOTAKBANK', 'LT', 'AXISBANK', 'HCLTECH', 'ASIANPAINT', 'BAJFINANCE', 'MARUTI', 'SUNPHARMA', 'TITAN', 'ULTRACEMCO', 'TATAMOTORS', 'WIPRO', 'NTPC', 'POWERGRID', 'ONGC', 'ADANIENT', 'COALINDIA', 'JSWSTEEL', 'TATASTEEL', 'M&M', 'BAJAJFINSV', 'NESTLEIND', 'TECHM', 'GRASIM', 'BRITANNIA', 'CIPLA', 'HEROMOTOCO', 'DRREDDY', 'EICHERMOT', 'DIVISLAB', 'APOLLOHOSP', 'TATACONSUM', 'BPCL', 'INDUSINDBK', 'HINDALCO', 'SBILIFE', 'HDFCLIFE', 'VEDL', 'HAL', 'BEL', 'TRENT', 'ZOMATO', 'JIOFIN'];

    // Chinese Exchange Codes (SSE 60xxxx, 68xxxx; SZSE 00xxxx, 30xxxx; BSE 8xxxxx, 4xxxxx, 9xxxxx)
    if (/^6[08]\d{4}$/.test(s)) return 'SSE';
    if (/^[03]\d{5}$/.test(s)) return 'SZSE';
    if (/^[849]\d{5}$/.test(s)) return 'BSE_BJ';

    // Hong Kong (numbers 1-9999 or e.g. 700, 9988)
    if (/^\d{3,5}$/.test(s) && parseInt(s, 10) < 10000) return 'HKSE';

    // Commodities
    const commodities = ['GOLD', 'SILVER', 'CRUDEOIL', 'NATURALGAS', 'COPPER', 'ALUMINIUM', 'ZINC', 'LEAD', 'NICKEL', 'JEERA', 'TURMERIC', 'DHANIYA', 'GUARSEED', 'COTTON', 'CHANA', 'SOYABEAN'];
    if (commodities.some(c => s.includes(c))) return 'MCX';

    if (usNasdaq.includes(s)) return 'NASDAQ';
    if (usNyse.includes(s)) return 'NYSE';
    if (inNse.includes(s)) return 'NSE';

    return fallbackExchange;
}

/**
 * Initialize or switch chart view
 */
function setChartMode(mode) {
    currentChartMode = mode;
    document.querySelectorAll('.chart-mode-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
    });

    const tvContainer = document.getElementById('tradingview_active_chart');
    const lwContainer = document.getElementById('lightweight_chart_container');

    if (mode === 'active') {
        if (tvContainer) tvContainer.style.display = 'block';
        if (lwContainer) lwContainer.style.display = 'none';
        renderTradingViewActiveWidget();
    } else {
        if (tvContainer) tvContainer.style.display = 'none';
        if (lwContainer) lwContainer.style.display = 'block';
        renderLightweightSignalChart();
    }
}

/**
 * Technical Indicator Math: Simple Moving Average (SMA)
 */
function calculateSMA(candles, period) {
    const smaData = [];
    for (let i = 0; i < candles.length; i++) {
        if (i < period - 1) continue;
        let sum = 0;
        for (let j = 0; j < period; j++) {
            sum += candles[i - j].close;
        }
        smaData.push({
            time: candles[i].time,
            value: Number((sum / period).toFixed(2))
        });
    }
    return smaData;
}

/**
 * Technical Indicator Math: Exponential Moving Average (EMA)
 */
function calculateEMA(candles, period) {
    const emaData = [];
    if (candles.length < period) return emaData;

    const multiplier = 2 / (period + 1);
    // Initial SMA for first value
    let sum = 0;
    for (let i = 0; i < period; i++) {
        sum += candles[i].close;
    }
    let prevEma = sum / period;
    emaData.push({
        time: candles[period - 1].time,
        value: Number(prevEma.toFixed(2))
    });

    for (let i = period; i < candles.length; i++) {
        const currentClose = candles[i].close;
        prevEma = (currentClose - prevEma) * multiplier + prevEma;
        emaData.push({
            time: candles[i].time,
            value: Number(prevEma.toFixed(2))
        });
    }
    return emaData;
}

/**
 * Toggle indicators on the direct chart
 */
function toggleChartIndicator(type) {
    if (activeIndicators.hasOwnProperty(type)) {
        activeIndicators[type] = !activeIndicators[type];
    }

    const btnIdMap = {
        ma: 'btnToggleMA',
        ema: 'btnToggleEMA',
        volume: 'btnToggleVolume',
        signals: 'btnToggleSignals'
    };

    const btn = document.getElementById(btnIdMap[type]);
    if (btn) {
        btn.classList.toggle('active', activeIndicators[type]);
    }

    // Re-render chart to reflect toggled indicator layers
    if (currentChartMode === 'signals') {
        renderLightweightSignalChart();
    }
}

/**
 * Switch timeframe directly from Chart View
 */
function changeChartTimeframe(interval) {
    if (!interval) return;
    currentActiveInterval = interval;

    // Sync UI selectors
    const chartSelect = document.getElementById('chartTimeframeSelect');
    if (chartSelect && chartSelect.value !== interval) {
        chartSelect.value = interval;
    }
    const sidebarSelect = document.getElementById('timeframeSelect');
    if (sidebarSelect && sidebarSelect.value !== interval) {
        sidebarSelect.value = interval;
    }

    loadChart(currentActiveSymbol, currentActiveExchange, interval, currentStrategyIds);
}

/**
 * Switch symbol directly from Chart View input box
 */
function switchChartSymbolFromInput() {
    const input = document.getElementById('chartSymbolQuickInput');
    if (!input) return;
    const rawVal = input.value.trim().toUpperCase();
    if (!rawVal) return;

    let symbol = rawVal;
    let exchange = currentActiveExchange || 'NSE';

    if (rawVal.includes(':')) {
        const parts = rawVal.split(':');
        exchange = parts[0].trim().toUpperCase();
        symbol = parts[1].trim().toUpperCase();
    } else if (rawVal.includes('.')) {
        const parts = rawVal.split('.');
        symbol = parts[0].trim().toUpperCase();
        const ext = parts[1].trim().toUpperCase();
        const extMap = {
            NS: 'NSE', BO: 'BSE', TO: 'TSX', L: 'LSE', F: 'FSE',
            AX: 'ASX', HK: 'HKSE', T: 'TSE', SS: 'SSE', SZ: 'SZSE', BJ: 'BSE_BJ'
        };
        if (extMap[ext]) exchange = extMap[ext];
    } else {
        exchange = detectExchangeForSymbol(symbol, exchange);
    }

    input.value = '';
    switchChartSymbol(symbol, exchange);
}

/**
 * Switch to a specific stock and exchange directly
 */
function switchChartSymbol(symbol, exchange) {
    if (!symbol) return;
    const exch = exchange || detectExchangeForSymbol(symbol, currentActiveExchange || 'NSE');

    currentActiveSymbol = symbol;
    currentActiveExchange = exch;
    if (typeof AppState !== 'undefined') {
        AppState.chartSymbol = symbol;
        AppState.chartExchange = exch;
    }

    // Ensure we are in direct chart mode
    setChartMode('signals');
    loadChart(symbol, exch, currentActiveInterval, currentStrategyIds);
    showToast(`Loaded ${symbol} (${exch}) chart`, 'info');
}

/**
 * Update the Live Legend Bar with candle and indicator data
 */
function updateChartLegend(bar, ma20Val, sma50Val, ema20Val) {
    if (!bar) return;

    const dtEl = document.getElementById('legendDateTime');
    const oEl = document.getElementById('legendOpen');
    const hEl = document.getElementById('legendHigh');
    const lEl = document.getElementById('legendLow');
    const cEl = document.getElementById('legendClose');
    const vEl = document.getElementById('legendVol');
    const chgEl = document.getElementById('legendChange');
    const m20El = document.getElementById('legendMA20');
    const s50El = document.getElementById('legendSMA50');
    const e20El = document.getElementById('legendEMA20');

    if (dtEl) {
        if (typeof bar.time === 'number') {
            const d = new Date(bar.time * 1000);
            dtEl.textContent = d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
        } else if (bar.time && bar.time.year) {
            dtEl.textContent = `${bar.time.year}-${String(bar.time.month).padStart(2,'0')}-${String(bar.time.day).padStart(2,'0')}`;
        } else {
            dtEl.textContent = String(bar.time || '--');
        }
    }

    if (oEl) oEl.textContent = bar.open?.toFixed(2) ?? '--';
    if (hEl) hEl.textContent = bar.high?.toFixed(2) ?? '--';
    if (lEl) lEl.textContent = bar.low?.toFixed(2) ?? '--';
    if (cEl) cEl.textContent = bar.close?.toFixed(2) ?? '--';
    if (vEl) vEl.textContent = bar.volume ? (bar.volume > 1e6 ? (bar.volume / 1e6).toFixed(2) + 'M' : (bar.volume / 1e3).toFixed(1) + 'K') : '--';

    if (chgEl && bar.open && bar.close) {
        const diff = bar.close - bar.open;
        const pct = (diff / bar.open) * 100;
        chgEl.textContent = `${diff >= 0 ? '+' : ''}${diff.toFixed(2)} (${diff >= 0 ? '+' : ''}${pct.toFixed(2)}%)`;
        chgEl.style.color = diff >= 0 ? '#32CD32' : '#FF4444';
    }

    if (m20El) {
        m20El.style.display = activeIndicators.ma ? 'inline' : 'none';
        m20El.textContent = `SMA20: ${ma20Val != null ? Number(ma20Val).toFixed(2) : '--'}`;
    }
    if (s50El) {
        s50El.style.display = activeIndicators.ma ? 'inline' : 'none';
        s50El.textContent = `SMA50: ${sma50Val != null ? Number(sma50Val).toFixed(2) : '--'}`;
    }
    if (e20El) {
        e20El.style.display = activeIndicators.ema ? 'inline' : 'none';
        e20El.textContent = `EMA20: ${ema20Val != null ? Number(ema20Val).toFixed(2) : '--'}`;
    }
}

/**
 * Render Lightweight Chart with Strategy BUY/SELL signal markers (Primary Direct Chart)
 */
async function renderLightweightSignalChart() {
    const container = document.getElementById('lightweight_chart_container');
    if (!container) return;

    if (chartInstance) {
        try { chartInstance.remove(); } catch (e) {}
        chartInstance = null;
    }

    container.innerHTML = `
        <div style="display:flex; align-items:center; justify-content:center; height:100%; color:var(--text-tertiary);">
            <div class="spinner" style="margin-right:10px;"></div> Loading ${currentActiveSymbol} (${currentActiveExchange}) chart...
        </div>
    `;

    try {
        const chartRes = await fetch(`/api/chart/${encodeURIComponent(currentActiveSymbol)}?interval=${currentActiveInterval}&exchange=${currentActiveExchange}`);
        const chartData = await chartRes.json();

        if (!chartData.candles || chartData.candles.length === 0) {
            container.innerHTML = `
                <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; color:var(--text-tertiary); gap:10px;">
                    <div>No chart data available for <strong>${currentActiveSymbol}</strong> on ${currentActiveExchange}.</div>
                    <button class="btn btn-sm btn-primary" onclick="switchChartSymbol('${currentActiveSymbol}', '${currentActiveExchange}')">↻ Retry</button>
                </div>
            `;
            return;
        }

        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        container.innerHTML = '';

        const isSecondsTF = currentActiveInterval.endsWith('s');

        chartInstance = LightweightCharts.createChart(container, {
            width: container.clientWidth || 800,
            height: container.clientHeight || 500,
            layout: {
                background: { type: 'solid', color: isDark ? '#141619' : '#FFFFFF' },
                textColor: isDark ? '#FFFFFF' : '#0A0A0A',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 12,
            },
            grid: {
                vertLines: { color: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(10,10,10,0.06)' },
                horzLines: { color: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(10,10,10,0.06)' },
            },
            crosshair: {
                mode: LightweightCharts.CrosshairMode.Normal,
                vertLine: {
                    width: 1,
                    color: '#32CD32',
                    style: LightweightCharts.LineStyle.Dashed,
                    labelBackgroundColor: '#141619',
                },
                horzLine: {
                    width: 1,
                    color: '#32CD32',
                    style: LightweightCharts.LineStyle.Dashed,
                    labelBackgroundColor: '#141619',
                },
            },
            rightPriceScale: {
                borderColor: isDark ? '#333333' : '#E0E0E0',
                scaleMargins: { top: 0.08, bottom: 0.22 },
            },
            timeScale: {
                borderColor: isDark ? '#333333' : '#E0E0E0',
                timeVisible: true,
                secondsVisible: isSecondsTF,
            },
            handleScale: { mouseWheel: true, pinch: true },
            handleScroll: { mouseWheel: true, pressedMouseMove: true },
        });

        // 1. Candlestick Series
        candleSeries = chartInstance.addCandlestickSeries({
            upColor: '#32CD32',
            downColor: '#FF4444',
            borderUpColor: '#32CD32',
            borderDownColor: '#FF4444',
            wickUpColor: '#32CD32',
            wickDownColor: '#FF4444',
        });
        candleSeries.setData(chartData.candles);

        // 2. Volume Histogram Series (if active)
        if (activeIndicators.volume && chartData.volume) {
            volumeSeries = chartInstance.addHistogramSeries({
                priceFormat: { type: 'volume' },
                priceScaleId: 'volume',
            });
            chartInstance.priceScale('volume').applyOptions({
                scaleMargins: { top: 0.82, bottom: 0 },
            });
            volumeSeries.setData(chartData.volume);
        }

        // 3. Technical Moving Averages: SMA 20 (Blue) & SMA 50 (Orange)
        if (activeIndicators.ma) {
            const sma20Data = calculateSMA(chartData.candles, 20);
            if (sma20Data.length > 0) {
                sma20Series = chartInstance.addLineSeries({
                    color: '#0088FF',
                    lineWidth: 2,
                    title: 'SMA 20',
                    priceLineVisible: false,
                });
                sma20Series.setData(sma20Data);
            }

            const sma50Data = calculateSMA(chartData.candles, 50);
            if (sma50Data.length > 0) {
                sma50Series = chartInstance.addLineSeries({
                    color: '#FFA500',
                    lineWidth: 2,
                    title: 'SMA 50',
                    priceLineVisible: false,
                });
                sma50Series.setData(sma50Data);
            }
        }

        // 4. EMA 20 (Magenta)
        if (activeIndicators.ema) {
            const ema20Data = calculateEMA(chartData.candles, 20);
            if (ema20Data.length > 0) {
                ema20Series = chartInstance.addLineSeries({
                    color: '#E040FB',
                    lineWidth: 2,
                    title: 'EMA 20',
                    priceLineVisible: false,
                });
                ema20Series.setData(ema20Data);
            }
        }

        // 5. Strategy BUY / SELL Signal Markers
        if (activeIndicators.signals && currentStrategyIds) {
            try {
                const markersRes = await fetch(
                    `/api/chart/${encodeURIComponent(currentActiveSymbol)}/signals?strategy_ids=${currentStrategyIds}&interval=${currentActiveInterval}&exchange=${currentActiveExchange}`
                );
                const markersData = await markersRes.json();

                if (markersData.markers && markersData.markers.length > 0) {
                    const sortedMarkers = markersData.markers.sort((a, b) => a.time - b.time);
                    candleSeries.setMarkers(sortedMarkers);
                }
            } catch (err) {
                console.warn('Could not load signal markers:', err);
            }
        }

        // Fit content into view
        chartInstance.timeScale().fitContent();

        // 6. Crosshair move legend updates
        const lastCandle = chartData.candles[chartData.candles.length - 1];
        const lastVol = chartData.volume ? chartData.volume[chartData.volume.length - 1]?.value : 0;
        updateChartLegend({
            ...lastCandle,
            volume: lastVol
        }, null, null, null);

        chartInstance.subscribeCrosshairMove((param) => {
            if (!param || !param.time || !param.seriesData) {
                // When crosshair leaves, show latest candle data
                updateChartLegend({
                    ...lastCandle,
                    volume: lastVol
                }, null, null, null);
                return;
            }

            const candlePoint = param.seriesData.get(candleSeries);
            const volPoint = volumeSeries ? param.seriesData.get(volumeSeries) : null;
            const sma20Point = sma20Series ? param.seriesData.get(sma20Series) : null;
            const sma50Point = sma50Series ? param.seriesData.get(sma50Series) : null;
            const ema20Point = ema20Series ? param.seriesData.get(ema20Series) : null;

            if (candlePoint) {
                updateChartLegend({
                    time: param.time,
                    open: candlePoint.open,
                    high: candlePoint.high,
                    low: candlePoint.low,
                    close: candlePoint.close,
                    volume: volPoint?.value || 0
                }, sma20Point?.value, sma50Point?.value, ema20Point?.value);
            }
        });

        // 7. Responsive Auto-Resizing
        const resizeObserver = new ResizeObserver(() => {
            if (chartInstance && container) {
                chartInstance.applyOptions({
                    width: container.clientWidth,
                    height: container.clientHeight,
                });
            }
        });
        resizeObserver.observe(container);

    } catch (err) {
        console.error('Error rendering signal chart:', err);
        container.innerHTML = `
            <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; color:var(--danger); gap:8px;">
                <div>Failed to load chart: ${err.message}</div>
                <button class="btn btn-sm btn-primary" onclick="renderLightweightSignalChart()">↻ Try Again</button>
            </div>
        `;
    }
}

/**
 * Render TradingView Advanced Real-Time Chart Widget (Optional external widget)
 */
function renderTradingViewActiveWidget() {
    const container = document.getElementById('tradingview_active_chart');
    if (!container) return;

    container.innerHTML = '';

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const cleanSym = currentActiveSymbol
        .replace(/\.(NS|BO|MCX|NCDEX|TO|L|F|AX|SS|SZ|BJ|HK|T)$/i, '');
    let tvPrefix = 'NSE:';
    if (currentActiveExchange === 'BSE') tvPrefix = 'BSE:';
    else if (currentActiveExchange === 'NYSE') tvPrefix = 'NYSE:';
    else if (currentActiveExchange === 'NASDAQ' || currentActiveExchange === 'US') tvPrefix = 'NASDAQ:';
    else if (currentActiveExchange === 'SSE') tvPrefix = 'SSE:';
    else if (currentActiveExchange === 'SZSE') tvPrefix = 'SZSE:';
    else if (currentActiveExchange === 'BSE_BJ') tvPrefix = 'BSE:';
    else if (currentActiveExchange === 'HKSE') tvPrefix = 'HKEX:';
    else if (currentActiveExchange === 'TSE') tvPrefix = 'TSE:';
    else if (currentActiveExchange === 'LSE') tvPrefix = 'LSE:';
    else if (currentActiveExchange === 'TSX') tvPrefix = 'TSX:';
    else if (currentActiveExchange === 'FSE') tvPrefix = 'FWB:';
    else if (currentActiveExchange === 'ASX') tvPrefix = 'ASX:';
    else if (currentActiveExchange === 'MCX') tvPrefix = 'MCX:';
    else if (currentActiveExchange === 'NCDEX') tvPrefix = 'NCDEX:';
    const tvSymbol = tvPrefix + cleanSym;

    // Map interval to TradingView resolution
    let tvInterval = "D";
    if (currentActiveInterval.endsWith('s')) tvInterval = "1S";
    else if (currentActiveInterval === "1m") tvInterval = "1";
    else if (currentActiveInterval === "2m") tvInterval = "2";
    else if (currentActiveInterval === "3m") tvInterval = "3";
    else if (currentActiveInterval === "5m") tvInterval = "5";
    else if (currentActiveInterval === "10m") tvInterval = "10";
    else if (currentActiveInterval === "15m") tvInterval = "15";
    else if (currentActiveInterval === "45m") tvInterval = "45";
    else if (currentActiveInterval === "1h") tvInterval = "60";
    else if (currentActiveInterval === "2h") tvInterval = "120";
    else if (currentActiveInterval === "3h") tvInterval = "180";
    else if (currentActiveInterval === "4h") tvInterval = "240";
    else if (currentActiveInterval === "1d") tvInterval = "D";
    else if (currentActiveInterval === "1wk") tvInterval = "W";
    else if (currentActiveInterval === "1mo" || currentActiveInterval === "3mo" || currentActiveInterval === "6mo" || currentActiveInterval === "12mo") tvInterval = "M";

    if (typeof TradingView !== 'undefined') {
        new TradingView.widget({
            "autosize": true,
            "symbol": tvSymbol,
            "interval": tvInterval,
            "timezone": "Asia/Kolkata",
            "theme": isDark ? "dark" : "light",
            "style": "1",
            "locale": "en",
            "toolbar_bg": isDark ? "#132019" : "#FFFFFF",
            "enable_publishing": false,
            "allow_symbol_change": true,
            "container_id": "tradingview_active_chart",
            "hide_side_toolbar": false,
            "withdateranges": true,
            "save_image": true,
            "details": true,
            "hotlist": false,
            "calendar": false,
            "studies": [
                "RSI@tv-basicstudies",
                "MASimple@tv-basicstudies"
            ]
        });
    } else {
        container.innerHTML = `
            <div style="display:flex; align-items:center; justify-content:center; height:100%; color:var(--text-tertiary);">
                <div class="spinner" style="margin-right:10px;"></div> Loading TradingView Widget...
            </div>
        `;
        setTimeout(renderTradingViewActiveWidget, 500);
    }
}

/**
 * Main function to load a chart for a symbol directly with NO popups/notifications
 */
async function loadChart(symbol, exchange, interval, strategyIds) {
    currentActiveSymbol = symbol || 'RELIANCE';
    currentActiveExchange = exchange || detectExchangeForSymbol(currentActiveSymbol, 'NSE');
    currentActiveInterval = interval || '1d';
    currentStrategyIds = strategyIds || '';

    // Update Header labels
    const symLabel = document.getElementById('chartSymbolLabel');
    if (symLabel) symLabel.textContent = currentActiveSymbol;
    const badge = document.getElementById('chartExchangeBadge');
    if (badge) {
        badge.textContent = currentActiveExchange;
        badge.className = `chart-exchange-badge badge-${currentActiveExchange.toLowerCase()}`;
    }

    // Sync timeframe selector in chart header
    const chartTf = document.getElementById('chartTimeframeSelect');
    if (chartTf && chartTf.value !== currentActiveInterval) {
        chartTf.value = currentActiveInterval;
    }

    // Load any saved drawings or notes from cloud
    loadSavedDrawingsFromCloud(currentActiveSymbol);

    // Render current active mode (Direct native chart by default)
    if (currentChartMode === 'active') {
        renderTradingViewActiveWidget();
    } else {
        renderLightweightSignalChart();
    }
}

/**
 * Cloud Storage: Save Drawings & Annotations to Web Account
 */
async function saveCurrentChartToCloud() {
    const notesInput = prompt(`Enter notes or trade annotations for ${currentActiveSymbol}:`);
    if (notesInput === null) return;

    try {
        const token = localStorage.getItem('auth_token') || '';
        const res = await fetch('/api/cloud/drawings/save', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                symbol: currentActiveSymbol,
                notes: notesInput,
                drawing_data: {
                    symbol: currentActiveSymbol,
                    exchange: currentActiveExchange,
                    interval: currentActiveInterval,
                    saved_at: new Date().toISOString()
                }
            })
        });
        const data = await res.json();
        if (data.success) {
            showToast(`☁️ Chart and notes for ${currentActiveSymbol} saved to Cloud!`, 'success');
            loadSavedDrawingsFromCloud(currentActiveSymbol);
        } else {
            showToast('Failed to save chart to cloud', 'error');
        }
    } catch (e) {
        showToast('Error saving to cloud: ' + e.message, 'error');
    }
}

/**
 * Cloud Storage: Retrieve saved annotations for stock
 */
async function loadSavedDrawingsFromCloud(symbol) {
    const badge = document.getElementById('chartSavedNotesBadge');
    if (!badge) return;

    try {
        const token = localStorage.getItem('auth_token') || '';
        const res = await fetch(`/api/cloud/drawings/${encodeURIComponent(symbol)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.drawings && data.drawings.notes) {
            badge.style.display = 'inline-block';
            badge.title = `Saved Notes: ${data.drawings.notes}`;
            badge.textContent = `📝 Note: "${data.drawings.notes.substring(0, 25)}${data.drawings.notes.length > 25 ? '...' : ''}"`;
        } else {
            badge.style.display = 'none';
        }
    } catch (e) {
        badge.style.display = 'none';
    }
}
