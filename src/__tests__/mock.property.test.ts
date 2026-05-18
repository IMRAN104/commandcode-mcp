// Feature: commandcode-mcp-server, Property 7: Mock mode returns deterministic response containing tool name and parameters

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { executeMock } from "../mock.js";

/**
 * **Validates: Requirements 15.4, 15.5**
 *
 * Property 7: For any tool name string and any parameter object,
 * when COMMANDCODE_MOCK is "true", the executeMock function SHALL return
 * a ToolResponse where:
 * - The response has no isError flag (or it is false)
 * - The text content contains the tool name
 * - The text content contains a JSON representation of the received parameters
 */
describe("Property 7: Mock mode returns deterministic response containing tool name and parameters", () => {
  it("response has no isError flag (or it is falsy) for any tool name and params", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.dictionary(fc.string(), fc.jsonValue()),
        (toolName, params) => {
          const result = executeMock(toolName, params);
          expect(result.isError).toBeFalsy();
        }
      ),
      { numRuns: 100 }
    );
  });

  it("text content contains the tool name for any tool name", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.dictionary(fc.string(), fc.jsonValue()),
        (toolName, params) => {
          const result = executeMock(toolName, params);
          expect(result.content[0].text).toContain(toolName);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("text content contains JSON.stringify(params) for any params object", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.dictionary(fc.string(), fc.jsonValue()),
        (toolName, params) => {
          const result = executeMock(toolName, params);
          expect(result.content[0].text).toContain(JSON.stringify(params));
        }
      ),
      { numRuns: 100 }
    );
  });

  it("response always has exactly one content entry of type 'text'", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.dictionary(fc.string(), fc.jsonValue()),
        (toolName, params) => {
          const result = executeMock(toolName, params);
          expect(result.content).toHaveLength(1);
          expect(result.content[0].type).toBe("text");
        }
      ),
      { numRuns: 100 }
    );
  });
});
