const express = require('express');
const axios = require('axios');
const path = require('path');
const dotenv = require('dotenv');
const Teacher = require('./models/teacher');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');
const twilio = require('twilio');
const fs = require('fs');
const FormData = require('form-data');
const fileUpload = require('express-fileupload');
const accountSid = "ACf691596e7aa4f6b1e86b8928ca1d3464";
const authToken  = "cf534d9d88d6e5451d6809eefa27e65b";
const twilioNumber = "+12293982958"; // your twilio number
dotenv.config();
const JWT_SECRET = "rishik@123";
const app = express();
const client = twilio(accountSid, authToken)
// Set view engine and static folder
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload()); // for file uploads
app.use(express.json())
// Connect MongoDB
mongoose.connect("mongodb+srv://rishikgoyal:rishikgoyal@cluster0.msvexze.mongodb.net/teachersDB")
  .then(() => console.log('✅ Connected to MongoDB Atlas'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// JWT auth middleware
const auth = (req, res, next) => {
    const token = req.cookies.token;
    if (!token) {
        res.locals.teacher = null;
        const notAuth=true
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        res.locals.teacher = decoded; // now teacher.name is available
    } catch (err) {
        res.locals.teacher = null;
        const notAuth=true
    }
    next();
};

// Routes
app.get('/dash', auth, (req, res) => {
    if (!res.locals.teacher) return res.redirect('/login');
    return res.render('dash', { teacher: res.locals.teacher });
});

app.get('/',  (req, res) => res.render('land'));

// --- CLASS ROUTE: GET for page, POST for OCR upload ---
app.get('/class', auth, (req, res) => {
    if (!res.locals.teacher) return res.redirect('/login');
    res.render('class', { teacher: res.locals.teacher, ocrStudents: null, ocrDate: null });
});

app.post('/class', auth, async (req, res) => {
    if (!res.locals.teacher) return res.redirect('/login');
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
app.get('/test',auth,(req, res) => {
    if (!res.locals.teacher) return res.redirect('/login');
    res.render('test');
});

// Login & Logout
app.get('/login', auth, (req, res) => {
    if (res.locals.teacher) return res.redirect('/dash');
    res.render('login', { error: null });
});

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
    if (!res.locals.teacher) return res.redirect('/login');
    const query = req.query.q || "educational";
    const API_KEY =  "AIzaSyBGki6h-QZipjIDVEllmT1Wd1DMq1qoOv8";
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
// --- Twilio SMS endpoint (hardcoded creds for local testing) ---
app.post('/absentees/sms', auth, async (req, res) => {
  try {
    // <<--- PUT YOUR TWILIO CREDENTIALS HERE (local testing only) --->
    

    const twilioClient = require('twilio')(accountSid, authToken);

    const { to, body, materialUrl } = req.body;
    const recipients = Array.isArray(to) ? to : [];

    if (!recipients.length) return res.status(400).json({ error: 'No recipients provided' });

    const messageText = `${body || 'New class material:'}${materialUrl ? '\n' + materialUrl : ''}`;

    const results = await Promise.allSettled(
      recipients.map(number =>
        twilioClient.messages.create({ from: fromNumber, to: number, body: messageText })
      )
    );

    const details = results.map((r, i) => ({
      number: recipients[i],
      status: r.status,
      error: r.status === 'rejected' ? (r.reason?.message || String(r.reason)) : null
    }));

    const sent = details.filter(d => d.status === 'fulfilled').length;
    const failed = details.length - sent;

    return res.json({ success: true, sent, failed, details });
  } catch (err) {
    console.error('Twilio SMS error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});
// add near top: ensure public/uploads is served (you already have express.static('public'))
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

app.post("/send-sms", async (req, res) => {
  const { recipients, message } = req.body;

  if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
    return res.status(400).json({ error: "No recipients provided" });
  }

  const failedNumbers = [];

  for (const phone of recipients) {
    try {
      await client.messages.create({
        body: message,
        from: twilioNumber,
        to: phone, // must be a verified number if in trial
      });
    } catch (err) {
      console.error("Failed to send to", phone, err.message);
      failedNumbers.push(phone);
    }
  }

  if (failedNumbers.length === 0) {
    return res.json({ success: true });
  } else {
    return res.json({ success: false, failed: failedNumbers });
  }
});
app.post('/upload-material', auth, async (req, res) => {
  try {
    if (!req.files || !req.files.file) return res.status(400).json({ error: 'No file' });

    const file = req.files.file;
    // sanitize filename (basic)
    const safeName = Date.now() + '-' + file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const dest = path.join(uploadsDir, safeName);
    await file.mv(dest);

    // public URL (served via express.static on /public)
    const url = `${req.protocol}://${req.get('host')}/uploads/${safeName}`;
    return res.json({ url });
  } catch (err) {
    console.error('Upload error:', err);
    return res.status(500).json({ error: 'Upload failed' });
  }
});


// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));
