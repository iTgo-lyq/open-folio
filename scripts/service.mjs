import { spawn, spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile, unlink, open } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { connect } from "node:net";
import { setTimeout as sleep } from "node:timers/promises";
import nextEnv from "@next/env";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
process.env.NODE_ENV = "production";
nextEnv.loadEnvConfig(root, false);
process.env.OPENFOLIO_BUILD_DIR = ".next";
const port = Number(process.env.OPENFOLIO_SERVICE_PORT || 10680);
const host = process.env.OPENFOLIO_SERVICE_HOST || "::";
const session = process.env.OPENFOLIO_SERVICE_SESSION || "openfolio-preview";
if (
  !Number.isInteger(port) ||
  port < 1 ||
  port > 65535 ||
  !/^[\w-]+$/.test(session)
)
  throw Error("Invalid service port or tmux session");
const directory = join(root, ".openfolio");
const runtimePath = join(directory, "runtime-version.json");
const buildPath = join(directory, "build-version.json");
const next = join(root, "node_modules/next/dist/bin/next");
const json = async (path) =>
  JSON.parse(
    await readFile(path, "utf8").catch((e) => {
      if (e.code === "ENOENT") return "null";
      throw e;
    }),
  );
const save = (path, value) =>
  writeFile(path, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
const tmux = (...args) => {
  const result = spawnSync("tmux", args, { encoding: "utf8" });
  if (result.error) throw result.error;
  return result;
};
const exists = (name = session) =>
  tmux("has-session", "-t", `=${name}`).status === 0;
const owned = (info) => info?.root === root && info.session === session;
function listening(p = port, h = host) {
  return new Promise((resolve) => {
    const socket = connect({
      port: p,
      host: h === "::" ? "::1" : h === "0.0.0.0" ? "127.0.0.1" : h,
    });
    const finish = (value) => {
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(500);
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.once("timeout", () => finish(false));
  });
}
async function waitFor(check, message) {
  for (let n = 0; n < 120; n++) {
    if (await check()) return;
    await sleep(250);
  }
  throw Error(message);
}
async function status() {
  const info = await json(runtimePath),
    active = exists();
  const ready =
    active && owned(info) && (await listening(info.port, info.host));
  console.log(
    JSON.stringify(
      {
        state: active
          ? owned(info)
            ? ready
              ? "running"
              : "starting"
            : "unmanaged"
          : "stopped",
        ...info,
        configuredPort: port,
      },
      null,
      2,
    ),
  );
}
async function stop() {
  const info = await json(runtimePath);
  if (info?.root === root && info.session !== session && exists(info.session))
    throw Error("Stop the existing service before changing its session");
  if (!exists()) return;
  if (!owned(info))
    throw Error("tmux session is not managed by this project script");
  const pane = tmux("list-panes", "-a", "-F", "#{session_name} #{pane_pid}")
    .stdout.split("\n")
    .some((line) => line === `${session} ${info.pid}`);
  if (!pane) throw Error("Service supervisor does not match the tmux session");
  process.kill(info.pid, "SIGTERM");
  await waitFor(async () => {
    try {
      process.kill(info.pid, 0);
      return false;
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
    return !(await listening(info.port, info.host));
  }, "Service did not stop; build was not started");
  if (exists()) tmux("kill-session", "-t", `=${session}`);
}
async function start() {
  if (exists()) {
    if (!owned(await json(runtimePath)))
      throw Error("tmux session is already occupied");
  } else {
    const prior = await json(runtimePath);
    if (
      prior?.root === root &&
      prior.session !== session &&
      exists(prior.session)
    )
      throw Error("Stop the existing service before changing its session");
    if (await listening())
      throw Error(
        "Service port is occupied; existing process was left untouched",
      );
    await readFile(join(root, ".next/BUILD_ID"));
    const quote = (value) => "'" + value.replaceAll("'", "'\\''") + "'";
    const environment = [
      "OPENFOLIO_SERVICE_PORT",
      "OPENFOLIO_SERVICE_HOST",
      "OPENFOLIO_SERVICE_SESSION",
      "OPENFOLIO_DATA_DIR",
      "OPENFOLIO_CONFIG",
      "OPENFOLIO_CREDENTIAL_KEY_FILE",
    ]
      .filter((key) => process.env[key])
      .flatMap((key) => ["-e", `${key}=${process.env[key]}`]);
    const result = tmux(
      "new-session",
      "-d",
      "-s",
      session,
      "-c",
      root,
      ...environment,
      `exec ${quote(process.execPath)} ${quote(fileURLToPath(import.meta.url))} run`,
    );
    if (result.status) throw Error("Could not start tmux service");
  }
  await waitFor(
    async () => exists() && (await listening()),
    "Service did not become ready; inspect .openfolio/service.log",
  );
}
async function update() {
  await stop();
  if (await listening())
    throw Error("Service port is occupied; build was not started");
  const result = spawnSync(process.execPath, [next, "build"], {
    cwd: root,
    env: process.env,
    stdio: "inherit",
  });
  if (result.error || result.status !== 0)
    throw Error(
      "Build failed; service remains stopped, runtime data was preserved",
    );
  const commit =
    spawnSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    }).stdout.trim() || null;
  await save(buildPath, {
    commit,
    dirty:
      !!commit &&
      spawnSync("git", ["diff", "--quiet", "HEAD"], { cwd: root }).status !== 0,
    buildId: (await readFile(join(root, ".next/BUILD_ID"), "utf8")).trim(),
  });
  await start();
}
async function run() {
  const built = await json(buildPath),
    buildId = (await readFile(join(root, ".next/BUILD_ID"), "utf8")).trim();
  await save(runtimePath, {
    ...(built?.buildId === buildId ? built : { commit: null, buildId }),
    root,
    session,
    port,
    host,
    pid: process.pid,
  });
  const log = await open(join(directory, "service.log"), "a", 0o600);
  let stopping = false,
    child;
  const shutdown = () => {
    stopping = true;
    child?.kill("SIGTERM");
  };
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"])
    process.on(signal, shutdown);
  try {
    while (!stopping) {
      child = spawn(
        process.execPath,
        [next, "start", "--hostname", host, "--port", String(port)],
        { cwd: root, env: process.env, stdio: ["ignore", log.fd, log.fd] },
      );
      await new Promise((resolve, reject) => {
        child.once("exit", resolve);
        child.once("error", reject);
      });
      child = undefined;
      if (!stopping) await sleep(2000);
    }
  } finally {
    await log.close();
  }
}
async function locked(action) {
  const path = join(directory, "service.lock");
  let file;
  try {
    file = await open(path, "wx", 0o600);
  } catch (e) {
    if (e.code !== "EEXIST") throw e;
    const pid = Number(await readFile(path, "utf8"));
    if (!Number.isSafeInteger(pid) || pid <= 0)
      throw Error("Invalid service lock; inspect it before retrying");
    try {
      process.kill(pid, 0);
      throw Error("Another service operation is running");
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
    await unlink(path);
    file = await open(path, "wx", 0o600);
  }
  try {
    await file.writeFile(String(process.pid));
    await action();
  } finally {
    await file.close();
    await unlink(path);
  }
}
try {
  const command = process.argv[2];
  if (
    !["start", "stop", "status", "update", "run"].includes(command) ||
    process.argv.length !== 3
  )
    throw Error("Usage: node scripts/service.mjs <start|stop|status|update>");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  if (command === "run") await run();
  else if (command === "status") await status();
  else {
    await locked({ start, stop, update }[command]);
    await status();
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
