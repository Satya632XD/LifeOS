import { icons } from './icons.js';
import { loadState, saveState, exportState, importState, dataUtils, emptyBackup } from './store.js';

const app = document.querySelector('#app');
const toastStack = document.createElement('div');
toastStack.className = 'toast-stack';
document.body.appendChild(toastStack);

const state = loadState();
let undoStack = [];
let activeNoteId = state.notes[0]?.id ?? null;
let focusTimerHandle = null;
let taskFilter = 'all';

const views = [
  { id: 'dashboard', label: 'Dashboard', icon: icons.dashboard },
  { id: 'tasks', label: 'Tasks', icon: icons.tasks },
  { id: 'notes', label: 'Notes', icon: icons.notes },
  { id: 'focus', label: 'Focus', icon: icons.timer },
  { id: 'habits', label: 'Habits', icon: icons.habits },
  { id: 'bookmarks', label: 'Bookmarks', icon: icons.bookmarks },
  { id: 'settings', label: 'Settings', icon: icons.settings }
];

applyTheme();
render();
bindGlobalShortcuts();
startTicker();
autoSave();

function applyTheme(){
  document.documentElement.dataset.theme = state.theme;
  document.documentElement.style.setProperty('--accent', state.accent);
}

function autoSave(){
  const save = () => saveState(state);
  window.addEventListener('beforeunload', save);
  setInterval(save, 5000);
}

function bindGlobalShortcuts(){
  document.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    if(e.ctrlKey && key === 'k'){
      e.preventDefault();
      openCommandPalette();
      return;
    }
    if(e.ctrlKey && key === 'p'){
      e.preventDefault();
      openCommandPalette();
      return;
    }
    if(e.ctrlKey && /^[1-7]$/.test(e.key)){
      e.preventDefault();
      setView(views[Number(e.key)-1].id);
    }
    if(e.key === 'Escape') closeModal();
  });
}

function setView(id){
  state.currentView = id;
  render();
  saveState(state);
}

function setQuery(value){
  state.query = value;
  renderMain();
  saveState(state);
}

function render(){
  app.innerHTML = `
    <div class="shell">
      <aside class="sidebar">
        <div class="brand">
          <div class="logo">${icons.spark}</div>
          <div>
            <h1>LifeOS</h1>
            <p>Offline productivity cockpit</p>
          </div>
        </div>
        <div class="sidebar__section">
          <div class="nav">
            ${views.map((v, i) => `
              <button class="${state.currentView===v.id?'active':''}" data-view="${v.id}">
                <span style="width:20px;height:20px;display:inline-grid;place-items:center">${v.icon}</span>
                <span>${v.label}</span>
                <span class="badge">${shortcutLabel(i+1)}</span>
              </button>
            `).join('')}
          </div>
        </div>
        <div class="sidebar__section">
          <div class="card" style="padding:14px">
            <div class="stat">
              <div>
                <div class="small">Today</div>
                <strong>${todaySummary()}</strong>
              </div>
              <span class="pill">${doneCount()}/${state.tasks.length} tasks</span>
            </div>
            <div style="margin-top:12px" class="progress"><span style="width:${taskProgress()}%"></span></div>
            <div class="footer-note" style="margin-top:10px">Everything is saved locally. No account, no cloud, no drama.</div>
          </div>
        </div>
        <div class="sidebar__footer">
          <div>Shortcuts: Ctrl+K search · Ctrl+1..7 switch views · Esc close dialogs</div>
        </div>
      </aside>

      <main class="main">
        <div class="topbar">
          <div class="search">
            <span style="width:18px;height:18px;opacity:.8">${icons.search}</span>
            <input data-search placeholder="Search tasks, notes, bookmarks, habits..." value="${escapeHtml(state.query)}" />
            <span class="kbd">Ctrl K</span>
          </div>
          <button class="icon-btn" data-theme-toggle title="Toggle theme">${state.theme === 'dark' ? icons.sun : icons.moon}</button>
          <button class="ghost-btn" data-open-export>Backup</button>
          <button class="ghost-btn" data-open-palette title="Command palette (Ctrl+K)">Commands</button>
          <button class="primary-btn" data-quick-add>+ Add</button>
        </div>

        <section class="workspace">
          <div class="section-head">
            <div>
              <h2>${titleFor(state.currentView)}</h2>
              <p>${subtitleFor(state.currentView)}</p>
            </div>
            <div class="section-actions" id="section-actions"></div>
          </div>
          <div class="content" id="content"></div>
        </section>
      </main>
    </div>

    <div class="modal-backdrop" id="modal-backdrop" aria-hidden="true">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div class="modal__head">
          <strong id="modal-title">Quick Add</strong>
          <button class="icon-btn" data-close-modal aria-label="Close">${escapeHtml('×')}</button>
        </div>
        <div class="modal__body" id="modal-body"></div>
      </div>
    </div>
  `;

  wireShellEvents();
  renderMain();
  saveState(state);
}

