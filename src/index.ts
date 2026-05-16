#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { spawn } from "child_process";
import { existsSync } from "fs";
import { join, resolve, isAbsolute } from "path";

const IS_WINDOWS = process.platform === "win32";

// ── Security: max lengths ──────────────────────────────────────────
const MAX_QUERY_LENGTH = 100_000;
const MAX_PATH_LENGTH = 4_096;
const MAX_SESSION_NAME_LENGTH = 512;

/** Reject strings containing path traversal sequences */
function hasPathTraversal(s: string): boolean {
  return s.includes("..") || s.includes("\0");
}

/** Reject strings containing shell metacharacters when they'd be dangerous */
function hasShellMetachar(s: string, isWindows: boolean): boolean {
  if (isWindows) {
    // On Windows we pass through cmd /c — block unquoted special chars
    return /[&|<>^%!]/.test(s);
  }
  // On Unix we pass args directly to spawn (no shell), so less strict
  return false; // spawn without shell: true handles escaping safely
}

function validatePathParam(value: unknown, paramName: string): string {
  if (typeof value !== "string") {
    throw new McpError(
      ErrorCode.InvalidParams,
      `${paramName} must be a string`
    );
  }
  if (value.length > MAX_PATH_LENGTH) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `${paramName} exceeds maximum length of ${MAX_PATH_LENGTH} characters`
    );
  }
  if (hasPathTraversal(value)) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `${paramName} contains invalid path traversal sequences`
    );
  }
  return value;
}

function validateQueryParam(value: unknown): string {
  if (typeof value !== "string") {
    throw new McpError(
      ErrorCode.InvalidParams,
      "query must be a string"
    );
  }
  if (value.length === 0) {
    throw new McpError(
      ErrorCode.InvalidParams,
      "query must not be empty"
    );
  }
  if (value.length > MAX_QUERY_LENGTH) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `query exceeds maximum length of ${MAX_QUERY_LENGTH} characters`
    );
  }
  return value;
}

function validateSessionName(value: unknown): string {
  if (typeof value !== "string") {
    throw new McpError(
      ErrorCode.InvalidParams,
      "session_name must be a string"
    );
  }
  if (value.length > MAX_SESSION_NAME_LENGTH) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `session_name exceeds maximum length of ${MAX_SESSION_NAME_LENGTH} characters`
    );
  }
  if (hasPathTraversal(value)) {
    throw new McpError(
      ErrorCode.InvalidParams,
      "session_name contains invalid characters"
    );
  }
  if (hasShellMetachar(value, IS_WINDOWS)) {
    throw new McpError(
      ErrorCode.InvalidParams,
      "session_name contains invalid shell characters"
    );
  }
  return value;
}

function validateSourceParam(value: unknown): string {
  if (typeof value !== "string") {
    throw new McpError(
      ErrorCode.InvalidParams,
      "source must be a string"
    );
  }
  if (value.length === 0) {
    throw new McpError(
      ErrorCode.InvalidParams,
      "source must not be empty"
    );
  }
  if (value.length > MAX_PATH_LENGTH) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `source exceeds maximum length`
    );
  }
  if (hasPathTraversal(value)) {
    throw new McpError(
      ErrorCode.InvalidParams,
      "source contains invalid path traversal sequences"
    );
  }
  return value;
}

function validateOptionalString(value: unknown, maxLen: number): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") return undefined;
  if (value.length > maxLen) return undefined;
  return value;
}

// ── CMC path resolution ────────────────────────────────────────────

/** Resolved once at startup — cached for all tool calls */
let cachedCmcPath: { command: string; args: string[] } | null = null;

function resolveCmcPath(): { command: string; args: string[] } {
  if (cachedCmcPath) return cachedCmcPath;

  const userCmcPath = process.env.CMC_PATH;
  if (userCmcPath) {
    cachedCmcPath = { command: userCmcPath, args: [] };
    return cachedCmcPath;
  }

  // Check for global npm install of command-code
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
    cachedCmcPath = { command: "node", args: [cmcScript] };
    return cachedCmcPath;
  }

  // Fallback: use cmc via cmd on Windows, direct on Unix
  cachedCmcPath = IS_WINDOWS
    ? { command: "cmd", args: ["/c", "cmc"] }
    : { command: "cmc", args: [] };
  return cachedCmcPath;
}

