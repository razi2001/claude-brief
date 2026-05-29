# Issue / Ticket Playbook

Goal: produce one high-quality issue in the user's tracker (Linear / Jira / GitHub / Notion — whichever MCP is connected) with zero clarifying questions and images that render inline.

## 1. Classify

Quick read of `transcript` and `events`:

- **Bug** if you see words like "broken", "doesn't work", "but it didn't", "should be", "expected"; OR if `events` contains `console-error` / `js-error`; OR if the same click happens twice without UI change.
- **Feature / task** otherwise.

This determines structure (see step 6).

## 2. Pick the team / project — DO NOT ASK

Order of preference:

1. **Tracker MCP team listing.** Call `list_teams()` / equivalent. Look for a name that matches:
   - The `pageUrl` host's product area (e.g. `app.acme.com/billing` → "Billing" team)
   - Keywords from `transcript` ("checkout", "auth", "search"…)
   - Existing label conventions
2. **Repo CODEOWNERS** if you're in a repo.
3. **Most recently used team** by querying recent issues from this user.

Pick the best match confidently. **State the chosen team in your final summary** so the user can redirect with one word if wrong. Never ask up front.

## 3. Read keyframes — binary search

Do NOT read every keyframe. The typical recording has 10–30 frames; most are redundant.

```
1. Read keyframe-000 (start state)
2. Read the LAST keyframe (end state)
3. If they look identical: sample the middle frame. Done.
4. If different: read the midpoint between any two adjacent-different frames
   to find the moment of change. Recurse on the half that changed.
5. Stop at 3–5 frames total unless something is genuinely unclear.
```

You're trying to find the moments of state change, not narrate every second.

## 4. Map transcript chunks to frames

For each frame you decided to use (step 3), look at `transcriptChunks` and pull any chunk whose `tMs` is within ±2000ms of the frame's `timestamp`. That text is what the user was saying while showing that visual. Use it to write the caption / context for the frame.

If a chunk has no nearby frame, treat it as ambient narration.

## 5. Pull console / JS errors if present

Filter `events` for `type === 'console-error'` or `'js-error'`. These are the most signal-rich elements of a bug report — include them verbatim in a "Console" section. If there are none, skip the section entirely (don't write "No errors").

## 6. Write the ticket

### Title

One sentence, from the user's main complaint or the user's desired outcome. Imperative for bugs ("Pay button silently fails on /checkout"), noun phrase for features ("Add CSV export to invoices view").

### Description structure

**For bugs:**

```markdown
**Context**
Page: <pageUrl>
Browser: <derived from userAgent>

**Steps to reproduce**
1. Go to <page>
2. <derived from events, e.g. "Click 'Pay $29' (button#pay.primary)">
3. <next event>
...

**What happens**
<from transcript: user's description of the failure>

**Expected**
<from transcript "I'd expect…" / "should be…" parts; if missing, infer briefly>

**Console**
```
<console-error / js-error events verbatim>
```

**Evidence**

![Frame at 0:02 — checkout page before click](assetUrl-000)
> "<transcript chunk near 0:02>"

![Frame at 0:06 — no feedback after click](assetUrl-002)
> "<transcript chunk near 0:06>"

**Brief**: `~/Downloads/claude-brief/<id>/`  (recording attached)
```

**For features:**

```markdown
**What**
<one-paragraph summary derived from transcript>

**Why**
<motivation from transcript, if mentioned>

**Where**
Page: <pageUrl>

**Notes / sketches**
![Frame at 0:04 — where it should appear](assetUrl-001)
> "<transcript chunk near 0:04>"

**Brief**: `~/Downloads/claude-brief/<id>/`
```

## 7. Upload + embed images INLINE

The user wants images to **render in the ticket**, not appear as a list of file attachments. The flow on Linear (adapt for other MCPs):

For each selected keyframe:

1. `prepare_attachment_upload(issueId, filename, contentType, size)` → returns `uploadUrl`, `assetUrl`, `headers`
2. PUT the keyframe bytes to `uploadUrl` with those headers
3. `create_attachment_from_upload(issueId, assetUrl, filename)` to register it
4. **Use the `assetUrl` inline in the markdown description**: `![caption](assetUrl)`

Create the issue FIRST (with placeholder image refs or an empty Evidence section), then upload, then update the issue's description with the real URLs. Most trackers require an `issueId` before file upload.

### The recording

Every brief includes `recording.webm` (the full screen + voice capture). You decide whether to attach it to the ticket. **Attach it only when the video genuinely beats the keyframes** — don't attach by default, and don't attach just because it exists.

Attach the recording when:
- The bug is about **motion or timing**: a janky animation, a flash, a race condition, a layout that jumps, scroll jank, a transition that breaks
- The repro is a **multi-step interaction** that's hard to convey with a few stills (drag-and-drop, a multi-field form flow, a hover/focus sequence)
- The keyframes **miss the moment** — the sampling (every 2s) didn't capture the exact frame where it breaks
- The user's **voice explanation references something dynamic** ("watch how it stutters when I click here")

Skip the recording (keyframes alone are enough) when:
- It's a **static** bug — wrong text, broken layout, missing button, bad color, a value that's incorrect. A screenshot says everything.
- The keyframes already show the before/after clearly
- It's a **feature request** with no specific on-screen repro

When you do attach it, one line in the ticket: `**Recording**: see attached recording.webm`. When you don't, don't mention it at all — the keyframes carry the ticket.

To attach: use the tracker's file-upload flow (same `prepare_attachment_upload` → PUT → `create_attachment_from_upload` sequence as keyframes, but the webm goes as a downloadable attachment, not an inline image — most trackers don't render video inline).

## 8. Confirm + clean up

End with one short summary line:

> Filed **<title>** in **<team>** → <url>. Used N frames + Y transcript chunks. If <team> isn't right, just tell me.

That's it. No mid-flow questions. No "do you want me to attach the video?". You decided, you executed, you reported.

## 9. Delete the brief

After the ticket is successfully filed, delete the source brief from disk:

```bash
rm -rf ~/Downloads/claude-brief/brief-<id>.zip
rm -rf ~/Downloads/claude-brief/brief-<id>/
```

The user does NOT want old briefs accumulating in their Downloads folder — the ticket is the permanent artifact now, the brief was just the input. **Only delete if the ticket filing was confirmed successful.** If anything went wrong (MCP error, network failure, ambiguous request), leave the brief in place and tell the user what failed so they can retry.
