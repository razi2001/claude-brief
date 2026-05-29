// Claude Brief — settings + onboarding logic
//
// Two modes:
//   ?onboarding=1  → first-install: pick schedule date, copy ONE prompt that
//                    installs the skill AND schedules the daily run.
//   (no param)     → ordinary settings: edit the schedule date, copy a prompt
//                    that updates the scheduled task; plus update/uninstall.
//
// Settings live in chrome.storage.local:
//   scheduleTime : "HH:MM"  (when the daily Claude Code task runs)
//
// The extension can't reach into Claude Code Desktop's scheduler, so any
// schedule change surfaces a copy-prompt for the user to paste once.

const REPO = 'https://github.com/you/claude-brief'; // TODO: real repo URL

const params = new URLSearchParams(location.search);
const isOnboarding = params.get('onboarding') === '1';

const pageTitle = document.getElementById('pageTitle');
const pageLede = document.getElementById('pageLede');

// Onboarding elements
const onboardingSection = document.getElementById('onboardingSection');
const onboardTime = document.getElementById('onboardTime');
const setupPromptEl = document.getElementById('setupPrompt');
const copySetupBtn = document.getElementById('copySetupBtn');
const onboardDone = document.getElementById('onboardDone');

// Normal settings elements
const scheduleSection = document.getElementById('scheduleSection');
const scheduleTimeEl = document.getElementById('scheduleTime');
const saveRow = document.getElementById('saveRow');
const saveBtn = document.getElementById('saveBtn');
const savedFlag = document.getElementById('savedFlag');
const syncPanel = document.getElementById('syncPanel');
const syncPromptEl = document.getElementById('syncPrompt');
const copySyncBtn = document.getElementById('copySyncBtn');
const maintSection = document.getElementById('maintSection');

// ---------- Time formatting ----------
function timeLabel(time) {
  const [h, m] = (time || '18:00').split(':');
  const hour = Number(h);
  const min = Number(m);
  const ampm = hour >= 12 ? 'pm' : 'am';
  const h12 = ((hour + 11) % 12) + 1;
  return min === 0 ? `${h12}${ampm}` : `${h12}:${String(min).padStart(2, '0')}${ampm}`;
}

// ---------- Prompt builders ----------
function setupPrompt(time) {
  // One prompt: install the skill, then create the scheduled task.
  return `Set up Claude Brief on this machine, in two steps:

1. Install the skill: download ${REPO}/archive/refs/heads/main.tar.gz, extract just the skill/ folder, and copy it to ~/.claude/skills/brief (overwrite if it exists). Confirm ~/.claude/skills/brief/SKILL.md exists.

2. Create a scheduled task "Brief Daily" that runs every weekday at ${timeLabel(time)} with the prompt: "Use the brief skill to process my inbox."`;
}

function syncSchedulePrompt(time) {
  return `Update my "Brief Daily" scheduled task to run every weekday at ${timeLabel(time)} instead. Keep the prompt the same: "Use the brief skill to process my inbox."`;
}

function updatePrompt() {
  return `Update the Claude Brief skill. Re-download ${REPO}/archive/refs/heads/main.tar.gz, replace the contents of ~/.claude/skills/brief with the latest skill/ folder, and tell me the new version.`;
}

function uninstallPrompt() {
  return `Uninstall the Claude Brief skill: delete ~/.claude/skills/brief and the "Brief Daily" scheduled task if it exists. Confirm both are gone. Then list any leftover briefs in ~/Downloads/claude-brief/ and ask whether to delete them too.`;
}

async function copy(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

// ---------- Init ----------
(async () => {
  const { scheduleTime = '18:00' } = await chrome.storage.local.get(['scheduleTime']);

  // Maintenance prompts (always present)
  document.getElementById('updatePrompt').textContent = updatePrompt();
  document.getElementById('uninstallPrompt').textContent = uninstallPrompt();

  if (isOnboarding) {
    // Onboarding mode: show only the combined setup, hide normal settings
    pageTitle.innerHTML = 'Welcome — <em>set up Claude Brief</em>.';
    pageLede.textContent = 'Pick your daily processing time, copy one prompt into Claude Code Desktop, and you\u2019re done.';
    onboardingSection.hidden = false;
    scheduleSection.style.display = 'none';
    saveRow.style.display = 'none';
    maintSection.style.display = 'none';

    onboardTime.value = scheduleTime;
    setupPromptEl.textContent = setupPrompt(scheduleTime);
    await copy(setupPromptEl.textContent);

    // Re-build prompt + re-copy whenever the time changes
    onboardTime.addEventListener('change', async () => {
      await chrome.storage.local.set({ scheduleTime: onboardTime.value });
      setupPromptEl.textContent = setupPrompt(onboardTime.value);
      await copy(setupPromptEl.textContent);
    });

    copySetupBtn.addEventListener('click', async () => {
      await copy(setupPromptEl.textContent);
      copySetupBtn.textContent = '✓ Copied — paste into Claude Code';
      copySetupBtn.classList.add('copied');
      onboardDone.style.display = 'block';
      setTimeout(() => {
        copySetupBtn.textContent = 'Copy setup prompt';
        copySetupBtn.classList.remove('copied');
      }, 2200);
    });
  } else {
    // Normal settings mode
    scheduleTimeEl.value = scheduleTime;
  }
})();

// ---------- Save (normal settings) ----------
saveBtn?.addEventListener('click', async () => {
  const scheduleTime = scheduleTimeEl.value || '18:00';
  await chrome.storage.local.set({ scheduleTime });

  savedFlag.classList.add('show');
  setTimeout(() => savedFlag.classList.remove('show'), 2000);

  const prompt = syncSchedulePrompt(scheduleTime);
  syncPromptEl.textContent = prompt;
  syncPanel.classList.add('show');
  await copy(prompt);
  syncPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
});

copySyncBtn?.addEventListener('click', async () => {
  await copy(syncPromptEl.textContent);
  copySyncBtn.textContent = '✓ Copied';
  copySyncBtn.classList.add('copied');
  setTimeout(() => {
    copySyncBtn.textContent = 'Copy again';
    copySyncBtn.classList.remove('copied');
  }, 1800);
});

// ---------- Maintenance copy buttons ----------
document.querySelectorAll('[data-copy]').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const target = document.getElementById(btn.dataset.copy);
    if (!target) return;
    await copy(target.textContent);
    const orig = btn.textContent;
    btn.textContent = '✓ Copied';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = orig; btn.classList.remove('copied'); }, 1800);
  });
});

// Auto-copy when a maintenance prompt is expanded
document.querySelectorAll('details').forEach((d) => {
  d.addEventListener('toggle', async () => {
    if (!d.open) return;
    const box = d.querySelector('.prompt-box');
    if (box) await copy(box.textContent);
  });
});
