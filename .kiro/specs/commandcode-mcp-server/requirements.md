# Requirements Document

## Introduction

CommandCode MCP Server v2.0 is a redesign of the existing MCP server that wraps the CommandCode.AI CLI to expose its codebase intelligence capabilities as MCP tools. The server enables AI agents (Claude Code, OpenCode, Cline CLI, Kiro CLI, and any MCP-compatible tool) to invoke CommandCode for deep file analysis, multi-file connection tracing, architecture understanding, and style-aware code generation — all without manual terminal interaction.

This redesign addresses issues in the current implementation: TypeScript type errors, tools that don't translate well to non-interactive MCP contexts, missing structured output, no progress reporting for long-running operations, and insufficient timeout handling. The new version follows May 2026 MCP SDK best practices and maximizes the value CommandCode provides to calling agents.

## Glossary

- **MCP_Server**: The Node.js process that implements the Model Context Protocol, communicates over stdio transport, and dispatches tool calls to the CommandCode CLI
- **Calling_Agent**: Any MCP-compatible AI tool (Claude Code, OpenCode, Cline CLI, Kiro CLI, etc.) that connects to the MCP_Server and invokes its tools
- **CommandCode_CLI**: The CommandCode command-line binary installed globally via `npm install -g command-code`
- **Tool**: An MCP tool definition registered with the server that a Calling_Agent can invoke
- **Session**: A persistent CommandCode conversation thread that maintains context across multiple queries
- **Taste_Profile**: CommandCode's learned coding style preferences derived from analyzing repositories
- **Stdio_Transport**: The MCP communication channel using standard input/output streams
- **Working_Directory**: The filesystem path where CommandCode executes, determining which codebase it analyzes
- **Structured_Output**: Tool responses formatted with typed sections (result text, metadata, error details) rather than raw CLI text
- **Progress_Notification**: An MCP protocol mechanism for delivering incremental updates to the Calling_Agent during long-running tool executions
- **Bounded_Queue**: A FIFO queue with a fixed maximum capacity (10 items) that serializes continue tool execution and rejects overflow requests
- **Model_Parameter**: An optional string parameter on query, continue, and resume tools that specifies which AI model CommandCode_CLI should use via the `--model` flag

## Requirements

### Requirement 1: Cross-Platform CLI Execution

**User Story:** As a developer using any operating system, I want the MCP server to correctly invoke the CommandCode CLI, so that I can use it on Windows, macOS, and Linux without platform-specific issues.

#### Acceptance Criteria

1. WHEN the MCP_Server spawns the CommandCode_CLI on Windows, THE MCP_Server SHALL use `cmd /c` shell execution and SHALL reject any argument containing shell metacharacters (`&`, `|`, `<`, `>`, `^`, `%`, `!`) by returning an error to the caller
2. WHEN the MCP_Server spawns the CommandCode_CLI on macOS or Linux, THE MCP_Server SHALL use direct process spawning without a shell intermediary
3. THE MCP_Server SHALL resolve the CommandCode_CLI binary path by checking the COMMANDCODE_PATH environment variable first, then falling back to PATH-based resolution
4. IF the CommandCode_CLI binary is not found at startup, THEN THE MCP_Server SHALL log a warning message to stderr that includes installation instructions and SHALL continue running without terminating the process
5. IF a tool is invoked and the CommandCode_CLI process fails to spawn, THEN THE MCP_Server SHALL return an error response to the caller indicating the CLI is unavailable
6. THE MCP_Server SHALL normalize file path separators in Working_Directory arguments to match the host operating system conventions (backslash on Windows, forward slash on macOS and Linux)
7. THE MCP_Server SHALL apply a timeout of no more than 10 seconds to the startup availability check for the CommandCode_CLI binary

### Requirement 2: MCP Protocol Compliance

**User Story:** As an MCP client developer, I want the server to follow the latest MCP SDK conventions, so that it integrates seamlessly with any MCP-compatible tool.

#### Acceptance Criteria

