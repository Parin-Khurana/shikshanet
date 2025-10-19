const express = require('express');
const axios = require('axios');
const path = require('path');
const dotenv = require('dotenv');
const Teacher = require('./models/teacher');
const jwt = require('jsonwebtoken');


const cookieParser = require('cookie-parser')
const mongoose = require('mongoose');
const teacher = require('./models/teacher');
dotenv.config();
const JWT_SECRET = "rishik@123";
const app = express();


// Set view engine and static folder
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));
// For all routes, check if JWT exists
// This must be above any route
 const auth =(req, res, next) => {
  const token = req.cookies.token;
  if (!token) {
    res.locals.teacher = null;
    res.redirect('/login');
    ;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    res.locals.teacher = decoded; // now teacher.name is available
  } catch (err) {
    res.locals.teacher = null;
    res.redirect('/login');
    ;
  }
  next();
};

app.get('/dash', auth, (req, res) => {
    if (!res.locals.teacher) {
        return res.redirect('/login');
    } else {   
        console.log('Teacher in locals:', res.locals.teacher); 
    
    return res.render('dash', { teacher: res.locals.teacher})
    } })  
// Routes
app.get('/',auth, (req, res) => {
    res.render('dash'); // your main dashboard page
});
mongoose.connect("mongodb+srv://rishikgoyal:rishikgoyal@cluster0.msvexze.mongodb.net/teachersDB")
  .then(() => console.log('✅ Connected to MongoDB Atlas'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

app.get('/class',auth, (req, res) => {
  
  console.log('Teacher in locals for classes:', res.locals.teacher.sections[0]);
  res.render('class', {
    teacher: res.locals.teacher
  });
});


app.get('/login', (req, res) => {
  res.render('login', { error: null });
});
app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const teacher = await Teacher.findOne({ email });
    if (!teacher) return res.render('login', { error: 'User not found' });

    if (teacher.password !== password)
      return res.render('login', { error: 'Invalid password' });

    // ✅ Include name and email in JWT payload
    const token = jwt.sign(
      { id: teacher._id, username: teacher.username, email: teacher.email,sections: teacher.sections }, // <-- added name
      JWT_SECRET,
      { expiresIn: '2h' }
    );

    // Store token in cookie
    res.cookie('token', token, { httpOnly: true });
    res.redirect('/dash');
  } catch (err) {
    console.error(err);
    res.render('login', { error: 'Server error' });
  }
});
app.get('/test',auth, (req, res) => {
    res.render('test');
});

app.get('/logout', (req, res) => {
    res.clearCookie('token');
    res.redirect('/login');
});
// Browse route — fetch YouTube videos
app.get("/browse",auth, async (req, res) => {
    const query = req.query.q || "educational";
    const API_KEY = process.env.YOUTUBE_API_KEY || "AIzaSyBGki6h-QZipjIDVEllmT1Wd1DMq1qoOv8";

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
        videoId: videoId,
        downloadUrl: `https://ytmp4.biz/convert/?query=https://www.youtube.com/watch?v=${videoId}` // reliable prefill
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
