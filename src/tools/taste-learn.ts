/**
 * commandcode_taste_learn tool — triggers CommandCode's taste learning on a repository.
 *
 * Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { validatePath } from "../validation.js";
import { validateTimeoutSeconds } from "../validation.js";
import { executeCommandCode } from "../executor.js";
import { formatSuccess, formatError, formatTimeout } from "../response.js";

/**
 * Register the commandcode_taste_learn tool on the given MCP server.
 *
 * This tool wraps `commandcode taste learn <source>` to learn coding style
 * from a local directory or GitHub repository reference.
 */
export function registerTasteLearnTool(server: McpServer): void {
  server.tool(
    "commandcode_taste_learn",
    `Learn coding style (taste) from a repository so future CommandCode suggestions match the project's conventions.

Wraps: commandcode taste learn <source>

The source can be either:
- An absolute local directory path (e.g. "/home/user/my-project")
- A GitHub owner/repo reference (e.g. "facebook/react")

Example use case: Before asking CommandCode to generate code for your project, run taste learn on your repo so generated code follows your existing patterns, naming conventions, and architectural style.`,
    {
      source: z.string().min(1).max(4_096).describe(
        "Local directory path or GitHub owner/repo reference to learn taste from"
      ),
      timeout_seconds: z.number().int().min(1).max(900).optional().describe(
        "Maximum seconds to wait for the taste learning to complete (default: 300, max: 900)"
      ),
    },
    async ({ source, timeout_seconds }) => {
      // Validate source parameter
      validatePath(source, "source");

      // Validate and normalize timeout
      const timeoutSeconds = validateTimeoutSeconds(timeout_seconds);

      // Build args: taste, learn, <source>
      const args = ["taste", "learn", source];

      // Execute the CLI command
      const result = await executeCommandCode({
        args,
        timeoutSeconds,
      });

      // Format response based on result
      if (result.timedOut) {
        return formatTimeout(result, Math.round(result.elapsedMs / 1000));
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