1. THE MCP_Server SHALL use the `@modelcontextprotocol/sdk` McpServer class with StdioServerTransport for communication
2. THE MCP_Server SHALL register each tool using a Zod schema that defines all accepted input parameters and their types for input validation
3. THE MCP_Server SHALL return tool results using the standard `{ content: [{ type: "text", text: string }] }` format for successful responses
4. IF a tool execution fails due to a runtime error, THEN THE MCP_Server SHALL return a response containing `isError: true` and a content array with a text entry describing the failure reason
5. IF a tool receives invalid input parameters, THEN THE MCP_Server SHALL throw an McpError with the appropriate ErrorCode (e.g., ErrorCode.InvalidParams) and a message identifying the invalid parameter
6. THE MCP_Server SHALL declare its name as "commandcode-mcp" and its version as the same literal string defined in the package.json `version` field in the server capabilities
7. WHEN the MCP_Server process receives a SIGINT or SIGTERM signal, THE MCP_Server SHALL close the McpServer instance and exit the process within 5 seconds without writing partial messages to the transport

### Requirement 3: Core Query Tool

**User Story:** As a Calling_Agent, I want to send one-shot queries to CommandCode about a codebase, so that I can get architecture explanations, code analysis, and generation suggestions inline.

#### Acceptance Criteria

1. WHEN a Calling_Agent invokes the query tool with a prompt string, THE MCP_Server SHALL execute `commandcode -p <query>` and return the CommandCode_CLI stdout as a text content block in the standard MCP response format
2. WHEN a Calling_Agent provides an optional working_dir parameter containing a valid absolute path to an existing directory, THE MCP_Server SHALL execute CommandCode_CLI with that directory as the working directory
3. IF a Calling_Agent provides a working_dir parameter that does not refer to an existing directory, THEN THE MCP_Server SHALL fall back to the server's current working directory for execution
4. WHEN a Calling_Agent provides an optional plan_mode flag set to true, THE MCP_Server SHALL pass the `--plan` flag to CommandCode_CLI
5. WHEN a Calling_Agent provides an optional context_dirs parameter (array of up to 10 absolute paths), THE MCP_Server SHALL pass each path via a separate `--add-dir` flag to CommandCode_CLI
6. IF a Calling_Agent provides a context_dirs entry that contains path traversal sequences or exceeds 4,096 characters, THEN THE MCP_Server SHALL reject the request with an InvalidParams error
7. THE MCP_Server SHALL pass `--skip-onboarding` to every CommandCode_CLI invocation initiated by the query tool to prevent interactive prompts from blocking automated execution
8. IF the CommandCode_CLI process exceeds the configured timeout, THEN THE MCP_Server SHALL terminate the process and return a timeout error response that includes any partial stdout and stderr collected before termination
9. WHEN a Calling_Agent provides an optional model parameter (string, max 100 characters), THE MCP_Server SHALL pass `--model <value>` to the CommandCode_CLI before the `-p` flag
10. WHEN a Calling_Agent provides an optional stream parameter set to true, THE MCP_Server SHALL deliver progressive output via MCP progress notifications as the CommandCode_CLI produces stdout

### Requirement 4: Session Continuation Tool

**User Story:** As a Calling_Agent, I want to continue a previous CommandCode conversation, so that I can build on prior context without re-explaining the codebase state.

#### Acceptance Criteria

1. WHEN a Calling_Agent invokes the continue tool with a query and an optional working_dir parameter, THE MCP_Server SHALL execute `commandcode -c --skip-onboarding -p <query>` in the specified working directory (or the default Working_Directory if none is provided) to continue the most recent session
2. THE MCP_Server SHALL maintain a bounded queue with a maximum of 10 pending continue requests to serialize execution and prevent session state corruption
3. WHEN a Calling_Agent provides the optional queue parameter set to true (the default), THE MCP_Server SHALL enqueue the request and execute it in FIFO order after all previously queued requests complete
4. WHEN a Calling_Agent provides the optional queue parameter set to false, THE MCP_Server SHALL bypass the queue and execute the request immediately without waiting for queued requests
5. IF a continue request arrives with queue set to true and the queue already contains 10 pending requests, THEN THE MCP_Server SHALL reject the request immediately with an error response suggesting the Calling_Agent use commandcode_query for a fresh session instead
6. IF no previous session exists, THEN THE MCP_Server SHALL return an error response with `isError: true` containing a message indicating no session is available to continue
7. IF the CommandCode_CLI process for a continue request exceeds the configured timeout, THEN THE MCP_Server SHALL terminate the process and return a timeout error with any partial output collected
8. WHEN a Calling_Agent provides an optional model parameter (string, max 100 characters), THE MCP_Server SHALL pass `--model <value>` to the CommandCode_CLI before the `-p` flag
9. WHEN a Calling_Agent provides an optional stream parameter set to true, THE MCP_Server SHALL deliver progressive output via MCP progress notifications as the CommandCode_CLI produces stdout

