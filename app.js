/* ═══════════════════════════════════════════════════════════
   HABIT TRACKER — Premium Dashboard Engine
   ═══════════════════════════════════════════════════════════ */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";


// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDnb0zCDablR3GE70_2HpsKUwRz9YJdcVI",
  authDomain: "habittracker-83527.firebaseapp.com",
  projectId: "habittracker-83527",
  storageBucket: "habittracker-83527.firebasestorage.app",
  messagingSenderId: "418787353250",
  appId: "1:418787353250:web:b81138b1da034d3c53edfb"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

const auth = getAuth(app);
const db = getFirestore(app);
let currentUser = null;


// ─── Constants ───
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const WEEK_COLORS = ['#AEE7F5', '#B8F1C2', '#F9C2D8', '#F7C46C', '#C9D67A'];
const WEEK_COLORS_DARK = ['#7dcde6', '#7be08f', '#f08db8', '#e9a52e', '#a8b84e'];
const WEEK_CLASSES = ['w1', 'w2', 'w3', 'w4', 'w5'];

const DEFAULT_HABITS = [
  'Hydrate with 2.5L water',
  'Workout',
  'Sleep 8 Hours',
  'Eat Fruits',
  'Meditation',
  'Read 20 Pages',
  'Focused Work',
  'Daily Walk',
  'Digital Detox',
  'Stretching',
  'Journal',
  'Practice Coding',
  'Morning Routine',
  'Night Routine'
];

const DEFAULT_WEEKLY_HABITS = [
  ['Meal planning', 'Schedule workouts', 'Weekly To-do list'],
  ['Try new recipes', 'Declutter a space', 'Creative time'],
  ['Gratitude Journal', 'Learn new skills'],
  ['Tech-free evenings', 'Set Monthly goals'],
  ['Home cleaning']
];

const STORAGE_KEY = 'habitTracker_v2';

// ─── State ───
let state = {
  month: new Date().getMonth(),     // 0-indexed
  year: new Date().getFullYear(),
  habits: [],
  weeklyHabits: [],
  theme: 'default',
  data: {}   // keyed by "YYYY-M"
};

// ═══════════════════════════════════════════════════════════
// CALENDAR UTILITIES
// ═══════════════════════════════════════════════════════════

function getDaysInMonth(month, year) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(month, year) {
  return new Date(year, month, 1).getDay(); // 0=Sun
}

function getWeekIndex(day) {
  return Math.floor((day - 1) / 7); // 0-4
}

function getWeekDays(weekIndex, daysInMonth) {
  const start = weekIndex * 7 + 1;
  const end = Math.min((weekIndex + 1) * 7, daysInMonth);
  if (start > daysInMonth) return [];
  const days = [];
  for (let d = start; d <= end; d++) days.push(d);
  return days;
}

function getWeekCount(daysInMonth) {
  return Math.ceil(daysInMonth / 7);
}

function monthKey(month, year) {
  return `${year}-${month}`;
}

// ═══════════════════════════════════════════════════════════
// DATA MANAGEMENT
// ═══════════════════════════════════════════════════════════

function resetState() {
  state = {
    month: new Date().getMonth(),
    year: new Date().getFullYear(),
    habits: DEFAULT_HABITS.map((name, i) => ({
      id: 'h_' + i + '_' + Date.now(),
      name,
      goal: ''
    })),
    weeklyHabits: DEFAULT_WEEKLY_HABITS.map(w => [...w]),
    theme: 'default',
    data: {}
  };
}

let unsubSnapshot = null;

function loadStateFromFirebase(uid) {
  return new Promise((resolve) => {
    try {
      const docRef = doc(db, 'users', uid);
      
      // Clear any previous listeners
      if (unsubSnapshot) unsubSnapshot();

      unsubSnapshot = onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists()) {
          const saved = docSnap.data();
          state.habits = saved.habits || [];
          state.weeklyHabits = saved.weeklyHabits || [];
          state.data = saved.data || {};
          state.theme = saved.theme || 'default';
          if (saved.month !== undefined) state.month = saved.month;
          if (saved.year !== undefined) state.year = saved.year;
          
          // Only re-render if the app has already initialized
          if (document.getElementById('habit-table-area').innerHTML !== '') {
            render();
            if (state.theme) applyTheme(state.theme);
          }
        } else {
          if (state.habits.length === 0) resetState();
        }
        resolve(); // Resolve promise on first load
      }, (error) => {
        console.error("Firebase listen error:", error);
        if (error.code === 'permission-denied') {
          alert("Permission Denied: Cannot read from Firebase. Check your Firestore Security Rules.");
        }
        resolve(); // Resolve anyway so app can load
      });
    } catch (e) {
      console.warn('Failed to load state from Firebase:', e);
      if (state.habits.length === 0) resetState();
      resolve();
    }
  });
}

