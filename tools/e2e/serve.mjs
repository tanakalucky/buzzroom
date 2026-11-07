import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const state = await mkdtemp(join(tmpdir(), "buzzroom-ui-e2e-"));
const server = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "preview",
    "--host",
    "127.0.0.1",
    "--port",
    "4173",
    "--strictPort",
  ],
  { stdio: "inherit", env: { ...process.env, BUZZROOM_TEST_STATE: state } },
);
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.kill(signal));
server.once("exit", async (code) => {
  await rm(state, { recursive: true, force: true });
  process.exit(code ?? 1);
});
