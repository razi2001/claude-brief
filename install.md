# Install Claude Brief

## 1. Chrome extension

[Download the latest release](https://github.com/<you>/claude-brief/releases/latest), unzip, then in Chrome:

1. Open `chrome://extensions`
2. Toggle **Developer mode** on (top right)
3. **Load unpacked** → pick the `extension/` folder
4. Pin the ✦ icon to your toolbar

## 2. Claude Brief skill (one prompt, paste into Claude Code)

```
Install the Claude Brief skill on this machine. Download https://github.com/<you>/claude-brief/archive/refs/heads/main.tar.gz, extract just the `skill/` folder, and copy it to ~/.claude/skills/brief (overwrite if it exists). After installation, list the files you placed and confirm `~/.claude/skills/brief/SKILL.md` exists.
```

## Update

```
Update the Claude Brief skill on this machine. Re-download https://github.com/<you>/claude-brief/archive/refs/heads/main.tar.gz, replace the contents of ~/.claude/skills/brief with the latest `skill/` folder, and tell me the new version.
```

## Uninstall

```
Uninstall the Claude Brief skill. Delete the directory ~/.claude/skills/brief if it exists, and confirm it's gone.
```

Then remove the extension at `chrome://extensions`.
