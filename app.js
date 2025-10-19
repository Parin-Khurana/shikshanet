const express = require('express');
const axios = require('axios');
const path = require('path');
const dotenv = require('dotenv');
const Teacher = require('./models/teacher');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');
const fs = require('fs');
const FormData = require('form-data');
const fileUpload = require('express-fileupload');

dotenv.config();
const JWT_SECRET = "rishik@123";
const app = express();

// Set view engine and static folder
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload()); // for file uploads

// Connect MongoDB
mongoose.connect("mongodb+srv://rishikgoyal:rishikgoyal@cluster0.msvexze.mongodb.net/teachersDB")
  .then(() => console.log('✅ Connected to MongoDB Atlas'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// JWT auth middleware
const auth = (req, res, next) => {
    const token = req.cookies.token;
    if (!token) {
        res.locals.teacher = null;
        return res.redirect('/login');
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        res.locals.teacher = decoded; // now teacher.name is available
    } catch (err) {
        res.locals.teacher = null;
        return res.redirect('/login');
    }
    next();
};

// Routes
app.get('/dash', auth, (req, res) => {
    if (!res.locals.teacher) return res.redirect('/login');
    return res.render('dash', { teacher: res.locals.teacher });
});

app.get('/', auth, (req, res) => res.render('dash'));

// --- CLASS ROUTE: GET for page, POST for OCR upload ---
app.get('/class', auth, (req, res) => {
    res.render('class', { teacher: res.locals.teacher, ocrStudents: null, ocrDate: null });
});

app.post('/class', auth, async (req, res) => {
    try {
        // 1️⃣ Check file
        if (!req.files || !req.files.file) {
            return res.status(400).json({ error: "No file uploaded" });
        }

        const file = req.files.file;

        // Optional: limit file size to 2MB
        if (file.size > 2 * 1024 * 1024) {
            return res.status(400).json({ error: "File too large. Max 2MB allowed." });
        }

        const uploadsDir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
        const filePath = path.join(uploadsDir, file.name);

        // 2️⃣ Save temporary file
        await file.mv(filePath);

        // 3️⃣ Read file as base64
        const fileBase64 = fs.readFileSync(filePath, { encoding: 'base64' });
        const mimeType = file.mimetype.includes("jpeg") ? "image/jpeg" : "image/png";

        // 4️⃣ Prepare OCR.Space form
        const formData = new FormData();
        formData.append("base64Image", `data:${mimeType};base64,${fileBase64}`);
        formData.append("language", "eng");      // English
        formData.append("isTable", "true");      // Try table parsing
        formData.append("OCREngine", "2");       // Best engine for tables

        const apiKey = "K88514538288957"; // Your OCR.Space API key

        // 5️⃣ Send request
        const ocrRes = await axios.post("https://api.ocr.space/parse/image", formData, {
            headers: { ...formData.getHeaders(), apikey: apiKey },
            timeout: 30000  // 30s timeout
        });

        const ocrData = ocrRes.data;

        // 6️⃣ Debug logs
        console.log("OCR Response:", JSON.stringify(ocrData, null, 2));

        // 7️⃣ Check errors from OCR.Space
        if (ocrData.IsErroredOnProcessing) {
            return res.status(500).json({ error: ocrData.ErrorMessage || "OCR processing failed" });
        }

        if (!ocrData.ParsedResults || !ocrData.ParsedResults.length) {
            return res.status(500).json({ error: "No text detected by OCR" });
        }

        // 8️⃣ Parse students from text
        const text = ocrData.ParsedResults[0].ParsedText;
        const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);

        const ocrStudents = [];
        lines.forEach(line => {
            const cols = line.split(/\t|\|| {2,}/).map(c => c.trim()).filter(c => c.length > 0);
            if (cols.length >= 2) {
                const name = cols[0] || "Unknown";
                const phoneOrClass = cols[1] || "";
                const statusRaw = cols[cols.length - 1] || "";
                const status = ["P", "PRESENT"].includes(statusRaw.toUpperCase()) ? "PRESENT" : "ABSENT";

                ocrStudents.push({ name, phone: phoneOrClass, status });
            }
        });

        // 9️⃣ Delete temp file
        fs.unlinkSync(filePath);

        // 10️⃣ Return JSON to front-end
        return res.json({ students: ocrStudents, date: new Date().toLocaleDateString() });

    } catch (err) {
        console.error("OCR Error:", err.message, err.response?.data);
        return res.status(500).json({ error: "Error uploading or parsing file" });
    }
});


// Login & Logout
app.get('/login', (req, res) => res.render('login', { error: null }));

app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const teacher = await Teacher.findOne({ email });
        if (!teacher) return res.render('login', { error: 'User not found' });
        if (teacher.password !== password) return res.render('login', { error: 'Invalid password' });

        const token = jwt.sign(
            { id: teacher._id, username: teacher.username, email: teacher.email, sections: teacher.sections },
            JWT_SECRET,
            { expiresIn: '2h' }
        );

        res.cookie('token', token, { httpOnly: true });
        res.redirect('/dash');
    } catch (err) {
        console.error(err);
        res.render('login', { error: 'Server error' });
    }
});

app.get('/logout', (req, res) => {
    res.clearCookie('token');
    res.redirect('/login');
});

// Browse route — fetch YouTube videos
app.get("/browse", auth, async (req, res) => {
    const query = req.query.q || "educational";
    const API_KEY = process.env.YOUTUBE_API_KEY;
    try {
        const response = await axios.get("https://www.googleapis.com/youtube/v3/search", {
            params: {
                part: "snippet",
                type: "video",
                q: query,
                maxResults: 10,
                key: API_KEY,
            },
        });

        const videos = response.data.items.map(v => {
            const videoId = v.id.videoId;
            return {
                title: v.snippet.title,
                channel: v.snippet.channelTitle,
                thumbnail: v.snippet.thumbnails.medium.url,
                videoId,
                downloadUrl: `https://ytmp4.biz/convert/?query=https://www.youtube.com/watch?v=${videoId}`
            };
        });

        res.render("yt", { videos, query });
    } catch (err) {
        console.error(err.message);
        res.render("yt", { videos: [], query, error: "Failed to fetch YouTube data" });
    }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));
