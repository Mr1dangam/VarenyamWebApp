// src/app.js
import { 
  db, 
  doc, getDoc, setDoc, updateDoc, 
  collection, query, orderBy, onSnapshot,
  addDoc, getDocs, deleteDoc, where 
} from './firebase.js';

console.log('Varenyam loading...');

const $ = id => document.getElementById(id);

const Storage = {
  get(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } },
  set(k, v){ try{ localStorage.setItem(k, v); }catch(e){} },
  remove(k){ try{ localStorage.removeItem(k); }catch(e){} }
};

let myName = Storage.get('v_name') || '';
let myRoom = Storage.get('v_room') || '';
let allEntries = [];
let selectedTag = 'study';
let currentChannel = 'general';
let leaderboardData = null;
let historyData = null;
let myStats = null;
let roomData = null;
let unsubscribeEntries = null;
let unsubscribeRoom = null;

const COLORS = ['#e50914','#8c0810','#b81d24','#3a3a3a','#565656','#6e7681','#d29922','#58a6ff'];

function slug(s){ return s.trim().toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9\-]/g,''); }
function esc(s){ return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function inits(n){ return n.trim().split(/\s+/).slice(0,2).map(w => w[0].toUpperCase()).join(''); }
function col(n){ let h=0; for(let i=0;i<n.length;i++) h=n.charCodeAt(i)+((h<<5)-h); return COLORS[Math.abs(h)%COLORS.length]; }
function fmtDate(ts){ const d=new Date(ts),now=new Date(); const t=d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}); if(d.toDateString()===now.toDateString()) return 'Today at '+t; return d.toLocaleDateString([],{month:'short',day:'numeric'})+' at '+t; }
function fmtRange(s,e){ const a=new Date(s),b=new Date(e-1); return a.toLocaleDateString([],{month:'short',day:'numeric'})+' - '+b.toLocaleDateString([],{month:'short',day:'numeric'}); }
function ago(ts){ const d=Date.now()-ts,m=Math.floor(d/60000); if(m<1)return'just now'; if(m<60)return m+'m ago'; const h=Math.floor(m/60); if(h<24)return h+'h ago'; return Math.floor(h/24)+'d ago'; }

// ============================================
// FIREBASE DATABASE FUNCTIONS
// ============================================

// Get or create a room
async function getOrCreateRoom(roomCode, password, userName) {
  const roomRef = doc(db, 'rooms', roomCode);
  const roomDoc = await getDoc(roomRef);
  
  if (!roomDoc.exists()) {
    // Create new room
    const now = Date.now();
    const weekStart = now - (now % (7 * 24 * 60 * 60 * 1000));
    await setDoc(roomRef, {
      password: password || '',
      createdAt: now,
      weekStart: weekStart,
      weekEnd: weekStart + (7 * 24 * 60 * 60 * 1000),
      members: [userName],
      history: []
    });
    
    // Add member document
    const memberRef = doc(db, 'rooms', roomCode, 'members', userName);
    await setDoc(memberRef, {
      name: userName,
      joinedAt: now
    });
    
    return { exists: false, data: (await getDoc(roomRef)).data() };
  } else {
    const data = roomDoc.data();
    // Check password
    if (data.password && data.password !== password) {
      throw new Error('Wrong password');
    }
    
    // Add user as member if not already
    const memberRef = doc(db, 'rooms', roomCode, 'members', userName);
    const memberDoc = await getDoc(memberRef);
    if (!memberDoc.exists()) {
      await setDoc(memberRef, {
        name: userName,
        joinedAt: Date.now()
      });
      // Update members array
      if (!data.members.includes(userName)) {
        data.members.push(userName);
        await updateDoc(roomRef, { members: data.members });
      }
    }
    
    return { exists: true, data: data };
  }
}

// Add an entry
async function addEntry(roomCode, entry) {
  const entryRef = doc(db, 'rooms', roomCode, 'entries', entry.id);
  await setDoc(entryRef, entry);
  return entry;
}

// Rate an entry
async function rateEntry(roomCode, entryId, rater, score) {
  const entryRef = doc(db, 'rooms', roomCode, 'entries', entryId);
  await updateDoc(entryRef, {
    [`ratings.${rater}`]: score
  });
}

