/**
 * app.js - Main Application Controller & State Management
 * 
 * Features:
 * - Strategy selection and management (with AI Generator)
 * - Multi-select Stock Universes (Nifty 50, All NSE Stocks, All BSE Stocks, F&O, etc.)
 * - Market Screener with Aligned Strategy Signals & Tolerance
 * - TradingView Advanced Active Charting & Signal Radar
 * - Historical Backtest Simulator with Equity Curve & KPIs
 * - User Authentication (Registration, Email OTP Verification, Password Reset with OTP)
 * - Free Cloud Storage (Drawings, Strategies, Backtests, JSON Backup/Restore)
 * - Settings & SMTP Integration
 */

// ============================================================================
// Application State
// ============================================================================

const AppState = {
    strategies: [],
    selectedStrategies: new Set(),
    universes: [],
    selectedUniverses: new Set(['nifty50']),
    scanResults: [],
    activeScanInterval: null,
    currentView: 'screener',    // 'screener' | 'backtest' | 'chart'
    currentFilter: 'all',        // 'all' | 'buy' | 'sell'
    chartSymbol: null,
    chartExchange: null,
    theme: 'dark',
    currentUser: null,
    authToken: localStorage.getItem('auth_token') || '',
    backtestResult: null,
    activeBacktestInterval: null,
    pendingAuthEmail: ''
};

// ============================================================================
// Initialization
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    checkCurrentUser();
    loadStrategies();
    loadUniverses();
    loadTimeframes();
    loadSettings();
    setupEventListeners();
});

function setupEventListeners() {
    // Theme toggle
    document.getElementById('themeToggle').addEventListener('click', toggleTheme);

    // Scan buttons
    document.getElementById('scanBtn').addEventListener('click', startScan);
    document.getElementById('cancelScanBtn').addEventListener('click', cancelScan);

    // Tolerance slider
    const slider = document.getElementById('toleranceSlider');
    if (slider) {
        slider.addEventListener('input', (e) => {
            document.getElementById('toleranceValue').textContent = e.target.value;
        });
    }

    // Results filter chips
    document.querySelectorAll('.filter-chip').forEach(chip => {
        chip.addEventListener('click', (e) => {
            document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
            e.target.classList.add('active');
            AppState.currentFilter = e.target.dataset.filter;
            renderResults();
        });
    });

    // Back to results from chart view
    document.getElementById('backToResults').addEventListener('click', () => {
        switchMainView('screener');
    });

    // Strategy modal buttons
    document.getElementById('newStrategyBtn').addEventListener('click', () => openEditorModal());
    document.getElementById('uploadStrategyBtn').addEventListener('click', () => {
        document.getElementById('strategyFileInput').click();
    });
    document.getElementById('strategyFileInput').addEventListener('change', uploadStrategy);

    // Settings button
    document.getElementById('settingsBtn').addEventListener('click', openSettingsModal);

    // Export button
    document.getElementById('exportBtn').addEventListener('click', exportResults);

    // Close user dropdown when clicking outside
    document.addEventListener('click', (e) => {
        const authWrapper = document.querySelector('.user-auth-wrapper');
        const dropdown = document.getElementById('userDropdown');
        if (dropdown && authWrapper && !authWrapper.contains(e.target)) {
            dropdown.classList.add('hidden');
        }
    });
}

// ============================================================================
// Theme Management
// ============================================================================

function initTheme() {
    const saved = localStorage.getItem('theme') || 'dark';
    setTheme(saved);
}

function setTheme(theme) {
    AppState.theme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
}

function toggleTheme() {
    setTheme(AppState.theme === 'dark' ? 'light' : 'dark');
    // If chart is open, re-render for theme colors
    if (AppState.chartSymbol) {
        loadChart(AppState.chartSymbol, AppState.chartExchange, document.getElementById('timeframeSelect').value, Array.from(AppState.selectedStrategies).join(','));
    }
}

// ============================================================================
// View Switcher (Screener vs Backtest vs Chart)
// ============================================================================

function switchMainView(viewName) {
    AppState.currentView = viewName;

    const tabScreener = document.getElementById('tabScreener');
    const tabBacktest = document.getElementById('tabBacktest');
    const resultsView = document.getElementById('resultsView');
    const backtestView = document.getElementById('backtestView');
    const chartView = document.getElementById('chartView');

    const screenerSidebar = document.getElementById('screenerConfigSection');
    const backtestSidebar = document.getElementById('backtestSidebarSection');

    // Reset tabs
    tabScreener.classList.toggle('active', viewName === 'screener');
    tabBacktest.classList.toggle('active', viewName === 'backtest');

    if (viewName === 'screener') {
        resultsView.classList.remove('hidden');
        backtestView.classList.add('hidden');
        chartView.classList.add('hidden');
        screenerSidebar.classList.remove('hidden');
        backtestSidebar.classList.add('hidden');
    } else if (viewName === 'backtest') {
        resultsView.classList.add('hidden');
        backtestView.classList.remove('hidden');
        chartView.classList.add('hidden');
        screenerSidebar.classList.add('hidden');
        backtestSidebar.classList.remove('hidden');
    } else if (viewName === 'chart') {
        resultsView.classList.add('hidden');
        backtestView.classList.add('hidden');
        chartView.classList.remove('hidden');
    }
}

// ============================================================================
// Data Loading: Universes (Multi-Select) & Timeframes
// ============================================================================

async function loadUniverses() {
    try {
        const res = await fetch('/api/universes');
        const data = await res.json();
        AppState.universes = data.universes;
        renderUniverseMultiSelect();
    } catch (err) {
        console.error('Failed to load universes:', err);
    }
}

