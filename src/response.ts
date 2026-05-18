/**
 * Response formatting module for the CommandCode MCP Server.
 *
 * Handles formatting of CLI execution results into structured MCP tool responses.
 *
 * Validates: Requirements 2.3, 2.4, 11.1, 11.2, 11.3, 11.4, 11.5, 8.1, 8.2, 8.3, 8.4
 */

import type { CommandCodeResult, ToolResponse } from "./types.js";
import { MAX_PARTIAL_OUTPUT_CHARS } from "./constants.js";

/**
 * Format a successful CLI execution result (exit code 0) into a ToolResponse.
 *
 * Priority: stdout → stderr → "(no output)" fallback.
 * If both stdout and stderr are non-empty, concatenates with "STDERR:" prefix.
 * Never sets isError.
 *
 * Validates: Requirements 2.3, 11.1, 11.5
 */
export function formatSuccess(result: CommandCodeResult): ToolResponse {
  const stdout = result.stdout.trim();
  const stderr = result.stderr.trim();

  let text: string;

  if (stdout && stderr) {
    text = stdout + "\nSTDERR: " + stderr;
  } else if (stdout) {
    text = stdout;
  } else if (stderr) {
    text = stderr;
  } else {
    text = "(no output)";
  }

  return {
    content: [{ type: "text", text }],
  };
}

/**
 * Format an error message into a ToolResponse with isError: true.
 *
 * The message should be pre-formatted by the caller. For CLI errors with exit code,
 * the message should follow the format:
 *   "Command Code exited with code N\n\n<output>\nSTDERR: <stderr>"
 *
 * Validates: Requirements 2.4, 11.2, 11.3, 11.4
 */
export function formatError(message: string): ToolResponse {
  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}

/**
 * Format a timeout result into a ToolResponse with isError: true.
 *
 * Includes elapsed time and partial output (up to MAX_PARTIAL_OUTPUT_CHARS).
 *
 * Validates: Requirements 11.3, 10.3
 */
export function formatTimeout(
  result: CommandCodeResult,
  elapsedSeconds: number
): ToolResponse {
  const partialOutput = result.stdout.slice(0, MAX_PARTIAL_OUTPUT_CHARS);
  const text = `Command Code timed out after ${elapsedSeconds}s\n\nPartial output:\n${partialOutput}`;

  return {
    content: [{ type: "text", text }],
    isError: true,
  };
}

/**
 * Format combined info and status results into a single ToolResponse.
 *
 * Always includes "=== Info ===" and "=== Status ===" headers.
 * If one result has exit code 0 and the other non-zero, still includes both.
 * If both results have non-zero exit codes, sets isError: true.
 *
 * Validates: Requirements 8.1, 8.2, 8.3, 8.4
 */
export function formatCombinedInfo(
  infoResult: CommandCodeResult,
  statusResult: CommandCodeResult
): ToolResponse {
  const infoOutput = formatSectionOutput(infoResult);
  const statusOutput = formatSectionOutput(statusResult);

  const text = `=== Info ===\n${infoOutput}\n\n=== Status ===\n${statusOutput}`;

  const bothFailed =
    infoResult.code !== null &&
    infoResult.code !== 0 &&
    statusResult.code !== null &&
    statusResult.code !== 0;

  const response: ToolResponse = {
    content: [{ type: "text", text }],
  };

  if (bothFailed) {
    response.isError = true;
  }

  return response;
}

/**
 * Format the output for a single section in the combined info response.
 * If the result has a non-zero exit code, prefixes with error info.
 */
function formatSectionOutput(result: CommandCodeResult): string {
  const stdout = result.stdout.trim();
  const stderr = result.stderr.trim();

  if (result.code !== null && result.code !== 0) {
    // Error case: include exit code and any output
    let output = `Command Code exited with code ${result.code}`;
    if (stdout) {
      output += "\n" + stdout;
    }
    if (stderr) {
      output += "\nSTDERR: " + stderr;
    }
    return output;
  }

  // Success case: use stdout, stderr fallback, or "(no output)"
  if (stdout && stderr) {
    return stdout + "\nSTDERR: " + stderr;
  } else if (stdout) {
    return stdout;
  } else if (stderr) {
    return stderr;
  }
  return "(no output)";
}
