const express = require('express');
const axios = require('axios');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const app = express();

// Set view engine and static folder
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.get('/', (req, res) => {
    res.render('dash'); // your main dashboard page
});

app.get('/class', (req, res) => {
    res.render('class');
});

// Browse route — fetch YouTube videos
app.get("/browse", async (req, res) => {
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
