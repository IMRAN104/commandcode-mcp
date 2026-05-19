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


describe("resolveCommandCodePath — cross-platform branches", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.resetModules();
    vi.restoreAllMocks();
  });

  /**
   * Dynamically load the resolver with a mocked IS_WINDOWS flag and a
   * mocked fs.existsSync whose "exists" set is normalized to forward
   * slashes so tests behave identically on any host OS.
   */
  async function loadResolver(opts: {
    isWindows: boolean;
    existing?: string[];
  }) {
    vi.doMock("../constants.js", () => ({
      IS_WINDOWS: opts.isWindows,
      STARTUP_CHECK_TIMEOUT_MS: 10_000,
    }));
    // Normalize to forward slashes AND lowercase so the mock is both
    // separator-agnostic (path.join on Win host returns "\", on Unix "/")
    // and case-insensitive (Windows PATHEXT is uppercase ".CMD"/".EXE",
    // but the on-disk shim is conventionally lowercase ".cmd"/".exe").
    const norm = (p: string) => p.replace(/\\/g, "/").toLowerCase();
    const existing = new Set((opts.existing ?? []).map(norm));
    vi.doMock("fs", async (importOriginal) => {
      const actual = await importOriginal<typeof import("fs")>();
      return {
        ...actual,
        existsSync: (p: import("fs").PathLike) => existing.has(norm(String(p))),
      };
    });
    const mod = await import("../resolver.js");
    mod.clearResolvedPathCache();
    return mod;
  }

  function clearEnvOverrides() {
    delete process.env.COMMANDCODE_PATH;
    delete process.env.APPDATA;
    delete process.env.HOME;
    delete process.env.PATH;
    delete process.env.PATHEXT;
    delete process.env.ComSpec;
  }

  // ---- COMMANDCODE_PATH branch ----

  it("wraps COMMANDCODE_PATH ending in .cmd through cmd.exe on Windows", async () => {
    clearEnvOverrides();
    process.env.COMMANDCODE_PATH = "C:\\Tools\\commandcode.cmd";
    process.env.ComSpec = "C:\\Windows\\System32\\cmd.exe";
    const { resolveCommandCodePath } = await loadResolver({ isWindows: true });
    const r = resolveCommandCodePath();
    expect(r.command).toBe("C:\\Windows\\System32\\cmd.exe");
    expect(r.args).toEqual(["/d", "/s", "/c", "C:\\Tools\\commandcode.cmd"]);
  });

  it("wraps COMMANDCODE_PATH ending in .bat and falls back to literal cmd.exe", async () => {
    clearEnvOverrides();
    process.env.COMMANDCODE_PATH = "C:\\Tools\\commandcode.bat";
    const { resolveCommandCodePath } = await loadResolver({ isWindows: true });
    const r = resolveCommandCodePath();
    expect(r.command).toBe("cmd.exe");
    expect(r.args).toEqual(["/d", "/s", "/c", "C:\\Tools\\commandcode.bat"]);
  });

  it("does NOT wrap COMMANDCODE_PATH pointing at an .mjs on Windows", async () => {
    clearEnvOverrides();
    process.env.COMMANDCODE_PATH = "C:\\Tools\\index.mjs";
    const { resolveCommandCodePath } = await loadResolver({ isWindows: true });
    const r = resolveCommandCodePath();
    expect(r.command).toBe("C:\\Tools\\index.mjs");
    expect(r.args).toEqual([]);
  });

  it("does NOT wrap COMMANDCODE_PATH on Unix even when extension is .cmd", async () => {
    clearEnvOverrides();
    process.env.COMMANDCODE_PATH = "/weird/path/commandcode.cmd";
    const { resolveCommandCodePath } = await loadResolver({ isWindows: false });
    const r = resolveCommandCodePath();
    expect(r.command).toBe("/weird/path/commandcode.cmd");
    expect(r.args).toEqual([]);
  });

  // ---- Global npm prefix probing ----

  it("discovers the Windows %APPDATA%\\npm global install", async () => {
    clearEnvOverrides();
    process.env.APPDATA = "C:\\Users\\dev\\AppData\\Roaming";
    const { resolveCommandCodePath } = await loadResolver({
      isWindows: true,
      existing: [
        "C:/Users/dev/AppData/Roaming/npm/node_modules/command-code/dist/index.mjs",
      ],
    });
    const r = resolveCommandCodePath();
    expect(r.command).toBe("node");
    expect(r.args).toHaveLength(1);
    expect(r.args[0].replace(/\\/g, "/")).toBe(
      "C:/Users/dev/AppData/Roaming/npm/node_modules/command-code/dist/index.mjs"
    );
  });

  it("discovers the macOS Homebrew global install", async () => {
    clearEnvOverrides();
    const mjs = "/opt/homebrew/lib/node_modules/command-code/dist/index.mjs";
    const { resolveCommandCodePath } = await loadResolver({
      isWindows: false,
      existing: [mjs],
    });
    const r = resolveCommandCodePath();
    expect(r.command).toBe("node");
    expect(r.args).toEqual([mjs]);
  });

  it("discovers the Linux /usr/local global install", async () => {
    clearEnvOverrides();
    const mjs = "/usr/local/lib/node_modules/command-code/dist/index.mjs";
    const { resolveCommandCodePath } = await loadResolver({
      isWindows: false,
      existing: [mjs],
    });
    const r = resolveCommandCodePath();
    expect(r.command).toBe("node");
    expect(r.args).toEqual([mjs]);
  });

  it("discovers the Linux ~/.npm-global install via $HOME", async () => {
    clearEnvOverrides();
    process.env.HOME = "/home/dev";
    const mjs =
      "/home/dev/.npm-global/lib/node_modules/command-code/dist/index.mjs";
    const { resolveCommandCodePath } = await loadResolver({
      isWindows: false,
      existing: [mjs],
    });
    const r = resolveCommandCodePath();
    expect(r.command).toBe("node");
    expect(r.args).toHaveLength(1);
    // Resolver uses path.join, which yields native separators on the test
    // host. Compare via separator normalization so the test passes on any OS.
    expect(r.args[0].replace(/\\/g, "/")).toBe(mjs);
  });

  // ---- findOnPath + deriveScriptFromShim ----

  it("PATH walk on Windows finds .cmd via PATHEXT and derives sibling .mjs", async () => {
    clearEnvOverrides();
    process.env.PATH = "C:\\npm-global";
    process.env.PATHEXT = ".COM;.EXE;.CMD";
    const cmd = "C:/npm-global/commandcode.cmd";
    const mjs = "C:/npm-global/node_modules/command-code/dist/index.mjs";
    const { resolveCommandCodePath } = await loadResolver({
      isWindows: true,
      existing: [cmd, mjs],
    });
    const r = resolveCommandCodePath();
    expect(r.command).toBe("node");
    expect(r.args).toHaveLength(1);
    expect(r.args[0].replace(/\\/g, "/")).toBe(mjs);
  });

  it("PATH walk on Windows wraps a bare .cmd shim with cmd.exe when no .mjs sibling", async () => {
    clearEnvOverrides();
    process.env.PATH = "C:\\custom";
    process.env.PATHEXT = ".COM;.EXE;.CMD";
    process.env.ComSpec = "C:\\Windows\\cmd.exe";
    const cmd = "C:/custom/commandcode.cmd";
    const { resolveCommandCodePath } = await loadResolver({
      isWindows: true,
      existing: [cmd],
    });
    const r = resolveCommandCodePath();
    expect(r.command).toBe("C:\\Windows\\cmd.exe");
    expect(r.args.slice(0, 3)).toEqual(["/d", "/s", "/c"]);
    // Compare case-insensitively: PATHEXT yields ".CMD" but the fixture
    // (and real on-disk shims) use ".cmd". Windows also normalizes drive
    // letters ("C:" vs "c:") in some path operations.
    expect(r.args[3].replace(/\\/g, "/").toLowerCase()).toBe(cmd.toLowerCase());
  });

  it("PATH walk on Windows honors PATHEXT precedence (.EXE before .CMD)", async () => {
    clearEnvOverrides();
    process.env.PATH = "C:\\bin";
    process.env.PATHEXT = ".EXE;.CMD";
    process.env.ComSpec = "cmd.exe";
    const exe = "C:/bin/commandcode.exe";
    const cmd = "C:/bin/commandcode.cmd";
    const { resolveCommandCodePath } = await loadResolver({
      isWindows: true,
      existing: [exe, cmd],
    });
    const r = resolveCommandCodePath();
    // .EXE was chosen first; resolver still wraps with cmd.exe on Windows
    // because no .mjs sibling was found (the .exe is not derivable).
    expect(r.command).toBe("cmd.exe");
    expect(r.args[3].replace(/\\/g, "/").toLowerCase()).toBe(exe.toLowerCase());
  });

  it("PATH walk on Unix derives .mjs from a bin/ → lib/node_modules layout", async () => {
    clearEnvOverrides();
    process.env.PATH = "/opt/custom/bin";
    const bin = "/opt/custom/bin/commandcode";
    const mjs = "/opt/custom/lib/node_modules/command-code/dist/index.mjs";
    const { resolveCommandCodePath } = await loadResolver({
      isWindows: false,
      existing: [bin, mjs],
    });
    const r = resolveCommandCodePath();
    expect(r.command).toBe("node");
    expect(r.args).toHaveLength(1);
    expect(r.args[0].replace(/\\/g, "/")).toBe(mjs);
  });

  it("PATH walk on Unix returns the absolute shim path when no .mjs derivation succeeds", async () => {
    clearEnvOverrides();
    process.env.PATH = "/some/random/dir";
    const bin = "/some/random/dir/commandcode";
    const { resolveCommandCodePath } = await loadResolver({
      isWindows: false,
      existing: [bin],
    });
    const r = resolveCommandCodePath();
    expect(r.command.replace(/\\/g, "/")).toBe(bin);
    expect(r.args).toEqual([]);
  });
});


