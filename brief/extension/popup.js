// Claude Brief — popup
// Anchored to the extension icon by Chrome. Picks intent + language,
// requests the tab capture streamId (must be inside a user-gesture click
// handler), then hands the streamId to the active tab's content script
// which injects the recording bar.

const startBtn = document.getElementById('start');
const langSelect = document.getElementById('lang');
const permLink = document.getElementById('permLink');

// Load persisted prefs
(async () => {
  const { lang, intent } = await chrome.storage.local.get(['lang', 'intent']);
  if (lang) langSelect.value = lang;
  if (intent) {
    const r = document.querySelector(`input[name="intent"][value="${intent}"]`);
    if (r) r.checked = true;
  }
})();

langSelect.addEventListener('change', () => {
  chrome.storage.local.set({ lang: langSelect.value });
});
document.querySelectorAll('input[name="intent"]').forEach((r) => {
  r.addEventListener('change', () => {
    if (r.checked) chrome.storage.local.set({ intent: r.value });
  });
});

permLink?.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: chrome.runtime.getURL('permission.html') });
  window.close();
});

function getIntent() {
  const checked = document.querySelector('input[name="intent"]:checked');
  return checked?.value || 'issue';
}

async function checkMicPermission() {
  try {
    if (navigator.permissions?.query) {
      const s = await navigator.permissions.query({ name: 'microphone' });
      return s.state;
    }
  } catch {}
  return 'prompt';
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

startBtn.addEventListener('click', async () => {
  startBtn.disabled = true;
  try {
    // Active tab — must be a normal web page
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab?.url || /^(chrome|edge|chrome-extension|about):/.test(tab.url)) {
      alert('Claude Brief can only record web pages. Switch to a normal tab and try again.');
      window.close();
      return;
    }

    // Mic permission
    const mic = await checkMicPermission();
    if (mic !== 'granted') {
      const proceed = confirm(
        "Microphone access isn't granted yet.\n\n" +
          "I'll open a tab where you can grant it. After clicking Allow, " +
          'come back and click the extension icon again.',
      );
      if (proceed) {
        chrome.tabs.create({ url: chrome.runtime.getURL('permission.html') });
      }
      window.close();
      return;
    }

    // Make sure content script is alive in this tab
    await ensureContentScript(tab.id);

    // Tab capture streamId — must be requested here (user-gesture context)
    const streamId = await new Promise((resolve, reject) => {
      chrome.tabCapture.getMediaStreamId(
        { targetTabId: tab.id },
        (id) => {
          if (chrome.runtime.lastError || !id) {
            reject(new Error(chrome.runtime.lastError?.message || 'no_stream_id'));
          } else {
            resolve(id);
          }
        },
      );
    });

    // Hand off to content script: inject the recording bar
    await chrome.tabs.sendMessage(tab.id, {
      type: 'INJECT_BAR',
      streamId,
      lang: langSelect.value || 'en-US',
      intent: getIntent(),
    });

    window.close();
  } catch (err) {
    console.error('[brief/popup] start failed:', err);
    alert(`Could not start: ${err?.message || err}`);
    startBtn.disabled = false;
  }
});