function renderUniverseMultiSelect() {
    const wrapper = document.getElementById('universeMultiWrapper');
    if (!wrapper) return;

    wrapper.innerHTML = '';

    AppState.universes.forEach(u => {
        const item = document.createElement('div');
        const isSelected = AppState.selectedUniverses.has(u.key);
        item.className = `universe-item ${isSelected ? 'selected' : ''}`;
        item.dataset.key = u.key;

        const countLabel = u.count > 0 ? ` (${u.count})` : '';

        item.innerHTML = `
            <div style="display:flex; align-items:center; gap:8px;">
                <input type="checkbox" class="universe-checkbox" ${isSelected ? 'checked' : ''}>
                <span>${u.name}${countLabel}</span>
            </div>
            <span class="badge ${u.exchange === 'BSE' ? 'badge-danger' : 'badge-primary'}">${u.exchange}</span>
        `;

        item.addEventListener('click', (e) => {
            // Prevent duplicate event when clicking checkbox directly
            if (e.target.tagName !== 'INPUT') {
                const cb = item.querySelector('.universe-checkbox');
                cb.checked = !cb.checked;
            }
            toggleUniverseSelection(u.key, item.querySelector('.universe-checkbox').checked);
        });

        wrapper.appendChild(item);
    });

    updateCustomTickersVisibility();
}

function toggleUniverseSelection(universeKey, isSelected) {
    if (isSelected) {
        AppState.selectedUniverses.add(universeKey);
    } else {
        AppState.selectedUniverses.delete(universeKey);
    }

    // Refresh UI item classes
    document.querySelectorAll('.universe-item').forEach(el => {
        const k = el.dataset.key;
        const selected = AppState.selectedUniverses.has(k);
        el.classList.toggle('selected', selected);
        const cb = el.querySelector('.universe-checkbox');
        if (cb) cb.checked = selected;
    });

    updateCustomTickersVisibility();
}

function selectAllUniverses(selectAll) {
    if (selectAll) {
        AppState.universes.forEach(u => AppState.selectedUniverses.add(u.key));
    } else {
        AppState.selectedUniverses.clear();
        AppState.selectedUniverses.add('nifty50'); // Keep default
    }
    renderUniverseMultiSelect();
}

function updateCustomTickersVisibility() {
    const wrapper = document.getElementById('customTickersWrapper');
    if (wrapper) {
        wrapper.classList.toggle('hidden', !AppState.selectedUniverses.has('custom'));
    }
}

async function loadTimeframes() {
    try {
        const res = await fetch('/api/timeframes');
        const data = await res.json();
        const select = document.getElementById('timeframeSelect');
        select.innerHTML = '';
        data.timeframes.forEach(tf => {
            const opt = document.createElement('option');
            opt.value = tf.key;
            opt.textContent = tf.label;
            if (tf.key === '1d') opt.selected = true;
            select.appendChild(opt);
        });
    } catch (err) {
        console.error('Failed to load timeframes:', err);
    }
}

// ============================================================================
// Strategy Management
// ============================================================================

async function loadStrategies() {
    try {
        const res = await fetch('/api/strategies');
        const data = await res.json();
        AppState.strategies = data.strategies;

        // Auto-select first strategy if none selected
        if (AppState.selectedStrategies.size === 0 && AppState.strategies.length > 0) {
            AppState.selectedStrategies.add(AppState.strategies[0].id);
        }

        renderStrategyList();
    } catch (err) {
        showToast('Failed to load strategies', 'error');
    }
}

function renderStrategyList() {
    const list = document.getElementById('strategyList');
    list.innerHTML = '';

    if (AppState.strategies.length === 0) {
        list.innerHTML = `
            <div style="text-align:center; padding:20px; color:var(--text-tertiary); font-size:0.82rem;">
                No strategies found.<br>Click <strong>+ New</strong> or <strong>Upload</strong> to add one.
            </div>
        `;
        return;
    }

    AppState.strategies.forEach(s => {
        const card = document.createElement('div');
        const isSelected = AppState.selectedStrategies.has(s.id);
        card.className = `strategy-card ${isSelected ? 'selected' : ''} ${s.error ? 'has-error' : ''}`;

        card.innerHTML = `
            <div class="strategy-checkbox">${isSelected ? '✓' : ''}</div>
            <div class="strategy-info">
                <div class="strategy-name">${escapeHtml(s.name)}</div>
                <div class="strategy-desc">${escapeHtml(s.description || (s.error ? 'Error in code' : 'Custom Strategy'))}</div>
            </div>
            <div class="strategy-actions">
                <button class="strategy-action-btn" title="Edit code" onclick="editStrategy('${s.id}', event)">✏️</button>
                <button class="strategy-action-btn" title="Delete" onclick="deleteStrategy('${s.id}', event)">🗑️</button>
            </div>
        `;

        card.addEventListener('click', (e) => {
            if (e.target.closest('.strategy-actions')) return;
            toggleStrategy(s.id);
        });

        list.appendChild(card);
    });
}

function toggleStrategy(id) {
    if (AppState.selectedStrategies.has(id)) {
        AppState.selectedStrategies.delete(id);
    } else {
        AppState.selectedStrategies.add(id);
    }
    renderStrategyList();
}

// ============================================================================
// Strategy Editor Modal (No Reliance Test Button)
// ============================================================================

function openEditorModal(strategyId = null) {
    const modal = document.getElementById('editorModal');
    const title = document.getElementById('editorModalTitle');
    const idInput = document.getElementById('editorStrategyId');
    const codeArea = document.getElementById('codeEditor');
    const promptInput = document.getElementById('aiPromptInput');

    promptInput.value = '';

    if (strategyId) {
        title.textContent = 'Edit Strategy';
        idInput.value = strategyId;
        idInput.disabled = true;

        fetch(`/api/strategy/${strategyId}/code`)
            .then(res => res.json())
            .then(data => {
                codeArea.value = data.code || '';
            })
            .catch(() => showToast('Failed to load code', 'error'));
    } else {
        title.textContent = 'New Strategy';
        idInput.value = '';
        idInput.disabled = false;

        fetch('/api/ai/template')
            .then(res => res.json())
            .then(data => {
                codeArea.value = data.code || '';
            })
            .catch(() => {
                codeArea.value = '# Write your strategy code here\n';
            });
    }

    modal.classList.add('active');
}

