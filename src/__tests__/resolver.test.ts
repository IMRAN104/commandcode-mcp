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
    process.env.COMMANDCODE_PATH = "/custom/path/to/commandcode";
    const result = resolveCommandCodePath();
    expect(result.command).toBe("/custom/path/to/commandcode");
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

  it("should fall back to commandcode via PATH when no env var or npm path", () => {
    // Strip every source the resolver consults so we deterministically
    // exercise the final literal fallback — independent of whether the
    // test host actually has command-code installed.
    delete process.env.COMMANDCODE_PATH;
    delete process.env.APPDATA;
    delete process.env.PATH;
    delete process.env.HOME;

    clearResolvedPathCache();

    const result = resolveCommandCodePath();

    // Should always use "commandcode" directly (PATH handles resolution)
    expect(result.command).toBe("commandcode");
    expect(result.args).toEqual([]);
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
