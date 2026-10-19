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

test("the site builds every page with clean examples and a section per kind", (t) => {
	const out = scratch(t);
	const { pages, problems } = build({ out });
	assert.deepEqual(problems, []);
	assert.deepEqual(pages, ["/", "/404", "/showcase"]);
	const showcase = readFileSync(join(out, "showcase", "index.html"), "utf8");
	for (const kind of kinds) {
		assert.match(showcase, new RegExp(`<section class="blk kind" id="${kind.id}">`));
		for (const example of kind.examples) assert.match(showcase, new RegExp(`id="${kind.id}-${example.name}"`));
	}
	assert.match(readFileSync(join(out, "index.html"), "utf8"), /<link rel="canonical" href="https:\/\/ablauf\.uberblick\.ai\/">/);
	const sitemap = readFileSync(join(out, "sitemap.xml"), "utf8");
	assert.match(sitemap, /<loc>https:\/\/ablauf\.uberblick\.ai\/showcase<\/loc>/);
	assert.doesNotMatch(sitemap, /404/);
	assert.match(readFileSync(join(out, "robots.txt"), "utf8"), /Sitemap: https:\/\/ablauf\.uberblick\.ai\/sitemap\.xml/);
});

test("an edit marks only the lines it changed or added", (t) => {
	const out = scratch(t);
	build({ out });
	const showcase = readFileSync(join(out, "showcase", "index.html"), "utf8");
	const item = showcase.slice(showcase.indexOf('id="flow-loop-insert"'));
	const marked = [...item.slice(0, item.indexOf("</article>")).matchAll(/<mark>(.*?)<\/mark>/g)].map((m) => m[1]);
	assert.ok(marked.includes("pill needs-security tone=agent"));
	assert.ok(marked.every((line) => !line.startsWith("#")));
	assert.ok(!marked.includes("columns rework main stop"));
});

test("a kind whose example has another header fails the build", (t) => {
	const out = scratch(t);
	const { problems } = build({ out, kinds: [{ ...kinds[0], examples: [{ name: "approvals", title: "t", note: "n" }] }] });
	assert.equal(problems.length, 1);
	assert.match(problems[0], /approvals\.flow starts with "fan-out v0", not the Flow header "flow v0"/);
});

test("SITE_URL and SITE_NOINDEX shape a preview host", (t) => {
	const out = scratch(t);
	build({ out, site: "https://preview.example/", noindex: true });
	const html = readFileSync(join(out, "showcase", "index.html"), "utf8");
	assert.match(html, /href="https:\/\/preview\.example\/showcase"/);
	assert.match(html, /<meta name="robots" content="noindex">/);
});
