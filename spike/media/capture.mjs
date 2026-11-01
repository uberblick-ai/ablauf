// Captures the README's PNG figures from the current build, in light
// and dark: `pnpm build && node spike/media/capture.mjs`. Needs Playwright with
// Chromium and IBM Plex Sans and Mono installed as system fonts. None
// of these enter the package or CI; the figures are committed.
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { extname, join, normalize } from "node:path";

const root = join(import.meta.dirname, "..", "..");
const out = join(root, "docs", "images");
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

// GitHub's own page colours, so each figure sits flush in its README.
const page = {
	light: { bg: "#ffffff", panel: "#f6f8fa", line: "#d1d9e0", ink: "#1f2328", muted: "#59636e" },
	dark: { bg: "#0d1117", panel: "#151b23", line: "#3d444d", ink: "#f0f6fc", muted: "#9198a1" },
};

const types = { ".html": "text/html", ".js": "text/javascript", ".flow": "text/plain" };
const server = createServer((req, res) => {
	const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^\/+/, "");
	if (path === "") {
		res.writeHead(200, { "content-type": "text/html" });
		res.end('<!doctype html><meta charset="utf-8"><body></body>');
		return;
	}
	try {
		const body = readFileSync(join(root, path));
		res.writeHead(200, { "content-type": types[extname(path)] ?? "application/octet-stream" });
		res.end(body);
	} catch {
		res.writeHead(404);
		res.end();
	}
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();

const css = (scheme) => {
	const c = page[scheme];
	return `
		html,body{margin:0;background:${c.bg};color:${c.ink};font-family:"IBM Plex Sans",sans-serif}
		#stage{display:inline-block;padding:28px 32px}
		.fig svg{display:block;height:auto}
		.row{display:flex;gap:28px;align-items:flex-start}
		.src{margin:0;padding:18px 20px;background:${c.panel};border:1px solid ${c.line};border-radius:10px;
			font:11.5px/1.55 "IBM Plex Mono",monospace;color:${c.ink};white-space:pre}
		.src .k{color:${c.muted}}
		.label{font:500 12px/1 "IBM Plex Mono",monospace;letter-spacing:.06em;text-transform:uppercase;color:${c.muted};margin:0 0 12px}
		.col{display:flex;flex-direction:column}
		.gap{gap:40px}
		.stack{display:flex;flex-direction:column;gap:36px}
	`;
};

async function open(scheme, scale = 2) {
	const context = await browser.newContext({ deviceScaleFactor: scale, colorScheme: scheme, viewport: { width: 1800, height: 1200 } });
	const tab = await context.newPage();
	await tab.goto(origin);
	await tab.addStyleTag({ content: css(scheme) });
	return { context, tab };
}

const flowSource = (name) => readFileSync(join(root, "spike", "examples", `${name}.flow`), "utf8");

// Source beside its figure: what an author writes and what a reader sees.
async function sourceAndFigure(scheme, name, file, width, lines) {
	const { context, tab } = await open(scheme);
	const source = flowSource(name);
	const shown = lines ? source.split("\n").filter((_, i) => lines(i)).join("\n") : source;
	await tab.evaluate(
		async ({ source, shown, scheme, width, name }) => {
			const { render } = await import("/dist/index.js");
			const stage = document.createElement("div");
			stage.id = "stage";
			stage.innerHTML = '<div class="row"><div class="col"><p class="label"></p><pre class="src"></pre></div><div class="col"><p class="label">rendered</p><div class="fig"></div></div></div>';
			stage.querySelector(".src").textContent = shown.trimEnd();
			const file = stage.querySelector(".label");
			file.textContent = `${name}.flow`;
			file.style.textTransform = "none";
			const fig = stage.querySelector(".fig");
			fig.style.width = `${width}px`;
			fig.innerHTML = render(source, { idPrefix: "readme", scheme }).svg;
			fig.querySelector("svg").style.width = "100%";
			document.body.append(stage);
		},
		{ source, shown, scheme, width, name },
	);
	await tab.evaluate(() => document.fonts.ready);
	await tab.locator("#stage").screenshot({ path: join(out, file) });
	await context.close();
}

// The three kinds side by side.
async function kinds(scheme, file) {
	const { context, tab } = await open(scheme);
	const items = [
		["flow", "checkout", 480],
		["fan-out", "approvals", 560],
		["sequence", "claim-short", 560],
	].map(([kind, name, width]) => ({ kind, width, source: flowSource(name) }));
	await tab.evaluate(
		async ({ items, scheme }) => {
			const { render } = await import("/dist/index.js");
			const tile = (item, i) => {
				const col = document.createElement("div");
				col.className = "col";
				col.innerHTML = `<p class="label">${item.kind}</p><div class="fig" style="width:${item.width}px"></div>`;
				col.querySelector(".fig").innerHTML = render(item.source, { idPrefix: `k${i}`, scheme }).svg;
				col.querySelector("svg").style.width = "100%";
				return col;
			};
			const stage = document.createElement("div");
			stage.id = "stage";
			const row = document.createElement("div");
			row.className = "row gap";
			const stack = document.createElement("div");
			stack.className = "stack";
			stack.append(tile(items[1], 1), tile(items[2], 2));
			row.append(tile(items[0], 0), stack);
			stage.append(row);
			document.body.append(stage);
		},
		{ items, scheme },
	);
	await tab.evaluate(() => document.fonts.ready);
	await tab.locator("#stage").screenshot({ path: join(out, file) });
	await context.close();
}

for (const scheme of ["light", "dark"]) {
	await sourceAndFigure(scheme, "deploy", `source-${scheme}.png`, 560);
	await kinds(scheme, `kinds-${scheme}.png`);
	console.log(`${scheme}: done`);
}
await browser.close();
server.close();
