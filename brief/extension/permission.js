// Brief — permission grant page
// Lives in a regular tab so Chrome's mic prompt doesn't get auto-dismissed
// (which is what happens when getUserMedia is called from the extension popup).

const grantBtn = document.getElementById('grant');
const statusEl = document.getElementById('status');

function show(kind, html) {
  statusEl.className = `status ${kind}`;
  statusEl.style.display = 'block';
  statusEl.innerHTML = html;
}

async function checkCurrent() {
  try {
    if (navigator.permissions?.query) {
      const s = await navigator.permissions.query({ name: 'microphone' });
      if (s.state === 'granted') {
        show(
          'success',
          '<strong>Already granted.</strong><br />You can close this tab and go record a brief.',
        );
        grantBtn.disabled = true;
        grantBtn.textContent = 'Granted ✓';
        setTimeout(() => window.close(), 1800);
      }
    }
  } catch {
    // 'microphone' may not be queryable in some Chrome versions — that's fine
  }
}

grantBtn.addEventListener('click', async () => {
  grantBtn.disabled = true;
  grantBtn.textContent = 'Asking Chrome…';
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // Immediately release; we just needed the permission grant.
    stream.getTracks().forEach((t) => t.stop());
    show(
      'success',
      '<strong>Microphone granted.</strong><br />Closing this tab in a moment. Click the Brief icon and record.',
    );
    grantBtn.textContent = 'Granted ✓';
    setTimeout(() => window.close(), 1500);
  } catch (err) {
    grantBtn.disabled = false;
    grantBtn.textContent = 'Try again';
    show(
      'error',
      `Could not get microphone access: <code>${err?.name || 'error'}</code> — ${err?.message || ''}<br /><br />` +
        'If you accidentally clicked "Block", open <code>chrome://settings/content/microphone</code>, find Brief, and set it to <strong>Allow</strong>.',
    );
  }
});

checkCurrent();
