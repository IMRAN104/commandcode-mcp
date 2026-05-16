# Contributing to CommandCode MCP

Thanks for helping improve CommandCode MCP. This doc covers bug reports, feature requests, and pull requests.

## Reporting Bugs

1. Check [existing issues](https://github.com/IMRAN104/commandcode-mcp/issues) to avoid duplicates.
2. Include:
   - **MCP server version** (`commandcode-mcp --version` if available, or `npm list -g commandcode-mcp`)
   - **Command Code version** (`cmc --version`)
   - **Environment**: OS, Node version (`node -v`), MCP client (Claude Desktop, VS Code, Cursor)
   - **Steps to reproduce** — exact query or tool call that failed
   - **Expected vs actual behavior**
   - **Relevant logs** — stderr output from the MCP server

## Suggesting Features

Open an issue with:
- What problem the feature solves
- How you'd use it
- Whether it maps to an existing `cmc` CLI flag or would need coordination with Command Code

## Pull Requests

1. Fork the repo, create a feature branch
2. Keep changes focused — one PR per feature or fix
3. Build passes: `npm run build`
4. Test manually by running the server and calling tools through your MCP client
5. Update the tools table in README.md if you add/modify tools
6. Open PR against `main` with a clear description

## Development Setup

```bash
git clone https://github.com/IMRAN104/commandcode-mcp.git
cd commandcode-mcp
npm install
npm run dev
```

The server runs on stdio. Point your MCP client at the local build:

```json
{
  "mcpServers": {
    "commandcode-dev": {
      "command": "node",
      "args": ["/absolute/path/to/commandcode-mcp/build/index.js"]
    }
  }
}
```

## Code Conventions

- TypeScript strict mode (as configured in tsconfig.json)
- Run `npm run build` before committing — the `build/` directory is what ships
- No `console.log` — use `console.error` for diagnostics (stdio transport uses stdout for MCP messages)
- Validate all user inputs before passing to `spawn()`
- Never interpolate user input into shell strings — pass as args array to `spawn()`