async function saveState() {
  if (!currentUser) return;
  try {
    await setDoc(doc(db, 'users', currentUser.uid), {
      month: state.month,
      year: state.year,
      habits: state.habits,
      weeklyHabits: state.weeklyHabits,
      theme: state.theme,
      data: state.data
    });
  } catch (e) {
    console.error('Failed to save state to Firebase:', e);
    if (e.code === 'permission-denied') {
      alert("Permission Denied: Could not save to Firebase. Please go to your Firebase Console -> Firestore Database -> Rules, and set: allow read, write: if request.auth != null;");
    }
  }
}

function getMonthData() {
  const key = monthKey(state.month, state.year);
  if (!state.data[key]) {
    state.data[key] = { checks: {}, weeklyChecks: {}, notes: '' };
  }
  return state.data[key];
}

function isChecked(habitId, day) {
  const md = getMonthData();
  return !!(md.checks[habitId] && md.checks[habitId][day]);
}

function toggleCheck(habitId, day) {
  const md = getMonthData();
  if (!md.checks[habitId]) md.checks[habitId] = {};
  md.checks[habitId][day] = !md.checks[habitId][day];
  saveState();
}

function isWeeklyChecked(weekIndex, itemIndex) {
  const md = getMonthData();
  const key = `${weekIndex}-${itemIndex}`;
  return !!md.weeklyChecks[key];
}

function toggleWeeklyCheck(weekIndex, itemIndex) {
  const md = getMonthData();
  const key = `${weekIndex}-${itemIndex}`;
  md.weeklyChecks[key] = !md.weeklyChecks[key];
  saveState();
}

function getNotes() {
  return getMonthData().notes || '';
}

function setNotes(text) {
  getMonthData().notes = text;
  saveState();
}

// ═══════════════════════════════════════════════════════════
// CALCULATIONS
// ═══════════════════════════════════════════════════════════

function calcHabitCompleted(habit) {
  const dim = getDaysInMonth(state.month, state.year);
  let count = 0;
  for (let d = 1; d <= dim; d++) {
    if (isChecked(habit.id, d)) count++;
  }
  return count;
}

function calcTotalCompleted() {
  let total = 0;
  state.habits.forEach(h => { total += calcHabitCompleted(h); });
  return total;
}

function calcTotalPossible() {
  return state.habits.length * getDaysInMonth(state.month, state.year);
}

function calcOverallPct() {
  const possible = calcTotalPossible();
  if (possible === 0) return 0;
  return (calcTotalCompleted() / possible) * 100;
}

function calcDailyPct(day) {
  if (state.habits.length === 0) return 0;
  let count = 0;
  state.habits.forEach(h => { if (isChecked(h.id, day)) count++; });
  return (count / state.habits.length) * 100;
}

function calcWeeklyPct(weekIndex) {
  const dim = getDaysInMonth(state.month, state.year);
  const days = getWeekDays(weekIndex, dim);
  if (days.length === 0 || state.habits.length === 0) return 0;
  let total = 0, checked = 0;
  days.forEach(d => {
    state.habits.forEach(h => {
      total++;
      if (isChecked(h.id, d)) checked++;
    });
  });
  return total === 0 ? 0 : (checked / total) * 100;
}

function calcDayCompleted(day) {
  let count = 0;
  state.habits.forEach(h => { if (isChecked(h.id, day)) count++; });
  return count;
}

function calcDayIncomplete(day) {
  return state.habits.length - calcDayCompleted(day);
}

function calcWeeklyHabitsPct() {
  let total = 0, checked = 0;
  state.weeklyHabits.forEach((items, wi) => {
    items.forEach((_, ii) => {
      total++;
      if (isWeeklyChecked(wi, ii)) checked++;
    });
  });
  return total === 0 ? 0 : (checked / total) * 100;
}

function calcWeeklyHabitsCompleted() {
  let checked = 0;
  state.weeklyHabits.forEach((items, wi) => {
    items.forEach((_, ii) => {
      if (isWeeklyChecked(wi, ii)) checked++;
    });
  });
  return checked;
}

function calcWeekColumnPct(weekIndex) {
  const items = state.weeklyHabits[weekIndex] || [];
  if (items.length === 0) return 0;
  let count = 0;
  items.forEach((_, i) => { if (isWeeklyChecked(weekIndex, i)) count++; });
  return (count / items.length) * 100;
}

function calcWeeklyHabitsTotal() {
  let total = 0;
  state.weeklyHabits.forEach(items => total += items.length);
  return total;
}

function getProgressColor(pct) {
  if (pct >= 90) return 'pbar-green';
  if (pct >= 70) return 'pbar-blue';
  if (pct >= 50) return 'pbar-orange';
  return 'pbar-pink';
}

// ═══════════════════════════════════════════════════════════
// RENDERING
// ═══════════════════════════════════════════════════════════

function render() {
  renderTable();
  renderDailyChart();
  renderOverallProgress();
  renderWeeklyProgress();
  renderWeeklyHabits();
  loadNotes();
}

function updateDashboard() {
  updateTableProgress();
  renderDailyChart();
  renderOverallProgress();
  renderWeeklyProgress();
}

