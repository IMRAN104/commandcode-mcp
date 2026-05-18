// Feature: commandcode-mcp-server, Property 6: Combined info formatting always includes labeled sections

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { formatCombinedInfo } from "../response.js";
import type { CommandCodeResult } from "../types.js";

/**
 * **Validates: Requirements 8.1, 8.2, 8.3, 8.4**
 *
 * Property 6: Combined info formatting always includes labeled sections
 *
 * For any pair of CommandCodeResult values (infoResult, statusResult),
 * the formatCombinedInfo function SHALL:
 * - Always include "=== Info ===" and "=== Status ===" headers in the output text
 * - If one result has exit code 0 and the other non-zero, still include the successful output alongside the error
 * - If both results have non-zero exit codes, set isError: true and include both error outputs
 */

// Generator for CommandCodeResult with configurable exit code
function commandCodeResultArb(
  codeArb: fc.Arbitrary<number | null> = fc.oneof(
    fc.constant(0),
    fc.integer({ min: 1, max: 255 }),
    fc.constant(null)
  )
): fc.Arbitrary<CommandCodeResult> {
  return fc.record({
    stdout: fc.string({ minLength: 0, maxLength: 200 }),
    stderr: fc.string({ minLength: 0, maxLength: 200 }),
    code: codeArb,
    timedOut: fc.constant(false),
    elapsedMs: fc.integer({ min: 0, max: 900000 }),
  });
}

// Generator for a result with exit code 0 (success)
const successResultArb = commandCodeResultArb(fc.constant(0));

// Generator for a result with non-zero exit code (failure)
const failureResultArb = commandCodeResultArb(
  fc.integer({ min: 1, max: 255 })
);

// Generator for any result (mixed exit codes including null)
const anyResultArb = commandCodeResultArb();

describe("Property 6: Combined info formatting always includes labeled sections", () => {
  it("output always contains '=== Info ===' header", () => {
    fc.assert(
      fc.property(anyResultArb, anyResultArb, (infoResult, statusResult) => {
        const response = formatCombinedInfo(infoResult, statusResult);
        const text = response.content[0].text;
        expect(text).toContain("=== Info ===");
      }),
      { numRuns: 100 }
    );
  });

  it("output always contains '=== Status ===' header", () => {
    fc.assert(
      fc.property(anyResultArb, anyResultArb, (infoResult, statusResult) => {
        const response = formatCombinedInfo(infoResult, statusResult);
        const text = response.content[0].text;
        expect(text).toContain("=== Status ===");
      }),
      { numRuns: 100 }
    );
  });

  it("when both results have exit code 0, isError is not set", () => {
    fc.assert(
      fc.property(successResultArb, successResultArb, (infoResult, statusResult) => {
        const response = formatCombinedInfo(infoResult, statusResult);
        expect(response.isError).not.toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it("when both results have non-zero exit codes, isError is true", () => {
    fc.assert(
      fc.property(failureResultArb, failureResultArb, (infoResult, statusResult) => {
        const response = formatCombinedInfo(infoResult, statusResult);
        expect(response.isError).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it("when one succeeds and one fails, isError is not set", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          // info succeeds, status fails
          fc.tuple(successResultArb, failureResultArb),
          // info fails, status succeeds
          fc.tuple(failureResultArb, successResultArb)
        ),
        ([infoResult, statusResult]) => {
          const response = formatCombinedInfo(infoResult, statusResult);
          expect(response.isError).not.toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});
