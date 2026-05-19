/**
 * CommandCode MCP Server — main server class.
 *
 * Sets up the McpServer with StdioServerTransport, registers all tools,
 * performs an async health check, and handles graceful shutdown.
 *
 * Validates: Requirements 2.1, 2.6, 2.7, 13.1, 13.2, 13.3, 13.4, 13.5
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerAllTools } from "./tools/index.js";
import { checkCommandCodeAvailable } from "./resolver.js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

const pkg = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../package.json", import.meta.url)),
    "utf-8"
  )
);
const SERVER_VERSION: string = pkg.version;
const SERVER_NAME = "commandcode-mcp";

export class CommandCodeMcpServer {
  private server: McpServer;

  constructor() {
    this.server = new McpServer({
      name: SERVER_NAME,
      version: SERVER_VERSION,
    });

    // Register all tools
    registerAllTools(this.server);
  }

  /**
   * Start the server: connect transport, run async health check, log version.
   */
  async run(): Promise<void> {
    // Connect stdio transport
    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    // Log startup info to stderr (not stdout — that's for MCP messages)
    console.error(`${SERVER_NAME} v${SERVER_VERSION} running on stdio`);

    // Async health check — don't block startup
    checkCommandCodeAvailable().then((available) => {
      if (!available) {
        console.error(
          "WARNING: CommandCode CLI (cmc) not found. Install with: npm install -g command-code"
        );
      }
    });

    // Graceful shutdown
    const shutdown = async () => {
      console.error("Shutting down...");
      const timer = setTimeout(() => process.exit(0), 5000);
      try {
        await this.server.close();
      } finally {
        clearTimeout(timer);
        process.exit(0);
      }
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  }
}