function wireShellEvents(){
  document.querySelector('[data-search]')?.addEventListener('input', e => setQuery(e.target.value));
  document.querySelector('[data-theme-toggle]')?.addEventListener('click', toggleTheme);
  document.querySelector('[data-open-export]')?.addEventListener('click', openBackupModal);
  document.querySelector('[data-open-palette]')?.addEventListener('click', openCommandPalette);
  document.querySelector('[data-quick-add]')?.addEventListener('click', quickAdd);
  document.querySelector('[data-close-modal]')?.addEventListener('click', closeModal);
  document.querySelector('#modal-backdrop')?.addEventListener('click', (e) => {
    if(e.target.id === 'modal-backdrop') closeModal();
  });
  document.querySelectorAll('[data-view]').forEach(btn => btn.addEventListener('click', () => setView(btn.dataset.view)));
}

function renderMain(){
  const content = document.querySelector('#content');
  const actions = document.querySelector('#section-actions');
  if(!content || !actions) return;

  if(state.currentView === 'dashboard') actions.innerHTML = `
    <button class="ghost-btn" data-act="focus">Start focus</button>
    <button class="ghost-btn" data-act="new-note">New note</button>
  `;
  else if(state.currentView === 'tasks') actions.innerHTML = `
    <button class="ghost-btn" data-act="task-filter">Smart filter</button>
    <button class="primary-btn" data-act="new-task">New task</button>
  `;
  else if(state.currentView === 'notes') actions.innerHTML = `
    <button class="ghost-btn" data-act="new-note">New note</button>
    <button class="ghost-btn" data-act="export-notes">Export note</button>
  `;
  else if(state.currentView === 'focus') actions.innerHTML = `
    <button class="ghost-btn" data-act="timer-reset">Reset timer</button>
    <button class="primary-btn" data-act="timer-start">Start / Pause</button>
  `;
  else if(state.currentView === 'habits') actions.innerHTML = `
    <button class="ghost-btn" data-act="new-habit">New habit</button>
  `;
  else if(state.currentView === 'bookmarks') actions.innerHTML = `
    <button class="ghost-btn" data-act="new-bookmark">Import link</button>
  `;
  else actions.innerHTML = `
    <button class="ghost-btn" data-act="reset-app">Reset demo data</button>
  `;

  actions.querySelectorAll('button').forEach(btn => btn.addEventListener('click', handleAction));

  content.innerHTML = renderView();
  bindViewEvents(content);
}

