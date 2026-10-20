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
    universeRegion: 'All',
    scanResults: [],
    hasScanned: false,
    activeScanInterval: null,
    currentView: 'screener',    // 'screener' | 'watchlist' | 'backtest' | 'chart'
    currentFilter: 'all',        // 'all' | 'buy' | 'sell'
    chartSymbol: null,
    chartExchange: null,
    theme: 'light',
    currentUser: null,
    authToken: localStorage.getItem('auth_token') || '',
    backtestResult: null,
    activeBacktestInterval: null,
    pendingAuthEmail: '',
    // Exchange Watchlist state
    currentWatchlist: 'all_nyse',
    watchlistPage: 1,
    watchlistLimit: 50,
    watchlistSearch: '',
    watchlistSort: 'symbol_asc',
    watchlistFilter: 'all',
    starredSymbols: new Set(JSON.parse(localStorage.getItem('palgoryx_starred_symbols') || '[]')),
    watchlistsOverview: [],
    watchlistData: null,
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
    loadInitialScanResults();
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

    // Back to previous view from chart view
    document.getElementById('backToResults').addEventListener('click', () => {
        switchMainView(AppState.previousView || 'screener');
    });

    // Sync sidebar timeframe select with chart
    document.getElementById('timeframeSelect')?.addEventListener('change', (e) => {
        const val = e.target.value;
        const chartTf = document.getElementById('chartTimeframeSelect');
        if (chartTf && chartTf.value !== val) chartTf.value = val;
        if (typeof changeChartTimeframe === 'function' && AppState.currentView === 'chart') {
            changeChartTimeframe(val);
        }
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

    // Left Panel Expand / Minimize Single Option (on the new rail bar column)
    const railToggle = document.getElementById('railToggleBtn');
    if (railToggle) {
        railToggle.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleLeftPanel();
        });
    }

    // Keyboard shortcut Ctrl+B or Cmd+B to toggle left panel
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) {
            if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
            e.preventDefault();
            toggleLeftPanel();
        }
    });

    // Initialize panel state from localStorage
    initLeftPanel();

    // Paste event listener for strategy chat (paste chart screenshots directly with Ctrl+V)
    document.addEventListener('paste', handlePasteOnChat);

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
// Left Sidebar Panel Expand / Minimize Management (Single Option on Left Rail)
// ============================================================================

let lastPanelToggleTime = 0;

function initLeftPanel() {
    const isCollapsed = localStorage.getItem('palgory_panel_collapsed') === 'true';
    if (isCollapsed) {
        toggleLeftPanel(true);
    }
}

function toggleLeftPanel(forceState) {
    // Debounce guard to prevent rapid double-toggling
    const now = Date.now();
    if (forceState === undefined && now - lastPanelToggleTime < 220) {
        return;
    }
    lastPanelToggleTime = now;

    const mainContent = document.getElementById('mainContent');
    const panelLeft = document.getElementById('panelLeft');
    const railToggle = document.getElementById('railToggleBtn');
    const railArrow = document.getElementById('railToggleArrow');
    const railTooltip = document.getElementById('railToggleTooltip');

    if (!mainContent || !panelLeft) return;

    const shouldCollapse = forceState !== undefined ? forceState : !mainContent.classList.contains('sidebar-collapsed');

    if (shouldCollapse) {
        mainContent.classList.add('sidebar-collapsed');
        if (railToggle) {
            railToggle.classList.add('minimized');
            railToggle.setAttribute('title', 'Expand Strategy Panel (Ctrl+B)');
        }
        if (railArrow) {
            railArrow.setAttribute('d', 'M11 9l4 3-4 3');
        }
        if (railTooltip) {
            railTooltip.textContent = 'Expand (Ctrl+B)';
        }
        localStorage.setItem('palgory_panel_collapsed', 'true');
    } else {
        mainContent.classList.remove('sidebar-collapsed');
        if (railToggle) {
            railToggle.classList.remove('minimized');
            railToggle.setAttribute('title', 'Minimize Strategy Panel (Ctrl+B)');
        }
        if (railArrow) {
            railArrow.setAttribute('d', 'M16 15l-3-3 3-3');
        }
        if (railTooltip) {
            railTooltip.textContent = 'Minimize (Ctrl+B)';
        }
        localStorage.setItem('palgory_panel_collapsed', 'false');
    }

    // Trigger chart and table recalculation on resize
    setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
    }, 240);
}

