/**
 * Unit tests for the streaming module.
 *
 * Tests cover:
 * - StreamingContext interface and sendProgress method
 * - Debounce behavior (max one notification per 500ms)
 * - Graceful handling when client doesn't support progress notifications
 * - Progress percentage clamping
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createStreamingContext, StreamingContext } from "../streaming.js";
import { STREAM_CHUNK_INTERVAL_MS } from "../constants.js";

// Mock McpServer with a notification method on server.server
function createMockServer() {
  const notificationFn = vi.fn().mockResolvedValue(undefined);
  const mockServer = {
    server: {
      notification: notificationFn,
    },
  } as any;
  return { mockServer, notificationFn };
}

describe("streaming", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("createStreamingContext", () => {
    it("returns an object with a sendProgress method", () => {
      const { mockServer } = createMockServer();
      const ctx = createStreamingContext(mockServer, "token-1");
      expect(ctx).toBeDefined();
      expect(typeof ctx.sendProgress).toBe("function");
    });

    it("sends a progress notification immediately on first call", () => {
      const { mockServer, notificationFn } = createMockServer();
      const ctx = createStreamingContext(mockServer, "token-1");

      ctx.sendProgress("hello", 25);

      expect(notificationFn).toHaveBeenCalledTimes(1);
      expect(notificationFn).toHaveBeenCalledWith(
        expect.objectContaining({
          method: "notifications/progress",
          params: expect.objectContaining({
            progressToken: "token-1",
            progress: 25,
            total: 100,
          }),
        })
      );
    });

    it("includes the chunk text in _meta of the notification params", () => {
      const { mockServer, notificationFn } = createMockServer();
      const ctx = createStreamingContext(mockServer, "token-1");

      ctx.sendProgress("some output", 50);

      const call = notificationFn.mock.calls[0][0];
      expect(call.params._meta.chunk).toBe("some output");
    });
  });

  describe("debounce behavior", () => {
    it("debounces rapid calls to max one per STREAM_CHUNK_INTERVAL_MS", () => {
      const { mockServer, notificationFn } = createMockServer();
      const ctx = createStreamingContext(mockServer, "token-1");

      // First call goes through immediately
      ctx.sendProgress("chunk1", 10);
      expect(notificationFn).toHaveBeenCalledTimes(1);

      // Rapid subsequent calls within the interval should be debounced
      vi.advanceTimersByTime(100);
      ctx.sendProgress("chunk2", 20);
      ctx.sendProgress("chunk3", 30);
      expect(notificationFn).toHaveBeenCalledTimes(1);

      // After the interval, the last pending chunk should be sent
      vi.advanceTimersByTime(STREAM_CHUNK_INTERVAL_MS);
      expect(notificationFn).toHaveBeenCalledTimes(2);

      // The debounced call should use the latest chunk
      const lastCall = notificationFn.mock.calls[1][0];
      expect(lastCall.params._meta.chunk).toBe("chunk3");
      expect(lastCall.params.progress).toBe(30);
    });

    it("allows a new notification after the debounce interval passes", () => {
      const { mockServer, notificationFn } = createMockServer();
      const ctx = createStreamingContext(mockServer, "token-1");

      ctx.sendProgress("chunk1", 10);
      expect(notificationFn).toHaveBeenCalledTimes(1);

      // Wait for the full interval
      vi.advanceTimersByTime(STREAM_CHUNK_INTERVAL_MS);

      // Next call should go through immediately
      ctx.sendProgress("chunk2", 50);
      expect(notificationFn).toHaveBeenCalledTimes(2);
    });

    it("does not send duplicate notifications for the same pending chunk", () => {
      const { mockServer, notificationFn } = createMockServer();
      const ctx = createStreamingContext(mockServer, "token-1");

      ctx.sendProgress("chunk1", 10);
      vi.advanceTimersByTime(100);
      ctx.sendProgress("chunk2", 20);

      // Advance past the debounce interval
      vi.advanceTimersByTime(STREAM_CHUNK_INTERVAL_MS);
      expect(notificationFn).toHaveBeenCalledTimes(2);

      // No more calls should happen without new sendProgress calls
      vi.advanceTimersByTime(STREAM_CHUNK_INTERVAL_MS * 2);
      expect(notificationFn).toHaveBeenCalledTimes(2);
    });
  });

  describe("graceful handling of unsupported clients", () => {
    it("silently skips when progressToken is undefined", () => {
      const { mockServer, notificationFn } = createMockServer();
      const ctx = createStreamingContext(mockServer, undefined);

      // Should not throw
      ctx.sendProgress("hello", 50);
      expect(notificationFn).not.toHaveBeenCalled();
    });

    it("silently skips when progressToken is null", () => {
      const { mockServer, notificationFn } = createMockServer();
      const ctx = createStreamingContext(mockServer, null as any);

      ctx.sendProgress("hello", 50);
      expect(notificationFn).not.toHaveBeenCalled();
    });

    it("does not throw when notification method rejects", () => {
      const notificationFn = vi.fn().mockRejectedValue(new Error("not supported"));
      const mockServer = { server: { notification: notificationFn } } as any;
      const ctx = createStreamingContext(mockServer, "token-1");

      // Should not throw
      expect(() => ctx.sendProgress("hello", 50)).not.toThrow();
    });

    it("does not throw when notification method throws synchronously", () => {
      const notificationFn = vi.fn().mockImplementation(() => {
        throw new Error("sync error");
      });
      const mockServer = { server: { notification: notificationFn } } as any;
      const ctx = createStreamingContext(mockServer, "token-1");

      expect(() => ctx.sendProgress("hello", 50)).not.toThrow();
    });
  });

  describe("progress percentage handling", () => {
    it("clamps progress to 0 when negative", () => {
      const { mockServer, notificationFn } = createMockServer();
      const ctx = createStreamingContext(mockServer, "token-1");

      ctx.sendProgress("chunk", -10);

      const call = notificationFn.mock.calls[0][0];
      expect(call.params.progress).toBe(0);
    });

    it("clamps progress to 100 when exceeding 100", () => {
      const { mockServer, notificationFn } = createMockServer();
      const ctx = createStreamingContext(mockServer, "token-1");

      ctx.sendProgress("chunk", 150);

      const call = notificationFn.mock.calls[0][0];
      expect(call.params.progress).toBe(100);
    });

    it("passes through valid progress values unchanged", () => {
      const { mockServer, notificationFn } = createMockServer();
      const ctx = createStreamingContext(mockServer, "token-1");

      ctx.sendProgress("chunk", 42.5);

      const call = notificationFn.mock.calls[0][0];
      expect(call.params.progress).toBe(42.5);
    });
  });

  describe("numeric progress token", () => {
    it("works with a numeric progress token", () => {
      const { mockServer, notificationFn } = createMockServer();
      const ctx = createStreamingContext(mockServer, 12345);

      ctx.sendProgress("data", 60);

      expect(notificationFn).toHaveBeenCalledTimes(1);
      const call = notificationFn.mock.calls[0][0];
      expect(call.params.progressToken).toBe(12345);
    });
  });
});
