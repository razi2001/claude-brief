// Brief — floating overlay (launcher + recording bar)
// All states live in one iframe injected into the active tab. The launcher
// asks for the tabCapture stream itself (inside a click handler — user
// gesture preserved). No Chrome popup involved.

import { makeZip } from './lib/zip.js';

const KEYFRAME_INTERVAL_MS = 2000;
const SAVED_AUTODISMISS_MS = 5000;

// ---------- Params from URL hash ----------
const params = new URLSearchParams(location.hash.slice(1));
const streamId = params.get('streamId');
const lang = params.get('lang') || 'en-US';
const intent = params.get('intent') || 'issue';

// ---------- DOM ----------
const body = document.body;
const stopBtn = document.getElementById('stopBtn');
const muteBtn = document.getElementById('muteBtn');
const closeBtn = document.getElementById('closeBtn');
const errCloseBtn = document.getElementById('errCloseBtn');
const timerEl = document.getElementById('timer');
const intentTagEl = document.getElementById('intentTag');
const transcriptText = document.getElementById('transcriptText');
const transcriptPanel = document.getElementById('transcriptPanel');
const previewVideo = document.getElementById('preview');
const errTextEl = document.getElementById('errText');

// ---------- Recording state ----------
const briefId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
let mediaRecorder = null;
let recordedChunks = [];
let tabStream = null;
let micStream = null;
let combinedStream = null;
let keyframes = [];
let keyframeTimer = null;
let recordingStartMs = 0;
let timerInterval = null;
let muted = false;
let recognizer = null;
let transcriptFinal = '';
let transcriptInterim = '';
let transcriptChunks = [];
let recognitionShouldRun = false;
let savedDismissTimer = null;
// ---------- Intent tag ----------
const INTENT_LABELS = { issue: 'Issue', pr: 'PR', brainstorm: 'Brainstorm', context: 'Context' };
if (intentTagEl) intentTagEl.textContent = INTENT_LABELS[intent] || 'Issue';

// ---------- Iframe sizing ----------
function postToParent(type, payload = {}) {
  window.parent.postMessage({ app: 'brief', type, ...payload }, '*');
}
function closeParent() { postToParent('close'); }

function currentLayout() {
  // Add a shadow buffer around the pills so box-shadows don't get
  // clipped by the iframe edge (which would read as a gray rectangle).
  const SHADOW_PAD = 28;
  const stateName = body.className.replace('state-', '');
  if (stateName === 'recording') {
    const panelH = transcriptPanel?.offsetHeight || 0;
    return {
      width: 360 + SHADOW_PAD,
      height: 52 + (panelH ? 8 + panelH : 0) + SHADOW_PAD,
    };
  }
  // loading / saving / saved / cancelled / error
  return { width: 360 + SHADOW_PAD, height: 52 + SHADOW_PAD };
}
function autoResize() {
  postToParent('layout', currentLayout());
}
const ro = new ResizeObserver(() => autoResize());
ro.observe(document.documentElement);
function scheduleResize() {
  requestAnimationFrame(() => requestAnimationFrame(autoResize));
}

// ---------- State machine ----------
function setView(name) {
  body.className = `state-${name}`;
  // Defensively hide the transcript panel for any state other than recording.
  // CSS handles this via the body class, but we also flip the `hidden` attribute
  // so there's no chance of a stale display:flex carrying over during the
  // class change → resize → repaint cycle (which caused the leftover dark
  // panel above the Cancelled pill).
  if (transcriptPanel) {
    transcriptPanel.hidden = (name !== 'recording');
  }
  scheduleResize();
  if (savedDismissTimer && name !== 'saved') {
    clearTimeout(savedDismissTimer);
    savedDismissTimer = null;
  }
}
function showError(message) {
  errTextEl.textContent = message;
  setView('error');
  setTimeout(closeParent, 6000);
}

// ---------- Init ----------
(async function init() {
  if (!streamId) {
    showError('Missing stream ID.');
    return;
  }
  setView('loading');
  try {
    await startRecording(streamId);
  } catch (err) {
    console.error('[brief/bar] start failed:', err);
    handleStartError(err);
  }
})();

