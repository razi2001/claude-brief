---
name: brief
description: Use this skill whenever the user mentions a "brief" (e.g. "handle brief mpogywhs-ft15hr as an issue", "use the brief skill to handle brief X as a PR"). Briefs are short screen+voice recordings from the Claude Brief Chrome extension; this skill routes to the right playbook (issue, PR, brainstorm, context) and the playbook does the rest.
---

# Claude Brief — Router

Briefs are short screen + voice recordings stored locally on disk. Each contains a transcript, time-stamped transcript chunks, sampled keyframes, a user-event timeline, and the original recording. The user wants you to act on one — efficiently and without unnecessary back-and-forth.

## Step 1 — Identify the action

The user's prompt will be one sentence containing the brief ID and one of:

| User says…                                | Load                       |
|-------------------------------------------|----------------------------|
| "as an issue" / "as a ticket"             | `playbooks/issue.md`       |
| "as a PR" / "as a pull request"           | `playbooks/pr.md`          |
| "as a brainstorm" / "as an idea"          | `playbooks/brainstorm.md`  |
| "as context" / "as background"            | `playbooks/context.md`     |

If unclear, default to `issue`. Don't ask which one.

## Step 2 — Locate the brief

Default location: `~/Downloads/Brief/<id>/brief.json`

If the folder doesn't exist yet, the zip is sibling: `~/Downloads/Brief/brief-<id>.zip`. Unzip first:

```bash
unzip -o ~/Downloads/Brief/brief-<id>.zip -d ~/Downloads/
```

The folder then contains:

- `brief.json` — metadata + transcript + events + keyframes index
- `recording.webm` — original recording
- `keyframes/keyframe-NNN.png` — sampled frames

## Step 3 — Read the playbook and follow it

Read the matching playbook file in this skill's `playbooks/` folder. Follow it precisely. The playbooks contain the actual quality instructions — they exist so this main file stays a short router.

## Brief schema (v2)

```json
{
  "id": "string",
  "schemaVersion": 2,
  "createdAt": "ISO 8601",
  "durationMs": 0,
  "pageUrl": "string | null",
  "pageTitle": "string | null",
  "userAgent": "string",
  "transcript": "string | null",
  "transcriptLang": "en-US | fr-FR",
  "transcriptChunks": [
    { "tMs": 0, "text": "what user said" }
  ],
  "keyframes": [
    { "index": 0, "timestamp": 0, "file": "keyframes/keyframe-000.png" }
  ],
  "events": [
    { "type": "click",  "tMs": 0, "url": "...", "element": { "tag": "...", "selector": "...", "text": "..." }, "x": 0, "y": 0 },
    { "type": "key",    "tMs": 0, "key": "<char>", "isInput": true },
    { "type": "scroll", "tMs": 0, "y": 0 },
    { "type": "console-error", "tMs": 0, "args": ["..."] },
    { "type": "js-error", "tMs": 0, "message": "...", "filename": "...", "lineno": 0 }
  ],
  "recording": { "file": "recording.webm", "mimeType": "...", "durationMs": 0 }
}
```

## Hard rules (apply to every playbook)

1. **Never ask which team/repo/channel.** Infer it. State your inference in the final summary so the user can correct you if needed.
2. **Don't read all keyframes.** Binary-search them (see playbook).
3. **Embed images inline** in markdown (`![](assetUrl)`), not as bare attachments. The user wants images that render in the ticket, not files to download.
4. **One quote per source** when paraphrasing the transcript. Trust events + frames as ground truth and silently correct obvious transcription errors.
5. **Confirm at the end, not before.** Show what you did + a link. Don't pause for approval mid-flow.