function closeEditorModal() {
    document.getElementById('editorModal').classList.remove('active');
}

async function saveStrategy() {
    const idInput = document.getElementById('editorStrategyId');
    const codeArea = document.getElementById('codeEditor');

    const id = idInput.value.trim();
    const code = codeArea.value.trim();

    if (!id) {
        showToast('Please enter a strategy ID', 'error');
        return;
    }
    if (!code) {
        showToast('Please enter strategy code', 'error');
        return;
    }

    try {
        const token = localStorage.getItem('auth_token') || '';
        const res = await fetch('/api/strategy/save', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ id, code })
        });
        const data = await res.json();

        if (data.success) {
            showToast(`Strategy "${id}" saved successfully!`, 'success');
            closeEditorModal();
            AppState.selectedStrategies.add(id);
            loadStrategies();
        } else {
            showToast(`Error: ${data.error || 'Failed to save'}`, 'error');
        }
    } catch (err) {
        showToast('Failed to save strategy: ' + err.message, 'error');
    }
}

async function deleteStrategy(id, e) {
    e.stopPropagation();
    if (!confirm(`Are you sure you want to delete strategy "${id}"?`)) return;

    try {
        const token = localStorage.getItem('auth_token') || '';
        const res = await fetch(`/api/strategy/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();

        if (data.success) {
            showToast(`Strategy "${id}" deleted`, 'info');
            AppState.selectedStrategies.delete(id);
            loadStrategies();
        } else {
            showToast('Failed to delete strategy', 'error');
        }
    } catch (err) {
        showToast('Delete error: ' + err.message, 'error');
    }
}

function editStrategy(id, e) {
    e.stopPropagation();
    openEditorModal(id);
}

async function generateWithAI() {
    const promptInput = document.getElementById('aiPromptInput');
    const codeArea = document.getElementById('codeEditor');
    const idInput = document.getElementById('editorStrategyId');
    const btn = document.getElementById('aiGenerateBtn');

    const description = promptInput.value.trim();
    if (!description) {
        showToast('Please describe your strategy first', 'error');
        return;
    }

    btn.disabled = true;
    btn.innerHTML = '<div class="spinner"></div> Generating...';

    try {
        const res = await fetch('/api/ai/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ description })
        });
        const data = await res.json();

        if (data.success && data.code) {
            codeArea.value = data.code;
            if (!idInput.value && data.name) {
                idInput.value = data.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
            }
            showToast(`Generated using ${data.source === 'gemini' ? 'Gemini AI' : 'Smart Rule Engine'}!`, 'success');
        } else {
            showToast(`AI generation error: ${data.error || 'Unknown'}`, 'error');
        }
    } catch (err) {
        showToast('AI generation failed: ' + err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '🤖 Generate Python Code';
    }
}

async function uploadStrategy(e) {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
        const res = await fetch('/api/strategy/upload', {
            method: 'POST',
            body: formData
        });
        const data = await res.json();

        if (data.success) {
            showToast(`Uploaded "${file.name}"!`, 'success');
            loadStrategies();
        } else {
            showToast(`Upload failed: ${data.error || 'Unknown'}`, 'error');
        }
    } catch (err) {
        showToast('Upload error: ' + err.message, 'error');
    } finally {
        e.target.value = '';
    }
}

// ============================================================================
// Market Scanner (Multi-Universe & Tolerance)
// ============================================================================

async function startScan() {
    const strategyIds = Array.from(AppState.selectedStrategies);
    if (strategyIds.length === 0) {
        showToast('Please select at least one strategy from the left panel', 'error');
        return;
    }

    const universeKeys = Array.from(AppState.selectedUniverses);
    if (universeKeys.length === 0) {
        showToast('Please select at least one stock universe', 'error');
        return;
    }

    const interval = document.getElementById('timeframeSelect').value;
    const tolerance = parseInt(document.getElementById('toleranceSlider').value, 10);
    const customTickers = document.getElementById('customTickers').value;

    const scanBtn = document.getElementById('scanBtn');
    scanBtn.disabled = true;
    scanBtn.textContent = '⏳ Scanning...';

    const progressWrapper = document.getElementById('scanProgressWrapper');
    progressWrapper.classList.add('active');

    try {
        const res = await fetch('/api/scan/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                strategies: strategyIds,
                universe: universeKeys.join(','),
                interval,
                tolerance,
                custom_tickers: customTickers
            })
        });

        const data = await res.json();
        if (data.status === 'started') {
            AppState.activeScanInterval = setInterval(pollScanProgress, 800);
        } else {
            showToast(`Scan start failed: ${data.error || 'Unknown'}`, 'error');
            resetScanUI();
        }
    } catch (err) {
        showToast('Scan error: ' + err.message, 'error');
        resetScanUI();
    }
}

async function pollScanProgress() {
    try {
        const res = await fetch('/api/scan/progress');
        const progress = await res.json();

        const fill = document.getElementById('scanProgressFill');
        const ticker = document.getElementById('scanProgressTicker');
        const stats = document.getElementById('scanProgressStats');

        fill.style.width = `${progress.percentage}%`;
        ticker.textContent = progress.current_ticker ? `Analyzing ${progress.current_ticker}...` : '';
        stats.textContent = `${progress.scanned}/${progress.total} (${progress.signals_found} signals)`;

        if (progress.done || progress.cancelled) {
            clearInterval(AppState.activeScanInterval);
            AppState.activeScanInterval = null;
            resetScanUI();

            // Fetch final results
            const resultsRes = await fetch('/api/scan/results');
            const resultsData = await resultsRes.json();
            AppState.scanResults = resultsData.results || [];
            renderResults();

            if (AppState.scanResults.length > 0) {
                showToast(`Scan complete: Found ${AppState.scanResults.length} matching signals!`, 'success');
            } else {
                showToast('Scan complete: No aligned signals found.', 'info');
            }
        }
    } catch (err) {
        console.error('Error polling scan progress:', err);
    }
}

async function cancelScan() {
    try {
        await fetch('/api/scan/cancel', { method: 'POST' });
        showToast('Scan cancelled', 'info');
    } catch (err) {
        console.error('Cancel error:', err);
    }
}

function resetScanUI() {
    const scanBtn = document.getElementById('scanBtn');
    scanBtn.disabled = false;
    scanBtn.textContent = '🚀 Start Market Scan';

    const progressWrapper = document.getElementById('scanProgressWrapper');
    progressWrapper.classList.remove('active');
}

// ============================================================================
// Screener Results Table Rendering
// ============================================================================

function renderResults() {
    const tbody = document.getElementById('resultsTableBody');
    const countEl = document.getElementById('resultsCount');

    let filtered = AppState.scanResults;
    if (AppState.currentFilter === 'buy') {
        filtered = filtered.filter(r => r.signal === 'BUY');
    } else if (AppState.currentFilter === 'sell') {
        filtered = filtered.filter(r => r.signal === 'SELL');
    }

    countEl.textContent = `${filtered.length} matching stock${filtered.length === 1 ? '' : 's'} found`;

    if (filtered.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7">
                    <div class="empty-state">
                        <div class="empty-state-icon">🔍</div>
                        <div class="empty-state-title">No Signals Found</div>
                        <div class="empty-state-desc">Try increasing the candle tolerance slider or selecting fewer strategies.</div>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = '';
    filtered.forEach(r => {
        const tr = document.createElement('tr');
        tr.className = 'result-row';

        const isBuy = r.signal === 'BUY';
        const changeClass = r.change_pct >= 0 ? 'text-buy' : 'text-sell';
        const changeSign = r.change_pct >= 0 ? '+' : '';

        tr.innerHTML = `
            <td><strong style="color:var(--text-primary); cursor:pointer;">${r.symbol}</strong></td>
            <td><span class="badge ${r.exchange === 'BSE' ? 'badge-danger' : 'badge-primary'}">${r.exchange}</span></td>
            <td style="font-family:var(--font-mono);">₹${r.price.toFixed(2)}</td>
            <td class="${changeClass}" style="font-family:var(--font-mono);">${changeSign}${r.change_pct.toFixed(2)}%</td>
            <td>
                <span class="signal-badge ${isBuy ? 'signal-buy' : 'signal-sell'}">
                    ${isBuy ? '🟢 BUY' : '🔴 SELL'}
                </span>
            </td>
            <td>
                ${(r.details || []).map(d =>
                    `<span class="detail-chip" title="Signal: ${d.signal} (${d.bars_ago} bars ago)">${escapeHtml(d.strategy_name)}</span>`
                ).join(' ')}
            </td>
            <td>
                <button class="btn btn-xs btn-primary" onclick="openChartForSymbol('${r.symbol}', '${r.exchange}')">
                    📊 Chart
                </button>
            </td>
        `;

        tr.addEventListener('click', (e) => {
            if (e.target.tagName !== 'BUTTON') {
                openChartForSymbol(r.symbol, r.exchange);
            }
        });

        tbody.appendChild(tr);
    });
}

function openChartForSymbol(symbol, exchange) {
    AppState.chartSymbol = symbol;
    AppState.chartExchange = exchange;

    switchMainView('chart');

    const interval = document.getElementById('timeframeSelect').value;
    const strategyIds = Array.from(AppState.selectedStrategies).join(',');
    loadChart(symbol, exchange, interval, strategyIds);
}

function exportResults() {
    if (AppState.scanResults.length === 0) {
        showToast('No results to export', 'error');
        return;
    }

    const headers = ['Symbol', 'Exchange', 'Price', 'Change%', 'Signal', 'Strategies'];
    const rows = AppState.scanResults.map(r => [
        r.symbol,
        r.exchange,
        r.price,
        r.change_pct,
        r.signal,
        (r.details || []).map(d => d.strategy_name).join(';')
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    downloadBlob(csvContent, `screener_signals_${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv');
}

// ============================================================================
// Backtest Simulator (Option 7)
// ============================================================================

async function runBacktestSimulation() {
    const strategyIds = Array.from(AppState.selectedStrategies);
    if (strategyIds.length === 0) {
        showToast('Please select at least one strategy for backtest', 'error');
        return;
    }

    const universeKeys = Array.from(AppState.selectedUniverses);
    if (universeKeys.length === 0) {
        showToast('Please select at least one stock universe', 'error');
        return;
    }

    const initialCapital = parseFloat(document.getElementById('btInitialCapital').value) || 100000;
    const positionSize = parseFloat(document.getElementById('btPositionSize').value) || 10;
    const stopLoss = parseFloat(document.getElementById('btStopLoss').value) || 0;
    const takeProfit = parseFloat(document.getElementById('btTakeProfit').value) || 0;
    const maxBars = parseInt(document.getElementById('btMaxBars').value, 10) || 25;
    const exitOpposite = document.getElementById('btExitOpposite').checked;
    const interval = document.getElementById('timeframeSelect').value;
    const customTickers = document.getElementById('customTickers').value;

    const runBtn = document.getElementById('runBacktestBtn');
    runBtn.disabled = true;
    runBtn.textContent = '⏳ Simulating...';

    const progressWrapper = document.getElementById('btProgressWrapper');
    progressWrapper.classList.add('active');

    try {
        const res = await fetch('/api/backtest/run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                strategies: strategyIds,
                universe: universeKeys.join(','),
                interval,
                initial_capital: initialCapital,
                position_size_pct: positionSize,
                stop_loss_pct: stopLoss,
                take_profit_pct: takeProfit,
                exit_on_opposite: exitOpposite,
                max_holding_bars: maxBars,
                custom_tickers: customTickers
            })
        });

        const data = await res.json();
        if (data.status === 'started') {
            AppState.activeBacktestInterval = setInterval(pollBacktestProgress, 800);
        } else {
            showToast(`Backtest error: ${data.error || 'Unknown'}`, 'error');
            resetBacktestUI();
        }
    } catch (err) {
        showToast('Backtest launch failed: ' + err.message, 'error');
        resetBacktestUI();
    }
}