// ─── Habit Table ───
function renderTable() {
  const dim = getDaysInMonth(state.month, state.year);
  const firstDay = getFirstDayOfWeek(state.month, state.year);
  const weekCount = getWeekCount(dim);

  let html = '<table class="habit-table">';

  // ── Header Row 1: Week headers ──
  html += '<thead>';
  html += '<tr>';
  html += `<th class="main-header-cell daily-habits-header habit-name-col" rowspan="3">
    DAILY HABITS
    <span class="days-sub">DAYS</span>
    <span class="days-count">${dim} / ${dim}</span>
  </th>`;

  for (let w = 0; w < weekCount; w++) {
    const days = getWeekDays(w, dim);
    html += `<th class="week-header ${WEEK_CLASSES[w]} day-col" colspan="${days.length}">WEEK ${w + 1}</th>`;
  }

  html += `<th class="progress-header progress-col" rowspan="3">
    <div class="progress-sidebar-header">Progress</div>
    <div class="progress-sidebar-subheader">Completed</div>
    <div class="progress-sidebar-total">${calcTotalCompleted()} / ${calcTotalPossible()}</div>
  </th>`;
  html += '</tr>';

  // ── Header Row 2: Weekday labels ──
  html += '<tr>';
  for (let d = 1; d <= dim; d++) {
    const dow = (firstDay + d - 1) % 7;
    const w = getWeekIndex(d);
    html += `<td class="weekday-cell ${WEEK_CLASSES[w]} day-col">${DAY_LABELS[dow]}</td>`;
  }
  html += '</tr>';

  // ── Header Row 3: Day numbers ──
  html += '<tr>';
  for (let d = 1; d <= dim; d++) {
    const w = getWeekIndex(d);
    html += `<td class="daynum-cell ${WEEK_CLASSES[w]} day-col">${d}</td>`;
  }
  html += '</tr>';
  html += '</thead>';

  // ── Body: Habit rows ──
  html += '<tbody>';
  state.habits.forEach((habit, hi) => {
    html += '<tr>';
    html += `<td class="habit-name-col">
      <div class="habit-name-wrap">
        <span class="habit-idx">${hi + 1}.</span>
        <span class="habit-name-text" data-idx="${hi}">${escHtml(habit.name)}</span>
        <input type="text" class="habit-name-input hidden" value="${escHtml(habit.name)}" data-idx="${hi}" placeholder="Habit name...">
      </div>
      <div class="habit-actions">
        <button class="habit-action-btn habit-edit" data-idx="${hi}" title="Edit habit">✎</button>
        <button class="habit-action-btn habit-delete" data-idx="${hi}" title="Remove habit">&times;</button>
      </div>
    </td>`;

    for (let d = 1; d <= dim; d++) {
      const w = getWeekIndex(d);
      const checked = isChecked(habit.id, d);
      html += `<td class="day-cell ${WEEK_CLASSES[w]}${checked ? ' checked' : ''} day-col"
        data-hid="${habit.id}" data-day="${d}">
        <div class="cb"></div>
      </td>`;
    }

    const completed = calcHabitCompleted(habit);
    const goal = dim;
    const pct = goal === 0 ? 0 : Math.min((completed / goal) * 100, 100);
    const colorClass = getProgressColor(pct);

    html += `<td class="progress-col">
      <div class="progress-item">
        <span class="progress-item-label">${completed} / ${goal}</span>
        <div class="progress-bar-wrap">
          <div class="progress-bar-fill ${colorClass}" style="width: ${pct}%"></div>
        </div>
      </div>
    </td>`;
    html += '</tr>';
  });

  // Add habit row
  html += '<tr class="add-habit-row">';
  html += `<td colspan="${dim + 2}"><button class="add-habit-btn" id="add-habit-btn">+ Add Habit</button></td>`;
  html += '</tr>';

  // Habits Completed row
  html += '<tr class="stats-row">';
  html += '<td class="habit-name-col stats-label-col">Habits Completed</td>';
  for (let d = 1; d <= dim; d++) {
    const w = getWeekIndex(d);
    html += `<td class="day-cell ${WEEK_CLASSES[w]} stats-val-col" id="stat-comp-${d}">${calcDayCompleted(d)}</td>`;
  }
  html += '<td class="progress-col"></td>';
  html += '</tr>';

  // Habits Incompleted row
  html += '<tr class="stats-row">';
  html += '<td class="habit-name-col stats-label-col">Habits Incompleted</td>';
  for (let d = 1; d <= dim; d++) {
    const w = getWeekIndex(d);
    html += `<td class="day-cell ${WEEK_CLASSES[w]} stats-val-col" id="stat-inc-${d}">${calcDayIncomplete(d)}</td>`;
  }
  html += '<td class="progress-col"></td>';
  html += '</tr>';

  html += '</tbody></table>';

  document.getElementById('habit-table-area').innerHTML = html;

  // Attach event listeners
  attachTableListeners();
}