async function checkMicPermission() {
  try {
    if (navigator.permissions?.query) {
      const s = await navigator.permissions.query({ name: 'microphone' });
      return s.state; // granted | prompt | denied
    }
  } catch {}
  return 'prompt';
}

function handleStartError(err) {
  const name = err?.name || '';
  if (name === 'NotAllowedError') showError('Microphone not granted.');
  else if (/tab|capture/i.test(err?.message || '')) showError("Can't capture this tab.");
  else showError(String(err?.message || err));
}

// ---------- Recording start ----------
async function startRecording(streamId) {
  tabStream = await navigator.mediaDevices.getUserMedia({
    audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } },
    video: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } },
  });
  // Tab capture mutes the source tab by default — re-route audio to speakers
  try {
    const ctx = new AudioContext();
    ctx.createMediaStreamSource(new MediaStream(tabStream.getAudioTracks()))
      .connect(ctx.destination);
  } catch {}

  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  } catch (err) {
    cleanupStreams();
    throw err;
  }

  const tracks = [];
  for (const t of tabStream.getVideoTracks()) tracks.push(t);
  const audioCtx = new AudioContext();
  const dest = audioCtx.createMediaStreamDestination();
  for (const t of tabStream.getAudioTracks()) {
    audioCtx.createMediaStreamSource(new MediaStream([t])).connect(dest);
  }
  for (const t of micStream.getAudioTracks()) {
    audioCtx.createMediaStreamSource(new MediaStream([t])).connect(dest);
  }
  for (const t of dest.stream.getAudioTracks()) tracks.push(t);
  combinedStream = new MediaStream(tracks);

  previewVideo.srcObject = combinedStream;
  await previewVideo.play().catch(() => {});

  for (const t of tabStream.getVideoTracks()) {
    t.addEventListener('ended', () => { stopAndSave().catch(console.error); });
  }

  const mime = ['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm','video/mp4']
    .find((m) => MediaRecorder.isTypeSupported(m)) || '';
  recordedChunks = [];
  mediaRecorder = new MediaRecorder(combinedStream, mime ? { mimeType: mime } : undefined);
  mediaRecorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) recordedChunks.push(e.data);
  };
  mediaRecorder.start(1000);

  recordingStartMs = Date.now();
  keyframes = [];
  transcriptFinal = '';
  transcriptInterim = '';
  transcriptChunks = [];

  chrome.runtime
    .sendMessage({ type: 'BRIEF_START', briefId, startedAt: recordingStartMs })
    .catch(() => {});

  // Make sure transcript panel is visible from the start (always-on in recording)
  if (transcriptPanel) transcriptPanel.hidden = false;

  setView('recording');
  startTimer();
  startKeyframeCapture();
  startSpeechRecognition();
}

function cleanupStreams() {
  for (const t of (tabStream?.getTracks() || [])) t.stop();
  for (const t of (micStream?.getTracks() || [])) t.stop();
  for (const t of (combinedStream?.getTracks() || [])) t.stop();
  tabStream = null; micStream = null; combinedStream = null;
}

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

// ---------- Keyframes ----------
function startKeyframeCapture() {
  const captureOne = async () => {
    if (!previewVideo || previewVideo.readyState < 2) return;
    const w = previewVideo.videoWidth, h = previewVideo.videoHeight;
    if (!w || !h) return;
    const maxW = 1280;
    const scale = Math.min(1, maxW / w);
    const cw = Math.round(w * scale), ch = Math.round(h * scale);
    const canvas = new OffscreenCanvas(cw, ch);
    canvas.getContext('2d').drawImage(previewVideo, 0, 0, cw, ch);
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    keyframes.push({ timestamp: Date.now() - recordingStartMs, blob });
  };
  captureOne();
  keyframeTimer = setInterval(captureOne, KEYFRAME_INTERVAL_MS);
}

