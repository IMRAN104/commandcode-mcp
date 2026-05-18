/**
 * commandcode_info tool — retrieves combined system info and status from CommandCode.
 *
 * Executes both `info` and `status` CLI commands sequentially and returns
 * the combined output with labeled sections.
 *
 * Validates: Requirements 8.1, 8.2, 8.3, 8.4
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { validateTimeoutSeconds } from "../validation.js";
import { executeCommandCode } from "../executor.js";
import { formatCombinedInfo } from "../response.js";

const TOOL_DESCRIPTION = `Check CommandCode's version, configuration, and current status to verify the environment is correctly set up.

Wraps: commandcode info + commandcode status (executed sequentially)

Example use case: Before starting a complex codebase analysis session, use this tool to confirm CommandCode is properly installed, check which version is running, and verify the current session state.`;

/**
 * Register the commandcode_info tool on the given MCP server.
 *
 * @param server - The McpServer instance to register the tool on
 */
export function registerInfoTool(server: McpServer): void {
  server.tool(
    "commandcode_info",
    TOOL_DESCRIPTION,
    {
      timeout_seconds: z.number().int().min(1).max(900).optional(),
    },
    async (params) => {
      // Validate timeout
      const timeoutSeconds = validateTimeoutSeconds(params.timeout_seconds);

      // Execute `info` command
      const infoResult = await executeCommandCode({
        args: ["info"],
        timeoutSeconds,
      });

      // Execute `status` command
      const statusResult = await executeCommandCode({
        args: ["status"],
        timeoutSeconds,
      });

      // Return combined formatted response
      return formatCombinedInfo(infoResult, statusResult);
    }
  );
}
