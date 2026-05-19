/**
 * CommandCode CLI binary path resolution and availability check.
 *
 * Resolution order:
 * 1. COMMANDCODE_PATH environment variable (if set, use it directly)
 * 2. Global npm install path (Windows APPDATA)
 * 3. Fallback: `commandcode` (via PATH)
 *
 * Validates: Requirements 1.3, 1.4, 1.7, 13.1, 13.2, 13.5
 */

import { spawn } from "child_process";
import { existsSync } from "fs";
import { join } from "path";
import { IS_WINDOWS, STARTUP_CHECK_TIMEOUT_MS } from "./constants.js";

export interface ResolvedCommand {
  command: string;
  args: string[];
}

/** Cached resolved path — computed once, reused for all subsequent calls */
let cachedResolvedPath: ResolvedCommand | null = null;

/**
 * Resolve the CommandCode CLI binary path.
 *
 * Checks in order:
 * 1. COMMANDCODE_PATH env var
 * 2. Global npm install path (Windows APPDATA/npm/node_modules/command-code/dist/index.mjs)
 * 3. Fallback: commandcode (via PATH)
 *
 * The result is cached for reuse across all tool invocations.
 */
export function resolveCommandCodePath(): ResolvedCommand {
  if (cachedResolvedPath) return cachedResolvedPath;

  // 1. Check COMMANDCODE_PATH environment variable
  const userPath = process.env.COMMANDCODE_PATH;
  if (userPath) {
    cachedResolvedPath = { command: userPath, args: [] };
    return cachedResolvedPath;
  }

  // 2. Check global npm install path (Windows APPDATA)
  const npmPrefix = process.env.APPDATA
    ? join(process.env.APPDATA, "npm")
    : "";
  const cmcScript = join(
    npmPrefix,
    "node_modules",
    "command-code",
    "dist",
    "index.mjs"
  );

  if (npmPrefix && existsSync(cmcScript)) {
    cachedResolvedPath = { command: "node", args: [cmcScript] };
    return cachedResolvedPath;
  }

  // 3. Fallback: commandcode via PATH
  cachedResolvedPath = { command: "commandcode", args: [] };
  return cachedResolvedPath;
}

/**
 * Check if the CommandCode CLI is reachable by spawning `--version`.
 *
 * Applies STARTUP_CHECK_TIMEOUT_MS (10s) timeout.
 * Returns true if the process exits with code 0, false otherwise.
 *
 * This is used at startup for a non-blocking health check (Requirement 13.1, 13.5).
 */
export async function checkCommandCodeAvailable(): Promise<boolean> {
  const { command, args: prefixArgs } = resolveCommandCodePath();

  return new Promise<boolean>((resolve) => {
    try {
      const child = spawn(command, [...prefixArgs, "--version"], {
        stdio: "pipe",
        shell: IS_WINDOWS,
        timeout: STARTUP_CHECK_TIMEOUT_MS,
      });

      child.on("close", (code) => resolve(code === 0));
      child.on("error", () => resolve(false));
    } catch {
      resolve(false);
    }
  });
}

/**
 * Clear the cached resolved path. Useful for testing.
 */
export function clearResolvedPathCache(): void {
  cachedResolvedPath = null;
}
