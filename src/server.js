// src/server.js
import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { 
  getOrCreateRoom, 
  addEntry, 
  rateEntry, 
  getLeaderboard,
  getUserStats 
} from './firestore.js';
import { doc, getDoc, getDocs, collection } from 'firebase/firestore';
import { db } from './firebase.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5500;

// Middleware
app.use(express.json());
app.use(express.static(join(__dirname, '../public')));

// API Routes
app.post('/api/rooms', async (req, res) => {
  try {
    const { name, code, password } = req.body;
    const result = await getOrCreateRoom(code, password, name);
    res.json({ success: true, code, ...result });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/rooms/:room/entries', async (req, res) => {
  try {
    const { room } = req.params;
    const entriesSnapshot = await getDocs(collection(db, 'rooms', room, 'entries'));
    const entries = entriesSnapshot.docs.map(d => d.data());
    res.json(entries);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/rooms/:room/entries', async (req, res) => {
  try {
    const { room } = req.params;
    const { name, content, tag, channel } = req.body;
    const entry = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
      name,
      content,
      tag: tag || 'other',
      channel: channel || 'general',
      createdAt: Date.now(),
      ratings: {}
    };
    await addEntry(room, entry);
    res.json(entry);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/rooms/:room/entries/:id/rate', async (req, res) => {
  try {
    const { room, id } = req.params;
    const { rater, score } = req.body;
    await rateEntry(room, id, rater, score);
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/rooms/:room/leaderboard', async (req, res) => {
  try {
    const { room } = req.params;
    const leaderboard = await getLeaderboard(room);
    res.json(leaderboard);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/rooms/:room/history', async (req, res) => {
  try {
    const { room } = req.params;
    const roomRef = doc(db, 'rooms', room);
    const roomDoc = await getDoc(roomRef);
    if (!roomDoc.exists()) {
      res.json({ weeks: [] });
    } else {
      res.json({ weeks: roomDoc.data().history || [] });
    }
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/rooms/:room/stats/:name', async (req, res) => {
  try {
    const { room, name } = req.params;
    const stats = await getUserStats(room, name);
    res.json(stats);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Serve the main HTML for all other routes (catch-all)
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, '../public/index.html'));
});

// Single server start with error handling
const server = app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    const newPort = PORT + 1;
    console.log(`❌ Port ${PORT} is busy, trying ${newPort}...`);
    app.listen(newPort, () => {
      console.log(`✅ Server running on http://localhost:${newPort}`);
    });
  } else {
    console.error('Server error:', err);
  }
});