// ---------- SpeechRecognition with time-stamped chunks ----------
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
          transcriptChunks.push({
            tMs: Date.now() - recordingStartMs,
            text: trimmed,
          });
        }
        transcriptFinal += text;
      } else {
        interim += text;
      }
    }
    transcriptInterim = interim;
    renderTranscript(transcriptFinal, transcriptInterim);
  };
  recognizer.onerror = (e) => {
    console.warn('[brief/bar] sr error:', e.error);
    if (['not-allowed', 'service-not-allowed', 'audio-capture'].includes(e.error)) {
      renderTranscript('', '', `Mic unavailable (${e.error}).`);
      recognitionShouldRun = false;
    } else if (e.error === 'network') {
      renderTranscript(transcriptFinal, '', 'Transcription paused (network).');
    }
  };
  recognizer.onend = () => {
    if (recognitionShouldRun && mediaRecorder?.state === 'recording') {
      try { recognizer.start(); } catch {}
    }
  };
  try { recognizer.start(); }
  catch (err) { renderTranscript('', '', `SR start failed: ${err?.message || err}`); }
}
function stopSpeechRecognition() {
  recognitionShouldRun = false;
  if (recognizer) { try { recognizer.stop(); } catch {} try { recognizer.abort(); } catch {} recognizer = null; }
}
function renderTranscript(final, interim, errorMsg) {
  if (errorMsg) {
    transcriptText.innerHTML = `<span class="placeholder">${escapeHtml(errorMsg)}</span>`;
    return;
  }
  const f = (final || '').trim();
  const i = (interim || '').trim();
  if (!f && !i) {
    transcriptText.innerHTML = '<span class="placeholder">Listening…</span>';
    return;
  }
  // Reuse the same ticker element across renders so the CSS transition on
  // `transform` actually has a previous value to animate from.
  let ticker = document.getElementById('briefTicker');
  if (!ticker) {
    transcriptText.innerHTML = `<span class="ticker" id="briefTicker"></span>`;
    ticker = document.getElementById('briefTicker');
  }
  const finalHtml = f ? escapeHtml(f) : '';
  const interimHtml = i ? `<span class="interim">${escapeHtml(i)}</span>` : '';
  ticker.innerHTML = `${finalHtml}${f && i ? ' ' : ''}${interimHtml}`;

  // After layout, translate so the right edge of the text sits at the
  // right edge of the viewport; CSS transition handles the slide.
  requestAnimationFrame(() => {
    if (!ticker.isConnected) return;
    const viewportW = transcriptText.clientWidth;
    const textW = ticker.scrollWidth;
    const shift = Math.max(0, textW - viewportW);
    ticker.style.transform = `translateX(${-shift}px)`;
  });
}
function escapeHtml(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

// ---------- Mute ----------
muteBtn?.addEventListener('click', () => {
  muted = !muted;
  muteBtn.classList.toggle('active', muted);
  for (const t of (micStream?.getAudioTracks() || [])) t.enabled = !muted;
});

// ---------- Stop & save ----------
stopBtn?.addEventListener('click', async () => {
  stopBtn.disabled = true;
  try { await stopAndSave(); }
  catch (err) { showError(String(err?.message || err)); }
});

// ---------- Cancel & discard ----------
const cancelBtn = document.getElementById('cancelBtn');
cancelBtn?.addEventListener('click', async () => {
  cancelBtn.disabled = true;
  if (stopBtn) stopBtn.disabled = true;
  try { await cancelAndDiscard(); }
  catch (err) { showError(String(err?.message || err)); }
});

async function cancelAndDiscard() {
  // Stop the loops and recognizer
  if (keyframeTimer) { clearInterval(keyframeTimer); keyframeTimer = null; }
  stopTimer();
  stopSpeechRecognition();
  chrome.runtime.sendMessage({ type: 'BRIEF_STOP' }).catch(() => {});

  // Stop the MediaRecorder if running, but DO NOT process the chunks
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    try { mediaRecorder.stop(); } catch {}
  }
  cleanupStreams();

  // Drop captured data so nothing lingers in memory
  recordedChunks = [];
  keyframes = [];
  transcriptChunks = [];
  transcriptFinal = '';
  transcriptInterim = '';

  setView('cancelled');
  setTimeout(closeParent, 2000);
}

