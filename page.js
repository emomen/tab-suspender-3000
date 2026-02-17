function qs(selector, el = document) { return el.querySelector(selector); }
function qsa(selector, el = document) { return Array.from(el.querySelectorAll(selector)); }

const listEl = qs('#list');
const statusEl = qs('#status');
const refreshBtn = qs('#refreshBtn');
const suspendBtn = qs('#suspendBtn');

function setStatus(txt, timeout = 3000) {
  statusEl.textContent = txt;
  if (timeout) setTimeout(() => { if (statusEl.textContent === txt) statusEl.textContent = ''; }, timeout);
}

async function getWindows() {
  return new Promise(resolve => chrome.windows.getAll({ populate: true }, resolve));
}

function clearList() { listEl.innerHTML = ''; }
// storage helpers for collapsed windows
function loadCollapsedIds() {
  return new Promise(resolve => {
    chrome.storage.local.get({ collapsedWindowIds: [] }, res => {
      const set = new Set((res.collapsedWindowIds || []).map(String));
      resolve(set);
    });
  });
}

function saveCollapsedIds(set) {
  const arr = Array.from(set);
  return new Promise(resolve => chrome.storage.local.set({ collapsedWindowIds: arr }, resolve));
}

function render(windows, collapsedSet = new Set()) {
  clearList();
  if (!windows || windows.length === 0) { listEl.textContent = 'No windows found'; return; }

  windows.forEach(win => {
    const winDiv = document.createElement('div');
    winDiv.className = 'window';

    const header = document.createElement('div');
    header.className = 'window-header';

    const winCheckbox = document.createElement('input');
    winCheckbox.type = 'checkbox';
    winCheckbox.dataset.windowId = win.id;
    winCheckbox.className = 'window-checkbox';

    const winLabel = document.createElement('a');
    winLabel.href = '#';
    winLabel.textContent = `Window ${win.id} (${win.tabs ? win.tabs.length : 0} tabs)`;
    // winLabel.style.textDecoration = 'none'; // commented out to allow underline on hover
    winLabel.addEventListener('click', (e) => {
      e.preventDefault();
      // focus the window
      chrome.windows.update(win.id, { focused: true }, () => {
        const err = chrome.runtime.lastError;
        if (err) setStatus('Error focusing window: ' + err.message, 4000);
      });
    });

    const collapseBtn = document.createElement('button');
    collapseBtn.type = 'button';
    collapseBtn.className = 'collapse-btn';
    collapseBtn.dataset.windowId = win.id;
    collapseBtn.setAttribute('aria-expanded', 'true');
    collapseBtn.textContent = '▾';

    header.appendChild(winCheckbox);
    header.appendChild(winLabel);
    header.appendChild(collapseBtn);

    winDiv.appendChild(header);

    const tabsContainer = document.createElement('div');
    tabsContainer.className = 'tabs';

    (win.tabs || []).forEach(tab => {
      const t = document.createElement('div');
      t.className = 'tab';

      const tabCheckbox = document.createElement('input');
      tabCheckbox.type = 'checkbox';
      tabCheckbox.dataset.tabId = tab.id;
      tabCheckbox.dataset.windowId = win.id;
      tabCheckbox.className = 'tab-checkbox';

      const status = document.createElement('span');
      status.className = 'status ' + (tab.discarded ? 'suspended' : 'active');
      status.title = tab.discarded ? 'Suspended tab' : 'Active tab';

      const title = document.createElement('a');
      title.className = 'title';
      title.href = '#';
      title.textContent = tab.title || tab.url || 'Untitled';
      // title.style.textDecoration = 'none'; // commented out to allow underline on hover
      title.addEventListener('click', (e) => {
        e.preventDefault();
        // focus window then activate tab
        chrome.windows.update(win.id, { focused: true }, () => {
          const werr = chrome.runtime.lastError;
          if (werr) { setStatus('Error focusing window: ' + werr.message, 4000); return; }
          chrome.tabs.update(tab.id, { active: true }, () => {
            const terr = chrome.runtime.lastError;
            if (terr) setStatus('Error activating tab: ' + terr.message, 4000);
          });
        });
      });

      const url = document.createElement('a');
      url.href = tab.url || '#';
      url.textContent = tab.favIconUrl ? '' : '';
      url.title = tab.url || '';
      url.target = '_blank';
      url.rel = 'noreferrer';

      t.appendChild(tabCheckbox);
      t.appendChild(status);
      t.appendChild(title);
      t.appendChild(url);
      tabsContainer.appendChild(t);
    });

    winDiv.appendChild(tabsContainer);
    listEl.appendChild(winDiv);

    // apply collapsed state from storage if present
    if (collapsedSet.has(String(win.id))) {
      setCollapsedState(winDiv, true, false);
    }
  });

  attachEvents();
}

