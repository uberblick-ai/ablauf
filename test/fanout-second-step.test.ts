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

test("a bare second step also starts rejection in both versions", () => {
	for (const version of ["v0", "v1"]) {
		const { svg, diagnostics } = render(`fan-out ${version}\nstep "First"\noutcome "Before" reason="Why" destination="Here"\nstep\noutcome "After"`);
		assert.ok(diagnostics.some(d => d.line === 4 && /exactly one step/.test(d.message)));
		assert.ok(diagnostics.some(d => d.line === 5 && /second step/.test(d.message)));
		assert.match(svg, />Line 4:/);
		assert.match(svg, />Line 5:/);
		assert.doesNotMatch(svg, /<g data-line="5">/);
	}
});

test("a bare first step still rejects the second step and every later outcome", () => {
	for (const header of ["fan-out v0\nstyle branches", "fan-out v0\nstyle ladder", "fan-out v1\nstyle branches"]) {
		const { svg, diagnostics } = render(`${header}\nstep\nstep "Second"\noutcome "Late" reason="Why" destination="Here"\n  outcome\nstep "Third"\noutcome "Last"`);
		assert.ok(diagnostics.some(d => d.line === 3 && /quoted/.test(d.message)));
		for (const line of [4, 7]) {
			assert.ok(diagnostics.some(d => d.line === line && /exactly one step/.test(d.message)));
		}
		for (const line of [5, 6, 8]) {
			assert.ok(diagnostics.some(d => d.line === line && /second step/.test(d.message)));
			assert.doesNotMatch(svg, new RegExp(`<g data-line="${line}">`));
		}
		for (const line of [3, 4, 5, 6, 7, 8]) assert.match(svg, new RegExp(`>Line ${line}:`));
		assert.match(svg, /^<svg /);
		assert.doesNotMatch(svg, /NaN|Infinity/);
	}
});