async function stopAndSave() {
  if (keyframeTimer) { clearInterval(keyframeTimer); keyframeTimer = null; }
  stopTimer();
  stopSpeechRecognition();
  chrome.runtime.sendMessage({ type: 'BRIEF_STOP' }).catch(() => {});

  if (!mediaRecorder || mediaRecorder.state === 'inactive') return;

  setView('saving');
  await new Promise((res) => {
    mediaRecorder.addEventListener('stop', res, { once: true });
    mediaRecorder.stop();
  });
  cleanupStreams();

  const durationMs = Date.now() - recordingStartMs;
  const mimeType = mediaRecorder.mimeType || 'video/webm';
  const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';

  const meta = await chrome.runtime.sendMessage({ type: 'GET_BRIEF_META' });

  const brief = {
    id: briefId,
    schemaVersion: 2,
    createdAt: new Date().toISOString(),
    durationMs,
    intent,
    pageUrl: meta?.pageUrl || null,
    pageTitle: meta?.pageTitle || null,
    userAgent: navigator.userAgent,
    transcriptLang: lang,
    transcript: transcriptFinal.trim() || null,
    transcriptChunks,
    keyframes: keyframes.map((kf, i) => ({
      index: i,
      timestamp: kf.timestamp,
      file: `keyframes/keyframe-${String(i).padStart(3, '0')}.png`,
    })),
    events: meta?.events || [],
    recording: { file: `recording.${ext}`, mimeType, durationMs },
  };

  const videoBlob = new Blob(recordedChunks, { type: mimeType });
  const folder = `Brief/${briefId}`;
  const files = [
    { name: `${folder}/brief.json`, data: JSON.stringify(brief, null, 2) },
    { name: `${folder}/${brief.recording.file}`, data: new Uint8Array(await videoBlob.arrayBuffer()) },
  ];
  for (let i = 0; i < keyframes.length; i++) {
    const bytes = new Uint8Array(await keyframes[i].blob.arrayBuffer());
    files.push({
      name: `${folder}/keyframes/keyframe-${String(i).padStart(3, '0')}.png`,
      data: bytes,
    });
  }
  const zipBlob = makeZip(files);
  const blobUrl = URL.createObjectURL(zipBlob);

  const result = await chrome.runtime.sendMessage({
    type: 'DOWNLOAD_ZIP',
    payload: { blobUrl, filename: `Brief/brief-${briefId}.zip` },
  });
  URL.revokeObjectURL(blobUrl);

  if (!result?.ok) {
    showError(`Save failed: ${result?.error || 'unknown'}`);
    return;
  }

  await finishWithCopy(briefId, intent);
}

// ---------- One-sentence prompt + auto-dismiss saved toast ----------
async function finishWithCopy(id, intent) {
  // Map every supported intent to the verb phrase used in the Claude prompt.
  const verbs = {
    issue: 'as an issue',
    pr: 'as a PR',
    brainstorm: 'as a brainstorm',
    context: 'as context',
  };
  const verb = verbs[intent] || 'as an issue';
  const prompt = `Use the brief skill to handle brief ${id} ${verb}.`;

  let ok = false;
  try {
    await navigator.clipboard.writeText(prompt);
    ok = true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = prompt;
      ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none;';
      document.body.appendChild(ta);
      ta.focus(); ta.select();
      ok = document.execCommand('copy');
      ta.remove();
    } catch {}
  }
  if (!ok) {
    const strong = document.querySelector('[data-state="saved"] .state-text strong');
    const em = document.querySelector('[data-state="saved"] .state-text em');
    if (strong) strong.textContent = 'Brief saved.';
    if (em) em.textContent = ' Click Copy from devtools.';
  }

  setView('saved');
  // Auto-dismiss after 5s
  savedDismissTimer = setTimeout(closeParent, SAVED_AUTODISMISS_MS);
}

closeBtn?.addEventListener('click', () => closeParent());
errCloseBtn?.addEventListener('click', () => closeParent());
