import "dotenv/config";
import { spawn, type ChildProcess } from "child_process";
import { PORT, BASE_URL } from "./config";

const READY_TIMEOUT_MS = 60_000;

let server: ChildProcess | null = null;

async function waitForServer(): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < READY_TIMEOUT_MS) {
    try {
      const res = await fetch(`${BASE_URL}/api/health`);
      if (res.status === 200 || res.status === 503) return; // server is up, DB may or may not be
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("Dev server did not become ready in time for integration tests.");
}

export async function setup() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is not set. Integration tests require a real Postgres instance " +
        "(e.g. `npx prisma dev --detach`) — see TEST_PLAN.md."
    );
  }

  server = spawn("npx", ["next", "dev", "--port", String(PORT)], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "pipe",
    shell: true,
  });

  await waitForServer();
}

export async function teardown() {
  if (!server || !server.pid) return;

  // `shell: true` spawns an intermediate shell process, so a plain process.kill()
  // only kills the shell, not the actual `next dev` (and its own child) it started.
  // taskkill /T kills the whole tree; this is Windows-specific but this project's
  // dev environment is Windows, and it's harmless to attempt on any platform where
  // it's unavailable (the catch just swallows it).
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    try {
      process.kill(-server.pid, "SIGTERM");
    } catch {
      // already gone
    }
  }
}

export { BASE_URL };
