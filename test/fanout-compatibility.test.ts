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
		assert.equal(render(capture.source, options).svg, capture.svg, `${capture.name} ${JSON.stringify(capture.options)} ${capture.profile}`);
	}
});
