/**
 * Full live test of all 6 MCP tools with the real CommandCode CLI.
 */
import { spawn } from "child_process";

const server = spawn("node", ["build/index.js"], {
  env: { ...process.env, COMMANDCODE_MOCK: undefined },
  stdio: ["pipe", "pipe", "pipe"],
});

let buffer = "";
const responses = new Map();

server.stdout.on("data", (data) => {
  buffer += data.toString();
  const lines = buffer.split("\n");
  buffer = lines.pop() || "";
  for (const line of lines) {
    if (line.trim()) {
      try { responses.set(JSON.parse(line.trim()).id, JSON.parse(line.trim())); } catch {}
    }
  }
});

server.stderr.on("data", (data) => {
  const t = data.toString().trim();
  if (t && !t.includes("DEP0190")) process.stderr.write(`[server] ${t}\n`);
});

function send(msg) { server.stdin.write(JSON.stringify(msg) + "\n"); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function waitFor(id, maxMs = 60000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const check = () => {
      if (responses.has(id)) return resolve(responses.get(id));
      if (Date.now() - start > maxMs) return resolve(null);
      setTimeout(check, 500);
    };
    check();
  });
}

async function run() {
  // Initialize
  send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "kiro-full-test", version: "1.0.0" } } });
  await waitFor(1, 5000);
  send({ jsonrpc: "2.0", method: "notifications/initialized", params: {} });
  await sleep(500);

  const results = [];

  // 1. commandcode_info
  console.log("\n[1/6] commandcode_info...");
  send({ jsonrpc: "2.0", id: 10, method: "tools/call", params: { name: "commandcode_info", arguments: { timeout_seconds: 20 } } });
  const r1 = await waitFor(10, 25000);
  results.push({ name: "commandcode_info", resp: r1 });

  // 2. commandcode_taste
  console.log("[2/6] commandcode_taste...");
  send({ jsonrpc: "2.0", id: 11, method: "tools/call", params: { name: "commandcode_taste", arguments: { timeout_seconds: 20 } } });
  const r2 = await waitFor(11, 25000);
  results.push({ name: "commandcode_taste", resp: r2 });

  // 3. commandcode_query (simple short query)
  console.log("[3/6] commandcode_query...");
  send({ jsonrpc: "2.0", id: 12, method: "tools/call", params: { name: "commandcode_query", arguments: { query: "what is the main entry point file?", working_dir: "C:\\Users\\Imran\\Documents\\Cline\\MCP\\cmc-server", timeout_seconds: 90 } } });
  const r3 = await waitFor(12, 95000);
  results.push({ name: "commandcode_query", resp: r3 });

  // 4. commandcode_continue
  console.log("[4/6] commandcode_continue...");
  send({ jsonrpc: "2.0", id: 13, method: "tools/call", params: { name: "commandcode_continue", arguments: { query: "what does it export?", working_dir: "C:\\Users\\Imran\\Documents\\Cline\\MCP\\cmc-server", queue: true, timeout_seconds: 90 } } });
  const r4 = await waitFor(13, 95000);
  results.push({ name: "commandcode_continue", resp: r4 });

  // 5. commandcode_resume (without session name — should list sessions or error)
  console.log("[5/6] commandcode_resume...");
  send({ jsonrpc: "2.0", id: 14, method: "tools/call", params: { name: "commandcode_resume", arguments: { query: "hello", timeout_seconds: 20 } } });
  const r5 = await waitFor(14, 25000);
  results.push({ name: "commandcode_resume", resp: r5 });

  // 6. commandcode_taste_learn
  console.log("[6/6] commandcode_taste_learn...");
  send({ jsonrpc: "2.0", id: 15, method: "tools/call", params: { name: "commandcode_taste_learn", arguments: { source: "C:\\Users\\Imran\\Documents\\Cline\\MCP\\cmc-server", timeout_seconds: 30 } } });
  const r6 = await waitFor(15, 35000);
  results.push({ name: "commandcode_taste_learn", resp: r6 });

  // Print results
  console.log("\n" + "=".repeat(70));
  console.log("FULL LIVE TEST RESULTS — ALL 6 TOOLS");
  console.log("=".repeat(70));

  const init = responses.get(1);
  if (init?.result) {
    console.log(`\n✓ Server initialized: ${init.result.serverInfo?.name} v${init.result.serverInfo?.version}`);
  }

  let passed = 0;
  let failed = 0;

  for (const { name, resp } of results) {
    if (!resp) {
      console.log(`\n✗ ${name}: NO RESPONSE (timeout)`);
      failed++;
      continue;
    }
    if (resp.error) {
      console.log(`\n✗ ${name}: PROTOCOL ERROR [${resp.error.code}] ${resp.error.message}`);
      failed++;
      continue;
    }
    const text = resp.result?.content?.[0]?.text || "(empty)";
    const isErr = resp.result?.isError || false;
    // A tool that returns isError is still "working" — it means the CLI ran and returned an error
    const symbol = isErr ? "⚠" : "✓";
    console.log(`\n${symbol} ${name} (isError=${isErr}):`);
    console.log(`  ${text.substring(0, 400).replace(/\n/g, "\n  ")}`);
    passed++;
  }

  console.log("\n" + "=".repeat(70));
  console.log(`Results: ${passed} tools responded, ${failed} failed to respond`);
  console.log("=".repeat(70));

  server.kill();
  process.exit(0);
}

run();
