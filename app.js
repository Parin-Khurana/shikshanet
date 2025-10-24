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
const { Student, studentSchema } = require('./models/student');
const { TestAssignment, testAssignmentSchema } = require('./models/testAssignment');

dotenv.config();

const accountSid = "ACf7688481cac5cc8144b00fb7b87d5044";
const authToken  = "04ca1f7529dae8f57986067811aaea1a";
const twilioNumber = "+14172724533"; 
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

// --- MongoDB Connections ---
// Teacher database connection
mongoose.connect("mongodb+srv://rishikgoyal:rishikgoyal@cluster0.msvexze.mongodb.net/teachersDB")
  .then(() => console.log('✅ Connected to Teacher MongoDB Atlas'))
  .catch(err => console.error(' ❌ Teacher MongoDB connection error:', err));

// Student database connection
const studentMongoose = require('mongoose');
const studentConnection = studentMongoose.createConnection("mongodb+srv://rishikgoyal:rishikgoyal@cluster0.msvexze.mongodb.net/studentsDB");

studentConnection.on('connected', () => {
  console.log('✅ Connected to Student MongoDB Atlas');
  StudentModel = studentConnection.model('Student', studentSchema);
  TestAssignmentModel = studentConnection.model('TestAssignment', testAssignmentSchema);
});
studentConnection.on('error', (err) => console.error('❌ Student MongoDB connection error:', err));

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
const studentAuth = (req, res, next) => {
  const token = req.cookies.studentToken;
  if (!token) {
    res.locals.student = null;
    return next();
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    res.locals.student = decoded;
  } catch (err) {
    res.locals.student = null;
  }
  next();
};
app.get('/register_student', (req, res) => {
  console.log('Register student route accessed');
  // Don't redirect if already logged in - allow registration of new accounts
  res.render('register_student');
});

app.get('/login_student', studentAuth, (req, res) => {
  if (res.locals.student) return res.redirect('/studentdash');
  res.render('login_student', { error: null });
});
app.post('/login_student', async (req, res) => {
  const { phone, password } = req.body;
  try {
    if (!StudentModel) {
      return res.render('login_student', { error: 'Database not ready. Please try again.' });
    }
    
    const student = await StudentModel.findOne({ phone });
    if (!student) return res.render('login_student', { error: 'Student not found' });
    if (student.password !== password) return res.render('login_student', { error: 'Invalid password' });

    console.log('Student login successful:', student.name, 'ID:', student._id);
    const token = jwt.sign(
      { id: student._id, name: student.name, email: student.email, phone: student.phone },
      JWT_SECRET,
      { expiresIn: '2h' }
    );

    res.cookie('studentToken', token, { httpOnly: true });
    res.redirect('/studentdash');
  } catch (err) {
    console.error(err);
    res.render('login_student', { error: 'Server error' });
  }
});
app.get('/logout_student', (req, res) => {
  res.clearCookie('studentToken');
  res.redirect('/login_student');
});
app.get('/courses', auth, (req, res) => {
  if (!res.locals.teacher) return res.redirect('/login');
  res.render('courses', { teacher: res.locals.teacher });
});
// --- ROUTES ---
app.get('/studentdash', studentAuth, async (req, res) => {
  if (!res.locals.student) return res.redirect('/login_student');
  try {
    if (!StudentModel) {
      console.log('StudentModel not ready, using fallback data');
      // Create a fallback student object with assignedTests array
      const fallbackStudent = {
        ...res.locals.student,
        assignedTests: []
      };
      return res.render('studentdash', { student: fallbackStudent });
    }
    
    console.log('Looking for student with ID:', res.locals.student.id);
    const student = await StudentModel.findById(res.locals.student.id);
    if (!student) {
      console.log('Student not found in database, using fallback data');
      console.log('Available students in database:');
      const allStudents = await StudentModel.find({});
      console.log('Total students:', allStudents.length);
      allStudents.forEach(s => console.log(`- ${s.name} (${s.phone}) - ID: ${s._id}`));
      
      const fallbackStudent = {
        ...res.locals.student,
        assignedTests: []
      };
      return res.render('studentdash', { student: fallbackStudent });
    }
    
    res.render('studentdash', { student: student });
  } catch (err) {
    console.error('Error fetching student data:', err);
    // Create a fallback student object with assignedTests array
    const fallbackStudent = {
      ...res.locals.student,
      assignedTests: []
    };
    res.render('studentdash', { student: fallbackStudent });
  }
});
app.get('/dash', auth, (req, res) => {
  if (!res.locals.teacher) return res.redirect('/login');
  res.render('dash', { teacher: res.locals.teacher });
});


app.post('/add-course', auth, async (req, res) => {
  try {
    const { sectionId, courseName, description, status } = req.body;

    // Get teacher ID from res.locals
    const teacherId = res.locals.teacher.id;

    // Fetch teacher document
    const teacher = await Teacher.findById(teacherId);
    if (!teacher) return res.status(404).send('Teacher not found');

    // Find the section by _id
    console.log('Adding course to section ID:', sectionId);
      const section = teacher.sections.find(
  sec => sec._id.toString() === sectionId
);

    if (!section) {
      console.log('Available sections:', teacher.sections.map(s => s._id));
      return res.status(404).send('Section not found');
    }
    

    // Initialize courses array if it doesn't exist
    if (!section.courses) section.courses = [];

    // Push new course with correct field names
    section.courses.push({
      courseName,    // matches your schema
      description,
      status
    });

    // Save teacher document
    await teacher.save();

    return res.redirect('/courses'); // redirect to courses page
  } catch (err) {
    console.error('Add course error:', err);
    return res.status(500).send('Server error');
  }
});



