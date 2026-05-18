/**
 * CLI spawning, timeout management, and process lifecycle for CommandCode executions.
 *
 * Validates: Requirements 1.1, 1.2, 3.7, 3.8, 3.9, 10.1, 10.3, 15.4, 16.1, 16.2
 */

import { spawn, ChildProcess } from "child_process";
import { ExecutionOptions, CommandCodeResult } from "./types.js";
import { resolveCommandCodePath } from "./resolver.js";
import { executeMock } from "./mock.js";
import {
  IS_WINDOWS,
  MAX_PARTIAL_OUTPUT_CHARS,
  STREAM_CHUNK_INTERVAL_MS,
} from "./constants.js";

/**
 * Execute the CommandCode CLI with the given options.
 *
 * - Checks COMMANDCODE_MOCK env var and delegates to mock executor if set.
 * - Resolves the CLI binary path via the resolver module.
 * - Spawns the process with shell: true on Windows, shell: false on Unix.
 * - Always includes `--skip-onboarding` in the args.
 * - Applies timeout via AbortController + setTimeout.
 * - On timeout: SIGTERM → wait 2s → SIGKILL → collect partial output (up to 10,000 chars).
 * - If options.stream is true and options.onChunk is provided, calls onChunk with
 *   each stdout data event debounced to 500ms intervals.
 * - Passes `--model` through to CLI unchanged when present in args.
 * - Returns CommandCodeResult with timedOut flag and elapsedMs.
 */
export async function executeCommandCode(
  options: ExecutionOptions
): Promise<CommandCodeResult> {
  // Check mock mode
  if (process.env.COMMANDCODE_MOCK === "true") {
    const mockResponse = executeMock("commandcode", options.args as unknown as Record<string, unknown>);
    const text = mockResponse.content[0]?.text ?? "";
    return {
      stdout: text,
      stderr: "",
      code: 0,
      timedOut: false,
      elapsedMs: 0,
    };
  }

  const { command, args: prefixArgs } = resolveCommandCodePath();

  // Build final args: prefix args + --skip-onboarding + user args
  const finalArgs = [...prefixArgs, "--skip-onboarding", ...options.args];

  const timeoutMs = options.timeoutSeconds * 1000;
  const startTime = Date.now();

  return new Promise<CommandCodeResult>((resolve) => {
    let child: ChildProcess;
    let stdoutBuf = "";
    let stderrBuf = "";
    let timedOut = false;
    let killTimer: ReturnType<typeof setTimeout> | null = null;
    let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
    let settled = false;

    // Streaming state
    let lastChunkTime = 0;
    let pendingChunk = "";
    let chunkTimer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (timeoutTimer) {
        clearTimeout(timeoutTimer);
        timeoutTimer = null;
      }
      if (killTimer) {
        clearTimeout(killTimer);
        killTimer = null;
      }
      if (chunkTimer) {
        clearTimeout(chunkTimer);
        chunkTimer = null;
      }
    };

    const settle = (result: CommandCodeResult) => {
      if (settled) return;
      settled = true;
      cleanup();

      // Flush any pending streaming chunk
      if (pendingChunk && options.stream && options.onChunk) {
        options.onChunk(pendingChunk);
        pendingChunk = "";
      }

      resolve(result);
    };

    try {
      child = spawn(command, finalArgs, {
        cwd: options.cwd,
        stdio: "pipe",
        shell: IS_WINDOWS,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      settle({
        stdout: "",
        stderr: `Failed to spawn CommandCode CLI: ${message}`,
        code: null,
        timedOut: false,
        elapsedMs: Date.now() - startTime,
      });
      return;
    }

    // Collect stdout
    child.stdout?.on("data", (data: Buffer) => {
      const chunk = data.toString();
      if (timedOut) {
        // On timeout, only collect up to MAX_PARTIAL_OUTPUT_CHARS
        if (stdoutBuf.length < MAX_PARTIAL_OUTPUT_CHARS) {
          stdoutBuf += chunk;
          if (stdoutBuf.length > MAX_PARTIAL_OUTPUT_CHARS) {
            stdoutBuf = stdoutBuf.slice(0, MAX_PARTIAL_OUTPUT_CHARS);
          }
        }
      } else {
        stdoutBuf += chunk;
      }

      // Streaming: debounce onChunk calls to max one per STREAM_CHUNK_INTERVAL_MS
      if (options.stream && options.onChunk) {
        pendingChunk += chunk;
        const now = Date.now();
        const elapsed = now - lastChunkTime;

        if (elapsed >= STREAM_CHUNK_INTERVAL_MS) {
          // Enough time has passed, emit immediately
          lastChunkTime = now;
          options.onChunk(pendingChunk);
          pendingChunk = "";
          if (chunkTimer) {
            clearTimeout(chunkTimer);
            chunkTimer = null;
          }
        } else if (!chunkTimer) {
          // Schedule a deferred emit
          const delay = STREAM_CHUNK_INTERVAL_MS - elapsed;
          chunkTimer = setTimeout(() => {
            chunkTimer = null;
            if (pendingChunk && options.onChunk) {
              lastChunkTime = Date.now();
              options.onChunk(pendingChunk);
              pendingChunk = "";
            }
          }, delay);
        }
      }
    });

    // Collect stderr
    child.stderr?.on("data", (data: Buffer) => {
      const chunk = data.toString();
      if (timedOut) {
        if (stderrBuf.length < MAX_PARTIAL_OUTPUT_CHARS) {
          stderrBuf += chunk;
          if (stderrBuf.length > MAX_PARTIAL_OUTPUT_CHARS) {
            stderrBuf = stderrBuf.slice(0, MAX_PARTIAL_OUTPUT_CHARS);
          }
        }
      } else {
        stderrBuf += chunk;
      }
    });

    // Handle process close
    child.on("close", (code) => {
      settle({
        stdout: timedOut
          ? stdoutBuf.slice(0, MAX_PARTIAL_OUTPUT_CHARS)
          : stdoutBuf,
        stderr: timedOut
          ? stderrBuf.slice(0, MAX_PARTIAL_OUTPUT_CHARS)
          : stderrBuf,
        code: code,
        timedOut,
        elapsedMs: Date.now() - startTime,
      });
    });

    // Handle spawn errors
    child.on("error", (err) => {
      settle({
        stdout: stdoutBuf,
        stderr: `Failed to spawn CommandCode CLI: ${err.message}`,
        code: null,
        timedOut: false,
        elapsedMs: Date.now() - startTime,
      });
    });

    // Set up timeout
    timeoutTimer = setTimeout(() => {
      timedOut = true;

      // Step 1: Send SIGTERM
      try {
        child.kill("SIGTERM");
      } catch {
        // Process may have already exited
      }

      // Step 2: Wait 2s, then SIGKILL if still running
      killTimer = setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {
          // Process may have already exited
        }
      }, 2000);
    }, timeoutMs);
  });
}
