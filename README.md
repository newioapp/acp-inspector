# ACP Inspector

A developer tool for testing and debugging [Agent Client Protocol (ACP)](https://agentclientprotocol.com) agents. Think of it as the [MCP Inspector](https://github.com/modelcontextprotocol/inspector), but for ACP.

## Motivation

When building or integrating ACP agents, developers need a way to:

- **Verify the ACP handshake** — confirm that `initialize` negotiates the correct protocol version and capabilities.
- **Test prompts interactively** — send prompts to an agent and observe the full response lifecycle (thinking, tool calls, agent messages) without wiring up a full client application.
- **Inspect raw protocol traffic** — see the actual JSON-RPC messages on the wire, not abstracted summaries, to diagnose serialization issues, unexpected responses, or protocol violations.
- **Manage multiple sessions** — create and switch between independent sessions to test session isolation and context window behavior.
- **Handle permission requests** — respond to `session/request_permission` calls inline, simulating what a real client (like an IDE) would do.

The ACP Inspector provides all of this in a standalone desktop app with zero configuration beyond pointing it at an agent command.

## Features

### Connection Management
- Spawn any ACP agent via command line (e.g. `kiro-cli acp --trust-all-tools`)
- Configurable working directory
- Shell environment sourcing — automatically loads PATH and other variables from your login shell (zsh/bash), with manual override support
- Connection status with PID display
- Friendly error messages (e.g. command not found → suggests checking PATH)
- Error detail modal with full stack trace

### Agent Information
- Displays agent name, version, and title from the `initialize` response
- Capability badges: `loadSession`, `listSessions`, prompt types (image/audio), MCP transports (http/sse)
- Authentication method details
- Raw JSON response for full inspection

### Session Management
- Create new sessions
- List existing sessions (when agent supports `sessionCapabilities.list`)
- Switch between sessions — output and protocol log filter to the active session
- Full session IDs displayed and copyable

### Interactive Prompting
- Send prompts with Enter (Shift+Enter for newline)
- Interrupt button sends `session/cancel` notification to stop in-flight prompts
- User messages displayed in the output alongside agent responses

### Output Panel
- Groups contiguous session updates by type for readability
- Concatenates text chunks (`agent_message_chunk`, `agent_thought_chunk`, `user_message_chunk`) into coherent blocks
- Color-coded labels: green for agent messages, blue for thoughts, yellow for tool calls
- Inline permission request cards with action buttons

### Protocol Log
- Captures actual JSON-RPC messages from the ndjson stream (not reconstructed summaries)
- Direction indicators: `→` (sent, blue) / `←` (received, green)
- **Two-tier filtering**:
  - Tier 1: filter by JSON-RPC method (`initialize`, `session/new`, `session/prompt`, `session/update`, etc.)
  - Tier 2: for `session/update`, filter by sub-type (`agent_message_chunk`, `tool_call`, `tool_call_update`, `plan`, etc.)
- **Search** (Ctrl/Cmd+F): text search across message payloads, composable with filters (AND logic)
- Filters by active session — only shows messages relevant to the selected session
- Selectable/copyable text

### Environment Variables
- Dedicated tab for viewing and editing environment variables
- Sync from login shell with one click (supports multiple shells)
- Manual add/edit/remove
- Variables are passed to the agent process on connect
- Auto-sourced on app startup

### Settings
- Theme: system / light / dark

## Architecture

The ACP Inspector follows the same architecture as the [Newio Agent Connector](../connector/):

```
┌─────────────────────────────────────────────────┐
│                  Electron App                    │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│  │  Main    │  │ Preload  │  │   Renderer    │  │
│  │ Process  │◄─┤  Bridge  ├─►│   (React)     │  │
│  └────┬─────┘  └──────────┘  └───────────────┘  │
│       │                                          │
│  ┌────┴──────────────┐                           │
│  │ AcpConnectionMgr  │                           │
│  │  - spawn process  │                           │
│  │  - ndjson stream  │                           │
│  │  - stream taps    │                           │
│  └────┬──────────────┘                           │
│       │ stdio                                    │
└───────┼──────────────────────────────────────────┘
        ▼
   ACP Agent Process
   (e.g. kiro-cli acp)
```

### Main Process (`src/main/`)

| File | Purpose |
|---|---|
| `index.ts` | App entry point — wires store, window, connection manager, IPC |
| `acp-connection-manager.ts` | Core logic: spawns ACP child process, manages `ClientSideConnection`, implements `acp.Client`, intercepts the ndjson stream to capture raw protocol messages |
| `ipc-handler.ts` | Implements `IpcApi` — theme, shell env, directory picker, ACP lifecycle |
| `ipc-registry.ts` | Generic `ipcMain.handle` registration from channel map |
| `store.ts` | Electron-store for theme, window bounds, last-used connection config |
| `main-window.ts` | BrowserWindow lifecycle and bounds persistence |
| `shell-env.ts` | Resolves environment variables from the user's login shell |

### Shared (`src/shared/`)

| File | Purpose |
|---|---|
| `types.ts` | `ConnectionConfig`, `ConnectionStatus`, `ProtocolMessage`, `SessionInfo`, `PermissionRequest`, etc. |
| `ipc-api.ts` | 13 typed IPC methods + channel name map |
| `ipc-events.ts` | 5 push events: `connection-status`, `protocol-message`, `session-update`, `permission-request`, `prompt-done` |

### Renderer (`src/renderer/src/`)

| File | Purpose |
|---|---|
| `App.tsx` | Two-tab layout (Inspector / Environment), status bar, modal management |
| `stores/inspector-store.ts` | Zustand store for all inspector state |
| `components/ConnectionBar.tsx` | Command input, working directory picker, connect/disconnect |
| `components/SessionPanel.tsx` | Create/list/select sessions, agent info button |
| `components/OutputPanel.tsx` | Grouped session updates with text concatenation |
| `components/ProtocolLog.tsx` | Raw JSON-RPC log with two-tier filtering and search |
| `components/PromptInput.tsx` | Prompt textarea with send and interrupt buttons |
| `components/PermissionCard.tsx` | Inline permission request with action buttons |
| `components/AgentInfoModal.tsx` | Agent capabilities, info, and auth methods |
| `components/EnvVarsTab.tsx` | Environment variable management with shell sync |
| `components/SettingsPanel.tsx` | Theme picker |

### Protocol Message Capture

The inspector captures raw JSON-RPC messages by intercepting the ndjson stream between the SDK and the agent process using `TransformStream` taps:

```
Agent Process (stdio)
        │
   ndjson encode/decode
        │
   ┌────┴────┐
   │ Raw     │
   │ Stream  │
   └────┬────┘
        │
  ┌─────┴──────┐
  │ Tap Sent   │──► onProtocolMessage('sent', msg)
  └─────┬──────┘
        │
  ClientSideConnection
        │
  ┌─────┴──────┐
  │Tap Received│──► onProtocolMessage('received', msg)
  └─────┬──────┘
        │
   ACP SDK
```

This captures the actual protocol payloads as they cross the wire, rather than manually constructing summaries from SDK method calls.

## Agent and Model Switching

kiro-cli supports switching the active agent (mode) and model mid-session via standard ACP JSON-RPC methods — no need to go through the `_kiro.dev/commands/execute` slash command extension.

### `session/set_mode` — Switch Agent

Changes the active agent within the current session.

```jsonc
// Request
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "session/set_mode",
  "params": {
    "sessionId": "<active-session-id>",
    "modeId": "<agent-name>"  // e.g. "claude", "kiro"
  }
}
```

This is what `/agent swap <name>` should map to. The `modeId` corresponds to the agent name from the `modes.availableModes` list returned by `session/new` or `session/load`.

### `session/set_model` — Switch Model

Changes the LLM model within the current session.

```jsonc
// Request
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "session/set_model",
  "params": {
    "sessionId": "<active-session-id>",
    "modelId": "<model-id>"  // e.g. "claude-sonnet-4-20250514"
  }
}
```

This is what `/model swap <name>` should map to.

### Reference

These methods are used by kiroom's `AcpSessionManager` for agent/model swapping (see `acp-session-manager.js`). They are standard ACP protocol methods and bypass the `_kiro.dev/commands/execute` extension entirely.

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop framework | Electron |
| Build tool | electron-vite |
| UI | React + Tailwind CSS v4 |
| State management | Zustand |
| ACP SDK | `@agentclientprotocol/sdk` |
| Persistence | electron-store |
| Icons | lucide-react |

## Development

```bash
# Install dependencies
npm install

# Run in dev mode
npm run dev

# Build
npm run build

# Type check
npm run typecheck
```
