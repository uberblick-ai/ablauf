// A static server for `mise run demo`, because ESM imports do not load over
// `file://` and the demo imports `../dist/`. Node stdlib only — this repo does
// not take a dependency to hand a local browser a file.
//
// It serves the whole repo to whoever can reach it, so it binds loopback only,
// and it answers with a file's *real* path: a symlink under the repo may not
// be a way out of it.
import { createReadStream, realpathSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = realpathSync(fileURLToPath(new URL("../", import.meta.url)));
const INSIDE = ROOT.endsWith(sep) ? ROOT : ROOT + sep;
const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT ?? 8173);
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".mmd": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
};

createServer((req, res) => {
  try {
    // Inside the `try`: `/%` is a malformed escape, and `decodeURIComponent`
    // answers it with a `URIError` — a bad request, not a dead server.
    const url = decodeURIComponent((req.url ?? "/").split("?")[0]);
    let target = join(ROOT, normalize(url));
    if (statSync(target).isDirectory()) {
      // Without the trailing slash the page's own `./demo.js` resolves against
      // the parent, and the demo comes up blank rather than wrong.
      if (!url.endsWith("/")) {
        res.writeHead(302, { location: `${url}/` });
        return res.end();
      }
      target = join(target, "index.html");
    }
    // The real path, not the joined string: `..` is already gone by here, but
    // a symlink is not, and only the resolved one is a claim about the file.
    const path = realpathSync(target);
    if (!path.startsWith(INSIDE)) throw new Error("outside root");
    res.writeHead(200, { "content-type": TYPES[extname(path)] ?? "application/octet-stream" });
    createReadStream(path).pipe(res);
  } catch (err) {
    const bad = err instanceof URIError;
    res.writeHead(bad ? 400 : 404, { "content-type": "text/plain; charset=utf-8" });
    res.end(bad ? "bad request\n" : "not found\n");
  }
}).listen(PORT, HOST, () => console.log(`ablauf demo: http://${HOST}:${PORT}/demo/`));
