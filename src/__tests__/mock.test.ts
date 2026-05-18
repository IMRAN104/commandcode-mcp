import { describe, it, expect } from "vitest";
import { executeMock } from "../mock.js";

describe("executeMock", () => {
  it("returns a ToolResponse with text containing tool name and params", () => {
    const result = executeMock("commandcode_query", {
      query: "explain auth",
      working_dir: "/project",
    });

    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: 'MOCK: commandcode_query {"query":"explain auth","working_dir":"/project"}',
        },
      ],
    });
  });

  it("does not include isError flag", () => {
    const result = executeMock("commandcode_continue", { query: "next" });

    expect(result.isError).toBeUndefined();
    expect(result).not.toHaveProperty("isError");
  });

  it("handles empty params object", () => {
    const result = executeMock("commandcode_info", {});

    expect(result.content[0].text).toBe("MOCK: commandcode_info {}");
  });

  it("serializes complex nested params", () => {
    const params = {
      query: "find bugs",
      context_dirs: ["/src", "/lib"],
      plan_mode: true,
    };
    const result = executeMock("commandcode_query", params);

    expect(result.content[0].text).toBe(
      `MOCK: commandcode_query ${JSON.stringify(params)}`
    );
  });

  it("content array has exactly one text entry", () => {
    const result = executeMock("commandcode_taste", {});

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
  });
});