app.get('/', (req, res) => res.render('land'));

// Test route
app.get('/test-route', (req, res) => {
  res.json({ message: 'Server is working!', timestamp: new Date() });
});

// Demo page for testing functionality
app.get('/test-demo', (req, res) => {
  res.sendFile(path.join(__dirname, 'test-demo.html'));
});

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
        const allowedTypes = ['application/pdf', 'video/mp4', 'video/quicktime'];
if (!allowedTypes.includes(file.mimetype)) {
    return res.status(400).json({ success: false, error: 'Only PDF and video files are allowed' });
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
    res.render('test', { teacher: res.locals.teacher });
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

  console.log("SMS Request received:", { recipients, message });

  if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
    console.log("No recipients provided");
    return res.status(400).json({ error: "No recipients provided" });
  }

  const failedNumbers = [];
  const successfulNumbers = [];

  for (const phone of recipients) {
    try {
      console.log(`Attempting to send SMS to ${phone}`);
      
      // Add timeout to prevent hanging
      const smsPromise = client.messages.create({
        body: message,
        from: twilioNumber,
        to: phone, // must be a verified number if in trial
      });
      
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('SMS timeout')), 10000)
      );
      
      const result = await Promise.race([smsPromise, timeoutPromise]);
      console.log(`SMS sent successfully to ${phone}, SID: ${result.sid}`);
      successfulNumbers.push(phone);
    } catch (err) {
      console.error(`Failed to send to ${phone}:`, err.message);
      failedNumbers.push(phone);
    }
  }

  console.log(`SMS Summary: ${successfulNumbers.length} successful, ${failedNumbers.length} failed`);

  if (failedNumbers.length === 0) {
    return res.json({ success: true, sent: successfulNumbers.length });
  } else {
    return res.json({ success: false, failed: failedNumbers, sent: successfulNumbers.length });
  }
});

// --- NEW ROUTE: Automatic Test Assignment ---
app.post('/assign-test', auth, async (req, res) => {
  if (!res.locals.teacher) return res.status(401).json({ success: false, error: 'Unauthorized' });
  
  try {
    if (!StudentModel || !TestAssignmentModel) {
      return res.status(503).json({ success: false, error: 'Database not ready. Please try again.' });
    }

    const { testName, courseName, dueDate, fileUrl, fileName, studentPhone } = req.body;
    
    if (!testName || !courseName || !fileUrl || !fileName || !studentPhone) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }
    
    // Due date is optional - use default if not provided
    const finalDueDate = dueDate || 'No due date';

    // Check if student exists with the given phone number
    console.log('Looking for student with phone:', studentPhone);
    const student = await StudentModel.findOne({ phone: studentPhone });
    if (!student) {
      console.log('Student not found with phone:', studentPhone);
      return res.status(404).json({ success: false, error: 'No student found with this number.' });
    }
    console.log('Found student:', student.name, 'with ID:', student._id);

    // Create test assignment data
    const testAssignment = {
      testName,
      subject: courseName, // Using courseName as subject
      courseName,
      dueDate: finalDueDate,
      fileUrl,
      fileName,
      teacherId: res.locals.teacher.id,
      teacherName: res.locals.teacher.username,
      studentPhone,
      studentId: student._id.toString()
    };

    // Add test to student's assignedTests array
    student.assignedTests.push(testAssignment);
    await student.save();

    // Also create a separate test assignment record for tracking
    const testAssignmentRecord = new TestAssignmentModel(testAssignment);
    await testAssignmentRecord.save();

    console.log(`Test "${testName}" assigned to student ${student.name} (${studentPhone})`);
    
    res.json({ 
      success: true, 
      message: `Test assigned successfully to ${student.name}`,
      studentName: student.name 
    });

  } catch (err) {
    console.error('Error assigning test:', err);
    res.status(500).json({ success: false, error: 'Server error during test assignment' });
  }
});

// --- TEST ROUTE: Create test student (for testing purposes) ---
app.post('/create-test-student', async (req, res) => {
  try {
    if (!StudentModel) {
      return res.status(503).json({ success: false, error: 'Database not ready. Please try again.' });
    }

    const { name, phone, email, password } = req.body;
    
    if (!name || !phone || !email || !password) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    // Check if student already exists
    const existingStudent = await StudentModel.findOne({ phone });
    if (existingStudent) {
      return res.status(400).json({ success: false, error: 'Student with this phone number already exists' });
    }

    const student = new StudentModel({
      name,
      phone,
      email,
      password,
      assignedTests: []
    });

    await student.save();
    
    res.json({ 
      success: true, 
      message: `Test student ${name} created successfully`,
      studentId: student._id 
    });

  } catch (err) {
    console.error('Error creating test student:', err);
    res.status(500).json({ success: false, error: 'Server error during student creation' });
  }
});

// Start server
const PORT = process.env.PORT || 8000;
app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));