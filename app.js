const express= require('express')
const axios= require('axios')
const dotenv= require('dotenv')
const app = express()
app.set('view engine', 'ejs')
app.get('/', (req, res) => {
    res.render('dash')
})
app.get('/class', (req, res) => {
    res.render('class')
})
app.get("/browse", async (req, res) => {
  const query = req.query.q || "educational"; // Default search term
  const API_KEY = "AIzaSyBGki6h-QZipjIDVEllmT1Wd1DMq1qoOv8";

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

    const videos = response.data.items.map((v) => ({
      title: v.snippet.title,
      channel: v.snippet.channelTitle,
      thumbnail: v.snippet.thumbnails.medium.url,
      videoId: v.id.videoId,
    }));

    res.render("yt", { videos, query });
  } catch (err) {
    console.error(err.message);
    res.render("yt", { videos: [], query, error: "Failed to fetch YouTube data" });
  }
});
app.listen(3000, () => {
    console.log('Server is running on port 3000')   
}  )