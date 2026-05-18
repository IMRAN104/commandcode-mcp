// Feature: commandcode-mcp-server, Property 1: Input validation rejects dangerous inputs and accepts valid ones
// **Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5, 5.4, 6.3, 3.6, 1.1**

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  validateQuery,
  validatePath,
  validateSessionName,
  validateWorkingDir,
  hasPathTraversal,
  hasShellMetachar,
} from "../validation.js";
import { IS_WINDOWS } from "../constants.js";

/**
 * Helper: generate a string of a given length using safe characters
 * (no shell metacharacters, no path traversal sequences, no null bytes).
 */
const safeChar = fc.char().filter(
  (c) => c !== "\x00" && !"&|<>^%!".includes(c) && c !== "." && c !== "/" && c !== "\\"
);

const safeString = (minLen: number, maxLen: number) =>
  fc.stringOf(safeChar, { minLength: minLen, maxLength: maxLen }).filter(
    (s) => !s.includes("..") && !s.includes("\x00")
  );

describe("Property 1: Input validation rejects dangerous inputs and accepts valid ones", () => {
  describe("1. Query length acceptance (1-100,000 chars)", () => {
    it("accepts query strings with length between 1 and 100,000", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 1000 }).chain((len) =>
            fc.constant("a".repeat(len))
          ),
          (query) => {
            // Valid queries should not throw
            const result = validateQuery(query);
            expect(result).toBe(query);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe("2. Query length rejection (>100,000 or empty)", () => {
    it("rejects empty query strings", () => {
      expect(() => validateQuery("")).toThrow();
    });

    it("rejects query strings exceeding 100,000 characters", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 100_001, max: 110_000 }).chain((len) =>
            fc.constant("a".repeat(len))
          ),
          (query) => {
            expect(() => validateQuery(query)).toThrow();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe("3. Path acceptance (≤4,096 chars, no traversal)", () => {
    it("accepts path strings with length ≤ 4,096 that do not contain traversal or null bytes", () => {
      fc.assert(
        fc.property(
          safeString(1, 100),
          (path) => {
            // Should not throw for safe paths within length limit
            const result = validatePath(path, "test_path");
            expect(result).toBe(path);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe("4. Path rejection (>4,096 or contains '..' or null bytes)", () => {
    it("rejects paths exceeding 4,096 characters", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 4_097, max: 5_000 }).chain((len) =>
            fc.constant("a".repeat(len))
          ),
          (path) => {
            expect(() => validatePath(path, "test_path")).toThrow();
          }
        ),
        { numRuns: 100 }
      );
    });

    it("rejects paths containing '..' traversal sequences", () => {
      fc.assert(
        fc.property(
          fc.constantFrom(
            "../secret",
            "foo/../bar",
            "path/to/../../etc",
            "a\\..\\b",
            ".."
          ),
          (path) => {
            expect(() => validatePath(path, "test_path")).toThrow();
          }
        ),
        { numRuns: 100 }
      );
    });

    it("rejects paths containing null bytes", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 50 }).chain((len) =>
            fc.constant("a".repeat(len) + "\x00" + "b".repeat(len))
          ),
          (path) => {
            expect(() => validatePath(path, "test_path")).toThrow();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe("5. Session name acceptance (≤512, no traversal)", () => {
    it("accepts session names with length ≤ 512 that do not contain traversal or null bytes", () => {
      fc.assert(
        fc.property(
          safeString(1, 100),
          (name) => {
            const result = validateSessionName(name);
            expect(result).toBe(name);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe("6. Session name rejection (>512 or contains '..' or null bytes)", () => {
    it("rejects session names exceeding 512 characters", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 513, max: 1_000 }).chain((len) =>
            fc.constant("a".repeat(len))
          ),
          (name) => {
            expect(() => validateSessionName(name)).toThrow();
          }
        ),
        { numRuns: 100 }
      );
    });

    it("rejects session names containing '..' traversal sequences", () => {
      fc.assert(
        fc.property(
          fc.constantFrom(
            "../session",
            "my/../session",
            "a\\..\\b",
            ".."
          ),
          (name) => {
            expect(() => validateSessionName(name)).toThrow();
          }
        ),
        { numRuns: 100 }
      );
    });

    it("rejects session names containing null bytes", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 50 }).chain((len) =>
            fc.constant("session" + "\x00" + "a".repeat(len))
          ),
          (name) => {
            expect(() => validateSessionName(name)).toThrow();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe("7. Working dir accepts absolute paths, rejects relative paths", () => {
    it("accepts absolute paths", () => {
      fc.assert(
        fc.property(
          IS_WINDOWS
            ? fc.constantFrom(
                "C:\\Users\\test",
                "D:\\projects\\app",
                "C:/work/dir",
                "\\\\server\\share"
              )
            : fc.constantFrom(
                "/home/user",
                "/tmp/test",
                "/var/log/app",
                "/usr/local/bin"
              ),
          (dir) => {
            const result = validateWorkingDir(dir);
            expect(result).toBe(dir);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("rejects relative paths", () => {
      fc.assert(
        fc.property(
          fc.constantFrom(
            "relative/path",
            "src/index.ts",
            "./local",
            "no-slash"
          ),
          (dir) => {
            expect(() => validateWorkingDir(dir)).toThrow();
          }
        ),
        { numRuns: 100 }
      );
    });

    it("returns undefined for undefined input", () => {
      expect(validateWorkingDir(undefined)).toBeUndefined();
    });
  });

  describe("8. hasPathTraversal detects '..' and null bytes", () => {
    it("detects '..' path segments", () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.stringOf(fc.char().filter((c) => c !== "/" && c !== "\\" && c !== "\x00"), { minLength: 0, maxLength: 10 }),
            fc.stringOf(fc.char().filter((c) => c !== "/" && c !== "\\" && c !== "\x00"), { minLength: 0, maxLength: 10 })
          ).chain(([prefix, suffix]) => {
            const sep = fc.constantFrom("/", "\\");
            return sep.map((s) => {
              const parts: string[] = [];
              if (prefix.length > 0) parts.push(prefix);
              parts.push("..");
              if (suffix.length > 0) parts.push(suffix);
              return parts.join(s);
            });
          }),
          (path) => {
            expect(hasPathTraversal(path)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("detects null bytes", () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.string({ minLength: 0, maxLength: 20 }),
            fc.string({ minLength: 0, maxLength: 20 })
          ).map(([a, b]) => a + "\x00" + b),
          (path) => {
            expect(hasPathTraversal(path)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("returns false for safe paths without traversal or null bytes", () => {
      fc.assert(
        fc.property(
          safeString(1, 100),
          (path) => {
            expect(hasPathTraversal(path)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe("9. hasShellMetachar detects metacharacters", () => {
    it("detects shell metacharacters", () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.string({ minLength: 0, maxLength: 20 }).filter((s) => !/[&|<>^%!]/.test(s)),
            fc.constantFrom("&", "|", "<", ">", "^", "%", "!"),
            fc.string({ minLength: 0, maxLength: 20 }).filter((s) => !/[&|<>^%!]/.test(s))
          ).map(([prefix, meta, suffix]) => prefix + meta + suffix),
          (input) => {
            expect(hasShellMetachar(input)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("returns false for strings without metacharacters", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }).filter((s) => !/[&|<>^%!]/.test(s)),
          (input) => {
            expect(hasShellMetachar(input)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
