import assert from "node:assert/strict";
import { test } from "node:test";
import { render } from "../src/index.ts";

test("a second step rejects every later outcome individually in v0", () => {
	for (const style of ["branches", "ladder"]) {
		const { svg, diagnostics } = render(`fan-out v0\nstyle ${style}\nstep "First"\noutcome "Before" reason="Why" destination="Here"\nstep "Second"\noutcome "After"\n  outcome\nstep "Third"\noutcome "Last"`);
		assert.deepEqual(diagnostics.map(d => d.line), [5, 6, 7, 8, 9]);
		assert.deepEqual([...svg.matchAll(/<g data-line="(\d+)">/g)].map(m => Number(m[1])), [4]);
		for (const line of [5, 6, 7, 8, 9]) assert.match(svg, new RegExp(`>Line ${line}:`));
		assert.match(svg, /^<svg /);
		assert.doesNotMatch(svg, /NaN|Infinity/);
	}
});
