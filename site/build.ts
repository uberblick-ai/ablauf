// Builds ablauf.uberblick.ai from site/pages into site/out:
//
//     node site/build.ts
//
// Every site/pages/<path>.html is one page: a <head> block (title,
// description) and then the page's main content. The build wraps it in the
// shell the uberblick.ai sites share (site/shell.ts) and writes it to
// site/out/<path>.html, which Pages serves at /<path> with no extension.
// pages/index.html is /, pages/404.html the not-found page. Each kind in
// site/kinds.ts gets a generated page at /<id> with its examples. site/static
// is copied as it is.
//
// Diagrams are rendered at build time from site/examples or spike/examples,
// so the site always shows the current renderer. Each example is a pair of
// tabs, Displayed and Source, like the block examples on uberblick.ai.
// Placeholders in a page:
//
//   <!-- example NAME -->        one example
//   <!-- example NAME STYLE -->  the same, drawn with site/styles/STYLE.css
//                                applied to a .STYLE wrapper, with a CSS tab
//   <!-- markdown NAME -->       one example with its source as a fenced
//                                Markdown block
//   <!-- kinds -->               the list of diagram kinds, linking to their pages
//
// Any diagnostic, a kind whose example has another header, an unknown
// placeholder or a link to a page that is not built fails the build.
//
// It also writes robots.txt and sitemap.xml, like the sibling sites.
//
// SITE_URL sets the origin canonical links and the sitemap name (default
// https://ablauf.uberblick.ai); SITE_NOINDEX, set to anything, keeps search
// engines off a preview host.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { render } from "../spike/flow/index.ts";
import { type Kind, kinds as defaultKinds } from "./kinds.ts";
import { shell } from "./shell.ts";

