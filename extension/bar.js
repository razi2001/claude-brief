// Claude Brief — bar (UI only)
//
// All recording happens in the offscreen document (chrome-extension origin,
// immune to page Permissions-Policy). The bar sends control messages via
// background.js and receives transcript updates + the final blob back.

import { makeZip } from './lib/zip.js';

const SAVED_AUTODISMISS_MS = 5000;

// ---------- Params ----------
const params = new URLSearchParams(location.hash.slice(1));
const streamId = params.get('streamId');
const lang = params.get('lang') || 'en-US';
const intent = params.get('intent') || 'issue';
const mode = params.get('mode') || 'ship'; // 'ship' | 'inbox'

// ---------- DOM ----------
const body = document.body;
const stopBtn = document.getElementById('stopBtn');
const muteBtn = document.getElementById('muteBtn');
const cancelBtn = document.getElementById('cancelBtn');
const closeBtn = document.getElementById('closeBtn');
const errCloseBtn = document.getElementById('errCloseBtn');
const timerEl = document.getElementById('timer');
const intentTagEl = document.getElementById('intentTag');
const transcriptText = document.getElementById('transcriptText');
const transcriptPanel = document.getElementById('transcriptPanel');
const errTextEl = document.getElementById('errText');

// ---------- State ----------
const briefId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
let recordingStartMs = 0;
let timerInterval = null;
let muted = false;
let savedDismissTimer = null;
let transcriptFinalCache = '';
let transcriptInterimCache = '';
let transcriptChunksCache = [];
let recognizer = null;
let recognitionShouldRun = false;
// Guard: RECORDING_FINISHED can arrive twice (offscreen broadcasts via
// chrome.runtime.sendMessage which reaches the bar directly, AND background
// also tab-relays to all frames in the tab). We only want to build/download
// the zip once.
let finishHandled = false;

// ---------- Intent tag (always "Issue" — Brief is ticket-only now) ----------
if (intentTagEl) intentTagEl.textContent = 'Issue';

// ---------- Iframe sizing ----------
function postToParent(type, payload = {}) {
  window.parent.postMessage({ app: 'brief', type, ...payload }, '*');
}
function closeParent() { postToParent('close'); }

function currentLayout() {
  const SHADOW_PAD = 28;
  const stateName = body.className.replace('state-', '');
  if (stateName === 'recording') {
    const panelH = transcriptPanel?.offsetHeight || 0;
    return {
      width: 360 + SHADOW_PAD,
      height: 52 + (panelH ? 8 + panelH : 0) + SHADOW_PAD,
    };
  }
  return { width: 360 + SHADOW_PAD, height: 52 + SHADOW_PAD };
}
function scheduleResize() {
  requestAnimationFrame(() => {
    const { width, height } = currentLayout();
    postToParent('layout', { width, height });
  });
}
new ResizeObserver(scheduleResize).observe(document.body);

// ---------- View routing ----------
function setView(name) {
  body.className = `state-${name}`;
  if (transcriptPanel) transcriptPanel.hidden = name !== 'recording';
  scheduleResize();
  if (savedDismissTimer && name !== 'saved' && name !== 'inboxed') {
    clearTimeout(savedDismissTimer);
    savedDismissTimer = null;
  }
}
function showError(message) {
  errTextEl.textContent = message;
  setView('error');
  setTimeout(closeParent, 6000);
}

// ---------- Offscreen control ----------
async function sendToOffscreen(type, extra = {}) {
  return chrome.runtime.sendMessage({ target: 'offscreen', type, ...extra });
}