// Quick navigation from rail icons: expand if collapsed and focus section
function handleRailClick(targetId) {
    const mainContent = document.getElementById('mainContent');
    if (mainContent && mainContent.classList.contains('sidebar-collapsed')) {
        toggleLeftPanel(false);
    }

    // Update active state on rail items
    document.querySelectorAll('.rail-item-btn').forEach(b => b.classList.remove('active'));
    if (targetId === 'strategyList') {
        document.getElementById('railItemStrategies')?.classList.add('active');
    } else if (targetId === 'screenerConfigSection') {
        document.getElementById('railItemConfig')?.classList.add('active');
    } else if (targetId === 'timeframeSelect') {
        document.getElementById('railItemParams')?.classList.add('active');
    }

    const target = document.getElementById(targetId);
    if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

// ============================================================================
// Theme Management
// ============================================================================

function initTheme() {
    const saved = localStorage.getItem('theme') || 'light';
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
// View Switcher (Screener vs Watchlist vs Backtest vs Chart)
// ============================================================================

function switchMainView(viewName) {
    AppState.currentView = viewName;

    const tabScreener = document.getElementById('tabScreener');
    const tabWatchlist = document.getElementById('tabWatchlist');
    const tabBacktest = document.getElementById('tabBacktest');

    const resultsView = document.getElementById('resultsView');
    const backtestView = document.getElementById('backtestView');
    const chartView = document.getElementById('chartView');
    const watchlistView = document.getElementById('watchlistView');

    const screenerSidebar = document.getElementById('screenerConfigSection');
    const backtestSidebar = document.getElementById('backtestSidebarSection');
    const watchlistSidebar = document.getElementById('watchlistSidebarSection');

    // Reset tabs
    if (tabScreener) tabScreener.classList.toggle('active', viewName === 'screener');
    if (tabWatchlist) tabWatchlist.classList.toggle('active', viewName === 'watchlist');
    if (tabBacktest) tabBacktest.classList.toggle('active', viewName === 'backtest');

    if (viewName === 'screener') {
        if (resultsView) resultsView.classList.remove('hidden');
        if (backtestView) backtestView.classList.add('hidden');
        if (chartView) chartView.classList.add('hidden');
        if (watchlistView) watchlistView.classList.add('hidden');

        if (screenerSidebar) screenerSidebar.classList.remove('hidden');
        if (backtestSidebar) backtestSidebar.classList.add('hidden');
        if (watchlistSidebar) watchlistSidebar.classList.add('hidden');
    } else if (viewName === 'watchlist') {
        if (resultsView) resultsView.classList.add('hidden');
        if (backtestView) backtestView.classList.add('hidden');
        if (chartView) chartView.classList.add('hidden');
        if (watchlistView) watchlistView.classList.remove('hidden');

        if (screenerSidebar) screenerSidebar.classList.add('hidden');
        if (backtestSidebar) backtestSidebar.classList.add('hidden');
        if (watchlistSidebar) watchlistSidebar.classList.remove('hidden');

        initWatchlistView();
    } else if (viewName === 'backtest') {
        if (resultsView) resultsView.classList.add('hidden');
        if (backtestView) backtestView.classList.remove('hidden');
        if (chartView) chartView.classList.add('hidden');
        if (watchlistView) watchlistView.classList.add('hidden');

        if (screenerSidebar) screenerSidebar.classList.add('hidden');
        if (backtestSidebar) backtestSidebar.classList.remove('hidden');
        if (watchlistSidebar) watchlistSidebar.classList.add('hidden');
    } else if (viewName === 'chart') {
        if (resultsView) resultsView.classList.add('hidden');
        if (backtestView) backtestView.classList.add('hidden');
        if (chartView) chartView.classList.remove('hidden');
        if (watchlistView) watchlistView.classList.add('hidden');
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
        renderUniverseCategoryTabs();
        renderUniverseMultiSelect();
    } catch (err) {
        console.error('Failed to load universes:', err);
    }
}

function renderUniverseCategoryTabs() {
    const tabsContainer = document.getElementById('universeCategoryTabs');
    if (!tabsContainer) return;

    tabsContainer.innerHTML = '';

    const categories = [
        { id: 'All', label: '🌐 All' },
        { id: 'US', label: '🇺🇸 US' },
        { id: 'China / HK', label: '🇨🇳 China / HK' },
        { id: 'Japan', label: '🇯🇵 Japan' },
        { id: 'UK', label: '🇬🇧 UK' },
        { id: 'Canada', label: '🇨🇦 Canada' },
        { id: 'Germany', label: '🇩🇪 Germany' },
        { id: 'Australia', label: '🇦🇺 Australia' },
        { id: 'India', label: '🇮🇳 India' },
        { id: 'Commodities', label: '⚡ Commodities' },
    ];

    categories.forEach(cat => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `universe-cat-btn ${AppState.universeRegion === cat.id ? 'active' : ''}`;
        btn.textContent = cat.label;
        btn.addEventListener('click', () => {
            AppState.universeRegion = cat.id;
            renderUniverseCategoryTabs();
            renderUniverseMultiSelect();
        });
        tabsContainer.appendChild(btn);
    });
}

function renderUniverseMultiSelect() {
    const wrapper = document.getElementById('universeMultiWrapper');
    if (!wrapper) return;

    wrapper.innerHTML = '';

    const badgeClassMap = {
        'BSE': 'badge-danger',
        'MCX': 'badge-warning',
        'NCDEX': 'badge-info',
        'COMMODITY': 'badge-warning',
        'NYSE': 'badge-nyse',
        'NASDAQ': 'badge-nasdaq',
        'US': 'badge-us',
        'SSE': 'badge-sse',
        'SZSE': 'badge-szse',
        'BSE_BJ': 'badge-bj',
        'HKSE': 'badge-hkse',
        'TSE': 'badge-tse',
        'LSE': 'badge-lse',
        'TSX': 'badge-tsx',
        'FSE': 'badge-fse',
        'ASX': 'badge-asx'
    };

    const filteredUniverses = AppState.universes.filter(u => {
        if (AppState.universeRegion === 'All') return true;
        if (u.key === 'custom') return true;
        return u.category === AppState.universeRegion;
    });

    filteredUniverses.forEach(u => {
        const item = document.createElement('div');
        const isSelected = AppState.selectedUniverses.has(u.key);
        item.className = `universe-item ${isSelected ? 'selected' : ''}`;
        item.dataset.key = u.key;

        const countLabel = u.count > 0 ? ` (${u.count.toLocaleString()})` : '';
        const badgeClass = badgeClassMap[u.exchange] || 'badge-primary';

        item.innerHTML = `
            <div style="display:flex; align-items:center; gap:8px;">
                <input type="checkbox" class="universe-checkbox" ${isSelected ? 'checked' : ''}>
                <span>${u.name}${countLabel}</span>
            </div>
            <span class="badge ${badgeClass}">${u.exchange}</span>
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
    const targetUniverses = AppState.universes.filter(u => {
        if (AppState.universeRegion === 'All') return true;
        return u.category === AppState.universeRegion;
    });

    if (selectAll) {
        targetUniverses.forEach(u => AppState.selectedUniverses.add(u.key));
    } else {
        targetUniverses.forEach(u => AppState.selectedUniverses.delete(u.key));
        if (AppState.selectedUniverses.size === 0) {
            AppState.selectedUniverses.add('nifty50');
        }
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
        const chartSelect = document.getElementById('chartTimeframeSelect');
        if (select) select.innerHTML = '';
        if (chartSelect) chartSelect.innerHTML = '';

        const groups = {};
        const groupOrder = ['Seconds', 'Minutes', 'Hours', 'Days', 'Weeks', 'Months'];
        const groupEmoji = {
            'Seconds': '⏱️ Seconds',
            'Minutes': '⏱️ Minutes',
            'Hours': '🕒 Hours',
            'Days': '📅 Daily',
            'Weeks': '📅 Weekly',
            'Months': '📆 Months'
        };

        data.timeframes.forEach(tf => {
            const grp = tf.group || 'Other';
            if (!groups[grp]) groups[grp] = [];
            groups[grp].push(tf);
        });

        const populateSelect = (targetSelect) => {
            if (!targetSelect) return;
            groupOrder.forEach(grpName => {
                if (groups[grpName] && groups[grpName].length > 0) {
                    const optgroup = document.createElement('optgroup');
                    optgroup.label = groupEmoji[grpName] || grpName;
                    groups[grpName].forEach(tf => {
                        const opt = document.createElement('option');
                        opt.value = tf.key;
                        opt.textContent = tf.label;
                        if (tf.key === '1d') opt.selected = true;
                        optgroup.appendChild(opt);
                    });
                    targetSelect.appendChild(optgroup);
                }
            });
        };

        populateSelect(select);
        populateSelect(chartSelect);
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
// Strategy Creator Studio & AI Quant Chatbot
// ============================================================================

const StrategyChatState = {
    messages: [], // Array of { role: 'user' | 'model', content: string, attachments?: [...], strategyCode?: string, strategyId?: string, strategyName?: string }
    currentAttachments: [], // Array of { name, mimeType, data, previewUrl, size }
    isSending: false
};

function switchEditorTab(tab) {
    const tabChat = document.getElementById('modalTabChat');
    const tabCode = document.getElementById('modalTabCode');
    const viewChat = document.getElementById('editorChatView');
    const viewCode = document.getElementById('editorCodeView');

    if (tab === 'chat') {
        if (tabChat) tabChat.classList.add('active');
        if (tabCode) tabCode.classList.remove('active');
        if (viewChat) viewChat.classList.remove('hidden');
        if (viewCode) viewCode.classList.add('hidden');
        initStrategyChat();
        setTimeout(() => {
            document.getElementById('chatInputText')?.focus();
        }, 50);
    } else {
        if (tabChat) tabChat.classList.remove('active');
        if (tabCode) tabCode.classList.add('active');
        if (viewChat) viewChat.classList.add('hidden');
        if (viewCode) viewCode.classList.remove('hidden');
        setTimeout(() => {
            document.getElementById('codeEditor')?.focus();
        }, 50);
    }
}

function initStrategyChat() {
    if (StrategyChatState.messages.length === 0) {
        StrategyChatState.messages.push({
            role: 'model',
            content: `👋 **Welcome to the Palgoryx Quantitative Strategy Studio!**

I am your **Chief Quantitative Strategist & Algorithmic Architect**. I will work directly with you to discuss, refine, and stress-test your trading setups so there are **zero execution flaws** in live market scanning or backtesting.

### How We Collaborate:
1. **Discuss your trading thesis**: Tell me your setup in your own words, mention your indicators (e.g. EMAs, Supertrend, RSI, MACD, Volume), or attach/paste chart screenshots (**Ctrl+V**).
2. **Eliminate Blindspots**: I will analyze your setup, point out potential lag or whipsaws in consolidation, and ask you sharp clarifying questions to lock down exact entry triggers, regime filters, and risk rules.
3. **Generate Code on Command**: I will NOT overwhelm you with code until you are completely ready. Whenever you want the production script, simply tell me: **"Generate Python code"** or **"Build the strategy"**!

What trading edge or market setup are we designing today?`,
            strategyCode: null
        });
    }
    renderStrategyChat();
}

function clearStrategyChat() {
    StrategyChatState.messages = [];
    StrategyChatState.currentAttachments = [];
    renderAttachmentTray();
    initStrategyChat();
    showToast('Strategy chat cleared', 'info');
}

function renderStrategyChat() {
    const thread = document.getElementById('strategyChatThread');
    if (!thread) return;

    thread.innerHTML = '';

    StrategyChatState.messages.forEach((msg, idx) => {
        const isUser = msg.role === 'user';
        const msgDiv = document.createElement('div');
        msgDiv.className = `chat-msg ${isUser ? 'user' : 'bot'}`;

        const headerDiv = document.createElement('div');
        headerDiv.className = 'chat-msg-header';
        headerDiv.innerHTML = isUser ? '<span>👤 Trader (You)</span>' : '<span>⚡ Palgoryx Chief Quant AI</span>';

        const bubbleDiv = document.createElement('div');
        bubbleDiv.className = 'chat-msg-bubble';

        // Render any attachments for this message
        if (msg.attachments && msg.attachments.length > 0) {
            const attContainer = document.createElement('div');
            attContainer.className = 'chat-attachment-tray';
            attContainer.style.marginBottom = '8px';

            msg.attachments.forEach(att => {
                const pill = document.createElement('div');
                pill.className = 'chat-attachment-pill';
                if (att.mimeType && att.mimeType.startsWith('image/')) {
                    pill.innerHTML = `<img src="data:${att.mimeType};base64,${att.data}" class="chat-attachment-thumb"> <span>${escapeHtml(att.name || 'Image')}</span>`;
                } else {
                    pill.innerHTML = `<span>📄</span> <span>${escapeHtml(att.name || 'File')}</span>`;
                }
                attContainer.appendChild(pill);
            });
            bubbleDiv.appendChild(attContainer);
        }

        // Format and render message content
        const textContent = msg.content || '';
        let strategyCodeBlock = msg.strategyCode || '';
        let strategyId = msg.strategyId || '';
        let strategyName = msg.strategyName || '';

        // Check if text has code block
        if (!strategyCodeBlock && textContent.includes('```python')) {
            const parts = textContent.split('```python');
            const codePart = parts[1].split('```')[0].trim();
            if (codePart.includes('def calculate_signals') || codePart.includes('def evaluate')) {
                strategyCodeBlock = codePart;
            }
        }

        // Parse text parts outside code block
        let formattedHtml = '';
        if (strategyCodeBlock && textContent.includes('```python')) {
            const beforeCode = textContent.split('```python')[0];
            const afterCode = textContent.split('```python')[1].split('```')[1] || '';
            formattedHtml = formatMarkdownChat(beforeCode);
            if (afterCode.trim()) {
                formattedHtml += '<br>' + formatMarkdownChat(afterCode);
            }
        } else {
            formattedHtml = formatMarkdownChat(textContent);
        }

        const textWrapper = document.createElement('div');
        textWrapper.innerHTML = formattedHtml;
        bubbleDiv.appendChild(textWrapper);

        // If this is the latest bot message and it's a discussion message (no code yet), render quick actionable chips
        if (!isUser && !strategyCodeBlock && idx === StrategyChatState.messages.length - 1) {
            const actionChipsDiv = document.createElement('div');
            actionChipsDiv.className = 'chat-quick-replies';
            actionChipsDiv.style.cssText = 'margin-top:10px; display:flex; gap:6px; flex-wrap:wrap; padding-top:8px; border-top:1px dashed var(--border);';
            actionChipsDiv.innerHTML = `
                <button class="btn btn-xs btn-primary" onclick="sendQuickPrompt('Looks great! Please generate the complete, verified Python strategy code now.')" title="Instruct AI to generate the full Python code immediately">
                    🚀 Ready! Generate Python Code
                </button>
                <button class="btn btn-xs btn-secondary" onclick="sendQuickPrompt('Let\'s add a 200 EMA trend filter and 1.5x ATR stop loss to eliminate whipsaws.')" title="Add trend filter and stop-loss">
                    🛡️ Add 200 EMA & ATR Stop Loss
                </button>
                <button class="btn btn-xs btn-secondary" onclick="sendQuickPrompt('This strategy is for 5-minute intraday scalping. How should we adapt the parameters?')" title="Optimize for 5m scalping">
                    ⏱️ 5m Intraday Setup
                </button>
                <button class="btn btn-xs btn-ghost" onclick="sendQuickPrompt('For exits, let\'s close positions when the opposite signal triggers, with a 2% max stop loss.')" title="Set exit on opposite signal">
                    🔄 Exit on Opposite Signal
                </button>
            `;
            bubbleDiv.appendChild(actionChipsDiv);
        }

        // Render Strategy Card if code exists
        if (strategyCodeBlock) {
            if (!strategyId) {
                const idMatch = strategyCodeBlock.match(/STRATEGY_ID\s*=\s*["']([^"']+)["']/) || strategyCodeBlock.match(/#\s*STRATEGY_ID:\s*([a-z0-9_]+)/i);
                strategyId = idMatch ? idMatch[1].trim() : 'ai_strategy_' + (idx + 1);
            }
            if (!strategyName) {
                const nameMatch = strategyCodeBlock.match(/STRATEGY_NAME\s*=\s*["']([^"']+)["']/) || strategyCodeBlock.match(/#\s*STRATEGY_NAME:\s*([^\n]+)/);
                strategyName = nameMatch ? nameMatch[1].trim() : 'AI Quant Strategy';
            }

            const card = document.createElement('div');
            card.className = 'chat-strategy-card';
            card.innerHTML = `
                <div class="chat-strategy-card-header">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span style="font-size:1.1rem;">⚡</span>
                        <strong class="chat-strategy-card-title">${escapeHtml(strategyName)}</strong>
                        <span class="mono text-xs text-muted">[ID: ${escapeHtml(strategyId)}]</span>
                    </div>
                    <span class="ai-badge" style="font-size:0.65rem;">Verified Python</span>
                </div>
                <pre style="max-height:220px; overflow-y:auto;"><code>${escapeHtml(strategyCodeBlock)}</code></pre>
                <div class="chat-strategy-actions">
                    <button class="btn btn-sm btn-primary" id="btnApplyStrat_${idx}">
                        🚀 Add Strategy to Scanner & Run
                    </button>
                    <button class="btn btn-sm btn-secondary" id="btnEditStrat_${idx}">
                        📝 Edit in Studio
                    </button>
                    <button class="btn btn-sm btn-ghost" id="btnCopyStrat_${idx}">
                        📋 Copy Code
                    </button>
                </div>
            `;

            bubbleDiv.appendChild(card);

            // Bind click listeners safely
            setTimeout(() => {
                document.getElementById(`btnApplyStrat_${idx}`)?.addEventListener('click', () => {
                    applyAndSaveStrategyFromChat(strategyId, strategyCodeBlock, strategyName);
                });
                document.getElementById(`btnEditStrat_${idx}`)?.addEventListener('click', () => {
                    loadStrategyIntoCodeEditor(strategyId, strategyCodeBlock);
                });
                document.getElementById(`btnCopyStrat_${idx}`)?.addEventListener('click', () => {
                    copyStrategyCodeToClipboard(strategyCodeBlock);
                });
            }, 0);
        }

        msgDiv.appendChild(headerDiv);
        msgDiv.appendChild(bubbleDiv);
        thread.appendChild(msgDiv);
    });

    thread.scrollTop = thread.scrollHeight;
}

function formatMarkdownChat(text) {
    if (!text) return '';
    let html = escapeHtml(text);
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    html = html.replace(/^### (.*$)/gm, '<h4 style="margin:6px 0 2px; font-weight:800;">$1</h4>');
    html = html.replace(/^## (.*$)/gm, '<h3 style="margin:8px 0 4px; font-weight:800;">$1</h3>');
    html = html.replace(/^\s*[-•]\s+(.*)$/gm, '<li>$1</li>');
    html = html.replace(/\n/g, '<br>');
    return html;
}

function handleChatInputKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendStrategyChatMessage();
    }
}

function sendQuickPrompt(promptText) {
    const input = document.getElementById('chatInputText');
    if (input) {
        input.value = promptText;
        sendStrategyChatMessage();
    }
}

function handleChatFilesSelected(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    files.forEach(file => {
        const reader = new FileReader();
        reader.onload = (loadEvt) => {
            const base64Data = loadEvt.target.result.split(',')[1];
            StrategyChatState.currentAttachments.push({
                name: file.name,
                mimeType: file.type || 'application/octet-stream',
                data: base64Data,
                size: (file.size / 1024).toFixed(1) + ' KB'
            });
            renderAttachmentTray();
        };
        reader.readAsDataURL(file);
    });

    e.target.value = '';
}

function handlePasteOnChat(e) {
    const modal = document.getElementById('editorModal');
    if (!modal || !modal.classList.contains('active')) return;
    const chatTab = document.getElementById('modalTabChat');
    if (!chatTab || !chatTab.classList.contains('active')) return;

    const items = (e.clipboardData || e.originalEvent?.clipboardData)?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
            const blob = items[i].getAsFile();
            const reader = new FileReader();
            reader.onload = (loadEvt) => {
                const base64Data = loadEvt.target.result.split(',')[1];
                StrategyChatState.currentAttachments.push({
                    name: `Pasted_Chart_${new Date().toISOString().slice(11, 19).replace(/:/g, '-')}.png`,
                    mimeType: blob.type || 'image/png',
                    data: base64Data,
                    size: (blob.size / 1024).toFixed(1) + ' KB'
                });
                renderAttachmentTray();
                showToast('📸 Chart screenshot attached from clipboard!', 'info');
            };
            reader.readAsDataURL(blob);
            break;
        }
    }
}

