const express = require('express');
const axios = require('axios');
const path = require('path');
const dotenv = require('dotenv');
const Teacher = require('./models/teacher');
const { Student, studentSchema } = require('./models/student');
const { Doubt } = require('./models/doubt');
const { TestAssignment, testAssignmentSchema } = require('./models/testAssignment');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');
const twilio = require('twilio');
const fs = require('fs');
const FormData = require('form-data');
const fileUpload = require('express-fileupload');

// Declare StudentModel and TestAssignmentModel globally
let StudentModel;
let TestAssignmentModel;

dotenv.config();

const accountSid = "ACf691596e7aa4f6b1e86b8928ca1d3464";
const authToken  = "214c14eab4139ef3844a8c5b2efc0c8c";
const twilioNumber = "+12293982958"; 
const JWT_SECRET = "rishik@123";

const app = express();
const client = twilio(accountSid, authToken);

// --- Setup ---
app.use('/imgs', express.static(path.join(__dirname, 'imgs')));
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
app.get('/info', (req, res) =>  {
  res.render('info');
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
// --- ROUTES ---
app.get('/studentdash', studentAuth, async (req, res) => {
  console.log('=== STUDENT DASHBOARD ROUTE HIT ===');
  console.log('Student auth check:', !!res.locals.student);
  
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
    
    console.log('✅ Student found in database:', student.name);
    console.log('📊 Student data:', {
      name: student.name,
      phone: student.phone,
      email: student.email,
      assignedTestsCount: student.assignedTests ? student.assignedTests.length : 0
    });
    
    // Debug: Log assigned tests data
    console.log('📝 Student assigned tests count:', student.assignedTests ? student.assignedTests.length : 0);
    if (student.assignedTests && student.assignedTests.length > 0) {
      console.log('📝 Assigned tests details:', student.assignedTests.map(test => ({
        testName: test.testName,
        courseName: test.courseName,
        dueDate: test.dueDate,
        fileUrl: test.fileUrl,
        teacherName: test.teacherName
      })));
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
app.get('/dash', auth, async (req, res) => {
  console.log('=== DASHBOARD PAGE LOAD START ===');
  console.log('Auth check:', !!res.locals.teacher);
  
  if (!res.locals.teacher) {
    console.log('❌ No teacher in locals, redirecting to login');
    return res.redirect('/login');
  }
  
  try {
    // Fetch the latest teacher data from database to get fresh courses
    console.log('🔍 Looking for teacher with ID:', res.locals.teacher.id);
    const teacher = await Teacher.findById(res.locals.teacher.id);
    if (!teacher) {
      console.log('❌ Teacher not found in database');
      return res.status(404).render('error', { message: 'Teacher not found' });
    }
    
    console.log('✅ Teacher found:', teacher.username);
    console.log('📊 Teacher sections count:', teacher.sections.length);
    console.log('📋 Available sections:', teacher.sections.map((sec, idx) => ({ 
      index: idx, 
      name: sec.sectionName, 
      students: sec.students?.length || 0,
      courses: sec.courses?.length || 0
    })));
    
    // Count total courses across all sections
    let totalCourses = 0;
    let completedCourses = 0;
    teacher.sections.forEach(section => {
      if (section.courses) {
        totalCourses += section.courses.length;
        completedCourses += section.courses.filter(course => course.status === 'completed').length;
      }
    });
    console.log('📚 Total courses:', totalCourses, 'Completed:', completedCourses);
    
    console.log('🎨 Rendering dashboard...');
    res.render('dash', { teacher: teacher });
    console.log('=== DASHBOARD PAGE LOAD SUCCESS ===');
  } catch (err) {
    console.error('❌ Error fetching teacher data for dashboard:', err);
    console.error('❌ Error stack:', err.stack);
    res.status(500).render('error', { message: 'Server error' });
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
app.get('/class', auth, async (req, res) => {
    console.log('=== CLASS PAGE LOAD START ===');
    console.log('Auth check:', !!res.locals.teacher);
    
    if (!res.locals.teacher) {
        console.log('❌ No teacher in locals, redirecting to login');
        return res.redirect('/login');
    }
    
    try {
        // Fetch the latest teacher data from database to get fresh courses
        console.log('🔍 Looking for teacher with ID:', res.locals.teacher.id);
        const teacher = await Teacher.findById(res.locals.teacher.id);
        if (!teacher) {
            console.log('❌ Teacher not found in database');
            return res.status(404).render('error', { message: 'Teacher not found' });
        }
        
        console.log('✅ Teacher found:', teacher.username);
        console.log('📊 Teacher sections count:', teacher.sections.length);
        console.log('📋 Available sections:', teacher.sections.map((sec, idx) => ({ 
            index: idx, 
            name: sec.sectionName, 
            students: sec.students?.length || 0,
            courses: sec.courses?.length || 0
        })));
        
        console.log('🎨 Rendering class page...');
        res.render('class', { teacher: teacher, ocrStudents: null, ocrDate: null });
        console.log('=== CLASS PAGE LOAD SUCCESS ===');
    } catch (err) {
        console.error('❌ Error fetching teacher data for class page:', err);
        console.error('❌ Error stack:', err.stack);
        res.status(500).render('error', { message: 'Server error' });
    }
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
app.get('/test', auth, async (req, res) => {
    console.log('=== TEST PAGE LOAD START ===');
    console.log('Auth check:', !!res.locals.teacher);
    
    if (!res.locals.teacher) {
        console.log('❌ No teacher in locals, redirecting to login');
        return res.redirect('/login');
    }
    
    try {
        // Fetch the latest teacher data from database to get fresh courses
        console.log('🔍 Looking for teacher with ID:', res.locals.teacher.id);
        const teacher = await Teacher.findById(res.locals.teacher.id);
        if (!teacher) {
            console.log('❌ Teacher not found in database');
            return res.status(404).render('error', { message: 'Teacher not found' });
        }
        
        console.log('✅ Teacher found:', teacher.username);
        console.log('📊 Teacher sections count:', teacher.sections.length);
        console.log('📋 Available sections:', teacher.sections.map((sec, idx) => ({ 
            index: idx, 
            name: sec.sectionName, 
            students: sec.students?.length || 0,
            courses: sec.courses?.length || 0
        })));
        
        console.log('🎨 Rendering test page...');
        res.render('test', { teacher: teacher });
        console.log('=== TEST PAGE LOAD SUCCESS ===');
    } catch (err) {
        console.error('❌ Error fetching teacher data for test page:', err);
        console.error('❌ Error stack:', err.stack);
        res.status(500).render('error', { message: 'Server error' });
    }
});

// Login & Logout
app.get('/login', auth, (req, res) => {
    if (res.locals.teacher) return res.redirect('/dash');
    res.render('login', { error: null });
});
app.get('/analytics',(req,res)=>{     
  res.render('analytics');
})
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

// --- COURSE ROUTES ---
// GET route to display courses page
app.get('/courses', auth, async (req, res) => {
  console.log('=== COURSES PAGE LOAD START ===');
  console.log('Auth check:', !!res.locals.teacher);
  
  if (!res.locals.teacher) {
    console.log('❌ No teacher in locals, redirecting to login');
    return res.redirect('/login');
  }
  
  try {
    // Fetch the latest teacher data from database
    console.log('🔍 Looking for teacher with ID:', res.locals.teacher.id);
    const teacher = await Teacher.findById(res.locals.teacher.id);
    if (!teacher) {
      console.log('❌ Teacher not found in database');
      return res.status(404).render('error', { message: 'Teacher not found' });
    }
    
    console.log('✅ Teacher found:', teacher.username);
    console.log('📊 Teacher sections count:', teacher.sections.length);
    console.log('📋 Available sections:', teacher.sections.map((sec, idx) => ({ 
      index: idx, 
      name: sec.sectionName, 
      students: sec.students?.length || 0,
      courses: sec.courses?.length || 0
    })));
    
    console.log('🎨 Rendering courses page...');
    res.render('courses', { 
      teacher: teacher,
      timestamp: Date.now() // Add timestamp to help with cache busting
    });
    console.log('=== COURSES PAGE LOAD SUCCESS ===');
  } catch (err) {
    console.error('❌ Error fetching teacher data:', err);
    console.error('❌ Error stack:', err.stack);
    res.status(500).render('error', { message: 'Server error' });
  }
});

// POST route to add a new course to a specific section
app.post('/add-course', auth, async (req, res) => {
  console.log('=== ADD COURSE REQUEST START ===');
  console.log('Auth check:', !!res.locals.teacher);
  
  if (!res.locals.teacher) {
    console.log('❌ Unauthorized - no teacher in locals');
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  
  try {
    const { courseName, sectionId, description, status } = req.body;
    console.log('📝 Request body:', { courseName, sectionId, description, status });
    
    if (!courseName || !sectionId || !description) {
      console.log('❌ Missing required fields');
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }
    
    // Find the teacher and the specific section
    console.log('🔍 Looking for teacher with ID:', res.locals.teacher.id);
    const teacher = await Teacher.findById(res.locals.teacher.id);
    if (!teacher) {
      console.log('❌ Teacher not found in database');
      return res.status(404).json({ success: false, error: 'Teacher not found' });
    }
    
    console.log('✅ Teacher found:', teacher.username);
    console.log('📊 Teacher sections count:', teacher.sections.length);
    console.log('📋 Available sections:', teacher.sections.map((sec, idx) => ({ 
      index: idx, 
      name: sec.sectionName, 
      students: sec.students?.length || 0,
      courses: sec.courses?.length || 0
    })));
    
    // Find the section by index
    const sectionIndex = parseInt(sectionId);
    console.log('🔢 Parsed section index:', sectionIndex);
    console.log('🔢 Is valid number?', !isNaN(sectionIndex));
    console.log('🔢 Index >= 0?', sectionIndex >= 0);
    console.log('🔢 Index < sections.length?', sectionIndex < teacher.sections.length);
    
    if (isNaN(sectionIndex) || sectionIndex < 0 || sectionIndex >= teacher.sections.length) {
      console.log('❌ Invalid section index');
      // If no sections found, return a more helpful error
      if (teacher.sections.length === 0) {
        console.log('❌ No sections available');
        return res.status(404).json({ success: false, error: 'No sections available. Please create a section first.' });
      }
      
      // If section not found, suggest refreshing the page
      console.log('❌ Section index out of bounds');
      return res.status(404).json({ 
        success: false, 
        error: 'Section not found. The page data might be outdated. Please refresh the page and try again.'
      });
    }
    
    const section = teacher.sections[sectionIndex];
    console.log('✅ Section found:', section.sectionName);
    console.log('📚 Current courses in section:', section.courses?.length || 0);
    
    // Initialize courses array if it doesn't exist
    if (!section.courses) {
      console.log('🔧 Initializing courses array for section');
      section.courses = [];
    }
    
    // Add the new course to the section
    const newCourse = {
      courseName: courseName,
      description: description,
      status: status || 'active'
    };
    console.log('➕ Adding new course:', newCourse);
    
    section.courses.push(newCourse);
    console.log('📚 Courses after adding:', section.courses.length);
    
    // Save the teacher document
    console.log('💾 Saving teacher document...');
    await teacher.save();
    console.log('✅ Teacher document saved successfully');
    
    console.log('=== ADD COURSE REQUEST SUCCESS ===');
    res.json({ 
      success: true, 
      message: 'Course added successfully',
      course: newCourse
    });
    
  } catch (err) {
    console.error('❌ Error adding course:', err);
    console.error('❌ Error stack:', err.stack);
    res.status(500).json({ success: false, error: 'Server error while adding course' });
  }
});

// POST route to delete a course from a specific section
app.post('/teacher/course/delete', auth, async (req, res) => {
  console.log('=== DELETE COURSE REQUEST START ===');
  console.log('Auth check:', !!res.locals.teacher);
  
  if (!res.locals.teacher) {
    console.log('❌ Unauthorized - no teacher in locals');
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  
  try {
    const { sectionId, courseId } = req.body;
    console.log('📝 Delete request body:', { sectionId, courseId });
    
    if (!sectionId || !courseId) {
      console.log('❌ Missing section or course ID');
      return res.status(400).json({ success: false, error: 'Missing section or course ID' });
    }
    
    // Find the teacher and the specific section
    console.log('🔍 Looking for teacher with ID:', res.locals.teacher.id);
    const teacher = await Teacher.findById(res.locals.teacher.id);
    if (!teacher) {
      console.log('❌ Teacher not found in database');
      return res.status(404).json({ success: false, error: 'Teacher not found' });
    }
    
    console.log('✅ Teacher found:', teacher.username);
    console.log('📊 Teacher sections count:', teacher.sections.length);
    
    // Find the section by index
    const sectionIndex = parseInt(sectionId);
    console.log('🔢 Parsed section index:', sectionIndex);
    console.log('🔢 Is valid number?', !isNaN(sectionIndex));
    console.log('🔢 Index >= 0?', sectionIndex >= 0);
    console.log('🔢 Index < sections.length?', sectionIndex < teacher.sections.length);
    
    if (isNaN(sectionIndex) || sectionIndex < 0 || sectionIndex >= teacher.sections.length) {
      console.log('❌ Invalid section index');
      return res.status(404).json({ success: false, error: 'Section not found' });
    }
    
    const section = teacher.sections[sectionIndex];
    console.log('✅ Section found:', section.sectionName);
    console.log('📚 Current courses in section:', section.courses?.length || 0);
    
    // Find the course by index
    const courseIndex = parseInt(courseId);
    console.log('🔢 Parsed course index:', courseIndex);
    console.log('🔢 Is valid number?', !isNaN(courseIndex));
    console.log('🔢 Index >= 0?', courseIndex >= 0);
    console.log('🔢 Index < courses.length?', courseIndex < (section.courses?.length || 0));
    
    if (isNaN(courseIndex) || courseIndex < 0 || courseIndex >= (section.courses?.length || 0)) {
      console.log('❌ Invalid course index');
      return res.status(404).json({ success: false, error: 'Course not found' });
    }
    
    const courseToDelete = section.courses[courseIndex];
    console.log('🗑️ Course to delete:', courseToDelete);
    
    // Remove the course from the section using array splice
    section.courses.splice(courseIndex, 1);
    console.log('📚 Courses after deletion:', section.courses.length);
    
    // Save the teacher document
    console.log('💾 Saving teacher document...');
    await teacher.save();
    console.log('✅ Teacher document saved successfully');
    
    console.log('=== DELETE COURSE REQUEST SUCCESS ===');
    res.json({ 
      success: true, 
      message: 'Course deleted successfully'
    });
    
  } catch (err) {
    console.error('❌ Error deleting course:', err);
    console.error('❌ Error stack:', err.stack);
    res.status(500).json({ success: false, error: 'Server error while deleting course' });
  }
});

// POST route to assign test to students
app.post('/assign-test', auth, async (req, res) => {
  console.log('=== ASSIGN TEST ROUTE HIT ===');
  console.log('=== ASSIGN TEST REQUEST START ===');
  console.log('Auth check:', !!res.locals.teacher);
  
  if (!res.locals.teacher) {
    console.log('❌ Unauthorized - no teacher in locals');
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  
  try {
    const { 
      testName, 
      courseName, 
      dueDate, 
      fileUrl, 
      fileName, 
      studentPhones, 
      sectionIndex 
    } = req.body;
    
    console.log('📝 Assign test request body:', { 
      testName, 
      courseName, 
      dueDate, 
      fileUrl, 
      fileName, 
      studentPhones, 
      sectionIndex 
    });
    
    console.log('📝 Raw request body:', req.body);
    console.log('📝 studentPhones type:', typeof studentPhones);
    console.log('📝 studentPhones value:', studentPhones);
    console.log('📝 studentPhones is array:', Array.isArray(studentPhones));
    console.log('📝 studentPhones length:', studentPhones?.length);
    
    // Only require essential fields
    if (!studentPhones || !Array.isArray(studentPhones) || studentPhones.length === 0) {
      console.log('❌ Missing required fields: studentPhones');
      console.log('❌ studentPhones validation failed:', {
        exists: !!studentPhones,
        isArray: Array.isArray(studentPhones),
        length: studentPhones?.length
      });
      return res.status(400).json({ success: false, error: 'Please select at least one student' });
    }
    
    // Set default values for optional fields
    const finalTestName = testName || 'Test Assignment';
    const finalCourseName = courseName || 'General';
    const finalDueDate = dueDate || 'Not specified';
    const finalFileName = fileName || 'Test File';
    
    console.log('📝 Using values:', {
      testName: finalTestName,
      courseName: finalCourseName,
      dueDate: finalDueDate,
      fileName: finalFileName,
      fileUrl: fileUrl || 'No file uploaded'
    });
    
    // Find the teacher to get teacher info
    console.log('🔍 Looking for teacher with ID:', res.locals.teacher.id);
    const teacher = await Teacher.findById(res.locals.teacher.id);
    if (!teacher) {
      console.log('❌ Teacher not found in database');
      return res.status(404).json({ success: false, error: 'Teacher not found' });
    }
    
    console.log('✅ Teacher found:', teacher.username);
    
    // Find students by phone numbers from teacher's sections
    console.log('🔍 Looking for students with phones:', studentPhones);
    console.log('🔍 Phone number types:', studentPhones.map(p => typeof p));
    console.log('🔍 Phone number lengths:', studentPhones.map(p => p?.length));
    
    // Get students from teacher's sections instead of Student database
    const allTeacherStudents = [];
    teacher.sections.forEach(section => {
      if (section.students) {
        section.students.forEach(student => {
          allTeacherStudents.push({
            name: student.name,
            phone: student.phone,
            studentId: student.studentId || student._id
          });
        });
      }
    });
    
    console.log('🔍 Available students in teacher sections:', allTeacherStudents.map(s => ({ name: s.name, phone: s.phone })));
    
    // Find matching students from teacher's data
    console.log('🔍 Filtering students by phone numbers...');
    console.log('🔍 Looking for phones:', studentPhones);
    console.log('🔍 Available students:', allTeacherStudents.map(s => ({ name: s.name, phone: s.phone })));
    
    const students = allTeacherStudents.filter(student => {
      const isMatch = studentPhones.includes(student.phone);
      console.log(`🔍 Checking ${student.name} (${student.phone}) - Match: ${isMatch}`);
      return isMatch;
    });
    
    console.log('✅ Found students from teacher sections:', students.length);
    console.log('✅ Matched students:', students.map(s => ({ name: s.name, phone: s.phone })));
    
    if (students.length === 0) {
      console.log('❌ No students found with provided phone numbers in teacher sections');
      console.log('❌ Searched for:', studentPhones);
      console.log('❌ Available in teacher sections:', allTeacherStudents.map(s => ({ name: s.name, phone: s.phone })));
      
      return res.status(404).json({ success: false, error: 'No students found with provided phone numbers' });
    }
    
    // Create test assignment object
    const testAssignment = {
      testName: finalTestName,
      subject: finalCourseName,
      courseName: finalCourseName,
      dueDate: finalDueDate,
      fileUrl: fileUrl || '',
      fileName: finalFileName,
      teacherId: teacher._id.toString(),
      teacherName: teacher.username,
      assignedDate: new Date(),
      status: 'assigned'
    };
    
    console.log('📚 Test assignment object:', testAssignment);
    
    // Add test assignment to each student in teacher's sections
    console.log('📝 Adding test assignments to teacher sections...');
    
    // Update teacher's sections with test assignments
    teacher.sections.forEach(section => {
      if (section.students) {
        section.students.forEach(student => {
          if (studentPhones.includes(student.phone)) {
            if (!student.assignedTests) {
              student.assignedTests = [];
            }
            student.assignedTests.push(testAssignment);
            console.log(`📝 Added test to student: ${student.name} (${student.phone})`);
          }
        });
      }
    });
    
    // Verify students exist in Student database before assigning tests
    console.log('📝 Verifying students exist in Student database...');
    console.log('📝 Processing students from teacher sections:', students.map(s => ({ name: s.name, phone: s.phone })));
    
    // Show all students available in Student DB
    console.log('📝 Checking all students in Student database...');
    const allStudentsInDB = await StudentModel.find({}, 'name phone email').limit(20);
    console.log('📝 Available students in Student DB:', allStudentsInDB.map(s => ({ 
      name: s.name, 
      phone: s.phone, 
      email: s.email 
    })));
    
    const validStudents = [];
    const invalidStudents = [];
    
    for (const student of students) {
      try {
        // Check if student exists in Student database
        const studentRecord = await StudentModel.find({ phone: student.phone });
        
        if (studentRecord.length > 0) {
          // Student exists in Student DB
          validStudents.push(student);
          console.log(`✅ Student found in Student DB: ${student.name} (${student.phone})`);
        } else {
          // Student doesn't exist in Student DB
          invalidStudents.push(student);
          console.log(`❌ Student NOT found in Student DB: ${student.name} (${student.phone})`);
        }
      } catch (err) {
        console.error(`❌ Error checking student ${student.name}:`, err);
        invalidStudents.push(student);
      }
    }
    
    // If any students don't exist in Student DB, return error
    if (invalidStudents.length > 0) {
      const invalidNames = invalidStudents.map(s => s.name).join(', ');
      const invalidPhones = invalidStudents.map(s => s.phone).join(', ');
      console.log(`❌ Cannot assign tests - students not registered: ${invalidNames}`);
      
      return res.status(404).json({ 
        success: false, 
        error: `Students not found in database: ${invalidNames} (${invalidPhones}). Please ensure students are registered first.` 
      });
    }
    
    // Only proceed if all students exist in Student DB
    console.log('📝 All students verified in Student database, proceeding with test assignment...');
    
    const studentUpdatePromises = validStudents.map(async (student) => {
      try {
        // Find the student in the Student database by phone number
        const studentRecord = await StudentModel.find({ phone: student.phone });
        const studentDoc = studentRecord[0];
        
        if (!studentDoc.assignedTests) {
          studentDoc.assignedTests = [];
        }
        studentDoc.assignedTests.push(testAssignment);
        await studentDoc.save();
        console.log(`📝 Added test to Student DB: ${student.name} (${student.phone})`);
      } catch (err) {
        console.error(`❌ Error updating student ${student.name}:`, err);
      }
    });
    
    await Promise.all(studentUpdatePromises);
    
    // Save the teacher document
    await teacher.save();
    console.log('✅ Test assigned to all students successfully');
    
    console.log('=== ASSIGN TEST REQUEST SUCCESS ===');
    res.json({
      success: true,
      message: `Test assigned to ${students.length} student(s) successfully`,
      assignedStudents: students.map(s => ({ name: s.name, phone: s.phone }))
    });
    
  } catch (err) {
    console.error('❌ Error assigning test:', err);
    console.error('❌ Error stack:', err.stack);
    res.status(500).json({ success: false, error: 'Server error while assigning test' });
  }
});

// --- DOUBT ROUTES ---
// GET route to display doubts page for teachers
app.get('/doubts', auth, async (req, res) => {
  console.log('=== DOUBTS PAGE LOAD START ===');
  console.log('Auth check:', !!res.locals.teacher);
  
  if (!res.locals.teacher) {
    console.log('❌ No teacher in locals, redirecting to login');
    return res.redirect('/login');
  }
  
  try {
    // Fetch the latest teacher data from database
    console.log('🔍 Looking for teacher with ID:', res.locals.teacher.id);
    const teacher = await Teacher.findById(res.locals.teacher.id);
    if (!teacher) {
      console.log('❌ Teacher not found in database');
      return res.status(404).render('error', { message: 'Teacher not found' });
    }
    
    console.log('✅ Teacher found:', teacher.username);
    
    // Fetch doubts assigned to this teacher
    console.log('🔍 Fetching doubts for teacher:', teacher._id);
    const doubts = await Doubt.find({ teacherName: teacher.username })
  .sort({ createdAt: -1 });
    console.log('📚 Found doubts:', doubts.length);
    
    console.log('🎨 Rendering doubts page...');
    res.render('doubts', { 
      teacher: teacher,
      doubts: doubts,
      timestamp: Date.now()
    });
    console.log('=== DOUBTS PAGE LOAD SUCCESS ===');
  } catch (err) {
    console.error('❌ Error fetching doubts:', err);
    console.error('❌ Error stack:', err.stack);
    res.status(500).render('error', { message: 'Server error' });
  }
});

// POST route for students to ask doubts
app.post('/ask-doubt', async (req, res) => {
  console.log('=== ASK DOUBT REQUEST START ===');
  
  try {
    const { 
      studentId,
      studentName,
      studentPhone,
      studentEmail,
      teacherId,
      teacherName,
      subject,
      courseName,
      doubtTitle,
      doubtDescription,
      doubtType,
      priority
    } = req.body;
    
    console.log('📝 Ask doubt request body:', { 
      studentId,
      studentName,
      studentPhone,
      studentEmail,
      teacherId,
      teacherName,
      subject,
      courseName,
      doubtTitle,
      doubtDescription,
      doubtType,
      priority
    });
    
    // Validate required fields
    if (!studentId || !studentName || !studentPhone || !studentEmail || 
        !teacherId || !teacherName || !subject || !courseName || 
        !doubtTitle || !doubtDescription) {
      console.log('❌ Missing required fields');
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }
    
    // Create new doubt
    const newDoubt = new Doubt({
      studentId,
      studentName,
      studentPhone,
      studentEmail,
      teacherId,
      teacherName,
      subject,
      courseName,
      doubtTitle,
      doubtDescription,
      doubtType: doubtType || 'general',
      priority: priority || 'medium',
      status: 'pending'
    });
    
    console.log('📚 Creating new doubt:', newDoubt);
    
    await newDoubt.save();
    console.log('✅ Doubt saved successfully');
    
    console.log('=== ASK DOUBT REQUEST SUCCESS ===');
    res.json({
      success: true,
      message: 'Doubt submitted successfully',
      doubtId: newDoubt._id
    });
    
  } catch (err) {
    console.error('❌ Error asking doubt:', err);
    console.error('❌ Error stack:', err.stack);
    res.status(500).json({ success: false, error: 'Server error while submitting doubt' });
  }
});

// POST route for teachers to respond to doubts
app.post('/respond-doubt', auth, async (req, res) => {
  console.log('=== RESPOND DOUBT REQUEST START ===');
  console.log('Auth check:', !!res.locals.teacher);
  
  if (!res.locals.teacher) {
    console.log('❌ Unauthorized - no teacher in locals');
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  
  try {
    const { doubtId, response, status } = req.body;
    
    console.log('📝 Respond doubt request body:', { doubtId, response, status });
    
    if (!doubtId || !response) {
      console.log('❌ Missing required fields');
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }
    
    // Find the doubt
    const doubt = await Doubt.findById(doubtId);
    if (!doubt) {
      console.log('❌ Doubt not found');
      return res.status(404).json({ success: false, error: 'Doubt not found' });
    }
    
    // Check if teacher owns this doubt
    if (doubt.teacherId !== res.locals.teacher.id) {
      console.log('❌ Teacher does not own this doubt');
      return res.status(403).json({ success: false, error: 'Unauthorized to respond to this doubt' });
    }
    
    // Update doubt with response
    doubt.teacherResponse = response;
    doubt.responseDate = new Date();
    doubt.status = status || 'resolved';
    doubt.updatedAt = new Date();
    
    console.log('📚 Updating doubt with response:', doubt);
    
    await doubt.save();
    console.log('✅ Doubt response saved successfully');
    
    console.log('=== RESPOND DOUBT REQUEST SUCCESS ===');
    res.json({
      success: true,
      message: 'Response submitted successfully'
    });
    
  } catch (err) {
    console.error('❌ Error responding to doubt:', err);
    console.error('❌ Error stack:', err.stack);
    res.status(500).json({ success: false, error: 'Server error while responding to doubt' });
  }
});

// GET route for students to ask doubts (simple form)
app.get('/ask-doubt-form', (req, res) => {
  console.log('=== ASK DOUBT FORM PAGE LOAD START ===');
  
  try {
    // For now, we'll create a simple form that doesn't require authentication
    // In a real app, you'd want to authenticate students
    res.render('ask-doubt-form', { 
      timestamp: Date.now()
    });
    console.log('=== ASK DOUBT FORM PAGE LOAD SUCCESS ===');
  } catch (err) {
    console.error('❌ Error loading ask doubt form:', err);
    res.status(500).render('error', { message: 'Server error' });
  }
});

// Start server
const PORT = process.env.PORT || 8000;
app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));
