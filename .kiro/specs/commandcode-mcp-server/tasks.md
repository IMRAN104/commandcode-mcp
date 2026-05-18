# Implementation Plan: CommandCode MCP Server v2.0

## Overview

Modular rewrite of the CommandCode MCP Server from a single monolithic `src/index.ts` into a layered architecture with separate modules for validation, execution, response formatting, queue management, and individual tool definitions. The implementation uses TypeScript with Vitest for testing and fast-check for property-based tests.

## Tasks

- [x] 1. Set up project dependencies and module scaffolding
  - [x] 1.1 Update package.json with new dependencies and test scripts
    - Add `zod` to runtime dependencies
    - Add `vitest` and `fast-check` to devDependencies
    - Add `"test": "vitest --run"` script
    - Update description to reflect 6 tools
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5_

  - [x] 1.2 Create constants module (`src/constants.ts`)
    - Define all shared constants: MAX_QUERY_LENGTH, MAX_PATH_LENGTH, MAX_SESSION_NAME_LENGTH, MAX_CONTEXT_DIRS, DEFAULT_TIMEOUT_SECONDS, MAX_TIMEOUT_SECONDS, STARTUP_CHECK_TIMEOUT_MS, MAX_PARTIAL_OUTPUT_CHARS, MAX_CONTINUE_QUEUE_SIZE, STREAM_CHUNK_INTERVAL_MS, IS_WINDOWS
    - _Requirements: 9.1, 9.2, 10.1, 10.2, 16.2_

  - [x] 1.3 Create types module (`src/types.ts`)
    - Define CommandCodeResult interface (stdout, stderr, code, timedOut, elapsedMs)
    - Define ExecutionOptions interface (args, cwd, timeoutSeconds, stream, onChunk)
    - Define ToolResponse interface (content array, optional isError)
    - Define QueueStatus interface (position, queueSize)
    - _Requirements: 2.3, 2.4, 11.1, 11.2, 4.2_

  - [x] 1.4 Create Vitest configuration (`vitest.config.ts`)
    - Configure Vitest for TypeScript with ESM support
    - Set test directory to `src/__tests__/`
    - _Requirements: 15.1_

- [x] 2. Implement validation module
  - [x] 2.1 Create validation module (`src/validation.ts`)
    - Implement validateQuery: check length 1–100,000
    - Implement validatePath: check length ≤ 4,096, reject `..` and null bytes
    - Implement validateSessionName: check length ≤ 512, reject `..` and null bytes
    - Implement validateWorkingDir: check absolute path, reject relative
    - Implement validateContextDirs: validate array of up to 10 paths
    - Implement validateTimeoutSeconds: normalize to 1–900 range, default 300
    - Implement hasPathTraversal and hasShellMetachar helpers
    - All functions throw McpError with ErrorCode.InvalidParams on failure
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 10.2, 10.4, 10.5_

  - [x] 2.2 Write property test for input validation (Property 1)
    - **Property 1: Input validation rejects dangerous inputs and accepts valid ones**
    - **Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5, 5.4, 6.3, 3.6, 1.1**

  - [x] 2.3 Write property test for timeout validation (Property 3)
    - **Property 3: Timeout validation normalizes values correctly**
    - **Validates: Requirements 10.2, 10.4, 10.5**

  - [x] 2.4 Write unit tests for validation boundary values
    - Test query at exactly 100,000 chars (accept) and 100,001 chars (reject)
    - Test path at exactly 4,096 chars (accept) and 4,097 chars (reject)
    - Test session name at exactly 512 chars (accept) and 513 chars (reject)
    - Test Windows shell metacharacter rejection
    - Test path traversal detection with `..` and null bytes
    - _Requirements: 15.1, 15.6_

