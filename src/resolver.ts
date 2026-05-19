/**
 * CommandCode CLI binary path resolution and availability check.
 *
 * Resolution order:
 * 1. COMMANDCODE_PATH environment variable (wrapped through cmd.exe on
 *    Windows when it points at a .cmd/.bat shim)
 * 2. Known global npm install locations (Windows %APPDATA%, common Unix
 *    prefixes, Homebrew, ~/.npm-global) — invoked as `node <index.mjs>`
 * 3. PATH walk (with PATHEXT on Windows) — derive sibling
 *    node_modules/command-code/dist/index.mjs when possible, otherwise
 *    wrap a .cmd/.bat shim through cmd.exe on Windows
 * 4. Last-resort literal `commandcode` (Unix-style PATH resolution)
 *
 * Why this matters: Node ≥ 21 (CVE-2024-27980) refuses to spawn .cmd/.bat
 * files with `shell: false`, and `shell: true` triggers DEP0190 when
 * combined with an args array. So we either invoke `node <script>` (cross
 * platform, shim-free) or call cmd.exe directly with the shim as an arg.
 *
 * Validates: Requirements 1.3, 1.4, 1.7, 13.1, 13.2, 13.5
 */

import { spawn } from "child_process";
import { existsSync } from "fs";
import { basename, delimiter, dirname, join } from "path";
import { IS_WINDOWS, STARTUP_CHECK_TIMEOUT_MS } from "./constants.js";

export interface ResolvedCommand {
  command: string;
  args: string[];
}

/** Cached resolved path — computed once, reused for all subsequent calls */
let cachedResolvedPath: ResolvedCommand | null = null;

/**
 * Walk PATH (and PATHEXT on Windows) to find the absolute location of
 * an executable. Mirrors `which` / `where` semantics so we never depend
 * on the OS to resolve names at spawn time.
 */
function findOnPath(name: string): string | null {
  const pathEnv = process.env.PATH ?? "";
  if (!pathEnv) return null;

  const exts = IS_WINDOWS
    ? (process.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";")
    : [""];

  for (const dir of pathEnv.split(delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      const candidate = join(dir, name + ext);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

/**
 * Map a global npm shim back to its sibling
 * `node_modules/command-code/dist/index.mjs`.
 *
 *   Windows: <prefix>\commandcode.cmd → <prefix>\node_modules\…\index.mjs
 *   Unix:    <prefix>/bin/commandcode → <prefix>/lib/node_modules/…/index.mjs
 */
function deriveScriptFromShim(shimPath: string): string | null {
  const dir = dirname(shimPath);

  const sideBySide = join(dir, "node_modules", "command-code", "dist", "index.mjs");
  if (existsSync(sideBySide)) return sideBySide;

  if (basename(dir) === "bin") {
    const prefix = dirname(dir);
    const unixLayout = join(prefix, "lib", "node_modules", "command-code", "dist", "index.mjs");
    if (existsSync(unixLayout)) return unixLayout;
  }
  return null;
}

/** Wrap a Windows .cmd/.bat shim so spawn(shell:false) can launch it. */
function wrapWithCmdExe(shimPath: string): ResolvedCommand {
  return {
    command: process.env.ComSpec ?? "cmd.exe",
    args: ["/d", "/s", "/c", shimPath],
  };
}

/**
 * Resolve the CommandCode CLI binary path.
 * Result is cached for reuse across all tool invocations.
 */
export function resolveCommandCodePath(): ResolvedCommand {
  if (cachedResolvedPath) return cachedResolvedPath;

  // 1. Explicit override via env var
  const userPath = process.env.COMMANDCODE_PATH;
  if (userPath) {
    cachedResolvedPath =
      IS_WINDOWS && /\.(cmd|bat)$/i.test(userPath)
        ? wrapWithCmdExe(userPath)
        : { command: userPath, args: [] };
    return cachedResolvedPath;
  }

  // 2. Probe known global npm install locations for the .mjs entry.
  //    `node <script>` works identically on every OS with shell:false.
  const candidates: string[] = [];
  if (IS_WINDOWS && process.env.APPDATA) {
    candidates.push(
      join(process.env.APPDATA, "npm", "node_modules", "command-code", "dist", "index.mjs")
    );
  }
  if (!IS_WINDOWS) {
    candidates.push("/usr/local/lib/node_modules/command-code/dist/index.mjs");
    candidates.push("/usr/lib/node_modules/command-code/dist/index.mjs");
    candidates.push("/opt/homebrew/lib/node_modules/command-code/dist/index.mjs");
    if (process.env.HOME) {
      candidates.push(
        join(process.env.HOME, ".npm-global", "lib", "node_modules", "command-code", "dist", "index.mjs")
      );
    }
  }
  for (const c of candidates) {
    if (existsSync(c)) {
      cachedResolvedPath = { command: "node", args: [c] };
      return cachedResolvedPath;
    }
  }

  // 3. PATH walk — prefer deriving the .mjs, otherwise wrap on Windows.
  const onPath = findOnPath("commandcode");
  if (onPath) {
    const derived = deriveScriptFromShim(onPath);
    if (derived) {
      cachedResolvedPath = { command: "node", args: [derived] };
      return cachedResolvedPath;
    }
    cachedResolvedPath = IS_WINDOWS
      ? wrapWithCmdExe(onPath)
      : { command: onPath, args: [] };
    return cachedResolvedPath;
  }

  // 4. Last-resort literal — Unix execvp will still resolve it via PATH.
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
        shell: false,
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
