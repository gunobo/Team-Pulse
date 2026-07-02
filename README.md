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

## Privacy

Only workspace-relative file paths are shared with teammates (e.g. `src/index.ts`, not `/Users/yourname/...`).

## License

MIT
