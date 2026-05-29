<div align="center">

# ✦ Claude Brief

**Voice your bug. Claude ships the ticket.**

A Chrome extension for Claude Code users. Record what's broken, hit stop — Claude reads the brief and files the ticket. No more 5-minute Linear interruptions.

[Install](#install) · [How it works](#how-it-works) · [Daily auto-processing](#daily-auto-processing) · [FAQ](#faq)

</div>

---

## What is this

You spot a bug or want a feature. You hit ✦ in your toolbar, talk through what you want while showing it on screen, and stop. Claude Brief saves a zip locally in `~/Downloads/Brief/`.

From there, two flows:

- **Ship now** → one sentence is copied to your clipboard. Paste into Claude Code, ticket gets filed in seconds.
- **Save to inbox** → queue it. Later (manually or via a scheduled task), Claude processes your whole inbox at once — groups duplicates, files each ticket, deletes the source briefs.

The whole loop is local-first. Your audio, your screen, your data — nothing leaves your machine except what Claude reads when you ask.

## Requirements

- **Chrome** (or any Chromium-based browser: Edge, Brave, Arc)
- **Claude Code Desktop** with a tracker MCP configured (Linear, GitHub, Jira, Notion — whichever you use)

Claude Brief is built specifically for Claude Code users. It won't work standalone — Claude Code is what actually files the tickets.

## Install

**Step 1 — Install the Chrome extension** (one-time, manual):

1. [Download the latest release](https://github.com/<you>/claude-brief/releases/latest) and unzip it.
2. Open `chrome://extensions`, toggle **Developer mode** on, click **Load unpacked**, pick the `extension/` folder.
3. Pin the ✦ icon to your toolbar (puzzle-piece menu → pushpin).

The first time you click ✦, a permission tab opens with the rest of setup: grant microphone access, then (optionally) copy the scheduled-task prompt for Claude Code Desktop.

**Step 2 — Install the Claude Brief skill** (one prompt, paste into Claude Code):

```text
Install the Claude Brief skill on this machine. Download https://github.com/<you>/claude-brief/archive/refs/heads/main.tar.gz, extract just the `skill/` folder, and copy it to ~/.claude/skills/brief (overwrite if it exists). After installation, list the files you placed and confirm ~/.claude/skills/brief/SKILL.md exists.
```

That's it.

## How it works

```
┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│  Chrome ext      │ →  │  ~/Downloads/    │ →  │  Claude Code     │
│  records tab +   │    │  Brief/brief-    │    │  reads brief.json│
│  voice           │    │  <id>.zip        │    │  files ticket    │
└──────────────────┘    └──────────────────┘    │  deletes brief   │
       click ✦              local zip            └──────────────────┘
```

A brief is a folder:

```
~/Downloads/Brief/<id>/
├── brief.json              ← transcript, time-stamped chunks, events, console errors
├── recording.webm          ← original screen + voice
└── keyframes/
    ├── keyframe-000.png    ← sampled every 2s
    └── …
```

When Claude processes a brief (either single via "Ship now" or batched via "inbox"), it:

- Binary-searches the keyframes (reads 3-5 strategic frames, not all 20+)
- Maps your spoken words to the frames you said them on (±2 seconds)
- Picks the right Linear team / GitHub repo / Notion DB **without asking you**
- Embeds keyframes inline as markdown images (not as bare attachments)
- Includes console errors verbatim for bug reports
- **Deletes the brief from `~/Downloads/Brief/` once the ticket is confirmed filed**

The skill's hard rules (no clarifying questions, inline images, binary-search frames, delete-on-success) live in `skill/playbooks/`.

## Daily auto-processing

For users who don't want to manually paste prompts: **set up a Claude Code Desktop scheduled task**.

After the install flow, you'll get a prompt to copy into Claude Code Desktop. Paste it once; Claude creates a recurring task that runs every weekday at 6pm. The task:

- Reads every brief still in `~/Downloads/Brief/`
- Files tickets via your connected tracker MCP
- Groups duplicates intelligently
- Deletes processed briefs

Caveat: Claude Code Desktop must be running at 6pm for the task to fire. If your laptop is closed, the task is skipped (and runs next time Claude Code is open). This is a [Claude Code Desktop limitation](https://code.claude.com/docs/en/desktop-scheduled-tasks), not Brief's.

If you'd rather process manually, skip the setup — every brief still works with the "Ship now" or "inbox → Send" flows.

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

- macOS / Linux: `~/Downloads/Brief/`
- Windows: `%USERPROFILE%\Downloads\Brief\`

**Can I share a brief with a teammate?**
The zip is self-contained. Send it to them; if they have the Claude Brief skill installed, they can paste `Use the brief skill to handle brief <id> as an issue.` and Claude will process it on their machine.

**Why does the recording bar drift across pages?**
You can drag it. Grip the 6-dot handle on the left. Position is saved across all your tabs.

## Update

```text
Update the Claude Brief skill on this machine. Re-download https://github.com/<you>/claude-brief/archive/refs/heads/main.tar.gz, replace the contents of ~/.claude/skills/brief with the latest `skill/` folder, and tell me the new version.
```

## Uninstall

```text
Uninstall the Claude Brief skill. Delete the directory ~/.claude/skills/brief if it exists, and confirm it's gone. Also list any leftover briefs in ~/Downloads/Brief/ and ask me whether to delete them too.
```

Then remove the extension at `chrome://extensions`.

## License

MIT — see [LICENSE](LICENSE).
