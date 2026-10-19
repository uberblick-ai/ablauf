import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { build } from "../site/build.ts";
import { kinds } from "../site/kinds.ts";

const scratch = (t: { after: (fn: () => void) => void }) => {
	const out = mkdtempSync(join(process.env.UB_AGENTS_SCRATCH ?? tmpdir(), "ablauf-site-"));
	t.after(() => rmSync(out, { recursive: true, force: true }));
	return out;
};

test("the site builds every page, with a page per kind and clean examples", (t) => {
	const out = scratch(t);
	const { pages, problems } = build({ out });
	assert.deepEqual(problems, []);
	assert.deepEqual(pages, ["/", "/404", "/fan-out", "/flow", "/guides/colours", "/guides/tiptap", "/motivation", "/uberblick"]);
	for (const kind of kinds) {
		const html = readFileSync(join(out, `${kind.id}.html`), "utf8");
		assert.match(html, new RegExp(`<h1>${kind.name}</h1>`));
		for (const example of kind.examples) assert.match(html, new RegExp(`<section class="q ex-item" id="${example.name}">`));
		assert.match(readFileSync(join(out, "index.html"), "utf8"), new RegExp(`href="/${kind.id}"`));
	}
	assert.match(readFileSync(join(out, "index.html"), "utf8"), /<link rel="canonical" href="https:\/\/ablauf\.uberblick\.ai\/">/);
	const sitemap = readFileSync(join(out, "sitemap.xml"), "utf8");
	assert.match(sitemap, /<loc>https:\/\/ablauf\.uberblick\.ai\/guides\/colours<\/loc>/);
	assert.doesNotMatch(sitemap, /404/);
	assert.match(readFileSync(join(out, "robots.txt"), "utf8"), /Sitemap: https:\/\/ablauf\.uberblick\.ai\/sitemap\.xml/);
});

test("an example is a Displayed tab and a Source tab", (t) => {
	const out = scratch(t);
	build({ out });
	const html = readFileSync(join(out, "index.html"), "utf8");
	assert.match(html, /<button role="tab" id="t1-0" aria-selected="true" aria-controls="p1-0" type="button">Displayed<\/button><button role="tab" id="t1-1" aria-selected="false" aria-controls="p1-1" type="button">Source<\/button>/);
	assert.match(html, /<div class="panel" role="tabpanel" id="p1-1" aria-labelledby="t1-1" hidden><pre><code>flow v0\n/);
});

test("a styled example applies its CSS, shows it in a third tab and keeps ids apart", (t) => {
	const out = scratch(t);
	build({ out });
	const html = readFileSync(join(out, "guides", "colours.html"), "utf8");
	const css = readFileSync(join(import.meta.dirname, "..", "site", "styles", "paper.css"), "utf8").replace(/\n$/, "");
	assert.ok(html.includes(`<style>${css}</style>`));
	assert.match(html, /<div class="paper"><svg /);
	assert.match(html, /type="button">CSS<\/button>/);
	const ids = [...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
	assert.equal(new Set(ids).size, ids.length, "every id on the page is unique");
});

test("a kind whose example has another header fails the build", (t) => {
	const out = scratch(t);
	const { problems } = build({ out, kinds: [{ ...kinds[0], examples: [{ name: "approvals", title: "t", note: "n" }] }] });
	// The shell still links to the real kinds, so only the header problem is checked.
	const header = problems.filter((p) => p.startsWith("site/kinds.ts:"));
	assert.equal(header.length, 1);
	assert.match(header[0], /approvals\.flow starts with "fan-out v0", not the Flow header "flow v0"/);
});

test("SITE_URL and SITE_NOINDEX shape a preview host", (t) => {
	const out = scratch(t);
	build({ out, site: "https://preview.example/", noindex: true });
	const html = readFileSync(join(out, "flow.html"), "utf8");
	assert.match(html, /href="https:\/\/preview\.example\/flow"/);
	assert.match(html, /<meta name="robots" content="noindex">/);
});
