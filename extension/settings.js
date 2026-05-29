// Claude Brief — setup wizard
//
// A stepped flow: a menu of actions, each leading to a screen with a
// copy-prompt for Claude Code Desktop. Mirrors the feel of a guided
// question/answer rather than a dense settings dump.
//
// chrome.storage.local:
//   scheduleTime : "HH:MM"  (remembered between visits, prefilled in pickers)

const REPO = 'https://github.com/razi2001/claude-brief';

// ---------- Step navigation ----------
const steps = Array.from(document.querySelectorAll('.step'));
function show(stepName) {
  steps.forEach((s) => s.classList.toggle('active', s.dataset.step === stepName));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.querySelectorAll('[data-go]').forEach((btn) => {
  btn.addEventListener('click', () => show(btn.dataset.go));
});
document.querySelectorAll('[data-back]').forEach((btn) => {
  btn.addEventListener('click', () => show('menu'));
});
document.getElementById('howLink').addEventListener('click', () => show('how'));

// ---------- Time helpers ----------
function timeLabel(time) {
  const [h, m] = (time || '18:00').split(':');
  const hour = Number(h), min = Number(m);
  const ampm = hour >= 12 ? 'pm' : 'am';
  const h12 = ((hour + 11) % 12) + 1;
  return min === 0 ? `${h12}${ampm}` : `${h12}:${String(min).padStart(2, '0')}${ampm}`;
}

// ---------- Prompt builders ----------
function installPromptText(time) {
  return `Set up Claude Brief on this machine.

1. Install the skill by reading it straight from the public repo (no download or git needed — just browse the files and recreate them locally):

   Repo: ${REPO}/tree/main/skill

   Read these three files and write them to ~/.claude/skills/brief/ with the same paths:
   - ${REPO}/blob/main/skill/SKILL.md            → ~/.claude/skills/brief/SKILL.md
   - ${REPO}/blob/main/skill/playbooks/issue.md  → ~/.claude/skills/brief/playbooks/issue.md
   - ${REPO}/blob/main/skill/playbooks/inbox.md  → ~/.claude/skills/brief/playbooks/inbox.md

   Create the ~/.claude/skills/brief/playbooks/ directory first. Copy each file's contents verbatim. Then confirm ~/.claude/skills/brief/SKILL.md exists.

2. Create a scheduled task "Brief Daily" that runs every weekday at ${timeLabel(time)} with the prompt: "Use the brief skill to process my inbox."

Confirm the skill is in place and the task is scheduled.`;
}
function schedulePromptText(time) {
  return `Update my "Brief Daily" scheduled task to run every weekday at ${timeLabel(time)}. Keep the prompt the same: "Use the brief skill to process my inbox."`;
}
function updatePromptText() {
  return `Update the Claude Brief skill to the latest version. Read the three skill files from the public repo and overwrite the local copies (no download or git needed — just browse and recreate):
   - ${REPO}/blob/main/skill/SKILL.md            → ~/.claude/skills/brief/SKILL.md
   - ${REPO}/blob/main/skill/playbooks/issue.md  → ~/.claude/skills/brief/playbooks/issue.md
   - ${REPO}/blob/main/skill/playbooks/inbox.md  → ~/.claude/skills/brief/playbooks/inbox.md
Copy each file's contents verbatim, replacing what's there. Then tell me what changed.`;
}
function uninstallPromptText() {
  return `Uninstall the Claude Brief skill: delete ~/.claude/skills/brief and the "Brief Daily" scheduled task if it exists. Confirm both are gone. Then list any leftover briefs in ~/Downloads/claude-brief/ and ask whether to delete them too.`;
}

async function copy(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

// ---------- Wire prompts ----------
const installTime = document.getElementById('installTime');
const scheduleTime = document.getElementById('scheduleTime');
const installPromptEl = document.getElementById('installPrompt');
const schedulePromptEl = document.getElementById('schedulePrompt');

function refreshInstall() { installPromptEl.textContent = installPromptText(installTime.value || '18:00'); }
function refreshSchedule() { schedulePromptEl.textContent = schedulePromptText(scheduleTime.value || '18:00'); }

installTime.addEventListener('input', refreshInstall);
scheduleTime.addEventListener('input', async () => {
  refreshSchedule();
  // Persist the chosen time so it's remembered + reflected next visit
  await chrome.storage.local.set({ scheduleTime: scheduleTime.value });
});

// ---------- Init ----------
(async () => {
  const { scheduleTime: saved = '18:00' } = await chrome.storage.local.get(['scheduleTime']);
  installTime.value = saved;
  scheduleTime.value = saved;
  refreshInstall();
  refreshSchedule();
  document.getElementById('updatePrompt').textContent = updatePromptText();
  document.getElementById('uninstallPrompt').textContent = uninstallPromptText();

  // Deep-link: settings.html#install opens that step directly (used after install onboarding)
  const hash = (location.hash || '').replace('#', '');
  const valid = ['install', 'schedule', 'update', 'uninstall', 'how'];
  if (valid.includes(hash)) show(hash);
})();

// ---------- Copy buttons (each reveals the matching done-flag) ----------
const doneFlags = {
  installPrompt: 'installDone',
  schedulePrompt: 'scheduleDone',
  updatePrompt: 'updateDone',
  uninstallPrompt: 'uninstallDone',
};

document.querySelectorAll('[data-copy]').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const targetId = btn.dataset.copy;
    const target = document.getElementById(targetId);
    if (!target) return;

    // If this is the schedule copy, also persist the time
    if (targetId === 'schedulePrompt') {
      await chrome.storage.local.set({ scheduleTime: scheduleTime.value });
    }

    await copy(target.textContent);
    const orig = btn.textContent;
    btn.textContent = '✓ Copied';
    btn.classList.add('copied');
    const flag = document.getElementById(doneFlags[targetId]);
    if (flag) flag.classList.add('show');
    setTimeout(() => {
      btn.textContent = orig;
      btn.classList.remove('copied');
    }, 2000);
  });
});