// ---------- Init ----------
(async function init() {
  if (!streamId) { showError('Missing stream ID.'); return; }
  setView('loading');
  try {
    const res = await sendToOffscreen('START', { streamId, lang });
    if (!res?.ok) {
      const err = res?.error || 'unknown_error';
      if (/NotAllowedError|not allowed|permission/i.test(err)) {
        // Mic denied at the extension origin level. Open the permission
        // page in a new tab so the user can grant it there (Jam-style),
        // and close the bar — no point keeping it on screen.
        chrome.runtime.sendMessage({ type: 'OPEN_PERMISSION_PAGE' }).catch(() => {});
        closeParent();
        return;
      } else if (/NotFoundError/i.test(err)) {
        showError('No microphone found.');
      } else {
        showError(err);
      }
      return;
    }
    // RECORDING_STARTED message will arrive shortly and we transition to recording UI
  } catch (err) {
    console.error('[brief/bar] start failed:', err);
    showError(String(err?.message || err));
  }
})();

// ---------- Listen for messages from offscreen (via background) ----------
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.target !== 'bar') return false;

  if (message.type === 'RECORDING_STARTED') {
    recordingStartMs = message.startedAt || Date.now();
    chrome.runtime.sendMessage({ type: 'BRIEF_START', briefId, startedAt: recordingStartMs }).catch(() => {});
    setView('recording');
    startTimer();
    // Start speech recognition here in the bar — it doesn't work in offscreen
    // documents (they're invisible and SR silently fails to produce results).
    startSpeechRecognition();
  } else if (message.type === 'TRANSCRIPT_UPDATE') {
    // Legacy path from offscreen, kept for safety
    transcriptFinalCache = message.final || '';
    transcriptInterimCache = message.interim || '';
    renderTranscript(transcriptFinalCache, transcriptInterimCache);
  } else if (message.type === 'RECORDING_FINISHED') {
    // Dedupe: this message can arrive multiple times via different relay paths
    if (finishHandled) {
      sendResponse({ ok: true });
      return false;
    }
    finishHandled = true;
    handleRecordingFinished(message).catch((err) => {
      console.error('[brief/bar] finish failed:', err);
      showError(String(err?.message || err));
    });
  }
  sendResponse({ ok: true });
  return false;
});

