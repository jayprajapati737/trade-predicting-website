
document.addEventListener('DOMContentLoaded', () => {
    // --- State ---
    let user = JSON.parse(localStorage.getItem('user'));

    // Auth Check
    if (!user) {
        window.location.href = 'index.html';
        return;
    }

    // --- DOM ---
    const navItems = document.querySelectorAll('.nav-item');
    const views = document.querySelectorAll('.view-section');
    const userAvatar = document.getElementById('userAvatar');
    const userName = document.getElementById('userName');

    // Sidebar User
    userName.textContent = user.name;
    userAvatar.src = user.picture;

    // --- Navigation ---
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            // Active Class
            navItems.forEach(n => n.classList.remove('active'));
            item.classList.add('active');

            // Show View
            const viewId = item.getAttribute('data-view');
            views.forEach(v => v.classList.remove('active'));
            document.getElementById(`view-${viewId}`).classList.add('active');

            if (viewId === 'journal') loadJournal();
        });
    });

    // Logout
    document.getElementById('logoutBtn').addEventListener('click', () => {
        localStorage.removeItem('user');
        window.location.href = 'index.html';
    });

    // --- Settings (API Key & Risk) ---
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    const geminiKeyInput = document.getElementById('geminiKeyInput');
    const balanceInput = document.getElementById('balanceInput');
    const riskPercentInput = document.getElementById('riskPercentInput');

    // Load existing settings
    fetch(`http://localhost:3000/api/settings/${user.id}`)
        .then(res => res.json())
        .then(data => {
            if (data.geminiKey) geminiKeyInput.value = data.geminiKey;
            if (data.riskSettings) {
                balanceInput.value = data.riskSettings.balance;
                riskPercentInput.value = data.riskSettings.riskPercent;
            }
        });

    saveSettingsBtn.addEventListener('click', () => {
        const key = geminiKeyInput.value.trim();
        const settings = {
            userId: user.id,
            geminiKey: key,
            riskSettings: {
                balance: parseFloat(balanceInput.value),
                riskPercent: parseFloat(riskPercentInput.value)
            }
        };

        fetch('http://localhost:3000/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings)
        })
            .then(res => res.json())
            .then(data => alert("Settings Saved!"))
            .catch(err => alert("Error saving settings"));
    });

    // --- Mode Selection ---
    let analysisMode = 'swing';
    const modeBtns = document.querySelectorAll('.mode-btn');
    modeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            modeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            analysisMode = btn.getAttribute('data-mode');
        });
    });

    // --- Analysis ---
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const loader = document.getElementById('loader');
    const resultCard = document.getElementById('resultCard');

    dropZone.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length) startAnalysis(e.target.files[0]);
    });

    // Drag & Drop
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.style.borderColor = 'var(--primary)'; });
    dropZone.addEventListener('dragleave', (e) => { e.preventDefault(); dropZone.style.borderColor = 'var(--glass-border)'; });
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = 'var(--glass-border)';
        if (e.dataTransfer.files.length) startAnalysis(e.dataTransfer.files[0]);
    });

    async function startAnalysis(file) {
        // UI Transition
        dropZone.classList.add('hidden');
        resultCard.classList.add('hidden');
        loader.classList.remove('hidden');

        const formData = new FormData();
        formData.append('userId', user.id);
        formData.append('mode', analysisMode);
        formData.append('image', file);

        try {
            const response = await fetch('http://localhost:3000/api/analyze', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (data.error) throw new Error(data.error);

            renderResult(data.result);

        } catch (error) {
            alert("Analysis Failed: " + error.message);
            resetAnalysis();
        } finally {
            loader.classList.add('hidden');
        }
    }

    window.resetAnalysis = () => {
        resultCard.classList.add('hidden');
        dropZone.classList.remove('hidden');
        fileInput.value = '';
    };

    function renderResult(result) {
        // Show Card
        resultCard.classList.remove('hidden');

        // Populate Data
        const badge = document.getElementById('signalBadge');
        badge.textContent = result.signal;
        badge.className = `signal-badge ${result.signal}`;

        document.getElementById('confidenceDisp').textContent = `Confidence: ${result.confidence}%`;
        document.getElementById('entryPrice').textContent = result.entry;
        document.getElementById('stopLoss').textContent = result.stopLoss;

        const targetsDiv = document.getElementById('targetsList');
        targetsDiv.innerHTML = result.targets.map(t => `<span>${t}</span>`).join('');

        // Risk Calculation
        calculateRisk(result);

        // Markdown Reasoning if array
        const reasoningHTML = Array.isArray(result.reasoning)
            ? `<ul>${result.reasoning.map(r => `<li>${r}</li>`).join('')}</ul>`
            : result.reasoning;

        document.getElementById('aiReasoning').innerHTML = reasoningHTML;
    }

    function calculateRisk(result) {
        const entry = parseFloat(result.entry.replace(/[^0-9.]/g, ''));
        const sl = parseFloat(result.stopLoss.replace(/[^0-9.]/g, ''));
        const tp = parseFloat(result.targets[0].replace(/[^0-9.]/g, ''));

        const balance = parseFloat(balanceInput.value) || 10000;
        const riskPct = parseFloat(riskPercentInput.value) || 1;

        if (isNaN(entry) || isNaN(sl)) {
            document.getElementById('rrRatio').textContent = "N/A";
            document.getElementById('posSize').textContent = "Check Prices";
            return;
        }

        // R:R Ratio
        const riskAmount = Math.abs(entry - sl);
        const rewardAmount = Math.abs(tp - entry);
        const rr = (rewardAmount / riskAmount).toFixed(2);
        document.getElementById('rrRatio').textContent = `1:${rr}`;

        // Position Size (Simple 1% Risk Model)
        const totalRiskCash = balance * (riskPct / 100);
        // Assuming Forex/0.0001 pip or standard units. For generic, we use risk/diff
        const posSize = (totalRiskCash / riskAmount).toFixed(2);
        document.getElementById('posSize').textContent = `${posSize} Units`;
    }

    // --- Journal ---
    function loadJournal() {
        const list = document.getElementById('journalList');
        list.innerHTML = '<div class="empty-state">Loading...</div>';

        fetch(`http://localhost:3000/api/history/${user.id}`)
            .then(res => res.json())
            .then(history => {
                if (history.length === 0) {
                    list.innerHTML = '<div class="empty-state">No scans yet.</div>';
                    return;
                }

                list.innerHTML = history.map(item => `
                    <div class="glass-card" style="margin-bottom: 1rem; padding: 1rem; display: flex; gap: 1rem; align-items: center;">
                        <img src="${item.imageUrl}" style="width: 80px; height: 50px; object-fit: cover; border-radius: 4px;">
                        <div>
                            <div style="font-weight: 700; color: var(--${item.result.signal === 'BUY' ? 'accent-green' : 'accent-red'})">
                                ${item.result.signal}
                            </div>
                            <small class="text-muted">${new Date(item.timestamp).toLocaleString()}</small>
                        </div>
                        <div style="margin-left: auto; font-family: monospace;">
                            TP: ${item.result.targets[0]}
                        </div>
                    </div>
                `).join('');
            });
    }

    // Expose reset for button
    window.resetAnalysis = resetAnalysis;
});
