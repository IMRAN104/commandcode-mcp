/**
 * commandcode_query tool — one-shot codebase query via CommandCode CLI.
 *
 * Supports plan mode, context directories, model selection, and streaming.
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 12.2, 12.3, 16.1
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  validateQuery,
  validateWorkingDir,
  validateContextDirs,
  validateTimeoutSeconds,
} from "../validation.js";
import { executeCommandCode } from "../executor.js";
import { formatSuccess, formatError, formatTimeout } from "../response.js";
import { createStreamingContext } from "../streaming.js";

const TOOL_DESCRIPTION = `Send a one-shot query to CommandCode for codebase analysis, architecture explanations, code generation suggestions, or multi-file connection tracing.

Wraps: commandcode --skip-onboarding [--model M] [--plan] [--add-dir ...] -p <query>

Example use case: Ask "explain the authentication flow in this project" with working_dir pointing to your repo root, and optionally enable plan_mode to get a structured implementation plan instead of direct code changes.`;

/**
 * Register the commandcode_query tool on the given MCP server.
 *
 * @param server - The McpServer instance to register the tool on
 */
export function registerQueryTool(server: McpServer): void {
  server.tool(
    "commandcode_query",
    TOOL_DESCRIPTION,
    {
      query: z.string().min(1).max(100_000),
      working_dir: z.string().optional(),
      plan_mode: z.boolean().optional().default(false),
      context_dirs: z.array(z.string()).max(10).optional(),
      model: z.string().max(100).optional(),
      stream: z.boolean().optional().default(false),
      timeout_seconds: z.number().int().min(1).max(900).optional(),
    },
    async (params, extra) => {
      // Validate inputs
      const query = validateQuery(params.query);
      const workingDir = validateWorkingDir(params.working_dir);
      const contextDirs = validateContextDirs(params.context_dirs);
      const timeoutSeconds = validateTimeoutSeconds(params.timeout_seconds);

      // Build args: optional --model, optional --plan, optional --add-dir for each dir, then -p <query>
      const args: string[] = [];

      if (params.model) {
        args.push("--model", params.model);
      }

      if (params.plan_mode) {
        args.push("--plan");
      }

      if (contextDirs) {
        for (const dir of contextDirs) {
          args.push("--add-dir", dir);
        }
      }

      args.push("-p", query);

      // Create streaming context if streaming is enabled
      let onChunk: ((chunk: string) => void) | undefined;
      if (params.stream) {
        const progressToken = (extra as any)?._meta?.progressToken as string | number | undefined;
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

      // Execute via executor
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
