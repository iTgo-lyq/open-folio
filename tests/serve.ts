import { spawn } from "node:child_process";
import { writeFile, unlink, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { seed } from "./seed.ts";
import { hostedServer } from "./hosted-server.ts";
const f = await seed(),
  config = join(f.root, "config.json");
const host = await hostedServer(f.root);
await writeFile(
  config,
  JSON.stringify({
    schemaVersion: 1,
    projects: [{ ...f.project, inviteCode: "fixture-invitation" }],
  }),
);
await mkdir("artifacts", { recursive: true });
await writeFile(
  "artifacts/e2e-runtime.json",
  JSON.stringify({ config, root: f.root }),
);
await unlink(join(f.root, "cache", "writer.lock"));
const child = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "dev",
    "--hostname",
    "127.0.0.1",
    "--port",
    "10682",
  ],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      OPENFOLIO_ADMIN_PASSWORD: "fixture-admin-password",
      OPENFOLIO_CONFIG: config,
      OPENFOLIO_DATA_DIR: join(f.root, "cache"),
      OPENFOLIO_BUILD_DIR: ".next-e2e",
    },
  },
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    child.kill(signal);
  });
child.on("exit", async (code) => {
  host.close();
  await f.cleanup();
  process.exit(code ?? 0);
});
