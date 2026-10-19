// Builds ablauf.uberblick.ai from site/pages into site/out:
//
//     node site/build.ts
//
// Every site/pages/<path>.html is one page: a <head> block (title,
// description) and then the page's main content. The build wraps it in the
// shell the uberblick.ai sites share (site/shell.ts) and writes it to
// site/out/<path>/index.html, so it is served at /<path> with no extension.
// pages/index.html is /, pages/404.html the not-found page. site/static is
// copied as it is.
//
// Diagrams are rendered from spike/examples at build time, so the site always
// shows the current renderer. Placeholders in a page:
//
//   <!-- example NAME -->  one example: its picture, then its source
//   <!-- kinds -->         the list of diagram kinds, linking to the showcase
//   <!-- showcase -->      a section per kind with its examples (site/kinds.ts)
//
// Any diagnostic, a kind whose example has another header, an unknown
// placeholder or a link to a page that is not built fails the build.
//
// SITE_URL sets the origin canonical links name (default
// https://ablauf.uberblick.ai); SITE_NOINDEX, set to anything, keeps search
// engines off a preview host.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { render } from "../spike/flow/index.ts";
import { type Kind, kinds as defaultKinds } from "./kinds.ts";
import { shell } from "./shell.ts";

const ROOT = import.meta.dirname;
const EXAMPLES = join(ROOT, "..", "spike", "examples");

export interface BuildOptions {
	out?: string;
	kinds?: readonly Kind[];
	site?: string;
	noindex?: boolean;
}

export interface BuildResult {
	pages: string[];
	problems: string[];
}

const ENTITIES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
const esc = (text: string) => text.replace(/[&<>"]/g, (c) => ENTITIES[c]);

const significant = (line: string) => line.trim() !== "" && !line.trimStart().startsWith("#");

export function build(options: BuildOptions = {}): BuildResult {
	const out = options.out ?? join(ROOT, "out");
	const kinds = options.kinds ?? defaultKinds;
	const site = (options.site ?? "https://ablauf.uberblick.ai").replace(/\/$/, "");
	const problems: string[] = [];
	const sources = new Map<string, string>();

	const source = (name: string) => {
		if (!sources.has(name)) {
			const file = join(EXAMPLES, `${name}.flow`);
			sources.set(name, existsSync(file) ? readFileSync(file, "utf8") : "");
			if (!existsSync(file)) problems.push(`spike/examples/${name}.flow: missing`);
		}
		return sources.get(name) ?? "";
	};

	// The picture first, at its own size, then the source; an edit marks the
	// lines it changed or added against the example it edits.
	const example = (name: string, editOf?: string) => {
		const text = source(name);
		const { svg, diagnostics } = render(text, { idPrefix: name });
		for (const d of diagnostics) problems.push(`spike/examples/${name}.flow:${d.line} ${d.severity}: ${d.message}`);
		const base = editOf ? new Set(source(editOf).split("\n")) : null;
		const lines = text.replace(/\n$/, "").split("\n").map((line) => {
			const shown = esc(line);
			return base && significant(line) && !base.has(line) ? `<mark>${shown}</mark>` : shown;
		});
		const caption = base ? `${name}.flow · marked lines differ from ${editOf}.flow` : `${name}.flow`;
		return `<figure class="ex">
<div class="ex-pic">${svg}</div>
<section class="block code"><div class="cap"><span>${esc(caption)}</span><button type="button" class="copy-src">Copy</button></div><pre><code>${lines.join("\n")}</code></pre></section>
</figure>`;
	};

	const kindList = () =>
		`<ul class="dir">${kinds.map((k) => `<li><a href="/showcase#${k.id}"><span class="n">${esc(k.header)}</span><span class="d">${esc(k.name)}<span>${esc(k.summary)}</span></span></a></li>`).join("")}</ul>`;

	const showcase = () =>
		kinds
			.map((k) => {
				const items = k.examples.map((e) => {
					const header = source(e.name).split("\n").find(significant)?.trim();
					if (header !== k.header) problems.push(`site/kinds.ts: ${e.name}.flow starts with "${header}", not the ${k.name} header "${k.header}"`);
					return `<article class="ex-item" id="${k.id}-${e.name}"><h3>${esc(e.title)}</h3><p>${e.note}</p>\n${example(e.name, e.editOf)}</article>`;
				});
				return `<section class="blk kind" id="${k.id}"><div class="blk-h"><h2>${esc(k.name)}</h2><code>${esc(k.header)}</code></div>
<p class="blk-intro">${esc(k.summary)}</p>
${items.join("\n")}
</section>`;
			})
			.join("\n");

	const expand = (body: string, page: string) =>
		body.replace(/<!-- (\w+)(?: ([\w-]+))? -->/g, (match, name: string, arg?: string) => {
			if (name === "example" && arg) return example(arg);
			if (name === "kinds" && !arg) return kindList();
			if (name === "showcase" && !arg) return showcase();
			problems.push(`${page}: unknown placeholder ${match}`);
			return "";
		});

	rmSync(out, { recursive: true, force: true });
	cpSync(join(ROOT, "static"), out, { recursive: true });
	const pagesDir = join(ROOT, "pages");
	const built = new Set<string>();
	const hrefs = new Map<string, string>();
	const files = readdirSync(pagesDir, { recursive: true, encoding: "utf8" }).filter((f) => f.endsWith(".html")).sort();
	for (const file of files) {
		const name = `site/pages/${file}`;
		const m = readFileSync(join(pagesDir, file), "utf8").match(/^\s*<head>\n([\s\S]*?)<\/head>\n([\s\S]*)$/);
		if (!m?.[1].includes("<title>")) {
			problems.push(`${name}: a page starts with a <head> block that has a <title>`);
			continue;
		}
		const rel = file.replace(/\.html$/, "");
		const path = rel === "index" ? "/" : `/${rel.replace(/\/index$/, "")}`;
		const target = rel === "404" ? join(out, "404.html") : join(out, rel === "index" ? "" : rel.replace(/\/index$/, ""), "index.html");
		const body = expand(m[2].replace(/\n+$/, ""), name);
		const canonical = rel === "404" ? "" : `<link rel="canonical" href="${site}${path}">\n`;
		const html = shell({ head: m[1], canonical, noindex: options.noindex ?? false, path, body });
		mkdirSync(dirname(target), { recursive: true });
		writeFileSync(target, html);
		built.add(path);
		for (const [, href] of html.matchAll(/href="(\/[^"#]*)/g)) if (!hrefs.has(href)) hrefs.set(href, name);
	}
	for (const [href, page] of hrefs)
		if (!built.has(href) && !existsSync(join(out, href))) problems.push(`${page}: links to ${href}, which is not built`);
	return { pages: [...built].sort(), problems };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const { pages, problems } = build({ site: process.env.SITE_URL, noindex: Boolean(process.env.SITE_NOINDEX) });
	for (const p of problems) console.error(p);
	console.log(`built ${pages.length} pages into ${relative(process.cwd(), join(ROOT, "out")) || "."}`);
	process.exitCode = problems.length ? 1 : 0;
}
