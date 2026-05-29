<div align="center">

# ✦ Claude Brief

**Voice your bug. Claude ships the ticket.**

A Chrome extension for Claude Code users. Record what's broken, hit stop — Claude reads the brief and files the ticket. No more 5-minute Linear interruptions.

[Install](#install) · [How it works](#how-it-works) · [Daily auto-processing](#daily-auto-processing) · [FAQ](#faq)

</div>

---

## What is this

You spot a bug or want a feature. You hit ✦ in your toolbar, talk through what you want while showing it on screen, and stop. Claude Brief saves a zip locally in `~/Downloads/claude-brief/` and adds it to your inbox.

Capture as many as you like through the day — they queue up. Then either copy the inbox prompt anytime and paste it into Claude Code, or let a scheduled daily task process the whole inbox automatically. Claude reads each brief, files a real ticket in your tracker, groups duplicates, and deletes the source brief once it's filed.

The whole loop is local-first. Your audio, your screen, your data — nothing leaves your machine except what Claude reads when you ask.

## Requirements

- **Chrome** (or any Chromium-based browser: Edge, Brave, Arc)
- **Claude Code Desktop** with a tracker MCP configured (Linear, GitHub, Jira, Notion — whichever you use)

Claude Brief is built specifically for Claude Code users. It won't work standalone — Claude Code is what actually files the tickets.

## Install

**Step 1 — Install the Chrome extension** (one-time, manual):

1. [Download the repo](https://github.com/razi2001/claude-brief/archive/refs/heads/main.zip) and unzip it (or clone it).
2. Open `chrome://extensions`, toggle **Developer mode** on, click **Load unpacked**, pick the `extension/` folder.
3. Pin the ✦ icon to your toolbar (puzzle-piece menu → pushpin).

The first time you click ✦, a permission tab opens, then hands off to the setup page where you pick your daily schedule and copy the install prompt.

**Step 2 — Install the skill** (one prompt, paste into Claude Code Desktop):

```text
Set up Claude Brief on this machine.

1. Install the skill by reading it straight from the public repo (no download or git needed — just browse the files and recreate them locally):

   Repo: https://github.com/razi2001/claude-brief/tree/main/skill

   Read these three files and write them to ~/.claude/skills/brief/ with the same paths:
   - https://github.com/razi2001/claude-brief/blob/main/skill/SKILL.md            → ~/.claude/skills/brief/SKILL.md
   - https://github.com/razi2001/claude-brief/blob/main/skill/playbooks/issue.md  → ~/.claude/skills/brief/playbooks/issue.md
   - https://github.com/razi2001/claude-brief/blob/main/skill/playbooks/inbox.md  → ~/.claude/skills/brief/playbooks/inbox.md

   Create the ~/.claude/skills/brief/playbooks/ directory first. Copy each file's contents verbatim. Then confirm ~/.claude/skills/brief/SKILL.md exists.

2. Create a scheduled task "Brief Daily" that runs every weekday at 6pm with the prompt: "Use the brief skill to process my inbox."

Confirm the skill is in place and the task is scheduled.
```

The extension's setup page generates this prompt for you with your chosen schedule time filled in — you don't have to write it by hand.

That's it.

## How it works

```
┌──────────────────┐    ┌────────────────────┐    ┌──────────────────┐
│  Chrome ext      │ →  │  ~/Downloads/      │ →  │  Claude Code     │
│  records tab +   │    │  claude-brief/     │    │  reads brief.json│
│  voice           │    │  brief-<id>.zip    │    │  files ticket    │
└──────────────────┘    └────────────────────┘    │  deletes brief   │
       click ✦              local zip              └──────────────────┘
```

A brief is a folder:

```
~/Downloads/claude-brief/<id>/
├── brief.json              ← transcript, time-stamped chunks, events, console errors
├── recording.webm          ← original screen + voice
└── keyframes/
    ├── keyframe-000.png    ← sampled every 2s
    └── …
```

When Claude processes briefs (one at a time, or your whole inbox at once), it:

- Binary-searches the keyframes (reads 3-5 strategic frames, not all 20+)
- Maps your spoken words to the frames you said them on (±2 seconds)
- Picks the right Linear team / GitHub repo / Notion DB **without asking you**
- Embeds keyframes inline as markdown images (not as bare attachments)
- Attaches the recording only when it beats the keyframes (motion/timing/multi-step bugs)
- Includes console errors verbatim for bug reports
- **Deletes the brief from `~/Downloads/claude-brief/` once the ticket is confirmed filed**

The skill's hard rules (no clarifying questions, inline images, binary-search frames, delete-on-success) live in `skill/playbooks/`.

## Daily auto-processing

For users who don't want to manually paste prompts: **set up a Claude Code Desktop scheduled task**.

The extension's setup page generates the prompt for you (with your chosen time). Paste it once; Claude creates a recurring task that runs every weekday at your chosen time. The task:

- Reads every brief still in `~/Downloads/claude-brief/`
- Files tickets via your connected tracker MCP
- Groups duplicates intelligently
- Deletes processed briefs

Caveat: Claude Code Desktop must be running at that time for the task to fire. If your laptop is closed, the task is skipped (and runs next time Claude Code is open). This is a [Claude Code Desktop limitation](https://code.claude.com/docs/en/desktop-scheduled-tasks), not Brief's.

If you'd rather process manually, skip the schedule — click the ✦ icon, hit **Copy** on the inbox card, and paste the prompt into Claude Code whenever you like.

## Voice quality, honestly

The extension uses Chrome's built-in speech recognition (`webkitSpeechRecognition`). It's free and runs locally, but:

- One language per session — pick English or French in the launcher; **it does not auto-switch**.
- Accuracy on accents, code, and technical jargon is mediocre.
- The skill knows this. Its playbook tells Claude to treat the transcript as a "live draft" and use keyframes + events as ground truth, silently correcting obvious mis-transcriptions.

A future release may support OpenAI Whisper for genuinely good multilingual transcription.

## Privacy

- Recording happens entirely in your browser. The video file never uploads anywhere.
- The browser sends your microphone audio to Google's speech-recognition service while transcribing (this is `webkitSpeechRecognition`, not us). It does not store the audio.
- Console-error capture only runs while you're actively recording, only on the tab you're recording, and only forwards error messages — no DOM, no cookies, no storage.
- Briefs are saved locally. They never leave your machine unless you paste the prompt into Claude (and even then, only Claude on your machine reads them).

## FAQ

**Does it work without Claude Code?**
No. Claude Brief produces structured briefs that Claude Code reads from your local filesystem. Without Claude Code, the briefs just sit there unprocessed.

**Does it work on `chrome://` pages?**
No. Chrome blocks tab capture on its own pages. Use it on regular websites and web apps.

**What about Firefox / Safari?**
Chromium-based browsers only for now (Chrome, Edge, Brave, Arc).

**Where do briefs get stored?**

- macOS / Linux: `~/Downloads/claude-brief/`
- Windows: `%USERPROFILE%\Downloads\claude-brief\`

**Can I share a brief with a teammate?**
The zip is self-contained. Send it to them; if they have the Claude Brief skill installed, they can paste `Use the brief skill to handle brief <id> as an issue.` and Claude will process it on their machine.

**Why does the recording bar drift across pages?**
You can drag it. Grip the 6-dot handle on the left. Position is saved across all your tabs.

## Update

```text
Update the Claude Brief skill to the latest version. Read the three skill files from the public repo and overwrite the local copies (no download or git needed — just browse and recreate):
   - https://github.com/razi2001/claude-brief/blob/main/skill/SKILL.md            → ~/.claude/skills/brief/SKILL.md
   - https://github.com/razi2001/claude-brief/blob/main/skill/playbooks/issue.md  → ~/.claude/skills/brief/playbooks/issue.md
   - https://github.com/razi2001/claude-brief/blob/main/skill/playbooks/inbox.md  → ~/.claude/skills/brief/playbooks/inbox.md
Copy each file's contents verbatim, replacing what's there. Then tell me what changed.
```

## Uninstall

```text
Uninstall the Claude Brief skill. Delete the directory ~/.claude/skills/brief and the "Brief Daily" scheduled task if they exist, and confirm both are gone. Also list any leftover briefs in ~/Downloads/claude-brief/ and ask me whether to delete them too.
```

Then remove the extension at `chrome://extensions`.

## License

MIT — see [LICENSE](LICENSE).
