// Local dev entrypoint: loads .env.dev into process.env, then runs `next dev`.
//
// Why not `node --env-file=.env.dev .../next dev`? Next forwards the parent's
// execArgv to its child processes via NODE_OPTIONS, and Node rejects
// --env-file inside NODE_OPTIONS, crashing the dev server. Loading the file
// here sets real environment variables, which children inherit normally.
const path = require("node:path");
const { spawn } = require("node:child_process");

const envPath = path.join(__dirname, "..", ".env.dev");
try {
  process.loadEnvFile(envPath);
} catch {
  console.warn(`[dev] ${envPath} not found — continuing without it (email and other env-dependent features may not work).`);
}

const nextBin = path.join(__dirname, "..", "node_modules", "next", "dist", "bin", "next");
const child = spawn(process.execPath, [nextBin, "dev", ...process.argv.slice(2)], { stdio: "inherit" });

child.on("exit", (code) => process.exit(code ?? 0));