function renderView(){
  const q = state.query.trim().toLowerCase();
  if(state.currentView === 'dashboard'){
    const dueToday = state.tasks.filter(t => !t.done && t.due === dataUtils.today()).length;
    const complete = doneCount();
    const focusReady = formatTime(state.timer.remaining);
    return `
      <div class="grid cols-3">
        <div class="card"><div class="small">Tasks due today</div><div class="stat"><strong>${dueToday}</strong><span class="pill">Focus list</span></div></div>
        <div class="card"><div class="small">Completed tasks</div><div class="stat"><strong>${complete}</strong><span class="pill">${Math.round(taskProgress())}%</span></div></div>
        <div class="card"><div class="small">Timer status</div><div class="stat"><strong>${focusReady}</strong><span class="pill">${state.timer.running ? 'Running' : 'Ready'}</span></div></div>
      </div>

      <div style="height:16px"></div>

      <div class="grid cols-2">
        <div class="card">
          <h3>Today’s plan</h3>
          <div class="list">
            ${filteredTasks(q, 4).map(taskCard).join('') || emptyState('No matching tasks. Create one in a second.')}
          </div>
        </div>
        <div class="card">
          <h3>Recent notes</h3>
          <div class="list">
            ${filteredNotes(q, 4).map(noteCardPreview).join('') || emptyState('No matching notes yet. Your second brain is waiting.')}
          </div>
        </div>
      </div>

      <div style="height:16px"></div>

      <div class="grid cols-2">
        <div class="card">
          <h3>Focus sessions</h3>
          ${focusChart()}
        </div>
        <div class="card">
          <h3>Habit pulse</h3>
          <div class="list">
            ${state.habits.slice(0, 6).map(h => `
              <div class="item">
                <div class="item__row"><div class="item__title">${escapeHtml(h.name)}</div><span class="pill">${h.streak} day streak</span></div>
                <div class="small">${habitDoneToday(h) ? 'Done today' : 'Tap over in Habits to log today.'}</div>
              </div>
            `).join('') || emptyState('No habits yet. Add one and keep it tiny.')}
          </div>
        </div>
      </div>
    `;
  }

  if(state.currentView === 'tasks'){
    const tasks = filteredTasks(q);
    return `
      <div class="toolbar">
        <div class="seg" data-task-filter>
          ${['all','open','done'].map(f => `<button class="${taskFilter===f?'active':''}" data-filter="${f}">${f}</button>`).join('')}
        </div>
        <span class="pill">${tasks.length} shown</span>
      </div>
      <div style="height:14px"></div>
      <div class="list">
        ${tasks.map(taskCard).join('') || emptyState('No tasks match your search.')}
      </div>
    `;
  }

  if(state.currentView === 'notes'){
    const notes = filteredNotes(q);
    const active = state.notes.find(n => n.id === activeNoteId) || state.notes[0];
    return `
      <div class="two-col">
        <div class="card note-list">
          <div class="toolbar" style="margin-bottom:12px">
            <button class="primary-btn" data-new-note>New note</button>
            <span class="pill">${notes.length} notes</span>
          </div>
          <div class="list">
            ${notes.map(n => noteListItem(n, active?.id)).join('') || emptyState('No notes found.')}
          </div>
        </div>
        <div class="card note-editor">
          ${active ? `
            <div class="field">
              <label>Title</label>
              <input data-note-title value="${escapeAttr(active.title)}" placeholder="Note title" />
            </div>
            <div class="field">
              <label>Body</label>
              <textarea data-note-body placeholder="Write anything important...">${escapeHtml(active.body)}</textarea>
            </div>
            <div class="toolbar">
              <button class="ghost-btn" data-delete-note>Delete</button>
              <button class="primary-btn" data-save-note>Save now</button>
            </div>
            <div class="small">Auto-saves as you type. Last updated ${formatDate(active.updatedAt)}</div>
          ` : emptyState('Pick or create a note.')}
        </div>
      </div>
    `;
  }

  if(state.currentView === 'focus'){
    return `
      <div class="grid cols-2">
        <div class="card">
          <div class="stat">
            <div>
              <div class="small">${state.timer.mode === 'work' ? 'Work session' : 'Break time'}</div>
              <strong>${formatTime(state.timer.remaining)}</strong>
            </div>
            <span class="pill">${state.timer.running ? 'Running' : 'Paused'}</span>
          </div>
          <div style="margin:12px 0" class="progress"><span style="width:${timerProgress()}%"></span></div>
          <div class="toolbar">
            <button class="primary-btn" data-timer-toggle>${state.timer.running ? 'Pause' : 'Start'}</button>
            <button class="ghost-btn" data-timer-skip>Skip</button>
            <button class="ghost-btn" data-timer-reset>Reset</button>
          </div>
          <div style="height:12px"></div>
          <div class="grid cols-2">
            <div class="card" style="padding:14px">
              <div class="small">Work length</div>
              <strong>${state.timer.work} min</strong>
            </div>
            <div class="card" style="padding:14px">
              <div class="small">Break length</div>
              <strong>${state.timer.break} min</strong>
            </div>
          </div>
        </div>
        <div class="card">
          <h3>Session history</h3>
          <div class="grid cols-2">
            <div class="card"><div class="small">Completed sessions</div><strong>${state.timer.completed}</strong></div>
            <div class="card"><div class="small">Focus minutes today</div><strong>${state.stats.focusMinutes}</strong></div>
          </div>
          <div style="height:14px"></div>
          <div class="footer-note">Tip: keep it boring. The app handles the rhythm, you handle the work.</div>
        </div>
      </div>
    `;
  }

  if(state.currentView === 'habits'){
    return `
      <div class="grid cols-2">
        <div class="card">
          <div class="toolbar" style="justify-content:space-between;align-items:center">
            <h3 style="margin:0">Your habits</h3>
            <button class="primary-btn" data-new-habit>New habit</button>
          </div>
          <div style="height:10px"></div>
          <div class="list">
            ${state.habits.map(habitCard).join('') || emptyState('No habits yet.')}
          </div>
        </div>
        <div class="card">
          <h3>Streak map</h3>
          ${streakMap()}
        </div>
      </div>
    `;
  }

  if(state.currentView === 'bookmarks'){
    const bookmarks = state.bookmarks.filter(b => !q || [b.title,b.url,b.tag].join(' ').toLowerCase().includes(q));
    return `
      <div class="toolbar">
        <button class="primary-btn" data-new-bookmark>Add bookmark</button>
        <span class="pill">${bookmarks.length} saved</span>
      </div>
      <div style="height:12px"></div>
      <div class="grid cols-2">
        ${bookmarks.map(b => `
          <div class="card bookmark">
            <div class="item__row">
              <div>
                <a href="${escapeAttr(b.url)}" target="_blank" rel="noreferrer">${escapeHtml(b.title)}</a>
                <div class="small">${escapeHtml(b.url)}</div>
              </div>
              <span class="pill">${escapeHtml(b.tag || 'general')}</span>
            </div>
            <div class="toolbar">
              <button class="ghost-btn" data-copy="${escapeAttr(b.url)}">Copy URL</button>
              <button class="ghost-btn" data-bm-delete="${b.id}">Delete</button>
            </div>
          </div>
        `).join('') || emptyState('No bookmarks yet.')}
      </div>
    `;
  }

  return `
    <div class="grid cols-2">
      <div class="card">
        <h3>Appearance</h3>
        <div class="field">
          <label>Theme</label>
          <select data-setting-theme>
            <option value="dark" ${state.theme==='dark'?'selected':''}>Dark</option>
            <option value="light" ${state.theme==='light'?'selected':''}>Light</option>
          </select>
        </div>
        <div class="field">
          <label>Accent color</label>
          <input data-setting-accent type="color" value="${state.accent}" />
        </div>
      </div>
      <div class="card">
        <h3>Data</h3>
        <div class="toolbar">
          <button class="primary-btn" data-export-json>Export backup</button>
          <button class="ghost-btn" data-import-json>Import backup</button>
          <button class="ghost-btn" data-reset-demo>Reset demo data</button>
        </div>
        <div class="footer-note" style="margin-top:12px">Backups are plain JSON. Save one before making big changes.</div>
      </div>
    </div>
  `;
}

