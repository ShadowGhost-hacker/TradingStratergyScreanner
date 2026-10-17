/**
 * chart.js - Interactive TradingView Charting Integration
 * 
 * Features:
 * 1. TradingView Full Active Suite (Official Advanced Technical Analysis Widget with
 *    complete drawing toolbar, Fibonacci, trendlines, 100+ indicators, multi-timeframe).
 * 2. Strategy Signal Radar (Lightweight Charts with custom BUY/SELL marker overlays).
 * 3. Cloud Drawing and Annotation Persistence.
 */

let chartInstance = null;
let candleSeries = null;
let volumeSeries = null;
let currentChartMode = 'active'; // 'active' (TradingView Advanced) | 'signals' (Lightweight with Strategy Markers)
let currentActiveSymbol = 'RELIANCE';
let currentActiveExchange = 'NSE';
let currentActiveInterval = '1d';
let currentStrategyIds = '';

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
        tvContainer.style.display = 'block';
        lwContainer.style.display = 'none';
        renderTradingViewActiveWidget();
    } else {
        tvContainer.style.display = 'none';
        lwContainer.style.display = 'block';
        renderLightweightSignalChart();
    }
}

/**
 * Render TradingView Advanced Real-Time Chart Widget (Exact active TradingView view)
 */
function renderTradingViewActiveWidget() {
    const container = document.getElementById('tradingview_active_chart');
    if (!container) return;

    container.innerHTML = '';

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const cleanSym = currentActiveSymbol.replace('.NS', '').replace('.BO', '');
    const tvSymbol = (currentActiveExchange === 'BSE' ? 'BSE:' : 'NSE:') + cleanSym;

    // Map interval to TradingView resolution
    let tvInterval = "D";
    if (currentActiveInterval === "5m") tvInterval = "5";
    else if (currentActiveInterval === "15m") tvInterval = "15";
    else if (currentActiveInterval === "30m") tvInterval = "30";
    else if (currentActiveInterval === "1h") tvInterval = "60";
    else if (currentActiveInterval === "1d") tvInterval = "D";
    else if (currentActiveInterval === "1wk") tvInterval = "W";
    else if (currentActiveInterval === "1mo") tvInterval = "M";

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
 * Render Lightweight Chart with Strategy BUY/SELL signal markers
 */
async function renderLightweightSignalChart() {
    const container = document.getElementById('lightweight_chart_container');
    if (!container) return;

    if (chartInstance) {
        chartInstance.remove();
        chartInstance = null;
    }

    container.innerHTML = `
        <div style="display:flex; align-items:center; justify-content:center; height:100%; color:var(--text-tertiary);">
            <div class="spinner" style="margin-right:10px;"></div> Loading signals and price data...
        </div>
    `;

    try {
        const chartRes = await fetch(`/api/chart/${currentActiveSymbol}?interval=${currentActiveInterval}&exchange=${currentActiveExchange}`);
        const chartData = await chartRes.json();

        if (!chartData.candles || chartData.candles.length === 0) {
            container.innerHTML = `
                <div style="display:flex; align-items:center; justify-content:center; height:100%; color:var(--text-tertiary);">
                    No historical chart data available for ${currentActiveSymbol}
                </div>
            `;
            return;
        }

        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        container.innerHTML = '';

        chartInstance = LightweightCharts.createChart(container, {
            width: container.clientWidth,
            height: container.clientHeight,
            layout: {
                background: { type: 'solid', color: isDark ? '#141619' : '#FFFFFF' },
                textColor: isDark ? '#FFFFFF' : '#0A0A0A',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 12,
            },
            grid: {
                vertLines: { color: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(10,10,10,0.08)' },
                horzLines: { color: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(10,10,10,0.08)' },
            },
            crosshair: {
                mode: LightweightCharts.CrosshairMode.Normal,
                vertLine: {
                    width: 1,
                    color: '#32CD32',
                    style: LightweightCharts.LineStyle.Dashed,
                },
                horzLine: {
                    width: 1,
                    color: '#32CD32',
                    style: LightweightCharts.LineStyle.Dashed,
                },
            },
            rightPriceScale: {
                borderColor: isDark ? '#FFFFFF' : '#0A0A0A',
                scaleMargins: { top: 0.05, bottom: 0.25 },
            },
            timeScale: {
                borderColor: isDark ? '#FFFFFF' : '#0A0A0A',
                timeVisible: true,
                secondsVisible: false,
            },
            handleScale: { mouseWheel: true, pinch: true },
            handleScroll: { mouseWheel: true, pressedMouseMove: true },
        });

        candleSeries = chartInstance.addCandlestickSeries({
            upColor: '#32CD32',
            downColor: '#FF4444',
            borderUpColor: isDark ? '#32CD32' : '#0A0A0A',
            borderDownColor: isDark ? '#FF4444' : '#0A0A0A',
            wickUpColor: '#32CD32',
            wickDownColor: '#FF4444',
        });
        candleSeries.setData(chartData.candles);

        volumeSeries = chartInstance.addHistogramSeries({
            priceFormat: { type: 'volume' },
            priceScaleId: 'volume',
        });
        chartInstance.priceScale('volume').applyOptions({
            scaleMargins: { top: 0.8, bottom: 0 },
        });
        volumeSeries.setData(chartData.volume);

        if (currentStrategyIds) {
            const markersRes = await fetch(
                `/api/chart/${currentActiveSymbol}/signals?strategy_ids=${currentStrategyIds}&interval=${currentActiveInterval}&exchange=${currentActiveExchange}`
            );
            const markersData = await markersRes.json();

            if (markersData.markers && markersData.markers.length > 0) {
                const sortedMarkers = markersData.markers.sort((a, b) => a.time - b.time);
                candleSeries.setMarkers(sortedMarkers);
            }
        }

        chartInstance.timeScale().fitContent();

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
            <div style="display:flex; align-items:center; justify-content:center; height:100%; color:var(--danger);">
                Failed to load signal chart: ${err.message}
            </div>
        `;
    }
}

/**
 * Main function to load a chart for a symbol
 */
async function loadChart(symbol, exchange, interval, strategyIds) {
    currentActiveSymbol = symbol;
    currentActiveExchange = exchange || 'NSE';
    currentActiveInterval = interval || '1d';
    currentStrategyIds = strategyIds || '';

    // Update Header labels
    const symLabel = document.getElementById('chartSymbolLabel');
    if (symLabel) symLabel.textContent = symbol;
    const badge = document.getElementById('chartExchangeBadge');
    if (badge) badge.textContent = exchange || 'NSE';

    // Load any saved drawings or notes from cloud
    loadSavedDrawingsFromCloud(symbol);

    // Render current active mode
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
        const res = await fetch(`/api/cloud/drawings/${symbol}`, {
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
