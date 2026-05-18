/**
 * Shared constants for the CommandCode MCP Server.
 *
 * Validates: Requirements 9.1, 9.2, 10.1, 10.2, 16.2
 */

/** Maximum allowed length for query parameters (Requirement 9.1) */
export const MAX_QUERY_LENGTH = 100_000;

/** Maximum allowed length for path parameters (Requirement 9.2) */
export const MAX_PATH_LENGTH = 4_096;

/** Maximum allowed length for session name parameters */
export const MAX_SESSION_NAME_LENGTH = 512;

/** Maximum number of context directories allowed (Requirement 9.2) */
export const MAX_CONTEXT_DIRS = 10;

/** Default timeout in seconds for CLI executions (Requirement 10.1) */
export const DEFAULT_TIMEOUT_SECONDS = 300;

/** Maximum allowed timeout in seconds (Requirement 10.2) */
export const MAX_TIMEOUT_SECONDS = 900;

/** Timeout in milliseconds for the startup CLI availability check */
export const STARTUP_CHECK_TIMEOUT_MS = 10_000;

/** Maximum characters of partial output to collect on timeout */
export const MAX_PARTIAL_OUTPUT_CHARS = 10_000;

/** Maximum number of pending items in the continue queue */
export const MAX_CONTINUE_QUEUE_SIZE = 10;

/** Minimum interval between streaming progress notifications (Requirement 16.2) */
export const STREAM_CHUNK_INTERVAL_MS = 500;

/** Whether the server is running on Windows */
export const IS_WINDOWS = process.platform === "win32";
