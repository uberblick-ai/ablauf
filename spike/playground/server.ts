// The playground: edit a flow beside its render and problems. A development
// tool for people; agents use check.ts. Serves the renderer's own TypeScript,
// type-stripped per request, so nothing needs a build or an install.
//
//   node playground/server.ts      then open the printed URL
//
// Listens on localhost only. Writes nothing but existing or new .flow files in
// examples/ and trials/, and only for requests from its own page.

import { closeSync, constants, lstatSync, openSync, readFileSync, realpathSync, writeSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { stripTypeScriptTypes } from "node:module";
import { join, normalize, sep } from "node:path";
import { catalog, FOLDERS } from "./catalog.ts";

process.removeAllListeners("warning"); // stripTypeScriptTypes is marked experimental
const ROOT = join(import.meta.dirname, "..");
const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PORT = Number(process.env.PORT ?? 4620);

function send(res: ServerResponse, status: number, type: string, body: string) {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  res.end(body);
}

// A flow's file, only inside the real examples/ or trials/ folder and never
// through a symlink, so a link can't send reads or writes elsewhere.
function flowPath(folder: string, name: string): string | null {
  if (!FOLDERS.includes(folder) || !NAME.test(name)) return null;
  const dir = join(ROOT, folder);
  if (realpathSync(dir) !== join(realpathSync(ROOT), folder)) return null;
  const file = join(dir, `${name}.flow`);
  try {
    if (lstatSync(file).isSymbolicLink()) return null;
  } catch {
    // a new file
  }
  return file.startsWith(dir + sep) ? file : null;
}

async function body(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > 200_000) throw new Error("too large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8"); // decoded once, so no character splits
}

function write(file: string, text: string) {
  const fd = openSync(file, constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW);
  try {
    writeSync(fd, text);
  } finally {
    closeSync(fd);
  }
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    const path = url.pathname;
    if (req.method === "GET" && path === "/") return send(res, 200, "text/html; charset=utf-8", readFileSync(join(import.meta.dirname, "index.html"), "utf8"));
    if (req.method === "GET" && path === "/playground.css") return send(res, 200, "text/css; charset=utf-8", readFileSync(join(import.meta.dirname, "playground.css"), "utf8"));
    if (req.method === "GET" && path === "/api/catalog") return send(res, 200, "application/json", JSON.stringify(catalog(ROOT)));
    if (req.method === "GET" && path === "/reference/loop.svg") return send(res, 200, "image/svg+xml", readFileSync(join(ROOT, "reference", "loop.svg"), "utf8"));
    // The renderer and the page script, as JavaScript.
    if (req.method === "GET" && /^\/(flow\/[a-z]+|playground\/app)\.ts$/.test(path)) {
      const file = normalize(join(ROOT, path));
      return send(res, 200, "text/javascript; charset=utf-8", stripTypeScriptTypes(readFileSync(file, "utf8")));
    }
    const m = /^\/api\/flow\/([a-z]+)\/([a-z0-9-]+)$/.exec(path);
    const file = m ? flowPath(m[1], m[2]) : null;
    if (m && !file) return send(res, 400, "text/plain", "bad name");
    if (file && req.method === "GET") return send(res, 200, "text/plain; charset=utf-8", readFileSync(file, "utf8"));
    if (file && req.method === "PUT") {
      if (req.headers.origin !== `http://localhost:${port()}` && req.headers.origin !== `http://127.0.0.1:${port()}`) {
        return send(res, 403, "text/plain", "writes must come from the playground page");
      }
      write(file, await body(req));
      return send(res, 200, "text/plain", "saved");
    }
    send(res, 404, "text/plain", "not found");
  } catch (error) {
    send(res, 500, "text/plain", error instanceof Error ? error.message : String(error));
  }
});

const port = () => {
  const address = server.address();
  return typeof address === "object" && address ? address.port : PORT;
};

server.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") server.listen(0, "127.0.0.1");
  else throw error;
});
server.listen(PORT, "127.0.0.1", () => console.log(`ablauf playground: http://localhost:${port()}/`));