### Requirement 5: Session Resume Tool

**User Story:** As a Calling_Agent, I want to resume a specific named CommandCode session, so that I can return to a particular conversation thread by name.

#### Acceptance Criteria

1. WHEN a Calling_Agent invokes the resume tool with a session_name and a query, THE MCP_Server SHALL execute `commandcode --resume <session_name> --skip-onboarding -p <query>` with the follow-up query
2. WHEN a Calling_Agent invokes the resume tool without a session_name, THE MCP_Server SHALL execute `commandcode --resume` to list available sessions and return the list as text content
3. IF the specified session_name does not exist, THEN THE MCP_Server SHALL return an error response with `isError: true` containing the CommandCode_CLI error output
4. THE MCP_Server SHALL validate that session_name does not exceed 512 characters and does not contain path traversal sequences or null bytes
5. WHEN a Calling_Agent provides an optional model parameter (string, max 100 characters), THE MCP_Server SHALL pass `--model <value>` to the CommandCode_CLI before the `-p` flag
6. WHEN a Calling_Agent provides an optional stream parameter set to true, THE MCP_Server SHALL deliver progressive output via MCP progress notifications as the CommandCode_CLI produces stdout

### Requirement 6: Taste Learning Tool

**User Story:** As a Calling_Agent, I want to trigger CommandCode's taste learning on a repository, so that future code suggestions match the project's coding conventions.

#### Acceptance Criteria

1. WHEN a Calling_Agent invokes the taste_learn tool with a source parameter that is an absolute local directory path, THE MCP_Server SHALL execute `commandcode taste learn <path>`
2. WHEN a Calling_Agent invokes the taste_learn tool with a source parameter matching the GitHub repository reference format (a string containing exactly one forward slash with non-empty owner and repo segments, e.g. "owner/repo"), THE MCP_Server SHALL execute `commandcode taste learn <owner/repo>`
3. IF the source parameter is empty, exceeds 4,096 characters, or contains path traversal sequences (`..` or null bytes), THEN THE MCP_Server SHALL reject the request with an InvalidParams error indicating the validation failure reason
4. WHEN taste learning completes successfully (exit code 0), THE MCP_Server SHALL return the CommandCode_CLI stdout output as structured text content
5. IF the CommandCode_CLI process exits with a non-zero code during taste learning, THEN THE MCP_Server SHALL return an error response containing the CLI stderr or stdout output describing the failure

### Requirement 7: Taste Profile Management Tool

**User Story:** As a Calling_Agent, I want to view and manage CommandCode's learned taste profiles, so that I can understand what coding styles are active.

#### Acceptance Criteria

1. WHEN a Calling_Agent invokes the commandcode_taste tool, THE MCP_Server SHALL execute `commandcode taste` and return the list of learned taste profiles as a text content response in the standard MCP tool result format
2. IF the CommandCode_CLI execution of `commandcode taste` fails with a non-zero exit code or a spawn error, THEN THE MCP_Server SHALL return an error response containing the exit code and any stderr output from the process
3. IF no taste profiles have been learned, THEN THE MCP_Server SHALL return the CommandCode_CLI output as-is, indicating that no profiles are available

### Requirement 8: System Information Tool

**User Story:** As a Calling_Agent, I want to check CommandCode's version and configuration, so that I can verify the environment is correctly set up.

#### Acceptance Criteria

1. WHEN a Calling_Agent invokes the commandcode_info tool, THE MCP_Server SHALL execute both `commandcode info` and `commandcode status` sequentially and return the combined output as a single text content response
2. THE MCP_Server SHALL clearly label the info section and status section in the combined response with headers (e.g., "=== Info ===" and "=== Status ===")
3. IF either `commandcode info` or `commandcode status` fails with a non-zero exit code, THEN THE MCP_Server SHALL include the error output for the failed command while still returning any successful output from the other command
4. IF both commands fail, THEN THE MCP_Server SHALL return an error response with `isError: true` containing both error outputs

### Requirement 9: Input Validation and Security

**User Story:** As a system administrator, I want all tool inputs to be validated and sanitized, so that the MCP server cannot be exploited for command injection or path traversal attacks.

#### Acceptance Criteria

