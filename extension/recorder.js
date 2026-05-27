// Brief — recorder window
// Runs in a visible chrome.windows popup (NOT offscreen). This is critical:
// SpeechRecognition only works reliably in a focused, visible document.
// This window owns the whole session: getDisplayMedia, MediaRecorder, SR,
// keyframes, building the zip, downloading, showing the saved prompt.

import { makeZip } from './lib/zip.js';

const KEYFRAME_INTERVAL_MS = 2000;

// ---------- DOM ----------
const app = document.getElementById('app');
const startBtn = document.getElementById('start');
const stopBtn = document.getElementById('stop');
const closeBtn = document.getElementById('close');
const errCloseBtn = document.getElementById('errClose');
const copyBtn = document.getElementById('copy');
const presetEl = document.getElementById('preset');
const timerEl = document.getElementById('timer');
const briefIdEl = document.getElementById('briefId');
const promptEl = document.getElementById('prompt');
const dictaTextEl = document.getElementById('dictaText');
const errTextEl = document.getElementById('errText');
const hintStatusEl = document.getElementById('hintStatus');

// ---------- State ----------
let mediaRecorder = null;
let recordedChunks = [];
let displayStream = null;
let micStream = null;
let combinedStream = null;
let keyframes = []; // { timestamp, blob }
let keyframeTimer = null;
let recordingStartMs = 0;
let timerInterval = null;
let briefId = generateBriefId();
let events = []; // populated from content script via background

let recognizer = null;
let transcriptFinal = '';
let transcriptInterim = '';
let recognitionShouldRun = false;

let cachedBrief = null;

// ---------- State machine ----------
function setState(name) {
  app.className = `state-${name}`;
  if (hintStatusEl) {
    hintStatusEl.textContent = name === 'recording' ? 'Live' : name.charAt(0).toUpperCase() + name.slice(1);
  }
}

function showError(msg) {
  errTextEl.textContent = msg;
  setState('error');
}

function generateBriefId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// ---------- Listen for events from content scripts (via background relay) ----------
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'BRIEF_EVENT' && msg.payload) {
    events.push(msg.payload);
  }
});

// ---------- Start ----------
startBtn.addEventListener('click', async () => {
  startBtn.disabled = true;
  startBtn.textContent = 'Asking for screen…';
  try {
    await startRecording();
  } catch (err) {
    console.error('[brief/recorder] start failed:', err);
    if (err?.name === 'NotAllowedError') {
      // User cancelled the share picker
      startBtn.disabled = false;
      startBtn.textContent = 'Start recording';
      return; // stay on ready
    }
    showError(String(err?.message || err));
  }
});

async function startRecording() {
  // 1. Screen capture — this opens Chrome's share picker. Until it resolves,
  //    we do NOT start the timer, do NOT show "Recording".
  displayStream = await navigator.mediaDevices.getDisplayMedia({
    video: { frameRate: 30 },
    audio: true,
  });

  // 2. Mic (best effort — fail silent, transcription just won't work)
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  } catch (err) {
    console.warn('[brief/recorder] mic denied/unavailable:', err);
    micStream = null;
  }

  // 3. Combine streams for the recording (video + display audio + mic audio)
  const tracks = [];
  for (const t of displayStream.getVideoTracks()) tracks.push(t);

  const audioCtx = new AudioContext();
  const dest = audioCtx.createMediaStreamDestination();
  let anyAudio = false;
  for (const t of displayStream.getAudioTracks()) {
    audioCtx.createMediaStreamSource(new MediaStream([t])).connect(dest);
    anyAudio = true;
  }
  if (micStream) {
    for (const t of micStream.getAudioTracks()) {
      audioCtx.createMediaStreamSource(new MediaStream([t])).connect(dest);
      anyAudio = true;
    }
  }
  if (anyAudio) {
    for (const t of dest.stream.getAudioTracks()) tracks.push(t);
  }
  combinedStream = new MediaStream(tracks);

  // 4. Use a hidden <video> to host the stream for keyframe extraction
  const preview = document.createElement('video');
  preview.style.display = 'none';
  preview.autoplay = true;
  preview.muted = true;
  preview.srcObject = combinedStream;
  document.body.appendChild(preview);
  await preview.play().catch(() => {});

  // 5. If user clicks Chrome's "Stop sharing" pill, stop us cleanly
  for (const t of displayStream.getVideoTracks()) {
    t.addEventListener('ended', () => {
      stopRecording().catch((e) => console.error(e));
    });
  }

  // 6. MediaRecorder
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4',
  ];
  const mimeType = candidates.find((m) => MediaRecorder.isTypeSupported(m)) || '';
  recordedChunks = [];
  mediaRecorder = new MediaRecorder(combinedStream, mimeType ? { mimeType } : undefined);
  mediaRecorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) recordedChunks.push(e.data);
  };
  mediaRecorder.start(1000);

  // 7. NOW we mark recording started — timer begins HERE, not before.
  recordingStartMs = Date.now();
  events = [];
  keyframes = [];
  transcriptFinal = '';
  transcriptInterim = '';
  setState('recording');
  startTimer();
  startKeyframeCapture(preview);
  startSpeechRecognition();

  // 8. Tell background to broadcast BRIEF_START so content scripts capture events
  chrome.runtime.sendMessage({ type: 'BRIEF_START', briefId }).catch(() => {});
}

