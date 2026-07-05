const STORAGE_KEY = 'lifeos.v1';

const defaultState = () => ({
  theme: 'dark',
  accent: '#7c5cff',
  currentView: 'dashboard',
  query: '',
  tasks: [
    { id: uid(), title: 'Plan today', due: today(), done: false, priority: 'high', createdAt: Date.now() - 86400000 },
    { id: uid(), title: 'Study one important topic', due: today(), done: false, priority: 'medium', createdAt: Date.now() - 5400000 }
  ],
  notes: [
    { id: uid(), title: 'Welcome note', body: 'LifeOS saves everything locally. Start typing and it auto-saves.', updatedAt: Date.now() }
  ],
  habits: [
    { id: uid(), name: 'Read', streak: 3, lastDone: null, completions: {} },
    { id: uid(), name: 'Exercise', streak: 1, lastDone: null, completions: {} },
    { id: uid(), name: 'Practice', streak: 0, lastDone: null, completions: {} }
  ],
  bookmarks: [
    { id: uid(), title: 'MDN Web Docs', url: 'https://developer.mozilla.org/', tag: 'learn', createdAt: Date.now() }
  ],
  journal: [
    { id: uid(), date: today(), entry: 'Today I built something useful.' }
  ],
  timer: { work: 25, break: 5, mode: 'work', running: false, remaining: 25 * 60, sessions: 0, completed: 0, lastStart: null },
  stats: { focusMinutes: 0, lastFocusReset: today() }
});

function uid(){
  return Math.random().toString(36).slice(2,10) + Date.now().toString(36).slice(-4);
}

function today(){
  return new Date().toISOString().slice(0,10);
}

function safeParse(raw){
  try{ return JSON.parse(raw); }catch{ return null; }
}

export function loadState(){
  const stored = safeParse(localStorage.getItem(STORAGE_KEY));
  if(!stored) return defaultState();
  const base = defaultState();
  const merged = { ...base, ...stored };
  merged.timer = { ...base.timer, ...(stored.timer || {}) };
  merged.stats = { ...base.stats, ...(stored.stats || {}) };
  merged.tasks = Array.isArray(stored.tasks) ? stored.tasks : base.tasks;
  merged.notes = Array.isArray(stored.notes) ? stored.notes : base.notes;
  merged.habits = Array.isArray(stored.habits) ? stored.habits : base.habits;
  merged.bookmarks = Array.isArray(stored.bookmarks) ? stored.bookmarks : base.bookmarks;
  merged.journal = Array.isArray(stored.journal) ? stored.journal : base.journal;
  return merged;
}

export function saveState(state){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function exportState(state){
  return JSON.stringify(state, null, 2);
}

export function importState(text){
  const parsed = safeParse(text);
  if(!parsed || typeof parsed !== 'object') throw new Error('Invalid backup file.');
  return parsed;
}

export function emptyBackup(){
  return defaultState();
}

export const dataUtils = { uid, today };