/** Check if cmc is reachable at startup — log warning if not */
async function checkCmcAvailable(): Promise<boolean> {
  const { command, args: prefixArgs } = resolveCmcPath();
  return new Promise((resolve) => {
    try {
      const child = spawn(command, [...prefixArgs, "--version"], {
        stdio: "pipe",
        shell: IS_WINDOWS ? true : false,
        timeout: 10_000,
      });
      child.on("close", (code) => resolve(code === 0));
      child.on("error", () => resolve(false));
    } catch {
      resolve(false);
    }
  });
}

// ── runCmc ─────────────────────────────────────────────────────────

interface CmcResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

/**
 * Concurrency lock for cmc_continue.
 * Only one cmc_continue (or cmc_resume that starts a new session inline)
 * can run at a time to avoid corrupting "last session" state.
 */
let continueLock = Promise.resolve();

function runCmc(runArgs: string[], cwd?: string): Promise<CmcResult> {
  return new Promise((resolve, reject) => {
    const { command, args: prefixArgs } = resolveCmcPath();
    const allArgs = [...prefixArgs, ...runArgs];

    // Validate cwd exists before spawning
    let effectiveCwd = cwd || process.cwd();
    if (cwd && !existsSync(cwd)) {
      // If the directory doesn't exist, fall back to cwd but note in output
      effectiveCwd = process.cwd();
    }

    const child = spawn(command, allArgs, {
      cwd: effectiveCwd,
      env: { ...process.env },
      timeout: 120_000, // 2 minutes
      stdio: ["pipe", "pipe", "pipe"],
      // On Windows we need shell:true for cmd /c; on Unix we don't
      shell: IS_WINDOWS ? true : false,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      resolve({ stdout, stderr, code });
    });

    child.on("error", (err) => {
      reject(err);
    });
  });
}

// ── Server implementation ──────────────────────────────────────────

class CmcMcpServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: "commandcode-mcp",
        version: "2.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();

    this.server.onerror = (error) => console.error("[CommandCode MCP Error]", error);
    process.on("SIGINT", async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        //
        // --- Query & Conversation ---
        //
        {
          name: "cmc_query",
          description:
            "Run a non-interactive Command Code (cmc) query against a codebase. " +
            "Wraps 'cmc -p' for one-shot answers. Use this to ask questions about code, " +
            "get explanations, analyze architecture, or generate code suggestions. " +
            "Command Code is a coding agent that continuously learns your coding style.",
          inputSchema: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "The question or task to send to Command Code",
              },
              working_dir: {
                type: "string",
                description:
                  "Optional absolute path to the working directory. Defaults to the current project root.",
              },
              plan_mode: {
                type: "boolean",
                description:
                  "Start Command Code in plan mode (--plan). Defaults to false.",
              },
              add_dir: {
                type: "string",
                description:
                  "Optional additional directory to add to workspace context (--add-dir).",
              },
              skip_onboarding: {
                type: "boolean",
                description:
                  "Skip taste onboarding for automated runs (--skip-onboarding). Defaults to false.",
              },
            },
            required: ["query"],
          },
        },
        {
          name: "cmc_continue",
          description:
            "Continue the last Command Code conversation. Wraps 'cmc -c -p <query>' " +
            "to pick up where the previous session left off and answer a new query.",
          inputSchema: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "The question or task to continue the last conversation with",
              },
              working_dir: {
                type: "string",
                description:
                  "Optional absolute path to the working directory.",
              },
            },
            required: ["query"],
          },
        },
        {
          name: "cmc_resume",
          description:
            "Resume a previous Command Code conversation by name, or pick from history. " +
            "Wraps 'cmc --resume' for interactive continuation.",
          inputSchema: {
            type: "object",
            properties: {
              session_name: {
                type: "string",
                description:
                  "Name of the session to resume. Use quotes for multi-word names. Leave empty to pick from history.",
              },
            },
          },
        },

        //
        // --- System Info & Auth ---
        //
        {
          name: "cmc_info",
          description:
            "Display Command Code system information (version, environment, configuration). " +
            "Wraps 'cmc info'.",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
        {
          name: "cmc_status",
          description:
            "Show Command Code authentication status. Wraps 'cmc status'.",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
        {
          name: "cmc_whoami",
          description:
            "Show the currently logged-in Command Code user. Wraps 'cmc whoami'.",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },

        //
        // --- Maintenance ---
        //
        {
          name: "cmc_feedback",
          description:
            "Share feedback or report bugs about Command Code. Wraps 'cmc feedback [title]'.",
          inputSchema: {
            type: "object",
            properties: {
              title: {
                type: "string",
                description:
                  "Optional title for the feedback / bug report.",
              },
            },
          },
        },

        //
        // --- Taste & Skills ---
        //
        {
          name: "cmc_taste_learn",
          description:
            "Have Command Code learn coding taste from a repository (local path or GitHub owner/repo). " +
            "This improves the quality of code suggestions. Wraps 'cmc taste learn <source>'.",
          inputSchema: {
            type: "object",
            properties: {
              source: {
                type: "string",
                description:
                  "A local directory path (e.g. '.') or a GitHub repo (e.g. 'owner/repo') to learn taste from",
              },
            },
            required: ["source"],
          },
        },
        {
          name: "cmc_taste",
          description:
            "Manage Command Code taste learning packages. Wraps 'cmc taste' to list/manage taste sources.",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
        {
          name: "cmc_skills",
          description:
            "Manage skills from GitHub repositories. Wraps 'cmc skills'. " +
            "Skills are reusable agent behaviors that extend Command Code's capabilities.",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },

        //
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      switch (name) {
        //
        // cmc_query: -p with optional --plan, --add-dir, --skip-onboarding
        //
        case "cmc_query": {
          const query = validateQueryParam((args as any)?.query);
          const workingDir = validateOptionalString((args as any)?.working_dir, MAX_PATH_LENGTH);
          const planMode = !!(args as any)?.plan_mode;
          const addDir = validateOptionalString((args as any)?.add_dir, MAX_PATH_LENGTH);
          const skipOnboarding = !!(args as any)?.skip_onboarding;

          // Validate working_dir is absolute if provided
          if (workingDir && !isAbsolute(workingDir)) {
            throw new McpError(
              ErrorCode.InvalidParams,
              "working_dir must be an absolute path"
            );
          }

          const queryArgs: string[] = [];
          if (planMode) queryArgs.push("--plan");
          if (addDir) {
            queryArgs.push("--add-dir", addDir);
          }
          if (skipOnboarding) queryArgs.push("--skip-onboarding");
          queryArgs.push("-p", query);

          try {
            const result = await runCmc(queryArgs, workingDir);
            const output =
              result.stdout.trim() || result.stderr.trim() || "(no output)";

            return {
              content: [
                {
                  type: "text",
                  text: result.code === 0
                    ? output
                    : `Command Code exited with code ${result.code}\n\n${output}`,
                },
              ],
            };
          } catch (err: any) {
            return {
              content: [
                {
                  type: "text",
                  text: `Failed to run cmc: ${err.message}`,
                },
              ],
              isError: true,
            };
          }
        }

        //
        // cmc_continue: -c -p <query>  (serialized via lock)
        //
        case "cmc_continue": {
          const query = validateQueryParam((args as any)?.query);
          const workingDir = validateOptionalString((args as any)?.working_dir, MAX_PATH_LENGTH);

          if (workingDir && !isAbsolute(workingDir)) {
            throw new McpError(
              ErrorCode.InvalidParams,
              "working_dir must be an absolute path"
            );
          }

          // Serialize to avoid corrupting "last session" state
          const result = await new Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>((resolveCb) => {
            continueLock = continueLock.then(async () => {
              try {
                const res = await runCmc(["-c", "-p", query], workingDir);
                const output =
                  res.stdout.trim() || res.stderr.trim() || "(no output)";
                resolveCb({
                  content: [
                    {
                      type: "text",
                      text: res.code === 0
                        ? output
                        : `Command Code exited with code ${res.code}\n\n${output}`,
                    },
                  ],
                });
              } catch (err: any) {
                resolveCb({
                  content: [
                    {
                      type: "text",
                      text: `Failed to run cmc continue: ${err.message}`,
                    },
                  ],
                  isError: true,
                });
              }
            });
          });
          return result;
        }

        //
        // cmc_resume: --resume [name]
        //
        case "cmc_resume": {
          const sessionName = (args as any)?.session_name;
          if (sessionName !== undefined) {
            validateSessionName(sessionName);
          }
          const resumeArgs = sessionName
            ? ["--resume", sessionName]
            : ["--resume"];

          try {
            const result = await runCmc(resumeArgs);
            return {
              content: [
                {
                  type: "text",
                  text:
                    result.stdout.trim() ||
                    result.stderr.trim() ||
                    "Session resumed.",
                },
              ],
            };
          } catch (err: any) {
            return {
              content: [
                {
                  type: "text",
                  text: `Failed to resume cmc session: ${err.message}`,
                },
              ],
              isError: true,
            };
          }
        }

        //
        // cmc_info: info
        //
        case "cmc_info": {
          try {
            const result = await runCmc(["info"]);
            return {
              content: [
                {
                  type: "text",
                  text:
                    result.stdout.trim() || result.stderr.trim() || "(no output)",
                },
              ],
            };
          } catch (err: any) {
            return {
              content: [
                {
                  type: "text",
                  text: `Failed to run cmc info: ${err.message}`,
                },
              ],
              isError: true,
            };
          }
        }

        //
        // cmc_status: status
        //
        case "cmc_status": {
          try {
            const result = await runCmc(["status"]);
            return {
              content: [
                {
                  type: "text",
                  text:
                    result.stdout.trim() || result.stderr.trim() || "(no output)",
                },
              ],
            };
          } catch (err: any) {
            return {
              content: [
                {
                  type: "text",
                  text: `Failed to run cmc status: ${err.message}`,
                },
              ],
              isError: true,
            };
          }
        }

        //
        // cmc_whoami: whoami
        //
        case "cmc_whoami": {
          try {
            const result = await runCmc(["whoami"]);
            return {
              content: [
                {
                  type: "text",
                  text:
                    result.stdout.trim() || result.stderr.trim() || "(no output)",
                },
              ],
            };
          } catch (err: any) {
            return {
              content: [
                {
                  type: "text",
                  text: `Failed to run cmc whoami: ${err.message}`,
                },
              ],
              isError: true,
            };
          }
        }

        //
        // cmc_feedback: feedback [title]
        //
        case "cmc_feedback": {
          const title = (args as any)?.title;
          if (title !== undefined && typeof title !== "string") {
            // Silently ignore non-string titles
          }
          const feedbackArgs = title && typeof title === "string"
            ? ["feedback", title]
            : ["feedback"];

          try {
            const result = await runCmc(feedbackArgs);
            return {
              content: [
                {
                  type: "text",
                  text:
                    result.stdout.trim() ||
                    result.stderr.trim() ||
                    "Feedback submitted.",
                },
              ],
            };
          } catch (err: any) {
            return {
              content: [
                {
                  type: "text",
                  text: `Failed to run cmc feedback: ${err.message}`,
                },
              ],
              isError: true,
            };
          }
        }

        //
        // cmc_taste_learn: taste learn <source>
        //
        case "cmc_taste_learn": {
          const source = validateSourceParam((args as any)?.source);

          try {
            const result = await runCmc(["taste", "learn", source]);
            return {
              content: [
                {
                  type: "text",
                  text:
                    result.stdout.trim() ||
                    result.stderr.trim() ||
                    "Taste learning completed.",
                },
              ],
            };
          } catch (err: any) {
            return {
              content: [
                {
                  type: "text",
                  text: `Failed to run cmc taste learn: ${err.message}`,
                },
              ],
              isError: true,
            };
          }
        }

        //
        // cmc_taste: taste (list/manage)
        //
        case "cmc_taste": {
          try {
            const result = await runCmc(["taste"]);
            return {
              content: [
                {
                  type: "text",
                  text:
                    result.stdout.trim() || result.stderr.trim() || "(no output)",
                },
              ],
            };
          } catch (err: any) {
            return {
              content: [
                {
                  type: "text",
                  text: `Failed to run cmc taste: ${err.message}`,
                },
              ],
              isError: true,
            };
          }
        }

        //
        // cmc_skills: skills
        //
        case "cmc_skills": {
          try {
            const result = await runCmc(["skills"]);
            return {
              content: [
                {
                  type: "text",
                  text:
                    result.stdout.trim() || result.stderr.trim() || "(no output)",
                },
              ],
            };
          } catch (err: any) {
            return {
              content: [
                {
                  type: "text",
                  text: `Failed to run cmc skills: ${err.message}`,
                },
              ],
              isError: true,
            };
          }
        }

        //
        default:
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown tool: ${name}`
          );
      }
    });
  }

  async run() {
    // Check cmc availability at startup (non-blocking warning)
    checkCmcAvailable().then((available) => {
      if (!available) {
        console.error(
          "[CommandCode MCP] WARNING: 'cmc' command not found. " +
          "Install it with: npm install -g command-code, or set CMC_PATH env var."
        );
      }
    });

    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("CommandCode MCP server v2.0.0 running on stdio");
  }
}

const server = new CmcMcpServer();
server.run().catch(console.error);