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

function clearList(){ listEl.innerHTML = ''; }

function render(windows) {
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

    const winLabel = document.createElement('span');
    winLabel.textContent = `Window ${win.id} (${win.tabs ? win.tabs.length : 0} tabs)`;

    header.appendChild(winCheckbox);
    header.appendChild(winLabel);

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

      const title = document.createElement('span');
      title.className = 'title';
      title.textContent = tab.title || tab.url || 'Untitled';

      const url = document.createElement('a');
      url.href = tab.url || '#';
      url.textContent = tab.favIconUrl ? '' : '';
      url.title = tab.url || '';
      url.target = '_blank';
      url.rel = 'noreferrer';

      t.appendChild(tabCheckbox);
      t.appendChild(title);
      t.appendChild(url);
      tabsContainer.appendChild(t);
    });

    winDiv.appendChild(tabsContainer);
    listEl.appendChild(winDiv);
  });

  attachEvents();
}

function attachEvents(){
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
}

async function refresh() {
  setStatus('Refreshing...');
  try {
    const wins = await getWindows();
    render(wins);
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

  loadTheme();
  refresh();
});