1. THE MCP_Server SHALL validate that query parameters are between 1 and 100,000 characters in length
2. THE MCP_Server SHALL validate that path parameters (working_dir, source, add_dir, and session_name) do not exceed 4,096 characters
3. THE MCP_Server SHALL reject path parameters containing path traversal sequences (`..` or null bytes)
4. WHILE running on Windows, THE MCP_Server SHALL reject all string parameters passed to the CLI containing shell metacharacters (`&`, `|`, `<`, `>`, `^`, `%`, `!`)
5. IF a working_dir parameter is provided, THEN THE MCP_Server SHALL validate that it is an absolute path
6. IF validation fails for any parameter, THEN THE MCP_Server SHALL return an InvalidParams error with a message identifying which parameter failed validation and the reason for rejection
7. THE MCP_Server SHALL perform all input validation checks before spawning any CommandCode_CLI process

### Requirement 10: Timeout and Process Management

**User Story:** As a Calling_Agent developer, I want predictable timeout behavior for long-running CommandCode operations, so that my agent doesn't hang indefinitely.

#### Acceptance Criteria

1. THE MCP_Server SHALL apply a default timeout of 300 seconds (5 minutes) to all CommandCode_CLI executions
2. WHEN a tool invocation includes an optional timeout_seconds parameter with a value between 1 and 900 (inclusive), THE MCP_Server SHALL use that value instead of the default
3. IF a CommandCode_CLI process exceeds its timeout, THEN THE MCP_Server SHALL terminate the process, collect up to 10,000 characters of partial stdout/stderr, and return a timeout error including the partial output and the elapsed time in seconds
4. IF a tool invocation includes a timeout_seconds parameter that exceeds 900 seconds, THEN THE MCP_Server SHALL silently cap the timeout at 900 seconds and proceed with execution
5. IF a tool invocation includes a timeout_seconds parameter that is less than 1 or is not a positive integer, THEN THE MCP_Server SHALL return an InvalidParams error indicating the timeout must be a positive integer between 1 and 900

### Requirement 11: Structured Tool Responses

**User Story:** As a Calling_Agent, I want tool responses to include structured metadata alongside the main output, so that I can programmatically determine success, timing, and context.

#### Acceptance Criteria

1. WHEN a tool execution completes with CommandCode_CLI exit code 0, THE MCP_Server SHALL return the response with content type "text" containing the CommandCode_CLI stdout, or stderr if stdout is empty, or the literal string "(no output)" if both are empty
2. WHEN a tool execution fails due to a CommandCode_CLI non-zero exit code, THE MCP_Server SHALL return the response with `isError: true` and content type "text" prefixed with "Command Code exited with code <N>" followed by the combined output
3. IF the CommandCode_CLI process cannot be spawned (binary not found, permission denied) or exceeds its timeout, THEN THE MCP_Server SHALL return the response with `isError: true` and content type "text" containing an error message indicating the failure reason (spawn failure or timeout) without an exit code prefix
4. WHEN the CommandCode_CLI process terminates with a non-zero exit code, THE MCP_Server SHALL include the numeric exit code in the first line of the error response text in the format "Command Code exited with code <N>"
5. IF the CommandCode_CLI produces both stdout and stderr output, THEN THE MCP_Server SHALL concatenate stdout followed by a line prefixed with "STDERR:" containing the stderr content in the response text

### Requirement 12: Tool Naming and Organization

**User Story:** As a Calling_Agent, I want a minimal, well-named set of tools that clearly communicate their purpose, so that tool selection is unambiguous.

#### Acceptance Criteria

1. THE MCP_Server SHALL expose no more than 7 tools to minimize cognitive load on Calling_Agents
2. THE MCP_Server SHALL use the naming pattern `commandcode_<action>` for all tool names, where `<action>` is a lowercase string containing only letters and underscores that identifies a single CommandCode_CLI capability (e.g., `commandcode_query`, `commandcode_continue`)
3. THE MCP_Server SHALL provide a tool description for each exposed tool that includes all of the following sections: (a) a summary of when to use the tool, (b) which CommandCode_CLI command it wraps, and (c) at least one example use case scenario
4. THE MCP_Server SHALL NOT expose tools that require waiting for user-initiated stdin input to complete execution, including tools that launch interactive prompts, editors, or selection menus (e.g., feedback submission, interactive resume without a query parameter)
5. WHEN multiple tools exist, THE MCP_Server SHALL ensure each tool maps to a distinct CommandCode_CLI command or flag combination with no overlapping functionality between tools

### Requirement 13: Startup and Health

**User Story:** As a system operator, I want the MCP server to verify its environment at startup and report readiness, so that I can diagnose configuration issues quickly.

#### Acceptance Criteria

