// db.js
// Super simple file-based "database". No SQL, no external DB server —
// just reads/writes a JSON file on disk.

const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data', 'db.json');

function ensureDbFile() {
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({ rooms: {} }, null, 2));
  }
}

function readDb() {
  ensureDbFile();
  const raw = fs.readFileSync(DB_PATH, 'utf-8');
  return JSON.parse(raw);
}

function writeDb(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

function getRoom(db, roomId) {
  if (!db.rooms[roomId]) {
    db.rooms[roomId] = { entries: [] };
  }
  return db.rooms[roomId];
}

module.exports = { readDb, writeDb, getRoom };