async function pollBacktestProgress() {
    try {
        const res = await fetch('/api/backtest/progress');
        const progress = await res.json();

        const fill = document.getElementById('btProgressFill');
        const ticker = document.getElementById('btProgressTicker');
        const stats = document.getElementById('btProgressStats');

        fill.style.width = `${progress.percentage}%`;
        ticker.textContent = progress.current_stock ? `Testing ${progress.current_stock}...` : '';
        stats.textContent = `${progress.completed}/${progress.total} (${progress.percentage}%)`;

        if (progress.status === 'completed' || progress.cancelled) {
            clearInterval(AppState.activeBacktestInterval);
            AppState.activeBacktestInterval = null;
            resetBacktestUI();

            // Fetch results
            const resultsRes = await fetch('/api/backtest/results');
            const data = await resultsRes.json();
            AppState.backtestResult = data;
            renderBacktestResults(data);
            showToast(`Backtest completed! ${data.metrics?.total_trades || 0} trades evaluated.`, 'success');
        }
    } catch (err) {
        console.error('Error polling backtest progress:', err);
    }
}

function cancelBacktestSimulation() {
    fetch('/api/backtest/cancel', { method: 'POST' });
    showToast('Backtest simulation cancelled', 'info');
}

function resetBacktestUI() {
    const runBtn = document.getElementById('runBacktestBtn');
    runBtn.disabled = false;
    runBtn.textContent = '⚡ Run Backtest Simulation';

    const progressWrapper = document.getElementById('btProgressWrapper');
    progressWrapper.classList.remove('active');
}