// Get leaderboard
async function getLeaderboard(roomCode) {
  const roomRef = doc(db, 'rooms', roomCode);
  const roomDoc = await getDoc(roomRef);
  if (!roomDoc.exists()) {
    return { weekStart: Date.now(), weekEnd: Date.now() + (7 * 24 * 60 * 60 * 1000), leaderboard: [] };
  }
  
  const roomData = roomDoc.data();
  const now = Date.now();
  
  // Check if week has ended and calculate winner
  if (now > roomData.weekEnd && roomData.entries && roomData.entries.length > 0) {
    const entriesSnapshot = await getDocs(collection(db, 'rooms', roomCode, 'entries'));
    const entries = entriesSnapshot.docs.map(d => d.data());
    
    const scores = {};
    entries.forEach(e => {
      if (e.createdAt >= roomData.weekStart && e.createdAt < roomData.weekEnd) {
        const ratings = Object.values(e.ratings || {});
        if (ratings.length) {
          scores[e.name] = (scores[e.name] || 0) + ratings.reduce((a, b) => a + b, 0);
        }
      }
    });
    
    const winner = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
    if (winner) {
      const history = roomData.history || [];
      history.push({
        weekStart: roomData.weekStart,
        weekEnd: roomData.weekEnd,
        winner: { name: winner[0], points: winner[1] }
      });
      
      const newWeekStart = roomData.weekEnd;
      const newWeekEnd = newWeekStart + (7 * 24 * 60 * 60 * 1000);
      
      await updateDoc(roomRef, {
        weekStart: newWeekStart,
        weekEnd: newWeekEnd,
        history: history
      });
    }
  }
  
  // Get current leaderboard
  const updatedRoom = await getDoc(roomRef);
  const updatedData = updatedRoom.data();
  const entriesSnapshot = await getDocs(collection(db, 'rooms', roomCode, 'entries'));
  const entries = entriesSnapshot.docs.map(d => d.data());
  
  const scores = {};
  const ratingCounts = {};
  entries.forEach(e => {
    if (e.createdAt >= updatedData.weekStart && e.createdAt < updatedData.weekEnd) {
      const ratings = Object.values(e.ratings || {});
      if (ratings.length) {
        scores[e.name] = (scores[e.name] || 0) + ratings.reduce((a, b) => a + b, 0);
        ratingCounts[e.name] = (ratingCounts[e.name] || 0) + ratings.length;
      }
    }
  });
  
  // Calculate streaks
  const streaks = {};
  const members = updatedData.members || [];
  for (const member of members) {
    const memberEntries = entries.filter(e => e.name === member).sort((a, b) => b.createdAt - a.createdAt);
    let streak = 0;
    let date = new Date();
    date.setHours(0, 0, 0, 0);
    for (let i = 0; i < 30; i++) {
      const dayStart = date.getTime();
      const dayEnd = dayStart + 24 * 60 * 60 * 1000;
      if (memberEntries.some(e => e.createdAt >= dayStart && e.createdAt < dayEnd)) {
        streak++;
        date.setDate(date.getDate() - 1);
      } else {
        break;
      }
    }
    streaks[member] = streak;
  }
  
  const leaderboard = Object.entries(scores).map(([name, points]) => ({
    name,
    points,
    ratings: ratingCounts[name] || 0,
    streak: streaks[name] || 0
  })).sort((a, b) => b.points - a.points);
  
  return {
    weekStart: updatedData.weekStart,
    weekEnd: updatedData.weekEnd,
    leaderboard: leaderboard
  };
}

// Get user stats
async function getUserStats(roomCode, userName) {
  const entriesSnapshot = await getDocs(collection(db, 'rooms', roomCode, 'entries'));
  const entries = entriesSnapshot.docs.map(d => d.data());
  
  const userEntries = entries.filter(e => e.name === userName);
  const allRatings = userEntries.flatMap(e => Object.values(e.ratings || {}));
  const ratingsGiven = entries.filter(e => e.ratings && e.ratings[userName]).length;
  
  // Calculate streak
  let streak = 0;
  let date = new Date();
  date.setHours(0, 0, 0, 0);
  for (let i = 0; i < 30; i++) {
    const dayStart = date.getTime();
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;
    if (userEntries.some(e => e.createdAt >= dayStart && e.createdAt < dayEnd)) {
      streak++;
      date.setDate(date.getDate() - 1);
    } else {
      break;
    }
  }
  
  return {
    entries: userEntries,
    entriesCount: userEntries.length,
    totalPoints: allRatings.reduce((a, b) => a + b, 0),
    avgRating: allRatings.length ? (allRatings.reduce((a, b) => a + b, 0) / allRatings.length).toFixed(1) : null,
    streak: streak,
    ratingsGivenCount: ratingsGiven
  };
}

