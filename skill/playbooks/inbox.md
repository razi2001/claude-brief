# Playbook — Inbox (batched ticket filing)

The user is processing multiple briefs at once. Their prompt is one of:

> Use the brief skill to process my inbox: briefs abc-123, def-456, xyz-789. File each as a ticket. Group duplicates. Delete each brief after its ticket is successfully filed.

…or (from a scheduled task — no IDs listed):

> Use the brief skill to process my inbox.

Both mean the same thing: file tickets for everything currently in `~/Downloads/claude-brief/`, group obvious duplicates, delete each brief after success.

## Step 1 — Discover briefs

If the user named brief IDs in the prompt, use that list.

Otherwise (scheduled-task case), **list everything** in `~/Downloads/claude-brief/`:

```bash
ls ~/Downloads/claude-brief/
```

Pick up every `brief-<id>.zip` and every extracted `brief-<id>/` folder. If both exist for the same id, use the folder (already extracted). Build the list yourself.

For each brief:
1. Extract the zip if it isn't already extracted
2. Read `brief.json`
3. Note `id`, `pageUrl`, `pageTitle`, `transcript`, `transcriptChunks`, `keyframeMeta`, `events`

Don't read keyframes yet — just metadata.

If the inbox is empty (no briefs found), say so briefly and stop: *"Inbox is empty — nothing to process."* Don't error out.

## Step 2 — Triage out loud

Before filing anything, **show the user your read** in a single message:

> Looking at your 7 briefs:
> - 5 bugs, 2 feature requests
> - Two of the bugs look like the same thing — both about the date picker on the Labels page. I'd dedupe those into one ticket with both recordings linked.
>
> Plan: **6 tickets** to file (1 deduped from 2 briefs)
>
> Proceed?

**Exception — scheduled-task / unattended run.** If you detect this is running unattended (the user isn't in the loop — typically because the prompt is exactly "Use the brief skill to process my inbox." with no follow-up channel), skip the wait-for-confirmation. Proceed with the plan you described. The summary at step 6 is the user's review.

For interactive runs (user pasted from the extension), wait for confirmation.

This triage step is critical because:
- The user can't watch you process 7 things one by one — too much output to read
- You'll occasionally misread something or miss a dupe — letting them correct once is much better than them spotting it after 5 tickets are filed
- It builds trust: they see you understood before you acted

## Step 3 — Group related briefs

Look for pairs/triples that should be one ticket. Signals:

- **Same page URL + overlapping transcript topic** → almost certainly the same issue captured twice
- **Same error message in `console-error` events** → same bug
- **One brief explicitly references another** (the user said "like the thing I just recorded") → linked, file both but cross-link

When grouping, the resulting ticket should:
- Have ONE title (best phrasing from across the briefs)
- Embed keyframes from ALL contributing briefs (clearly labeled "from brief abc-123" etc.)
- Concatenate the transcripts with brief-id markers
- List all source brief IDs in the description for traceability

## Step 4 — Process each ticket

For each item in your processed list (single brief or grouped briefs), follow `playbooks/issue.md` — same rules apply (binary-search keyframes, inline images, no clarifying questions about team, etc.).

The only adjustment vs. solo issue filing: be **concise** in the description. The user is processing 7 things at once; they're not going to read each ticket in detail. Lead with what's broken, then evidence, then technical notes — skip the speculation.

## Step 5 — Delete processed briefs

**Critical:** as each ticket is successfully filed, delete the corresponding brief(s):

```bash
rm -rf ~/Downloads/claude-brief/brief-<id>.zip
rm -rf ~/Downloads/claude-brief/brief-<id>/
```

For a grouped ticket that combined multiple briefs, delete ALL the source briefs once the ticket is confirmed filed.

**Only delete on confirmed success.** If a ticket fails to file (MCP error, ambiguous request), leave that brief in place. Track which briefs were processed vs. skipped — you'll report this in step 6.

## Step 6 — Single closing summary

After all briefs are processed, give one final message:

> Done. Filed:
> - LIN-1234 — Date picker broken on Labels page *(from briefs abc-123, def-456 — both deleted)*
> - LIN-1235 — Test plan export missing CSV option *(from brief ghi-789 — deleted)*
> - LIN-1236 — Add bulk delete to test cases *(from brief jkl-012 — deleted)*
> - LIN-1237 — Customer impersonation should warn on save *(from brief mno-345 — deleted)*
>
> **Skipped** (brief retained for retry):
> - brief pqr-678 — couldn't infer team from the page URL; please retry with the team in the prompt

Concise. One line per output. Each line says what was filed AND whether the brief was cleaned up. The user should be able to verify everything that happened in 10 seconds.

## What NOT to do

- **Don't process briefs serially without the triage step.** Even with only 2 briefs, do the summary first — it's the user's checkpoint.
- **Don't auto-skip briefs you don't understand.** If a brief is ambiguous, flag it in the triage summary and ask. Better to ask once than to file a wrong ticket.
- **Don't try to be clever about ordering.** File in the order the user mentioned them.
- **Don't delete a brief if its ticket-filing failed.** That brief is the user's only record of what they wanted to capture.

## Edge case — missing brief

If a brief zip referenced in the prompt isn't on disk, note it in the triage step and proceed without it:

> One brief (xyz-789) wasn't found in ~/Downloads/claude-brief/. It may have been moved or already processed. Skipping it. The other 6 are ready — proceed?
