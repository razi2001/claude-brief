// Claude Brief — popup
//
// On open:
//   1. Fast-path: if we have a cached "mic granted" flag from a recent
//      session, reveal the UI immediately. Probe in background to refresh
//      the cache for next time.
//   2. Slow path (no cache): probe getUserMedia synchronously. If granted,
//      reveal and cache. If not, redirect to permission page.

const startRecordBtn = document.getElementById('startRecord');
const sendInboxBtn = document.getElementById('sendInbox');
const inboxRow = document.getElementById('inboxRow');
const inboxCountEl = document.getElementById('inboxCount');
const langSelect = document.getElementById('lang');
const settingsBtn = document.getElementById('settingsBtn');

// Storage key for cached mic grant. Cache is good for the extension's
// session — Chrome invalidates the underlying grant if the user revokes it.
const MIC_CACHE_KEY = 'micGrantedAt';
const MIC_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 1 day

(async () => {
  // Fast path: check the cache. If a recent grant exists, reveal UI now,
  // probe in the background to refresh.
  const { [MIC_CACHE_KEY]: grantedAt } = await chrome.storage.local.get(MIC_CACHE_KEY);
  const cacheFresh = grantedAt && (Date.now() - grantedAt < MIC_CACHE_TTL_MS);
  if (cacheFresh) {
    document.body.classList.add('ready');
    // Refresh the cache silently for next time (don't await — don't block UI)
    probeMic().then((ok) => {
      if (ok) {
        chrome.storage.local.set({ [MIC_CACHE_KEY]: Date.now() });
      } else {
        chrome.storage.local.remove(MIC_CACHE_KEY);
      }
    });
    return;
  }
  // Slow path: must actually probe
  const ok = await probeMic();
  if (!ok) {
    await chrome.tabs.create({ url: chrome.runtime.getURL('permission.html') });
    window.close();
    return;
  }
  await chrome.storage.local.set({ [MIC_CACHE_KEY]: Date.now() });
  document.body.classList.add('ready');
})();

// ---------- Custom language dropdown ----------
const langControl = document.getElementById('langControl');
const langTrigger = document.getElementById('langTrigger');
const langMenu = document.getElementById('langMenu');
const langValue = document.getElementById('langValue');
const langOpts = Array.from(document.querySelectorAll('.lang-opt'));

function setLang(value) {
  langSelect.value = value;
  const opt = langOpts.find((o) => o.dataset.value === value) || langOpts[0];
  langValue.textContent = opt.textContent;
  langOpts.forEach((o) => o.setAttribute('aria-selected', String(o === opt)));
  chrome.storage.local.set({ lang: value });
}

function openLangMenu() {
  langMenu.hidden = false;
  langControl.classList.add('open');
  langTrigger.setAttribute('aria-expanded', 'true');
}
function closeLangMenu() {
  langMenu.hidden = true;
  langControl.classList.remove('open');
  langTrigger.setAttribute('aria-expanded', 'false');
}

langTrigger.addEventListener('click', (e) => {
  e.stopPropagation();
  if (langMenu.hidden) openLangMenu();
  else closeLangMenu();
});
langOpts.forEach((opt) => {
  opt.addEventListener('click', (e) => {
    e.stopPropagation();
    setLang(opt.dataset.value);
    closeLangMenu();
  });
});
document.addEventListener('click', () => closeLangMenu());
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeLangMenu(); });

// Load persisted prefs
(async () => {
  const { lang } = await chrome.storage.local.get(['lang']);
  setLang(lang || 'en-US');
})();

async function probeMic() {
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    return true;
  } catch (err) {
    console.warn('[brief/popup] mic probe failed:', err?.name, err?.message);
    return false;
  }
}

async function ensureContentScript(tabId) {
  try {
    const r = await chrome.tabs.sendMessage(tabId, { type: 'PING' });
    if (r?.ok) return;
  } catch {}
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['content.js'],
  });
  await new Promise((r) => setTimeout(r, 50));
}

function showInlineError(msg) {
  let bar = document.getElementById('errBar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'errBar';
    bar.className = 'err-bar';
    document.getElementById('app').appendChild(bar);
  }
  bar.textContent = msg;
  bar.classList.add('show');
}

function clearInlineError() {
  const bar = document.getElementById('errBar');
  if (bar) bar.classList.remove('show');
}

async function startRecording() {
  // Always records to the inbox. On stop, the brief is queued silently.
  clearInlineError();
  startRecordBtn.disabled = true;
  startRecordBtn.classList.add('loading');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab?.url || /^(chrome|edge|chrome-extension|about):/.test(tab.url)) {
      showInlineError('Switch to a regular web page to record.');
      startRecordBtn.disabled = false;
      startRecordBtn.classList.remove('loading');
      return;
    }

    // Tear down any leftover recording infrastructure first
    try {
      await chrome.runtime.sendMessage({ type: 'RESET_BEFORE_NEW_RECORDING' });
    } catch {}

    await ensureContentScript(tab.id);

    const streamId = await new Promise((resolve, reject) => {
      chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id }, (id) => {
        if (chrome.runtime.lastError || !id) {
          reject(new Error(chrome.runtime.lastError?.message || 'no_stream_id'));
        } else {
          resolve(id);
        }
      });
    });

    await chrome.tabs.sendMessage(tab.id, {
      type: 'INJECT_BAR',
      streamId,
      lang: langSelect.value || 'en-US',
      intent: 'issue',
      mode: 'inbox', // everything goes to the inbox now
    });

    window.close();
  } catch (err) {
    console.error('[brief/popup] start failed:', err);
    showInlineError(`Could not start: ${err?.message || err}`);
    startRecordBtn.disabled = false;
    startRecordBtn.classList.remove('loading');
  }
}

startRecordBtn.addEventListener('click', startRecording);

settingsBtn?.addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('settings.html') });
  window.close();
});

// Render the inbox row (only visible when there's something in it)
async function refreshInbox() {
  const { inbox } = await chrome.storage.local.get('inbox');
  const items = Array.isArray(inbox) ? inbox : [];
  if (items.length === 0) {
    inboxRow.hidden = true;
    return;
  }
  inboxRow.hidden = false;
  inboxCountEl.textContent = String(items.length);
}
refreshInbox();

sendInboxBtn.addEventListener('click', async () => {
  const { inbox } = await chrome.storage.local.get('inbox');
  const items = Array.isArray(inbox) ? inbox : [];
  if (items.length === 0) return;
  const ids = items.map((b) => b.id).join(', ');
  // Minimal prompt — the skill's inbox.md does all the work
  const prompt = `Use the brief skill to process my inbox: briefs ${ids}.`;
  try {
    await navigator.clipboard.writeText(prompt);
  } catch {}
  // Clear inbox locally — they're now handed off to Claude
  await chrome.storage.local.set({ inbox: [] });
  chrome.runtime.sendMessage({ type: 'INBOX_CHANGED' }).catch(() => {});
  sendInboxBtn.textContent = '✓ Copied';
  sendInboxBtn.classList.add('copied');
  setTimeout(() => window.close(), 1400);
});
