#!/usr/bin/env node
/**
 * Entry point for the CommandCode MCP Server.
 *
 * Validates: Requirement 14.4
 */

import { CommandCodeMcpServer } from "./server.js";

const server = new CommandCodeMcpServer();
server.run().catch((err) => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