function bindViewEvents(root){
  root.querySelectorAll('[data-task-toggle]').forEach(btn => btn.addEventListener('click', () => toggleTask(btn.dataset.taskToggle)));
  root.querySelectorAll('[data-task-delete]').forEach(btn => btn.addEventListener('click', () => deleteTask(btn.dataset.taskDelete)));
  root.querySelectorAll('[data-task-edit]').forEach(btn => btn.addEventListener('click', () => editTask(btn.dataset.taskEdit)));
  root.querySelectorAll('[data-note-select]').forEach(btn => btn.addEventListener('click', () => selectNote(btn.dataset.noteSelect)));
  root.querySelector('[data-note-title]')?.addEventListener('input', () => saveActiveNote(false));
  root.querySelector('[data-note-body]')?.addEventListener('input', () => saveActiveNote(false));
  root.querySelector('[data-save-note]')?.addEventListener('click', () => saveActiveNote(true));
  root.querySelector('[data-delete-note]')?.addEventListener('click', deleteActiveNote);
  root.querySelector('[data-new-note]')?.addEventListener('click', addNote);
  root.querySelector('[data-timer-toggle]')?.addEventListener('click', toggleTimer);
  root.querySelector('[data-timer-reset]')?.addEventListener('click', resetTimer);
  root.querySelector('[data-timer-skip]')?.addEventListener('click', skipTimer);
  root.querySelector('[data-new-habit]')?.addEventListener('click', addHabit);
  root.querySelectorAll('[data-habit-log]').forEach(btn => btn.addEventListener('click', () => logHabit(btn.dataset.habitLog)));
  root.querySelectorAll('[data-copy]').forEach(btn => btn.addEventListener('click', () => copyText(btn.dataset.copy)));
  root.querySelectorAll('[data-bm-delete]').forEach(btn => btn.addEventListener('click', () => deleteBookmark(btn.dataset.bmDelete)));
  root.querySelector('[data-setting-theme]')?.addEventListener('change', e => { state.theme = e.target.value; applyTheme(); render(); });
  root.querySelector('[data-setting-accent]')?.addEventListener('input', e => { state.accent = e.target.value; applyTheme(); render(); });
  root.querySelector('[data-export-json]')?.addEventListener('click', exportBackup);
  root.querySelector('[data-import-json]')?.addEventListener('click', importBackup);
  root.querySelector('[data-reset-demo]')?.addEventListener('click', resetDemoData);
  root.querySelector('[data-new-bookmark]')?.addEventListener('click', addBookmark);
  root.querySelectorAll('[data-filter]').forEach(btn => btn.addEventListener('click', () => { taskFilter = btn.dataset.filter; renderMain(); }));
  root.querySelectorAll('[data-act]').forEach(btn => btn.addEventListener('click', () => handleAction({ currentTarget: btn })));
}

function filteredTasks(q, limit=999){
  let items = [...state.tasks];
  if(taskFilter === 'open') items = items.filter(t => !t.done);
  if(taskFilter === 'done') items = items.filter(t => t.done);
  if(q) items = items.filter(t => [t.title, t.priority, t.due].join(' ').toLowerCase().includes(q));
  return items.sort((a,b) => Number(a.done) - Number(b.done) || (b.priority==='high') - (a.priority==='high') || b.createdAt - a.createdAt).slice(0,limit);
}

function filteredNotes(q, limit=999){
  let items = [...state.notes];
  if(q) items = items.filter(n => [n.title, n.body].join(' ').toLowerCase().includes(q));
  return items.sort((a,b) => b.updatedAt - a.updatedAt).slice(0,limit);
}

