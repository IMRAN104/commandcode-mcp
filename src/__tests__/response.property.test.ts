// Feature: commandcode-mcp-server, Property 4: Success response formatting selects correct output

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { formatSuccess } from "../response.js";
import type { CommandCodeResult } from "../types.js";

/**
 * **Validates: Requirements 2.3, 11.1**
 *
 * Property 4: Success response formatting selects correct output
 *
 * For any CommandCodeResult with exit code 0, the formatSuccess function SHALL return a ToolResponse where:
 * - If stdout is non-empty (after trimming), the text content equals the trimmed stdout
 *   (with STDERR: suffix if stderr is also non-empty)
 * - If stdout is empty but stderr is non-empty (after trimming), the text content equals the trimmed stderr
 * - If both stdout and stderr are empty, the text content equals "(no output)"
 * - The response never includes isError: true
 */
describe("Property 4: Success response formatting selects correct output", () => {
  // Generator for non-empty strings (after trimming)
  const nonEmptyTrimmedString = fc
    .string({ minLength: 1, maxLength: 500 })
    .filter((s) => s.trim().length > 0);

  // Generator for strings that are empty after trimming (whitespace-only or empty)
  const emptyAfterTrimString = fc.oneof(
    fc.constant(""),
    fc.stringOf(fc.constantFrom(" ", "\t", "\n", "\r"), { minLength: 0, maxLength: 20 })
  );

  // Generator for a success CommandCodeResult (code: 0, timedOut: false)
  function successResult(
    stdoutArb: fc.Arbitrary<string>,
    stderrArb: fc.Arbitrary<string>
  ): fc.Arbitrary<CommandCodeResult> {
    return fc.record({
      stdout: stdoutArb,
      stderr: stderrArb,
      code: fc.constant(0),
      timedOut: fc.constant(false),
      elapsedMs: fc.integer({ min: 0, max: 900000 }),
    });
  }

  it("when stdout is non-empty and stderr is empty, text content equals trimmed stdout", () => {
    fc.assert(
      fc.property(
        successResult(nonEmptyTrimmedString, emptyAfterTrimString),
        (result) => {
          const response = formatSuccess(result);
          expect(response.content[0].text).toBe(result.stdout.trim());
        }
      ),
      { numRuns: 100 }
    );
  });

  it("when stdout is non-empty and stderr is also non-empty, text content equals trimmed stdout with STDERR suffix", () => {
    fc.assert(
      fc.property(
        successResult(nonEmptyTrimmedString, nonEmptyTrimmedString),
        (result) => {
          const response = formatSuccess(result);
          const expected =
            result.stdout.trim() + "\nSTDERR: " + result.stderr.trim();
          expect(response.content[0].text).toBe(expected);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("when stdout is empty but stderr is non-empty, text content equals trimmed stderr", () => {
    fc.assert(
      fc.property(
        successResult(emptyAfterTrimString, nonEmptyTrimmedString),
        (result) => {
          const response = formatSuccess(result);
          expect(response.content[0].text).toBe(result.stderr.trim());
        }
      ),
      { numRuns: 100 }
    );
  });

  it("when both stdout and stderr are empty/whitespace-only, text content equals '(no output)'", () => {
    fc.assert(
      fc.property(
        successResult(emptyAfterTrimString, emptyAfterTrimString),
        (result) => {
          const response = formatSuccess(result);
          expect(response.content[0].text).toBe("(no output)");
        }
      ),
      { numRuns: 100 }
    );
  });

  it("the response never has isError set to true", () => {
    // Use any combination of stdout/stderr
    const anyString = fc.string({ minLength: 0, maxLength: 500 });
    fc.assert(
      fc.property(successResult(anyString, anyString), (result) => {
        const response = formatSuccess(result);
        expect(response.isError).not.toBe(true);
      }),
      { numRuns: 100 }
    );
  });
});


// Feature: commandcode-mcp-server, Property 5: Error response formatting includes exit code and isError flag

import { formatError } from "../response.js";

/**
 * **Validates: Requirements 2.4, 11.2, 11.3, 11.4, 11.5**
 *
 * Property 5: Error response formatting includes exit code and isError flag
 *
 * For any CommandCodeResult with a non-zero exit code N and any output string,
 * the formatError function SHALL return a ToolResponse where:
 * - isError is true
 * - The text content starts with "Command Code exited with code N"
 * - If both stdout and stderr are non-empty, stderr appears after a "STDERR:" prefix
 *
 * For any spawn failure or timeout error message, the formatError function SHALL
 * return a ToolResponse where:
 * - isError is true
 * - The text content does NOT contain "exited with code"
 */
describe("Property 5: Error response formatting includes exit code and isError flag", () => {
  // Generator for non-zero exit codes (1-255 typical range, but also negative codes)
  const nonZeroExitCode = fc.integer({ min: 1, max: 255 });

  // Generator for arbitrary output strings
  const outputString = fc.string();

  it("for any error message starting with 'Command Code exited with code N', isError is true and text starts with that prefix", () => {
    fc.assert(
      fc.property(
        nonZeroExitCode,
        outputString,
        outputString,
        (exitCode, stdout, stderr) => {
          // Build a message in the format the caller would construct for CLI errors
          let message = `Command Code exited with code ${exitCode}`;
          if (stdout.trim()) {
            message += "\n\n" + stdout.trim();
          }
          if (stdout.trim() && stderr.trim()) {
            message += "\nSTDERR: " + stderr.trim();
          }

          const result = formatError(message);

          expect(result.isError).toBe(true);
          expect(result.content[0].text).toMatch(
            new RegExp(`^Command Code exited with code ${exitCode}`)
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  it("for any spawn failure message (not containing 'exited with code'), isError is true and text does NOT contain 'exited with code'", () => {
    // Generator for spawn failure messages that never contain "exited with code"
    const spawnFailureMessage = fc.oneof(
      fc.constant("Failed to spawn CommandCode CLI: ENOENT"),
      fc.constant("Failed to spawn CommandCode CLI: permission denied"),
      fc.constant("Command Code timed out after 300s"),
      fc.constant("Failed to spawn CommandCode CLI: binary not found"),
      fc.string().filter((s) => !s.includes("exited with code"))
    );

    fc.assert(
      fc.property(spawnFailureMessage, (message) => {
        const result = formatError(message);

        expect(result.isError).toBe(true);
        expect(result.content[0].text).not.toContain("exited with code");
      }),
      { numRuns: 100 }
    );
  });

  it("formatError always returns isError: true regardless of input", () => {
    fc.assert(
      fc.property(fc.string(), (message) => {
        const result = formatError(message);

        expect(result.isError).toBe(true);
        expect(result.content).toHaveLength(1);
        expect(result.content[0].type).toBe("text");
        expect(result.content[0].text).toBe(message);
      }),
      { numRuns: 100 }
    );
  });
});


// Feature: commandcode-mcp-server, Property 6: Combined info formatting always includes labeled sections

import { formatCombinedInfo } from "../response.js";

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
    timedOut: fc.boolean(),
    elapsedMs: fc.integer({ min: 0, max: 900000 }),
  });
}

// Generator for a result with exit code 0 (success)
const successResultArb = commandCodeResultArb(fc.constant(0));

// Generator for a result with non-zero exit code (failure)
const failureResultArb = commandCodeResultArb(
  fc.integer({ min: 1, max: 255 })
);

// Generator for any result (mixed exit codes)
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

  it("when both results have non-zero exit codes, isError is true", () => {
    fc.assert(
      fc.property(failureResultArb, failureResultArb, (infoResult, statusResult) => {
        const response = formatCombinedInfo(infoResult, statusResult);
        expect(response.isError).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it("when at least one result has exit code 0, isError is not true", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          // info succeeds, status fails
          fc.tuple(successResultArb, failureResultArb),
          // info fails, status succeeds
          fc.tuple(failureResultArb, successResultArb),
          // both succeed
          fc.tuple(successResultArb, successResultArb)
        ),
        ([infoResult, statusResult]) => {
          const response = formatCombinedInfo(infoResult, statusResult);
          expect(response.isError).not.toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("both sections are always present regardless of individual success/failure", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          // both succeed
          fc.tuple(successResultArb, successResultArb),
          // info succeeds, status fails
          fc.tuple(successResultArb, failureResultArb),
          // info fails, status succeeds
          fc.tuple(failureResultArb, successResultArb),
          // both fail
          fc.tuple(failureResultArb, failureResultArb)
        ),
        ([infoResult, statusResult]) => {
          const response = formatCombinedInfo(infoResult, statusResult);
          const text = response.content[0].text;
          expect(text).toContain("=== Info ===");
          expect(text).toContain("=== Status ===");
        }
      ),
      { numRuns: 100 }
    );
  });
});
