// Brief — background service worker
// Thin coordinator: collects per-tab events during recording and runs
// chrome.downloads from blob URLs the bar creates.

// On install / update, inject the content script into already-open tabs.
chrome.runtime.onInstalled.addListener(async () => {
  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (!tab.id || !tab.url) continue;
      if (/^(chrome|edge|chrome-extension|about|file|view-source):/i.test(tab.url)) continue;
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js'],
        });
      } catch {}
    }
  } catch (err) {
    console.warn('[brief/background] on-install inject:', err);
  }
});

const STATE = {
  recording: false,
  briefId: null,
  events: [],
  activeTabAtStart: null,
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      switch (message?.type) {
        case 'BRIEF_START':
          STATE.recording = true;
          STATE.briefId = message.briefId;
          STATE.events = [];
          try {
            const tab = sender?.tab
              ? { url: sender.tab.url, title: sender.tab.title, id: sender.tab.id }
              : null;
            STATE.activeTabAtStart = tab;
            // Install page-world console/error capture for this tab
            if (tab?.id) {
              try {
                await chrome.scripting.executeScript({
                  target: { tabId: tab.id },
                  world: 'MAIN',
                  func: installConsoleCapture,
                });
              } catch (err) {
                console.warn('[brief/background] console capture inject:', err);
              }
            }
          } catch {
            STATE.activeTabAtStart = null;
          }
          sendResponse({ ok: true });
          break;

        case 'BRIEF_STOP':
          STATE.recording = false;
          sendResponse({ ok: true });
          break;

        case 'EVENT':
          if (STATE.recording && message.payload) {
            STATE.events.push(message.payload);
          }
          sendResponse({ ok: true });
          break;

        case 'GET_BRIEF_META':
          sendResponse({
            events: STATE.events.slice(),
            pageUrl: STATE.activeTabAtStart?.url || null,
            pageTitle: STATE.activeTabAtStart?.title || null,
          });
          break;

        case 'DOWNLOAD_ZIP':
          await downloadZip(message.payload);
          sendResponse({ ok: true });
          break;

        default:
          sendResponse({ ok: false, error: 'unknown_message' });
      }
    } catch (err) {
      console.error('[brief/background]', err);
      sendResponse({ ok: false, error: String(err?.message || err) });
    }
  })();
  return true; // async response
});

async function downloadZip({ blobUrl, filename }) {
  const downloadId = await new Promise((resolve, reject) => {
    chrome.downloads.download(
      { url: blobUrl, filename, conflictAction: 'uniquify', saveAs: false },
      (id) => {
        if (chrome.runtime.lastError || !id) {
          reject(new Error(chrome.runtime.lastError?.message || 'download_failed'));
        } else {
          resolve(id);
        }
      },
    );
  });

  await new Promise((resolve, reject) => {
    const listener = (delta) => {
      if (delta.id !== downloadId) return;
      if (delta.state?.current === 'complete') {
        chrome.downloads.onChanged.removeListener(listener);
        resolve();
      } else if (delta.state?.current === 'interrupted') {
        chrome.downloads.onChanged.removeListener(listener);
        reject(new Error('download_interrupted'));
      }
    };
    chrome.downloads.onChanged.addListener(listener);
    setTimeout(() => {
      chrome.downloads.onChanged.removeListener(listener);
      resolve();
    }, 60_000);
  });
}

// ---------- Page-world console capture (injected via executeScript world:'MAIN') ----------
// Patches console.error and window error handlers. Each captured event posts a
// message that our content script picks up and forwards as an EVENT.
function installConsoleCapture() {
  if (window.__briefConsoleInstalled) return;
  window.__briefConsoleInstalled = true;

  const serialize = (a) => {
    try {
      if (a == null) return String(a);
      if (typeof a === 'string') return a.slice(0, 500);
      if (a instanceof Error) return `${a.name}: ${a.message}`;
      return JSON.stringify(a).slice(0, 500);
    } catch {
      return String(a).slice(0, 500);
    }
  };

  const orig = console.error;
  console.error = function (...args) {
    try {
      window.postMessage({
        __brief: 'console-error',
        args: args.map(serialize),
      }, '*');
    } catch {}
    return orig.apply(this, args);
  };

  window.addEventListener('error', (e) => {
    try {
      window.postMessage({
        __brief: 'js-error',
        message: e.message,
        filename: e.filename,
        lineno: e.lineno,
        colno: e.colno,
      }, '*');
    } catch {}
  });

  window.addEventListener('unhandledrejection', (e) => {
    try {
      window.postMessage({
        __brief: 'promise-rejection',
        reason: serialize(e.reason),
      }, '*');
    } catch {}
  });
}
