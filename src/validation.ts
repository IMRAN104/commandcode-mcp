/**
 * Input validation functions for the CommandCode MCP Server.
 * All functions are pure (no side effects) and throw McpError with
 * ErrorCode.InvalidParams on validation failure.
 *
 * Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 10.2, 10.4, 10.5
 */

import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import {
  MAX_QUERY_LENGTH,
  MAX_PATH_LENGTH,
  MAX_SESSION_NAME_LENGTH,
  MAX_CONTEXT_DIRS,
  DEFAULT_TIMEOUT_SECONDS,
  MAX_TIMEOUT_SECONDS,
  IS_WINDOWS,
} from "./constants.js";

/**
 * Checks if a string contains path traversal sequences (..) or null bytes.
 */
export function hasPathTraversal(s: string): boolean {
  if (s.includes("\x00")) {
    return true;
  }
  // Check for ".." as a path segment (preceded/followed by separator or at start/end)
  const segments = s.split(/[/\\]/);
  return segments.includes("..");
}

/**
 * Checks if a string contains Windows shell metacharacters.
 * Characters checked: & | < > ^ % !
 */
export function hasShellMetachar(s: string): boolean {
  return /[&|<>^%!]/.test(s);
}

/**
 * Validates a query string parameter.
 * Must be between 1 and 100,000 characters (inclusive).
 *
 * @throws McpError with ErrorCode.InvalidParams if validation fails
 */
export function validateQuery(value: string): string {
  if (!value || value.length < 1) {
    throw new McpError(
      ErrorCode.InvalidParams,
      "query must be at least 1 character"
    );
  }
  if (value.length > MAX_QUERY_LENGTH) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `query must not exceed ${MAX_QUERY_LENGTH} characters`
    );
  }
  if (IS_WINDOWS && hasShellMetachar(value)) {
    throw new McpError(
      ErrorCode.InvalidParams,
      "query contains invalid shell metacharacters"
    );
  }
  return value;
}

/**
 * Validates a path parameter (working_dir, source, add_dir).
 * Must not exceed 4,096 characters and must not contain path traversal
 * sequences or null bytes.
 *
 * @param value - The path string to validate
 * @param paramName - The parameter name for error messages
 * @throws McpError with ErrorCode.InvalidParams if validation fails
 */
export function validatePath(value: string, paramName: string): string {
  if (!value || value.length < 1) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `${paramName} must not be empty`
    );
  }
  if (value.length > MAX_PATH_LENGTH) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `${paramName} must not exceed ${MAX_PATH_LENGTH} characters`
    );
  }
  if (hasPathTraversal(value)) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `${paramName} contains path traversal sequences`
    );
  }
  if (IS_WINDOWS && hasShellMetachar(value)) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `${paramName} contains invalid shell metacharacters`
    );
  }
  return value;
}

/**
 * Validates a session name parameter.
 * Must not exceed 512 characters and must not contain path traversal
 * sequences or null bytes.
 *
 * @throws McpError with ErrorCode.InvalidParams if validation fails
 */
export function validateSessionName(value: string): string {
  if (!value || value.length < 1) {
    throw new McpError(
      ErrorCode.InvalidParams,
      "session_name must not be empty"
    );
  }
  if (value.length > MAX_SESSION_NAME_LENGTH) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `session_name must not exceed ${MAX_SESSION_NAME_LENGTH} characters`
    );
  }
  if (hasPathTraversal(value)) {
    throw new McpError(
      ErrorCode.InvalidParams,
      "session_name contains path traversal sequences"
    );
  }
  if (IS_WINDOWS && hasShellMetachar(value)) {
    throw new McpError(
      ErrorCode.InvalidParams,
      "session_name contains invalid shell metacharacters"
    );
  }
  return value;
}

/**
 * Validates a working directory parameter.
 * Must be an absolute path (starts with / on Unix, or drive letter on Windows).
 * Returns undefined if the input is undefined.
 *
 * @throws McpError with ErrorCode.InvalidParams if validation fails
 */
export function validateWorkingDir(
  value: string | undefined
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  // First validate as a path (length, traversal, metachar)
  validatePath(value, "working_dir");

  // Check if path is absolute
  const isAbsolute = IS_WINDOWS
    ? /^[a-zA-Z]:[/\\]/.test(value) || value.startsWith("\\\\")
    : value.startsWith("/");

  if (!isAbsolute) {
    throw new McpError(
      ErrorCode.InvalidParams,
      "working_dir must be an absolute path"
    );
  }

  return value;
}

/**
 * Validates an array of context directory paths.
 * Array must contain at most 10 entries, each validated as a path.
 * Returns undefined if the input is undefined.
 *
 * @throws McpError with ErrorCode.InvalidParams if validation fails
 */
export function validateContextDirs(
  dirs: string[] | undefined
): string[] | undefined {
  if (dirs === undefined) {
    return undefined;
  }

  if (!Array.isArray(dirs)) {
    throw new McpError(
      ErrorCode.InvalidParams,
      "context_dirs must be an array"
    );
  }

  if (dirs.length > MAX_CONTEXT_DIRS) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `context_dirs must not contain more than ${MAX_CONTEXT_DIRS} entries`
    );
  }

  for (let i = 0; i < dirs.length; i++) {
    validatePath(dirs[i], `context_dirs[${i}]`);
  }

  return dirs;
}

/**
 * Validates and normalizes a timeout_seconds parameter.
 * - Values between 1 and 900 (inclusive integers) pass through unchanged
 * - Values greater than 900 are capped to 900
 * - Values less than 1, zero, negative, or non-integer throw InvalidParams
 * - Undefined returns the default of 300
 *
 * @throws McpError with ErrorCode.InvalidParams if value is invalid
 */
export function validateTimeoutSeconds(value: number | undefined): number {
  if (value === undefined) {
    return DEFAULT_TIMEOUT_SECONDS;
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new McpError(
      ErrorCode.InvalidParams,
      "timeout_seconds must be a positive integer between 1 and 900"
    );
  }

  if (!Number.isInteger(value)) {
    throw new McpError(
      ErrorCode.InvalidParams,
      "timeout_seconds must be a positive integer between 1 and 900"
    );
  }

  if (value < 1) {
    throw new McpError(
      ErrorCode.InvalidParams,
      "timeout_seconds must be a positive integer between 1 and 900"
    );
  }

  if (value > MAX_TIMEOUT_SECONDS) {
    return MAX_TIMEOUT_SECONDS;
  }

  return value;
}
