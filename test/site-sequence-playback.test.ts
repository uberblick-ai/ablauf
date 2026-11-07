import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { build } from "../site/build.ts";
import { render } from "../src/index.ts";
import { Doc, El } from "./test-dom.ts";

test("the Sequence tabs preserve the complete source and mount its resolved playback", async (t) => {
	const out = mkdtempSync(join(process.env.UB_AGENTS_SCRATCH ?? tmpdir(), "ablauf-sequence-site-"));
	t.after(() => rmSync(out, { recursive: true, force: true }));
	assert.deepEqual(build({ out }).problems, []);
	const html = readFileSync(join(out, "sequence.html"), "utf8");
	const source = readFileSync(new URL("../examples/claim-play.flow", import.meta.url), "utf8");
	const esc = (text: string) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
	assert.match(html, /id="t1-0" aria-selected="true" aria-controls="p1-0" type="button">Displayed<\/button>/);
	assert.match(html, /id="t1-1" aria-selected="false" aria-controls="p1-1" type="button">Source<\/button>/);
	assert.ok(html.includes(`<div class="panel" role="tabpanel" id="p1-1" aria-labelledby="t1-1" hidden><pre><code>${esc(source.trimEnd())}</code></pre>`));
	const { svg: rendered, timelines } = render(source, { idPrefix: "claim-play" });
	assert.deepEqual(timelines.map(timeline => [timeline.name, timeline.steps.length]), [["Claim the show", 13], ["Wrong code", 5]]);
	assert.ok(html.includes(`data-timelines="${esc(JSON.stringify(timelines))}"`));
	assert.match(html, /<script type="module" src="\/playback.js"><\/script>/);
	assert.doesNotMatch(readFileSync(join(out, "fan-out.html"), "utf8"), /data-timelines|src="\/playback.js"/);

	// Follow the emitted graph as the browser would: every local import must
	// resolve to JavaScript, with all TypeScript-only declarations removed.
	const visited = new Set<string>();
	function visit(file: string) {
		if (visited.has(file)) return;
		visited.add(file);
		const js = readFileSync(file, "utf8");
		assert.doesNotMatch(js, /\binterface\s+\w+\s*\{/);
		for (const [, specifier] of js.matchAll(/\bfrom\s+"([^"]+)"/g)) {
			assert.match(specifier, /^\.\/.*\.js$/);
			visit(resolve(dirname(file), specifier));
		}
	}
	visit(join(out, "playback.js"));
	assert.equal(visited.size, 4);

	// Execute the site's emitted entry with the real controls and player.
	// These DOM fakes check wiring and interaction; a maintainer reviews CSS
	// layout and the rendered figure in a real browser before merging.
	t.mock.timers.enable({ apis: ["setTimeout"] });
	const doc = new Doc();
	const svg = new El("svg", doc);
	const dimensions = rendered.match(/width="(\d+)" height="(\d+)"/);
	assert.ok(dimensions);
	svg.setAttribute("width", dimensions[1]);
	svg.setAttribute("height", dimensions[2]);
	const figure = Object.assign(new El("div", doc), {
		dataset: { timelines: JSON.stringify(timelines) },
		querySelector: (selector: string) => { assert.equal(selector, "svg"); return svg; },
	});
	figure.rect = { width: 1050, top: 0, bottom: Number(dimensions[2]) };
	figure.append(svg);
	const original = Object.getOwnPropertyDescriptor(globalThis, "document");
	Object.defineProperty(globalThis, "document", { configurable: true, value: {
		querySelectorAll: (selector: string) => { assert.equal(selector, ".ex-pic[data-timelines]"); return [figure]; },
	} });
	t.after(() => {
		if (original) Object.defineProperty(globalThis, "document", original);
		else Reflect.deleteProperty(globalThis, "document");
	});
	await import(pathToFileURL(join(out, "playback.js")).href);
	const find = (name: string) => figure.all().find(el => el.classList.contains(name)) as El;
	assert.ok(find("ab-playback").classList.contains("abp-side"));
	assert.equal(find("abp-toggle").textContent, "Play");
	doc.viewport.show(true);
	assert.equal(find("abp-toggle").textContent, "Play", "entering the viewport does not start playback");
	find("abp-toggle").click();
	assert.equal(find("abp-toggle").textContent, "Pause", "playback starts on the reader's Play");
	find("abp-toggle").click();
	assert.equal(find("abp-toggle").textContent, "Play");
	const scenarios = figure.all().filter(el => el.getAttribute("role") === "tab");
	assert.deepEqual(scenarios.map(el => el.textContent), ["Claim the show", "Wrong code"]);
	scenarios[1].click();
	assert.equal(scenarios[1].getAttribute("aria-selected"), "true");
	assert.ok(find("abp-list").hidden);
	figure.rect.width = 320;
	doc.resize.flush();
	doc.frames.flush();
	assert.ok(find("ab-playback").classList.contains("abp-below"));
	assert.equal(find("abp-caption").textContent, "Type a code that no longer works");
	find("abp-toggle").click();
});