function renderBacktestResults(data) {
    if (!data || !data.metrics) return;

    const m = data.metrics;

    // Enable export & save buttons
    document.getElementById('btExportTradesBtn').disabled = false;
    document.getElementById('btSaveCloudBtn').disabled = false;

    // Update KPI Cards
    const retEl = document.getElementById('kpiReturn');
    retEl.textContent = `${m.total_return_pct >= 0 ? '+' : ''}${m.total_return_pct}%`;
    retEl.className = `kpi-value ${m.total_return_pct >= 0 ? 'text-buy' : 'text-danger'}`;

    document.getElementById('kpiNetPnl').textContent = `Net P&L: ₹${m.net_pnl.toLocaleString()}`;
    document.getElementById('kpiWinRate').textContent = `${m.win_rate_pct}%`;
    document.getElementById('kpiWinLoss').textContent = `${m.winning_trades} Wins / ${m.losing_trades} Losses`;
    document.getElementById('kpiTotalTrades').textContent = m.total_trades;
    document.getElementById('kpiFinalCapital').textContent = `Final Equity: ₹${m.final_equity.toLocaleString()}`;
    document.getElementById('kpiProfitFactor').textContent = m.profit_factor;
    document.getElementById('kpiDrawdown').textContent = `-${m.max_drawdown_pct}%`;
    document.getElementById('kpiDrawdownVal').textContent = `Max DD: ₹${m.max_drawdown_val.toLocaleString()}`;
    document.getElementById('kpiAvgReturn').textContent = `${m.avg_trade_return_pct}%`;
    document.getElementById('kpiAvgWinLoss').textContent = `Win: +${m.avg_win_pct}% | Loss: ${m.avg_loss_pct}%`;

    // Render Equity Curve (SVG Chart)
    renderEquityCurveChart(data.equity_curve || []);

    // Render Trade Log
    renderTradeLogTable(data.trades || []);
}

function renderEquityCurveChart(curve) {
    const container = document.getElementById('equityCurveContainer');
    if (!container || curve.length === 0) return;

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 240;
    const padding = { top: 20, right: 30, bottom: 30, left: 60 };

    const values = curve.map(c => c.equity);
    const minVal = Math.min(...values) * 0.98;
    const maxVal = Math.max(...values) * 1.02;

    const xScale = (idx) => padding.left + (idx / (curve.length - 1 || 1)) * (width - padding.left - padding.right);
    const yScale = (val) => height - padding.bottom - ((val - minVal) / (maxVal - minVal || 1)) * (height - padding.top - padding.bottom);

    // Build SVG Path points
    const points = curve.map((c, i) => `${xScale(i)},${yScale(c.equity)}`).join(' ');
    const isProfitable = curve[curve.length - 1].equity >= curve[0].equity;
    const strokeColor = isProfitable ? '#00f59b' : '#ff3b57';
    const fillColor = isProfitable ? 'rgba(0, 245, 155, 0.15)' : 'rgba(255, 59, 87, 0.15)';

    const areaPoints = `${xScale(0)},${height - padding.bottom} ${points} ${xScale(curve.length - 1)},${height - padding.bottom}`;

    container.innerHTML = `
        <svg width="100%" height="100%" viewBox="0 0 ${width} ${height}" style="overflow:visible;">
            <defs>
                <linearGradient id="eqGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="${strokeColor}" stop-opacity="0.3"/>
                    <stop offset="100%" stop-color="${strokeColor}" stop-opacity="0.0"/>
                </linearGradient>
            </defs>
            <!-- Baseline -->
            <line x1="${padding.left}" y1="${yScale(curve[0].equity)}" x2="${width - padding.right}" y2="${yScale(curve[0].equity)}"
                  stroke="rgba(255,255,255,0.15)" stroke-dasharray="4"/>
            <!-- Area & Line -->
            <polygon points="${areaPoints}" fill="url(#eqGradient)"/>
            <polyline fill="none" stroke="${strokeColor}" stroke-width="2.5" points="${points}" stroke-linejoin="round"/>
            <!-- Axis Labels -->
            <text x="${padding.left - 8}" y="${padding.top + 10}" fill="var(--text-tertiary)" font-size="11" text-anchor="end">₹${Math.round(maxVal).toLocaleString()}</text>
            <text x="${padding.left - 8}" y="${height - padding.bottom}" fill="var(--text-tertiary)" font-size="11" text-anchor="end">₹${Math.round(minVal).toLocaleString()}</text>
            <text x="${padding.left}" y="${height - 8}" fill="var(--text-tertiary)" font-size="11">Start</text>
            <text x="${width - padding.right}" y="${height - 8}" fill="var(--text-tertiary)" font-size="11" text-anchor="end">End (${curve.length} bars)</text>
        </svg>
    `;
}

