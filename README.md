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

```bash
npm install -g commandcode-mcp
```

Or run directly with npx (no global install):

```bash
npx commandcode-mcp
```

Verify it works:

```bash
commandcode-mcp
# → commandcode-mcp v2.0.0 running on stdio
```

If you see a warning that CommandCode CLI is not found:

```bash
npm install -g command-code
# or set COMMANDCODE_PATH to the binary location
export COMMANDCODE_PATH=/path/to/commandcode
```

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

### VS Code / Cursor

Add to your MCP configuration:

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