function renderAttachmentTray() {
    const tray = document.getElementById('chatAttachmentTray');
    if (!tray) return;

    if (StrategyChatState.currentAttachments.length === 0) {
        tray.classList.add('hidden');
        tray.innerHTML = '';
        return;
    }

    tray.classList.remove('hidden');
    tray.innerHTML = '';

    StrategyChatState.currentAttachments.forEach((att, idx) => {
        const pill = document.createElement('div');
        pill.className = 'chat-attachment-pill';

        if (att.mimeType && att.mimeType.startsWith('image/')) {
            pill.innerHTML = `
                <img src="data:${att.mimeType};base64,${att.data}" class="chat-attachment-thumb">
                <span>${escapeHtml(att.name)}</span>
                <span class="text-xs text-muted">(${att.size})</span>
                <button class="chat-attachment-remove" onclick="removeAttachment(${idx})">✕</button>
            `;
        } else {
            pill.innerHTML = `
                <span>📄</span>
                <span>${escapeHtml(att.name)}</span>
                <span class="text-xs text-muted">(${att.size})</span>
                <button class="chat-attachment-remove" onclick="removeAttachment(${idx})">✕</button>
            `;
        }
        tray.appendChild(pill);
    });
}

function removeAttachment(idx) {
    StrategyChatState.currentAttachments.splice(idx, 1);
    renderAttachmentTray();
}