// ---------- Timer (only runs after real recording started) ----------
function startTimer() {
  if (timerInterval) clearInterval(timerInterval);
  const tick = () => {
    const total = Math.max(0, Math.floor((Date.now() - recordingStartMs) / 1000));
    const mm = String(Math.floor(total / 60)).padStart(2, '0');
    const ss = String(total % 60).padStart(2, '0');
    timerEl.textContent = `${mm}:${ss}`;
  };
  tick();
  timerInterval = setInterval(tick, 500);
}
function stopTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null;
}

// ---------- Keyframes ----------
function startKeyframeCapture(videoEl) {
  const captureOne = async () => {
    if (!videoEl || videoEl.readyState < 2) return;
    const w = videoEl.videoWidth;
    const h = videoEl.videoHeight;
    if (!w || !h) return;
    const maxW = 1280;
    const scale = Math.min(1, maxW / w);
    const cw = Math.round(w * scale);
    const ch = Math.round(h * scale);
    const canvas = new OffscreenCanvas(cw, ch);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoEl, 0, 0, cw, ch);
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    keyframes.push({ timestamp: Date.now() - recordingStartMs, blob });
  };
  captureOne();
  keyframeTimer = setInterval(captureOne, KEYFRAME_INTERVAL_MS);
}

// ---------- Speech recognition (this is the key fix — visible context) ----------
function startSpeechRecognition() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    renderTranscript('', '', 'Speech recognition not supported in this browser.');
    return;
  }
  recognizer = new Recognition();
  recognizer.continuous = true;
  recognizer.interimResults = true;
  recognizer.lang = navigator.language || 'en-US';
  recognitionShouldRun = true;

  recognizer.onstart = () => {
    console.log('[brief/recorder] speech recognition started, lang=', recognizer.lang);
  };

  recognizer.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) transcriptFinal += r[0].transcript;
      else interim += r[0].transcript;
    }
    transcriptInterim = interim;
    renderTranscript(transcriptFinal, transcriptInterim);
  };

  recognizer.onerror = (e) => {
    console.warn('[brief/recorder] speech error:', e.error);
    if (['not-allowed', 'service-not-allowed', 'audio-capture'].includes(e.error)) {
      renderTranscript('', '', `Microphone not available (${e.error}). Grant access via chrome://settings/content/microphone.`);
      recognitionShouldRun = false;
    } else if (e.error === 'network') {
      renderTranscript('', '', 'Speech recognition needs a network connection. Live transcript paused.');
    }
    // 'no-speech' / 'aborted' are normal — let onend restart
  };

  recognizer.onend = () => {
    if (recognitionShouldRun && mediaRecorder && mediaRecorder.state === 'recording') {
      try { recognizer.start(); } catch (e) { console.warn(e); }
    }
  };

  try {
    recognizer.start();
  } catch (err) {
    console.warn('[brief/recorder] recognizer start failed:', err);
    renderTranscript('', '', `Could not start transcription: ${String(err?.message || err)}`);
  }
}

function stopSpeechRecognition() {
  recognitionShouldRun = false;
  if (recognizer) {
    try { recognizer.stop(); } catch {}
    try { recognizer.abort(); } catch {}
    recognizer = null;
  }
}

