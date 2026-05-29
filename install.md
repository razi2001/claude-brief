# Install Claude Brief

## 1. Chrome extension

[Download the repo](https://github.com/razi2001/claude-brief/archive/refs/heads/main.zip) and unzip it (or clone it). Then in Chrome:

1. Open `chrome://extensions`
2. Toggle **Developer mode** on (top right)
3. **Load unpacked** → pick the `extension/` folder
4. Pin the ✦ icon to your toolbar

The first time you click ✦, a permission tab opens, then hands off to the setup page where you pick your daily schedule and copy the install prompt below (with your time filled in).

## 2. Skill (one prompt, paste into Claude Code Desktop)

No download or git needed — Claude reads the files straight from the public repo and recreates them locally.

```
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

## Update

```
Update the Claude Brief skill to the latest version. Read the three skill files from the public repo and overwrite the local copies (no download or git needed — just browse and recreate):
   - https://github.com/razi2001/claude-brief/blob/main/skill/SKILL.md            → ~/.claude/skills/brief/SKILL.md
   - https://github.com/razi2001/claude-brief/blob/main/skill/playbooks/issue.md  → ~/.claude/skills/brief/playbooks/issue.md
   - https://github.com/razi2001/claude-brief/blob/main/skill/playbooks/inbox.md  → ~/.claude/skills/brief/playbooks/inbox.md
Copy each file's contents verbatim, replacing what's there. Then tell me what changed.
```

## Uninstall

```
Uninstall the Claude Brief skill. Delete the directory ~/.claude/skills/brief and the "Brief Daily" scheduled task if they exist, and confirm both are gone. Also list any leftover briefs in ~/Downloads/claude-brief/ and ask me whether to delete them too.
```

Then remove the extension at `chrome://extensions`.