- [x] 3. Implement resolver and executor modules
  - [x] 3.1 Create resolver module (`src/resolver.ts`)
    - Implement resolveCommandCodePath: check COMMANDCODE_PATH env, then global npm path, then fallback
    - Implement checkCommandCodeAvailable: spawn `--version` with 10s timeout
    - Cache resolved path for reuse
    - _Requirements: 1.3, 1.4, 1.7, 13.1, 13.2, 13.5_

  - [x] 3.2 Create executor module (`src/executor.ts`)
    - Implement executeCommandCode function
    - Use AbortController + setTimeout for timeout management
    - On timeout: SIGTERM → wait 2s → SIGKILL → collect partial output (up to 10,000 chars)
    - Check COMMANDCODE_MOCK env var and delegate to mock executor if set
    - Use shell: true on Windows, shell: false on Unix
    - Always include `--skip-onboarding` in args
    - If options.stream is true and options.onChunk is provided, call onChunk with each stdout data event (debounced to 500ms)
    - Pass `--model` through to CLI unchanged when present in args
    - Return CommandCodeResult with timedOut flag and elapsedMs
    - _Requirements: 1.1, 1.2, 3.7, 3.8, 3.9, 10.1, 10.3, 15.4, 16.1, 16.2_

  - [x] 3.3 Create mock executor module (`src/mock.ts`)
    - Implement executeMock function
    - Return deterministic ToolResponse containing tool name and JSON-serialized parameters
    - No isError flag on mock responses
    - _Requirements: 15.4, 15.5_

  - [x] 3.4 Write property test for mock mode (Property 7)
    - **Property 7: Mock mode returns deterministic response containing tool name and parameters**
    - **Validates: Requirements 15.4, 15.5**

- [x] 4. Implement response formatting and queue modules
  - [x] 4.1 Create response formatter module (`src/response.ts`)
    - Implement formatSuccess: stdout → stderr → "(no output)" fallback, no isError
    - Implement formatError: prefix with "Command Code exited with code N", set isError: true
    - Implement formatTimeout: include elapsed time and partial output, set isError: true
    - Implement formatCombinedInfo: labeled "=== Info ===" and "=== Status ===" sections
    - Handle stderr concatenation with "STDERR:" prefix
    - _Requirements: 2.3, 2.4, 11.1, 11.2, 11.3, 11.4, 11.5, 8.1, 8.2, 8.3, 8.4_

  - [x] 4.2 Write property test for success response formatting (Property 4)
    - **Property 4: Success response formatting selects correct output**
    - **Validates: Requirements 2.3, 11.1**

  - [x] 4.3 Write property test for error response formatting (Property 5)
    - **Property 5: Error response formatting includes exit code and isError flag**
    - **Validates: Requirements 2.4, 11.2, 11.3, 11.4, 11.5**

  - [x] 4.4 Write property test for combined info formatting (Property 6)
    - **Property 6: Combined info formatting always includes labeled sections**
    - **Validates: Requirements 8.1, 8.2, 8.3, 8.4**

  - [x] 4.5 Create queue module (`src/queue.ts`)
    - Implement ContinueQueue class with bounded FIFO queue (max 10)
    - Implement enqueue method: accepts request, rejects if full, executes in FIFO order
    - Implement bypass mode: when queue parameter is false, execute immediately without entering queue
    - Return queue status (position, size) with each result
    - Reject overflow with error suggesting commandcode_query
    - _Requirements: 4.2, 4.3, 4.4, 4.5_

  - [x] 4.6 Write property test for queue serialization and overflow (Property 8)
    - **Property 8: Continue queue accepts up to max size, rejects overflow, and respects bypass**
    - **Validates: Requirements 4.2, 4.3, 4.5**

  - [x] 4.7 Create streaming module (`src/streaming.ts`)
    - Implement StreamingContext interface with sendProgress method
    - Implement createStreamingContext: creates context from McpServer and request ID
    - Debounce progress notifications to max one per 500ms (STREAM_CHUNK_INTERVAL_MS)
    - Include estimated progress percentage based on elapsed time vs timeout
    - Gracefully handle clients that don't support progress notifications (no error)
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6_

  - [x] 4.8 Write property test for streaming output (Property 10)
    - **Property 10: Streaming delivers progressive output without altering final result**
    - **Validates: Requirements 16.4, 16.5, 16.2**

