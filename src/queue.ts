/**
 * Bounded continue queue with caller-visible status.
 *
 * Serializes `commandcode_continue` execution so that session state
 * is not corrupted by concurrent requests. The queue is explicitly
 * exposed to the calling agent via queue status metadata.
 *
 * Validates: Requirements 4.2, 4.3, 4.4, 4.5
 */

import type { QueueStatus } from "./types.js";
import { MAX_CONTINUE_QUEUE_SIZE } from "./constants.js";

interface QueueItem {
  fn: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}

export class ContinueQueue {
  private pending: QueueItem[] = [];
  private running = false;
  private maxSize: number;

  constructor(maxSize: number = MAX_CONTINUE_QUEUE_SIZE) {
    this.maxSize = maxSize;
  }

  /**
   * Enqueue a function for serialized execution.
   * Rejects immediately if the queue is full.
   * Returns the result along with queue status metadata.
   */
  async enqueue<T>(fn: () => Promise<T>): Promise<{ result: T; queueStatus: QueueStatus }> {
    if (this.isFull) {
      throw new Error(
        "Server overloaded: too many pending continue requests. Use commandcode_query for a fresh session instead."
      );
    }

    const position = this.pending.length + (this.running ? 1 : 0);

    return new Promise<{ result: T; queueStatus: QueueStatus }>((resolve, reject) => {
      this.pending.push({
        fn,
        resolve: (value: unknown) => {
          resolve({
            result: value as T,
            queueStatus: {
              position: 0,
              queueSize: this.pending.length + (this.running ? 1 : 0),
            },
          });
        },
        reject,
      });

      this.processNext();
    });
  }

  /**
   * Execute a function immediately without entering the queue.
   * Used when the caller sets queue=false to bypass serialization.
   */
  async executeImmediate<T>(fn: () => Promise<T>): Promise<T> {
    return fn();
  }

  /** Number of items currently waiting in the queue (not including the running item). */
  get size(): number {
    return this.pending.length;
  }

  /** Whether the queue has reached its maximum capacity. */
  get isFull(): boolean {
    return this.pending.length >= this.maxSize;
  }

  private processNext(): void {
    if (this.running || this.pending.length === 0) {
      return;
    }

    this.running = true;
    const item = this.pending.shift()!;

    item
      .fn()
      .then((result) => {
        this.running = false;
        item.resolve(result);
        this.processNext();
      })
      .catch((error) => {
        this.running = false;
        item.reject(error);
        this.processNext();
      });
  }
}
