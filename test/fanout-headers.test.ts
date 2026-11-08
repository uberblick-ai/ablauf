import assert from "node:assert/strict";
import { test } from "node:test";
import { render } from "../src/index.ts";

test("newer fan-out headers warn at their own line and use v1 grammar and geometry", () => {
	for (const version of ["2", "9", "999999999999999999999999999999999999999"]) {
		const input = `# comment\n\nfan-out v${version}\nstep "A"\noutcome "B"\n  outcome "C"`;
		const result = render(input);
		assert.deepEqual(result.diagnostics, [{ line: 3, severity: "warning", message: `fan-out v${version} is newer than this renderer; drawing it as v1` }]);
		assert.equal(result.svg, render(input.replace(`v${version}`, "v1")).svg);
		assert.match(result.svg, /<rect x="468"/);
	}
});

test("valid version headers accept separating whitespace and malformed headers retain v0 recovery", () => {
	const valid = 'fan-out v1\nstep "A"\noutcome "B"';
	for (const header of ["fan-out   v1", "fan-out\tv1", "  fan-out v1  "]) {
		const result = render(valid.replace("fan-out v1", header));
		assert.deepEqual(result.diagnostics, []);
		assert.equal(result.svg, render(valid).svg);
	}
	for (const header of ["fan-out", "fan-out v", "fan-out x", "fan-out v-1", "fan-out v1 extra"]) {
		const result = render(`${header}\nstep "A"\noutcome "B" reason="Why" destination="Here"`);
		assert.deepEqual(result.diagnostics.map(d => [d.line, d.severity]), [[1, "error"]]);
		assert.match(result.diagnostics[0].message, /assuming v0/);
		assert.match(result.svg, />Line 1:/);
		assert.match(result.svg, /<rect x="216"/);
	}
});
