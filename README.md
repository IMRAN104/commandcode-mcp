# CommandCode MCP

**MCP server that brings [Command Code](https://commandcode.ai)’s codebase intelligence into Claude Desktop, VS Code, Cursor, and any MCP-compatible AI tool.**

10 tools. One chat window. No terminal copy-paste. Your AI assistant can now query your codebase, continue coding sessions, learn your style, and manage agent skills — all inline.

---

## What is Command Code?

[Command Code](https://commandcode.ai) is a coding agent that learns your codebase and adapts to your coding style. It answers questions about architecture, generates code suggestions that match your conventions, and maintains persistent conversation threads across sessions.

**Without MCP**: you type `cmc -p "explain this function"` in a terminal, read the output, copy it back into chat.

**With CommandCode MCP**: you say "explain this function" in chat, and your AI calls `cmc_query` for you. Answer appears inline. Same chat.

---

## Tools

| Tool | What it does | CLI equivalent |
|---|---|---|
| `cmc_query` | Ask a one-shot question about code | `cmc -p "query"` |
| `cmc_continue` | Continue the last conversation | `cmc -c -p "query"` |
| `cmc_resume` | Resume a named session or pick from history | `cmc --resume [name]` |
| `cmc_info` | Show version, environment, config | `cmc info` |
| `cmc_status` | Check authentication status | `cmc status` |
| `cmc_whoami` | Show logged-in user | `cmc whoami` |
| `cmc_feedback` | Send feedback or bug report | `cmc feedback [title]` |
| `cmc_taste_learn` | Learn coding style from a repo | `cmc taste learn <source>` |
| `cmc_taste` | List/manage taste packages | `cmc taste` |
| `cmc_skills` | Manage agent skills from GitHub | `cmc skills` |

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
# → CommandCode MCP server v2.0.0 running on stdio
```

If you see a warning that `cmc` is not found:

```bash
npm install -g command-code
# or set CMC_PATH to the cmc binary location
export CMC_PATH=/path/to/cmc
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

### Custom CMC path

If `cmc` is installed in a non-standard location:

```json
{
  "mcpServers": {
    "commandcode": {
      "command": "npx",
      "args": ["-y", "commandcode-mcp"],
      "env": {
        "CMC_PATH": "/home/user/bin/cmc"
      }
    }
  }
}
```

---

## Usage Examples

### Analyze your codebase

> "What does the authentication middleware do and how is it wired to Express?"

The AI calls `cmc_query` with your query. Command Code analyzes your codebase. Answer appears in chat.

### Continue where you left off

> "Continue my last session — refactor the user service to use the new caching layer"

The AI calls `cmc_continue`. Command Code picks up the previous session's context. Multi-turn conversations across restarts.

### Resume a named session

> "Resume the 'pr-review' session"

The AI calls `cmc_resume` with `session_name: "pr-review"`. Your PR review thread comes back with full context.

### Teach Command Code your style

> "Learn coding style from the python/black repository"

The AI calls `cmc_taste_learn` with `source: "psf/black"`. Future code suggestions match Black's conventions.

---

## Security

- **Input validation**: All tool inputs are validated for type, length, and dangerous characters (path traversal, shell injection)
- **No shell interpolation**: Arguments are passed directly to `spawn()`, not through shell strings
- **Concurrency guard**: `cmc_continue` calls are serialized to prevent session corruption
- **CWD fallback**: If a requested working directory doesn't exist, the server falls back to `process.cwd()` instead of failing
- **Startup check**: Server warns if `cmc` binary is unreachable at startup, but doesn't crash

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
npm publish
```

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines on reporting bugs, suggesting features, and submitting pull requests.

---

## License

ISC © Imran

See [LICENSE](./LICENSE) for details.