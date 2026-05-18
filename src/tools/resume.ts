/**
 * commandcode_resume tool — resumes a named (or most recent) CommandCode session.
 *
 * Allows continuing a specific prior conversation by session name, or listing
 * available sessions when no name is provided. Supports optional streaming
 * for progressive output delivery.
 *
 * Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 16.1
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  validateQuery,
  validateSessionName,
  validateWorkingDir,
  validateTimeoutSeconds,
} from "../validation.js";
import { executeCommandCode } from "../executor.js";
import { formatSuccess, formatError, formatTimeout } from "../response.js";
import { createStreamingContext } from "../streaming.js";

const TOOL_DESCRIPTION = `Resume a specific named CommandCode session, or resume the most recent session if no name is provided. This allows picking up a prior conversation by name rather than always continuing the last one.

Wraps: commandcode --resume [session_name] --skip-onboarding [--model M] -p <query>

Example use case: After working on multiple features, use this tool with session_name "auth-refactor" to resume that specific conversation — e.g. "add rate limiting to the auth middleware we discussed".`;

/**
 * Register the commandcode_resume tool on the given MCP server.
 *
 * @param server - The McpServer instance to register the tool on
 */
export function registerResumeTool(server: McpServer): void {
  server.tool(
    "commandcode_resume",
    TOOL_DESCRIPTION,
    {
      session_name: z.string().max(512).optional(),
      query: z.string().min(1).max(100_000),
      working_dir: z.string().optional(),
      model: z.string().max(100).optional(),
      stream: z.boolean().optional().default(false),
      timeout_seconds: z.number().int().min(1).max(900).optional(),
    },
    async (params, extra) => {
      // Validate inputs
      if (params.session_name) {
        validateSessionName(params.session_name);
      }
      const query = validateQuery(params.query);
      const workingDir = validateWorkingDir(params.working_dir);
      const timeoutSeconds = validateTimeoutSeconds(params.timeout_seconds);

      // Build args: --resume [session_name], optional --model, -p <query>
      const args: string[] = ["--resume"];

      if (params.session_name) {
        args.push(params.session_name);
      }

      if (params.model) {
        args.push("--model", params.model);
      }

      args.push("-p", query);

      // Create streaming context if streaming is enabled
      let onChunk: ((chunk: string) => void) | undefined;
      if (params.stream) {
        const progressToken = (extra as any)?._meta?.progressToken;
        const streamingContext = createStreamingContext(server, progressToken);
        const startTime = Date.now();
        onChunk = (chunk: string) => {
          const elapsedMs = Date.now() - startTime;
          const elapsedSeconds = elapsedMs / 1000;
          const progress = Math.min(
            (elapsedSeconds / timeoutSeconds) * 100,
            99
          );
          streamingContext.sendProgress(chunk, progress);
        };
      }

      // Execute the CLI command
      const result = await executeCommandCode({
        args,
        cwd: workingDir,
        timeoutSeconds,
        stream: params.stream,
        onChunk,
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