function taskCard(task){
  const done = task.done ? 'done' : '';
  return `
    <div class="item">
      <div class="item__row">
        <div class="item__title">
          <button class="check ${done}" data-task-toggle="${task.id}" aria-label="Toggle task">${task.done ? '✓' : ''}</button>
          <span>${escapeHtml(task.title)}</span>
        </div>
        <div class="toolbar">
          <button class="icon-btn" data-task-edit="${task.id}" title="Edit task">${icons.edit}</button>
          <button class="icon-btn" data-task-delete="${task.id}" title="Delete task">${icons.delete}</button>
        </div>
      </div>
      <div class="item__meta">
        <span class="pill">${escapeHtml(task.priority)}</span>
        <span class="pill">Due ${escapeHtml(task.due)}</span>
        ${task.done ? '<span class="pill">Completed</span>' : ''}
      </div>
    </div>
  `;
}

function noteCardPreview(note){
  return `
    <div class="item">
      <div class="item__row">
        <div class="item__title"><span>${escapeHtml(note.title)}</span></div>
        <button class="ghost-btn" data-note-select="${note.id}">Open</button>
      </div>
      <div class="small">${escapeHtml(snippet(note.body))}</div>
    </div>
  `;
}

function noteListItem(note, activeId){
  return `
    <button class="item ${note.id===activeId?'active':''}" data-note-select="${note.id}" style="text-align:left">
      <div class="item__row">
        <div class="item__title"><span>${escapeHtml(note.title || 'Untitled')}</span></div>
        <span class="small">${formatDate(note.updatedAt)}</span>
      </div>
      <div class="small">${escapeHtml(snippet(note.body))}</div>
    </button>
  `;
}

function habitCard(habit){
  const done = habitDoneToday(habit);
  return `
    <div class="item">
      <div class="item__row">
        <div class="item__title"><span>${escapeHtml(habit.name)}</span></div>
        <span class="pill">${habit.streak} day streak</span>
      </div>
      <div class="toolbar">
        <button class="primary-btn" data-habit-log="${habit.id}">${done ? 'Logged today' : 'Log today'}</button>
      </div>
    </div>
  `;
}

function emptyState(text){
  return `<div class="empty">${escapeHtml(text)}</div>`;
}

function handleAction(e){
  const act = e.currentTarget?.dataset.act;
  if(act === 'new-task') addTask();
  if(act === 'new-note') addNote();
  if(act === 'focus') setView('focus');
  if(act === 'timer-start') toggleTimer();
  if(act === 'timer-reset') resetTimer();
  if(act === 'new-habit') addHabit();
  if(act === 'new-bookmark') addBookmark();
  if(act === 'reset-app') resetDemoData();
  if(act === 'task-filter') showToast('Use the filter chips in Tasks to switch between all, open, and done.');
  if(act === 'export-notes') exportCurrentNote();
  if(act === 'timer-skip') skipTimer();
}

function quickAdd(){
  openModal(`
    <div class="grid cols-2">
      <button class="card" data-qa="task" style="text-align:left"><h3 style="margin:0 0 6px">Task</h3><div class="small">Add a focused action item.</div></button>
      <button class="card" data-qa="note" style="text-align:left"><h3 style="margin:0 0 6px">Note</h3><div class="small">Capture a thought fast.</div></button>
      <button class="card" data-qa="bookmark" style="text-align:left"><h3 style="margin:0 0 6px">Bookmark</h3><div class="small">Save a useful link.</div></button>
      <button class="card" data-qa="habit" style="text-align:left"><h3 style="margin:0 0 6px">Habit</h3><div class="small">Track something daily.</div></button>
    </div>
  `);
  document.querySelectorAll('[data-qa]').forEach(btn => btn.addEventListener('click', () => {
    closeModal();
    const kind = btn.dataset.qa;
    if(kind === 'task') addTask();
    if(kind === 'note') addNote();
    if(kind === 'bookmark') addBookmark();
    if(kind === 'habit') addHabit();
  }));
}