function renderTradeLogTable(trades) {
    const tbody = document.getElementById('tradeLogTableBody');
    if (!tbody) return;

    if (trades.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:20px; color:var(--text-tertiary);">No trades generated.</td></tr>`;
        return;
    }

    tbody.innerHTML = '';
    trades.forEach(t => {
        const tr = document.createElement('tr');
        const isWin = t.pnl > 0;
        const retSign = t.return_pct > 0 ? '+' : '';

        tr.innerHTML = `
            <td><strong style="color:var(--text-primary);">${t.symbol}</strong></td>
            <td><span class="badge ${t.direction === 'BUY' ? 'badge-primary' : 'badge-danger'}">${t.direction}</span></td>
            <td>${t.entry_date}</td>
            <td style="font-family:var(--font-mono);">₹${t.entry_price.toFixed(2)}</td>
            <td>${t.exit_date}</td>
            <td style="font-family:var(--font-mono);">₹${t.exit_price.toFixed(2)}</td>
            <td class="${isWin ? 'text-buy' : 'text-danger'}" style="font-family:var(--font-mono); font-weight:600;">${retSign}${t.return_pct.toFixed(2)}%</td>
            <td class="${isWin ? 'text-buy' : 'text-danger'}" style="font-family:var(--font-mono);">₹${t.pnl.toLocaleString()}</td>
            <td><span class="text-xs text-muted">${escapeHtml(t.exit_reason || '')}</span></td>
            <td><span class="badge">${t.holding_bars}b</span></td>
        `;
        tbody.appendChild(tr);
    });
}

function filterTradeLog() {
    const query = document.getElementById('tradeLogSearch').value.toUpperCase().trim();
    if (!AppState.backtestResult || !AppState.backtestResult.trades) return;

    const filtered = AppState.backtestResult.trades.filter(t => t.symbol.includes(query));
    renderTradeLogTable(filtered);
}

function exportBacktestTradesCSV() {
    if (!AppState.backtestResult || !AppState.backtestResult.trades) return;

    const headers = ['Symbol', 'Exchange', 'Direction', 'Entry Date', 'Entry Price', 'Exit Date', 'Exit Price', 'Shares', 'P&L', 'Return%', 'Holding Bars', 'Exit Reason'];
    const rows = AppState.backtestResult.trades.map(t => [
        t.symbol, t.exchange, t.direction, t.entry_date, t.entry_price, t.exit_date, t.exit_price, t.shares, t.pnl, t.return_pct, t.holding_bars, `"${t.exit_reason}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    downloadBlob(csvContent, `backtest_trades_${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv');
}

async function saveBacktestToCloud() {
    if (!AppState.backtestResult) return;

    const title = prompt('Enter a title for this backtest record:', `Backtest ${new Date().toLocaleDateString()}`);
    if (title === null) return;

    try {
        const token = localStorage.getItem('auth_token') || '';
        const res = await fetch('/api/backtest/save', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                title,
                strategy_ids: Array.from(AppState.selectedStrategies),
                universe: Array.from(AppState.selectedUniverses).join(','),
                timeframe: document.getElementById('timeframeSelect').value,
                metrics: AppState.backtestResult.metrics,
                trades: AppState.backtestResult.trades
            })
        });

        const data = await res.json();
        if (data.success) {
            showToast('☁️ Backtest results saved to your cloud account!', 'success');
        } else {
            showToast('Failed to save backtest', 'error');
        }
    } catch (err) {
        showToast('Save error: ' + err.message, 'error');
    }
}

// ============================================================================
// User Authentication System (Registration, Email OTP, Login, Reset)
// ============================================================================

async function checkCurrentUser() {
    const token = localStorage.getItem('auth_token');
    if (!token) {
        updateAuthHeader(null);
        return;
    }

    try {
        const res = await fetch('/api/auth/me', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.user) {
            AppState.currentUser = data.user;
            updateAuthHeader(data.user);
        } else {
            logout();
        }
    } catch (e) {
        console.error('Auth verification error:', e);
    }
}

function updateAuthHeader(user) {
    const btn = document.getElementById('userAuthBtn');
    const dropdown = document.getElementById('userDropdown');
    const nameEl = document.getElementById('dropdownUsername');
    const emailEl = document.getElementById('dropdownEmail');
    const cloudLabel = document.getElementById('cloudStatusLabel');

    if (user) {
        btn.textContent = `👤 ${user.username} ▾`;
        btn.onclick = () => dropdown.classList.toggle('hidden');
        nameEl.textContent = user.username;
        emailEl.textContent = user.email;
        cloudLabel.textContent = 'Cloud Active';
    } else {
        btn.textContent = '👤 Sign In';
        btn.onclick = () => openAuthModal('signin');
        dropdown.classList.add('hidden');
        cloudLabel.textContent = 'Cloud Storage';
    }
}

