// Feature: commandcode-mcp-server, Property 8: Continue queue accepts up to max size, rejects overflow, and respects bypass
// **Validates: Requirements 4.2, 4.3, 4.5**

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { ContinueQueue } from "../queue.js";

describe("Property 8: Continue queue accepts up to max size, rejects overflow, and respects bypass", () => {
  describe("1. Queue accepts up to maxSize items without rejecting", () => {
    it("accepts up to maxSize concurrent enqueue calls without throwing", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 5 }),
          async (maxSize) => {
            const queue = new ContinueQueue(maxSize);
            const promises: Promise<unknown>[] = [];

            // Enqueue exactly maxSize items that resolve immediately
            for (let i = 0; i < maxSize; i++) {
              promises.push(
                queue.enqueue(() => Promise.resolve(i))
              );
            }

            // All should resolve without throwing
            const results = await Promise.all(promises);
            expect(results).toHaveLength(maxSize);
            for (const r of results) {
              expect(r).toHaveProperty("result");
              expect(r).toHaveProperty("queueStatus");
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe("2. Queue rejects when full", () => {
    it("rejects enqueue calls that exceed maxSize pending items", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 5 }),
          fc.integer({ min: 1, max: 3 }),
          async (maxSize, overflow) => {
            const queue = new ContinueQueue(maxSize);
            const resolvers: Array<() => void> = [];

            // Enqueue maxSize + 1 blocking tasks:
            // The first one starts running immediately, the next maxSize fill the pending queue
            for (let i = 0; i < maxSize + 1; i++) {
              queue.enqueue(
                () => new Promise<number>((resolve) => {
                  resolvers.push(() => resolve(i));
                })
              ).catch(() => { /* expected for overflow */ });
            }

            // Wait a tick for processNext to pick up the first item
            await new Promise((r) => setTimeout(r, 0));

            // At this point: 1 running + maxSize pending = queue is full
            expect(queue.isFull).toBe(true);

            // Now try to enqueue overflow more items — they should all be rejected
            const overflowResults: Array<{ rejected: boolean; message?: string }> = [];
            for (let i = 0; i < overflow; i++) {
              try {
                await queue.enqueue(() => Promise.resolve(i));
                overflowResults.push({ rejected: false });
              } catch (err: unknown) {
                overflowResults.push({
                  rejected: true,
                  message: err instanceof Error ? err.message : String(err),
                });
              }
            }

            // All overflow attempts should have been rejected
            expect(overflowResults).toHaveLength(overflow);
            for (const r of overflowResults) {
              expect(r.rejected).toBe(true);
              expect(r.message).toContain("Server overloaded");
            }

            // Clean up: resolve all pending tasks
            for (const resolver of resolvers) {
              resolver();
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe("3. Queued operations execute in FIFO order", () => {
    it("executes enqueued operations in the order they were added", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2, max: 8 }),
          async (n) => {
            const queue = new ContinueQueue(n + 1); // ensure queue is large enough
            const executionOrder: number[] = [];

            const promises: Promise<unknown>[] = [];
            for (let i = 0; i < n; i++) {
              promises.push(
                queue.enqueue(async () => {
                  executionOrder.push(i);
                  return i;
                })
              );
            }

            await Promise.all(promises);

            // Verify FIFO order: tasks should execute in 0, 1, 2, ..., n-1 order
            expect(executionOrder).toHaveLength(n);
            for (let i = 0; i < n; i++) {
              expect(executionOrder[i]).toBe(i);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe("4. executeImmediate bypasses the queue", () => {
    it("executeImmediate executes even when queue is full", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 5 }),
          fc.integer({ min: 1, max: 3 }),
          async (maxSize, immediateCount) => {
            const queue = new ContinueQueue(maxSize);
            const resolvers: Array<() => void> = [];

            // Fill the queue with blocking tasks: 1 running + maxSize pending
            for (let i = 0; i < maxSize + 1; i++) {
              queue.enqueue(
                () => new Promise<void>((resolve) => {
                  resolvers.push(resolve);
                })
              ).catch(() => { /* ignore */ });
            }

            // Wait a tick for processNext to pick up the first item
            await new Promise((r) => setTimeout(r, 0));

            // Queue should be full
            expect(queue.isFull).toBe(true);

            // executeImmediate should still work even though queue is full
            const immediateResults: number[] = [];
            for (let i = 0; i < immediateCount; i++) {
              const result = await queue.executeImmediate(() => Promise.resolve(i * 10));
              immediateResults.push(result);
            }

            // All immediate calls should have completed with correct values
            expect(immediateResults).toHaveLength(immediateCount);
            for (let i = 0; i < immediateCount; i++) {
              expect(immediateResults[i]).toBe(i * 10);
            }

            // Queue size should not have been affected by immediate calls
            expect(queue.size).toBe(maxSize);

            // Clean up: resolve all pending tasks
            for (const resolver of resolvers) {
              resolver();
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
