import { createServer } from "node:https";
import { spawn, execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { fixture } from "./fixture.ts";
export async function gitHttpsFixture() {
  const f = await fixture();
  const cert = join(f.root, "cert.pem"),
    key = join(f.root, "key.pem");
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      key,
      "-out",
      cert,
      "-days",
      "1",
      "-subj",
      "/CN=127.0.0.1",
      "-addext",
      "subjectAltName=IP:127.0.0.1",
    ],
    { stdio: "ignore" },
  );
  const allowed = new Set(["reader:token-a", "reader:token-b"]),
    attempts: string[] = [];
  const server = createServer(
    { cert: await readFile(cert), key: await readFile(key) },
    async (req, res) => {
      const auth = Buffer.from(
        (req.headers.authorization || "").replace(/^Basic /, ""),
        "base64",
      ).toString();
      attempts.push(auth);
      if (!allowed.has(auth)) {
        res.writeHead(401, { "WWW-Authenticate": 'Basic realm="fixture"' });
        res.end();
        return;
      }
      const url = new URL(req.url!, "https://127.0.0.1");
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      let body = Buffer.concat(chunks);
      if (req.headers["content-encoding"] === "gzip") body = gunzipSync(body);
      const child = spawn("git", ["http-backend"], {
        env: {
          NODE_ENV: "test",
          PATH: process.env.PATH,
          GIT_PROJECT_ROOT: f.root,
          GIT_HTTP_EXPORT_ALL: "1",
          PATH_INFO: url.pathname,
          QUERY_STRING: url.search.slice(1),
          REQUEST_METHOD: req.method,
          CONTENT_TYPE: req.headers["content-type"],
          CONTENT_LENGTH: String(body.length),
          REMOTE_USER: "reader",
          GIT_CONFIG_NOSYSTEM: "1",
          GIT_CONFIG_GLOBAL: "/dev/null",
        },
      });
      const output: Buffer[] = [];
      child.stdout.on("data", (b) => output.push(b));
      child.stderr.resume();
      child.stdin.end(body);
      child.on("close", () => {
        const result = Buffer.concat(output);
        const split = result.indexOf("\r\n\r\n");
        if (split < 0) {
          res.writeHead(500);
          res.end();
          return;
        }
        let status = 200;
        const headers: Record<string, string> = {};
        for (const line of result.subarray(0, split).toString().split("\r\n")) {
          const colon = line.indexOf(":");
          const name = line.slice(0, colon);
          const value = line.slice(colon + 1).trim();
          if (name.toLowerCase() === "status") status = parseInt(value);
          else headers[name] = value;
        }
        res.writeHead(status, headers);
        res.end(result.subarray(split + 4));
      });
    },
  );
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error();
  return {
    ...f,
    cert,
    allowed,
    attempts,
    url: `https://127.0.0.1:${address.port}/remote.git`,
    cleanup: async () => {
      server.closeAllConnections();
      await new Promise<void>((r) => server.close(() => r()));
      await f.cleanup();
    },
  };
}
