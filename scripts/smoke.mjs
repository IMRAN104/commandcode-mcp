#!/usr/bin/env node
/**
 * Cross-platform smoke test for the built MCP server.
 *
 * Spawns build/index.js, listens to its stderr for ~2.5 s, then asserts:
 *   1. The expected version banner was printed.
 *   2. No DEP0190 / DeprecationWarning appeared.
 *
 * Exits 0 on pass, 1 on fail. Used by .github/workflows/ci.yml.
 */

import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = resolve(__dirname, "..", "build", "index.js");

const CAPTURE_MS = 2500;
const BANNER_RE = /commandcode-mcp v\d+\.\d+\.\d+ running on stdio/;
const DEP0190_RE = /DEP0190/;
const ANY_DEPRECATION_RE = /\bDeprecationWarning\b/;

let stderr = "";

const child = spawn(process.execPath, [serverPath], {
  stdio: ["pipe", "pipe", "pipe"],
  // Force a fresh resolver lookup; COMMANDCODE_PATH leakage from the host
  // would skew which branch runs, but doesn't affect what we assert.
  env: { ...process.env, COMMANDCODE_MOCK: "true" },
});

child.stderr.setEncoding("utf8");
child.stderr.on("data", (chunk) => {
  stderr += chunk;
});
child.stdout.on("data", () => {
  /* drain — stdout is reserved for MCP JSON-RPC traffic */
});

let spawnError = null;
child.on("error", (err) => {
  spawnError = err;
});

await new Promise((r) => setTimeout(r, CAPTURE_MS));

const exited = child.exitCode !== null || child.signalCode !== null;
if (!exited) {
  // Stdio server is supposed to keep running. Signal it to exit so the
  // CI step doesn't hang on Windows where the inherited child can outlive
  // the parent under some shells.
  child.kill();
  await new Promise((r) => child.once("close", r));
}

console.error("--- captured stderr ---");
process.stderr.write(stderr);
console.error("--- end stderr ---\n");

const failures = [];
if (spawnError) {
  failures.push(`spawn failed: ${spawnError.message}`);
}
if (!BANNER_RE.test(stderr)) {
  failures.push("missing version banner (expected /commandcode-mcp v… running on stdio/)");
}
if (DEP0190_RE.test(stderr)) {
  failures.push("DEP0190 deprecation warning present");
}
if (ANY_DEPRECATION_RE.test(stderr)) {
  failures.push("unexpected DeprecationWarning present");
}

if (failures.length > 0) {
  console.error("SMOKE FAILED:");
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}

console.error("SMOKE OK");
process.exit(0);