function updateTableProgress() {
  const dim = getDaysInMonth(state.month, state.year);
  state.habits.forEach((habit, hi) => {
    const completed = calcHabitCompleted(habit);
    const goal = dim;
    const pct = goal === 0 ? 0 : Math.min((completed / goal) * 100, 100);
    const colorClass = getProgressColor(pct);

    // Find row
    const row = document.querySelector(`.habit-table tbody tr:nth-child(${hi + 1})`);
    if (row) {
      const label = row.querySelector('.progress-item-label');
      const fill = row.querySelector('.progress-bar-fill');
      if (label) label.textContent = `${completed} / ${goal}`;
      if (fill) {
        fill.className = `progress-bar-fill ${colorClass}`;
        fill.style.width = `${pct}%`;
      }
    }
  });

  // Update daily stats rows
  for (let d = 1; d <= dim; d++) {
    const compCell = document.getElementById(`stat-comp-${d}`);
    const incCell = document.getElementById(`stat-inc-${d}`);
    if (compCell) compCell.textContent = calcDayCompleted(d);
    if (incCell) incCell.textContent = calcDayIncomplete(d);
  }
}

function attachTableListeners() {
  // Checkbox clicks
  document.querySelectorAll('.day-cell').forEach(cell => {
    cell.addEventListener('click', () => {
      const hid = cell.dataset.hid;
      const day = parseInt(cell.dataset.day);
      toggleCheck(hid, day);
      cell.classList.toggle('checked');
      // Update everything else in-place smoothly
      updateDashboard();
    });
  });

  // Delete buttons
  document.querySelectorAll('.habit-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.idx);
      if (state.habits.length <= 1) return; // keep at least one
      if (confirm('Are you sure you want to delete this habit?')) {
        state.habits.splice(idx, 1);
        saveState();
        render();
      }
    });
  });


  // Habit name inputs & edits
  document.querySelectorAll('.habit-edit').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.idx);
      const col = btn.closest('.habit-name-col');
      const text = col.querySelector('.habit-name-text');
      const input = col.querySelector('.habit-name-input');
      text.classList.add('hidden');
      input.classList.remove('hidden');
      input.focus();
    });
  });

  document.querySelectorAll('.habit-name-input').forEach(input => {
    const handleSave = () => {
      const idx = parseInt(input.dataset.idx);
      const val = input.value.trim() || 'Unnamed Habit';
      if (state.habits[idx].name !== val) {
        state.habits[idx].name = val;
        saveState();
        render(); // Re-render to update UI and index properly
      } else {
        const col = input.closest('.habit-name-col');
        col.querySelector('.habit-name-text').classList.remove('hidden');
        input.classList.add('hidden');
      }
    };
    input.addEventListener('blur', handleSave);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleSave();
    });
  });

  // Add habit button
  const addBtn = document.getElementById('add-habit-btn');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      const name = prompt('Enter habit name:');
      if (name && name.trim()) {
        state.habits.push({
          id: 'h_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
          name: name.trim(),
          goal: ''
        });
        saveState();
        render();
      }
    });
  }
}


// ─── Daily Progress Chart ───
function renderDailyChart() {
  const canvas = document.getElementById('daily-chart');
  const container = canvas.parentElement;
  const dpr = window.devicePixelRatio || 1;

  canvas.width = container.clientWidth * dpr;
  canvas.height = container.clientHeight * dpr;

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const W = container.clientWidth;
  const H = container.clientHeight;
  const dim = getDaysInMonth(state.month, state.year);

  ctx.clearRect(0, 0, W, H);

  // Build daily data
  const data = [];
  for (let d = 1; d <= dim; d++) {
    data.push(calcDailyPct(d));
  }

  if (data.length < 2) return;

  const padX = 10;
  const padTop = 8;
  const padBottom = 4;
  const chartW = W - padX * 2;
  const chartH = H - padTop - padBottom;

  const style = getComputedStyle(document.body);
  const colorWeek1 = style.getPropertyValue('--week1').trim() || '#B8A9D4';
  const colorGrid = style.getPropertyValue('--border-light').trim() || '#ececec';

  // Grid lines (subtle)
  ctx.strokeStyle = colorGrid;
  ctx.lineWidth = 0.5;
  for (let i = 0; i <= 4; i++) {
    const y = padTop + (chartH * i) / 4;
    ctx.beginPath();
    ctx.moveTo(padX, y);
    ctx.lineTo(W - padX, y);
    ctx.stroke();
  }

  // Calculate points
  const points = data.map((val, i) => ({
    x: padX + (i / (data.length - 1)) * chartW,
    y: padTop + chartH - (val / 100) * chartH
  }));

  // Draw area fill with gradient
  const gradient = ctx.createLinearGradient(0, padTop, 0, H);
  gradient.addColorStop(0, `color-mix(in srgb, ${colorWeek1} 35%, transparent)`);
  gradient.addColorStop(1, `color-mix(in srgb, ${colorWeek1} 3%, transparent)`);

  ctx.beginPath();
  ctx.moveTo(points[0].x, padTop + chartH);
  ctx.lineTo(points[0].x, points[0].y);

  // Smooth curve through points
  for (let i = 0; i < points.length - 1; i++) {
    const xc = (points[i].x + points[i + 1].x) / 2;
    const yc = (points[i].y + points[i + 1].y) / 2;
    ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
  }
  ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
  ctx.lineTo(points[points.length - 1].x, padTop + chartH);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  // Draw smooth line on top
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 0; i < points.length - 1; i++) {
    const xc = (points[i].x + points[i + 1].x) / 2;
    const yc = (points[i].y + points[i + 1].y) / 2;
    ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
  }
  ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
  ctx.strokeStyle = colorWeek1;
  ctx.lineWidth = 2;
  ctx.stroke();
}

