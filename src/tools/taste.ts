/**
 * commandcode_taste tool — lists and manages CommandCode taste profiles.
 *
 * Executes `commandcode taste` to display learned coding style profiles.
 *
 * Validates: Requirements 7.1, 7.2, 7.3
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { validateTimeoutSeconds } from "../validation.js";
import { executeCommandCode } from "../executor.js";
import { formatSuccess, formatError, formatTimeout } from "../response.js";

const TOOL_DESCRIPTION = `View and manage CommandCode's learned taste profiles to understand what coding styles are active.

Wraps: commandcode taste

Example use case: Before starting a code generation task, invoke this tool to check which taste profiles are active — ensuring generated code matches the project's conventions.`;

/**
 * Register the commandcode_taste tool on the given MCP server.
 *
 * @param server - The McpServer instance to register the tool on
 */
export function registerTasteTool(server: McpServer): void {
  server.tool(
    "commandcode_taste",
    TOOL_DESCRIPTION,
    {
      timeout_seconds: z.number().int().min(1).max(900).optional(),
    },
    async (params) => {
      // Validate timeout
      const timeoutSeconds = validateTimeoutSeconds(params.timeout_seconds);

      // Build args: taste list
      const args: string[] = ["taste", "list"];

      // Execute CommandCode CLI
      const result = await executeCommandCode({
        args,
        timeoutSeconds,
      });

      // Format response based on result
      if (result.timedOut) {
        const elapsedSeconds = Math.round(result.elapsedMs / 1000);
        return formatTimeout(result, elapsedSeconds);
      }

      if (result.code !== null && result.code !== 0) {
        const stdout = result.stdout.trim();
        const stderr = result.stderr.trim();
        let message = `Command Code exited with code ${result.code}`;
        if (stdout) {
          message += "\n\n" + stdout;
        }
        if (stderr) {
          message += "\nSTDERR: " + stderr;
        }
        return formatError(message);
      }

      return formatSuccess(result);
    }
  );
}