// Setup real-time listeners
function setupListeners(roomCode, callbacks) {
  // Listen for entries changes
  if (unsubscribeEntries) unsubscribeEntries();
  const entriesQuery = query(
    collection(db, 'rooms', roomCode, 'entries'),
    orderBy('createdAt', 'desc')
  );
  
  unsubscribeEntries = onSnapshot(entriesQuery, (snapshot) => {
    const entries = snapshot.docs.map(d => d.data());
    allEntries = entries;
    console.log('Entries updated:', entries.length);
    if (callbacks.onEntriesUpdate) callbacks.onEntriesUpdate(entries);
  }, (error) => {
    console.error('Entries listener error:', error);
  });
  
  // Listen for room data changes
  if (unsubscribeRoom) unsubscribeRoom();
  const roomRef = doc(db, 'rooms', roomCode);
  unsubscribeRoom = onSnapshot(roomRef, (doc) => {
    if (doc.exists()) {
      roomData = doc.data();
      console.log('Room data updated');
      if (callbacks.onRoomUpdate) callbacks.onRoomUpdate(roomData);
    }
  }, (error) => {
    console.error('Room listener error:', error);
  });
  
  return { unsubscribeEntries, unsubscribeRoom };
}

// Cleanup listeners
function cleanupListeners() {
  if (unsubscribeEntries) {
    unsubscribeEntries();
    unsubscribeEntries = null;
  }
  if (unsubscribeRoom) {
    unsubscribeRoom();
    unsubscribeRoom = null;
  }
}