function openAuthModal(view = 'signin') {
    showAuthView(view);
    document.getElementById('authModal').classList.add('active');
}

function closeAuthModal() {
    document.getElementById('authModal').classList.remove('active');
}

function showAuthView(view) {
    const title = document.getElementById('authModalTitle');
    const signinForm = document.getElementById('authSignInForm');
    const registerForm = document.getElementById('authRegisterForm');
    const verifyForm = document.getElementById('authVerifyOtpForm');
    const forgotForm = document.getElementById('authForgotForm');

    [signinForm, registerForm, verifyForm, forgotForm].forEach(f => f.classList.add('hidden'));

    if (view === 'signin') {
        title.textContent = '👤 Account Sign In';
        signinForm.classList.remove('hidden');
    } else if (view === 'register') {
        title.textContent = '✨ Create New Account';
        registerForm.classList.remove('hidden');
    } else if (view === 'verify') {
        title.textContent = '✉️ Verify Email OTP';
        verifyForm.classList.remove('hidden');
    } else if (view === 'forgot') {
        title.textContent = '🔑 Reset Your Password';
        forgotForm.classList.remove('hidden');
        document.getElementById('forgotStep1').classList.remove('hidden');
        document.getElementById('forgotStep2').classList.add('hidden');
    }
}

async function submitLogin() {
    const loginId = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;

    if (!loginId || !password) {
        showToast('Please enter both username/email and password', 'error');
        return;
    }

    try {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ login_id: loginId, password })
        });
        const data = await res.json();

        if (data.success && data.token) {
            localStorage.setItem('auth_token', data.token);
            AppState.currentUser = data.user;
            updateAuthHeader(data.user);
            closeAuthModal();
            showToast(`Welcome back, ${data.user.username}!`, 'success');
        } else if (data.error === 'unverified_email') {
            AppState.pendingAuthEmail = data.email;
            document.getElementById('verifyOtpEmailDisplay').textContent = `Enter the 6-digit OTP sent to ${data.email}`;
            showAuthView('verify');
            if (data.dev_otp) showDevOtpBanner(data.dev_otp);
            showToast(data.message, 'info');
        } else {
            showToast(data.error || 'Login failed', 'error');
        }
    } catch (e) {
        showToast('Login request error: ' + e.message, 'error');
    }
}

async function submitRegister() {
    const username = document.getElementById('regUsername').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const password = document.getElementById('regPassword').value;

    if (!username || !email || !password) {
        showToast('Please fill out all fields', 'error');
        return;
    }

    try {
        const res = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, email, password })
        });
        const data = await res.json();

        if (data.success) {
            AppState.pendingAuthEmail = email;
            document.getElementById('verifyOtpEmailDisplay').textContent = `Verification code sent to ${email}`;
            showAuthView('verify');
            if (data.dev_otp) showDevOtpBanner(data.dev_otp);
            showToast(data.message, 'success');
        } else {
            showToast(data.error || 'Registration failed', 'error');
        }
    } catch (e) {
        showToast('Registration error: ' + e.message, 'error');
    }
}

function showDevOtpBanner(otp) {
    const banner = document.getElementById('devOtpBanner');
    const label = document.getElementById('devOtpCodeLabel');
    if (banner && label) {
        label.textContent = `Auto-Detected OTP: ${otp}`;
        banner.dataset.otp = otp;
        banner.classList.remove('hidden');
    }
}

function fillDevOtp() {
    const banner = document.getElementById('devOtpBanner');
    if (banner && banner.dataset.otp) {
        document.getElementById('verifyOtpInput').value = banner.dataset.otp;
    }
}

async function submitOtpVerification() {
    const otp = document.getElementById('verifyOtpInput').value.trim();
    const email = AppState.pendingAuthEmail;

    if (!otp || otp.length !== 6) {
        showToast('Please enter the 6-digit verification code', 'error');
        return;
    }

    try {
        const res = await fetch('/api/auth/verify-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, otp })
        });
        const data = await res.json();

        if (data.success && data.token) {
            localStorage.setItem('auth_token', data.token);
            AppState.currentUser = data.user;
            updateAuthHeader(data.user);
            closeAuthModal();
            showToast('Email verified! You are now logged in.', 'success');
        } else {
            showToast(data.error || 'Verification failed', 'error');
        }
    } catch (e) {
        showToast('Verification error: ' + e.message, 'error');
    }
}

