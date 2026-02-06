/**
 * Main Application Script
 * Handles UI interactions, drag & drop, and coordinates analysis.
 */

document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const dropZone = document.getElementById('uploadZone');
    const fileInput = document.getElementById('fileInput');
    const browseBtn = document.getElementById('browseBtn');
    const analysisZone = document.getElementById('analysisZone');
    const previewImg = document.getElementById('previewImg');
    const scannerOverlay = document.getElementById('scanner');
    const analyzeBtn = document.getElementById('analyzeBtn');
    const resetBtn = document.getElementById('resetBtn');
    const resultsPanel = document.getElementById('resultsPanel');

    // Result Elements
    const signalBox = document.getElementById('signalBox');
    const signalText = document.getElementById('signalText');
    const confidenceValue = document.getElementById('confidenceValue');
    const confidenceBar = document.getElementById('confidenceBar');
    const insightsList = document.getElementById('insightsList');

    // State
    let currentFile = null;

    // --- Event Listeners ---

    // File Input
    browseBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => handleFile(e.target.files[0]));

    // Drag & Drop
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-active');
    });

    dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-active');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-active');
        if (e.dataTransfer.files.length) {
            handleFile(e.dataTransfer.files[0]);
        }
    });

    // Buttons
    analyzeBtn.addEventListener('click', startAnalysis);

    resetBtn.addEventListener('click', () => {
        location.reload(); // Simple reset for now, or we could manually reset display
    });

    // --- Functions ---

    function handleFile(file) {
        if (!file || !file.type.startsWith('image/')) {
            alert('Please upload a valid image file.');
            return;
        }

        currentFile = file;

        // Read and Display Preview
        const reader = new FileReader();
        reader.onload = (e) => {
            previewImg.src = e.target.result;
            showAnalysisZone();
        };
        reader.readAsDataURL(file);
    }

    function showAnalysisZone() {
        dropZone.classList.add('hidden');
        analysisZone.classList.remove('hidden');

        // Scroll to analysis zone
        analysisZone.scrollIntoView({ behavior: 'smooth' });
    }

    async function startAnalysis() {
        if (!currentFile) return;

        // UI State: Scanning
        analyzeBtn.disabled = true;
        analyzeBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Analyzing...';
        scannerOverlay.classList.remove('hidden');
        resultsPanel.classList.add('hidden'); // Ensure previous results are hidden

        try {
            // Call the mock "Brain"
            const result = await window.TradeBrain.analyze(currentFile);

            displayResults(result);

        } catch (error) {
            console.error(error);
            alert('Analysis failed. Please try again.');
        } finally {
            // Reset UI State
            analyzeBtn.disabled = false;
            analyzeBtn.innerHTML = '<i class="fa-solid fa-bolt"></i> Analyze Chart';
            scannerOverlay.classList.add('hidden');
        }
    }

    function displayResults(result) {
        // Show panel
        resultsPanel.classList.remove('hidden');

        // Update Signal Display
        signalText.textContent = result.signal;

        // Styling classes
        signalBox.className = 'signal-box'; // Reset
        signalBox.classList.add(result.signal.toLowerCase());

        // Update Icon based on signal
        const iconContainer = signalBox.querySelector('.signal-icon');
        if (result.signal === 'BUY') iconContainer.innerHTML = '<i class="fa-solid fa-arrow-trend-up"></i>';
        else if (result.signal === 'SELL') iconContainer.innerHTML = '<i class="fa-solid fa-arrow-trend-down"></i>';
        else iconContainer.innerHTML = '<i class="fa-solid fa-pause"></i>';

        // Update Confidence
        confidenceValue.textContent = result.confidence + '%';
        confidenceBar.style.width = result.confidence + '%';

        // Update color of confidence bar
        if (result.signal === 'SELL') confidenceBar.style.backgroundColor = 'var(--accent-red)';
        else if (result.signal === 'BUY') confidenceBar.style.backgroundColor = 'var(--accent-green)';
        else confidenceBar.style.backgroundColor = 'var(--text-muted)';

        // Update Insights
        insightsList.innerHTML = '';
        result.insights.forEach(text => {
            const li = document.createElement('li');
            li.innerHTML = `<i class="fa-solid fa-check"></i> ${text}`;
            insightsList.appendChild(li);
        });

        // Scroll to results
        resultsPanel.scrollIntoView({ behavior: 'smooth' });
    }
});
