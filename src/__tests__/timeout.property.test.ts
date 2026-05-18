// Feature: commandcode-mcp-server, Property 3: Timeout validation normalizes values correctly

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { validateTimeoutSeconds } from "../validation.js";
import { McpError } from "@modelcontextprotocol/sdk/types.js";

/**
 * Property 3: Timeout validation normalizes values correctly
 *
 * For any numeric input to validateTimeoutSeconds:
 * - Values between 1 and 900 (inclusive integers) SHALL pass through unchanged
 * - Values greater than 900 SHALL be capped to 900
 * - Values less than 1, zero, negative numbers, or non-integer values SHALL be rejected with an InvalidParams error
 * - Undefined/absent values SHALL resolve to the default of 300
 *
 * **Validates: Requirements 10.2, 10.4, 10.5**
 */
describe("Property 3: Timeout validation normalizes values correctly", () => {
  it("valid integers 1-900 pass through unchanged", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 900 }), (value) => {
        const result = validateTimeoutSeconds(value);
        expect(result).toBe(value);
      }),
      { numRuns: 100 }
    );
  });

  it("integers greater than 900 are capped to 900", () => {
    fc.assert(
      fc.property(fc.integer({ min: 901, max: 1_000_000 }), (value) => {
        const result = validateTimeoutSeconds(value);
        expect(result).toBe(900);
      }),
      { numRuns: 100 }
    );
  });

  it("values less than 1 (zero and negative) throw McpError", () => {
    fc.assert(
      fc.property(fc.integer({ min: -1_000_000, max: 0 }), (value) => {
        expect(() => validateTimeoutSeconds(value)).toThrow(McpError);
      }),
      { numRuns: 100 }
    );
  });

  it("non-integer values (floats) throw McpError", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.01, max: 10000, noNaN: true, noDefaultInfinity: true }).filter(
          (v) => !Number.isInteger(v)
        ),
        (value) => {
          expect(() => validateTimeoutSeconds(value)).toThrow(McpError);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("undefined returns default of 300", () => {
    const result = validateTimeoutSeconds(undefined);
    expect(result).toBe(300);
  });
});