// ---------- Timer ----------
function startTimer() {
  if (timerInterval) clearInterval(timerInterval);
  const tick = () => {
    const total = Math.max(0, Math.floor((Date.now() - recordingStartMs) / 1000));
    timerEl.textContent =
      `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  };
  tick();
  timerInterval = setInterval(tick, 500);
}
function stopTimer() { if (timerInterval) clearInterval(timerInterval); timerInterval = null; }

// ---------- Speech recognition (in the bar, NOT in offscreen) ----------
function startSpeechRecognition() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    renderTranscript('', '', 'Speech recognition not available.');
    return;
  }
  recognizer = new Recognition();
  recognizer.continuous = true;
  recognizer.interimResults = true;
  recognizer.lang = lang;
  recognitionShouldRun = true;

  recognizer.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      const text = r[0].transcript;
      if (r.isFinal) {
        const trimmed = text.trim();
        if (trimmed) {
          transcriptChunksCache.push({
            tMs: Date.now() - recordingStartMs,
            text: trimmed,
          });
        }
        transcriptFinalCache += text;
      } else {
        interim += text;
      }
    }
    transcriptInterimCache = interim;
    renderTranscript(transcriptFinalCache, transcriptInterimCache);
  };

  recognizer.onerror = (e) => {
    // 'not-allowed' on some pages (Permissions-Policy blocks SR in iframes
    // on certain sites). Don't spam logs and don't restart — recording
    // continues fine without live transcription; Whisper can transcribe
    // from the audio later if needed.
    if (e.error === 'not-allowed') {
      recognitionShouldRun = false;
      renderTranscript('', '', 'Recording (live transcript unavailable on this site)');
      return;
    }
    if (e.error === 'no-speech' || e.error === 'audio-capture') {
      // Recoverable — let onend restart
      return;
    }
    console.warn('[brief/bar] SR error:', e.error);
  };

  recognizer.onend = () => {
    if (recognitionShouldRun) {
      try { recognizer.start(); } catch {}
    }
  };

  try { recognizer.start(); } catch (err) {
    console.warn('[brief/bar] SR start failed:', err);
  }
}

function stopSpeechRecognition() {
  recognitionShouldRun = false;
  try { recognizer?.stop(); } catch {}
  recognizer = null;
}

// ---------- Transcript ticker ----------
function renderTranscript(finalText, interimText, placeholder) {
  if (!transcriptText) return;
  if (placeholder) {
    transcriptText.innerHTML = `<span class="placeholder">${placeholder}</span>`;
    return;
  }
  const finalTrim = (finalText || '').trim();
  const interimTrim = (interimText || '').trim();
  if (!finalTrim && !interimTrim) {
    transcriptText.innerHTML = '<span class="placeholder">Listening…</span>';
    return;
  }
  let ticker = transcriptText.querySelector('.ticker');
  if (!ticker) {
    transcriptText.innerHTML = '<span class="ticker"></span>';
    ticker = transcriptText.querySelector('.ticker');
  }
  // Final text in cream, interim text in muted italic via .interim child
  const finalPart = finalTrim ? `<span class="final">${escapeHtml(finalTrim)}</span>` : '';
  const sep = finalTrim && interimTrim ? ' ' : '';
  const interimPart = interimTrim ? `<span class="interim">${escapeHtml(interimTrim)}</span>` : '';
  ticker.innerHTML = `${finalPart}${sep}${interimPart}`;
  // Pin right edge of growing text to viewport edge — older text scrolls left
  requestAnimationFrame(() => {
    const viewport = transcriptText.offsetWidth;
    const lineW = ticker.scrollWidth;
    const dx = Math.max(0, lineW - viewport);
    ticker.style.transform = `translateX(-${dx}px)`;
  });
}
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ---------- Mute ----------
muteBtn?.addEventListener('click', async () => {
  muted = !muted;
  await sendToOffscreen('MUTE', { muted });
  muteBtn.classList.toggle('active', muted);
});

// ---------- Drag-to-move ----------
const dragGrip = document.getElementById('dragGrip');
let dragging = false;

dragGrip?.addEventListener('mousedown', (e) => {
  e.preventDefault();
  dragging = true;
  document.body.classList.add('dragging');
  // Send the mouse position relative to the iframe so content.js can
  // compute deltas from page-level mouse events that follow.
  postToParent('dragStart', { localX: e.clientX, localY: e.clientY });
});

// Note: we don't listen for mousemove/mouseup here. Once dragStart fires,
// content.js disables iframe pointer-events and installs its own page-level
// mouse listeners, so the drag continues smoothly even when the cursor
// leaves the small iframe area.
window.addEventListener('mouseup', () => {
  if (!dragging) return;
  dragging = false;
  document.body.classList.remove('dragging');
});

// ---------- Stop & save ----------
stopBtn?.addEventListener('click', async () => {
  stopBtn.disabled = true;
  if (cancelBtn) cancelBtn.disabled = true;
  stopTimer();
  stopSpeechRecognition();
  setView('saving');
  await sendToOffscreen('STOP', {
    transcriptFinal: transcriptFinalCache,
    transcriptChunks: transcriptChunksCache,
  });
  // The finished payload comes back via RECORDING_FINISHED message
});

// ---------- Cancel ----------
cancelBtn?.addEventListener('click', async () => {
  cancelBtn.disabled = true;
  if (stopBtn) stopBtn.disabled = true;
  stopTimer();
  stopSpeechRecognition();
  await sendToOffscreen('CANCEL');
  chrome.runtime.sendMessage({ type: 'BRIEF_STOP' }).catch(() => {});
  setView('cancelled');
  setTimeout(closeParent, 2000);
});

closeBtn?.addEventListener('click', closeParent);
errCloseBtn?.addEventListener('click', closeParent);
document.getElementById('inboxCloseBtn')?.addEventListener('click', closeParent);

// ---------- Build zip + save ----------
async function handleRecordingFinished({ recordingB64, mimeType, durationMs, transcriptFinal, transcriptChunks, keyframes }) {
  chrome.runtime.sendMessage({ type: 'BRIEF_STOP' }).catch(() => {});

  // Get the event list + page meta from background
  let meta = { events: [], pageUrl: null, pageTitle: null };
  try {
    meta = await chrome.runtime.sendMessage({ type: 'GET_BRIEF_META' });
  } catch {}

  // Decode recording from base64
  const recordingBytes = base64ToBytes(recordingB64);
  const recordingBlob = new Blob([recordingBytes], { type: mimeType || 'video/webm' });

  // Decode keyframes
  const keyframeEntries = [];
  const keyframeMeta = [];
  for (let i = 0; i < (keyframes || []).length; i++) {
    const k = keyframes[i];
    const bytes = base64ToBytes(k.base64);
    const name = `keyframes/keyframe-${String(i).padStart(3, '0')}.png`;
    keyframeEntries.push({ name, data: bytes });
    keyframeMeta.push({ index: i, timestamp: k.timestamp, file: name });
  }

  // brief.json
  const briefJson = {
    id: briefId,
    schemaVersion: 2,
    createdAt: new Date(recordingStartMs).toISOString(),
    durationMs,
    intent,
    pageUrl: meta.pageUrl,
    pageTitle: meta.pageTitle,
    userAgent: navigator.userAgent,
    transcriptLang: lang,
    transcript: transcriptFinal || null,
    transcriptChunks: transcriptChunks || [],
    keyframes: keyframeMeta,
    events: meta.events || [],
    recording: { file: 'recording.webm', mimeType: mimeType || 'video/webm', durationMs },
  };

  const briefBytes = new TextEncoder().encode(JSON.stringify(briefJson, null, 2));
  const recordingArr = new Uint8Array(await recordingBlob.arrayBuffer());

  const entries = [
    { name: 'brief.json', data: briefBytes },
    { name: 'recording.webm', data: recordingArr },
    ...keyframeEntries,
  ];
  const zipBytes = makeZip(entries);
  const zipBlob = new Blob([zipBytes], { type: 'application/zip' });
  const blobUrl = URL.createObjectURL(zipBlob);

  const filename = `claude-brief/brief-${briefId}.zip`;
  const result = await chrome.runtime.sendMessage({
    type: 'DOWNLOAD_ZIP',
    payload: { blobUrl, filename },
  });

  if (!result?.ok) {
    showError(`Save failed: ${result?.error || 'unknown'}`);
    return;
  }

  if (mode === 'inbox') {
    await finishToInbox(briefId, intent);
  } else {
    await finishWithCopy(briefId, intent);
  }
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// ---------- Ship-now: copy prompt + auto-dismiss ----------
async function finishWithCopy(id, intent) {
  const prompt = `Use the brief skill to handle brief ${id} as an issue.`;
  try {
    await navigator.clipboard.writeText(prompt);
  } catch (err) {
    console.warn('[brief/bar] clipboard failed:', err);
  }
  setView('saved');
  savedDismissTimer = setTimeout(closeParent, SAVED_AUTODISMISS_MS);
}

// ---------- Inbox: add brief to local inbox queue, show different toast ----------
async function finishToInbox(id, intent) {
  try {
    const { inbox } = await chrome.storage.local.get('inbox');
    const list = Array.isArray(inbox) ? inbox : [];
    list.push({ id, intent, addedAt: Date.now() });
    await chrome.storage.local.set({ inbox: list });
    // Tell background to refresh the toolbar badge
    chrome.runtime.sendMessage({ type: 'INBOX_CHANGED' }).catch(() => {});
  } catch (err) {
    console.warn('[brief/bar] inbox write failed:', err);
  }
  // Show a different toast (no "paste into Claude" — it's queued)
  setView('inboxed');
  savedDismissTimer = setTimeout(closeParent, SAVED_AUTODISMISS_MS);
}
