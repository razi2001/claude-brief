<div align="center">

# ✦ Claude Brief

**Record what you want. Claude ships it.**

A Chrome extension that captures your tab + voice into a structured brief, then hands it to Claude Code to create a ticket or open a PR.

[Install](#install) · [Update](#update) · [Uninstall](#uninstall) · [How it works](#how-it-works) · [FAQ](#faq)

</div>

---

## What is this

You hit ✦ in your toolbar, talk through what you want (a bug, a feature, a PR), and stop. Claude Brief saves a zip in `~/Downloads/Brief/` and copies one sentence to your clipboard. You paste it into Claude Code, and the brief becomes a real ticket — with the right team, the relevant screenshots embedded inline, the console errors quoted, and any failing tests written for bug PRs.

The whole loop is local. Your audio, your screen, your data — nothing leaves your machine except what Claude reads when you ask.

## Install

**Step 1 — Install the Chrome extension** (one-time, manual):

1. [Download the latest release](https://github.com/<you>/claude-brief/releases/latest) and unzip it.
2. Open `chrome://extensions`, toggle **Developer mode** on, click **Load unpacked**, pick the `extension/` folder.
3. Pin the ✦ icon to your toolbar (puzzle-piece menu → pushpin).

**Step 2 — Install the Claude Brief skill** (one prompt, paste into Claude Code):

```text
Install the Claude Brief skill on this machine. Download https://github.com/<you>/claude-brief/archive/refs/heads/main.tar.gz, extract just the `skill/` folder, and copy it to ~/.claude/skills/brief (overwrite if it exists). After installation, list the files you placed and confirm `~/.claude/skills/brief/SKILL.md` exists.
```

That's it. Next time you record a brief and paste the resulting one-liner, Claude finds the skill automatically.

## Update

Paste this into Claude Code:

```text
Update the Claude Brief skill on this machine. Re-download https://github.com/<you>/claude-brief/archive/refs/heads/main.tar.gz, replace the contents of ~/.claude/skills/brief with the latest `skill/` folder from that archive, and tell me the new version (from the top of SKILL.md if present, otherwise the commit date).
```

The extension updates separately — pull the latest release from GitHub and reload it at `chrome://extensions`.

## Uninstall

Paste this into Claude Code:

```text
Uninstall the Claude Brief skill. Delete the directory ~/.claude/skills/brief if it exists, and confirm it's gone. Also list any leftover briefs in ~/Downloads/Brief/ and ask me whether to delete them too.
```

For the extension: `chrome://extensions` → Claude Brief → **Remove**.

## How it works

```
┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│  Chrome ext      │ →  │  ~/Downloads/    │ →  │  Claude Code     │
│  records tab +   │    │  Brief/brief-    │    │  reads brief.json│
│  voice, ticker   │    │  <id>.zip        │    │  → opens issue/PR│
└──────────────────┘    └──────────────────┘    └──────────────────┘
       click ✦              copy 1 sentence           skill routes
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

When you paste the one-liner into Claude Code, it loads `~/.claude/skills/brief/SKILL.md`, picks the right playbook (`issue.md` or `pr.md`), and follows it:

- binary-searches the keyframes so it doesn't read all of them
- maps your spoken words to the frames you said them on (±2 seconds)
- picks the Linear team / GitHub repo / Notion DB *without asking you*
- embeds keyframes inline in markdown (not as bare attachments)
- includes console errors verbatim for bug reports
- writes a failing test first for bug PRs

The hard rules — no clarifying questions about team/repo/channel, inline images not attachments, binary-search frames — live in `skill/playbooks/`.

## Four intents

You pick before you record:

- **Issue** — files a ticket in whichever tracker Claude has connected (Linear, GitHub, Jira, Notion…). The MCP decides.
- **PR** — opens a draft PR in the current repo. For bugs, the playbook makes Claude write a failing test first.
- **Brainstorm** — no ticket, no PR. Claude engages as a thinking partner: reframes, stress-tests, or sharpens what you were exploring. Ends with one concrete question to move you forward.
- **Context** — Claude ingests the brief as background, acknowledges briefly, and waits. Use this when you want Claude to know something before your next task without taking any action yet.

## Voice quality, honestly

The extension uses Chrome's built-in speech recognition (`webkitSpeechRecognition`). It's free and runs locally, but:

- One language per session — pick English or French in the launcher; **it does not auto-switch**.
- Accuracy on accents, code, and technical jargon is mediocre.
- The skill knows this. Its playbooks tell Claude to treat the transcript as a "live draft" and use keyframes + events as ground truth, silently correcting obvious transcription errors.

A future release will support OpenAI Whisper for genuinely good multilingual transcription.

## Privacy

- Recording happens entirely in your browser. The video file never uploads anywhere.
- The browser sends your microphone audio to Google's speech-recognition service while transcribing (this is `webkitSpeechRecognition`, not us). It does not store the audio.
- Console-error capture only runs while you're actively recording, only on the tab you're recording, and only forwards error messages — no DOM, no cookies, no storage.
- Briefs are saved locally. They never leave your machine unless you paste the prompt into Claude (and even then, only Claude on your machine reads them).

## FAQ

**Does it work on `chrome://` pages?**
No. Chrome blocks tab capture on its own pages. Use it on regular websites and web apps.

**What about Firefox / Safari?**
Chromium-based browsers only for now (Chrome, Edge, Brave, Arc). Firefox would need a separate manifest. Safari is more work.

**Can I record longer than X minutes?**
Yes, but the resulting zip gets big (a 5-minute recording is ~30 MB). Pasting it into Claude is fine because Claude reads the local file, not the whole zip.

**Where do briefs get stored?**

- macOS / Linux: `~/Downloads/Brief/`
- Windows: `%USERPROFILE%\Downloads\Brief\`

**Can I share a brief with a teammate?**
The zip is self-contained. Send it to them; if they have the Claude Brief skill installed, they can paste `Use the brief skill to handle brief <id> as an issue.` and Claude will process it on their machine.

**It says "Receiving end does not exist."**
The content script wasn't yet injected into a tab you had open before installing. Reload the tab once, or click ✦ — it'll auto-inject on demand.

**Tab audio is muted while I record.**
We route the captured tab audio back to your speakers, but if you can't hear it, click somewhere on the page to give it focus.

## Repo layout

```
claude-brief/
├── extension/        ← Chrome MV3 extension (load unpacked)
│   ├── manifest.json
│   ├── background.js     ← service worker
│   ├── content.js        ← injects the bar, captures events
│   ├── bar.html / .css / .js   ← the floating launcher + recorder
│   ├── permission.html / .js   ← mic permission grant page
│   ├── icons/            ← Claude-style sparkle + recording dot
│   └── lib/zip.js        ← MV3-safe store-only ZIP writer
│
├── skill/            ← Claude skill (copy to ~/.claude/skills/brief)
│   ├── SKILL.md          ← router: "issue or PR?"
│   └── playbooks/
│       ├── issue.md      ← high-quality ticket playbook
│       └── pr.md         ← draft PR playbook
│
└── site/             ← landing page (static HTML, drop into Vercel/Netlify)
    └── index.html
```

## Roadmap

- [ ] Whisper integration (OpenAI API or `transformers.js`) for genuinely good multilingual transcription
- [ ] Auto-language detection (depends on Whisper)
- [ ] Annotations: draw on keyframes before saving
- [ ] Library: list past briefs in the launcher with re-paste shortcut
- [ ] Firefox port

## License

MIT — see [LICENSE](LICENSE).
