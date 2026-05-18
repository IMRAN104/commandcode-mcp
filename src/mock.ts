import { ToolResponse } from "./types.js";

/**
 * Returns a deterministic mock response containing the tool name and
 * JSON-serialized parameters. Used when COMMANDCODE_MOCK=true to enable
 * assertion-based automated testing without a live CLI.
 */
export function executeMock(
  toolName: string,
  params: Record<string, unknown>
): ToolResponse {
  return {
    content: [
      {
        type: "text",
        text: `MOCK: ${toolName} ${JSON.stringify(params)}`,
      },
    ],
  };
}
