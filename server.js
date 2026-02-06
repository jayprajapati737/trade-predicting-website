const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('.')); // Serve static files from current directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Storage Paths
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);

// Multer Setup for Image Uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage: storage });

// Helper: Read/Write JSON
const readJSON = (file) => {
    if (!fs.existsSync(file)) return [];
    try {
        const data = fs.readFileSync(file, 'utf8');
        return data ? JSON.parse(data) : [];
    } catch (e) { console.error("Error reading " + file, e); return []; }
};

const writeJSON = (file, data) => {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
};

// --- API Routes ---

// 1. Auth / User Settings
app.post('/api/auth/login', (req, res) => {
    const { email, name, picture } = req.body;
    let users = readJSON(USERS_FILE);
    let user = users.find(u => u.email === email);

    if (!user) {
        user = {
            id: Date.now().toString(),
            email,
            name,
            picture,
            apiKeys: { gemini: '' },
            joined: new Date().toISOString()
        };
        users.push(user);
        writeJSON(USERS_FILE, users);
    }

    res.json({ success: true, user });
});

app.post('/api/settings', (req, res) => {
    const { userId, geminiKey, riskSettings } = req.body;
    let users = readJSON(USERS_FILE);
    let userIndex = users.findIndex(u => u.id === userId);

    if (userIndex === -1) return res.status(404).json({ error: 'User not found' });

    if (geminiKey !== undefined) users[userIndex].apiKeys.gemini = geminiKey;
    if (riskSettings) users[userIndex].riskSettings = riskSettings;

    writeJSON(USERS_FILE, users);

    res.json({ success: true, message: 'Settings saved' });
});

app.get('/api/settings/:userId', (req, res) => {
    const users = readJSON(USERS_FILE);
    const user = users.find(u => u.id === req.params.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json({
        geminiKey: user.apiKeys.gemini || '',
        riskSettings: user.riskSettings || { balance: 10000, riskPercent: 1 }
    });
});

// 2. History
app.get('/api/history/:userId', (req, res) => {
    const history = readJSON(HISTORY_FILE);
    const userHistory = history.filter(h => h.userId === req.params.userId).reverse();
    res.json(userHistory);
});

// 3. Analyze (The Core)
app.post('/api/analyze', upload.single('image'), async (req, res) => {
    const { userId, mode } = req.body; // mode: 'scalp' or 'swing'
    const file = req.file;

    if (!file) return res.status(400).json({ error: 'No image uploaded' });

    // Get User's API Key and settings
    const users = readJSON(USERS_FILE);
    const user = users.find(u => u.id === userId);

    if (!user || !user.apiKeys.gemini) {
        return res.status(401).json({ error: 'Gemini API Key missing. Please Update Settings.' });
    }

    try {
        // Initialize Gemini
        const genAI = new GoogleGenerativeAI(user.apiKeys.gemini);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        // Prepare Image
        const imagePath = file.path;
        const imageData = fs.readFileSync(imagePath);
        const imageBase64 = imageData.toString('base64');

        const systemPrompt = `
        You are an expert professional trader and technical analyst specializing in ${mode === 'scalp' ? 'Scalp Trading (1m-5m charts, high precision)' : 'Swing Trading (4h-1D charts, trend following)'}. 
        Analyze this trading chart image deeply.
        
        Provide a structured output with the following signal plan:
        1. SIGNAL: "BUY" or "SELL" (or "WAIT" if unclear).
        2. CONFIDENCE: 0-100%.
        3. ENTRY_PRICE: Specific current price or entry zone.
        4. STOP_LOSS: A logical invalidation level.
        5. TAKE_PROFIT_1: 1st conservative target.
        6. TAKE_PROFIT_2: 2nd target.
        7. TAKE_PROFIT_3: 3rd moonbag target.
        8. REASONING: A concise list of 3-5 professional bullet points explaining support/resistance, indicators, and price action.

        Format the output purely as JSON:
        {
            "signal": "BUY",
            "confidence": 85,
            "entry": "1.2345",
            "stopLoss": "1.2000",
            "targets": ["1.2500", "1.2700", "1.3000"],
            "reasoning": ["Bullish Engulfing on Support", "RSI Divergence confirmed", "Volume spike detected"]
        }
        Do not use markdown, just raw JSON.
        `;

        const result = await model.generateContent([
            systemPrompt,
            { inlineData: { data: imageBase64, mimeType: file.mimetype } }
        ]);

        const response = await result.response;
        let text = response.text();

        // Clean up markdown and find JSON object
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("No JSON found in response");

        const analysisData = JSON.parse(jsonMatch[0]);

        // Save to History
        const newRecord = {
            id: Date.now().toString(),
            userId,
            imageUrl: `http://localhost:${PORT}/uploads/${file.filename}`, // Absolute URL for robust display
            timestamp: new Date().toISOString(),
            result: analysisData
        };

        const history = readJSON(HISTORY_FILE);
        history.push(newRecord);
        writeJSON(HISTORY_FILE, history);

        res.json(newRecord);

    } catch (error) {
        console.error("Gemini Analysis Error:", error);
        res.status(500).json({ error: 'Analysis failed. Check your API Key or Image.' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