// ─── Overall Progress Circle ───
function renderOverallProgress() {
  const pct = calcOverallPct();
  const incompletePct = 100 - pct;

  document.getElementById('overall-incomplete-pct').textContent = incompletePct.toFixed(1) + '%';
  document.getElementById('overall-complete-pct').textContent = pct.toFixed(1) + '%';

  const size = 130;
  const r = 52;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - pct / 100);

  const container = document.getElementById('overall-progress-ring');
  const existingRing = container.querySelector('.progress-circle-ring');

  if (existingRing) {
    // Update in place
    existingRing.style.strokeDashoffset = offset;
    container.querySelector('text').textContent = Math.round(pct) + '%';
  } else {
    // Initial render
    const svg = `
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none"
          stroke="var(--border-light)" stroke-width="9"/>
        <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none"
          stroke="var(--week1)" stroke-width="9"
          stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"
          stroke-linecap="round"
          transform="rotate(-90 ${size / 2} ${size / 2})"
          class="progress-circle-ring"
          style="--circumference: ${circumference}; transition: stroke-dashoffset 0.6s ease"/>
        <text x="${size / 2}" y="${size / 2}" text-anchor="middle" dominant-baseline="central"
          font-family="'Calibri','Inter',sans-serif"
          font-size="28" font-weight="700" fill="var(--text-dark)">${Math.round(pct)}%</text>
      </svg>`;
    container.innerHTML = svg;
  }
}

// ─── Weekly Progress ───
function renderWeeklyProgress() {
  const dim = getDaysInMonth(state.month, state.year);
  const weekCount = getWeekCount(dim);

  const container = document.getElementById('weekly-circles');
  const hasExisting = container.querySelectorAll('.progress-circle-ring').length > 0;

  if (hasExisting) {
    for (let w = 0; w < 5; w++) {
      const days = getWeekDays(w, dim);
      const pct = days.length > 0 ? calcWeeklyPct(w) : 0;
      const hasData = days.length > 0;
      const circ = 2 * Math.PI * 32;
      const off = circ * (1 - pct / 100);

      const item = container.children[w];
      if (item) {
        const ring = item.querySelector('.progress-circle-ring');
        const text = item.querySelector('text');
        if (ring && hasData) {
          ring.style.strokeDashoffset = off;
          text.textContent = Math.round(pct) + '%';
        } else if (text && !hasData) {
          text.textContent = 'N/A';
        }
      }
    }
  } else {
    let circlesHtml = '';
    for (let w = 0; w < 5; w++) {
      const days = getWeekDays(w, dim);
      const pct = days.length > 0 ? calcWeeklyPct(w) : 0;
      const hasData = days.length > 0;
      const size = 80;
      const r = 32;
      const circ = 2 * Math.PI * r;
      const off = circ * (1 - pct / 100);

      circlesHtml += `<div class="weekly-circle-item">
        <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
          <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none"
            stroke="var(--border-light)" stroke-width="6"/>
          ${hasData ? `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none"
            stroke="var(--week${w + 1})" stroke-width="6"
            stroke-dasharray="${circ}" stroke-dashoffset="${off}"
            stroke-linecap="round"
            transform="rotate(-90 ${size / 2} ${size / 2})"
            class="progress-circle-ring"
            style="--circumference: ${circ}; transition: stroke-dashoffset 0.6s ease"/>` : ''}
          <text x="${size / 2}" y="${size / 2}" text-anchor="middle" dominant-baseline="central"
            font-family="'Calibri','Inter',sans-serif"
            font-size="16" font-weight="700" fill="var(--text-dark)">${hasData ? Math.round(pct) + '%' : 'N/A'}</text>
        </svg>
      </div>`;
    }
    container.innerHTML = circlesHtml;
  }

  // Stats table (removed from here, moved to main table for exact alignment)
  let statsHtml = '';
  document.getElementById('weekly-stats').innerHTML = statsHtml;

  document.getElementById('weekly-stats').innerHTML = statsHtml;
}

