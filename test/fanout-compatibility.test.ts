import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { gunzipSync } from "node:zlib";
import { render, type RenderOptions } from "../src/index.ts";
import { compatibilityOptions } from "./fanout-v0-cases.ts";

interface Capture {
	name: string;
	source: string;
	profile: string;
	options: RenderOptions;
	exception?: "second-step" | "newer-header";
	svg: string;
}
const captures: Capture[] = JSON.parse(gunzipSync(readFileSync(new URL("golden/pre-fanout-v1.json.gz", import.meta.url))).toString());

// The second compatibility exception is limited to the captured v9 sources.
// Keep their historical palette/font CSS and root options, replacing only
// their now-v1 description and drawing with independently pinned SVG source.
// Both metric profiles fit these short labels without wrapping. Ladder now
// falls back to branches and adds its rejected style line below the figure.
function newerHeaderExpected(capture: Capture): string {
	const ladder = capture.name.startsWith("ladder-");
	const height = ladder ? 162 : 112;
	const prefix = capture.options.idPrefix ? "fixture.0020.003c.0026.003e" : "ab";
	const description = "Fan-out: Check. Check leads to Yes (Why; Here).";
	let head = capture.svg.slice(0, capture.svg.indexOf("</style>") + 8)
		.replace(/viewBox="[^"]*" width="678" height="[^"]*"/, `viewBox="0 0 678 ${height}" width="678" height="${height}"`);
	if (capture.options.title === undefined) head = head.replace(/aria-label="[^"]*"/, `aria-label="${description}"`);
	else head = head.replace('">\n<style>', `" aria-describedby="${prefix}-desc">\n<desc id="${prefix}-desc">${description}</desc>\n<style>`);
	const drawing = [
		`<defs><marker id="${prefix}-ink" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse" markerUnits="userSpaceOnUse"><path d="M0,0 L10,5 L0,10 z" class="t-ink"/></marker></defs>`,
		`<g data-line="4"><path d="M206,56 C216,56 216,56 226,56 L240,56" class="e e-ink" marker-end="url(#${prefix}-ink)"/></g>`,
		'<g data-line="3">',
		'<rect x="16" y="39" width="190" height="34" rx="8" class="k-agent"/>',
		'<text x="28" y="61" class="m s13 b t-agent">Check</text>',
		'</g>',
		'<g data-line="4">',
		'<rect x="242" y="16" width="190" height="80" rx="8" class="pill"/>',
		'<text x="254" y="38" class="m s12 b">Yes</text>',
		'<text x="254" y="56" class="m s12 muted">Why</text>',
		'<line x1="254" y1="65" x2="420" y2="65" class="e e-ink" stroke-dasharray="2 4"/>',
		'<text x="254" y="84" class="m s12 b">→ Here</text>',
		'</g>',
		...(ladder ? ['<text x="32" y="116" class="m s12 t-stop">Line 2: style ladder</text>'] : []),
	].join("\n");
	return `${head}\n${drawing}\n</svg>\n`;
}

test("pre-v1 fan-out SVG bytes remain historical", () => {
	for (const capture of captures) {
		const options = { ...capture.options, ...compatibilityOptions(capture.profile) };
		// Only second-step sources intentionally change: outcomes after the
		// second step now use the historical rejected-source presentation.
		const recovery = capture.exception === "second-step" ? captures.find(c =>
			c.name === `${capture.name}Recovery` && c.profile === capture.profile &&
			JSON.stringify(c.options) === JSON.stringify(capture.options)) : undefined;
		const expected = recovery ? recovery.svg.replaceAll("reject!", "outcome")
			: capture.exception === "newer-header" ? newerHeaderExpected(capture) : capture.svg;
		assert.equal(render(capture.source, options).svg, expected, `${capture.name} ${JSON.stringify(capture.options)} ${capture.profile}`);
	}
});
