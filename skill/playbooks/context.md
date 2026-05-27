# Playbook — Context

The user recorded a brief to give you **background**. They're not asking you to file a ticket, open a PR, or brainstorm. They want you to **understand something** — a system, a flow, a domain, a problem space — so you can use that understanding in the next thing they ask.

Treat this as **briefing material**, not a task.

## Step 1 — Ingest

Read `brief.json`. Build a mental model:

- **What is this?** The page URL + title tell you the app/system. The transcript tells you what aspect they care about.
- **What's the structure?** Look at keyframes (binary-search — first, middle, last; more only if needed). What screens did they show? In what order?
- **What's the user trying to convey?** Listen for phrases like "this is how…", "we have…", "the way this works is…". These are the explanatory beats.
- **What's the implicit question?** Often the user records context because they're *about to* ask something. If you can infer what, you'll be faster when they do.

Use events (`clicks`, `key`, `scroll`) to confirm the flow. If they clicked X, then Y, then Z, that's the flow they want you to know.

## Step 2 — Acknowledge briefly

Respond with **3–5 sentences max** confirming what you understood. Concrete, not generic. Something like:

> Got it. You walked me through the customer-onboarding flow in Stripe Atlas — the signup form, then the dashboard with the three pending tasks, then the document upload screen. The bottleneck you flagged is users dropping off at the doc upload because the requirements aren't clear upfront. I'm holding this context.

Then **end with**: "What would you like to do with this?"

Do NOT:
- Summarize the whole transcript
- List every keyframe
- Restate things they didn't emphasize
- Offer unsolicited suggestions ("you could file an issue about this…")

## Step 3 — Hold and wait

Stop. Don't file anything, don't draft anything, don't propose actions. The brief is now context in your conversation memory. The user's next message will tell you what to *do* with it.

When they do follow up, weave the context in naturally. If they ask "how should we redesign the doc upload?", reference what you saw ("Based on the brief, the three pending tasks compete for attention with the upload prompt…"). If they ask something tangentially related, use the context to give a sharper answer without re-asking what the system looks like.

## What NOT to do

- **Never write a wall of text restating the brief.** That defeats the point — they just recorded it, they know what they said. A 5-sentence acknowledgment is the deliverable here.
- **Never auto-file a ticket** even if the brief sounds like a bug. If they wanted that, they'd have recorded it as an issue.
- **Don't ask clarifying questions about the brief itself.** If something was unclear, note it internally and ask later if it becomes relevant.
- **Don't promise to "remember"** anything for future sessions. Context lives in this conversation. If they want persistent memory, they'll save a doc.

## Edge case — recording is genuinely unclear

If after watching the brief you truly cannot tell what they're trying to convey (transcript is empty, frames are ambiguous, no narrative arc), say so honestly in one sentence and ask one specific question to anchor: "I can see you were on the dashboard but I'm not sure what aspect you wanted me to know — was it the data table, the filters, or the empty-state?" Pick the most likely framing.
