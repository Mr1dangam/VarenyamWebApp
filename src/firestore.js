// src/firestore.js
import { db } from './firebase.js';
import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  arrayUnion, 
  arrayRemove,
  getDocs,
  collection,
  query,
  where,
  increment,
  runTransaction
} from 'firebase/firestore';

// Get or create a room
export async function getOrCreateRoom(roomCode, password, userName) {
  const roomRef = doc(db, 'rooms', roomCode);
  const roomDoc = await getDoc(roomRef);
  
  if (roomDoc.exists()) {
    // Room exists, verify password
    const roomData = roomDoc.data();
    if (roomData.password && roomData.password !== password) {
      throw new Error('Incorrect password');
    }
    return { isNew: false, roomData };
  } else {
    // Create new room
    await setDoc(roomRef, {
      password: password || '',
      createdBy: userName,
      createdAt: Date.now(),
      history: [],
      participants: [userName]
    });
    return { isNew: true };
  }
}

// Add an entry to a room
export async function addEntry(roomCode, entry) {
  const entryRef = doc(db, 'rooms', roomCode, 'entries', entry.id);
  await setDoc(entryRef, entry);
  return entry;
}

// Rate an entry
export async function rateEntry(roomCode, entryId, rater, score) {
  const entryRef = doc(db, 'rooms', roomCode, 'entries', entryId);
  
  await runTransaction(db, async (transaction) => {
    const entryDoc = await transaction.get(entryRef);
    if (!entryDoc.exists()) {
      throw new Error('Entry not found');
    }
    
    const entryData = entryDoc.data();
    const ratings = entryData.ratings || {};
    
    // Check if user already rated
    if (ratings[rater]) {
      throw new Error('You have already rated this entry');
    }
    
    // Update ratings
    ratings[rater] = score;
    transaction.update(entryRef, { ratings });
  });
}

// Get leaderboard for a room
export async function getLeaderboard(roomCode) {
  const entriesSnapshot = await getDocs(collection(db, 'rooms', roomCode, 'entries'));
  const entries = entriesSnapshot.docs.map(doc => doc.data());
  
  // Calculate average ratings per user
  const userScores = {};
  entries.forEach(entry => {
    const ratings = entry.ratings || {};
    const ratingValues = Object.values(ratings);
    if (ratingValues.length > 0) {
      const avg = ratingValues.reduce((a, b) => a + b, 0) / ratingValues.length;
      if (!userScores[entry.name]) {
        userScores[entry.name] = { total: 0, count: 0, entries: [] };
      }
      userScores[entry.name].total += avg;
      userScores[entry.name].count += 1;
      userScores[entry.name].entries.push(entry);
    }
  });
  
  // Calculate final scores
  const leaderboard = Object.keys(userScores).map(name => ({
    name,
    averageScore: userScores[name].total / userScores[name].count,
    totalEntries: userScores[name].count,
    entries: userScores[name].entries
  }));
  
  // Sort by average score descending
  return leaderboard.sort((a, b) => b.averageScore - a.averageScore);
}

// Get user statistics
export async function getUserStats(roomCode, userName) {
  const entriesSnapshot = await getDocs(collection(db, 'rooms', roomCode, 'entries'));
  const entries = entriesSnapshot.docs.map(doc => doc.data());
  
  // Filter entries by user
  const userEntries = entries.filter(entry => entry.name === userName);
  
  // Calculate average rating received
  let totalScore = 0;
  let ratingCount = 0;
  userEntries.forEach(entry => {
    const ratings = entry.ratings || {};
    const ratingValues = Object.values(ratings);
    if (ratingValues.length > 0) {
      const avg = ratingValues.reduce((a, b) => a + b, 0) / ratingValues.length;
      totalScore += avg;
      ratingCount += 1;
    }
  });
  
  return {
    userName,
    totalEntries: userEntries.length,
    averageRating: ratingCount > 0 ? totalScore / ratingCount : 0,
    entries: userEntries
  };
}