1. WHEN the MCP_Server starts, THE MCP_Server SHALL verify that the CommandCode_CLI binary is reachable by executing its `--version` command with a timeout of 10 seconds
2. IF the CommandCode_CLI is not reachable at startup, THEN THE MCP_Server SHALL log a warning message to stderr indicating the binary was not found and suggesting installation steps, but SHALL continue running and accept tool invocations
3. WHEN the MCP_Server completes startup successfully, THE MCP_Server SHALL log its own semantic version (matching package.json) and the transport type (e.g., "stdio") to stderr
4. IF the MCP SDK transport fails to initialize, THEN THE MCP_Server SHALL exit with a non-zero exit code
5. THE MCP_Server SHALL perform the CommandCode_CLI reachability check asynchronously so that tool registration and transport initialization are not delayed by the check

### Requirement 14: Dependency Management

**User Story:** As a developer building or installing the MCP server, I want all runtime dependencies explicitly declared, so that the package installs and runs without missing module errors.

#### Acceptance Criteria

1. THE MCP_Server package SHALL declare `zod` as a runtime dependency in the `dependencies` field of package.json since it is directly imported for input schema validation
2. THE MCP_Server package SHALL declare `@modelcontextprotocol/sdk` as a runtime dependency using a tilde version range (e.g., `~major.minor.patch`) to pin the minor version while allowing patch updates
3. THE MCP_Server package SHALL require Node.js >= 18 in the engines field
4. THE MCP_Server package SHALL define a `bin` entry mapping `commandcode-mcp` to the built entry point, and the entry point file SHALL include a Node.js shebang line (`#!/usr/bin/env node`), so that the package is executable via `npx commandcode-mcp` after installation
5. WHEN a user runs `npm install` in a clean environment with only the published package, THEN THE MCP_Server SHALL resolve all runtime imports without producing missing module errors

### Requirement 15: Testing Strategy

**User Story:** As a developer maintaining the MCP server, I want a clear testing approach, so that I can verify the server works correctly without requiring a live CommandCode subscription.

#### Acceptance Criteria

1. THE MCP_Server project SHALL include unit tests for input validation functions covering: path traversal detection (including ".." sequences and null bytes), shell metacharacter detection (for both Windows and Unix paths), and length validation against the defined maximum limits (100,000 characters for queries, 4,096 characters for paths, 512 characters for session names)
2. THE MCP_Server project SHALL include unit tests for CLI argument construction logic, verifying that correct flags are assembled for each of the registered tools, with at least one test case per tool covering the expected argument order and optional parameter inclusion
3. THE MCP_Server project SHALL include integration test documentation describing manual testing procedures with at least one MCP client (such as Claude Code), covering tool discovery, a successful query round-trip, and an error scenario
4. IF the COMMANDCODE_MOCK environment variable is set to "true", THEN THE MCP_Server SHALL bypass process spawning and return predefined JSON responses containing a content array with a text entry, for all registered tools
5. IF the COMMANDCODE_MOCK environment variable is set to "true" and a tool is invoked, THEN THE MCP_Server SHALL return a success response with a deterministic text body that includes the tool name and received parameters, enabling assertion-based automated testing without a live CLI
6. THE MCP_Server project SHALL include at least one unit test per validation function that exercises the boundary at the maximum allowed length (accepting input at the limit and rejecting input exceeding it by one character)

### Requirement 16: Progressive Output Streaming

**User Story:** As a Calling_Agent, I want to receive progressive output from long-running CommandCode operations, so that I can display partial results to the user while waiting for the full response.

#### Acceptance Criteria

1. WHEN a Calling_Agent provides an optional stream parameter set to true on the query, continue, or resume tools, THE MCP_Server SHALL deliver progressive stdout output via MCP progress notifications as the CommandCode_CLI produces it
2. THE MCP_Server SHALL debounce progress notifications to a maximum of one notification per 500 milliseconds to avoid flooding the transport
3. IF the Calling_Agent's MCP client does not support progress notifications, THEN THE MCP_Server SHALL silently skip notification delivery without returning an error or altering the final response
4. WHEN streaming is enabled and the CommandCode_CLI completes execution, THE MCP_Server SHALL return the complete final response identical to what would be returned with stream set to false
5. WHEN streaming is enabled and the CommandCode_CLI produces stdout before completion, THE MCP_Server SHALL emit at least one progress notification containing the partial output
6. THE MCP_Server SHALL include an estimated progress percentage in each progress notification based on elapsed time relative to the configured timeout
