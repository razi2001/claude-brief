---
name: brief
description: Use this skill whenever the user mentions a "brief" (e.g. "handle brief mpogywhs-ft15hr as an issue", "process my inbox: briefs X, Y, Z"). Briefs are short screen+voice recordings from the Claude Brief Chrome extension stored locally on disk. This skill routes single briefs through issue.md and batches through inbox.md, files real tickets via the user's connected tracker MCP, and then deletes the processed brief.
---

# Claude Brief — Router

Briefs are short screen + voice recordings stored locally on disk in `~/Downloads/claude-brief/`. Each is either:

- a `.zip` file (`brief-<id>.zip`) — yet-to-be-extracted
- a folder (`brief-<id>/`) with `brief.json`, `recording.webm`, `keyframes/*.png`

Briefs only exist for one purpose: to become Linear/Jira/GitHub/Notion tickets. The user has already invested 30 seconds talking through what they wanted. Your job is to file the ticket — efficiently, without unnecessary questions — and then clean up.

## Step 1 — Identify the action

The user's prompt will be one sentence containing one of:

| User says…                                | Load                     |
|-------------------------------------------|--------------------------|
| "process my inbox" / "briefs X, Y, Z"     | `playbooks/inbox.md`     |
| "handle brief X as an issue" (or similar) | `playbooks/issue.md`     |

If the prompt names multiple brief IDs or contains the word "inbox", use `inbox.md` — that playbook orchestrates the others. Otherwise use `issue.md`.

## Step 2 — Read the playbook

Load the matching playbook from `~/.claude/skills/brief/playbooks/<name>.md` and follow it. The playbook contains all the rules: how to read the brief files, how to extract keyframes, how to infer the team/repo, how to embed images inline, etc.

## Hard rules (apply across all playbooks)

1. **Never ask which team / repo / channel.** Infer from the page URL, the user's connected MCPs, recent activity. State your inference in the final summary so the user can correct next time if wrong.
2. **Binary-search keyframes** — read 3-5 strategic frames (first, midpoint, last; more only if needed), not all of them. Most briefs have 20+ keyframes; reading all is wasteful.
3. **Embed images INLINE** via markdown `![](attachmentUrl)`, not as bare attachments. The ticket should be readable end-to-end without clicking through to attachments.
4. **Map transcript chunks to keyframes** by timestamp (±2000ms). When the user said something, what was on screen?
5. **Treat the transcript as a draft.** Chrome's speech recognition is mediocre on accents and jargon. Use the keyframes and page context as ground truth; silently correct obvious mis-transcriptions.
6. **One closing summary, not running commentary.** Don't narrate each step. When you're done, post one message: "Filed LIN-1234 — <title>." That's it.

## Step 3 — Delete the brief after processing

**Critical:** once a brief has been successfully turned into a real ticket (or batch of tickets), delete the source brief.

For a single brief:
- Delete both the zip (`~/Downloads/claude-brief/brief-<id>.zip`) and any extracted folder (`~/Downloads/claude-brief/brief-<id>/`)

For an inbox batch:
- Delete each brief in the batch as it's successfully processed
- If one brief fails, leave that one and continue with the rest
- Report at the end which were deleted vs. which were left for retry

The user does NOT want a directory full of old briefs accumulating. Briefs are ephemeral capture; tickets are the permanent artifact.

**Only delete on success.** If you couldn't file the ticket (MCP error, ambiguous request, anything), leave the brief in place so the user can retry. Tell them why it failed.
