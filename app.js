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

dotenv.config();

const accountSid = "ACde171f7238c5b9e81626f8c87bf570ef";
const authToken  = "e0573e8117cfc92f4470cd589e00bc6a";
const twilioNumber = "+19786446908"; 
const JWT_SECRET = "rishik@123";

const app = express();
const client = twilio(accountSid, authToken);

// --- Setup ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload());
app.use(express.json());

// --- Serve uploads folder publicly ---
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));

// --- MongoDB Connection ---
mongoose.connect("mongodb+srv://rishikgoyal:rishikgoyal@cluster0.msvexze.mongodb.net/teachersDB")
  .then(() => console.log('✅ Connected to MongoDB Atlas'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// --- JWT Auth Middleware ---
const auth = (req, res, next) => {
  const token = req.cookies.token;
  if (!token) {
    res.locals.teacher = null;
    return next();
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    res.locals.teacher = decoded;
  } catch (err) {
    res.locals.teacher = null;
  }
  next();
};

// --- ROUTES ---

app.get('/dash', auth, (req, res) => {
  if (!res.locals.teacher) return res.redirect('/login');
  res.render('dash', { teacher: res.locals.teacher });
});

app.get('/', (req, res) => res.render('land'));

// ✅ UPLOAD PAGE (HTML + JS)
app.get('/upload', (req, res) => {
  if (!res.locals.teacher) return res.redirect('/login');
  res.send(`<!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>PDF Upload</title>
    <style>
      body { font-family: Arial; max-width: 600px; margin: 50px auto; padding: 20px; background: #f5f5f5; }
      .container { background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
      button { background: #007bff; color: white; padding: 12px 30px; border: none; border-radius: 5px; cursor: pointer; width: 100%; }
      button:hover { background: #0056b3; }
      .message { margin-top: 20px; text-align: center; padding: 15px; border-radius: 5px; }
      .success { background: #d4edda; color: #155724; }
      .error { background: #f8d7da; color: #721c24; }
    </style>
  </head>
  <body>
    <div class="container">
      <h1>📄 PDF Upload</h1>
      <form id="uploadForm" enctype="multipart/form-data">
        <label for="pdfFile">Select PDF File:</label>
        <input type="file" id="pdfFile" name="pdfFile" accept=".pdf" required />
        <button type="submit">Upload PDF</button>
      </form>
      <div id="message"></div>
    </div>
    <script>
      document.querySelector('#uploadForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const messageDiv = document.getElementById('message');
        try {
          messageDiv.innerHTML = '<div class="message">Uploading...</div>';
          const response = await fetch('/upload', { method: 'POST', body: formData });
          const result = await response.json();
          if (result.success) {
            messageDiv.innerHTML = \`<div class="message success">✅ Uploaded! <a href="\${result.url}" target="_blank">View PDF</a></div>\`;
          } else {
            messageDiv.innerHTML = \`<div class="message error">❌ \${result.error}</div>\`;
          }
        } catch (error) {
          messageDiv.innerHTML = \`<div class="message error">❌ Upload failed: \${error.message}</div>\`;
        }
      });
    </script>
  </body>
  </html>`);
});

// ✅ FILE UPLOAD HANDLER
app.post('/upload', async (req, res) => {
    try {
        // make sure file exists
        if (!req.files || !req.files.file) {
            return res.status(400).json({ success: false, error: 'No file uploaded' });
        }

        const file = req.files.file;

        // allow only PDFs for safety
        if (file.mimetype !== 'application/pdf') {
            return res.status(400).json({ success: false, error: 'Only PDF files are allowed' });
        }

        if (file.size > 10 * 1024 * 1024) {
            return res.status(400).json({ success: false, error: 'File too large (max 10MB)' });
        }

        const timestamp = Date.now();
        const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const fileName = `${timestamp}-${safeName}`;
        const filePath = path.join(uploadsDir, fileName);

        await file.mv(filePath);

        const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${fileName}`;
        return res.json({ success: true, fileUrl });
    } catch (err) {
        console.error('Upload error:', err);
        res.status(500).json({ success: false, error: 'Server error during upload' });
    }
});

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


app.post("/send-sms", async (req, res) => {
  const { recipients, message } = req.body;

  if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
    return res.status(400).json({ error: "No recipients provided" });
  }

  const failedNumbers = [];

  for (const phone of recipients) {
    try {
      console.log(message)
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



// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));