async function setCollapsedState(winEl, collapsed, persist = true) {
  const btn = winEl.querySelector('.collapse-btn');
  if (!btn) return;
  const wid = String(btn.dataset.windowId || (winEl.dataset && winEl.dataset.windowId));
  if (collapsed) {
    winEl.classList.add('collapsed');
    btn.setAttribute('aria-expanded', 'false');
    btn.textContent = '▸';
  } else {
    winEl.classList.remove('collapsed');
    btn.setAttribute('aria-expanded', 'true');
    btn.textContent = '▾';
  }

  if (!persist || !wid) return;

  // persist change
  const set = await loadCollapsedIds();
  if (collapsed) set.add(wid); else set.delete(wid);
  await saveCollapsedIds(set);
}

function attachEvents() {
  qsa('.window-checkbox').forEach(wc => {
    wc.addEventListener('change', e => {
      const wid = e.target.dataset.windowId;
      qsa(`.tab-checkbox[data-window-id='${wid}']`).forEach(tc => tc.checked = e.target.checked);
    });
  });

  qsa('.tab-checkbox').forEach(tc => {
    tc.addEventListener('change', e => {
      const wid = e.target.dataset.windowId;
      const tabBoxes = qsa(`.tab-checkbox[data-window-id='${wid}']`);
      const winBox = qs(`.window-checkbox[data-window-id='${wid}']`);
      if (!winBox) return;
      winBox.checked = tabBoxes.length > 0 && tabBoxes.every(b => b.checked);
    });
  });
  qsa('.collapse-btn').forEach(cb => {
    cb.addEventListener('click', e => {
      const winEl = e.target.closest('.window');
      if (!winEl) return;
      const expanded = e.target.getAttribute('aria-expanded') === 'true';
      setCollapsedState(winEl, expanded, true);
    });
  });
}

async function refresh() {
  setStatus('Refreshing...');
  try {
    const wins = await getWindows();
    const collapsedSet = await loadCollapsedIds();
    render(wins, collapsedSet);
    setStatus('Refreshed', 900);
  } catch (err) {
    setStatus('Error reading windows/tabs: ' + (err && err.message), 5000);
  }
}

async function suspendSelected() {
  const selected = qsa('.tab-checkbox').filter(cb => cb.checked).map(cb => Number(cb.dataset.tabId));
  if (selected.length === 0) { setStatus('No tabs selected'); return; }

  suspendBtn.disabled = true;
  refreshBtn.disabled = true;
  setStatus(`Suspending ${selected.length} tab(s)...`, 0);

  const results = [];
  for (const tabId of selected) {
    try {
      await new Promise((resolve, reject) => chrome.tabs.discard(tabId, res => {
        const err = chrome.runtime.lastError;
        if (err) return reject(err);
        resolve(res);
      }));
      results.push({ tabId, ok: true });
    } catch (err) {
      results.push({ tabId, ok: false, error: err.message });
    }
  }

  const failed = results.filter(r => !r.ok);
  if (failed.length === 0) setStatus(`Suspended ${results.length} tab(s)`, 3000);
  else setStatus(`Suspended ${results.length - failed.length}; ${failed.length} failed`, 5000);

  suspendBtn.disabled = false;
  refreshBtn.disabled = false;
  refresh();
}

document.addEventListener('DOMContentLoaded', () => {
  refreshBtn.addEventListener('click', refresh);
  suspendBtn.addEventListener('click', suspendSelected);
  const themeBtn = qs('#themeToggle');
  const collapseAllBtn = qs('#collapseAllBtn');
  const expandAllBtn = qs('#expandAllBtn');
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    if (themeBtn) {
      themeBtn.setAttribute('aria-pressed', theme === 'dark');
      themeBtn.textContent = theme === 'dark' ? 'Dark' : 'Light';
    }
  }

  function loadTheme() {
    chrome.storage.local.get({ theme: 'light' }, res => {
      applyTheme(res.theme || 'light');
    });
  }

  if (themeBtn) themeBtn.addEventListener('click', () => {
    chrome.storage.local.get({ theme: 'light' }, res => {
      const next = (res.theme === 'dark') ? 'light' : 'dark';
      chrome.storage.local.set({ theme: next }, () => applyTheme(next));
    });
  });

  if (collapseAllBtn) collapseAllBtn.addEventListener('click', () => {
    // collapse all windows and persist
    (async () => {
      qsa('.window').forEach(w => setCollapsedState(w, true, false));
      // update storage with all window ids
      const ids = qsa('.collapse-btn').map(b => String(b.dataset.windowId || b.getAttribute('data-window-id'))).filter(Boolean);
      await saveCollapsedIds(new Set(ids));
    })();
  });

  if (expandAllBtn) expandAllBtn.addEventListener('click', () => {
    // expand all windows and clear persisted state
    (async () => {
      qsa('.window').forEach(w => setCollapsedState(w, false, false));
      await saveCollapsedIds(new Set());
    })();
  });

  loadTheme();
  refresh();
});
