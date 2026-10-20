// Serves site/out the way Cloudflare Pages does, for a local look:
// /<path> from <path>.html, unknown paths from 404.html.
//
//     node site/serve.ts [port]
import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const OUT = join(import.meta.dirname, "out");
const TYPES: Record<string, string> = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".xml": "application/xml", ".txt": "text/plain" };
const port = Number(process.argv[2] ?? 8000);

createServer((req, res) => {
	const path = normalize(decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
	const candidates = [join(OUT, path), join(OUT, `${path.replace(/\/$/, "")}.html`), join(OUT, path, "index.html")];
	const file = candidates.find((f) => f.startsWith(OUT) && existsSync(f) && statSync(f).isFile());
	res.writeHead(file ? 200 : 404, { "content-type": TYPES[file ? extname(file) : ".html"] ?? "application/octet-stream" });
	res.end(readFileSync(file ?? join(OUT, "404.html")));
}).listen(port, () => console.log(`http://127.0.0.1:${port}/`));