// ─── Weekly Habits Section ───
function renderWeeklyHabits() {
  const totalChecked = calcWeeklyHabitsCompleted();
  const totalItems = calcWeeklyHabitsTotal();
  const overallPct = calcWeeklyHabitsPct();
  const incompletePct = 100 - overallPct;

  // Summary (left side)
  const ringSize = 100;
  const ringR = 38;
  const ringCirc = 2 * Math.PI * ringR;
  const ringOff = ringCirc * (1 - overallPct / 100);

  let html = '<div class="wh-summary">';
  html += '<div class="wh-summary-title">WEEKLY HABITS</div>';
  html += '<div class="wh-summary-subtitle">COMPLETED</div>';
  html += `<div class="wh-summary-count">${totalChecked} / ${totalItems}</div>`;

  // Ring
  html += '<div class="wh-summary-ring">';
  html += `<svg width="${ringSize}" height="${ringSize}" viewBox="0 0 ${ringSize} ${ringSize}">
    <circle cx="${ringSize / 2}" cy="${ringSize / 2}" r="${ringR}" fill="none" stroke="var(--border-light)" stroke-width="7"/>
    <circle cx="${ringSize / 2}" cy="${ringSize / 2}" r="${ringR}" fill="none" stroke="var(--week1)" stroke-width="7"
      stroke-dasharray="${ringCirc}" stroke-dashoffset="${ringOff}"
      stroke-linecap="round" transform="rotate(-90 ${ringSize / 2} ${ringSize / 2})"
      class="progress-circle-ring"
      style="--circumference: ${ringCirc}; transition: stroke-dashoffset 0.6s ease"/>
    <text x="${ringSize / 2}" y="${ringSize / 2}" text-anchor="middle" dominant-baseline="central"
      font-family="'Calibri','Inter',sans-serif"
      font-size="20" font-weight="700" fill="var(--text-dark)">${Math.round(overallPct)}%</text>
  </svg>`;
  html += '</div>';

  html += `<div class="wh-summary-pcts">
    <span>${incompletePct.toFixed(1)}%</span>
    <span>${overallPct.toFixed(1)}%</span>
  </div>`;

  // Summary bar
  html += '<div class="wh-summary-bar-wrap">';
  html += `<span class="wh-summary-bar-pct">${Math.round(overallPct)}%</span>`;
  html += `<div class="wh-summary-bar"><div class="wh-summary-bar-fill" style="width:${overallPct}%"></div></div>`;
  html += '</div>';

  html += '</div>';

  // Grid (right side)
  html += '<div class="wh-grid">';
  for (let w = 0; w < 5; w++) {
    const items = state.weeklyHabits[w] || [];
    const colPct = calcWeekColumnPct(w);

    html += '<div class="wh-week-col">';
    html += `<div class="wh-week-title ${WEEK_CLASSES[w]}">WEEK ${w + 1}</div>`;
    html += `<div class="wh-items-container">`;

    items.forEach((item, ii) => {
      const checked = isWeeklyChecked(w, ii);
      html += `<div class="wh-item${checked ? ' checked' : ''}" data-week="${w}" data-item="${ii}">
        <div class="wh-checkbox"></div>
        <span class="wh-item-name" id="wh-name-${w}-${ii}">${escHtml(item)}</span>
        <input type="text" class="wh-item-input" id="wh-input-${w}-${ii}" value="${escHtml(item)}" style="display:none;" data-week="${w}" data-item="${ii}">
        <div class="wh-actions">
           <button class="wh-action-btn edit-wh-btn" data-week="${w}" data-item="${ii}" title="Edit">✎</button>
           <button class="wh-action-btn delete-wh-btn" data-week="${w}" data-item="${ii}" title="Delete">×</button>
        </div>
      </div>`;
    });

    html += `</div>`;
    html += `<button class="add-wh-btn" data-week="${w}">+ Add Item</button>`;

    // Completion bar
    html += '<div class="wh-week-bar">';
    html += `<div class="wh-bar-pct">${Math.round(colPct)}%</div>`;
    html += `<div class="wh-bar-track"><div class="wh-bar-fill ${WEEK_CLASSES[w]}" style="width:${colPct}%"></div></div>`;
    html += '</div>';

    html += '</div>';
  }
  html += '</div>';

  document.getElementById('weekly-habits-section').innerHTML = html;

  // Attach listeners for checkbox toggle
  document.querySelectorAll('.wh-checkbox, .wh-item-name').forEach(el => {
    el.addEventListener('click', (e) => {
      const item = e.target.closest('.wh-item');
      if (!item) return;
      const wi = parseInt(item.dataset.week);
      const ii = parseInt(item.dataset.item);
      if (isNaN(ii)) return;
      toggleWeeklyCheck(wi, ii);
      renderWeeklyHabits();
      renderWeeklyProgress();
      renderOverallProgress();
    });
  });

  // Attach listeners for edit/delete/add
  document.querySelectorAll('.edit-wh-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const w = parseInt(e.target.dataset.week);
      const i = parseInt(e.target.dataset.item);
      const nameEl = document.getElementById(`wh-name-${w}-${i}`);
      const inputEl = document.getElementById(`wh-input-${w}-${i}`);
      nameEl.style.display = 'none';
      inputEl.style.display = 'block';
      inputEl.focus();

      const finishEdit = () => {
        const val = inputEl.value.trim();
        if (val && val !== state.weeklyHabits[w][i]) {
          state.weeklyHabits[w][i] = val;
          saveState();
        }
        renderWeeklyHabits();
      };
      inputEl.addEventListener('blur', finishEdit, { once: true });
      inputEl.addEventListener('keydown', ev => {
        if (ev.key === 'Enter') finishEdit();
        if (ev.key === 'Escape') renderWeeklyHabits();
      });
    });
  });

  document.querySelectorAll('.delete-wh-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const w = parseInt(e.target.dataset.week);
      const i = parseInt(e.target.dataset.item);
      if (confirm('Delete this weekly habit?')) {
        state.weeklyHabits[w].splice(i, 1);
        saveState();
        renderWeeklyHabits();
        renderWeeklyProgress();
        renderOverallProgress();
      }
    });
  });

  document.querySelectorAll('.add-wh-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const w = parseInt(e.target.dataset.week);
      const name = prompt('Enter new weekly habit:');
      if (name && name.trim()) {
        state.weeklyHabits[w].push(name.trim());
        saveState();
        renderWeeklyHabits();
        renderWeeklyProgress();
        renderOverallProgress();
      }
    });
  });
}

