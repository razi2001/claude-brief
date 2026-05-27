# Pull Request Playbook

Goal: open a draft PR in the current repo that addresses what the user demonstrated in the brief — bug fix or feature — with a failing test first for bugs.

## 1. Verify the repo

Check that the current working directory is a git repo. If not, briefly state which repo you'd expect this to land in (e.g. infer from `pageUrl`'s domain) and ask. Otherwise proceed silently.

## 2. Classify

- **Bug**: events show errors, the user describes broken behavior, two identical clicks happen with no state change between frames, or `console-error` / `js-error` events exist.
- **Feature**: user describes what they want that doesn't exist yet.

## 3. Read keyframes — binary search

Same strategy as the issue playbook (see `issue.md` §3). Aim for 3–5 frames, not all of them.

## 4. Map transcript chunks to frames

Same as issue playbook §4. Use chunks within ±2000ms of a frame's timestamp to understand intent at that moment.

## 5. Locate the code

Strategies in order of cost:

1. **Click selectors**: `events` of type `click` contain CSS selectors. `grep -r 'pay-button'` etc. across the repo. This usually pinpoints the component within seconds.
2. **Page URL → route**: match `pageUrl`'s path to the router config.
3. **Transcript keywords**: feature/page names mentioned by the user.
4. **Recent commits**: if signals are weak, look at git log for touches near the area.

Skim, don't read everything. Stop when you've identified the file(s) that need to change.

## 6. For bugs: failing test FIRST

Before any fix:

1. Detect the test framework (look for `playwright.config`, `cypress.config`, `vitest.config`, `jest.config`).
2. Write a test that reproduces the bug, using the user's event sequence:
   - Navigate to `pageUrl`
   - Trigger the same clicks/keys in the same order
   - Assert on the expected behavior (from the transcript)
3. Run the test. **Confirm it fails with a symptom that matches the brief** (same error, same hung state, etc.).
4. If it doesn't fail, your model of the bug is wrong — re-read the brief.

This step is non-negotiable for bug PRs. It's how the user trusts that you actually understood the bug.

## 7. Implement

- **Bug**: minimal fix in the located file(s). No drive-by refactors. Rerun the test; confirm green.
- **Feature**: implement matching the repo's conventions. If there's a clear test pattern for similar features, write a matching test.

Run the project's lint + typecheck if they exist (`npm run lint`, `tsc --noEmit`, etc.). Fix what you broke.

## 8. Open the PR — as DRAFT

```
gh pr create --draft --title "<title>" --body "<body>"
```

(Or via GitHub MCP if connected.)

### Title

- **Bug**: `Fix: <one-line description of the bug>`
- **Feature**: `Add: <feature name>` or `<feature in imperative>`

### Body

```markdown
## Summary

<one-paragraph summary>

## Reproduction (for bugs)

1. <step from events>
2. <step>
...

The failing test in `<test file>` reproduces this on `main`.

## Fix / Implementation

- <what changed in file X>
- <what changed in file Y>

## Evidence

![Before](assetUrl-000)
> "<transcript chunk near this frame>"

![After](assetUrl-002)
> "<transcript chunk near this frame>"

## Brief

- Local: `~/Downloads/Brief/<id>/`
- Recording: see attached
- Brief ID: `<id>`
```

For GitHub specifically: image upload requires drag-and-drop in the web UI; the API doesn't support it directly. Either (a) include image **paths** and tell the user to drag them in, or (b) upload to GitHub user-content via an MCP that supports it.

## 9. Confirm

End with one short summary:

> Opened **<title>** as draft → <url>. <N> files changed. Tests: <X passing, Y new>. Branch: `<branch>`.

If anything is wrong (wrong file, wrong approach), the user gets one line to redirect.
