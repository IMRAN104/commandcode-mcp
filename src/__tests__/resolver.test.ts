/**
 * Unit tests for the resolver module.
 *
 * Validates: Requirements 1.3, 1.4, 1.7, 13.1, 13.2, 13.5
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { resolveCommandCodePath, clearResolvedPathCache } from "../resolver.js";

describe("resolveCommandCodePath", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    clearResolvedPathCache();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    clearResolvedPathCache();
  });

  it("should use COMMANDCODE_PATH env var when set", () => {
    process.env.COMMANDCODE_PATH = "/custom/path/to/cmc";
    const result = resolveCommandCodePath();
    expect(result.command).toBe("/custom/path/to/cmc");
    expect(result.args).toEqual([]);
  });

  it("should cache the resolved path on subsequent calls", () => {
    process.env.COMMANDCODE_PATH = "/first/path";
    const first = resolveCommandCodePath();

    // Change env — should still return cached value
    process.env.COMMANDCODE_PATH = "/second/path";
    const second = resolveCommandCodePath();

    expect(first).toBe(second);
    expect(second.command).toBe("/first/path");
  });

  it("should fall back to cmd /c cmc on Windows when no env var or npm path", () => {
    delete process.env.COMMANDCODE_PATH;
    delete process.env.APPDATA;

    // Mock platform as Windows
    const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform");
    Object.defineProperty(process, "platform", { value: "win32" });

    // Re-import to pick up IS_WINDOWS change — but since IS_WINDOWS is imported
    // from constants at module load time, we test the fallback logic directly.
    // For this test, we rely on the current platform behavior.
    clearResolvedPathCache();

    const result = resolveCommandCodePath();

    // On the actual test platform (Windows), it should use cmd /c cmc
    // On Unix CI, it would use "cmc" directly
    if (process.platform === "win32") {
      expect(result.command).toBe("cmd");
      expect(result.args).toEqual(["/c", "cmc"]);
    } else {
      expect(result.command).toBe("cmc");
      expect(result.args).toEqual([]);
    }

    // Restore platform
    if (originalPlatform) {
      Object.defineProperty(process, "platform", originalPlatform);
    }
  });

  it("should return a ResolvedCommand with command and args properties", () => {
    process.env.COMMANDCODE_PATH = "/some/binary";
    const result = resolveCommandCodePath();
    expect(result).toHaveProperty("command");
    expect(result).toHaveProperty("args");
    expect(typeof result.command).toBe("string");
    expect(Array.isArray(result.args)).toBe(true);
  });

  it("should clear cache when clearResolvedPathCache is called", () => {
    process.env.COMMANDCODE_PATH = "/path/one";
    const first = resolveCommandCodePath();
    expect(first.command).toBe("/path/one");

    clearResolvedPathCache();
    process.env.COMMANDCODE_PATH = "/path/two";
    const second = resolveCommandCodePath();
    expect(second.command).toBe("/path/two");
  });
});
