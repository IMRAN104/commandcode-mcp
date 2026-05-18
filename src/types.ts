export interface CommandCodeResult {
  stdout: string;
  stderr: string;
  code: number | null;
  timedOut: boolean;
  elapsedMs: number;
}

export interface ExecutionOptions {
  args: string[];
  cwd?: string;
  timeoutSeconds: number;
  stream?: boolean;
  onChunk?: (chunk: string) => void;
}

export interface ToolResponse {
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

export interface QueueStatus {
  position: number;
  queueSize: number;
}