const ROOT = import.meta.dirname;
// Site-only examples first, then the renderer's own.
const EXAMPLES = [join(ROOT, "examples"), join(ROOT, "..", "spike", "examples")];

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
			const file = EXAMPLES.map((dir) => join(dir, `${name}.flow`)).find((f) => existsSync(f));
			if (!file) problems.push(`${name}.flow: not in site/examples or spike/examples`);
			sources.set(name, file ? readFileSync(file, "utf8") : "");
		}
		return sources.get(name) ?? "";
	};

	// Tab ids only need to be unique within a page.
	let tabsOnPage = 0;
	const tabs = (label: string, panels: [string, string][]) => {
		const n = ++tabsOnPage;
		const list = panels
			.map(([name], i) => `<button role="tab" id="t${n}-${i}" aria-selected="${i === 0}" aria-controls="p${n}-${i}" type="button">${name}</button>`)
			.join("");
		const bodies = panels
			.map(([, html], i) => `<div class="panel" role="tabpanel" id="p${n}-${i}" aria-labelledby="t${n}-${i}"${i ? " hidden" : ""}>${html}</div>`)
			.join("\n");
		return `<div class="tabs ex"><div class="tablist" role="tablist" aria-label="${esc(label)}">${list}<button class="copy" type="button">Copy</button></div>\n${bodies}\n</div>`;
	};

	// Displayed first, then the source; an edit marks the lines it changed or
	// added against the example it edits. A style adds its CSS as a third tab
	// and applies it to a wrapper around the picture.
	const example = (name: string, options: { editOf?: string; style?: string; fenced?: boolean } = {}) => {
		const { editOf, style, fenced } = options;
		const text = source(name);
		const { svg, diagnostics } = render(text, { idPrefix: style ? `${name}-${style}` : name });
		for (const d of diagnostics) problems.push(`${name}.flow:${d.line} ${d.severity}: ${d.message}`);
		const base = editOf ? new Set(source(editOf).split("\n")) : null;
		const lines = text.replace(/\n$/, "").split("\n").map((line) => {
			const shown = esc(line);
			return base && significant(line) && !base.has(line) ? `<mark>${shown}</mark>` : shown;
		});
		if (fenced) {
			lines.unshift("```ablauf");
			lines.push("```");
		}
		const panels: [string, string][] = [
			["Displayed", `<div class="ex-pic">${style ? `<div class="${style}">${svg}</div>` : svg}</div>`],
			[fenced ? "Markdown" : base ? "Source · changes marked" : "Source", `<pre><code>${lines.join("\n")}</code></pre>`],
		];
		if (style) {
			const file = join(ROOT, "styles", `${style}.css`);
			if (!existsSync(file)) problems.push(`site/styles/${style}.css: missing`);
			const css = existsSync(file) ? readFileSync(file, "utf8").replace(/\n$/, "") : "";
			panels.push(["CSS", `<pre><code>${esc(css)}</code></pre>`]);
			return `<style>${css}</style>\n${tabs(`${name} with ${style}.css`, panels)}`;
		}
		return tabs(`${name} example`, panels);
	};

	const kindList = () =>
		`<ul class="dir">${kinds.map((k) => `<li><a href="/${k.id}"><span class="n">${esc(k.header)}</span><span class="d">${esc(k.name)}<span>${esc(k.summary)}</span></span></a></li>`).join("")}</ul>`;

	const kindPage = (k: Kind) => {
		const items = k.examples.map((e) => {
			const header = source(e.name).split("\n").find(significant)?.trim();
			if (header !== k.header) problems.push(`site/kinds.ts: ${e.name}.flow starts with "${header}", not the ${k.name} header "${k.header}"`);
			return `<section class="q ex-item" id="${e.name}"><h2>${esc(e.title)}</h2><p>${e.note}</p>\n${example(e.name, { editOf: e.editOf })}</section>`;
		});
		return `<div class="hero sub">
  <p class="crumb"><a href="/">ablauf</a> / <a href="/#kinds">Kinds</a> / ${esc(k.name)}</p>
  <h1>${esc(k.name)}</h1>
  <p class="lede">${esc(k.summary)} Every source starts with <code>${esc(k.header)}</code>.${k.intro ? ` ${k.intro}` : ""}</p>
</div>
${items.join("\n")}`;
	};

	const expand = (body: string, page: string) =>
		body.replace(/<!-- (\w+)((?: [\w-]+)*) -->/g, (match, name: string, rest: string) => {
			const args = rest.trim() ? rest.trim().split(" ") : [];
			if (name === "example" && (args.length === 1 || args.length === 2)) return example(args[0], { style: args[1] });
			if (name === "markdown" && args.length === 1) return example(args[0], { fenced: true });
			if (name === "kinds" && !args.length) return kindList();
			problems.push(`${page}: unknown placeholder ${match}`);
			return "";
		});

	rmSync(out, { recursive: true, force: true });
	cpSync(join(ROOT, "static"), out, { recursive: true });
	const pagesDir = join(ROOT, "pages");
	const built = new Set<string>();
	const hrefs = new Map<string, string>();
	const files = readdirSync(pagesDir, { recursive: true, encoding: "utf8" }).filter((f) => f.endsWith(".html")).sort();
	const pages: { name: string; rel: string; head: string; body: () => string }[] = [];
	for (const file of files) {
		const name = `site/pages/${file}`;
		const m = readFileSync(join(pagesDir, file), "utf8").match(/^\s*<head>\n([\s\S]*?)<\/head>\n([\s\S]*)$/);
		if (!m?.[1].includes("<title>")) problems.push(`${name}: a page starts with a <head> block that has a <title>`);
		else pages.push({ name, rel: file.replace(/\.html$/, ""), head: m[1], body: () => expand(m[2].replace(/\n+$/, ""), name) });
	}
	for (const k of kinds) {
		const head = `<title>${esc(k.name)} · ablauf</title>\n<meta name="description" content="${esc(k.summary)}">\n`;
		if (pages.some((p) => p.rel === k.id)) problems.push(`site/kinds.ts: site/pages/${k.id}.html would replace the ${k.name} page`);
		pages.push({ name: `site/kinds.ts (${k.id})`, rel: k.id, head, body: () => kindPage(k) });
	}
	for (const { name, rel, head, body: content } of pages) {
		tabsOnPage = 0;
		const path = rel === "index" ? "/" : `/${rel.replace(/\/index$/, "")}`;
		// Pages serves /<path> from <path>.html and redirects /<path>.html there;
		// <path>/index.html would add a redirect to /<path>/ instead.
		const target = rel === "index" ? join(out, "index.html") : join(out, `${rel.replace(/\/index$/, "")}.html`);
		const body = content();
		const canonical = rel === "404" ? "" : `<link rel="canonical" href="${site}${path}">\n`;
		const html = shell({ head, canonical, noindex: options.noindex ?? false, path, body });
		mkdirSync(dirname(target), { recursive: true });
		writeFileSync(target, html);
		built.add(path);
		for (const [, href] of html.matchAll(/href="(\/[^"#]*)/g)) if (!hrefs.has(href)) hrefs.set(href, name);
	}
	for (const [href, page] of hrefs)
		if (!built.has(href) && !existsSync(join(out, href))) problems.push(`${page}: links to ${href}, which is not built`);
	const listed = [...built].filter((p) => p !== "/404").sort();
	writeFileSync(join(out, "robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${site}/sitemap.xml\n`);
	writeFileSync(
		join(out, "sitemap.xml"),
		`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${listed.map((p) => `  <url><loc>${site}${p}</loc></url>\n`).join("")}</urlset>\n`,
	);
	return { pages: [...built].sort(), problems };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const { pages, problems } = build({ site: process.env.SITE_URL, noindex: Boolean(process.env.SITE_NOINDEX) });
	for (const p of problems) console.error(p);
	console.log(`built ${pages.length} pages into ${relative(process.cwd(), join(ROOT, "out")) || "."}`);
	process.exitCode = problems.length ? 1 : 0;
}