- [x] 5. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Implement tool definitions
  - [x] 6.1 Create tool registration orchestrator (`src/tools/index.ts`)
    - Export a registerAllTools function that registers all 6 tools on the McpServer instance
    - _Requirements: 12.1, 12.5_

  - [ ] 6.2 Implement query tool (`src/tools/query.ts`)
    - Define Zod input schema: query, working_dir, plan_mode, context_dirs, model, stream, timeout_seconds
    - Validate all inputs using validation module
    - Build CLI args: `--skip-onboarding`, optional `--model`, optional `--plan`, optional `--add-dir` for each context_dir, `-p <query>`
    - If stream is true, create StreamingContext and pass onChunk callback to executor
    - Execute via executor, format response
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 12.2, 12.3, 16.1_

  - [ ] 6.3 Implement continue tool (`src/tools/continue.ts`)
    - Define Zod input schema: query, working_dir, model, stream, queue, timeout_seconds
    - Validate inputs, build args: `-c`, `--skip-onboarding`, optional `--model`, `-p <query>`
    - Use ContinueQueue for serialized execution (enqueue when queue=true, bypass when queue=false)
    - If stream is true, create StreamingContext and pass onChunk callback to executor
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 16.1_

  - [ ] 6.4 Implement resume tool (`src/tools/resume.ts`)
    - Define Zod input schema: session_name (optional), query, working_dir, model, stream, timeout_seconds
    - Validate session_name, build args: `--resume [name]`, `--skip-onboarding`, optional `--model`, `-p <query>`
    - If stream is true, create StreamingContext and pass onChunk callback to executor
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 16.1_

  - [ ] 6.5 Implement taste-learn tool (`src/tools/taste-learn.ts`)
    - Define Zod input schema: source, timeout_seconds
    - Validate source parameter, build args: `taste`, `learn`, `<source>`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [ ] 6.6 Implement taste tool (`src/tools/taste.ts`)
    - Define Zod input schema: timeout_seconds only
    - Build args: `taste`
    - _Requirements: 7.1, 7.2, 7.3_

  - [ ] 6.7 Implement info tool (`src/tools/info.ts`)
    - Define Zod input schema: timeout_seconds only
    - Execute both `info` and `status` commands sequentially
    - Use formatCombinedInfo for response
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [ ] 6.8 Write property test for CLI argument construction (Property 2)
    - **Property 2: CLI argument construction produces correct flags for all tools**
    - **Validates: Requirements 3.1, 3.5, 3.7, 3.9, 4.1, 4.8, 5.1, 5.5, 6.1**

  - [ ] 6.9 Write unit tests for argument construction per tool
    - Test query tool with all parameter combinations including model and stream
    - Test continue tool argument assembly including model, stream, and queue
    - Test resume tool with and without session_name, including model and stream
    - Test taste-learn tool argument assembly
    - _Requirements: 15.2_

- [ ] 7. Implement server entry point and wiring
  - [ ] 7.1 Create server module (`src/server.ts`)
    - Implement CommandCodeMcpServer class
    - Set up McpServer with name "commandcode-mcp" and version from package.json
    - Register all tools via tools/index.ts
    - Implement run(): connect StdioServerTransport, run async health check, log version
    - Implement shutdown(): graceful SIGINT/SIGTERM handling within 5 seconds
    - _Requirements: 2.1, 2.6, 2.7, 13.1, 13.2, 13.3, 13.4, 13.5_

  - [ ] 7.2 Rewrite entry point (`src/index.ts`)
    - Minimal file: shebang, import CommandCodeMcpServer, instantiate and run
    - Handle fatal errors with process.exit(1)
    - _Requirements: 14.4_

  - [ ] 7.3 Write property test for path separator normalization (Property 9)
    - **Property 9: Path separator normalization matches host OS**
    - **Validates: Requirements 1.6**

- [ ] 8. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The existing monolithic `src/index.ts` will be replaced incrementally — new modules are created first, then the entry point is rewritten last to wire everything together
- All CLI invocations must include `--skip-onboarding` to prevent interactive prompts

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "1.4"] },
    { "id": 1, "tasks": ["2.1", "3.1", "3.3"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4", "3.2", "3.4"] },
    { "id": 3, "tasks": ["4.1", "4.5", "4.7"] },
    { "id": 4, "tasks": ["4.2", "4.3", "4.4", "4.6", "4.8", "6.1"] },
    { "id": 5, "tasks": ["6.2", "6.3", "6.4", "6.5", "6.6", "6.7"] },
    { "id": 6, "tasks": ["6.8", "6.9"] },
    { "id": 7, "tasks": ["7.1", "7.2"] },
    { "id": 8, "tasks": ["7.3"] }
  ]
}
```