// ─── Notes ───
function loadNotes() {
  document.getElementById('notes-textarea').value = getNotes();
}

// ═══════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════

function escHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ═══════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════

function initSelectors() {
  const monthSelect = document.getElementById('month-select');
  const yearSelect = document.getElementById('year-select');

  // Populate years (2024 – 2065)
  for (let y = 2024; y <= 2065; y++) {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y;
    yearSelect.appendChild(opt);
  }

  monthSelect.value = state.month;
  yearSelect.value = state.year;

  monthSelect.addEventListener('change', () => {
    state.month = parseInt(monthSelect.value);
    saveState();
    render();
  });

  yearSelect.addEventListener('change', () => {
    state.year = parseInt(yearSelect.value);
    saveState();
    render();
  });
}

const THEME_STICKERS = {
  default: "C:/Users/alfez/.gemini/antigravity-ide/brain/73ef4556-1d12-4d72-a723-587afc755e57/sticker_default_1786121955674.png",
  f1: "C:/Users/alfez/.gemini/antigravity-ide/brain/73ef4556-1d12-4d72-a723-587afc755e57/sticker_f1_1786121966820.png",
  spiderman: "C:/Users/alfez/.gemini/antigravity-ide/brain/73ef4556-1d12-4d72-a723-587afc755e57/sticker_spiderman_1786122043599.png",
  aesthetic: "C:/Users/alfez/.gemini/antigravity-ide/brain/73ef4556-1d12-4d72-a723-587afc755e57/sticker_aesthetic_1786121996479.png",
  cyberpunk: "C:/Users/alfez/.gemini/antigravity-ide/brain/73ef4556-1d12-4d72-a723-587afc755e57/sticker_cyberpunk_1786122010988.png",
  ocean: "C:/Users/alfez/.gemini/antigravity-ide/brain/73ef4556-1d12-4d72-a723-587afc755e57/sticker_ocean_1786122053674.png",
  forest: "C:/Users/alfez/.gemini/antigravity-ide/brain/73ef4556-1d12-4d72-a723-587afc755e57/sticker_forest_1786122064321.png",
  sunset: "C:/Users/alfez/.gemini/antigravity-ide/brain/73ef4556-1d12-4d72-a723-587afc755e57/sticker_sunset_1786122076462.png",
  retro: "C:/Users/alfez/.gemini/antigravity-ide/brain/73ef4556-1d12-4d72-a723-587afc755e57/sticker_retro_1786122089659.png",
  coffee: "C:/Users/alfez/.gemini/antigravity-ide/brain/73ef4556-1d12-4d72-a723-587afc755e57/sticker_coffee_1786122110010.png",
  spiderverse: "spiderverse.jpg"
};

function applyTheme(themeValue) {
  // Clear any existing theme classes
  document.body.className = document.body.className.replace(/\btheme-\S+/g, '').trim();

  if (themeValue !== 'default') {
    document.body.classList.add('theme-' + themeValue);
  }

  // Set sticker as subtle body background
  if (THEME_STICKERS[themeValue]) {
    // If it's a full path (C:/), use file:///, otherwise relative
    const path = THEME_STICKERS[themeValue].includes(':/')
      ? `file:///${THEME_STICKERS[themeValue].replace(/\\/g, '/')}`
      : THEME_STICKERS[themeValue];

    document.body.style.backgroundImage = `url('${path}')`;
    document.body.style.backgroundRepeat = 'no-repeat';
    document.body.style.backgroundPosition = 'center center';
    document.body.style.backgroundSize = themeValue === 'spiderverse' ? 'cover' : '400px';
    document.body.style.backgroundAttachment = 'fixed';
  } else {
    document.body.style.backgroundImage = 'none';
  }
}

function initThemeSelector() {
  const themeSelect = document.getElementById('theme-select');
  if (themeSelect) {
    themeSelect.value = state.theme || 'default';
    applyTheme(themeSelect.value);

    themeSelect.addEventListener('change', (e) => {
      const selectedTheme = e.target.value;
      state.theme = selectedTheme;
      saveState();
      applyTheme(selectedTheme);
      renderDailyChart(); // Re-render chart to pick up new CSS variables
    });
  }
}