function openCommandPalette(){
  const commands = [
    { title: 'New task', hint: 'Add a task quickly', run: addTask },
    { title: 'New note', hint: 'Capture a thought', run: addNote },
    { title: 'New bookmark', hint: 'Save a link', run: addBookmark },
    { title: 'New habit', hint: 'Track a daily streak', run: addHabit },
    { title: 'Go to Dashboard', hint: 'Ctrl+1', run: () => setView('dashboard') },
    { title: 'Go to Tasks', hint: 'Ctrl+2', run: () => setView('tasks') },
    { title: 'Go to Notes', hint: 'Ctrl+3', run: () => setView('notes') },
    { title: 'Go to Focus', hint: 'Ctrl+4', run: () => setView('focus') },
    { title: 'Go to Habits', hint: 'Ctrl+5', run: () => setView('habits') },
    { title: 'Go to Bookmarks', hint: 'Ctrl+6', run: () => setView('bookmarks') },
    { title: 'Go to Settings', hint: 'Ctrl+7', run: () => setView('settings') },
    { title: state.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme', hint: 'Toggle appearance', run: toggleTheme }
  ];
  openModal(`
    <div class="form">
      <div class="field">
        <label>Search commands</label>
        <input data-palette-search placeholder="Type to filter commands..." autofocus />
      </div>
      <div class="palette" data-palette-list>
        ${commands.map((c, i) => `
          <button data-command="${i}">
            <span>
              <strong>${escapeHtml(c.title)}</strong><br />
              <span class="small">${escapeHtml(c.hint)}</span>
            </span>
            <span class="pill">Enter</span>
          </button>
        `).join('')}
      </div>
    </div>
  `);

  const search = document.querySelector('[data-palette-search]');
  const list = document.querySelector('[data-palette-list]');
  const filter = () => {
    const q = search.value.trim().toLowerCase();
    list.querySelectorAll('[data-command]').forEach((btn, idx) => {
      const command = commands[idx];
      const show = !q || `${command.title} ${command.hint}`.toLowerCase().includes(q);
      btn.style.display = show ? '' : 'none';
      btn.onclick = () => { closeModal(); command.run(); };
    });
  };
  search.addEventListener('input', filter);
  filter();
  setTimeout(() => search.focus(), 0);
}

function addTask(){
  const title = prompt('Task title?');
  if(!title) return;
  const due = prompt('Due date (YYYY-MM-DD)', dataUtils.today()) || dataUtils.today();
  state.tasks.unshift({ id: dataUtils.uid(), title: title.trim(), due, done:false, priority:'medium', createdAt: Date.now() });
  toast('Task added', title);
  render();
}

function editTask(id){
  const task = state.tasks.find(t => t.id === id);
  if(!task) return;
  const title = prompt('Edit title', task.title);
  if(title === null) return;
  const due = prompt('Edit due date', task.due);
  if(due === null) return;
  const priority = prompt('Priority: low, medium, high', task.priority);
  if(priority === null) return;
  task.title = title.trim() || task.title;
  task.due = due.trim() || task.due;
  task.priority = ['low','medium','high'].includes(priority.trim()) ? priority.trim() : task.priority;
  render();
}

function toggleTask(id){
  const task = state.tasks.find(t => t.id === id);
  if(!task) return;
  task.done = !task.done;
  toast(task.done ? 'Task completed' : 'Task reopened', task.title);
  render();
}

function deleteTask(id){
  const idx = state.tasks.findIndex(t => t.id === id);
  if(idx < 0) return;
  const [removed] = state.tasks.splice(idx,1);
  pushUndo(() => state.tasks.splice(idx,0,removed));
  toast('Task removed', removed.title, 'Undo');
  render();
}

function addNote(){
  const note = { id: dataUtils.uid(), title: 'Untitled note', body: '', updatedAt: Date.now() };
  state.notes.unshift(note);
  activeNoteId = note.id;
  toast('Note created', 'Start typing to save automatically.');
  render();
}

function selectNote(id){
  activeNoteId = id;
  renderMain();
}

function saveActiveNote(refresh = false){
  const note = state.notes.find(n => n.id === activeNoteId);
  if(!note) return;
  const title = document.querySelector('[data-note-title]')?.value ?? note.title;
  const body = document.querySelector('[data-note-body]')?.value ?? note.body;
  note.title = title || 'Untitled note';
  note.body = body;
  note.updatedAt = Date.now();
  saveState(state);
  if(refresh) renderMain();
}

function deleteActiveNote(){
  const idx = state.notes.findIndex(n => n.id === activeNoteId);
  if(idx < 0) return;
  const [removed] = state.notes.splice(idx,1);
  pushUndo(() => state.notes.splice(idx,0,removed));
  activeNoteId = state.notes[0]?.id ?? null;
  toast('Note deleted', removed.title, 'Undo');
  render();
}

function exportCurrentNote(){
  const note = state.notes.find(n => n.id === activeNoteId);
  if(!note) return showToast('No note selected.');
  const blob = new Blob([JSON.stringify(note, null, 2)], {type:'application/json'});
  downloadBlob(blob, `${slug(note.title)}.json`);
  showToast('Note exported.');
}

function toggleTheme(){
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  applyTheme(); render();
}

function startTicker(){
  setInterval(() => {
    if(state.currentView !== 'focus') return;
    if(!state.timer.running) return;
    state.timer.remaining--;
    if(state.timer.remaining <= 0){
      finishSession();
    }
    if(state.currentView === 'focus') renderMain();
    saveState(state);
  }, 1000);
}

function toggleTimer(){
  if(state.timer.running){
    state.timer.running = false;
    toast('Timer paused');
    renderMain();
    return;
  }
  state.timer.running = true;
  state.timer.lastStart = Date.now();
  toast('Timer started');
  renderMain();
}

function resetTimer(){
  state.timer.running = false;
  state.timer.mode = 'work';
  state.timer.remaining = state.timer.work * 60;
  renderMain();
  toast('Timer reset');
}

function skipTimer(){
  finishSession(true);
}

function finishSession(skipped=false){
  state.timer.running = false;
  if(state.timer.mode === 'work'){
    if(!skipped) {
      state.timer.completed++;
      state.stats.focusMinutes += state.timer.work;
    }
    state.timer.mode = 'break';
    state.timer.remaining = state.timer.break * 60;
    showToast(skipped ? 'Work session skipped.' : 'Work session completed.');
  } else {
    state.timer.mode = 'work';
    state.timer.remaining = state.timer.work * 60;
    showToast('Break finished. Back to work.');
  }
  renderMain();
  saveState(state);
}

function addHabit(){
  const name = prompt('Habit name?');
  if(!name) return;
  state.habits.unshift({ id: dataUtils.uid(), name: name.trim(), streak: 0, lastDone: null, completions: {} });
  toast('Habit created', name);
  render();
}

function habitDoneToday(habit){
  return Boolean(habit.completions?.[dataUtils.today()]);
}

function logHabit(id){
  const habit = state.habits.find(h => h.id === id);
  if(!habit) return;
  const day = dataUtils.today();
  if(habit.completions?.[day]){
    showToast('Already logged today.');
    return;
  }
  habit.completions = habit.completions || {};
  habit.completions[day] = true;
  habit.lastDone = day;
  habit.streak = calcStreak(habit);
  toast('Habit logged', habit.name);
  render();
}

function calcStreak(habit){
  const days = Object.keys(habit.completions || {}).sort();
  if(!days.length) return 0;
  let streak = 0;
  let cursor = new Date(dataUtils.today());
  while(true){
    const key = cursor.toISOString().slice(0,10);
    if(habit.completions[key]){ streak++; cursor.setDate(cursor.getDate()-1); }
    else break;
  }
  return streak;
}

function addBookmark(){
  const url = prompt('Bookmark URL?');
  if(!url) return;
  const title = prompt('Title?', url.replace(/^https?:\/\//,'').slice(0,30)) || url;
  const tag = prompt('Tag?', 'general') || 'general';
  state.bookmarks.unshift({ id: dataUtils.uid(), title: title.trim(), url: url.trim(), tag: tag.trim(), createdAt: Date.now() });
  toast('Bookmark saved', title);
  render();
}

function deleteBookmark(id){
  const idx = state.bookmarks.findIndex(b => b.id === id);
  if(idx < 0) return;
  const [removed] = state.bookmarks.splice(idx,1);
  pushUndo(() => state.bookmarks.splice(idx,0,removed));
  toast('Bookmark removed', removed.title, 'Undo');
  render();
}

function openBackupModal(){
  openModal(`
    <div class="form">
      <div class="field">
        <label>Export your backup</label>
        <textarea readonly>${escapeHtml(exportState(state))}</textarea>
      </div>
      <div class="toolbar">
        <button class="primary-btn" data-download-backup>Download JSON</button>
        <button class="ghost-btn" data-open-import>Import JSON</button>
      </div>
    </div>
  `);
  document.querySelector('[data-download-backup]')?.addEventListener('click', () => {
    downloadBlob(new Blob([exportState(state)], {type:'application/json'}), `lifeos-backup-${dataUtils.today()}.json`);
    showToast('Backup downloaded.');
  });
  document.querySelector('[data-open-import]')?.addEventListener('click', importBackup);
}

function exportBackup(){
  downloadBlob(new Blob([exportState(state)], {type:'application/json'}), `lifeos-backup-${dataUtils.today()}.json`);
  showToast('Backup downloaded.');
}

function importBackup(){
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json';
  input.onchange = async () => {
    const file = input.files?.[0];
    if(!file) return;
    const text = await file.text();
    try{
      const next = importState(text);
      Object.keys(state).forEach(k => delete state[k]);
      Object.assign(state, emptyBackup(), next);
      applyTheme();
      render();
      toast('Backup imported', 'Your data is restored.');
    }catch(err){
      showToast(err.message || 'Import failed.');
    }
  };
  input.click();
}

function resetDemoData(){
  if(!confirm('Reset LifeOS to demo data? This replaces everything stored locally.')) return;
  const fresh = emptyBackup();
  Object.keys(state).forEach(k => delete state[k]);
  Object.assign(state, fresh);
  activeNoteId = state.notes[0]?.id ?? null;
  taskFilter = 'all';
  applyTheme();
  render();
  toast('App reset', 'Demo data restored.');
}

function pushUndo(fn){
  undoStack.push(fn);
  setTimeout(() => { undoStack = undoStack.slice(-1); }, 10000);
}

function toast(title, text='', action=''){
  const tpl = document.querySelector('#toast-template');
  const node = tpl.content.firstElementChild.cloneNode(true);
  node.querySelector('.toast__title').textContent = title;
  node.querySelector('.toast__text').textContent = text || '';
  node.querySelector('.toast__icon').innerHTML = icons.spark;
  const close = () => node.remove();
  node.querySelector('.toast__close').addEventListener('click', close);
  if(action === 'Undo'){
    const undoBtn = document.createElement('button');
    undoBtn.className = 'ghost-btn';
    undoBtn.style.marginLeft = '10px';
    undoBtn.textContent = 'Undo';
    undoBtn.addEventListener('click', () => {
      const fn = undoStack.pop();
      fn?.();
      close();
      render();
    });
    node.querySelector('.toast__body').appendChild(undoBtn);
  }
  toastStack.appendChild(node);
  setTimeout(close, 3200);
}

function showToast(msg, text=''){
  toast(msg, text);
}

function openModal(html){
  const backdrop = document.querySelector('#modal-backdrop');
  const body = document.querySelector('#modal-body');
  body.innerHTML = html;
  backdrop.classList.add('open');
  backdrop.setAttribute('aria-hidden','false');
  document.body.style.overflow = 'hidden';
}

function closeModal(){
  const backdrop = document.querySelector('#modal-backdrop');
  backdrop.classList.remove('open');
  backdrop.setAttribute('aria-hidden','true');
  document.body.style.overflow = '';
}

function copyText(text){
  navigator.clipboard?.writeText(text);
  showToast('Copied to clipboard.');
}

function downloadBlob(blob, filename){
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function titleFor(view){
  return {
    dashboard:'Your daily command center',
    tasks:'Task manager',
    notes:'Notes workspace',
    focus:'Pomodoro focus',
    habits:'Habit tracker',
    bookmarks:'Bookmark vault',
    settings:'Settings and backup'
  }[view];
}

function subtitleFor(view){
  return {
    dashboard:'A live overview of your tasks, notes, habits, and focus rhythm.',
    tasks:'Capture priorities, complete them, and keep the list clean.',
    notes:'Write fast, auto-save instantly, and keep everything searchable.',
    focus:'Use a simple work/break loop that helps you stay locked in.',
    habits:'Track tiny daily wins and keep streaks visible.',
    bookmarks:'Save useful links instead of scattering them across tabs.',
    settings:'Tune the theme, export backups, or reset the sample data.'
  }[view];
}

function todaySummary(){
  const open = state.tasks.filter(t => !t.done).length;
  const notes = state.notes.length;
  return `${open} open · ${notes} notes`;
}

function doneCount(){
  return state.tasks.filter(t => t.done).length;
}

function taskProgress(){
  return state.tasks.length ? Math.round(doneCount()/state.tasks.length * 100) : 0;
}

function timerProgress(){
  const total = state.timer.mode === 'work' ? state.timer.work * 60 : state.timer.break * 60;
  return Math.round((1 - state.timer.remaining / total) * 100);
}

function focusChart(){
  const minutes = state.stats.focusMinutes || 0;
  const bars = Array.from({length:7}, (_,i) => {
    const h = Math.max(14, Math.min(100, (minutes / 7) + (i%3)*6 + 12));
    return `<div style="display:grid;gap:8px;justify-items:center;align-items:end">
      <div style="height:120px;display:flex;align-items:end"><div style="width:22px;height:${h}px;border-radius:10px;background:linear-gradient(180deg,var(--accent),var(--accent2))"></div></div>
      <span class="small">D${i+1}</span>
    </div>`;
  }).join('');
  return `<div style="display:flex;gap:10px;justify-content:space-between;align-items:end;padding-top:8px">${bars}</div>`;
}

function streakMap(){
  const days = 14;
  const out = [];
  for(let i=days-1;i>=0;i--){
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0,10);
    const count = state.habits.filter(h => h.completions?.[key]).length;
    out.push(`<div class="card" style="padding:12px;display:flex;justify-content:space-between">
      <span>${key.slice(5)}</span>
      <strong>${count}/${state.habits.length}</strong>
    </div>`);
  }
  return `<div class="list">${out.join('')}</div>`;
}

function formatTime(seconds){
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function formatDate(ms){
  if(!ms) return 'just now';
  return new Date(ms).toLocaleDateString(undefined, {month:'short', day:'numeric', hour:'numeric', minute:'2-digit'});
}

function snippet(text){
  return (text || '').replace(/\s+/g,' ').trim().slice(0, 90) || 'Empty note';
}

function slug(text){
  return text.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'') || 'note';
}

function shortcutLabel(n){ return String(n); }

function escapeHtml(str=''){
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

function escapeAttr(str=''){ return escapeHtml(str).replace(/'/g,'&#39;'); }