async function resendOtp() {
    const email = AppState.pendingAuthEmail;
    if (!email) return;

    try {
        const res = await fetch('/api/auth/resend-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        const data = await res.json();
        if (data.success) {
            if (data.dev_otp) showDevOtpBanner(data.dev_otp);
            showToast('A new verification code has been dispatched', 'success');
        } else {
            showToast(data.error || 'Failed to resend code', 'error');
        }
    } catch (e) {
        showToast('Resend error: ' + e.message, 'error');
    }
}

async function submitForgotPassword() {
    const email = document.getElementById('forgotEmail').value.trim();
    if (!email) {
        showToast('Please enter your email', 'error');
        return;
    }

    try {
        const res = await fetch('/api/auth/forgot-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        const data = await res.json();

        AppState.pendingAuthEmail = email;
        document.getElementById('forgotStep1').classList.add('hidden');
        document.getElementById('forgotStep2').classList.remove('hidden');
        if (data.dev_otp) showToast(`Reset Code: ${data.dev_otp}`, 'info');
        showToast(data.message, 'info');
    } catch (e) {
        showToast('Error requesting password reset', 'error');
    }
}

async function submitPasswordReset() {
    const email = AppState.pendingAuthEmail;
    const otp = document.getElementById('resetOtpInput').value.trim();
    const newPassword = document.getElementById('resetNewPassword').value;

    if (!otp || !newPassword) {
        showToast('Please enter both the reset code and your new password', 'error');
        return;
    }

    try {
        const res = await fetch('/api/auth/reset-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, otp, new_password: newPassword })
        });
        const data = await res.json();

        if (data.success) {
            showToast(data.message, 'success');
            showAuthView('signin');
        } else {
            showToast(data.error || 'Failed to reset password', 'error');
        }
    } catch (e) {
        showToast('Password reset error: ' + e.message, 'error');
    }
}

async function logout() {
    const token = localStorage.getItem('auth_token');
    if (token) {
        fetch('/api/auth/logout', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
    }
    localStorage.removeItem('auth_token');
    AppState.currentUser = null;
    updateAuthHeader(null);
    showToast('Signed out successfully', 'info');
}

// ============================================================================
// Free Cloud Storage & Sync Modal
// ============================================================================

async function openCloudModal() {
    const modal = document.getElementById('cloudModal');
    modal.classList.add('active');

    try {
        const token = localStorage.getItem('auth_token') || '';
        const res = await fetch('/api/cloud/status', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();

        document.getElementById('cloudStatStrats').textContent = data.strategies_count || 0;
        document.getElementById('cloudStatDrawings').textContent = data.drawings_count || 0;
        document.getElementById('cloudStatBacktests').textContent = data.backtests_count || 0;
    } catch (e) {
        console.error('Cloud status error:', e);
    }
}

function closeCloudModal() {
    document.getElementById('cloudModal').classList.remove('active');
}

async function exportCloudBackup() {
    try {
        const token = localStorage.getItem('auth_token') || '';
        const res = await fetch('/api/cloud/export', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        downloadBlob(JSON.stringify(data, null, 2), `trading_screener_backup_${new Date().toISOString().slice(0, 10)}.json`, 'application/json');
        showToast('☁️ Cloud backup exported successfully!', 'success');
    } catch (e) {
        showToast('Export failed: ' + e.message, 'error');
    }
}

async function importCloudBackup(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
        const text = await file.text();
        const packageData = JSON.parse(text);

        const token = localStorage.getItem('auth_token') || '';
        const res = await fetch('/api/cloud/import', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(packageData)
        });
        const data = await res.json();

        if (data.success) {
            showToast(`Restored ${data.imported_strategies} strategies and ${data.imported_drawings} charts!`, 'success');
            loadStrategies();
            openCloudModal();
        } else {
            showToast('Restore error', 'error');
        }
    } catch (e) {
        showToast('Failed to parse backup JSON: ' + e.message, 'error');
    } finally {
        event.target.value = '';
    }
}

// ============================================================================
// Settings & SMTP Integration
// ============================================================================

async function loadSettings() {
    try {
        const res = await fetch('/api/settings');
        const data = await res.json();

        if (data.gemini_api_key_masked) {
            document.getElementById('settingsGeminiKey').placeholder = `Current: ${data.gemini_api_key_masked}`;
        }
        if (data.smtp_host) document.getElementById('settingsSmtpHost').value = data.smtp_host;
        if (data.smtp_port) document.getElementById('settingsSmtpPort').value = data.smtp_port;
        if (data.smtp_user) document.getElementById('settingsSmtpUser').value = data.smtp_user;
        if (data.smtp_pass_set) document.getElementById('settingsSmtpPass').placeholder = '•••••••• (Configured)';
    } catch (e) {
        console.error('Settings load error:', e);
    }
}

function openSettingsModal() {
    loadSettings();
    document.getElementById('settingsModal').classList.add('active');
}

function closeSettingsModal() {
    document.getElementById('settingsModal').classList.remove('active');
}

async function saveSettings() {
    const geminiKey = document.getElementById('settingsGeminiKey').value.trim();
    const smtpHost = document.getElementById('settingsSmtpHost').value.trim();
    const smtpPort = parseInt(document.getElementById('settingsSmtpPort').value, 10) || 587;
    const smtpUser = document.getElementById('settingsSmtpUser').value.trim();
    const smtpPass = document.getElementById('settingsSmtpPass').value.trim();

    const payload = {
        smtp_host: smtpHost,
        smtp_port: smtpPort,
        smtp_user: smtpUser
    };
    if (geminiKey) payload.gemini_api_key = geminiKey;
    if (smtpPass) payload.smtp_pass = smtpPass;

    try {
        const res = await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
            showToast('Settings saved successfully!', 'success');
            closeSettingsModal();
        }
    } catch (e) {
        showToast('Error saving settings: ' + e.message, 'error');
    }
}

async function testSmtpConnection() {
    const smtpHost = document.getElementById('settingsSmtpHost').value.trim();
    const smtpPort = parseInt(document.getElementById('settingsSmtpPort').value, 10) || 587;
    const smtpUser = document.getElementById('settingsSmtpUser').value.trim();
    const smtpPass = document.getElementById('settingsSmtpPass').value.trim();

    if (!smtpHost || !smtpUser) {
        showToast('Please enter SMTP Host and Username first', 'error');
        return;
    }

    showToast('Testing SMTP connection...', 'info');

    try {
        const res = await fetch('/api/settings/test-smtp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ smtp_host: smtpHost, smtp_port: smtpPort, smtp_user: smtpUser, smtp_pass: smtpPass })
        });
        const data = await res.json();
        if (data.success) {
            showToast('✅ ' + data.message, 'success');
        } else {
            showToast('❌ ' + data.message, 'error');
        }
    } catch (e) {
        showToast('SMTP Test Error: ' + e.message, 'error');
    }
}

async function clearCache() {
    try {
        const res = await fetch('/api/cache/clear', { method: 'POST' });
        const data = await res.json();
        showToast(data.message || 'Cache cleared', 'info');
    } catch (e) {
        showToast('Error clearing cache', 'error');
    }
}

// ============================================================================
// Utilities & Toast Notifications
// ============================================================================

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '❌';

    toast.innerHTML = `<span>${icon}</span> <span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#039;');
}

function downloadBlob(content, filename, contentType) {
    const blob = new Blob([content], { type: contentType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
