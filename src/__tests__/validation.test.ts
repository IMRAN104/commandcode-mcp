import { describe, it, expect } from "vitest";
import {
  validateQuery,
  validatePath,
  validateSessionName,
  hasPathTraversal,
  hasShellMetachar,
} from "../validation.js";
import { McpError } from "@modelcontextprotocol/sdk/types.js";

describe("validateQuery boundary values", () => {
  it("accepts a query at exactly 100,000 characters", () => {
    const query = "a".repeat(100_000);
    expect(validateQuery(query)).toBe(query);
  });

  it("rejects a query at 100,001 characters", () => {
    const query = "a".repeat(100_001);
    expect(() => validateQuery(query)).toThrow(McpError);
  });
});

describe("validatePath boundary values", () => {
  it("accepts a path at exactly 4,096 characters", () => {
    const path = "a".repeat(4_096);
    expect(validatePath(path, "test_path")).toBe(path);
  });

  it("rejects a path at 4,097 characters", () => {
    const path = "a".repeat(4_097);
    expect(() => validatePath(path, "test_path")).toThrow(McpError);
  });
});

describe("validateSessionName boundary values", () => {
  it("accepts a session name at exactly 512 characters", () => {
    const name = "s".repeat(512);
    expect(validateSessionName(name)).toBe(name);
  });

  it("rejects a session name at 513 characters", () => {
    const name = "s".repeat(513);
    expect(() => validateSessionName(name)).toThrow(McpError);
  });
});

describe("hasShellMetachar", () => {
  it.each(["&", "|", "<", ">", "^", "%", "!"])(
    "returns true for metacharacter: %s",
    (char) => {
      expect(hasShellMetachar(`safe${char}string`)).toBe(true);
    }
  );

  it("returns false for safe strings without metacharacters", () => {
    expect(hasShellMetachar("hello-world_test.txt")).toBe(false);
    expect(hasShellMetachar("/usr/local/bin/app")).toBe(false);
    expect(hasShellMetachar("C:\\Users\\dev\\project")).toBe(false);
  });
});

describe("hasPathTraversal", () => {
  it('returns true for strings with ".." as a path segment', () => {
    expect(hasPathTraversal("../etc/passwd")).toBe(true);
    expect(hasPathTraversal("/home/../secret")).toBe(true);
    expect(hasPathTraversal("dir/..")).toBe(true);
    expect(hasPathTraversal("C:\\Users\\..\\Admin")).toBe(true);
  });

  it("returns true for strings with null bytes", () => {
    expect(hasPathTraversal("file\x00.txt")).toBe(true);
    expect(hasPathTraversal("\x00")).toBe(true);
  });

  it('returns false for safe paths (e.g., "..hidden" is not traversal)', () => {
    expect(hasPathTraversal("..hidden")).toBe(false);
    expect(hasPathTraversal("/home/user/..config")).toBe(false);
    expect(hasPathTraversal("normal/path/file.txt")).toBe(false);
  });
});