async function sendStrategyChatMessage() {
    if (StrategyChatState.isSending) return;

    const input = document.getElementById('chatInputText');
    const sendBtn = document.getElementById('chatSendBtn');
    const text = input ? input.value.trim() : '';
    const attachments = [...StrategyChatState.currentAttachments];

    if (!text && attachments.length === 0) {
        showToast('Please type a message or attach a picture/file', 'warning');
        return;
    }

    // Add user message to state
    StrategyChatState.messages.push({
        role: 'user',
        content: text,
        attachments: attachments
    });

    // Clear input & attachments
    if (input) input.value = '';
    StrategyChatState.currentAttachments = [];
    renderAttachmentTray();
    renderStrategyChat();

    // Set sending state
    StrategyChatState.isSending = true;
    if (sendBtn) {
        sendBtn.disabled = true;
        sendBtn.innerHTML = '<div class="spinner"></div> Thinking...';
    }

    try {
        const payloadMessages = StrategyChatState.messages.map(m => ({
            role: m.role,
            content: m.content,
            attachments: m.attachments?.map(a => ({
                name: a.name,
                mimeType: a.mimeType,
                data: a.data
            }))
        }));

        const res = await fetch('/api/ai/strategy-chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: payloadMessages })
        });

        const data = await res.json();

        if (data.success && data.reply) {
            StrategyChatState.messages.push({
                role: 'model',
                content: data.reply,
                strategyCode: data.strategyCode || null,
                strategyId: data.strategyId || null,
                strategyName: data.strategyName || null
            });
            renderStrategyChat();

            if (data.strategyCode) {
                showToast('💡 New strategy generated! Click "Add Strategy to Scanner & Run" to execute.', 'success');
            }
        } else {
            StrategyChatState.messages.push({
                role: 'model',
                content: `⚠️ Error from Quant AI: ${data.error || 'Failed to generate response.'}\n\nPlease try rephrasing or sending a simpler prompt.`
            });
            renderStrategyChat();
        }
    } catch (err) {
        StrategyChatState.messages.push({
            role: 'model',
            content: `⚠️ Network error: ${err.message}`
        });
        renderStrategyChat();
    } finally {
        StrategyChatState.isSending = false;
        if (sendBtn) {
            sendBtn.disabled = false;
            sendBtn.innerHTML = 'Send 🚀';
        }
    }
}

async function applyAndSaveStrategyFromChat(strategyId, code, name) {
    if (!code) {
        showToast('No Python code to add', 'error');
        return;
    }
    const cleanId = (strategyId || 'custom_strategy_' + Date.now().toString(36).slice(-4))
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_]/g, '');

    try {
        const token = localStorage.getItem('auth_token') || '';
        const res = await fetch('/api/strategy/save', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ id: cleanId, code })
        });
        const data = await res.json();
        if (data.success) {
            AppState.selectedStrategies.add(cleanId);
            await loadStrategies();
            closeEditorModal();
            showToast(`🚀 Strategy "${name || cleanId}" saved & activated for scanning!`, 'success');
            // Switch to screener so user can run the scan right away
            switchMainView('screener');
        } else {
            showToast(`Failed to save strategy: ${data.error || 'Unknown error'}`, 'error');
        }
    } catch (err) {
        showToast('Error saving strategy: ' + err.message, 'error');
    }
}

function loadStrategyIntoCodeEditor(strategyId, code) {
    switchEditorTab('code');
    const idInput = document.getElementById('editorStrategyId');
    const codeArea = document.getElementById('codeEditor');
    if (idInput) idInput.value = strategyId || '';
    if (codeArea) codeArea.value = code || '';
    showToast('Loaded strategy code into Python editor', 'info');
}

function copyStrategyCodeToClipboard(code) {
    if (!code) return;
    navigator.clipboard.writeText(code).then(() => {
        showToast('📋 Strategy Python code copied to clipboard!', 'success');
    }).catch(() => {
        showToast('Failed to copy to clipboard', 'error');
    });
}

