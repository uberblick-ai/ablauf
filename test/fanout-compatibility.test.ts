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

test("pre-v1 fan-out SVG bytes remain historical", () => {
	for (const capture of captures) {
		const options = { ...capture.options, ...compatibilityOptions(capture.profile) };
		// Only second-step sources intentionally change: outcomes after the
		// second step now use the historical rejected-source presentation.
		const recovery = capture.exception === "second-step" ? captures.find(c =>
			c.name === `${capture.name}Recovery` && c.profile === capture.profile &&
			JSON.stringify(c.options) === JSON.stringify(capture.options)) : undefined;
		const expected = recovery ? recovery.svg.replaceAll("reject!", "outcome") : capture.svg;
		assert.equal(render(capture.source, options).svg, expected, `${capture.name} ${JSON.stringify(capture.options)} ${capture.profile}`);
	}
});