// Toast
function toast(msg, type){
  type = type || 'info';
  const el = document.createElement('div');
  el.className = 'toast-msg ' + (type === 'error' ? 'error' : type === 'success' ? 'success' : '');
  el.textContent = msg;
  $('toast').appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ============================================
// LOGIN
// ============================================
$('enterBtn').onclick = async function() {
  const name = $('nameInput').value.trim();
  const room = slug($('roomInput').value);
  const password = $('passwordInput').value;
  
  if(!name || !room){
    $('gateErr').textContent = 'Enter your name and a room code.';
    return;
  }
  
  this.disabled = true;
  this.textContent = 'Connecting...';
  $('gateErr').textContent = '';
  
  try {
    const result = await getOrCreateRoom(room, password, name);
    myName = name;
    myRoom = room;
    Storage.set('v_name', myName);
    Storage.set('v_room', myRoom);
    Storage.set('v_pass', password);
    enterApp();
  } catch(error) {
    $('gateErr').textContent = error.message || 'Failed to join room.';
    this.disabled = false;
    this.textContent = 'Enter Workspace';
  }
};

// Auto-login
if(myName && myRoom) {
  document.getElementById('nameInput').value = myName;
  document.getElementById('roomInput').value = myRoom;
  // Try to auto-login after a short delay
  setTimeout(() => {
    document.getElementById('enterBtn').click();
  }, 500);
}

// ============================================
// ENTER APP
// ============================================
function enterApp(){
  $('gate-screen').style.display = 'none';
  $('app').style.display = 'block';
  
  $('youName').textContent = myName;
  $('heroName').textContent = myName;
  $('youRoom').textContent = myRoom;
  $('topbarRoom').textContent = myRoom;
  $('chatRoomName').textContent = myRoom;
  $('chatRoomCode').textContent = myRoom;
  
  const av = $('youAvatar');
  av.style.background = col(myName);
  av.textContent = inits(myName);
  
  // Setup real-time listeners with callbacks
  setupListeners(myRoom, {
    onEntriesUpdate: function(entries) {
      allEntries = entries;
      const activePage = document.querySelector('.nav-item.active');
      if(!activePage) return;
      const page = activePage.dataset.page;
      if(page === 'you') renderProfile();
      else if(page === 'room') renderChat();
      else if(page === 'board') renderBoard();
      renderRightSidebar();
    },
    onRoomUpdate: function(data) {
      roomData = data;
      renderRightSidebar();
      if(document.querySelector('.nav-item.active')?.dataset.page === 'board') {
        renderBoard();
      }
    }
  });
  
  // Initial data load
  refreshAll().then(() => {
    showPage('you');
  });
}

// ============================================
// NAVIGATION
// ============================================
document.querySelectorAll('.nav-item').forEach(item => {
  item.onclick = function(){
    showPage(this.dataset.page);
  };
});

function showPage(name){
  document.querySelectorAll('.nav-item').forEach(i => {
    i.classList.toggle('active', i.dataset.page === name);
  });
  
  const pages = ['you', 'room', 'board'];
  pages.forEach(p => {
    const el = $('page-' + p);
    if(el) el.style.display = p === name ? 'block' : 'none';
  });
  
  if(name === 'you') renderProfile();
  else if(name === 'room') renderChat();
  else if(name === 'board') renderBoard();
}

// ============================================
// REFRESH
// ============================================
async function refreshAll() {
  console.log('Refreshing data...');
  try {
    const lb = await getLeaderboard(myRoom);
    leaderboardData = lb;
    myStats = await getUserStats(myRoom, myName);
    const roomRef = doc(db, 'rooms', myRoom);
    const roomDoc = await getDoc(roomRef);
    if(roomDoc.exists()) {
      roomData = roomDoc.data();
    }
    return true;
  } catch(e) {
    console.error('Refresh failed:', e);
    return false;
  }
}

// ============================================
// PROFILE
// ============================================
function renderProfile(){
  if(!myStats) return;
  
  $('youStatStrip').innerHTML = `
    <div class="stat-cell"><div class="num">${myStats.entriesCount}</div><div class="lbl">Posts</div></div>
    <div class="stat-cell accent"><div class="num">${myStats.streak}</div><div class="lbl">Streak</div></div>
    <div class="stat-cell"><div class="num">${myStats.totalPoints}</div><div class="lbl">Points</div></div>
    <div class="stat-cell"><div class="num">${myStats.avgRating || '--'}</div><div class="lbl">Avg Rating</div></div>
    <div class="stat-cell"><div class="num">${myStats.ratingsGivenCount}</div><div class="lbl">Given</div></div>
  `;
  
  $('heroStreak').textContent = myStats.streak;
  
  const lb = leaderboardData && leaderboardData.leaderboard ? leaderboardData.leaderboard : [];
  const rank = lb.findIndex(r => r.name === myName);
  $('heroRank').textContent = rank !== -1 ? '#' + (rank + 1) : '--';
  $('sideXP').textContent = myStats.totalPoints;
  $('sideRank').textContent = rank !== -1 ? '#' + (rank + 1) : '--';
  $('sideStreak').textContent = myStats.streak + ' Days';
  
  if(!myStats.entries || myStats.entries.length === 0){ 
    $('youTimeline').innerHTML = '<div class="empty">No posts yet. Head to Room to share your first update.</div>'; 
    return; 
  }
  
  $('youTimeline').innerHTML = myStats.entries.slice(0,10).map(e => {
    const ratings = Object.values(e.ratings || {}); 
    const avg = ratings.length ? (ratings.reduce((a,b) => a + b, 0) / ratings.length).toFixed(1) : null; 
    return `
      <div class="tl-row">
        <div class="tl-date">${fmtDate(e.createdAt)}</div>
        <div class="tl-body">
          <div class="tl-tag">${esc(e.tag || 'other')} · #${e.channel || 'general'}</div>
          <div class="tl-content">${esc(e.content)}</div>
          <div class="tl-rating">${avg ? 'Avg ' + avg + ' · ' + ratings.length + ' rating' + (ratings.length === 1 ? '' : 's') : 'Not rated yet'}</div>
        </div>
      </div>
    `;
  }).join('');
}

// ============================================
// CHAT
// ============================================
document.querySelectorAll('.channel-item').forEach(ch => {
  ch.onclick = function(){
    document.querySelectorAll('.channel-item').forEach(c => c.classList.remove('active'));
    this.classList.add('active');
    currentChannel = this.dataset.channel;
    $('currentChannel').textContent = currentChannel;
    renderChat();
  };
});

document.querySelectorAll('#tagPicker .tag-pill').forEach(p => {
  p.onclick = function(){
    document.querySelectorAll('#tagPicker .tag-pill').forEach(x => x.classList.remove('chosen'));
    this.classList.add('chosen');
    selectedTag = this.dataset.tag;
  };
});

$('postBtn').onclick = async function() {
  const text = $('entryText').value.trim();
  if(!text){
    $('postErr').textContent = 'Write something first.';
    return;
  }
  
  this.disabled = true;
  $('postErr').textContent = '';
  
  const entry = {
    id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
    name: myName,
    content: text,
    tag: selectedTag,
    channel: currentChannel,
    createdAt: Date.now(),
    ratings: {}
  };
  
  try {
    await addEntry(myRoom, entry);
    $('entryText').value = '';
    toast('Posted to #' + currentChannel, 'success');
    // Chat will update via listener
  } catch(e) {
    console.error('Post error:', e);
    $('postErr').textContent = 'Failed to post: ' + e.message;
  } finally {
    this.disabled = false;
  }
};

$('entryText').onkeydown = function(e){ 
  if(e.key === 'Enter' && !e.shiftKey){ 
    e.preventDefault(); 
    $('postBtn').click(); 
  } 
};

function renderChat(){
  const channelEntries = allEntries.filter(e => (e.channel || 'general') === currentChannel);
  
  if(channelEntries.length === 0){ 
    $('chatMessages').innerHTML = `
      <div class="empty" style="margin:auto;padding:40px;">
        <div style="font-size:16px;font-weight:600;margin-bottom:8px;">No messages in #${currentChannel}</div>
        <div>Be the first to share something.</div>
      </div>
    `; 
    return; 
  }
  
  $('chatMessages').innerHTML = channelEntries.map(e => {
    const ratings = e.ratings || {}; 
    const ratingValues = Object.values(ratings); 
    const avg = ratingValues.length ? (ratingValues.reduce((a,b) => a + b, 0) / ratingValues.length).toFixed(1) : null; 
    const myRating = ratings[myName]; 
    const isMine = e.name === myName;
    
    let ratingHTML = '';
    if(isMine){ 
      ratingHTML = '<span class="rate-label">Your post</span>'; 
    } else { 
      ratingHTML = '<span class="rate-label">Rate:</span>'; 
      for(let i = 1; i <= 5; i++) {
        ratingHTML += `<button class="pt-btn ${myRating === i ? 'chosen' : ''}" data-rate="${e.id}" data-score="${i}">${i}</button>`;
      }
    }
    
    return `
      <div class="chat-msg">
        <div class="chat-msg-avatar" style="background:${col(e.name)}">${inits(e.name)}</div>
        <div class="chat-msg-body">
          <div class="chat-msg-head">
            <span class="chat-msg-name">${esc(e.name)}</span>
            <span class="chat-msg-time">${ago(e.createdAt)}</span>
            <span class="chat-msg-tag">${esc(e.tag || 'other')}</span>
          </div>
          <div class="chat-msg-text">${esc(e.content)}</div>
          <div class="chat-msg-rating">
            ${ratingHTML}
            <div class="avg-badge">${avg ? 'Avg ' + avg + ' · ' + ratingValues.length + ' rating' + (ratingValues.length === 1 ? '' : 's') : 'No ratings yet'}</div>
          </div>
        </div>
      </div>
    `;
  }).join('');
  
  $('chatMessages').scrollTop = $('chatMessages').scrollHeight;
}

// Event delegation for ratings
$('chatMessages').addEventListener('click', function(e){
  const btn = e.target.closest('[data-rate]');
  if(!btn) return;
  const id = btn.dataset.rate; 
  const score = parseInt(btn.dataset.score);
  btn.disabled = true;
  
  rateEntry(myRoom, id, myName, score)
    .then(() => {
      toast('Rated ' + score + '/5', 'success');
    })
    .catch(() => {
      toast('Could not submit rating', 'error');
    })
    .finally(() => {
      btn.disabled = false;
    });
});

// ============================================
// RIGHT SIDEBAR
// ============================================
function renderRightSidebar(){
  if(!roomData) return;
  
  const members = roomData.members || []; 
  const today = new Date(); 
  today.setHours(0,0,0,0); 
  const todayPosts = allEntries.filter(e => e.createdAt >= today.getTime()).length; 
  const totalRatings = allEntries.reduce((sum, e) => sum + Object.values(e.ratings || {}).length, 0);
  
  $('memberList').innerHTML = members.map(name => { 
    const active = allEntries.some(e => e.name === name && e.createdAt >= today.getTime()); 
    return `<div class="member-item"><span class="member-status ${active ? 'online' : ''}"></span><span>${esc(name)}</span></div>`; 
  }).join('');
  
  $('statMembers').textContent = members.length; 
  $('statPosts').textContent = todayPosts; 
  $('statRatings').textContent = totalRatings;
  
  const champion = leaderboardData && leaderboardData.leaderboard ? leaderboardData.leaderboard[0] : null;
  if(champion){ 
    $('championCard').innerHTML = `
      <div class="champion-card">
        <div class="champion-avatar" style="background:${col(champion.name)};color:white;">${inits(champion.name)}</div>
        <div>
          <h4>${esc(champion.name)}</h4>
          <p>${champion.points} XP</p>
        </div>
      </div>
    `; 
  } else { 
    $('championCard').innerHTML = '<div class="empty" style="padding:16px;font-size:13px;">No ratings yet this week</div>'; 
  }
}

// ============================================
// LEADERBOARD
// ============================================
function renderBoard(){
  if(!leaderboardData) return;
  
  $('currentWeekRange').textContent = fmtRange(leaderboardData.weekStart, leaderboardData.weekEnd);
  
  const now = Date.now();
  const remaining = leaderboardData.weekEnd - now;
  if(remaining > 0) {
    const days = Math.floor(remaining / (24 * 60 * 60 * 1000));
    const hours = Math.floor((remaining % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    $('countdown').textContent = days + 'd ' + hours + 'h left';
  } else {
    $('countdown').textContent = 'Week ended!';
  }
  
  const lb = leaderboardData.leaderboard || [];
  
  // Podium
  if(lb.length >= 3){ 
    $('podium').innerHTML = `
      <div class="podium-card second">
        <div class="podium-rank">#2</div>
        <div class="podium-name">${esc(lb[1].name)}</div>
        <div class="podium-score">${lb[1].points} XP</div>
      </div>
      <div class="podium-card first">
        <div class="podium-rank">#1</div>
        <div class="podium-name">${esc(lb[0].name)}</div>
        <div class="podium-score">${lb[0].points} XP</div>
      </div>
      <div class="podium-card third">
        <div class="podium-rank">#3</div>
        <div class="podium-name">${esc(lb[2].name)}</div>
        <div class="podium-score">${lb[2].points} XP</div>
      </div>
    `; 
  } else if(lb.length > 0){ 
    $('podium').innerHTML = lb.slice(0,3).map((x, i) => `
      <div class="podium-card ${i === 0 ? 'first' : i === 1 ? 'second' : 'third'}">
        <div class="podium-rank">#${i + 1}</div>
        <div class="podium-name">${esc(x.name)}</div>
        <div class="podium-score">${x.points} XP</div>
      </div>
    `).join(''); 
  } else { 
    $('podium').innerHTML = '<div class="empty" style="grid-column:span 3;">No ratings yet this week. Start posting and rating.</div>'; 
  }
  
  // Rest of leaderboard
  const rest = lb.slice(3);
  $('currentRankList').innerHTML = rest.length === 0 && lb.length <= 3 ? '' : rest.map((x, i) => `
    <div class="rank-row">
      <div class="rank-num">${i + 4}</div>
      <div style="flex:1;">
        <div class="rank-name">${esc(x.name)}</div>
        <div class="rank-meta">${x.ratings} rating${x.ratings === 1 ? '' : 's'}${x.streak > 1 ? ' · ' + x.streak + ' day streak' : ''}</div>
      </div>
      <div class="rank-points">${x.points} XP</div>
    </div>
  `).join('');
  
  // History
  const history = historyData && historyData.weeks ? historyData.weeks : [];
  if(history.length === 0) { 
    $('historyList').innerHTML = '<div class="empty">No completed weeks yet. Check back next week.</div>'; 
  } else { 
    $('historyList').innerHTML = history.slice().reverse().map(x => `
      <div class="history-row">
        <div class="history-range">${fmtRange(x.weekStart, x.weekEnd)}</div>
        <div class="history-winner">${esc(x.winner.name)}</div>
        <div class="history-points">${x.winner.points} XP</div>
      </div>
    `).join(''); 
  }
}

// ============================================
// INVITE
// ============================================
$('inviteBtn').onclick = function(){ 
  if(navigator.clipboard) {
    navigator.clipboard.writeText('Join my Varenyam room: ' + myRoom)
      .then(() => toast('Invite copied'))
      .catch(() => toast('Could not copy', 'error'));
  } else {
    toast('Copy this: ' + myRoom, 'info');
  }
};

console.log('Varenyam loaded successfully with Firebase!');

// Export for server.js (if needed)
export { 
  getOrCreateRoom, 
  addEntry, 
  rateEntry, 
  getLeaderboard, 
  getUserStats,
  setupListeners,
  cleanupListeners
};