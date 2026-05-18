/**
 * Progressive output delivery via MCP progress notifications.
 *
 * Validates: Requirements 16.1, 16.2, 16.3, 16.4, 16.5, 16.6
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { STREAM_CHUNK_INTERVAL_MS } from "./constants.js";

/**
 * A lightweight context for sending progressive output to the client
 * during long-running tool executions.
 */
export interface StreamingContext {
  /**
   * Send a progress notification with a chunk of text and progress percentage.
   * @param chunk - The new text chunk produced by the CLI
   * @param progress - Estimated progress percentage (0-100)
   */
  sendProgress(chunk: string, progress: number): void;
}

/**
 * Creates a StreamingContext that delivers progressive output via MCP
 * progress notifications.
 *
 * Key behaviors:
 * - Debounces notifications to max one per STREAM_CHUNK_INTERVAL_MS (500ms)
 * - Includes estimated progress percentage based on elapsed time vs timeout
 * - Gracefully handles clients that don't support progress notifications (no error)
 * - Does not alter the final tool response
 *
 * @param server - The McpServer instance
 * @param progressToken - The progress token from the request's _meta, used to
 *   associate notifications with the original request. If undefined/null,
 *   streaming is silently disabled.
 */
export function createStreamingContext(
  server: McpServer,
  progressToken: string | number | undefined
): StreamingContext {
  let lastSentTime = 0;
  let pendingChunk: string | null = null;
  let pendingProgress = 0;
  let pendingTimer: ReturnType<typeof setTimeout> | null = null;

  function doSend(chunk: string, progress: number): void {
    // If no progress token was provided, the client doesn't support
    // progress notifications — silently skip.
    if (progressToken === undefined || progressToken === null) {
      return;
    }

    try {
      // Send a progress notification via the underlying Server's notification method.
      // The MCP protocol uses "notifications/progress" with progressToken, progress, and total.
      const notification = {
        method: "notifications/progress" as const,
        params: {
          progressToken,
          progress: Math.min(Math.max(progress, 0), 100),
          total: 100,
          // Include the chunk text as additional metadata
          _meta: {
            chunk,
          },
        },
      };

      // Use the underlying server's notification method.
      // This is a fire-and-forget call — we don't await it.
      // If the client doesn't support it, the notification is simply dropped.
      (server.server as any).notification(notification).catch(() => {
        // Silently ignore errors — client may not support progress notifications
      });
    } catch {
      // Gracefully handle any errors — don't throw, don't alter the response
    }
  }

  return {
    sendProgress(chunk: string, progress: number): void {
      const now = Date.now();
      const elapsed = now - lastSentTime;

      if (elapsed >= STREAM_CHUNK_INTERVAL_MS) {
        // Enough time has passed — send immediately
        if (pendingTimer !== null) {
          clearTimeout(pendingTimer);
          pendingTimer = null;
        }
        lastSentTime = now;
        doSend(chunk, progress);
      } else {
        // Debounce: store the latest chunk and schedule a send
        pendingChunk = chunk;
        pendingProgress = progress;

        if (pendingTimer === null) {
          const delay = STREAM_CHUNK_INTERVAL_MS - elapsed;
          pendingTimer = setTimeout(() => {
            pendingTimer = null;
            lastSentTime = Date.now();
            if (pendingChunk !== null) {
              doSend(pendingChunk, pendingProgress);
              pendingChunk = null;
            }
          }, delay);
        }
      }
    },
  };
}
