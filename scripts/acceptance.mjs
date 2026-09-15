import { spawn } from "node:child_process";
import { access, mkdir, mkdtemp } from "node:fs/promises";
import { connect } from "node:net";
import { resolve } from "node:path";

// Each invocation starts its own local D1 database. Never uses deployed resources.
const port = 8789;
const baseUrl = `http://127.0.0.1:${port}`;
const wrangler = resolve("node_modules/wrangler/bin/wrangler.js");
const env = { ...process.env, CI: "true", WRANGLER_SEND_METRICS: "false" };
await access(resolve("dist/index.html")).catch(() => {
  throw new Error("Build the application with npm run build before running acceptance.");
});
const occupied = await new Promise((resolvePort) => {
  const socket = connect({ host: "127.0.0.1", port });
  socket.once("connect", () => { socket.destroy(); resolvePort(true); });
  socket.once("error", () => resolvePort(false));
});
if (occupied) throw new Error(`Port ${port} is already in use. Stop that server before running acceptance.`);
await mkdir(resolve(".wrangler/state"), { recursive: true });
const persistence = await mkdtemp(resolve(".wrangler/state/acceptance-"));

function run(script, args, options = {}) {
  const child = spawn(process.execPath, [script, ...args], {
    stdio: "inherit", windowsHide: true, env, ...options,
  });
  return new Promise((resolveRun, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolveRun() : reject(new Error(`${script} exited with ${code}`)));
  });
}

await run(wrangler, ["d1", "migrations", "apply", "clankerfaker-replays", "--local", "--persist-to", persistence]);
const server = spawn(process.execPath, [wrangler, "pages", "dev", "dist", "--ip", "127.0.0.1", "--port", String(port),
  "--inspector-port", "0", "--persist-to", persistence, "--show-interactive-dev-session=false"], {
  stdio: "inherit", windowsHide: true, env,
});
let serverFailure;
server.once("error", (error) => { serverFailure = error; });
server.once("exit", (code) => { serverFailure = new Error(`Local Pages server exited with ${code}.`); });
let stopping;
const stop = () => stopping ??= new Promise((done) => {
  if (process.platform === "win32" && server.pid && server.exitCode == null) {
    // Wrangler starts child processes; terminate only this runner's process tree.
    const terminator = spawn("taskkill", ["/pid", String(server.pid), "/t", "/f"], {
      stdio: "ignore", windowsHide: true,
    });
    terminator.once("exit", done);
    terminator.once("error", () => { server.kill(); done(); });
  } else {
    server.kill();
    done();
  }
});
process.once("SIGINT", async () => { await stop(); process.exit(130); });
process.once("SIGTERM", async () => { await stop(); process.exit(143); });
try {
  const deadline = Date.now() + 30_000;
  while (true) {
    if (serverFailure) throw serverFailure;
    try {
      const response = await fetch(`${baseUrl}/api/leaderboard`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) break;
    } catch {}
    if (Date.now() > deadline) throw new Error("Local Pages server did not become ready.");
    await new Promise((ready) => setTimeout(ready, 200));
  }
  await run(resolve("node_modules/vitest/vitest.mjs"), ["run", "--config", "tests/acceptance/vitest.config.ts"], {
    env: { ...env, ACCEPTANCE_BASE_URL: baseUrl },
  });
  console.log(`Acceptance passed. Local report: .wrangler/acceptance/report.json\nDatabase: ${persistence}`);
  if (process.argv.includes("--keep-server")) {
    console.log(`Keeping ${baseUrl} available for browser verification. Press Ctrl+C when finished.`);
    await new Promise((done) => server.once("exit", done));
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await stop();
}