function initNotes() {
  const textarea = document.getElementById('notes-textarea');
  let debounce;
  textarea.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      setNotes(textarea.value);
    }, 400);
  });
}

// ═══════════════════════════════════════════════════════════
// NEW FEATURES: EXPORT, THEME, YEARLY VIEW
// ═══════════════════════════════════════════════════════════

function exportToCSV() {
  const daysInMonth = getDaysInMonth(state.month, state.year);
  let csv = 'Habit,' + Array.from({ length: daysInMonth }, (_, i) => i + 1).join(',') + '\n';

  state.habits.forEach((habit) => {
    let row = `"${habit.name.replace(/"/g, '""')}"`;
    for (let d = 1; d <= daysInMonth; d++) {
      row += isChecked(habit.id, d) ? ',1' : ',0';
    }
    csv += row + '\n';
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `Habits_${MONTH_NAMES[state.month]}_${state.year}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function initExport() {
  const btn = document.getElementById('export-csv-btn');
  if (btn) btn.addEventListener('click', exportToCSV);
}

function initThemeToggle() {
  const btn = document.getElementById('theme-toggle-btn');
  if (!btn) return;

  const savedTheme = localStorage.getItem(STORAGE_KEY + '_theme') || 'light';
  if (savedTheme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  }

  btn.addEventListener('click', () => {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (isDark) {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem(STORAGE_KEY + '_theme', 'light');
    } else {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem(STORAGE_KEY + '_theme', 'dark');
    }
    renderDailyChart();
  });
}

function initYearlyView() {
  const btn = document.getElementById('yearly-view-btn');
  const modal = document.getElementById('yearly-modal');
  const closeBtn = document.getElementById('close-modal-btn');
  const grid = document.getElementById('yearly-grid');

  if (!btn || !modal) return;

  btn.addEventListener('click', () => {
    document.getElementById('yearly-modal-title').textContent = `${state.year} OVERVIEW`;

    let html = '';
    for (let m = 0; m < 12; m++) {
      const mk = monthKey(m, state.year);
      const days = getDaysInMonth(m, state.year);
      let totalChecks = 0;
      let possibleChecks = state.habits.length * days;

      if (state.data[mk] && state.data[mk].checks) {
        state.habits.forEach(h => {
          for (let d = 1; d <= days; d++) {
            if (state.data[mk].checks[h.id] && state.data[mk].checks[h.id][d]) {
              totalChecks++;
            }
          }
        });
      }

      const pct = possibleChecks === 0 ? 0 : Math.round((totalChecks / possibleChecks) * 100);

      html += `
        <div class="yearly-month-card">
          <div class="yearly-month-name">${MONTH_NAMES[m]}</div>
          <div class="yearly-month-progress">${pct}%</div>
        </div>
      `;
    }

    grid.innerHTML = html;
    modal.classList.add('active');
  });

  closeBtn.addEventListener('click', () => {
    modal.classList.remove('active');
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.remove('active');
  });
}

function init() {
  initSelectors();
  initThemeSelector();
  initNotes();
  initExport();
  initThemeToggle();
  initYearlyView();
  render();

  // Handle window resize for chart
  let resizeDebounce;
  window.addEventListener('resize', () => {
    clearTimeout(resizeDebounce);
    resizeDebounce = setTimeout(() => {
      renderDailyChart();
    }, 200);
  });
}

function startApp() {
  const loginBtn = document.getElementById('login-btn');
  const logoutBtn = document.getElementById('logout-btn');

  console.log("App starting, loginBtn:", loginBtn);

  if (loginBtn) {
    loginBtn.addEventListener('click', () => {
      console.log("Sign in button clicked!");
      const provider = new GoogleAuthProvider();
      signInWithPopup(auth, provider).catch(error => {
        console.error('Login failed:', error);
        alert(`Login failed: ${error.message} (Code: ${error.code})`);
      });
    });
  } else {
    console.error("Could not find login-btn in the DOM!");
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      console.log("Logout button clicked!");
      signOut(auth);
    });
  }

  onAuthStateChanged(auth, async (user) => {
    console.log("Auth state changed, user:", user ? user.uid : null);
    const loginOverlay = document.getElementById('login-overlay');
    const dashboard = document.getElementById('dashboard');

    if (user) {
      currentUser = user;
      if (loginOverlay) loginOverlay.classList.remove('active');
      if (dashboard) {
        dashboard.style.display = 'flex';
        dashboard.style.display = '';
      }

      await loadStateFromFirebase(user.uid);
      init();
    } else {
      currentUser = null;
      if (loginOverlay) loginOverlay.classList.add('active');
      if (dashboard) dashboard.style.display = 'none';
      resetState();
    }
  });
}

// Since type="module" implies deferred execution, the DOM might already be loaded.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startApp);
} else {
  startApp();
}
