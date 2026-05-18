// Feature: commandcode-mcp-server, Property 10: Streaming delivers progressive output without altering final result

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fc from "fast-check";
import { createStreamingContext } from "../streaming.js";
import { STREAM_CHUNK_INTERVAL_MS } from "../constants.js";

/**
 * Property 10: Streaming delivers progressive output without altering final result
 *
 * For any tool invocation with `stream: true` that produces stdout output:
 * - The streaming context SHALL emit at least one progress notification if the CLI produces output before completion
 * - The final tool response SHALL contain the complete stdout (identical to what would be returned with `stream: false`)
 * - Progress notifications SHALL be debounced to at most one per 500ms interval
 * - If the client does not support progress notifications, no error SHALL occur
 *
 * **Validates: Requirements 16.4, 16.5, 16.2**
 */

// Helper: create a mock MCP server with a notification spy
function createMockServer() {
  const notificationFn = vi.fn().mockResolvedValue(undefined);
  const mockServer = {
    server: {
      notification: notificationFn,
    },
  } as any;
  return { mockServer, notificationFn };
}

describe("Property 10: Streaming delivers progressive output without altering final result", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sendProgress does not throw for any non-empty chunk string with undefined progressToken", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }),
        (chunk, progress) => {
          const { mockServer } = createMockServer();
          const ctx = createStreamingContext(mockServer, undefined);

          // Should never throw, even with undefined progressToken
          expect(() => ctx.sendProgress(chunk, progress)).not.toThrow();
        }
      ),
      { numRuns: 100 }
    );
  });

  it("progress value is clamped to 0-100 range in the notification", () => {
    fc.assert(
      fc.property(
        fc.double({ min: -1000, max: 1000, noNaN: true, noDefaultInfinity: true }),
        (progress) => {
          const { mockServer, notificationFn } = createMockServer();
          const ctx = createStreamingContext(mockServer, "test-token");

          ctx.sendProgress("test chunk", progress);

          expect(notificationFn).toHaveBeenCalledTimes(1);
          const call = notificationFn.mock.calls[0][0];
          const sentProgress = call.params.progress;

          // Progress must be clamped between 0 and 100
          expect(sentProgress).toBeGreaterThanOrEqual(0);
          expect(sentProgress).toBeLessThanOrEqual(100);

          // Verify clamping logic: Math.min(Math.max(progress, 0), 100)
          // Note: Math.max(-0, 0) returns +0 per IEEE 754, so we compare numerically
          if (progress < 0) {
            expect(sentProgress).toBe(0);
          } else if (progress > 100) {
            expect(sentProgress).toBe(100);
          } else {
            // Use numeric equality (==) to handle -0 vs +0 edge case
            expect(sentProgress == progress).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it("rapid calls within 500ms result in at most 2 notifications (first immediate + one debounced)", () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1 }), { minLength: 2, maxLength: 20 }),
        (chunks) => {
          const { mockServer, notificationFn } = createMockServer();
          const ctx = createStreamingContext(mockServer, "test-token");

          // Send all chunks rapidly within a single 500ms window
          for (let i = 0; i < chunks.length; i++) {
            ctx.sendProgress(chunks[i], (i / chunks.length) * 100);
            // Advance a tiny amount (less than STREAM_CHUNK_INTERVAL_MS total)
            vi.advanceTimersByTime(10);
          }

          // At this point: first call was immediate, rest are debounced
          // Before the debounce timer fires, we should have exactly 1 notification
          const countBeforeDebounce = notificationFn.mock.calls.length;
          expect(countBeforeDebounce).toBe(1);

          // Advance past the debounce interval to flush any pending
          vi.advanceTimersByTime(STREAM_CHUNK_INTERVAL_MS);

          // After debounce fires, we should have at most 2 notifications total
          const countAfterDebounce = notificationFn.mock.calls.length;
          expect(countAfterDebounce).toBeLessThanOrEqual(2);
          expect(countAfterDebounce).toBeGreaterThanOrEqual(1);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("streaming context does not alter or consume the chunk data (side-effect only)", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }),
        (chunk, progress) => {
          const { mockServer, notificationFn } = createMockServer();
          const ctx = createStreamingContext(mockServer, "test-token");

          // Store original chunk value before calling sendProgress
          const originalChunk = chunk;
          const originalLength = chunk.length;

          // Call sendProgress — this is a side-effect only operation
          ctx.sendProgress(chunk, progress);

          // The chunk string must remain unchanged after sendProgress
          expect(chunk).toBe(originalChunk);
          expect(chunk.length).toBe(originalLength);

          // The notification receives the chunk but does not modify it
          expect(notificationFn).toHaveBeenCalledTimes(1);
          const call = notificationFn.mock.calls[0][0];
          expect(call.params._meta.chunk).toBe(originalChunk);
        }
      ),
      { numRuns: 100 }
    );
  });
});