function openEditorModal(strategyId = null) {
    const modal = document.getElementById('editorModal');
    const title = document.getElementById('editorModalTitle');
    const idInput = document.getElementById('editorStrategyId');
    const codeArea = document.getElementById('codeEditor');
    const promptInput = document.getElementById('aiPromptInput');

    if (promptInput) promptInput.value = '';

    if (strategyId) {
        title.textContent = 'Edit Strategy';
        idInput.value = strategyId;
        idInput.disabled = true;

        switchEditorTab('code');

        fetch(`/api/strategy/${strategyId}/code`)
            .then(res => res.json())
            .then(data => {
                codeArea.value = data.code || '';
            })
            .catch(() => showToast('Failed to load code', 'error'));
    } else {
        title.textContent = '⚡ Quant Strategy Creator';
        idInput.value = '';
        idInput.disabled = false;

        // Default to Python Code Editor as requested
        switchEditorTab('code');

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
        let data;
        try {
            data = await res.json();
        } catch (_) {
            throw new Error(`Server returned an unexpected response (status ${res.status}). Check server logs.`);
        }

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
            showToast('Strategy generated successfully!', 'success');
        } else {
            showToast(`Strategy generation error: ${data.error || 'Unknown'}`, 'error');
        }
    } catch (err) {
        showToast('Generation failed: ' + err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '⚡ Generate Python Code';
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
            AppState.activeScanInterval = setInterval(pollScanProgress, 300);
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
        stats.textContent = `${(progress.scanned || 0).toLocaleString()} / ${(progress.total || 0).toLocaleString()} (${progress.signals_found} signals)`;

        if (progress.done || progress.cancelled) {
            clearInterval(AppState.activeScanInterval);
            AppState.activeScanInterval = null;
            resetScanUI();

            // Fetch final results
            const resultsRes = await fetch('/api/scan/results');
            const resultsData = await resultsRes.json();
            AppState.scanResults = resultsData.results || [];
            AppState.hasScanned = true;
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
    scanBtn.textContent = 'Execute Scan 🚀';

    const progressWrapper = document.getElementById('scanProgressWrapper');
    progressWrapper.classList.remove('active');
}

async function loadInitialScanResults() {
    try {
        const resultsRes = await fetch('/api/scan/results');
        const resultsData = await resultsRes.json();
        if (resultsData && Array.isArray(resultsData.results) && resultsData.results.length > 0) {
            AppState.scanResults = resultsData.results;
            renderResults();
        }
    } catch (err) {
        console.error('Error loading initial scan results:', err);
    }
}

// ============================================================================
// Screener Results Table Rendering
// ============================================================================

function getCurrencySymbol(exchange) {
    switch (exchange) {
        case 'NYSE':
        case 'NASDAQ':
        case 'US':
            return '$';
        case 'SSE':
        case 'SZSE':
        case 'BSE_BJ':
            return '¥';
        case 'HKSE':
            return 'HK$';
        case 'TSE':
            return '¥';
        case 'LSE':
            return '£';
        case 'TSX':
            return 'CA$';
        case 'FSE':
            return '€';
        case 'ASX':
            return 'A$';
        default:
            return '₹';
    }
}

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

    // Update Variation 23 KPI summary strip
    const activeSignalsEl = document.getElementById('kpiActiveSignals');
    const sentimentCard = document.getElementById('kpiSentimentCard');
    const sentimentValue = document.getElementById('kpiSentimentValue');
    const sentimentDesc = document.getElementById('kpiSentimentDesc');
    const scopeVal = document.getElementById('kpiScopeValue');

    if (activeSignalsEl) activeSignalsEl.textContent = filtered.length;
    if (scopeVal) {
        const uCount = AppState.selectedUniverses.size;
        scopeVal.textContent = uCount > 1 ? `${uCount} UNIV` : (Array.from(AppState.selectedUniverses)[0] || 'NSE/BSE').toUpperCase();
    }

    if (sentimentValue && sentimentCard) {
        if (filtered.length > 0) {
            const buyCount = filtered.filter(r => r.signal === 'BUY').length;
            const sellCount = filtered.filter(r => r.signal === 'SELL').length;
            if (buyCount > sellCount) {
                sentimentValue.textContent = 'BULL';
                sentimentDesc.textContent = `${Math.round((buyCount / filtered.length) * 100)}% Net-positive pressure`;
                sentimentCard.style.background = 'var(--accent)';
                sentimentCard.style.color = '#0A0A0A';
            } else if (sellCount > buyCount) {
                sentimentValue.textContent = 'BEAR';
                sentimentDesc.textContent = `${Math.round((sellCount / filtered.length) * 100)}% Net-negative pressure`;
                sentimentCard.style.background = 'var(--danger)';
                sentimentCard.style.color = '#FFFFFF';
            } else {
                sentimentValue.textContent = 'NEUT';
                sentimentDesc.textContent = 'Balanced buy & sell signals';
                sentimentCard.style.background = 'var(--bg)';
                sentimentCard.style.color = 'var(--ink)';
            }
        } else {
            sentimentValue.textContent = 'WAIT';
            sentimentDesc.textContent = 'Awaiting market scan';
            sentimentCard.style.background = 'var(--accent)';
            sentimentCard.style.color = '#0A0A0A';
        }
    }

    if (filtered.length === 0) {
        if (!AppState.hasScanned && AppState.scanResults.length === 0) {
            countEl.textContent = 'Select strategies and universes to scan';
            tbody.innerHTML = `
                <tr>
                    <td colspan="7">
                        <div class="empty-state">
                            <div class="empty-state-icon">📊</div>
                            <div class="empty-state-title">Ready to Scan with Palgoryx</div>
                            <div class="empty-state-desc">
                                Select one or more quantitative strategies, choose market universes (NSE, BSE, MCX & NCDEX Commodities), and click
                                <strong>Execute Scan 🚀</strong> to trigger Palgoryx algorithmic screening.
                            </div>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

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
        const logicStr = (r.details || []).map(d => d.strategy_name).join(' + ') || 'STRATEGY CONF';

        tr.innerHTML = `
            <td class="ticker-cell" style="font-weight:900; font-family:var(--font-display);">${r.symbol}</td>
            <td class="mono">${r.exchange}</td>
            <td class="mono price-cell">${getCurrencySymbol(r.exchange)}${r.price.toFixed(2)}</td>
            <td class="mono change-cell ${changeClass}">${changeSign}${r.change_pct.toFixed(2)}%</td>
            <td>
                <span class="signal-badge ${isBuy ? 'signal-buy' : 'signal-sell'}">
                    ${isBuy ? 'BUY' : 'SELL'}
                </span>
            </td>
            <td class="strategy-desc" style="max-width:240px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${escapeHtml(logicStr)}">
                ${escapeHtml(logicStr)}
            </td>
            <td>
                <button class="btn-chart-action" onclick="openChartForSymbol('${r.symbol}', '${r.exchange}')" title="Open ${r.symbol} Interactive Live Chart & Radar">
                    <span class="btn-chart-icon-wrap">
                        <svg class="candlestick-mini-svg" width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
                            <line x1="3" y1="2" x2="3" y2="14" stroke="currentColor" stroke-width="1.2"/>
                            <rect x="1.5" y="5" width="3" height="6" fill="currentColor"/>
                            <line x1="8" y1="1" x2="8" y2="15" stroke="currentColor" stroke-width="1.2"/>
                            <rect x="6.5" y="4" width="3" height="8" fill="currentColor"/>
                            <line x1="13" y1="3" x2="13" y2="13" stroke="currentColor" stroke-width="1.2"/>
                            <rect x="11.5" y="4" width="3" height="5" fill="currentColor"/>
                        </svg>
                        <span class="btn-chart-emoji">📈</span>
                    </span>
                    <span class="btn-chart-text">Chart</span>
                    <span class="btn-chart-arrow">↗</span>
                </button>
            </td>
        `;

        tr.addEventListener('click', (e) => {
            if (!e.target.closest('button')) {
                openChartForSymbol(r.symbol, r.exchange);
            }
        });

        tbody.appendChild(tr);
    });
}

function openChartForSymbol(symbol, exchange) {
    if (AppState.currentView !== 'chart') {
        AppState.previousView = AppState.currentView;
    }
    AppState.chartSymbol = symbol;
    AppState.chartExchange = exchange;

    // Ensure direct chart mode (Zero popups, zero notifications, direct loading)
    if (typeof setChartMode === 'function') {
        setChartMode('signals');
    }

    switchMainView('chart');

    const tfSelect = document.getElementById('chartTimeframeSelect') || document.getElementById('timeframeSelect');
    const interval = tfSelect ? tfSelect.value : (AppState.chartInterval || '1d');
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
    downloadBlob(csvContent, `palgoryx_signals_${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv');
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
            AppState.activeBacktestInterval = setInterval(pollBacktestProgress, 300);
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
        stats.textContent = `${(progress.completed || 0).toLocaleString()} / ${(progress.total || 0).toLocaleString()} (${progress.percentage}%)`;

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
    runBtn.textContent = 'Backtest';

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
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const points = curve.map((c, i) => `${xScale(i)},${yScale(c.equity)}`).join(' ');
    const isProfitable = curve[curve.length - 1].equity >= curve[0].equity;
    const strokeColor = isProfitable ? (isDark ? '#22C55E' : '#16834A') : (isDark ? '#EF4444' : '#D64545');
    const fillColor = isProfitable ? (isDark ? 'rgba(34, 197, 94, 0.16)' : 'rgba(22, 131, 74, 0.12)') : (isDark ? 'rgba(239, 68, 68, 0.16)' : 'rgba(214, 69, 69, 0.12)');
    const baselineColor = isDark ? 'rgba(255, 255, 255, 0.12)' : '#DCE7DE';
    const axisTextColor = isDark ? '#9DB4A7' : '#849188';

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
                  stroke="${baselineColor}" stroke-dasharray="4"/>
            <!-- Area & Line -->
            <polygon points="${areaPoints}" fill="url(#eqGradient)"/>
            <polyline fill="none" stroke="${strokeColor}" stroke-width="2.5" points="${points}" stroke-linejoin="round"/>
            <!-- Axis Labels -->
            <text x="${padding.left - 8}" y="${padding.top + 10}" fill="${axisTextColor}" font-size="11" font-family="var(--font-mono)" text-anchor="end">₹${Math.round(maxVal).toLocaleString()}</text>
            <text x="${padding.left - 8}" y="${height - padding.bottom}" fill="${axisTextColor}" font-size="11" font-family="var(--font-mono)" text-anchor="end">₹${Math.round(minVal).toLocaleString()}</text>
            <text x="${padding.left}" y="${height - 8}" fill="${axisTextColor}" font-size="11">Start</text>
            <text x="${width - padding.right}" y="${height - 8}" fill="${axisTextColor}" font-size="11" text-anchor="end">End (${curve.length} bars)</text>
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
            <td><strong style="font-family:var(--font-display); font-weight:800; font-size:0.95rem;">${t.symbol}</strong></td>
            <td><span class="signal-badge ${t.direction === 'BUY' ? 'signal-buy' : 'signal-sell'}">${t.direction}</span></td>
            <td class="mono">${t.entry_date}</td>
            <td class="mono">₹${t.entry_price.toFixed(2)}</td>
            <td class="mono">${t.exit_date}</td>
            <td class="mono">₹${t.exit_price.toFixed(2)}</td>
            <td class="mono ${isWin ? 'text-buy' : 'text-danger'}" style="font-weight:700;">${retSign}${t.return_pct.toFixed(2)}%</td>
            <td class="mono ${isWin ? 'text-buy' : 'text-danger'}" style="font-weight:700;">₹${t.pnl.toLocaleString()}</td>
            <td><span class="mono" style="font-size:0.7rem; color:var(--ink-muted);">${escapeHtml(t.exit_reason || '')}</span></td>
            <td><span class="signal-badge" style="background:var(--bg); border:1.5px solid var(--ink); padding:2px 6px;">${t.holding_bars}b</span></td>
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

    const title = `Backtest ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;

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

async function showSavedBacktests() {
    try {
        const token = localStorage.getItem('auth_token') || '';
        const res = await fetch('/api/backtest/saved', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        const records = data.backtests || [];
        if (records.length > 0) {
            const latestId = records[0].id;
            const detailRes = await fetch(`/api/backtest/saved/${latestId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const detail = await detailRes.json();
            if (detail && detail.metrics) {
                AppState.backtestResult = detail;
                renderBacktestResults(detail);
                showToast(`Loaded saved backtest: ${detail.title}`, 'info');
            }
        } else {
            showToast('No saved backtests yet. Run a simulation and click Save to Cloud.', 'info');
        }
    } catch (err) {
        console.error('Failed to load saved backtests:', err);
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
        downloadBlob(JSON.stringify(data, null, 2), `palgory_cloud_backup_${new Date().toISOString().slice(0, 10)}.json`, 'application/json');
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
    const smtpHost = document.getElementById('settingsSmtpHost').value.trim();
    const smtpPort = parseInt(document.getElementById('settingsSmtpPort').value, 10) || 587;
    const smtpUser = document.getElementById('settingsSmtpUser').value.trim();
    const smtpPass = document.getElementById('settingsSmtpPass').value.trim();

    const payload = {
        smtp_host: smtpHost,
        smtp_port: smtpPort,
        smtp_user: smtpUser
    };
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

// ============================================================================
// Exchange Watchlists Module
// ============================================================================

let watchlistInitialized = false;

async function initWatchlistView() {
    if (!watchlistInitialized) {
        watchlistInitialized = true;
        await loadWatchlistsOverview();
    }
    await loadCurrentWatchlist();
}

async function loadWatchlistsOverview() {
    try {
        const res = await fetch('/api/watchlists/overview');
        const data = await res.json();
        AppState.watchlistsOverview = data.watchlists || [];
        renderWatchlistSidebar(AppState.watchlistsOverview);
    } catch (err) {
        console.error('Failed to load watchlists overview:', err);
    }
}

function renderWatchlistSidebar(watchlists) {
    const container = document.getElementById('watchlistNavList');
    if (!container) return;
    container.innerHTML = '';

    // Group watchlists according to requested order:
    // #US, #China, #Japan, #UK, #Canada, #Germany, #Australia, #India, Commodities, Custom
    const categoryOrder = [
        { key: 'US', title: '#US - United States' },
        { key: 'China / HK', title: '#China & Hong Kong' },
        { key: 'Japan', title: '#Japan' },
        { key: 'UK', title: '#UK - United Kingdom' },
        { key: 'Canada', title: '#Canada' },
        { key: 'Germany', title: '#Germany' },
        { key: 'Australia', title: '#Australia' },
        { key: 'India', title: '#India - NSE & BSE' },
        { key: 'Commodities', title: '#Commodities - MCX & NCDEX' },
        { key: 'Custom', title: '⭐ Custom & Starred' },
    ];

    categoryOrder.forEach(cat => {
        const matching = watchlists.filter(w => w.category === cat.key);
        if (matching.length === 0) return;

        const catHeader = document.createElement('div');
        catHeader.className = 'watchlist-nav-category';
        catHeader.textContent = cat.title;
        container.appendChild(catHeader);

        matching.forEach(w => {
            const item = document.createElement('div');
            const isActive = AppState.currentWatchlist === w.key;
            item.className = `watchlist-nav-item ${isActive ? 'active' : ''}`;
            item.dataset.key = w.key;
            item.dataset.name = w.name;

            const badgeClass = getBadgeClassForExchange(w.exchange);

            const countDisplay = w.key === 'custom'
                ? AppState.starredSymbols.size
                : w.count.toLocaleString();

            item.innerHTML = `
                <div style="display:flex; align-items:center; gap:6px; min-width:0; overflow:hidden;">
                    <span>${w.flag}</span>
                    <span style="font-size:0.8rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${w.name}</span>
                </div>
                <div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
                    <span class="text-xs text-muted mono" style="font-weight:700;">${countDisplay}</span>
                    <span class="badge ${badgeClass}" style="font-size:0.6rem; padding:1px 4px;">${w.exchange}</span>
                </div>
            `;

            item.addEventListener('click', () => {
                selectWatchlist(w.key);
            });

            container.appendChild(item);
        });
    });
}

function filterWatchlistSidebar(query) {
    const q = (query || '').toLowerCase().trim();
    const items = document.querySelectorAll('.watchlist-nav-item');
    items.forEach(el => {
        const name = (el.dataset.name || '').toLowerCase();
        const key = (el.dataset.key || '').toLowerCase();
        const matches = !q || name.includes(q) || key.includes(q);
        el.style.display = matches ? 'flex' : 'none';
    });
}

function selectWatchlist(universeKey) {
    AppState.currentWatchlist = universeKey;
    AppState.watchlistPage = 1;

    // Update active class in sidebar
    document.querySelectorAll('.watchlist-nav-item').forEach(el => {
        el.classList.toggle('active', el.dataset.key === universeKey);
    });

    loadCurrentWatchlist();
}

let wlSearchDebounceTimer = null;
function onWatchlistSearchInput(val) {
    clearTimeout(wlSearchDebounceTimer);
    wlSearchDebounceTimer = setTimeout(() => {
        AppState.watchlistSearch = val.trim();
        AppState.watchlistPage = 1;
        loadCurrentWatchlist();
    }, 250);
}

function setWatchlistFilter(filterType) {
    AppState.watchlistFilter = filterType;
    AppState.watchlistPage = 1;

    ['wlFilterAll', 'wlFilterGainers', 'wlFilterLosers', 'wlFilterStarred'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.classList.remove('active');
    });

    const activeMap = {
        all: 'wlFilterAll',
        gainers: 'wlFilterGainers',
        losers: 'wlFilterLosers',
        starred: 'wlFilterStarred'
    };
    const activeBtn = document.getElementById(activeMap[filterType]);
    if (activeBtn) activeBtn.classList.add('active');

    loadCurrentWatchlist();
}

function onWatchlistSortChange(val) {
    AppState.watchlistSort = val;
    AppState.watchlistPage = 1;
    loadCurrentWatchlist();
}

function onWatchlistLimitChange(val) {
    AppState.watchlistLimit = parseInt(val, 10) || 50;
    AppState.watchlistPage = 1;
    loadCurrentWatchlist();
}

function changeWatchlistPage(dir) {
    const totalPages = AppState.watchlistData ? AppState.watchlistData.totalPages : 1;
    if (dir === 'prev') {
        if (AppState.watchlistPage > 1) AppState.watchlistPage--;
    } else if (dir === 'next') {
        if (AppState.watchlistPage < totalPages) AppState.watchlistPage++;
    } else if (dir === 'last') {
        AppState.watchlistPage = totalPages;
    } else if (typeof dir === 'number') {
        AppState.watchlistPage = Math.max(1, Math.min(totalPages, dir));
    }
    loadCurrentWatchlist();
}

async function loadCurrentWatchlist() {
    const tbody = document.getElementById('watchlistTableBody');
    if (!tbody) return;

    const starredList = Array.from(AppState.starredSymbols).join(',');

    // Show loading state
    tbody.innerHTML = `
        <tr>
            <td colspan="9" style="text-align:center; padding:30px;">
                <div class="spinner" style="margin:0 auto 10px;"></div>
                Loading exchange scrips...
            </td>
        </tr>
    `;

    try {
        const params = new URLSearchParams({
            page: String(AppState.watchlistPage),
            limit: String(AppState.watchlistLimit),
            search: AppState.watchlistSearch,
            sort: AppState.watchlistSort,
            filter: AppState.watchlistFilter,
            starred: starredList,
        });

        if (AppState.currentWatchlist === 'custom') {
            params.set('customTickers', starredList);
        }

        const res = await fetch(`/api/watchlist/${AppState.currentWatchlist}?${params.toString()}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        AppState.watchlistData = data;

        renderWatchlistHeaderAndKPIs(data);
        renderWatchlistTable(data);
        renderWatchlistPagination(data);
    } catch (err) {
        console.error('Failed to load watchlist:', err);
        tbody.innerHTML = `
            <tr>
                <td colspan="9" style="text-align:center; padding:30px; color:var(--danger);">
                    ⚠️ Failed to load exchange scrips: ${err.message}
                </td>
            </tr>
        `;
    }
}

function renderWatchlistHeaderAndKPIs(data) {
    const titleEl = document.getElementById('wlTitle');
    const badgeEl = document.getElementById('wlExchangeBadge');
    const catBadgeEl = document.getElementById('wlCategoryBadge');
    const subtitleEl = document.getElementById('wlSubtitle');

    if (titleEl) titleEl.textContent = `${data.meta?.flag || '📈'} ${data.name}`;
    if (badgeEl) {
        badgeEl.textContent = data.exchange;
        badgeEl.className = `badge ${getBadgeClassForExchange(data.exchange)}`;
    }
    if (catBadgeEl) catBadgeEl.textContent = `[ ${data.meta?.country || 'Global'} Equities ]`;
    if (subtitleEl) {
        subtitleEl.textContent = `${data.rawTotal.toLocaleString()} listed instruments • Currency: ${data.meta?.currency || '₹'} • ${data.meta?.description || 'Active market scanner'}`;
    }

    // KPIs
    const kpiTotal = document.getElementById('wlKpiTotal');
    const kpiBreadth = document.getElementById('wlKpiBreadth');
    const kpiTopGainer = document.getElementById('wlKpiTopGainer');
    const kpiTopLoser = document.getElementById('wlKpiTopLoser');

    if (kpiTotal) kpiTotal.textContent = data.rawTotal.toLocaleString();
    if (kpiBreadth) {
        kpiBreadth.innerHTML = `<span class="text-success">${data.gainersCount.toLocaleString()} 🟢</span> / <span class="text-danger">${data.losersCount.toLocaleString()} 🔴</span>`;
    }
    if (kpiTopGainer) {
        if (data.topGainer) {
            kpiTopGainer.innerHTML = `+${data.topGainer.changePct.toFixed(2)}% <span style="font-size:0.75rem; color:var(--ink-muted);">${data.topGainer.symbol}</span>`;
        } else {
            kpiTopGainer.textContent = '--';
        }
    }
    if (kpiTopLoser) {
        if (data.topLoser) {
            kpiTopLoser.innerHTML = `${data.topLoser.changePct.toFixed(2)}% <span style="font-size:0.75rem; color:var(--ink-muted);">${data.topLoser.symbol}</span>`;
        } else {
            kpiTopLoser.textContent = '--';
        }
    }

    // Starred count in filter button
    const starredLabel = document.getElementById('starredCountLabel');
    if (starredLabel) starredLabel.textContent = String(AppState.starredSymbols.size);
}

function renderWatchlistTable(data) {
    const tbody = document.getElementById('watchlistTableBody');
    if (!tbody) return;

    if (!data.stocks || data.stocks.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9">
                    <div class="empty-state" style="padding:40px 20px;">
                        <div class="empty-state-icon">🔍</div>
                        <div class="empty-state-title">No scrips found in ${data.name}</div>
                        <div class="empty-state-desc">
                            Try adjusting your search query, clear filters, or star stocks to build your custom watchlist.
                        </div>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = '';

    data.stocks.forEach(stock => {
        const tr = document.createElement('tr');
        const isStarred = AppState.starredSymbols.has(stock.symbol.toUpperCase());
        const isUp = stock.changePct >= 0;
        const sign = isUp ? '+' : '';
        const changeClass = isUp ? 'text-success' : 'text-danger';
        const changeBadgeBg = isUp ? 'rgba(50,205,50,0.14)' : 'rgba(255,68,68,0.14)';
        const changeBadgeBorder = isUp ? 'rgba(50,205,50,0.4)' : 'rgba(255,68,68,0.4)';
        const arrow = isUp ? '▲' : '▼';

        // Day range calculation
        const rangeSpread = Math.max(0.001, stock.high - stock.low);
        const posPct = Math.max(0, Math.min(100, ((stock.price - stock.low) / rangeSpread) * 100));

        const badgeClass = getBadgeClassForExchange(stock.exchange);

        tr.innerHTML = `
            <td style="text-align:center;">
                <button class="watchlist-star-btn ${isStarred ? 'starred' : ''}"
                        onclick="toggleStarSymbol('${stock.symbol}', '${stock.exchange}', event)"
                        title="${isStarred ? 'Remove from Starred' : 'Add to Starred'}">
                    ${isStarred ? '★' : '☆'}
                </button>
            </td>
            <td>
                <div style="display:flex; flex-direction:column;">
                    <span class="mono" style="font-weight:800; font-size:0.92rem; color:var(--ink);">${stock.symbol}</span>
                </div>
            </td>
            <td>
                <span class="badge ${badgeClass}">${stock.exchange}</span>
            </td>
            <td style="text-align:right;">
                <span class="mono" style="font-weight:700; font-size:0.92rem;">${stock.currency}${stock.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </td>
            <td style="text-align:right;">
                <span class="mono ${changeClass}" style="font-weight:700;">${sign}${stock.change.toFixed(2)}</span>
            </td>
            <td style="text-align:right;">
                <span class="mono ${changeClass}" style="display:inline-block; padding:2px 6px; background:${changeBadgeBg}; border:1px solid ${changeBadgeBorder}; font-weight:800; font-size:0.78rem;">
                    ${arrow} ${sign}${stock.changePct.toFixed(2)}%
                </span>
            </td>
            <td>
                <div class="day-range-wrapper">
                    <div class="day-range-track">
                        <div class="day-range-fill" style="left:0; width:${posPct}%;"></div>
                    </div>
                    <div class="day-range-labels">
                        <span>L: ${stock.currency}${stock.low.toFixed(1)}</span>
                        <span>H: ${stock.currency}${stock.high.toFixed(1)}</span>
                    </div>
                </div>
            </td>
            <td style="text-align:right;">
                <span class="mono text-muted text-xs">${formatVolume(stock.volume)}</span>
            </td>
            <td style="text-align:center;">
                <div style="display:flex; gap:4px; justify-content:center;">
                    <button class="btn btn-xs btn-primary" onclick="openChartForSymbol('${stock.symbol}', '${stock.exchange}')" title="Interactive Candlestick Chart">
                        📈 Chart
                    </button>
                    <button class="btn btn-xs btn-secondary" onclick="quickBacktestSymbol('${stock.symbol}', '${stock.exchange}')" title="Backtest this symbol">
                        🧪
                    </button>
                    <button class="btn btn-xs btn-ghost" onclick="quickScanSymbol('${stock.symbol}', '${stock.exchange}')" title="Scan this symbol">
                        🔍
                    </button>
                </div>
            </td>
        `;

        tbody.appendChild(tr);
    });
}

function renderWatchlistPagination(data) {
    const info = document.getElementById('wlPaginationInfo');
    const label = document.getElementById('wlCurrentPageLabel');
    const btnFirst = document.getElementById('wlPageFirst');
    const btnPrev = document.getElementById('wlPagePrev');
    const btnNext = document.getElementById('wlPageNext');
    const btnLast = document.getElementById('wlPageLast');

    const start = data.total === 0 ? 0 : (data.page - 1) * data.limit + 1;
    const end = Math.min(data.total, data.page * data.limit);

    if (info) info.textContent = `Showing ${start.toLocaleString()} - ${end.toLocaleString()} of ${data.total.toLocaleString()} scrips`;
    if (label) label.textContent = `Page ${data.page} of ${data.totalPages}`;

    if (btnFirst) btnFirst.disabled = data.page <= 1;
    if (btnPrev) btnPrev.disabled = data.page <= 1;
    if (btnNext) btnNext.disabled = data.page >= data.totalPages;
    if (btnLast) btnLast.disabled = data.page >= data.totalPages;
}

function getBadgeClassForExchange(exchange) {
    const map = {
        'NYSE': 'badge-nyse',
        'NASDAQ': 'badge-nasdaq',
        'US': 'badge-us',
        'SSE': 'badge-sse',
        'SZSE': 'badge-szse',
        'BSE_BJ': 'badge-bj',
        'HKSE': 'badge-hkse',
        'TSE': 'badge-tse',
        'LSE': 'badge-lse',
        'TSX': 'badge-tsx',
        'FSE': 'badge-fse',
        'ASX': 'badge-asx',
        'NSE': 'badge-primary',
        'BSE': 'badge-danger',
        'MCX': 'badge-warning',
        'NCDEX': 'badge-info',
        'COMMODITY': 'badge-warning',
        'MULTI': 'badge-primary'
    };
    return map[exchange] || 'badge-primary';
}

function formatVolume(vol) {
    if (!vol) return '0';
    if (vol >= 10000000) return (vol / 10000000).toFixed(2) + ' Cr';
    if (vol >= 1000000) return (vol / 1000000).toFixed(2) + 'M';
    if (vol >= 100000) return (vol / 100000).toFixed(2) + 'L';
    if (vol >= 1000) return (vol / 1000).toFixed(1) + 'K';
    return vol.toLocaleString();
}

function toggleStarSymbol(symbol, exchange, event) {
    if (event) event.stopPropagation();
    const sym = symbol.toUpperCase();
    if (AppState.starredSymbols.has(sym)) {
        AppState.starredSymbols.delete(sym);
        showToast(`Removed ${sym} from Starred Watchlist`, 'info');
    } else {
        AppState.starredSymbols.add(sym);
        showToast(`Starred ${sym} ⭐`, 'success');
    }

    localStorage.setItem('palgoryx_starred_symbols', JSON.stringify(Array.from(AppState.starredSymbols)));

    // Re-render table row stars
    document.querySelectorAll('.watchlist-star-btn').forEach(btn => {
        const row = btn.closest('tr');
        if (row && row.querySelector('.mono')) {
            const rowSym = row.querySelector('.mono').textContent.trim();
            const starred = AppState.starredSymbols.has(rowSym);
            btn.classList.toggle('starred', starred);
            btn.textContent = starred ? '★' : '☆';
        }
    });

    const starredLabel = document.getElementById('starredCountLabel');
    if (starredLabel) starredLabel.textContent = String(AppState.starredSymbols.size);

    // If currently viewing starred filter, reload
    if (AppState.watchlistFilter === 'starred' || AppState.currentWatchlist === 'custom') {
        loadCurrentWatchlist();
    }
}

function quickBacktestSymbol(symbol, exchange) {
    switchMainView('backtest');
    showToast(`Loaded ${symbol} for backtesting`, 'info');
}

function quickScanSymbol(symbol, exchange) {
    switchMainView('screener');
    AppState.selectedUniverses.clear();
    AppState.selectedUniverses.add('custom');
    const customInput = document.getElementById('customTickers');
    if (customInput) customInput.value = symbol;
    renderUniverseMultiSelect();
    startScan();
}

function scanCurrentWatchlist() {
    switchMainView('screener');
    AppState.selectedUniverses.clear();
    AppState.selectedUniverses.add(AppState.currentWatchlist);
    renderUniverseMultiSelect();
    showToast(`Selected ${AppState.currentWatchlist} for screening. Click Execute Scan!`, 'info');
}

function backtestCurrentWatchlist() {
    switchMainView('backtest');
    showToast(`Configured backtesting on ${AppState.currentWatchlist}`, 'info');
}

async function copyWatchlistTickers() {
    if (!AppState.watchlistData || !AppState.watchlistData.stocks) {
        showToast('Watchlist data not loaded', 'error');
        return;
    }

    try {
        const res = await fetch(`/api/watchlist/${AppState.currentWatchlist}/export?format=csv`);
        const text = await res.text();
        const lines = text.split('\n').slice(1).map(l => {
            const m = l.match(/"([^"]+)"/);
            return m ? m[1] : '';
        }).filter(Boolean);

        const tickerString = lines.join(', ');
        await navigator.clipboard.writeText(tickerString);
        showToast(`Copied ${lines.length} tickers to clipboard! 📋`, 'success');
    } catch (err) {
        const rendered = AppState.watchlistData.stocks.map(s => s.symbol).join(', ');
        await navigator.clipboard.writeText(rendered);
        showToast(`Copied page tickers to clipboard! 📋`, 'success');
    }
}

function toggleWlExportMenu(e) {
    if (e) e.stopPropagation();
    const menu = document.getElementById('wlExportMenu');
    if (menu) menu.classList.toggle('hidden');
}

document.addEventListener('click', (e) => {
    const menu = document.getElementById('wlExportMenu');
    if (menu && !menu.classList.contains('hidden')) {
        const btn = document.getElementById('wlExportDropdownBtn');
        if (!btn || !btn.contains(e.target)) {
            menu.classList.add('hidden');
        }
    }
});

function exportWatchlistCSV() {
    const url = `/api/watchlist/${AppState.currentWatchlist}/export?format=csv`;
    window.location.href = url;
    showToast(`Downloading ${AppState.currentWatchlist} CSV...`, 'info');
}

function exportWatchlistTradingView() {
    const url = `/api/watchlist/${AppState.currentWatchlist}/export?format=tradingview`;
    window.location.href = url;
    showToast(`Downloading ${AppState.currentWatchlist} TradingView list...`, 'info');
}
