// Brief — offscreen recorder
// Records video+audio, runs SpeechRecognition, BUILDS THE ZIP locally,
// and passes only a blob URL back to background (no huge data URLs).

import { makeZip } from './lib/zip.js';

const KEYFRAME_INTERVAL_MS = 2000;

let mediaRecorder = null;
let recordedChunks = [];
let displayStream = null;
let micStream = null;
let combinedStream = null;
let keyframes = []; // { timestamp, blob }   <-- store blobs, not data URLs
let keyframeTimer = null;
let recordingStartMs = 0;
let currentBriefId = null;

let recognizer = null;
let transcriptFinal = '';
let transcriptInterim = '';
let recognitionShouldRun = false;

// Keep the most recent object URL alive long enough for the download to complete
let pendingZipUrl = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.target !== 'offscreen') return false;

  if (message.type === 'OFFSCREEN_START') {
    currentBriefId = message.briefId;
    sendResponse({ ok: true });
    startRecording().catch((err) => {
      console.error('[brief/offscreen] start failed:', err);
      chrome.runtime
        .sendMessage({ type: 'RECOGNITION_ERROR', payload: { error: String(err?.message || err) } })
        .catch(() => {});
    });
    return false;
  }

  if (message.type === 'OFFSCREEN_STOP') {
    sendResponse({ ok: true });
    stopRecording().catch((err) => console.error('[brief/offscreen] stop failed:', err));
    return false;
  }

  if (message.type === 'OFFSCREEN_REVOKE') {
    if (pendingZipUrl) {
      URL.revokeObjectURL(pendingZipUrl);
      pendingZipUrl = null;
    }
    sendResponse({ ok: true });
    return false;
  }

  return false;
});

async function startRecording() {
  displayStream = await navigator.mediaDevices.getDisplayMedia({
    video: { frameRate: 30 },
    audio: true,
  });

  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  } catch (err) {
    console.warn('[brief/offscreen] mic denied:', err);
    micStream = null;
    chrome.runtime
      .sendMessage({
        type: 'RECOGNITION_ERROR',
        payload: { error: `mic-${err?.name || 'denied'}` },
      })
      .catch(() => {});
  }

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

  const preview = document.getElementById('preview');
  preview.srcObject = combinedStream;
  await preview.play().catch(() => {});

  for (const t of displayStream.getVideoTracks()) {
    t.addEventListener('ended', () => {
      stopRecording().catch((e) => console.error(e));
    });
  }

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

  recordingStartMs = Date.now();
  keyframes = [];
  transcriptFinal = '';
  transcriptInterim = '';

  mediaRecorder.start(1000);
  startKeyframeCapture(preview);
  startSpeechRecognition();
}

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

// ---------- Speech recognition (unchanged) ----------
function startSpeechRecognition() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    chrome.runtime
      .sendMessage({ type: 'RECOGNITION_ERROR', payload: { error: 'not-supported' } })
      .catch(() => {});
    return;
  }
  recognizer = new Recognition();
  recognizer.continuous = true;
  recognizer.interimResults = true;
  recognizer.lang = navigator.language || 'en-US';
  recognitionShouldRun = true;

  recognizer.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) transcriptFinal += r[0].transcript;
      else interim += r[0].transcript;
    }
    transcriptInterim = interim;
    chrome.runtime
      .sendMessage({
        type: 'TRANSCRIPT_UPDATE',
        payload: { final: transcriptFinal, interim: transcriptInterim },
      })
      .catch(() => {});
  };

  recognizer.onerror = (e) => {
    console.warn('[brief/offscreen] speech error:', e.error);
    if (['not-allowed', 'service-not-allowed', 'audio-capture', 'network', 'not-supported'].includes(e.error)) {
      chrome.runtime
        .sendMessage({ type: 'RECOGNITION_ERROR', payload: { error: e.error } })
        .catch(() => {});
      recognitionShouldRun = false;
    }
  };

  recognizer.onend = () => {
    if (recognitionShouldRun && mediaRecorder && mediaRecorder.state === 'recording') {
      try { recognizer.start(); } catch {}
    }
  };

  try { recognizer.start(); } catch (err) {
    chrome.runtime
      .sendMessage({ type: 'RECOGNITION_ERROR', payload: { error: String(err?.message || err) } })
      .catch(() => {});
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

// ---------- Stop, build zip locally, hand off a blob URL ----------
async function stopRecording() {
  if (keyframeTimer) {
    clearInterval(keyframeTimer);
    keyframeTimer = null;
  }
  stopSpeechRecognition();

  if (!mediaRecorder || mediaRecorder.state === 'inactive') return;

  await new Promise((resolve) => {
    mediaRecorder.addEventListener('stop', resolve, { once: true });
    mediaRecorder.stop();
  });

  for (const t of (displayStream?.getTracks() || [])) t.stop();
  for (const t of (micStream?.getTracks() || [])) t.stop();
  displayStream = null;
  micStream = null;
  combinedStream = null;

  const briefId = currentBriefId;
  const mimeType = mediaRecorder.mimeType || 'video/webm';
  const durationMs = Date.now() - recordingStartMs;
  const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
  const videoBlob = new Blob(recordedChunks, { type: mimeType });

  // Skeleton brief; background fills in pageUrl/pageTitle from active tab.
  const briefSkeleton = {
    id: briefId,
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    durationMs,
    transcript: transcriptFinal.trim() || null,
    keyframes: keyframes.map((kf, i) => ({
      index: i,
      timestamp: kf.timestamp,
      file: `keyframes/keyframe-${String(i).padStart(3, '0')}.png`,
    })),
    recording: { file: `recording.${ext}`, mimeType, durationMs },
    // pageUrl/pageTitle/userAgent/events filled by background
  };

  // Build the zip right here. No big messages.
  const folder = `Brief/${briefId}`;
  const files = [
    { name: `${folder}/brief.json`, data: '__PLACEHOLDER__' }, // will be replaced after background fills metadata
    { name: `${folder}/${briefSkeleton.recording.file}`, data: new Uint8Array(await videoBlob.arrayBuffer()) },
  ];
  for (let i = 0; i < keyframes.length; i++) {
    const bytes = new Uint8Array(await keyframes[i].blob.arrayBuffer());
    files.push({
      name: `${folder}/keyframes/keyframe-${String(i).padStart(3, '0')}.png`,
      data: bytes,
    });
  }

  // Tell background to finalize metadata; it will message us back
  // with the completed brief.json text so we can include it in the zip.
  const completedBrief = await chrome.runtime.sendMessage({
    type: 'FINALIZE_METADATA',
    payload: { brief: briefSkeleton },
  });

  files[0].data = JSON.stringify(completedBrief.brief, null, 2);

  const zipBlob = makeZip(files);
  if (pendingZipUrl) URL.revokeObjectURL(pendingZipUrl);
  pendingZipUrl = URL.createObjectURL(zipBlob);

  // Tell background the zip is ready — it will trigger the download and
  // tell us to revoke when done.
  await chrome.runtime.sendMessage({
    type: 'ZIP_READY',
    payload: {
      briefId,
      brief: completedBrief.brief,
      blobUrl: pendingZipUrl,
      filename: `Brief/brief-${briefId}.zip`,
      sizeBytes: zipBlob.size,
    },
  });

  mediaRecorder = null;
  recordedChunks = [];
  keyframes = [];
  currentBriefId = null;
  transcriptFinal = '';
  transcriptInterim = '';
}
