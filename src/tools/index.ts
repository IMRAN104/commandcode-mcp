/**
 * Tool registration orchestrator.
 *
 * Registers all 6 MCP tools on the server instance and creates shared
 * infrastructure (e.g. the continue queue) used across tool handlers.
 *
 * Validates: Requirements 12.1, 12.5
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ContinueQueue } from "../queue.js";
import { registerQueryTool } from "./query.js";
import { registerContinueTool } from "./continue.js";
import { registerResumeTool } from "./resume.js";
import { registerTasteLearnTool } from "./taste-learn.js";
import { registerTasteTool } from "./taste.js";
import { registerInfoTool } from "./info.js";

/**
 * Register all 6 CommandCode MCP tools on the given server instance.
 *
 * Creates a shared ContinueQueue for the continue tool's serialized execution.
 */
export function registerAllTools(server: McpServer): void {
  const continueQueue = new ContinueQueue();

  registerQueryTool(server);
  registerContinueTool(server, continueQueue);
  registerResumeTool(server);
  registerTasteLearnTool(server);
  registerTasteTool(server);
  registerInfoTool(server);
}
