# Team Pulse

Real-time team activity monitor for VS Code. See what files your teammates are working on, live.

## Features

- **Real-time activity** — See which files teammates are currently editing
- **Room-based** — Create or join a room with an 8-character invite code
- **GitHub OAuth** — Authenticate with GitHub; optionally restrict a room to collaborators of a specific repo
- **Status indicators** — Online / Away / Offline per member
- **Auto-reconnect** — Reconnects automatically when VS Code restarts
- **30-day sessions** — Tokens and rooms expire after 30 days

## Getting Started

1. Install the extension
2. Click the **Team Pulse** icon in the Activity Bar
3. Click **Connect** → sign in with GitHub
4. **Create a room** (optionally link a GitHub repo to restrict access) or **join** with an invite code
5. Share the invite code with your teammates

## Commands

| Command | Description |
|---|---|
| `Team Pulse: Connect` | Connect to a room |
| `Team Pulse: Disconnect` | Disconnect from the current room |
| `Team Pulse: GitHub 다시 로그인` | Re-authenticate with GitHub |
| `Team Pulse: GitHub 로그아웃` | Log out and clear all saved data |
| `Team Pulse: 방 코드 초기화` | Reset the saved room code |

## Settings

| Setting | Default | Description |
|---|---|---|
| `teamPulse.serverUrl` | `wss://ws.imjemin.co.kr` | WebSocket server URL |
| `teamPulse.autoConnect` | `true` | Auto-connect on VS Code startup |

## Changelog

### v0.3.0
- **Branch indicator** — see which git branch each teammate is working on
- **Custom status message** — set a message like "lunch 🍜" or "in review" visible to teammates
- **Same-file conflict warning** — ⚠️ badge appears when a teammate opens the same file as you
- **Commit notifications** — teammates get notified when you commit (shows commit message)
- **Review request button** — expand a member card to send a code review request

### v0.2.4
- Fixed ping-pong reconnect loop when multiple VS Code instances use the same GitHub account

### v0.2.3
- Added GitHub profile avatars
- Fixed member card click handlers

## Privacy

Only workspace-relative file paths are shared with teammates (e.g. `src/index.ts`, not `/Users/yourname/...`).

## License

MIT
