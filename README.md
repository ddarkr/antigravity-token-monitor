# Antigravity Token Monitor

[![VS Code](https://img.shields.io/badge/VS%20Code-Extension-007ACC?logo=visualstudiocode)](https://code.visualstudio.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Svelte](https://img.shields.io/badge/Svelte-5-FF3E00?logo=svelte)](https://svelte.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> Monitor Antigravity session token usage and review session activity in a dashboard.

Antigravity Token Monitor is a VS Code extension that automatically collects, analyzes, and visualizes **token usage** across your [Antigravity](https://blog.google/technology/google-deepmind/) coding sessions. It connects to the running Antigravity process via internal RPC, exports token metadata as local JSONL artifacts, and presents the data through a rich Svelte-powered dashboard and a persistent status bar indicator.

---

## Features

- 🔥 **Real-time Token Tracking** — Automatically monitors token usage across all Antigravity sessions
- 🕰️ **Historical Session Recovery** — Recovers session data that existed before the extension was started by directly querying the RPC server for sessions missing from the active list
- 📊 **Interactive Dashboard** — Svelte-based webview with KPI cards, heatmaps, model usage tables, and session leaderboards
- 💰 **Cost Estimation** — Per-model cost calculation using [LiteLLM](https://github.com/BerriAI/litellm) open-source pricing data
- 🏷️ **Model Breakdown** — Per-model token breakdown (input, output, cache read/write, reasoning) with automatic resolution of internal model placeholder IDs
- 📈 **Activity Heatmap** — 180-day activity visualization showing daily token usage and cost patterns
- 🔄 **RPC Export** — Periodically exports session data from the Antigravity RPC server into local JSONL artifacts
- 🔒 **Multi-instance Safety** — File-based locking prevents duplicate refresh/export across multiple VS Code windows
- ⏱️ **Refresh Countdown** — Visual countdown timer with circular progress ring showing time until the next auto-refresh
- 🖥️ **Status Bar** — Always-visible total token count in the VS Code status bar

---

## ⚠️ Disclaimer

> [!WARNING]
>
> - This is an **unofficial, community-driven** project and is **not affiliated with or endorsed by Google**.
> - The extension relies on **undocumented internal RPC endpoints** of the Antigravity process. These may change or break without notice in any Antigravity update.
> - Token counts labeled as **"estimated"** are heuristic approximations (`text length ÷ 4`) and may differ significantly from actual usage.
> - Cost estimates are based on [LiteLLM's open-source pricing data](https://github.com/BerriAI/litellm) and may not reflect your actual billing. **Do not use these values for financial decisions.**
> - The extension makes **local HTTPS requests to `127.0.0.1`** to communicate with the Antigravity process. No data is sent to external servers (except fetching the LiteLLM pricing JSON from GitHub).
> - When `exportStepsJsonl` is enabled, **conversation content that Antigravity normally stores encrypted** will be exported as **plain-text JSONL** and cached on your local machine (`~/.gemini/antigravity/.token-monitor/`). Be aware that this may expose sensitive conversation data in an unencrypted form.

---

## Getting Started

### Prerequisites

- [VS Code](https://code.visualstudio.com/) `≥ 1.96.0`
- [Node.js](https://nodejs.org/) `≥ 18`
- A running [Antigravity](https://blog.google/technology/google-deepmind/) instance (the extension auto-detects the process)

### Installation (Development)

```bash
# Clone the repository
git clone https://github.com/user/antigravity-token-monitor.git
cd antigravity-token-monitor

# Install dependencies
npm install

# Compile the extension
npm run compile

# Or watch for changes during development
npm run watch
```

Then press **F5** in VS Code to launch the Extension Development Host.

### Usage

1. Open the **Command Palette** (`Cmd+Shift+P` / `Ctrl+Shift+P`)
2. Run `Antigravity Token Monitor: Open Dashboard`
3. The dashboard opens in a webview panel, displaying token usage data

You can also click the **token counter** in the status bar to open the dashboard.

---

## Commands

| Command                                          | Description                                        |
| ------------------------------------------------ | -------------------------------------------------- |
| `Antigravity Token Monitor: Open Dashboard`      | Open the token monitoring dashboard                |
| `Antigravity Token Monitor: Refresh Now`         | Trigger an immediate data refresh                  |
| `Antigravity Token Monitor: Export Sessions Now` | Force-export all sessions and display the count    |
| `Antigravity Token Monitor: Reset Cache`         | Delete all cached data and re-process from scratch |

---

## Configuration

All settings are under `antigravity-token-monitor.*` in VS Code settings.

| Setting               | Default                 | Description                                           |
| --------------------- | ----------------------- | ----------------------------------------------------- |
| `sessionRoot`         | `~/.gemini/antigravity` | Override the Antigravity session root directory       |
| `pollIntervalMs`      | `60000`                 | How often the extension rescans sessions (ms)         |
| `historyLimit`        | `120`                   | Max snapshots to keep per session                     |
| `maxFileBytes`        | `524288`                | Max file size to read during token estimation (bytes) |
| `useRpcExport`        | `true`                  | Enable exporting sessions through the internal RPC    |
| `exportStepsJsonl`    | `false`                 | Also export conversation steps (for debugging)        |
| `rpcExportIntervalMs` | `300000`                | How often to run background RPC exports (ms)          |
| `rpcTimeoutMs`        | `5000`                  | Timeout for internal RPC requests (ms)                |

---

## Architecture

The extension follows a layered pipeline architecture:

```
Data Acquisition → Analysis → Orchestration → Presentation
```

**Data Acquisition**: The `ProcessLocator` detects the running Antigravity `language_server` process, the `AntigravityRpcClient` fetches token metadata via HTTPS RPC, and the `TrajectoryExporter` serializes it into local `usage.jsonl` files. Sessions not found in the active RPC list are recovered via direct fallback queries, enabling historical session data collection even for sessions that existed before the extension was started. The `modelAliases` module resolves internal model placeholder IDs (`MODEL_PLACEHOLDER_*`) to human-readable names.

**Analysis**: The `SessionScanner` enumerates session directories, the `AntigravitySessionParser` extracts token counts (either from structured usage records or text-based estimation), and the `LiteLlmPricingCatalog` calculates per-model costs.

**Orchestration**: The `TokenMonitorService` coordinates periodic polling, RPC exports, and event emission with debounced updates. A file-based `PollLock` mechanism prevents duplicate processing when multiple VS Code instances are running.

**Presentation**: The `TokenStatusBar` shows a persistent token count, and the `DashboardPanel` renders a Svelte webview with 13 UI components including KPI strips, heatmaps, model tables, session leaderboards, and a real-time refresh countdown timer.

For a detailed breakdown, see `docs/architecture.md` in this repository.

---

## Project Structure

```
src/
├── extension.ts               # Extension entry point
├── config.ts                  # Configuration reader
├── types.ts                   # Shared type definitions
├── modelAliases.ts            # Model placeholder ID → name resolution
├── rpc/                       # Data acquisition (RPC layer)
├── monitor/                   # Scanning, analysis, orchestration
│   └── pollLock.ts            #   File-based lock for multi-instance safety
├── parser/                    # Token parsing (reported/estimated)
├── pricing/                   # LiteLLM-based cost estimation
├── storage/                   # Persistence (artifacts + snapshots)
├── statusBar/                 # VS Code status bar
└── webview/                   # Svelte dashboard UI
    ├── components/            #   13 UI components
    └── lib/                   #   Stores, formatters, utilities
```

---

## Development

```bash
# Compile
npm run compile

# Watch mode
npm run watch

# Type check (extension)
npm run typecheck

# Type check (webview)
npm run typecheck:webview

# Run webview tests
npm run test:webview
```

### Tech Stack

| Layer      | Technology               |
| ---------- | ------------------------ |
| Extension  | TypeScript, Node.js      |
| Webview UI | Svelte 5                 |
| Bundler    | esbuild + esbuild-svelte |
| Testing    | Vitest, Testing Library  |

---

## How It Works

1. **Process Detection** — Finds the Antigravity `language_server` process via `ps` and extracts its CSRF token and port
2. **RPC Communication** — Calls `GetCascadeTrajectoryGeneratorMetadata` to fetch per-session token usage metadata
3. **Historical Recovery** — Sessions missing from the active RPC list are queried directly using file-system session IDs as a fallback, recovering data from sessions that existed before the extension was started
4. **Model Resolution** — Internal model placeholder IDs (`MODEL_PLACEHOLDER_*`) are resolved to human-readable names via a static mapping, with `responseModel` fields taking priority when available
5. **JSONL Serialization** — Normalizes metadata into `usage.jsonl` records stored under `.token-monitor/rpc-cache/`
6. **Token Parsing** — Extracts model-specific token breakdowns (input, output, cache, reasoning) from structured records, or estimates from text length as fallback
7. **Cost Calculation** — Matches models against [LiteLLM's open-source pricing catalog](https://github.com/BerriAI/litellm) to compute USD costs
8. **Visualization** — Renders data in the status bar and a Svelte webview dashboard with a real-time refresh countdown

---

## Inspired By

- **[antigravity-storage-manager](https://github.com/unchase/antigravity-storage-manager)** — Session token parsing approach
- **[tokscale](https://github.com/junhoyeo/tokscale)** — Token usage tracking and visualization

---

## License

This project is licensed under the MIT License.
