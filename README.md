# CommandCode MCP

**MCP server that brings [Command Code](https://commandcode.ai)'s codebase intelligence into Claude Desktop, VS Code, Cursor, and any MCP-compatible AI tool.**

6 tools. One chat window. No terminal copy-paste. Your AI assistant can now query your codebase, continue coding sessions, learn your style, and check system status — all inline.

---

## What is Command Code?

[Command Code](https://commandcode.ai) is a coding agent that learns your codebase and adapts to your coding style. It answers questions about architecture, generates code suggestions that match your conventions, and maintains persistent conversation threads across sessions.

**Without MCP**: you type `commandcode -p "explain this function"` in a terminal, read the output, copy it back into chat.

**With CommandCode MCP**: you say "explain this function" in chat, and your AI calls `commandcode_query` for you. Answer appears inline. Same chat.

---

## Tools

| Tool | What it does | CLI equivalent |
|---|---|---|
| `commandcode_query` | Ask a one-shot question about code | `commandcode -p "query"` |
| `commandcode_continue` | Continue the last conversation | `commandcode -c -p "query"` |
| `commandcode_resume` | Resume a named session or pick from history | `commandcode --resume [name]` |
| `commandcode_taste_learn` | Learn coding style from a repo | `commandcode taste learn <source>` |
| `commandcode_taste` | List/manage taste packages | `commandcode taste list` |
| `commandcode_info` | Show version, environment, config | `commandcode info` + `commandcode status` |

---

## Installation

### Prerequisites

- **Node.js** ≥ 18
- **[Command Code](https://commandcode.ai)** installed (`npm install -g command-code`)

### Install

#### Recommended (all OSes): `npx`

Don't install the MCP server globally — let your agent invoke it through `npx`:

```bash
npx -y commandcode-mcp
```

Why this is the best practice:

- **No global install permissions** (no `sudo`, no Windows ACL issues).
- **Always the latest patch** — `-y` auto-accepts the prompt; npm caches the package so subsequent launches are fast.
- **Same command on macOS, Linux, and Windows** — every MCP config below uses `npx -y commandcode-mcp`.
- **Survives Node version managers** (nvm, fnm, volta) — no stale shim pointing at a deleted Node version.

#### Alternative: global install

```bash
npm install -g commandcode-mcp
```

Use this if you want to invoke the binary by name (e.g. `commandcode-mcp` instead of `npx -y commandcode-mcp`). Be aware that on Windows this creates a `.cmd` shim — see the [Windows notes](#os-specific-notes) below.

#### Sanity check

This should print the version banner to stderr and then wait for MCP traffic on stdin. **The "hang" is expected** — that's the stdio transport waiting for a client. Hit Ctrl+C to exit.

```bash
npx -y commandcode-mcp
# → commandcode-mcp v2.0.3 running on stdio
```

If you see a warning that the Command Code CLI is not found, either install it:

```bash
npm install -g command-code
```

…or point the MCP server at an existing binary:

```bash
# macOS / Linux
export COMMANDCODE_PATH=/usr/local/bin/commandcode

# Windows (PowerShell)
$env:COMMANDCODE_PATH = "C:\Tools\commandcode\dist\index.mjs"
```

> **Tip:** On Windows, prefer pointing `COMMANDCODE_PATH` at the `dist/index.mjs` script rather than the `.cmd` shim. The resolver handles either, but the `.mjs` route bypasses an extra `cmd.exe` hop.

---

## Configuration

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "commandcode": {
      "command": "npx",
      "args": ["-y", "commandcode-mcp"]
    }
  }
}
```

Or if installed globally:

```json
{
  "mcpServers": {
    "commandcode": {
      "command": "commandcode-mcp"
    }
  }
}
```

### Claude Code (CLI)

**macOS / Linux — one-liner, no JSON editing:**

```bash
claude mcp add commandcode --transport stdio -- npx -y commandcode-mcp
```

**Windows — use `cmd /c` to wrap `npx`:**

```powershell
claude mcp add commandcode --transport stdio -- cmd /c npx -y commandcode-mcp
```

> **Why `cmd /c` on Windows is required.** On Windows, `npx` is a `.cmd` shim. Claude Code spawns stdio servers with `shell: false`, and Node ≥ 21 (CVE-2024-27980) refuses to launch `.cmd`/`.bat` files in that mode. Without `cmd /c` you'll see `MCP server "commandcode" Connection closed` immediately after `claude mcp add`. Wrapping through `cmd /c` makes `cmd.exe` itself the spawned executable, which then resolves the `.cmd` shim correctly.

**Scope the server to one project (writes `.mcp.json` in the project root) or to all projects:**

```bash
# macOS / Linux
claude mcp add --scope project commandcode --transport stdio -- npx -y commandcode-mcp
claude mcp add --scope user    commandcode --transport stdio -- npx -y commandcode-mcp
```

```powershell
# Windows
claude mcp add --scope project commandcode --transport stdio -- cmd /c npx -y commandcode-mcp
claude mcp add --scope user    commandcode --transport stdio -- cmd /c npx -y commandcode-mcp
```

**With an explicit `COMMANDCODE_PATH`:**

```bash
# macOS / Linux
claude mcp add commandcode --transport stdio \
  --env COMMANDCODE_PATH=/usr/local/bin/commandcode \
  -- npx -y commandcode-mcp
```

```powershell
# Windows
claude mcp add commandcode --transport stdio `
  --env COMMANDCODE_PATH=C:\Tools\commandcode\dist\index.mjs `
  -- cmd /c npx -y commandcode-mcp
```

Verify: `claude mcp list` should show `commandcode` as connected. Inside a session, `/mcp` displays live server status.

### VS Code / Cursor

Add to your MCP configuration (`.vscode/mcp.json` for VS Code, or Cursor's MCP settings):

```json
{
  "mcpServers": {
    "commandcode": {
      "command": "npx",
      "args": ["-y", "commandcode-mcp"]
    }
  }
}
```

### OpenCode

Edit `opencode.json` in your project root (or `~/.config/opencode/opencode.json` globally) and add the server under the `mcp` key. OpenCode uses a `command` **array** (no separate `args`):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "commandcode": {
      "type": "local",
      "command": ["npx", "-y", "commandcode-mcp"],
      "enabled": true
    }
  }
}
```

### JetBrains Junie

Open **Settings → Tools → Junie → MCP Settings** and click the edit icon, or directly edit `~/.junie/mcp.json` (global) or `.junie/mcp/mcp.json` in the project root. The schema matches Claude Desktop's:

```json
{
  "mcpServers": {
    "commandcode": {
      "command": "npx",
      "args": ["-y", "commandcode-mcp"]
    }
  }
}
```

### Cline

**VS Code extension:** open the Cline MCP panel and add the server via its UI, or edit the settings file VS Code points to.

**Cline CLI / JetBrains:** edit `~/.cline/data/settings/cline_mcp_settings.json` (create it if missing):

```json
{
  "mcpServers": {
    "commandcode": {
      "command": "npx",
      "args": ["-y", "commandcode-mcp"]
    }
  }
}
```

### Kilo Code

Kilo Code (v7.0.33+) uses a single config file at `~/.config/kilo/kilo.jsonc` (global) or `.kilo/kilo.jsonc` in the project root. MCP servers go under the `mcp` key with a `command` **array** and `environment` (not `env`):

```jsonc
{
  "mcp": {
    "commandcode": {
      "type": "local",
      "command": ["npx", "-y", "commandcode-mcp"],
      "environment": {},
      "enabled": true,
      "timeout": 10000
    }
  }
}
```

You can also use the interactive `kilo mcp add` prompt to write this entry for you.

### Kiro CLI

Edit `~/.kiro/settings/mcp.json` (global) or `.kiro/settings/mcp.json` in the workspace:

```json
{
  "mcpServers": {
    "commandcode": {
      "command": "npx",
      "args": ["-y", "commandcode-mcp"],
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

### Custom CommandCode path

If CommandCode is installed in a non-standard location:

```json
{
  "mcpServers": {
    "commandcode": {
      "command": "npx",
      "args": ["-y", "commandcode-mcp"],
      "env": {
        "COMMANDCODE_PATH": "/home/user/bin/commandcode"
      }
    }
  }
}
```

### OS-specific notes

The MCP server itself is OS-agnostic. The friction is in how each agent **spawns** it.

**Windows**

- Most agents (Claude Desktop, VS Code, Cursor, OpenCode, Junie, Cline, Kilo Code, Kiro CLI) accept `"command": "npx"` directly — they handle the `.cmd` shim internally and you do **not** need `cmd /c`.
- **Claude Code (CLI)** is the exception: prepend `cmd /c` to the spawn command (see [Claude Code](#claude-code-cli) above). This is a Node ≥ 21 + `shell: false` constraint, not a bug in `commandcode-mcp`.
- If you set `COMMANDCODE_PATH`, prefer the absolute path to the `dist/index.mjs` file. The resolver also accepts a `.cmd` shim and will transparently wrap it through `cmd.exe`, but pointing at the `.mjs` skips that hop.
- `npx` lives at `%APPDATA%\npm\npx.cmd` for a default `npm install -g` setup. Node version managers (volta, fnm, nvm-windows) may put it elsewhere — the resolver's PATH walk handles either case.

**macOS**

- If you installed Node via Homebrew on Apple Silicon, the global npm prefix is `/opt/homebrew/lib/node_modules`. The resolver probes this location automatically.
- Quote any path containing spaces (e.g. `/Users/<you>/Library/Application Support/...`) when setting `COMMANDCODE_PATH`.

**Linux**

- Both `/usr/local/lib/node_modules` (Node downloaded from nodejs.org) and `~/.npm-global/lib/node_modules` (when you've reconfigured `npm config set prefix`) are probed automatically — no `COMMANDCODE_PATH` needed for the common cases.
- On NixOS or other immutable distros where `/usr/local` doesn't exist, set `COMMANDCODE_PATH` explicitly.

**All OSes**

- The server prints `commandcode-mcp vX.Y.Z running on stdio` to **stderr** (not stdout — stdout is reserved for MCP JSON-RPC traffic). Agents that surface stderr will display this banner; that's normal, not an error.
- After the banner, the process appears to "hang" — it's actually awaiting MCP messages on stdin. Don't kill it from your agent's diagnostics; that's the protocol working as intended.

---

## Usage Examples

### Analyze your codebase

> "What does the authentication middleware do and how is it wired to Express?"

The AI calls `commandcode_query` with your query. Command Code analyzes your codebase. Answer appears in chat.

### Continue where you left off

> "Continue my last session — refactor the user service to use the new caching layer"

The AI calls `commandcode_continue`. Command Code picks up the previous session's context. Multi-turn conversations across restarts.

### Resume a named session

> "Resume the 'pr-review' session"

The AI calls `commandcode_resume` with `session_name: "pr-review"`. Your PR review thread comes back with full context.

### Teach Command Code your style

> "Learn coding style from the python/black repository"

The AI calls `commandcode_taste_learn` with `source: "psf/black"`. Future code suggestions match Black's conventions.

---

## Security

- **Input validation**: All tool inputs are validated for type, length, and dangerous characters (path traversal, shell injection)
- **No shell interpolation**: Arguments are passed directly to `spawn()`, not through shell strings
- **Concurrency guard**: `commandcode_continue` calls are serialized to prevent session corruption
- **CWD fallback**: If a requested working directory doesn't exist, the server falls back to `process.cwd()` instead of failing
- **Startup check**: Server warns if CommandCode CLI is unreachable at startup, but doesn't crash

---

## Development

```bash
git clone https://github.com/IMRAN104/commandcode-mcp.git
cd commandcode-mcp
npm install
npm run dev
```

### Build

```bash
npm run build
```

Output goes to `build/index.js`.

### Publishing

```bash
npm version patch   # or minor / major
npm publish --otp=<code>
```

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines on reporting bugs, suggesting features, and submitting pull requests.

---

## License

ISC © Imran

See [LICENSE](./LICENSE) for details.