function renderTranscript(final, interim, errorMsg) {
  if (errorMsg) {
    dictaTextEl.innerHTML = `<span class="placeholder">${escapeHtml(errorMsg)}</span>`;
    return;
  }
  const f = (final || '').trim();
  const i = (interim || '').trim();
  if (!f && !i) {
    dictaTextEl.innerHTML = '<span class="placeholder">Listening…</span>';
    return;
  }
  const finalHtml = f ? escapeHtml(f) : '';
  const interimHtml = i ? `<span class="interim">${escapeHtml(i)}</span>` : '';
  dictaTextEl.innerHTML = (finalHtml + ' ' + interimHtml).trim();
  dictaTextEl.scrollTop = dictaTextEl.scrollHeight;
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ---------- Stop & save ----------
stopBtn.addEventListener('click', async () => {
  stopBtn.disabled = true;
  try {
    await stopRecording();
  } catch (err) {
    console.error('[brief/recorder] stop failed:', err);
    showError(String(err?.message || err));
  }
});

async function stopRecording() {
  if (keyframeTimer) { clearInterval(keyframeTimer); keyframeTimer = null; }
  stopTimer();
  stopSpeechRecognition();
  chrome.runtime.sendMessage({ type: 'BRIEF_STOP' }).catch(() => {});

  if (!mediaRecorder || mediaRecorder.state === 'inactive') return;

  setState('saving');

  await new Promise((resolve) => {
    mediaRecorder.addEventListener('stop', resolve, { once: true });
    mediaRecorder.stop();
  });

  for (const t of (displayStream?.getTracks() || [])) t.stop();
  for (const t of (micStream?.getTracks() || [])) t.stop();
  displayStream = null;
  micStream = null;
  combinedStream = null;

  const durationMs = Date.now() - recordingStartMs;
  const mimeType = mediaRecorder.mimeType || 'video/webm';
  const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';

  // Ask background for events (gathered by content scripts) + active tab info
  const meta = await chrome.runtime.sendMessage({ type: 'GET_BRIEF_META' });
  const collectedEvents = meta?.events || events;

  const brief = {
    id: briefId,
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    durationMs,
    pageUrl: meta?.pageUrl || null,
    pageTitle: meta?.pageTitle || null,
    userAgent: navigator.userAgent,
    transcript: transcriptFinal.trim() || null,
    keyframes: keyframes.map((kf, i) => ({
      index: i,
      timestamp: kf.timestamp,
      file: `keyframes/keyframe-${String(i).padStart(3, '0')}.png`,
    })),
    events: collectedEvents,
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
  const filename = `Brief/brief-${briefId}.zip`;

  // Trigger download via background (chrome.downloads from window context could
  // work but the service worker has the canonical event listener glue)
  const result = await chrome.runtime.sendMessage({
    type: 'DOWNLOAD_ZIP',
    payload: { blobUrl, filename },
  });

  if (!result?.ok) {
    showError(`Download failed: ${result?.error || 'unknown'}`);
    URL.revokeObjectURL(blobUrl);
    return;
  }

  URL.revokeObjectURL(blobUrl);
  cachedBrief = brief;
  renderSaved();
}

// ---------- Saved view ----------
const ACTIONS = {
  linear:
    'create a Linear ticket from this brief. Ask me which team if it is not obvious from context, and ask what to attach (keyframes, video, both, or none) before creating — then use Linear MCP file upload to actually attach them.',
  pr:
    'analyze the current repo and open a draft PR with a fix or implementation. If it is a bug, write a failing test first that mirrors the brief events, then the fix. Offer to attach the video as a PR comment.',
  'github-issue':
    'open a GitHub issue from this brief in the current repo. Pick a clear title, add labels if obvious, and tell me where to drag-and-drop the keyframes after the issue is open (GitHub API does not accept attachments).',
  notion:
    'add a new page in my Notion workspace. Ask which database. Embed the keyframes as image blocks; ask before attaching the video.',
  slack: 'post a clean 3-paragraph summary to Slack. Ask which channel. Upload keyframes and/or video as threaded attachments if I want.',
  summary:
    'give me a tight text summary of what is in this brief: what the user wants, the key signals from transcript and events, and any open questions.',
  custom: '<<EDIT THIS: tell me what to do with this brief>>',
};

function buildPrompt(b, action) {
  return `Process this brief and ${action}

Brief ID: ${b.id}
Local files: ~/Downloads/Brief/${b.id}/  (unzip ~/Downloads/Brief/brief-${b.id}.zip there if needed)
The brief.json contains the transcript, keyframes index, and events. Read it with your file tool.`;
}

function renderSaved() {
  if (!cachedBrief) return;
  briefIdEl.textContent = cachedBrief.id;
  promptEl.textContent = buildPrompt(cachedBrief, ACTIONS[presetEl.value] || ACTIONS.linear);
  setState('saved');
}

presetEl?.addEventListener('change', renderSaved);

copyBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(promptEl.textContent);
    copyBtn.classList.add('copied');
    copyBtn.textContent = 'Copied';
    setTimeout(() => {
      copyBtn.classList.remove('copied');
      copyBtn.textContent = 'Copy';
    }, 1500);
  } catch {}
});

closeBtn?.addEventListener('click', () => window.close());
errCloseBtn?.addEventListener('click', () => window.close());

// ---------- Init ----------
setState('ready');
