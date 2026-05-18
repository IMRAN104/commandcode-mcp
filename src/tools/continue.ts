/**
 * commandcode_continue tool — continues the most recent CommandCode session.
 *
 * Uses a bounded queue to serialize execution and prevent session state corruption.
 * Supports optional streaming for progressive output delivery.
 *
 * Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 16.1
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ContinueQueue } from "../queue.js";
import {
  validateQuery,
  validateWorkingDir,
  validateTimeoutSeconds,
} from "../validation.js";
import { executeCommandCode } from "../executor.js";
import { formatSuccess, formatError, formatTimeout } from "../response.js";
import { createStreamingContext } from "../streaming.js";
import type { CommandCodeResult, ToolResponse } from "../types.js";

const TOOL_DESCRIPTION = `Continue the most recent CommandCode conversation session, building on prior context without re-explaining the codebase state.

Wraps: commandcode -c --skip-onboarding [--model M] -p <query>

Example use case: After an initial query about authentication flow, use this tool to ask follow-up questions like "now refactor that auth middleware to use JWT tokens" — CommandCode remembers the prior conversation context.`;

/**
 * Register the commandcode_continue tool on the given MCP server.
 *
 * @param server - The McpServer instance to register the tool on
 * @param queue - The shared ContinueQueue for serialized execution
 */
export function registerContinueTool(
  server: McpServer,
  queue: ContinueQueue
): void {
  server.tool(
    "commandcode_continue",
    TOOL_DESCRIPTION,
    {
      query: z.string().min(1).max(100_000),
      working_dir: z.string().optional(),
      model: z.string().max(100).optional(),
      stream: z.boolean().optional().default(false),
      queue: z.boolean().optional().default(true),
      timeout_seconds: z.number().int().min(1).max(900).optional(),
    },
    async (params, extra) => {
      // Validate inputs
      const query = validateQuery(params.query);
      const workingDir = validateWorkingDir(params.working_dir);
      const timeoutSeconds = validateTimeoutSeconds(params.timeout_seconds);

      // Build args: -c, optional --model, -p <query>
      const args: string[] = ["-c"];

      if (params.model) {
        args.push("--model", params.model);
      }

      args.push("-p", query);

      // Create streaming context if streaming is enabled
      let onChunk: ((chunk: string) => void) | undefined;
      if (params.stream) {
        const progressToken = extra?._meta?.progressToken;
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

      // Create the execution function
      const executionFn = async (): Promise<CommandCodeResult> => {
        return executeCommandCode({
          args,
          cwd: workingDir,
          timeoutSeconds,
          stream: params.stream,
          onChunk,
        });
      };

      // Execute via queue or immediately based on queue parameter
      let result: CommandCodeResult;
      try {
        if (params.queue) {
          const queued = await queue.enqueue(executionFn);
          result = queued.result;
        } else {
          result = await queue.executeImmediate(executionFn);
        }
      } catch (error: unknown) {
        // Queue overflow or other queue errors
        const message =
          error instanceof Error ? error.message : String(error);
        return formatError(message);
      }

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
